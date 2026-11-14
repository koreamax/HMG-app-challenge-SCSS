/**
 * 고정 폭(designW) 화면을 부모 칸에 맞춰 통째로 키운다. 높이는 부모 칸 비율을 따르되 [minH, maxH] 로 자른다
 * (넘치거나 모자라면 가운데에 두고 위아래 · 좌우 여백). 안쪽은 useFrameSize() 로 설계 크기(W x H)를 읽는다.
 *   내비: designW 1920, H 720 ~ 1080 (Pleos Connect 가로 화면, AAOS 막대가 있으면 조금 줄어든다)
 *   폰  : designW 390, H 844
 */
import { createContext, useContext, useLayoutEffect, useRef, useState, type ReactNode } from 'react'

export type FrameSize = { W: number; H: number; scale: number }
const FrameCtx = createContext<FrameSize>({ W: 1920, H: 720, scale: 1 })
export const useFrameSize = () => useContext(FrameCtx)

export function Fit({ designW, minH, maxH, children, className }: { designW: number; minH: number; maxH: number; children: ReactNode; className?: string }) {
  const host = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ w: designW, h: minH })
  useLayoutEffect(() => {
    const el = host.current
    if (!el) return
    const on = () => setBox({ w: el.clientWidth, h: el.clientHeight })
    on()
    const ro = new ResizeObserver(on)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  let scale = box.w / designW
  let H = box.h / Math.max(1e-6, scale)
  if (H < minH) {
    H = minH
    scale = Math.min(box.w / designW, box.h / minH)
  } else if (H > maxH) H = maxH
  H = Math.round(H)
  const left = (box.w - designW * scale) / 2
  const top = (box.h - H * scale) / 2
  return (
    <div ref={host} className={'relative h-full w-full overflow-hidden ' + (className ?? '')}>
      <div style={{ position: 'absolute', width: designW, height: H, left, top, transform: `scale(${scale})`, transformOrigin: '0 0' }}>
        <FrameCtx.Provider value={{ W: designW, H, scale }}>{children}</FrameCtx.Provider>
      </div>
    </div>
  )
}

/** 키우지 않고 제 크기 그대로 (실제 휴대폰). 안쪽은 useFrameSize() 로 지금 칸 크기를 읽는다 */
export function NaturalFrame({ children }: { children: ReactNode }) {
  const host = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ w: typeof window !== 'undefined' ? window.innerWidth : 390, h: typeof window !== 'undefined' ? window.innerHeight : 844 })
  useLayoutEffect(() => {
    const el = host.current
    if (!el) return
    const on = () => setBox({ w: el.clientWidth, h: el.clientHeight })
    on()
    const ro = new ResizeObserver(on)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return (
    <div ref={host} className="relative h-full w-full overflow-hidden">
      <FrameCtx.Provider value={{ W: box.w, H: box.h, scale: 1 }}>{children}</FrameCtx.Provider>
    </div>
  )
}

/** 내비 설계 틀: 창 모양에 따라 설계 폭을 고른다 (글자 24 설계 px 가 18 CSS px 밑으로 줄지 않게) */
export type NavLayout = 'wide' | 'mid' | 'tall'
export const NAV_FRAMES = { wide: 1920, mid: 1600, tall: 800 } as const
export const navLayoutOf = (designW: number): NavLayout => (designW <= NAV_FRAMES.tall ? 'tall' : designW < NAV_FRAMES.wide ? 'mid' : 'wide')

/**
 * 내비 판 맞춤: 창을 띠 없이 꽉 채운다. 창 가로세로 비율로 설계 폭을 고른다.
 *   wide  비율 1.6 이상 (가로로 넓은 차 화면 1920 x 720 ~ 1200)  : 폭 1920
 *   mid   비율 1 ~ 1.6 (Pleos Connect 앱 하나, 1224 x 880 CSS px)   : 폭 1600 (0.765배 -> 글자 24 = 18.4 CSS px, 터치 80 = 61 CSS px)
 *   tall  비율 1 미만 (Pleos Connect 앱 둘 · 세로 창, 611 x 880 CSS px) : 폭 800 (0.764배), 쌓는 배치
 * 높이는 창 비율 그대로 (3D 무대 · 스크롤 영역이 받는다). 아주 납작한 창만 높이 600 밑으로 줄지 않게 옆을 비운다.
 */
export function NavFit({ children }: { children: ReactNode }) {
  const host = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ w: typeof window !== 'undefined' ? window.innerWidth : 1920, h: typeof window !== 'undefined' ? window.innerHeight : 720 })
  useLayoutEffect(() => {
    const el = host.current
    if (!el) return
    const on = () => setBox({ w: el.clientWidth, h: el.clientHeight })
    on()
    const ro = new ResizeObserver(on)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const aspect = box.w / Math.max(1, box.h)
  const designW = aspect < 1 ? NAV_FRAMES.tall : aspect < 1.6 ? NAV_FRAMES.mid : NAV_FRAMES.wide
  let scale = box.w / designW
  let H = box.h / Math.max(1e-6, scale)
  if (H < 600) {
    H = 600
    scale = Math.min(box.w / designW, box.h / 600)
  }
  H = Math.round(H)
  const left = (box.w - designW * scale) / 2
  const top = (box.h - H * scale) / 2
  return (
    <div ref={host} className="relative h-full w-full overflow-hidden">
      <div style={{ position: 'absolute', width: designW, height: H, left, top, transform: `scale(${scale})`, transformOrigin: '0 0' }}>
        <FrameCtx.Provider value={{ W: designW, H, scale }}>{children}</FrameCtx.Provider>
      </div>
    </div>
  )
}
