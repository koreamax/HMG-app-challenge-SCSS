/**
 * 내비게이션 판 (Pleos Connect, 가로 1920 x 720 ~ 1080). design/DESIGN_SPEC.md §4.1 ~ 4.5.
 *   주행 (out.mode = drive) : 4.2 색 하나 + 한 줄, 4.3 듣는 중
 *   정차                     : 4.1 3D 확인 · 4.4 다시 묶기 (app.screen = relash) · 4.5 기록 (내비 상태)
 *   시트                     : 상차 정보 (처음 · 운행 종료 뒤 저절로) · 설정
 * 뿌리에 .jj + data-theme(밤) + data-mode(주행 중 움직임 0) + data-layout(wide · mid · tall) + data-size(넓은 화면에서 높이 900 이상이면 1080 값).
 * 창 모양: wide 1920 폭 (가로로 넓은 차 화면) · mid 1600 폭 (Pleos Connect 앱 하나 1224 x 880) · tall 800 폭 (세로 창 611 x 880, 쌓는 배치).
 * 테마는 <html> 이 아니라 이 뿌리에 건다 (시연 무대는 낮 폰과 내비를 나란히 띄운다).
 */
import { useEffect, useRef } from 'react'
import { app } from '@/runtime/runtime'
import { useStore } from '@/runtime/store'
import { navLayoutOf, useFrameSize } from '@/ui/Fit'
import { usePresence } from '@/ui/parts'
import '@/ui/ui.css'
import './nav.css'
import { Drive } from './Drive'
import { Notice } from './Frame'
import { LoadSheet } from './LoadSheet'
import { EyeSheet, Park } from './Park'
import { Records } from './Records'
import { Relash } from './Relash'
import { SettingsSheet } from './SettingsSheet'
import { closeSheet, nav, useNav, useNavTheme } from './state'

export default function NavApp() {
  const { W, H } = useFrameSize()
  const layout = navLayoutOf(W)
  const drive = useStore(app, (s) => s.out?.mode === 'drive')
  const screen = useStore(app, (s) => s.screen)
  const hasAlert = useStore(app, (s) => !!s.out?.alert)
  const theme = useNavTheme()
  const sheet = useNav((s) => s.sheet)
  const loadDismissed = useNav((s) => s.loadDismissed)
  const records = useNav((s) => s.records)

  // 주행이 되면 시트 · 기록 · 자세히를 닫는다 (주행 화면은 색 하나 + 한 줄뿐)
  useEffect(() => {
    if (drive) nav.set({ sheet: null, records: false, detail: false })
  }, [drive])
  // 처음 · 운행 종료 뒤: 상차 시트를 다시 연다. 다시 묶기가 뜨면 기록 보기는 닫는다
  useEffect(() => {
    if (screen === 'load') nav.set({ loadDismissed: false })
    if (screen === 'relash') nav.set({ records: false, detail: false })
  }, [screen])

  const loadOpen = !drive && (sheet === 'load' || (screen === 'load' && !loadDismissed && !records))
  let body
  let key: 'drive' | 'records' | 'relash' | 'park'
  if (drive) (body = <Drive />), (key = 'drive')
  else if (records) (body = <Records />), (key = 'records')
  else if (screen === 'relash' && hasAlert) (body = <Relash />), (key = 'relash')
  else (body = <Park />), (key = 'park')
  // 화면 바뀜 (§8.2): 기록으로 들어가면 shared axis X (오른쪽에서), 돌아오면 왼쪽에서, 같은 층은 fade through. 주행 화면은 움직이지 않는다
  const prevKey = useRef(key)
  const enter = key === 'records' ? ' axis' : prevKey.current === 'records' ? ' back' : ''
  useEffect(() => {
    prevKey.current = key
  }, [key])
  const [loadOn, loadOut] = usePresence(loadOpen, 200)
  const [setOn, setOut] = usePresence(!drive && sheet === 'settings', 200)
  const [eyeOn, eyeOut] = usePresence(!drive && !records && key === 'park' && sheet === 'checks', 200)

  return (
    <div
      className="jj nav"
      data-theme={theme === 'night' ? 'night' : undefined}
      data-mode={drive ? 'drive' : undefined}
      data-layout={layout}
      data-size={layout === 'wide' && H >= 1000 ? 'lg' : undefined}
      data-short={H < 760 ? '' : undefined}
      data-sheet={loadOn || setOn || eyeOn ? '' : undefined}
      style={{ width: W, height: H }}
    >
      <div className={'nv-screen jj-screen' + enter} key={key}>
        {body}
      </div>
      {loadOn && (
        <div className={'nv-sheet-wrap' + (loadOut ? ' out' : '')}>
          <LoadSheet onClose={closeSheet} />
        </div>
      )}
      {setOn && (
        <div className={'nv-sheet-wrap' + (setOut ? ' out' : '')}>
          <SettingsSheet onClose={closeSheet} />
        </div>
      )}
      {eyeOn && (
        <div className={'nv-sheet-wrap' + (eyeOut ? ' out' : '')}>
          <EyeSheet onClose={closeSheet} />
        </div>
      )}
      {/* 알림은 한 화면에 하나, 아래 가운데 독 한 곳: 정차 · 다시 묶기는 3D 무대 아래 (Stage), 기록은 창 아래 가운데. 주행 중에는 없다.
          '다 됐어요' 덮개(Celebrate)는 내비에서 쓰지 않는다 (같은 말의 토스트가 독에 뜬다) */}
      {key === 'records' && (
        <div className="nv-dock nv-dock-root">
          <Notice />
        </div>
      )}
    </div>
  )
}
