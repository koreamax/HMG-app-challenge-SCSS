/**
 * 짐 종류. 크기는 3D 모형과 넘어짐 판정(높이 > 바닥의 짧은 변)에, 마찰계수는 "재질별 낮은 값"(임시값)에 쓴다.
 * 마찰계수는 EN 12195-1 부록 B의 조합 중 적재함 바닥(철판·합판)과 만나는 낮은 쪽 값을 골랐다.
 */
export type CargoKind = 'pallet' | 'appliance' | 'furniture' | 'material' | 'box'

export type CargoSpec = {
  label: string
  /** 마찰계수 (임시값) */
  mu: number
  /** 마찰계수 근거 (짧게) */
  muNote: string
  /** 길이(앞뒤) · 폭(좌우) · 높이 (m) */
  size: { l: number; w: number; h: number }
  /** 3D 모형 설명 */
  model: string
}

export const CARGO: Record<CargoKind, CargoSpec> = {
  pallet: { label: '팔레트', mu: 0.3, muNote: '목재 팔레트 · 철판 바닥', size: { l: 1.1, w: 1.1, h: 1.0 }, model: '팔레트 위 상자 묶음' },
  appliance: { label: '가전', mu: 0.3, muNote: '골판지 포장 · 낮은 값', size: { l: 0.75, w: 0.7, h: 1.8 }, model: '세운 냉장고' },
  furniture: { label: '가구', mu: 0.3, muNote: '목재 · 포장재', size: { l: 1.8, w: 0.9, h: 0.8 }, model: '눕힌 수납장' },
  material: { label: '자재', mu: 0.25, muNote: '철재·석재 · 낮은 값', size: { l: 1.2, w: 0.9, h: 0.6 }, model: '자재 묶음' },
  box: { label: '박스', mu: 0.3, muNote: '골판지 · 낮은 값', size: { l: 1.0, w: 0.8, h: 0.8 }, model: '쌓은 상자' },
}

export const PICKABLE: CargoKind[] = ['pallet', 'appliance', 'furniture', 'material', 'box']
export const WEIGHTS = [100, 300, 500, 700] as const

export const isTall = (k: CargoKind) => {
  const s = CARGO[k].size
  return s.h > Math.min(s.l, s.w)
}
