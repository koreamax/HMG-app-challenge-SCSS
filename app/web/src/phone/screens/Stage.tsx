/**
 * 3D 무대 (폰 폭 가득 390 x 268 · 짧은 무대 240, §10.5 폰 2): 카드 · 모서리 · 테두리 없이 바탕 위에 적재함.
 * 무대 안 왼쪽 위: 쓸모 있을 때만 caption 한 줄(foot · name), 오른쪽 아래: 보기 알약 48(top) 또는 작은 꼬리표(legend). 장면은 무대 가득 three/ 의 BedView 그대로 (sm)
 */
import { lazy, Suspense, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react'
import type { Tone } from '@/engine/limit'
import type { BedInput, MarkTone } from '@/three/bed-scene'

const BedView = lazy(() => import('@/three/BedView'))

/** 무대 설명 중 화면 이름과 같은 말('3D 디지털 트윈 · PV5 오픈베드')은 빼고 뜻 있는 부분만 아래 줄에 */
function capOf(name: string | null | undefined) {
  if (!name) return null
  const rest = name.replace(/^3D 디지털 트윈( · )?/, '').replace(/[■□] ?/g, '')
  return rest === '' || rest === 'PV5 오픈베드' ? null : rest
}

/**
 * 한 화면에 상태 색 하나 (§10.5): 판정 카드가 주황 · 빨강이면 3D 의 문제 벨트 · 꼬리표 · 화살도 같은 색으로.
 * (예: 빨강 '바가 느슨해졌습니다' 화면에 주황 '다시 확인' 바, 주황 '밀릴 수 있음' 화면에 빨강 화살이 남지 않게.) 초록 · 회색 판정은 건드리지 않는다
 */
export function oneTone(input: BedInput | null, tone: Tone | null | undefined): BedInput | null {
  if (!input || (tone !== 'orange' && tone !== 'red')) return input
  const m = (t: MarkTone): MarkTone => (t === 'orange' || t === 'red' ? tone : t)
  return {
    ...input,
    belts: input.belts.map((b) => ({ ...b, tone: m(b.tone) })),
    tags: input.tags ? input.tags.map((t) => ({ ...t, tone: m(t.tone) })) : input.tags,
    arrowTone: tone,
  }
}

/** 주 단추 줄 위 녹임 20 의 아래 16: 이 줄 위에서 끝나는 내용은 녹임의 투명한 윗부분에만 닿는다 (390 x 844 첫 화면 무대 268) */
const FOLD_PAD = 16
const MIN_H = 200
/** 무대가 자랄 수 있는 만큼 (기기 틀 없는 실제 폰은 화면이 길어 무대가 더 커진다: 적재함이 클수록 좋다) */
const GROW = 140

/** 스크롤 칸 안에서 el 의 위 (내용 기준 px) */
function topIn(el: HTMLElement, scroll: HTMLElement) {
  let y = 0
  let n: HTMLElement | null = el
  while (n && n !== scroll) {
    y += n.offsetTop
    n = n.offsetParent as HTMLElement | null
  }
  return n === scroll ? y : null
}

/**
 * 첫 화면 접힘 맞춤: 처음 열린 화면에서 아래 고정 판(주 단추)이 칸이나 머리 글을 반쯤 자르지 않게,
 * 무대 높이를 base - … base + 48 안에서 고른다. 무대 뒤 형제(칸 줄 · 설명 · 머리 · 목록)마다 '이것이 판 위에서 끝나는' 높이를 셈하고
 * 그중 가장 큰 것(무대가 가장 큰 것). 다음 것의 위 여백(머리 24 · 설명 10)은 판 위 녹임에 들어가 글이 반쯤 걸리지 않는다.
 * 맞는 높이가 없으면(좁은 창) 원래 높이 그대로. 토스트가 판에 붙어 판이 잠깐 자랄 때는 다시 재지 않는다 (무대가 출렁이지 않게)
 */
function useFoldFit(base: number, grow: number, keep?: string) {
  const ref = useRef<HTMLElement>(null)
  useLayoutEffect(() => {
    const sec = ref.current
    const wrap = sec?.parentElement
    const scroll = wrap?.closest('.ph-scroll') as HTMLElement | null
    if (!sec || !wrap || !scroll) return
    const fit = () => {
      if (scroll.parentElement?.querySelector('.ph-fixed .ph-toast')) return
      const cur = sec.offsetHeight
      const ch = scroll.clientHeight
      // 무대 뒤 덩어리들 (칸 묶음은 줄마다): [위, 아래, 글이 시작하는 위 (면 없는 머리 · 설명은 위 여백 뒤)]
      const items: { top: number; bottom: number; ink: number }[] = []
      for (let n = wrap.nextElementSibling as HTMLElement | null; n; n = n.nextElementSibling as HTMLElement | null) {
        const t = topIn(n, scroll)
        if (t === null || !n.offsetHeight) continue
        if (n.classList.contains('ph-tiles')) {
          const rows = new Map<number, number>()
          for (const c of Array.from(n.children) as HTMLElement[]) {
            const ct = topIn(c, scroll)
            if (ct !== null) rows.set(ct, Math.max(rows.get(ct) ?? 0, ct + c.offsetHeight))
          }
          for (const [rt, rb] of [...rows].sort((a, b) => a[0] - b[0])) items.push({ top: rt, bottom: rb, ink: rt })
          continue
        }
        const cs = getComputedStyle(n)
        const bare = cs.backgroundColor === 'rgba(0, 0, 0, 0)' || cs.backgroundColor === 'transparent'
        items.push({ top: t, bottom: t + n.offsetHeight, ink: t + (bare ? parseFloat(cs.paddingTop) || 0 : 0) })
      }
      // keep: 이 요소(예: 사건의 할 일 목록)는 첫 화면에서 끝까지 보여야 한다. 무대는 그 여유만큼만 자란다 (모자라면 줄어든다)
      const keepEl = keep ? (scroll.querySelector(keep) as HTMLElement | null) : null
      const kt = keepEl ? topIn(keepEl, scroll) : null
      const max = Math.min(base + grow, keepEl && kt !== null ? cur + (ch - FOLD_PAD - (kt + keepEl.offsetHeight)) : Infinity)
      let strict: number | null = null
      let loose: number | null = null
      for (let k = 0; k + 1 < items.length; k++) {
        const a = items[k]
        const b = items[k + 1]
        // 다음 덩어리의 글이 판 뒤로 (ch - 4 아래) 숨는 가장 작은 늘림
        const dLow = ch - 4 - b.ink
        // 이 덩어리가 녹임(28) 위에서 끝나는 가장 큰 늘림
        const dHigh = ch - FOLD_PAD - a.bottom
        if (dLow <= dHigh) {
          const h = Math.min(cur + dHigh, max)
          if (h >= cur + dLow && h >= MIN_H && strict === null) strict = Math.floor(h)
        } else if (a.bottom + dLow <= ch - 8) {
          const h = cur + dLow
          if (h >= MIN_H && h <= max && loose === null) loose = Math.floor(h)
        }
        if (cur + dHigh < MIN_H && cur + dLow < MIN_H) break
      }
      const next = strict ?? loose ?? Math.max(MIN_H, Math.min(base, max))
      if (Math.abs(next - cur) >= 1) sec.style.height = next + 'px'
    }
    fit()
    let live = true
    void document.fonts?.ready.then(() => live && fit())
    const ro = new ResizeObserver(() => fit())
    ro.observe(scroll)
    for (let n = wrap.nextElementSibling; n; n = n.nextElementSibling) ro.observe(n)
    return () => {
      live = false
      ro.disconnect()
    }
  }, [base, grow, keep])
  return ref
}

export function Stage({
  input,
  view = '3d',
  short = false,
  name,
  top,
  foot,
  legend,
  grow = GROW,
  keep,
  tone,
  children,
}: {
  input: BedInput | null
  /** 이 화면의 판정 색 (판정 카드). 주면 3D 문제 표시를 이 색 하나로 맞춘다 */
  tone?: Tone | null
  view?: '3d' | 'top'
  short?: boolean
  name?: string | null
  /** 무대 안 오른쪽 아래 (보기 알약) */
  top?: ReactNode
  /** 무대 안 왼쪽 위 caption (사건 시각 · 장소, 키트 끊김) */
  foot?: ReactNode
  /** 무대 안 오른쪽 아래 작은 꼬리표 (예: 흐린 상자 = 출발 때 자리) */
  legend?: ReactNode
  /** 첫 화면 맞춤에서 무대가 자랄 수 있는 만큼 (0 = 줄기만: 무대 아래 할 일 첫 줄이 보여야 하는 화면) */
  grow?: number
  /** 첫 화면에서 끝까지 보여야 하는 요소 (CSS 선택자). 무대는 이것이 접힘 위에 남는 만큼만 자란다 */
  keep?: string
  /** 3D 대신 그릴 것 (키트 보기 · 알림 글) */
  children?: ReactNode
}) {
  const cap = capOf(name)
  const ref = useFoldFit(short ? 240 : 268, grow, keep)
  const shown = useMemo(() => oneTone(input, tone), [input, tone])
  return (
    <div className="ph-stage-wrap">
      <section ref={ref} className={'ph-stage' + (short ? ' h240' : '')} data-view={view} aria-label={'3D 디지털 트윈' + (name ? ' · ' + name : '')}>
        {children ??
          (shown ? (
            <Suspense fallback={<div className="wait jj-skeleton">불러오는 중</div>}>
              <BedView input={shown} view={view} compact interactive name={null} size="sm" />
            </Suspense>
          ) : (
            <div className="msg">
              상차 정보가 없습니다<span>상차 정보를 넣으면 3D로 보입니다</span>
            </div>
          ))}
        {/* 무대 안 왼쪽 위 caption 한 줄 (내비 무대 왼쪽 위 'P 정차 · KR-…' 와 같은 자리) */}
        {(cap || foot) && (
          <p className="ph-stage-cap">
            {foot}
            {foot && cap && <span className="sep"> · </span>}
            {cap}
          </p>
        )}
        {/* 보기 알약: 무대 안 오른쪽 아래, 장면 위에 떠 있다 (§10.5 폰 2).
            .ph-stage-ctl 은 무대 높이의 30 % 인 투명 칸 (누름은 알약만): 장면 맞춤은 키 큰 칸을 무대 아래 띠로 보지 않아 적재함이 무대 높이를 다 쓰고,
            3D 꼬리표는 이 칸을 피해 알약 밑에 깔리지 않는다 */}
        {top && (
          <div className="ph-stage-ctl">
            <div className="in">{top}</div>
          </div>
        )}
        {legend && <div className="ph-stage-legend">{legend}</div>}
      </section>
    </div>
  )
}
