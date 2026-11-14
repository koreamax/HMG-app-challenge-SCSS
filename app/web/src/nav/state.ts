/**
 * 내비 판만의 화면 상태 (운송장 · 판정 · 흐름은 runtime 의 app 이 갖는다. 여기는 내비 화면에서만 쓰는 것).
 * app.screen 은 내비 · 폰이 같이 보므로 기록 보기 · 시트 · 3D 보기는 여기에 둔다.
 * 낮 · 밤: 껍데기(Android uiMode)가 준 값(native.night, onTheme)이 먼저. 브라우저에서는 시연 패널 · 주소(?theme=night)가 고르고,
 *   시연 패널에서 고르면 그것이 앞선다 (override).
 */
import { createStore, useStore } from '@/runtime/store'
import { app } from '@/runtime/runtime'
import { onNative } from '@/runtime/native'

export type NavTheme = 'day' | 'night'
export type NavView = '3d' | 'top' | 'kit'
/** checks = 눈으로 확인 시트 (1920 x 720 처럼 낮은 넓은 창에서 오른 단 카드 대신) */
export type NavSheet = 'load' | 'settings' | 'checks' | null

export type NavState = {
  theme: NavTheme
  /** 시연 패널 · 주소에서 고른 낮 · 밤이 껍데기 값보다 먼저 */
  override: boolean
  /** 껍데기가 onTheme 으로 알린 값 (처음 값은 native.night) */
  nativeNight: boolean | null
  sheet: NavSheet
  /** 처음 상차 시트를 닫았다 (app.screen 이 'load' 여도 다시 열지 않는다) */
  loadDismissed: boolean
  records: boolean
  view: NavView
  /** 버티는 제동 칸 자세히 */
  detail: boolean
  /** 다시 묶기 할 일 체크 ('사건 시각:번호' -> 체크) */
  steps: Record<string, boolean>
}

const qs = new URLSearchParams(typeof location !== 'undefined' ? location.search : '')
const qTheme: NavTheme | null = qs.get('theme') === 'night' || qs.has('night') ? 'night' : qs.get('theme') === 'day' ? 'day' : null

export const nav = createStore<NavState>({
  theme: qTheme ?? 'day',
  override: !!qTheme,
  nativeNight: null,
  sheet: null,
  loadDismissed: false,
  records: false,
  view: '3d',
  detail: false,
  steps: {},
})

// 껍데기가 낮 · 밤을 바꾸면 바로 (시연 패널의 고름은 풀린다)
onNative({ onTheme: (night: boolean) => nav.set({ nativeNight: !!night, override: false }) })
// 시험 · 화면 찍기용 손잡이 (브라우저 콘솔: __nav.setTheme('night'))
if (typeof window !== 'undefined') (window as unknown as { __nav?: unknown }).__nav = { nav, setTheme: (t: NavTheme) => nav.set({ theme: t, override: true }) }

export const useNav = <S,>(pick: (s: NavState) => S) => useStore(nav, pick)

export function themeOf(s: Pick<NavState, 'override' | 'theme' | 'nativeNight'>, nativeNight: boolean | undefined): NavTheme {
  if (s.override) return s.theme
  const n = s.nativeNight ?? nativeNight
  if (typeof n === 'boolean') return n ? 'night' : 'day'
  return s.theme
}

export function useNavTheme(): NavTheme {
  const override = useNav((s) => s.override)
  const theme = useNav((s) => s.theme)
  const nativeNight = useNav((s) => s.nativeNight)
  const fromShell = useStore(app, (s) => s.native?.night)
  return themeOf({ override, theme, nativeNight }, fromShell)
}

/** 시연 패널: 내비 낮 · 밤 */
export const setNavTheme = (theme: NavTheme) => nav.set({ theme, override: true })
export const navThemeNow = () => themeOf(nav.get(), app.get().native?.night)

export const openSheet = (sheet: NavSheet) => nav.set({ sheet, detail: false })
export const closeSheet = () => nav.set({ sheet: null, loadDismissed: true })
export const openRecords = (on: boolean) => nav.set({ records: on, sheet: null, detail: false })
export const setView = (view: NavView) => nav.set({ view, detail: false })
export const toggleDetail = () => nav.set((s) => ({ detail: !s.detail }))
export const toggleStep = (k: string) => nav.set((s) => ({ steps: { ...s.steps, [k]: !s.steps[k] } }))
