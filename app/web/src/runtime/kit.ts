/**
 * 센서 키트 입력. 키트는 운행 중 벨트별 장력, 적재함 가속, 짐 이동 여부와 방향, 상태를 보낸다 (기획서: 1초마다, 시연은 10 Hz).
 *   isaac  : 앱에 넣은 Isaac Sim 기록을 키트 형식으로 재생 (디버그 빌드 · 시연)
 *   feed   : PC 스크립트(tools/kit_feed_server.py)나 실제 키트 서버가 SSE 로 보내는 값
 *   manual : 시연 패널에서 손으로 바꾸는 값
 * 3초 동안 새 값이 없으면 monitor 가 키트 없는 판정으로 돌아간다 (여기서는 마지막 값과 받은 시각만 들고 있다).
 *
 * 키트 형식 (SSE data 한 줄, JSON). 장력은 N, 가속은 g (ax 앞 +, ay 오른쪽 +), 짐 이동은 mm (x 오른쪽 +, y 뒤 +):
 *   { "v":1, "belts":{"c1":1250,"c2":0}, "ax":-0.73, "ay":0.01, "shift":{"x":0,"y":-106},
 *     "tag":{"shock":false,"lost":false}, "fault":false }
 */
import runsJson from '@/data/isaac-runs.json'
import type { KitIn, ShiftDir } from '@/engine/monitor'

type RunRow = number[]
export type IsaacRun = {
  key: string
  folder: string
  label: string
  preloadN: number
  massKg: number
  mu: number
  angleDeg: number
  belts: number
  cargo: string
  rubber: boolean
  rows: RunRow[]
}
export const ISAAC = runsJson as unknown as { source: string; runs: IsaacRun[] }
export const isaacRun = (key: string) => ISAAC.runs.find((r) => r.key === key) ?? null

export type KitMode = 'off' | 'isaac' | 'feed' | 'manual'
/** 키트 밖 값: 기록 재생일 때 차 신호(속도 · 조향 · 제동)와 3D 용 짐 자세 */
export type KitExtras = {
  speedKmh: number | null
  steerDeg?: number | null
  brake?: number | null
  gear?: 'P' | 'D' | null
  /** 짐 자리 (mm, 오른쪽 + / 뒤 +) · 들림 (mm) · 기울기 (도) */
  pose?: { x: number; y: number; lift: number; tilt: number } | null
  runKey: string | null
  tRun: number | null
  onBed: boolean
}

export type KitSnapshot = { frame: KitIn; extras: KitExtras }

const dirOf = (x: number, y: number): ShiftDir | null => {
  if (Math.hypot(x, y) < 1) return null
  if (Math.abs(y) >= Math.abs(x)) return y < 0 ? 'front' : 'rear'
  return x > 0 ? 'right' : 'left'
}

function lerpRow(rows: RunRow[], t: number): RunRow {
  if (t <= rows[0][0]) return rows[0]
  const last = rows[rows.length - 1]
  if (t >= last[0]) return last
  let lo = 0
  let hi = rows.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (rows[mid][0] <= t) lo = mid
    else hi = mid
  }
  const a = rows[lo]
  const b = rows[hi]
  const k = (t - a[0]) / Math.max(1e-6, b[0] - a[0])
  return a.map((v, i) => (i === 8 ? (k < 0.5 ? a[8] : b[8]) : v + (b[i] - v) * k))
}

export class KitFeed {
  mode: KitMode = 'off'
  private last: KitSnapshot | null = null
  private lastAt = -1e9
  // isaac
  private run: IsaacRun | null = null
  private runStart = 0
  private hold = false
  // 다시 조이기 · 기준점
  private override: { c1: number | null; c2: number | null } | null = null
  private shiftZero: { x: number; y: number } = { x: 0, y: 0 }
  private lastShiftXY = { x: 0, y: 0 }
  // feed
  private es: EventSource | null = null
  feedUrl = ''
  feedError: string | null = null
  // manual
  manual = { c1: 40, c2: 40, shiftMm: 0, shiftDir: 'front' as ShiftDir, shock: false, lost: false, fault: false }

  get run_() {
    return this.run
  }

  startIsaac(key: string, now: number) {
    this.stopFeed()
    this.run = isaacRun(key)
    this.mode = this.run ? 'isaac' : 'off'
    this.runStart = now
    this.hold = false
    this.override = null
    this.shiftZero = { x: 0, y: 0 }
  }

  /** 기록을 처음 상태(정차)로 붙들어 둔다 (주행 시작 전) */
  holdIsaacAtStart(key: string, now: number) {
    this.startIsaac(key, now)
    this.hold = true
  }

  /** 붙들어 둔 기록을 지금부터 재생 */
  releaseIsaac(now: number) {
    this.runStart = now
    this.hold = false
  }

  /** 기록 안의 시각 (s) */
  tRun(now: number) {
    if (!this.run) return null
    return this.hold ? this.run.rows[0][0] : now - this.runStart
  }

  isaacEnded(now: number) {
    const t = this.tRun(now)
    return !!this.run && t !== null && t >= this.run.rows[this.run.rows.length - 1][0]
  }

  startManual() {
    this.stopFeed()
    this.mode = 'manual'
    this.run = null
  }

  startFeed(url: string) {
    this.stopFeed()
    this.mode = 'feed'
    this.feedUrl = url
    this.feedError = null
    try {
      const es = new EventSource(url)
      this.es = es
      es.onmessage = (e) => this.onFeed(e.data)
      es.onerror = () => {
        this.feedError = '키트 서버에 연결하지 못했습니다'
      }
      es.onopen = () => {
        this.feedError = null
      }
    } catch {
      this.feedError = '주소가 올바르지 않습니다'
    }
  }

  stopFeed() {
    this.es?.close()
    this.es = null
  }

  off() {
    this.stopFeed()
    this.mode = 'off'
    this.run = null
    this.last = null
  }

  /** 시연: 정차 중 바를 다시 조인 것처럼 장력을 출발 때 값으로 */
  retighten(n?: number) {
    const v = n ?? this.run?.preloadN ?? this.manual.c1
    this.override = { c1: v, c2: v }
    if (this.mode === 'manual') {
      this.manual.c1 = v
      this.manual.c2 = v
    }
  }

  /** 출발할 때: 짐 위치 기준을 지금 자리로 (태그는 출발 뒤 움직임을 잰다) */
  zeroShift() {
    this.shiftZero = { ...this.lastShiftXY }
    if (this.mode === 'manual') this.manual.shiftMm = 0
  }

  private onFeed(data: string) {
    try {
      const o = JSON.parse(data) as {
        belts?: { c1?: number | null; c2?: number | null }
        ax?: number | null
        ay?: number | null
        shift?: { mm?: number; dir?: ShiftDir | null; x?: number; y?: number }
        tag?: { shock?: boolean; lost?: boolean }
        fault?: boolean
        kmh?: number | null
        gear?: 'P' | 'D' | null
      }
      const x = o.shift?.x ?? 0
      const y = o.shift?.y ?? (o.shift?.dir === 'rear' ? 1 : -1) * (o.shift?.mm ?? 0)
      this.lastShiftXY = { x, y }
      const frame: KitIn = {
        t: performance.now() / 1000,
        c1: o.belts?.c1 ?? null,
        c2: o.belts?.c2 ?? null,
        axG: o.ax ?? null,
        ayG: o.ay ?? null,
        shiftMm: Math.hypot(x - this.shiftZero.x, y - this.shiftZero.y),
        shiftDir: o.shift?.dir ?? dirOf(x - this.shiftZero.x, y - this.shiftZero.y),
        tagShock: !!o.tag?.shock,
        tagLost: !!o.tag?.lost,
        fault: !!o.fault,
      }
      this.last = { frame, extras: { speedKmh: o.kmh ?? null, gear: o.gear ?? null, pose: { x, y, lift: 0, tilt: 0 }, runKey: null, tRun: null, onBed: !o.tag?.lost } }
      this.lastAt = frame.t
    } catch {
      /* 형식이 틀린 줄은 버린다 */
    }
  }

  /** now 에서의 키트 값. 키트가 없거나 끊기면 마지막 값(받은 시각 그대로) 또는 null */
  snapshot(now: number): KitSnapshot | null {
    if (this.mode === 'off') return null
    if (this.mode === 'isaac' && this.run) {
      const t = this.tRun(now) ?? 0
      const r = lerpRow(this.run.rows, t)
      const x = r[6]
      const y = r[7]
      this.lastShiftXY = { x, y }
      const sx = x - this.shiftZero.x
      const sy = y - this.shiftZero.y
      const on = r[8] >= 0.5
      const c1 = this.override?.c1 ?? r[2]
      const c2 = this.override?.c2 ?? r[3]
      const frame: KitIn = {
        t: now, c1, c2, axG: r[4], ayG: r[5], shiftMm: Math.hypot(sx, sy), shiftDir: dirOf(sx, sy),
        tagShock: !on, tagLost: !on, fault: false,
      }
      this.last = {
        frame,
        extras: { speedKmh: r[1], steerDeg: r[9], brake: r[10], pose: { x: sx, y: sy, lift: r[11], tilt: r[12] }, runKey: this.run.key, tRun: t, onBed: on },
      }
      this.lastAt = now
      return this.last
    }
    if (this.mode === 'manual') {
      const m = this.manual
      const frame: KitIn = {
        t: now, c1: m.c1, c2: m.c2, axG: 0, ayG: 0, shiftMm: m.shiftMm, shiftDir: m.shiftMm > 0 ? m.shiftDir : null,
        tagShock: m.shock, tagLost: m.lost, fault: m.fault,
      }
      const y = m.shiftDir === 'rear' ? m.shiftMm : m.shiftDir === 'front' ? -m.shiftMm : 0
      const x = m.shiftDir === 'right' ? m.shiftMm : m.shiftDir === 'left' ? -m.shiftMm : 0
      this.last = { frame, extras: { speedKmh: null, pose: { x, y, lift: 0, tilt: 0 }, runKey: null, tRun: null, onBed: !m.lost } }
      this.lastAt = now
      return this.last
    }
    // feed: 마지막 값 (받은 시각 그대로 -> 3초 지나면 monitor 가 끊김으로 본다)
    if (this.last && this.override) {
      return { ...this.last, frame: { ...this.last.frame, c1: this.override.c1, c2: this.override.c2 } }
    }
    return this.last
  }

  ageS(now: number) {
    return this.last ? now - this.lastAt : null
  }
}
