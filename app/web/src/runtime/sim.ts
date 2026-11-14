/**
 * 시연용 차량 (브라우저 · 디버그 빌드). 실제 차에서는 Android 껍데기가 CarPropertyManager 값을 보내고 이것은 쉰다.
 * 기획서 시연: 발표자는 브레이크와 조향을, 스크립트는 속도와 주행 규제 상태를 바꾼다.
 */
import type { CautionPoint, CautionType, Gear, Road, VehicleIn } from '@/engine/monitor'
import { DEMO_ROUTE } from '@/engine/places'

const G = 9.81
export const SIM = {
  accelG: 0.14,
  decelG: 0.15,
  hardG: 0.72,
  /** 쉼터에 서는 감속 */
  stopG: 0.2,
} as const

export type SimState = {
  gear: Gear
  speedKmh: number
  targetKmh: number
  hard: boolean
  /** 쉼터 도착처럼 조금 빨리 서기 */
  firm: boolean
  brakePressed: boolean
  steerDeg: number
  road: Road
  posKm: number
  caution: CautionPoint | null
  /** 기록 재생이 속도를 정할 때 */
  replayKmh: number | null
  /** 기록 재생의 브레이크 (0~1) */
  replayBrake: number | null
  /** 속도 신호 빈도 (Hz). 5 밑으로 내리면 회색을 시연 */
  speedHz: number
}

type Step = { label?: string; run?: (s: VehicleSim) => void; until?: (s: VehicleSim, now: number) => boolean; wait?: number }

export type ScenarioKey = 'kitless-brake' | 'kitless-turn' | 'caution' | 'kit-slide' | 'kit-hold' | 'kit-loose' | 'kit-rubber' | 'kit-lost' | 'arrive' | 'depart'

/** 대본 -> Isaac Sim 기록 (PV5 가상 트럭) */
export const KIT_RUN: Record<string, { run: string; label: string }> = {
  'kit-slide': { run: 'slide2', label: '키트 · 라쳇 2개 급제동 0.89 g' },
  'kit-hold': { run: 'hold4', label: '키트 · 라쳇 4개 급제동 0.88 g' },
  'kit-loose': { run: 'loose2', label: '키트 · 주행 중 바 풀림' },
  'kit-rubber': { run: 'rubber', label: '키트 · 고무바 제동 0.62 g' },
  'kit-lost': { run: 'lost', label: '키트 · 고무바 키 큰 짐 램프 회전' },
}

let cid = 0

export class VehicleSim {
  s: SimState = { gear: 'P', speedKmh: 0, targetKmh: 0, hard: false, firm: false, brakePressed: false, steerDeg: 0, road: 'highway', posKm: 3, caution: null, replayKmh: null, replayBrake: null, speedHz: 10 }
  private steps: Step[] = []
  private stepAt = 0
  private stepStarted = false
  scenario: ScenarioKey | null = null
  scenarioLabel = ''
  private lastEmit = -1
  private emitted: number | null = 0

  setGear(g: Gear) {
    if (g === 'P' && this.s.speedKmh > 1) return
    this.s.gear = g
    if (g === 'P') this.s.targetKmh = 0
  }
  setTarget(kmh: number, firm = false) {
    this.s.targetKmh = Math.max(0, kmh)
    this.s.hard = false
    this.s.firm = firm
  }
  hardBrake() {
    this.s.targetKmh = 0
    this.s.hard = true
  }
  setSteer(deg: number) {
    this.s.steerDeg = deg
  }
  setRoad(r: Road) {
    this.s.road = r
  }
  addCaution(type: CautionType, distM = 450) {
    this.s.caution = { id: 'c' + ++cid, type, distM }
  }

  play(key: ScenarioKey, steps: Step[], label: string) {
    this.scenario = key
    this.scenarioLabel = label
    this.steps = steps
    this.stepStarted = false
  }

  stopScenario() {
    this.steps = []
    this.scenario = null
    this.scenarioLabel = ''
    this.s.replayKmh = null
    this.s.replayBrake = null
  }

  get busy() {
    return this.steps.length > 0
  }

  step(dt: number, now: number) {
    // 대본
    while (this.steps.length) {
      const st = this.steps[0]
      if (!this.stepStarted) {
        this.stepStarted = true
        this.stepAt = now
        st.run?.(this)
      }
      const doneWait = st.wait === undefined || now - this.stepAt >= st.wait
      const doneUntil = !st.until || st.until(this, now)
      if (doneWait && doneUntil) {
        this.steps.shift()
        this.stepStarted = false
        continue
      }
      break
    }
    if (!this.steps.length && this.scenario) {
      this.scenario = null
      this.scenarioLabel = ''
    }

    const s = this.s
    if (s.replayKmh !== null) {
      // 기록 재생: 기록의 브레이크 값 (없으면 속도가 줄어드는 동안 밟은 것으로)
      const dv = (s.speedKmh - s.replayKmh) / 3.6 / Math.max(1e-3, dt)
      s.brakePressed = s.replayBrake !== null ? s.replayBrake > 0.05 : dv > 0.5
      s.speedKmh = s.replayKmh
    } else {
      const v = s.speedKmh / 3.6
      let a = 0
      if (s.gear === 'D' || s.gear === 'R') {
        if (s.speedKmh < s.targetKmh - 0.3) a = SIM.accelG * G * Math.min(1, (s.targetKmh - s.speedKmh) / 6 + 0.25)
        else if (s.speedKmh > s.targetKmh + 0.3 || (s.targetKmh === 0 && s.speedKmh > 0)) a = -(s.hard ? SIM.hardG : s.firm ? SIM.stopG : SIM.decelG) * G
      } else if (s.speedKmh > 0) a = -SIM.decelG * G
      const nv = Math.max(0, v + a * dt)
      s.speedKmh = s.targetKmh > 0 && a > 0 ? Math.min(s.targetKmh, nv * 3.6) : nv * 3.6
      if (s.speedKmh < 0.05) {
        s.speedKmh = 0
        s.hard = false
        s.firm = false
      }
      s.brakePressed = a < -0.3
    }
    s.posKm += (s.speedKmh / 3600) * dt
    if (s.caution) {
      s.caution = { ...s.caution, distM: s.caution.distM - (s.speedKmh / 3.6) * dt }
      if (s.caution.distM < -60) s.caution = null
    }
  }

  /** 속도 신호를 정해진 빈도로만 내보낸다 (드문 신호 시연) */
  snapshot(now: number): VehicleIn {
    const s = this.s
    // 10 Hz 면 매번 (runtime 이 10 Hz), 더 드물게 하면 그 간격으로만 새 값
    const period = 1 / Math.max(0.5, s.speedHz)
    let fresh = false
    if (s.speedHz >= 9.5 || this.lastEmit < 0 || now - this.lastEmit >= period - 0.02) {
      this.lastEmit = now
      this.emitted = Math.round(s.speedKmh * 100) / 100
      fresh = true
    }
    return {
      // 새로 나온 속도 값만 표본으로 (드문 신호면 표본도 드물다)
      speedSamples: fresh && this.emitted !== null ? [[now, this.emitted]] : [],
      speedKmh: this.emitted,
      steerDeg: s.steerDeg,
      brake: s.brakePressed || (s.gear !== 'P' && s.speedKmh === 0 && s.targetKmh === 0),
      gear: s.gear,
      uxRestricted: null,
      road: s.road,
      caution: s.caution && s.caution.distM > -60 ? { ...s.caution, distM: Math.round(s.caution.distM) } : null,
      place: s.road === 'highway' ? DEMO_ROUTE.name + ' ' + s.posKm.toFixed(1) + ' km' : '일반 도로 (시연)',
    }
  }
}

/** 대본 모음. kit 는 runtime 이 넘겨 준다 (기록 재생과 시각을 맞추려고) */
export type ScenarioDeps = {
  startIsaacHold: (key: string) => void
  releaseIsaac: () => void
  isaacEnded: () => boolean
  isaacSpeed: () => number | null
  /** 기록의 앞바퀴 각 (도) · 브레이크 (0~1) */
  isaacDrive: () => { steerDeg: number; brake: number } | null
  kitOff: () => void
}

export function scenario(key: ScenarioKey, d: ScenarioDeps): { label: string; steps: Step[] } {
  const stopped = (s: VehicleSim) => s.s.speedKmh === 0
  const reach = (v: number) => (s: VehicleSim) => s.s.speedKmh >= v - 0.5
  switch (key) {
    case 'depart':
      return { label: '출발', steps: [{ run: (s) => (s.setGear('D'), s.setTarget(60)) }] }
    case 'arrive':
      return {
        label: '쉼터 도착 · 정차',
        steps: [{ run: (s) => ((s.s.replayKmh = null), (s.s.replayBrake = null), s.setSteer(0), s.setTarget(0, true)) }, { until: stopped }, { wait: 1 }, { run: (s) => s.setGear('P') }],
      }
    case 'kitless-brake':
      return {
        label: '키트 없음 · 고속도로 급제동',
        steps: [
          { run: (s) => (d.kitOff(), s.setRoad('highway'), s.setGear('D'), s.setTarget(80)) },
          { until: reach(80) },
          { wait: 3 },
          { label: '급제동', run: (s) => s.hardBrake() },
          { until: stopped },
          { wait: 4 },
          { run: (s) => s.setTarget(50) },
        ],
      }
    case 'kitless-turn':
      return {
        label: '키트 없음 · 급한 회전',
        steps: [
          { run: (s) => (d.kitOff(), s.setRoad('local'), s.setGear('D'), s.setTarget(40)) },
          { until: reach(40) },
          { wait: 2 },
          { label: '회전', run: (s) => s.setSteer(7) },
          { wait: 3 },
          { run: (s) => s.setSteer(0) },
        ],
      }
    case 'caution':
      return {
        label: '방지턱 앞 안내',
        steps: [
          { run: (s) => (s.setGear('D'), s.setTarget(40)) },
          { until: reach(40) },
          { wait: 1.5 },
          { run: (s) => s.addCaution('bump', 420) },
        ],
      }
    case 'kit-slide':
    case 'kit-hold':
    case 'kit-loose':
    case 'kit-rubber':
    case 'kit-lost': {
      const { run, label } = KIT_RUN[key]
      return {
        label,
        steps: [
          { run: (s) => (d.startIsaacHold(run), s.setRoad('highway'), (s.s.replayKmh = 0)) },
          { wait: 0.6, run: (s) => s.setGear('D') },
          { run: () => d.releaseIsaac() },
          {
            label: 'Isaac Sim 기록 재생',
            run: (s) => (s.s.replayKmh = d.isaacSpeed() ?? 0),
            until: (s) => {
              s.s.replayKmh = d.isaacSpeed() ?? 0
              const dr = d.isaacDrive()
              s.s.replayBrake = dr ? dr.brake : null
              s.setSteer(dr ? Math.round(dr.steerDeg * 10) / 10 : 0)
              return d.isaacEnded()
            },
          },
          { run: (s) => ((s.s.replayKmh = null), (s.s.replayBrake = null), s.setSteer(0), (s.s.speedKmh = 0), s.setTarget(0)) },
          { wait: 5 },
          { run: (s) => s.setTarget(50) },
        ],
      }
    }
  }
}
