/**
 * 적재함 3D 무대 (StageFrame, design/DESIGN_SPEC.md §3 · §11.5). 장면은 한 번만 만들고 값이 바뀌면 update 로 넘긴다.
 * 바탕은 검은 스튜디오 (--stage-glow → --bg 방사 그라데이션, 경계 없음) + 옅은 바닥 격자 · 강조 색 발판 선. 정보 칩 · 배지는 장면이 그린다 (bed.css).
 * 무대 위 설명 글(이름표)은 그리지 않는다 (§11.6): 보기 단추를 눌러 바뀌는 것은 3D 와 칩뿐이다.
 * 예전 속성 name 은 받기만 한다 (그 안의 운송장 번호는 loadId 가 없을 때 대신 쓴다).
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { initBedScene, type BedHandle, type BedInput, type BedOptions, type BedView as View } from './bed-scene'
import './bed.css'

export default function BedView({
  input,
  view = '3d',
  interactive = true,
  compact = false,
  name,
  loadId: loadIdProp,
  size,
  maxTags,
  grid = true,
  fitKinds,
  onShown,
}: {
  input: BedInput
  view?: View
  interactive?: boolean
  compact?: boolean
  /** (예전) 이름표 글. 그리지 않는다 */
  name?: string | null
  /** 운송장 번호: 바뀌면 새 짐이 올라오는 모습을 다시 보인다 */
  loadId?: string | null
  /** 칩 · 배지 크기: lg = 내비, sm = 폰. 없으면 무대 폭으로 (700 px 이상이면 lg) */
  size?: 'lg' | 'sm'
  /** 한 화면의 칩 수 (없으면 lg 3 · sm 2) */
  maxTags?: number
  /** 바닥 격자 · 발판 선 */
  grid?: boolean
  /** 카메라 맞춤을 이 짐들의 자리 전체에 잠근다 (트윈만 찍기: 짐이 바뀌어도 적재함 크기가 같다). 바뀌지 않는 값을 넘긴다 */
  fitKinds?: BedOptions['fitKinds']
  /** 첫 그림이 나온 뒤 한 번 */
  onShown?: () => void
}) {
  const root = useRef<HTMLDivElement>(null)
  const host = useRef<HTMLDivElement>(null)
  const tags = useRef<HTMLDivElement>(null)
  const handle = useRef<BedHandle | null>(null)
  const latest = useRef(input)
  latest.current = input
  const viewRef = useRef(view)
  viewRef.current = view
  const shownRef = useRef(onShown)
  shownRef.current = onShown
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

  const loadId = loadIdProp !== undefined ? loadIdProp : (name?.match(/\b[A-Z]{2}-\d{4}-\d{3,5}\b/)?.[0] ?? null)
  const loadIdRef = useRef(loadId)
  loadIdRef.current = loadId

  useEffect(() => {
    if (!host.current || !tags.current) return
    try {
      handle.current = initBedScene(host.current, tags.current, { interactive, compact, maxTags, grid, fitKinds, onShown: () => shownRef.current?.() })
      handle.current.setReserveTop(0)
      handle.current.setView(viewRef.current)
      handle.current.setLoadId(loadIdRef.current)
      handle.current.update(latest.current)
    } catch {
      setError('3D 화면을 그릴 수 없습니다')
    }
    return () => {
      handle.current?.dispose()
      handle.current = null
    }
  }, [interactive, compact, maxTags, grid, fitKinds])

  useEffect(() => {
    handle.current?.update(input)
  }, [input])
  useEffect(() => {
    handle.current?.setLoadId(loadId)
  }, [loadId])
  useEffect(() => {
    handle.current?.setView(view)
  }, [view])

  return (
    <div ref={root} className="bv" data-size={sz}>
      <div ref={host} className="bv-host" role="img" aria-label="적재함 3D 디지털 트윈. 한 손가락으로 돌리고 두 손가락으로 확대합니다." />
      <div ref={tags} className="bv-layer" />
      {error && <div className="bv-err">{error}</div>}
    </div>
  )
}
