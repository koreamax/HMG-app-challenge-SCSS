/**
 * app 저장소는 10 Hz 로 새 값을 낸다. 화면은 보이는 값이 바뀔 때만 다시 그린다:
 * 선택자는 글자 키(문자열)를 내고, 키가 바뀌면 그때의 값을 읽는다.
 */
import { useMemo } from 'react'
import type { LoadVerdict } from '@/engine/limit'
import type { ActiveAlert } from '@/engine/monitor'
import { app, type AppState, type KitView } from '@/runtime/runtime'
import { useStore } from '@/runtime/store'
import { kitKey } from '@/three/bed-input'
import { navLayoutOf, useFrameSize, type NavLayout } from '@/ui/Fit'

export function useKeyed<T>(pick: (s: AppState) => T, key: (v: T) => string): T {
  const k = useStore(app, (s) => key(pick(s)))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => pick(app.get()), [k])
}

export const verdictKey = (v: LoadVerdict | null | undefined) =>
  v
    ? [v.tone, v.kind, v.limit.toFixed(3), v.crit, v.action, v.alt ?? '', v.perBeltNeedN === null ? '-' : Math.round(v.perBeltNeedN / 10), v.extraBelts ?? '-', v.tensions.map((t) => Math.round(t.n / 10) + (t.measured ? 'm' : '')).join(','), v.eyeChecks.join(',')].join('|')
    : '-'

export const alertKey = (a: ActiveAlert | null | undefined) =>
  a ? [a.kind, a.at, a.peakG === null ? '-' : a.peakG.toFixed(2), a.limitG.toFixed(2), a.shiftMm ? Math.round(a.shiftMm / 5) : 0, a.shiftDir ?? '-', a.loose.c1 ? 1 : 0, a.loose.c2 ? 1 : 0, a.place ?? '-', a.measured ? 1 : 0, a.dir ?? '-'].join('|') : '-'

export const useVerdict = () => useKeyed((s) => s.out?.verdict ?? null, verdictKey)
export const useAlert = () => useKeyed((s) => s.out?.alert ?? null, alertKey)
export const useKit = () => useKeyed((s): KitView => s.kit, kitKey)

/** 키트 표시 글 (상태 색 없이). 화면에서는 Frame 의 KitMark 가 센서 키트 아이콘을 앞에 붙인다 */
export type KitState = 'on' | 'stale' | 'off'
export const useKitState = () => useStore(app, (s): KitState => (s.kit.mode === 'off' ? 'off' : s.kit.fresh ? 'on' : 'stale'))
export const kitText = (k: KitState) => (k === 'on' ? '키트' : k === 'stale' ? '키트 끊김' : '차량 신호로 판단')

/** 창 모양에 따른 배치: wide (1920) · mid (1600, Pleos 앱 하나) · tall (800, 세로 창: 쌓는 배치) */
export const useNavLayout = (): NavLayout => navLayoutOf(useFrameSize().W)

/**
 * 정차 틀의 모양 (v5 Obsidian Studio):
 *   side : 막대 · 무대 · [칸 2 x 2 + 할 일 카드 + 버금 단추] (mid 1224 x 880 실제 창, 1920 x 900 이상)
 *   row  : 막대 · [무대 / 칸 4 한 줄] · [할 일 카드 + 버금 단추] (1920 x 720 처럼 낮은 넓은 창)
 *   tall : 쌓는 배치 (세로 창 612 x 880)
 * side 에서만 칸의 기준값을 막대 아래에 둔다 (이름 -> 값 -> 막대 -> 기준).
 */
export type ParkShape = 'side' | 'row' | 'tall'
export function useParkShape(): ParkShape {
  const { W, H } = useFrameSize()
  const layout = navLayoutOf(W)
  if (layout === 'tall') return 'tall'
  // 1920 x 900 대는 오른 단에 칸 2 x 2 + 할 일 카드 + 버금 단추가 다 들어가지 않는다: 넓은 창은 1000 부터 side
  if (layout === 'mid' || H >= 1000) return 'side'
  return 'row'
}
