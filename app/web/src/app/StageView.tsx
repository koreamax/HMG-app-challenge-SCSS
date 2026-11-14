/**
 * 시연 무대 (?app=stage, DESIGN_SPEC §10.5): 앱과 같은 거의 검정 바탕 위에 내비 (실제 Pleos 앱 창 1224 x 880 비율, 높이를 다 쓴다) 와
 * 오른 단 [폰 / 실사 디지털 트윈 칸] 을 세운다. 내비 · 폰 · 실사 칸은 둥근 화면 틀(선 · 밝은 테두리 · 기기 사진 없음, 면 차이만)에 담는다. 내비는 밤으로 시작한다.
 * 시연 패널은 오른쪽 접는 서랍 (기본 접힘, 손잡이 하나). ?panel=open 이면 펼친 채로 연다.
 * 이름표는 caption 한 줄 (--muted). 크기는 창 크기에서 셈한다 (Fit 이 안쪽을 설계 크기로 키운다).
 */
import { lazy, Suspense, useLayoutEffect, useRef, useState } from 'react'
import { app } from '@/runtime/runtime'
import { useStore } from '@/runtime/store'
import { Fit } from '@/ui/Fit'
import { setNavTheme } from '../nav/state'
import { DemoPanel } from './DemoPanel'
import { TwinTile } from './TwinTile'
import './demo.css'

const NavApp = lazy(() => import('../nav/NavApp'))
const PhoneApp = lazy(() => import('../phone/PhoneApp'))

// 내비 = Pleos Connect 실제 앱 창 1224 x 880 CSS px (설계 1600 x 1150, mid 배치). 1920 x 720 판은 3D 가 작아 무대에 쓰지 않는다
const NAV_REAL_W = 1224
const NAV_REAL_H = 880
const NAV_DESIGN_W = 1600
const NAV_DESIGN_H = 1150
const PHONE_W = 390
const PHONE_H = 844

const PAD = 28 // 무대 가장자리
const GAP = 32 // 내비 단과 오른 단 사이
const LABEL = 30 // 이름표 한 줄 + 아래 간격
const ROW_GAP = 24 // 폰과 실사 칸 사이
const HANDLE = 28 // 서랍 손잡이 자리
const DRAWER = 360 // 펼친 서랍 폭 (demo.css .stg-drawer 와 같게)
const SIDE_MIN = 340 // 오른 단 (폰 + 실사 칸) 최소 폭

/** [내비 1224 x 880 (높이를 다 쓴다)] [오른 단: 폰 / 실사 칸]. 1920 x 1080 이면 내비 약 1.13 배, 폰 약 0.83 배 */
function layout(w: number, h: number) {
  const innerH = Math.max(320, h - 2 * PAD)
  const innerW = Math.max(480, w - 2 * PAD - HANDLE)
  let navH = innerH - LABEL
  let navW = (navH * NAV_REAL_W) / NAV_REAL_H
  // 오른 단이 너무 좁아지면 내비를 줄인다
  if (innerW - GAP - navW < SIDE_MIN) {
    navW = Math.max(320, innerW - GAP - SIDE_MIN)
    navH = (navW * NAV_REAL_H) / NAV_REAL_W
  }
  const sideW = Math.max(200, innerW - GAP - navW)
  // 실사 칸: 오른 단 폭의 16:9 남짓, 무대 높이의 30 % 까지
  const twinH = Math.min(sideW * 0.56, innerH * 0.3)
  // 폰: 남는 높이 (이름표 둘 · 간격 빼고), 폭이 단을 넘지 않게
  let phoneH = innerH - LABEL - twinH - ROW_GAP - LABEL
  let phoneW = (phoneH * PHONE_W) / PHONE_H
  if (phoneW > sideW) {
    phoneW = sideW
    phoneH = (phoneW * PHONE_H) / PHONE_W
  }
  return { navW, navH, sideW, phoneW, phoneH, twinH }
}

export function StageView() {
  const demo = useStore(app, (s) => s.settings.demo)
  const host = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ w: typeof window !== 'undefined' ? window.innerWidth : 1800, h: typeof window !== 'undefined' ? window.innerHeight : 810 })
  const [open, setOpen] = useState(() => typeof location !== 'undefined' && new URLSearchParams(location.search).get('panel') === 'open')
  // 무대는 밤 내비로 시작한다 (주소에 ?theme= 이 있거나 시연 패널에서 고르면 그것을 따른다)
  useLayoutEffect(() => {
    if (!new URLSearchParams(location.search).get('theme') && !new URLSearchParams(location.search).has('night')) setNavTheme('night')
  }, [])
  useLayoutEffect(() => {
    const el = host.current
    if (!el) return
    const on = () => setBox({ w: el.clientWidth, h: el.clientHeight })
    on()
    const ro = new ResizeObserver(on)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  // 서랍을 펴면 화면을 덮지 않고 남은 폭에 다시 맞춘다
  const drawerOn = demo && open
  const L = layout(drawerOn ? box.w - DRAWER : box.w, box.h)
  return (
    <div ref={host} className="stg" data-panel={demo ? (open ? 'open' : 'closed') : undefined}>
      <div className="stg-row">
        <div className="stg-col" style={{ width: L.navW }}>
          <div className="stg-label">
            <b>차 화면</b>
            <span>Pleos Connect</span>
          </div>
          <div className="stg-screen nav" style={{ width: L.navW, height: L.navH }}>
            <Fit designW={NAV_DESIGN_W} minH={NAV_DESIGN_H} maxH={NAV_DESIGN_H}>
              <Suspense fallback={null}>
                <NavApp />
              </Suspense>
            </Fit>
          </div>
        </div>
        <div className="stg-col side" style={{ width: L.sideW }}>
          <div className="stg-label" style={{ width: L.phoneW }}>
            <b>휴대폰</b>
            <span>같은 운송장</span>
          </div>
          <div className="stg-screen phone" style={{ width: L.phoneW, height: L.phoneH }}>
            <Fit designW={PHONE_W} minH={PHONE_H} maxH={PHONE_H}>
              <Suspense fallback={null}>
                <PhoneApp />
              </Suspense>
            </Fit>
          </div>
          <div className="stg-twin" style={{ height: L.twinH + LABEL, marginTop: ROW_GAP }}>
            <TwinTile />
          </div>
        </div>
      </div>
      {demo && (
        <>
          <button type="button" className="stg-handle" aria-expanded={open} aria-controls="stg-drawer" aria-label={open ? '시연 패널 접기' : '시연 패널 펴기'} onClick={() => setOpen((o) => !o)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              {open ? <path d="M9 6l6 6-6 6" /> : <path d="M15 6l-6 6 6 6" />}
            </svg>
            <span>시연</span>
          </button>
          <aside id="stg-drawer" className="stg-drawer" aria-label="시연 패널" aria-hidden={!open}>
            <DemoPanel onClose={() => setOpen(false)} />
          </aside>
        </>
      )}
    </div>
  )
}
