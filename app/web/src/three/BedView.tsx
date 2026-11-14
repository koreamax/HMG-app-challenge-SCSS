/**
 * 적재함 3D 무대 (StageFrame, design/DESIGN_SPEC.md §3). 장면은 한 번만 만들고 값이 바뀌면 update 로 넘긴다.
 * 바탕은 검은 스튜디오 (§10.6: --stage-glow → --bg 방사 그라데이션, 경계 없음), 이름표는 왼쪽 위 --muted 글. 꼬리표 · 배지는 장면이 그린다 (bed.css).
 * 예전 속성(input · view · interactive · compact)은 그대로 쓰고, 새 속성(name · size)은 모두 선택이다.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { initBedScene, type BedHandle, type BedInput, type BedView as View } from './bed-scene'
import './bed.css'

export default function BedView({
  input,
  view = '3d',
  interactive = true,
  compact = false,
  name,
  size,
}: {
  input: BedInput
  view?: View
  interactive?: boolean
  compact?: boolean
  /** 이름표 (무대 왼쪽 위 한 줄). 없으면 안 그린다 */
  name?: string | null
  /** 꼬리표 · 배지 · 이름표 크기: lg = 내비 40 px, sm = 폰 32 px. 없으면 무대 폭으로 (700 px 이상이면 lg) */
  size?: 'lg' | 'sm'
}) {
  const root = useRef<HTMLDivElement>(null)
  const host = useRef<HTMLDivElement>(null)
  const tags = useRef<HTMLDivElement>(null)
  const nameEl = useRef<HTMLDivElement>(null)
  const handle = useRef<BedHandle | null>(null)
  const latest = useRef(input)
  latest.current = input
  const viewRef = useRef(view)
  viewRef.current = view
  const [error, setError] = useState<string | null>(null)
  const [auto, setAuto] = useState<'lg' | 'sm'>('lg')
  const sz = size ?? auto

  useLayoutEffect(() => {
    const el = root.current
    if (!el || size) return
    const on = () => setAuto(el.clientWidth >= 700 ? 'lg' : 'sm')
    on()
    const ro = new ResizeObserver(on)
    ro.observe(el)
    return () => ro.disconnect()
  }, [size])

  useEffect(() => {
    if (!host.current || !tags.current) return
    try {
      handle.current = initBedScene(host.current, tags.current, { interactive, compact })
      const el = nameEl.current
      handle.current.setReserveTop(el ? el.offsetTop + el.offsetHeight : 0)
      handle.current.setView(viewRef.current)
      handle.current.update(latest.current)
    } catch {
      setError('3D 화면을 그릴 수 없습니다')
    }
    return () => {
      handle.current?.dispose()
      handle.current = null
    }
  }, [interactive, compact])

  useEffect(() => {
    handle.current?.update(input)
  }, [input])
  useEffect(() => {
    handle.current?.setView(view)
  }, [view])
  // 이름표 아래로만 꼬리표를 둔다
  useLayoutEffect(() => {
    const el = nameEl.current
    handle.current?.setReserveTop(el ? el.offsetTop + el.offsetHeight : 0)
  }, [name, sz])

  return (
    <div ref={root} className="bv" data-size={sz}>
      <div ref={host} className="bv-host" role="img" aria-label="적재함 3D 디지털 트윈. 한 손가락으로 돌리고 두 손가락으로 확대합니다." />
      <div ref={tags} className="bv-layer" />
      {name && (
        <div ref={nameEl} className="bv-name">
          {name}
        </div>
      )}
      {error && <div className="bv-err">{error}</div>}
    </div>
  )
}
