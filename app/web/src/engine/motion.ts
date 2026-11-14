/**
 * 차량 신호로 제동·회전 세기를 추정한다 (키트가 없을 때).
 *   제동 = 속도 변화 (최근 0.6 s 기울기) / g x 1.25
 *   회전 = 속도^2 x tan(앞바퀴 각) / 축간거리 / g x 1.25
 * 속도 신호가 초당 5회보다 드물면 제동 판정은 하지 않는다 (null).
 */
import { G, KITLESS_FACTOR, MIN_SPEED_HZ, WHEELBASE_M } from './constants.ts'

type Sample = { t: number; v: number }

/** 트럭이 낼 수 없는 속도 변화 (m/s2, 약 1.5 g). 이보다 크면 신호 이상으로 보고 버린다 */
const IMPOSSIBLE_MS2 = 15

export class MotionEstimator {
  private s: Sample[] = []
  private lastT = -1
  /** 앞 값과 맞지 않아 보류한 표본 (서로 맞는 값이 3개 이어지면 새 기준으로 받아들인다) */
  private odd: Sample[] = []
  /** 버린 표본 수 (시험 · 표시용) */
  glitches = 0

  push(t: number, kmh: number | null) {
    if (kmh === null || !Number.isFinite(kmh)) return
    if (t <= this.lastT) return
    this.lastT = t
    const x = { t, v: kmh / 3.6 }
    const prev = this.s[this.s.length - 1]
    if (prev && Math.abs(x.v - prev.v) / Math.max(0.05, x.t - prev.t) > IMPOSSIBLE_MS2) {
      const o = this.odd[this.odd.length - 1]
      if (o && Math.abs(x.v - o.v) / Math.max(0.05, x.t - o.t) > IMPOSSIBLE_MS2) this.odd = []
      this.odd.push(x)
      this.glitches += 1
      if (this.odd.length >= 3) {
        // 정말로 값이 바뀐 것 (예: 신호가 다시 잡힘): 기록을 새로 시작한다 (튀는 기울기를 만들지 않게)
        this.s = this.odd
        this.odd = []
      }
      return
    }
    this.odd = []
    this.s.push(x)
    const cut = t - 3
    while (this.s.length && this.s[0].t < cut) this.s.shift()
  }

  reset() {
    this.s = []
    this.odd = []
    this.lastT = -1
  }

  /** 최근 2 s 동안의 신호 빈도 (Hz) */
  rateHz(now: number) {
    const recent = this.s.filter((x) => x.t >= now - 2)
    if (recent.length < 2) return 0
    const span = recent[recent.length - 1].t - recent[0].t
    return span > 0 ? (recent.length - 1) / span : 0
  }

  get speedMs() {
    return this.s.length ? this.s[this.s.length - 1].v : null
  }

  /** 최근 window s 동안 속도의 기울기 (m/s2, 최소제곱) */
  slope(window = 0.6): number | null {
    if (this.s.length < 3) return null
    const tEnd = this.s[this.s.length - 1].t
    const pts = this.s.filter((x) => x.t >= tEnd - window)
    if (pts.length < 3) return null
    const n = pts.length
    let st = 0
    let sv = 0
    for (const p of pts) {
      st += p.t
      sv += p.v
    }
    const mt = st / n
    const mv = sv / n
    let num = 0
    let den = 0
    for (const p of pts) {
      num += (p.t - mt) * (p.v - mv)
      den += (p.t - mt) ** 2
    }
    return den > 1e-9 ? num / den : null
  }

  /** 추정 감속 (g, 양수 = 서는 쪽) x 1.25. 신호가 드물면 null */
  decelG(now: number): number | null {
    if (this.rateHz(now) < MIN_SPEED_HZ) return null
    const a = this.slope()
    return a === null ? null : Math.max(0, -a / G) * KITLESS_FACTOR
  }

  /** 추정 가속 (g, 양수 = 출발 쪽, 짐이 뒤로 밀리는 쪽) x 1.25 */
  accelG(now: number): number | null {
    if (this.rateHz(now) < MIN_SPEED_HZ) return null
    const a = this.slope()
    return a === null ? null : Math.max(0, a / G) * KITLESS_FACTOR
  }

  /** 추정 회전 (g) x 1.25. 앞바퀴 각(도)이 없으면 null */
  latG(frontWheelDeg: number | null): number | null {
    const v = this.speedMs
    if (v === null || frontWheelDeg === null || !Number.isFinite(frontWheelDeg)) return null
    const d = Math.min(Math.abs(frontWheelDeg), 40) * (Math.PI / 180)
    return ((v * v * Math.tan(d)) / WHEELBASE_M / G) * KITLESS_FACTOR
  }
}
