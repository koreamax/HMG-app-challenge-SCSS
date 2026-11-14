/**
 * 짐이 버티는 한계 (낮춰 잡은 값) 와 상차 판정.
 *   한계 = 0.8 x mu x (1 + 2 x 장력합 x sin(각도) / 짐 무게)        (팀 계산식, g 단위)
 *   기준 = 앞 0.8 g. 앞벽에 빈틈없이 붙였고 짐이 앞벽보다 낮으면 앞쪽은 앞벽이 받으므로 옆·뒤 0.5 g만 본다.
 *   키 큰 짐(높이 > 바닥의 짧은 변)은 넘어짐을 따로 확인 ("넘어짐 확인", 주황).
 * 키트가 없으면 장력 = STF / 2 (고무바·로프 = 0), 각도 45도, 마찰은 재질별 낮은 값.
 * 키트가 있으면 앞 끝 벨트(c1) · 뒤 끝 벨트(c2) 의 장력을 잰 값으로 바꾸고, 센서가 없는 벨트는 기본값을 쓴다.
 */
import { BED, CRIT, DEFAULT_ANGLE_DEG, DEFAULT_STF_N, G, SLIDE_FACTOR } from './constants.ts'
import { CARGO, isTall, type CargoKind } from './cargo.ts'

export type BeltType = 'ratchet' | 'rubber'

export type LoadInput = {
  kind: CargoKind
  massKg: number
  belts: number
  beltType: BeltType
  frontWall: boolean
  /** 설정에서 바꾸는 값 (없으면 기본값) */
  stfN?: number
  angleDeg?: number
  mu?: number
}

export type KitTension = { c1: number | null; c2: number | null }

export type BeltTension = { idx: number; n: number; measured: boolean; sensor: 'c1' | 'c2' | null }

export type Tone = 'green' | 'orange' | 'red' | 'grey'

export type LoadVerdict = {
  tone: Tone
  kind: 'ok' | 'slide' | 'tip' | 'none'
  title: string
  /** 할 일 하나 */
  action: string
  /** 다른 방법 (없으면 null) */
  alt: string | null
  /** 낮춰 잡은 한계 (g) */
  limit: number
  /** 견주는 기준 (g) 과 이름 */
  crit: number
  critLabel: string
  wallCovers: boolean
  tall: boolean
  mu: number
  angleDeg: number
  sumT: number
  tensions: BeltTension[]
  /** 지금 벨트 수로 기준을 맞추려면 벨트당 필요한 장력 (N). 기준을 이미 넘으면 null */
  perBeltNeedN: number | null
  /** 기준을 맞추려면 더 걸어야 하는 벨트 수 (기본 장력으로). 맞추면 0, 벨트로 안 되면 null */
  extraBelts: number | null
  /** 눈으로 확인할 것 */
  eyeChecks: string[]
  /** 키트 값을 썼나 */
  measured: boolean
}

export const limitG = (mu: number, sumT: number, angleDeg: number, massKg: number) =>
  SLIDE_FACTOR * mu * (1 + (2 * sumT * Math.sin((angleDeg * Math.PI) / 180)) / (massKg * G))

export const defaultTension = (input: Pick<LoadInput, 'beltType' | 'stfN'>) =>
  input.beltType === 'rubber' ? 0 : (input.stfN ?? DEFAULT_STF_N) / 2

export const angleOf = (input: LoadInput) => input.angleDeg ?? DEFAULT_ANGLE_DEG
export const muOf = (input: LoadInput) => input.mu ?? CARGO[input.kind].mu

/** 벨트별 장력. 키트 센서는 앞 끝(0번) = c1, 뒤 끝(마지막) = c2 */
export function beltTensions(input: LoadInput, kit?: KitTension | null): BeltTension[] {
  const n = Math.max(0, Math.round(input.belts))
  const base = defaultTension(input)
  const out: BeltTension[] = []
  for (let i = 0; i < n; i++) {
    const sensor: 'c1' | 'c2' | null = i === 0 ? 'c1' : i === n - 1 ? 'c2' : null
    const v = sensor && kit ? kit[sensor] : null
    if (v !== null && v !== undefined && Number.isFinite(v)) out.push({ idx: i, n: Math.max(0, v), measured: true, sensor })
    else out.push({ idx: i, n: base, measured: false, sensor })
  }
  return out
}

/** 기준을 맞추는 데 필요한 장력 합 (N) */
export const sumTNeeded = (crit: number, mu: number, angleDeg: number, massKg: number) =>
  Math.max(0, ((crit / (SLIDE_FACTOR * mu) - 1) * massKg * G) / (2 * Math.sin((angleDeg * Math.PI) / 180)))

const NONE: LoadVerdict = {
  tone: 'grey', kind: 'none', title: '판정 불가', action: '상차 정보를 입력하세요', alt: null,
  limit: 0, crit: CRIT.fwd, critLabel: '급제동 0.80 g', wallCovers: false, tall: false, mu: 0, angleDeg: 0, sumT: 0,
  tensions: [], perBeltNeedN: null, extraBelts: null, eyeChecks: [], measured: false,
}

export function judgeLoad(input: LoadInput | null, kit?: KitTension | null): LoadVerdict {
  if (!input || !(input.massKg > 0) || input.belts < 0) return NONE
  const spec = CARGO[input.kind]
  const mu = muOf(input)
  const angleDeg = angleOf(input)
  const tall = isTall(input.kind)
  const lowEnough = spec.size.h <= BED.wallH
  const wallCovers = input.frontWall && lowEnough
  const crit: number = wallCovers ? CRIT.side : CRIT.fwd
  const critLabel = wallCovers ? '옆·뒤 0.50 g' : '급제동 0.80 g'
  const tensions = beltTensions(input, kit)
  const sumT = tensions.reduce((a, b) => a + b.n, 0)
  const limit = limitG(mu, sumT, angleDeg, input.massKg)
  const measured = tensions.some((t) => t.measured)
  const need = sumTNeeded(crit, mu, angleDeg, input.massKg)
  const perBeltNeedN = limit >= crit || tensions.length === 0 ? null : need / tensions.length
  const tDef = defaultTension(input)
  // 기본 장력 벨트를 더 걸어서 맞출 수 있나
  let extraBelts: number | null = 0
  if (limit < crit) extraBelts = tDef > 0 ? Math.max(1, Math.ceil((need - sumT) / tDef - 1e-9)) : null
  // 앞벽에 붙이면 맞추나 (지금 벨트 그대로)
  const wallFixes = !input.frontWall && lowEnough && limit >= CRIT.side
  const eyeChecks = ['고리 체결', '모서리 보호대']
  if (tall) eyeChecks.unshift('넘어짐')

  const base = { limit, crit, critLabel, wallCovers, tall, mu, angleDeg, sumT, tensions, perBeltNeedN, extraBelts, eyeChecks, measured }
  if (limit >= crit && !tall) return { ...base, tone: 'green', kind: 'ok', title: '계산상 기준 충족', action: '고리 체결은 눈으로 확인하세요', alt: null }
  if (limit >= crit && tall)
    return { ...base, tone: 'orange', kind: 'tip', title: '넘어짐 확인', action: '키 큰 짐은 넘어짐을 눈으로 확인하세요', alt: '미끄러짐은 기준을 넘습니다' }

  let action: string
  let alt: string | null = null
  if (input.beltType === 'rubber') {
    action = '라쳇 벨트로 묶으세요'
    alt = '고무바·로프는 장력을 계산에 넣지 않습니다'
  } else if (input.belts === 0) {
    action = '바를 거세요'
  } else if (extraBelts === 1) {
    action = '바 하나 더 거세요'
    if (wallFixes) alt = '또는 짐을 앞벽에 붙여 실으세요'
  } else if (wallFixes) {
    action = '짐을 앞벽에 붙여 실으세요'
    if (extraBelts !== null && extraBelts <= 4) alt = '또는 바 ' + extraBelts + '개 더 거세요'
  } else if (extraBelts !== null && extraBelts <= 4) {
    action = '바 ' + extraBelts + '개 더 거세요'
  } else {
    action = '짐을 나눠 싣거나 앞벽에 붙이세요'
  }
  if (measured && input.beltType !== 'rubber' && perBeltNeedN !== null && extraBelts !== 1 && !alt) {
    alt = '또는 바를 벨트당 약 ' + Math.ceil(perBeltNeedN / 10) + ' daN까지 조이세요'
  }
  if (tall) alt = alt ? alt + ' · 키 큰 짐은 넘어짐도 확인' : '키 큰 짐은 넘어짐도 확인'
  return { ...base, tone: 'orange', kind: 'slide', title: '밀릴 수 있음', action, alt }
}

export const fmtG = (g: number) => g.toFixed(2) + ' g'
