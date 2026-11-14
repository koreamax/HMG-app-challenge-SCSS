/** 화면 글자 형식 (숫자 · 시각 · 방향). 내비 · 폰이 같이 쓴다 */
import type { ShiftDir } from '@/engine/monitor'

export const fmtG = (g: number) => g.toFixed(2)
/** 장력 N, 천 단위 쉼표 (1,250) */
export const fmtN = (n: number) => Math.round(n).toLocaleString('ko-KR')
export const fmtKm = (km: number) => (km < 10 ? km.toFixed(1) : Math.round(km).toLocaleString('ko-KR'))
export const clock = (ms: number) => {
  const d = new Date(ms)
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0')
}
export const dayLabel = (ms: number) => {
  const d = new Date(ms)
  return d.getMonth() + 1 + '월 ' + d.getDate() + '일'
}

export const SHIFT_WORD: Record<ShiftDir, string> = { front: '앞으로', rear: '뒤로', left: '왼쪽으로', right: '오른쪽으로' }
export const DIR_WORD = { brake: '제동', turn: '회전', accel: '출발' } as const
export const BAR_NAME = { c1: '앞 바', c2: '뒤 바' } as const

/** 짐 이동 (mm) -> '앞으로 35 cm'. 5 mm 밑이면 null */
export function shiftWords(mm: number | null | undefined, dir: ShiftDir | null | undefined) {
  if (!mm || mm < 5) return null
  const cm = Math.max(1, Math.round(mm / 10))
  return (dir ? SHIFT_WORD[dir] + ' ' : '') + cm + ' cm'
}

/** 키트 자세 (mm, x 오른쪽 + · y 뒤 +) -> 방향 */
export function dirOf(x: number, y: number): ShiftDir | null {
  if (Math.hypot(x, y) < 1) return null
  if (Math.abs(y) >= Math.abs(x)) return y < 0 ? 'front' : 'rear'
  return x > 0 ? 'right' : 'left'
}

/** 시연 차량의 위치 글에서 '(시연 …)' 을 뺀다 */
export const placeText = (p: string | null | undefined) => (p ? p.replace(/\s*\(시연[^)]*\)/g, '').trim() : null)
