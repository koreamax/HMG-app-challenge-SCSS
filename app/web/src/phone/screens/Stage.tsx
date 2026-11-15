/**
 * 3D 무대 (폰 폭 가득 390 x 300 · 짧은 무대 250, §11.7. 첫 화면 접힘 맞춤이 270 ~ 348 안에서 고른다): 카드 · 모서리 · 테두리 없이 바탕 위에 적재함.
 * 무대 안에는 글이 없다 (§11.6: 왼쪽 위 caption · '출발 때 자리' 알약을 지웠다). 오른쪽 아래 보기 알약 48(top)뿐. 장면은 무대 가득 three/ 의 BedView 그대로 (sm).
 * 정보 칩 · 고른 짐 테두리는 화면이 입력에 얹는다 (phone/chips.ts)
 */
import { lazy, Suspense, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react'
import type { Tone } from '@/engine/limit'
import type { BedInput, MarkTone } from '@/three/bed-scene'

const BedView = lazy(() => import('@/three/BedView'))

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
/**
 * 무대가 자랄 수 있는 만큼. 2026-11-15: 140 -> 48. 크게 자라면 적재함 위에 검은 면만 늘고 (무대가 화면 위쪽에 쏠린다)
 * 무대 아래 첫 할 일 줄이 접힘 밑으로 밀린다. 남는 높이는 목록 줄이 쓴다 (아래 목록은 줄마다 접힘 자리로 본다)
 */
const GROW = 48
/** 바라는 범위에 접을 자리가 없으면 여기까지 자란다 (예전 값) · 이만큼까지는 줄어도 된다 */
const GROW_FAR = 140
const SHRINK = 30

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
 * 무대 높이를 base - 30 … base + 48 안에서 고른다. 무대 뒤 형제(지표 줄 · 설명 · 머리 · 목록의 줄)마다 '이것이 판 위에서 끝나는' 높이를 셈하고
 * 그중 가장 큰 것(무대가 가장 큰 것). 그 범위에 접을 자리가 없으면 위로 가장 가까운 자리 (base + 140 까지), 그래도 없으면 아래로.
 * 다음 것의 위 여백(머리 24 · 설명 10)은 판 위 녹임에 들어가 글이 반쯤 걸리지 않는다.
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
      const items: { top: number; bottom: number; ink: number; head?: boolean }[] = []
      for (let n = wrap.nextElementSibling as HTMLElement | null; n; n = n.nextElementSibling as HTMLElement | null) {
        const t = topIn(n, scroll)
        if (t === null || !n.offsetHeight) continue
        // 목록 판 (.ph-list) 은 줄마다: 첫 줄이 온전히 보이고 다음 줄의 글이 판 뒤에 숨는 자리에서도 접을 수 있다 (판 면은 이어져도 된다)
        if (n.classList.contains('ph-list') && n.children.length > 1) {
          for (const c of Array.from(n.children) as HTMLElement[]) {
            const ct = topIn(c, scroll)
            if (ct === null || !c.offsetHeight) continue
            const tx = c.querySelector('.tx') as HTMLElement | null
            const it = tx ? topIn(tx, scroll) : null
            items.push({ top: ct, bottom: ct + c.offsetHeight, ink: it ?? ct + 10 })
          }
          continue
        }
        const cs = getComputedStyle(n)
        const bare = cs.backgroundColor === 'rgba(0, 0, 0, 0)' || cs.backgroundColor === 'transparent'
        items.push({ top: t, bottom: t + n.offsetHeight, ink: t + (bare ? parseFloat(cs.paddingTop) || 0 : 0), head: n.classList.contains('ph-head') })
      }
      // keep: 이 요소(예: 사건의 할 일 목록)는 첫 화면에서 끝까지 보여야 한다. 무대는 그 여유만큼만 자란다 (모자라면 줄어든다)
      const keepEl = keep ? (scroll.querySelector(keep) as HTMLElement | null) : null
      const kt = keepEl ? topIn(keepEl, scroll) : null
      const keepMax = keepEl && kt !== null ? cur + (ch - FOLD_PAD - (kt + keepEl.offsetHeight)) : Infinity
      // 바라는 범위 [base - SHRINK, base + grow], 넘어설 수 있는 끝 base + GROW_FAR (긴 화면에서 바라는 범위에 접을 자리가 없을 때만)
      const soft = Math.min(base + grow, keepMax)
      const hard = Math.min(base + (grow > 0 ? GROW_FAR : 0), keepMax)
      const floor = Math.max(MIN_H, base - SHRINK)
      // 접을 수 있는 무대 높이 구간들 [lo, hi]: 앞 덩어리가 녹임 위에서 끝나고 (hi) 다음 덩어리의 글이 판 뒤에 숨는다 (lo)
      const spans: { lo: number; hi: number }[] = []
      for (let k = 0; k + 1 < items.length; k++) {
        const a = items[k]
        const b = items[k + 1]
        // 판 머리 바로 밑에서는 접지 않는다 (머리만 보이고 그 목록의 첫 줄이 숨는 자리): 머리는 첫 줄과 함께 보인다
        if (a.head) continue
        // 다음 덩어리의 글이 판 뒤로 (ch - 6 아래: 녹임이 이미 80 % 넘게 덮는 곳) 숨는 가장 작은 늘림
        const dLow = ch - 6 - b.ink
        // 이 덩어리가 녹임(28) 위에서 끝나는 가장 큰 늘림
        const dHigh = ch - FOLD_PAD - a.bottom
        if (dLow <= dHigh) spans.push({ lo: cur + dLow, hi: cur + dHigh })
        // 조금 모자라면 (녹임 안쪽 8 px 까지) 한 점으로
        else if (a.bottom + dLow <= ch - 8) spans.push({ lo: cur + dLow, hi: cur + dLow })
        if (cur + dHigh < MIN_H && cur + dLow < MIN_H) break
      }
      // 1) 바라는 범위 안에서 가장 큰 높이 2) 그 위로 가장 가까운 높이 (긴 화면: 줄을 하나 더 보이는 대신 무대를 줄이지 않는다) 3) 그 아래로 가장 큰 높이
      let pick: number | null = null
      for (const sp of spans) {
        const h = Math.min(sp.hi, soft)
        if (h >= sp.lo && h >= floor && (pick === null || h > pick)) pick = h
      }
      if (pick === null) {
        for (const sp of spans) if (sp.lo > soft && sp.lo <= hard && (pick === null || sp.lo < pick)) pick = sp.lo
      }
      if (pick === null) {
        for (const sp of spans) {
          const h = Math.min(sp.hi, soft)
          if (h >= sp.lo && h >= MIN_H && (pick === null || h > pick)) pick = h
        }
      }
      const next = pick !== null ? Math.floor(pick) : Math.max(MIN_H, Math.min(base, soft))
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
  top,
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
  /** 무대 안 오른쪽 아래 (보기 알약) */
  top?: ReactNode
  /** 첫 화면 맞춤에서 무대가 자랄 수 있는 만큼 (0 = 줄기만: 무대 아래 할 일 첫 줄이 보여야 하는 화면) */
  grow?: number
  /** 첫 화면에서 끝까지 보여야 하는 요소 (CSS 선택자). 무대는 이것이 접힘 위에 남는 만큼만 자란다 */
  keep?: string
  /** 3D 대신 그릴 것 (키트 보기 · 알림 글) */
  children?: ReactNode
}) {
  const ref = useFoldFit(short ? 250 : 300, grow, keep)
  const shown = useMemo(() => oneTone(input, tone), [input, tone])
  return (
    <div className="ph-stage-wrap">
      {/* 무대 안에는 글을 두지 않는다 (§11.6): 보기를 바꾸면 바뀌는 것은 3D 와 칩뿐 */}
      <section ref={ref} className={'ph-stage' + (short ? ' h240' : '')} data-view={view} aria-label="3D 디지털 트윈">
        {children ??
          (shown ? (
            <Suspense fallback={<div className="wait jj-skeleton">불러오는 중</div>}>
              <BedView input={shown} view={view} compact interactive size="sm" />
            </Suspense>
          ) : (
            <div className="msg">
              상차 정보가 없습니다<span>상차 정보를 넣으면 3D로 보입니다</span>
            </div>
          ))}
        {/* 보기 알약: 무대 안 오른쪽 아래, 장면 위에 떠 있다 (§10.5 폰 2).
            .ph-stage-ctl 은 무대 높이의 30 % 인 투명 칸 (누름은 알약만): 장면 맞춤은 키 큰 칸을 무대 아래 띠로 보지 않아 적재함이 무대 높이를 다 쓰고,
            3D 꼬리표는 이 칸을 피해 알약 밑에 깔리지 않는다 */}
        {top && (
          <div className="ph-stage-ctl">
            <div className="in">{top}</div>
          </div>
        )}
      </section>
    </div>
  )
}
