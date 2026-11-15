/**
 * 적재적소. 한 웹 앱이 세 가지로 뜬다 (주소의 ?app= 값):
 *   nav   : 내비게이션 판 (Pleos Connect 차 화면, Android nav 빌드가 연다)
 *   phone : 휴대폰 판 (Android phone 빌드가 연다)
 *   twin  : 트윈만 찍기 (§11.9, 기획서용 그림). 적재함 3D 하나만 창 가득, 단추 · 판 · 글 없음. 런타임을 시작하지 않는다
 *   stage : 시연 무대 (브라우저 기본값). 내비 + 폰을 나란히 띄우고 오른쪽에 발표자용 시연 패널.
 *           두 판이 같은 판정 엔진 · 운송장을 쓰므로 한쪽에서 바꾼 것이 다른 쪽에 바로 보인다.
 */
import { lazy, Suspense, useEffect } from 'react'
import { app, startRuntime } from '@/runtime/runtime'
import { Fit, NaturalFrame, NavFit } from '@/ui/Fit'
import { StageView } from './app/StageView'

const NavApp = lazy(() => import('./nav/NavApp'))
const PhoneApp = lazy(() => import('./phone/PhoneApp'))
const TwinOnly = lazy(() => import('./three/TwinOnly'))

const qs = new URLSearchParams(typeof location !== 'undefined' ? location.search : '')
export type AppKind = 'nav' | 'phone' | 'stage' | 'twin'
export const APP_KIND: AppKind = (() => {
  const v = qs.get('app')
  if (v === 'nav' || v === 'phone' || v === 'stage' || v === 'twin') return v
  return app.get().native ? 'nav' : 'stage'
})()

/** 내비 설계 크기 (시연 무대): 폭 1920, 높이 720. 실제 창은 NavFit 이 창 모양에 맞춰 1920 · 1600 · 800 폭으로 고른다 */
export const NAV_W = 1920
/** 폰 설계 크기 */
export const PHONE_W = 390
export const PHONE_H = 844

/** 시연 무대: app/StageView (Graphite 바탕 · 내비 64 % · 폰 같은 기준선 · 접는 시연 패널) */
const Stage = StageView

export default function App() {
  // 트윈만 찍기는 런타임 (판정 고리 · 음성 · 키트) 없이 그림만
  useEffect(() => (APP_KIND === 'twin' ? undefined : startRuntime()), [])
  if (APP_KIND === 'twin')
    return (
      <Suspense fallback={null}>
        <TwinOnly />
      </Suspense>
    )
  if (APP_KIND === 'nav')
    return (
      <NavFit>
        <Suspense fallback={null}>
          <NavApp />
        </Suspense>
      </NavFit>
    )
  if (APP_KIND === 'phone') {
    // 실제 휴대폰(좁은 창)은 제 폭 그대로, 넓은 창(브라우저)은 390 폭 화면을 키워 가운데에
    const narrow = typeof window !== 'undefined' && window.innerWidth < 600
    return narrow ? (
      <NaturalFrame>
        <Suspense fallback={null}>
          <PhoneApp />
        </Suspense>
      </NaturalFrame>
    ) : (
      <Fit designW={PHONE_W} minH={PHONE_H} maxH={PHONE_H}>
        <Suspense fallback={null}>
          <PhoneApp />
        </Suspense>
      </Fit>
    )
  }
  return <Stage />
}
