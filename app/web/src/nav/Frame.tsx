/**
 * 내비 정차 화면의 뼈대 (v5 Obsidian Studio, design/DESIGN_SPEC.md §10).
 *   판정 머리 (바탕 위, 카드 없음): [경고등 64][판정 말 44][할 일 26 + 한 줄 20] … [주 단추 280 x 64]   (CSS px, 1224 창)
 *   몸통: [막대 80][3D 무대 704 (판 · 테두리 없이 바탕 위, 왼쪽 위 이름표 한 줄)][오른 단 360]
 * 4.1 정차 3D 확인 · 4.4 다시 묶기가 같이 쓴다. 위 띠(TopBar)는 주행 · 기록 화면용.
 */
import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from 'react'
import { ArrowLeft, Box, FileText, Grid2x2, Radio, Settings } from 'lucide-react'
import type { Tone } from '@/engine/limit'
import { LINES } from '@/engine/lines'
import type { BedInput, StageTag } from '@/three/bed-scene'
import { app } from '@/runtime/runtime'
import { createStore, useStore } from '@/runtime/store'
import { Button, CellButton, ListeningPill, Segmented, Sign } from '@/ui/parts'
import { kitText, useKitState, useNavLayout, useParkShape, type KitState } from './hooks'
import { openRecords, openSheet, setView, useNav, type NavView } from './state'

const BedView = lazy(() => import('@/three/BedView'))

export type BannerProps = {
  tone: Tone
  word: string
  /** 할 일. 오른쪽 할 일 카드와 같은 말이면 비운다 (한 화면에 같은 말은 한 번) */
  todo?: string | null
  alt?: string | null
  /** 머리 단추 (주 단추 자리). quiet = 초록 판정의 버금 단추 (파랑은 할 일이 있을 때만) */
  action?: { label: string; onClick: () => void; disabled?: boolean; quiet?: boolean } | null
}

/**
 * 머리 글 (판정 말 · 할 일 · 한 줄 · 위 띠 글). 알림은 이 글과 같은 말이면 띄우지 않는다 (한 화면에 같은 말은 한 번)
 */
const headerSaid = createStore<{ text: string }>({ text: '' })
const plain = (t: string) => t.replace(/[\s.,·:!?()'"“”]/g, '')
const saidInHeader = (line: string, head: string) => {
  const a = plain(line)
  const b = plain(head)
  if (!a || !b) return false
  if (b.includes(a)) return true
  // 알림의 문장 하나라도 머리 글에 그대로 있으면 같은 말
  return line.split(/[.·]\s*/).some((part) => plain(part).length >= 4 && b.includes(plain(part)))
}

/**
 * 판정 머리: [경고등][판정 말][할 일 title + 한 줄 body] … [단추 280 x 64 CSS]. 나눔 선 · 메타 없음.
 * 'P 정차 · 운송장' 은 무대 왼쪽 위 caption 한 줄 (§10.5-5). 머리 높이는 정차 · 다시 묶기 · 주행이 같다.
 * 판정마다 같은 박자: 할 일 줄 + 단추 자리가 늘 찬다 (초록은 버금 단추).
 * 세로 창(tall)은 [경고등 · 판정 말] / 할 일 / 단추 (폭 가득) 로 쌓는다 (CSS grid).
 */
export function Banner({ tone, word, todo, alt, action }: BannerProps) {
  useLayoutEffect(() => {
    headerSaid.set({ text: [word, todo, alt].filter(Boolean).join(' · ') })
  }, [word, todo, alt])
  return (
    <header className={'nv-banner tone-' + tone}>
      <Sign tone={tone} className="nv-lamp" />
      <div className="nv-verdict" role="status">
        {word}
      </div>
      {(todo || alt) && (
        <div className="nv-todo">
          {todo && <strong>{todo}</strong>}
          {alt && <span>{alt}</span>}
        </div>
      )}
      {action && (
        <div className="nv-action">
          <Button kind={action.quiet ? 'secondary' : 'primary'} onClick={action.onClick} disabled={action.disabled}>
            {action.label}
          </Button>
        </div>
      )}
    </header>
  )
}

/** 위 띠 (판정 머리 없는 화면): [←][적재적소 · 모드 · 제목] … [보조 글][키트 글]. 칩 없이 글만 */
export function TopBar({ mode, title, back, caption, showKit = true }: { mode: 'park' | 'drive'; title?: string; back?: () => void; caption?: string; showKit?: boolean }) {
  const kit = useKitState()
  useLayoutEffect(() => {
    headerSaid.set({ text: [title, caption].filter(Boolean).join(' · ') })
  }, [title, caption])
  return (
    <header className={'nv-top' + (back ? ' has-back' : '')}>
      {back && (
        <button type="button" className="back" aria-label="돌아가기" onClick={back}>
          <ArrowLeft strokeWidth={2} />
        </button>
      )}
      <div className="lead">
        {title ? <span className="ttl">{title}</span> : <span className="brand">적재적소</span>}
        <span className="cap mode">{mode === 'drive' ? 'D 주행 중' : 'P 정차 중'}</span>
      </div>
      <div className="tail">
        {caption && <span className="cap">{caption}</span>}
        {showKit && (
          <span className="cap kit">
            <KitMark kit={kit} />
          </span>
        )}
      </div>
    </header>
  )
}

/** 키트 표시 (상태 색 없이): 연결 = 센서 키트 아이콘 + '키트', 끊김 = 흐린 아이콘 + '키트 끊김', 없음 = '차량 신호로 판단' */
export function KitMark({ kit, long = false }: { kit: KitState; long?: boolean }) {
  if (kit === 'off') return <>{long ? '센서 키트 없음 · 차량 신호로 판단' : kitText(kit)}</>
  return (
    <span className={'nv-kit ' + kit}>
      <Radio strokeWidth={2} aria-hidden="true" />
      {long ? (kit === 'on' ? '센서 키트 연결' : '센서 키트 끊김') : kitText(kit)}
    </span>
  )
}

/** 장면 이름 중 키트 상태 글 ('센서 키트 · ■ 연결') 은 네모 글자 대신 키트 아이콘 표시로 바꾼다 */
const isKitName = (name: string) => name.startsWith('센서 키트')

const VIEWS: { id: NavView; label: string; icon: ReactNode }[] = [
  { id: '3d', label: '3D', icon: <Box strokeWidth={2} /> },
  { id: 'top', label: '위에서', icon: <Grid2x2 strokeWidth={2} /> },
  { id: 'kit', label: '센서 키트', icon: <Radio strokeWidth={2} /> },
]

/** 왼 막대 (바탕 위, 카드 없음): 위에 보기 셋, 맨 아래 [기록][설정]. 세로 창에서는 가로 한 줄 (칸 다섯) */
export function Rail() {
  const view = useNav((s) => s.view)
  const tall = useNavLayout() === 'tall'
  return (
    <nav className="nv-rail" aria-label="보기 · 메뉴">
      <Segmented vertical={!tall} options={VIEWS} value={view} onChange={setView} label="3D 보기" />
      <div className="grp">
        <CellButton icon={<FileText strokeWidth={2} />} label="기록" onClick={() => openRecords(true)} />
        <CellButton icon={<Settings strokeWidth={2} />} label="설정" onClick={() => openSheet('settings')} />
      </div>
    </nav>
  )
}

/** 장면 이름 중 기본 이름은 빼고, 키트 설명은 '센서 키트' 보기에서만 이름표에 붙인다 */
const BASE_NAME = '3D 디지털 트윈 · PV5 오픈베드'
const KIT_NOTES = ['키트가 없어 짐이 움직였는지는 모릅니다']
type Tag = StageTag
const tagRank = (t: Tag) => (t.tone === 'red' ? 0 : t.tone === 'orange' ? 1 : t.id === 'fall' || t.id === 'lost' ? 1 : 9)
/**
 * 무대 위 꼬리표 (한 화면에 둘까지): 3D · 위에서 보기는 문제 꼬리표 하나만 (빨강 먼저). 센서 키트 보기는 잰 값이 목적이라 둘까지
 * (문제 먼저, 그다음 앞 · 뒤 바 장력 순). 세로 창은 하나
 */
function stageTags(tags: Tag[], view: NavView, tall: boolean): Tag[] {
  const ranked = tags.map((t, i) => ({ t, i, r: tagRank(t) })).filter((x) => view === 'kit' || x.r < 9)
  ranked.sort((a, b) => a.r - b.r || a.i - b.i)
  return ranked.slice(0, view === 'kit' && !tall ? 2 : 1).map((x) => x.t)
}
const kitLong = (k: KitState) => (k === 'on' ? '센서 키트 연결' : k === 'stale' ? '센서 키트 끊김' : '센서 키트 없음 · 차량 신호로 판단')

/**
 * 3D 무대: 판 · 테두리 · 사각형 없이 바탕 위에 바로 (가운데 빛이 가장자리에서 바탕과 같아진다). 몸통 높이를 다 쓴다 (위 띠 없음).
 * 무대 왼쪽 위 caption 한 줄 'P 정차 · 운송장' (+ 센서 키트 보기의 키트 상태 · '흐린 상자는 출발 때 자리' 같은 장면 설명).
 * 무대 위에 뜨는 것은 꼬리표(둘까지) · 알림 하나 (아래 가운데) 뿐. 정차 중 쉼터 질문을 들을 때는 알림 자리에 듣는 중 알약
 */
export function Stage({ input, name, children }: { input: BedInput; name: string; children?: ReactNode }) {
  const view = useNav((s) => s.view)
  const tall = useNavLayout() === 'tall'
  const kit = useKitState()
  const listening = useStore(app, (s) => s.speech.listening)
  const shown = useMemo(() => ({ ...input, tags: stageTags(input.tags ?? [], view, tall) }), [input, view, tall])
  const waybill = useStore(app, (s) => s.waybill?.id ?? null)
  const legend = name && name !== BASE_NAME && !isKitName(name) && !KIT_NOTES.includes(name) ? name : null
  // 무대 왼쪽 위 caption 한 줄: 'P 정차 · KR-2611-6378' (+ 센서 키트 보기의 키트 상태 · 장면 설명). 세로 창은 무대가 좁아 설명이 있으면 설명만
  const extra = (view === 'kit' ? kitLong(kit) : legend) || null
  const caption = (tall && extra ? [extra] : ['P 정차', waybill ?? '운송장 없음', extra]).filter(Boolean).join(' · ')
  return (
    <section className="nv-stage-wrap" aria-label="3D 디지털 트윈">
      <div className="nv-stage" data-view={view === 'top' ? 'top' : '3d'}>
        <Suspense fallback={<div className="nv-loading jj-skeleton">불러오는 중</div>}>
          {/* 이름표가 있으면 그 아래로만 꼬리표를 둔다 (장면이 이름표 바닥을 읽는다) */}
          <BedView input={shown} view={view === 'top' ? 'top' : '3d'} name={caption} size="lg" />
        </Suspense>
        {children}
        <div className="nv-dock">{listening ? <ListeningPill /> : <Notice />}</div>
      </div>
    </section>
  )
}

/**
 * 지금 말하는 문장이 바뀐 시각. runtime 은 경유지 문장 등을 지우지 않으므로 길이에 맞춰 알림에서 거둔다.
 * 화면이 바뀌어 알림이 새로 붙어도 다시 뜨지 않게 시각은 모듈에 둔다.
 */
const lineSeen = { line: null as string | null, at: 0 }
app.subscribe(() => {
  const l = app.get().speech.line
  if (l !== lineSeen.line) {
    lineSeen.line = l
    lineSeen.at = Date.now()
  }
})
const lineTtl = (l: string) => Math.max(4000, l.length * 130)

/**
 * 정차 화면 알림에 쓸 글 (말한 문장 그대로가 아니라 화면용 한 줄). 뜻은 같고 짧게.
 * 사건 문장 (밀림 · 풀림 · 이탈 · 확인 필요 · '화면에서 순서를 확인하세요') 은 판정 머리와 할 일 카드가 이미 말하므로 알림을 띄우지 않는다 (한 화면에 같은 말은 한 번).
 */
const NOTICE_HIDE = new Set<string>([LINES.parkedRelash, LINES.cargoLost, LINES.checkNeeded, LINES.checkNeededAsk, LINES.barLoose, LINES.cargoMoved, LINES.safePlace])
const NOTICE_SHORT: Record<string, string> = {
  [LINES.firstStop]: '첫 정차입니다. 바가 느슨한지 확인하세요.',
  [LINES.unloadFirst]: '남은 짐의 바를 다시 확인하세요.',
  [LINES.waypointNone]: '앞쪽에 쉼터가 없습니다. 안전한 곳에서 확인하세요.',
}
const noticeText = (l: string): string | null => (NOTICE_HIDE.has(l) ? null : NOTICE_SHORT[l] ?? l)
/** 알림은 한 줄 (높이 64 CSS): 괄호 덧말은 뗀다 ('남은 짐의 바를 확인하세요 (첫 하차 뒤로는 …)' -> 앞 문장) */
const oneLine = (t: string) => t.replace(/\s*\([^)]*\)\s*$/, '').trim()
/** 머리 글과 같은 말인가: 알림의 한 토막이 머리에 있거나, 머리의 할 일 토막(6 글자 이상)이 알림 안에 있으면 같은 말 */
const dupOfHeader = (line: string, head: string) => {
  if (saidInHeader(line, head)) return true
  const a = plain(line)
  return head.split(/\s*·\s*/).some((part) => plain(part).length >= 6 && a.includes(plain(part)))
}

/**
 * 알림 (무대 아래 가운데 독, 한 줄 · 높이 64 CSS): [상태 점][글]. 한 화면에 하나뿐 (토스트가 있으면 토스트, 없으면 지금 말하는 문장).
 * 짧은 알림(토스트)은 회색 점, 지금 말하는 문장은 지금 상태 색 점. 머리 글과 같은 말이면 띄우지 않는다
 */
export function Notice() {
  const toastRaw = useStore(app, (s) => s.toast)
  const spoken = useStore(app, (s) => s.speech.line)
  const listening = useStore(app, (s) => s.speech.listening)
  const tone = useStore(app, (s) => s.out?.status.tone ?? 'grey')
  const head = useStore(headerSaid, (s) => s.text)
  const toast = toastRaw && !dupOfHeader(oneLine(toastRaw), head) ? oneLine(toastRaw) : null
  const [, rerender] = useState(0)
  const left = spoken && lineSeen.line === spoken ? lineTtl(spoken) - (Date.now() - lineSeen.at) : 0
  const showing = left > 0
  useEffect(() => {
    if (!showing) return
    const id = window.setTimeout(() => rerender((x) => x + 1), left + 30)
    return () => window.clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spoken, showing])
  const said = showing && spoken ? noticeText(spoken) : null
  const line = said && !dupOfHeader(said, head) ? oneLine(said) : null
  // 정차 중에 쉼터 질문이 나오면 듣는 중 알약이 이 자리에 뜬다 (Stage)
  if (listening) return null
  if (toast)
    return (
      <div className="nv-notice tone-grey" key={'t' + toast} role="status">
        <i aria-hidden="true" />
        <span>{toast}</span>
      </div>
    )
  if (line)
    return (
      <div className={'nv-notice tone-' + tone} key={'s' + line} role="status">
        <i aria-hidden="true" />
        <span>{line}</span>
      </div>
    )
  return null
}

/**
 * 정차 틀. 모양마다 (useParkShape):
 *   side : 머리 / [막대][무대][칸 2 x 2 · 할 일 카드 · 버금 단추]      (1224 x 880 실제 창 · 1920 x 1000 이상)
 *   row  : 1224 와 같은 짜임 (셋째 단 없음). 머리 / [막대][무대 flex][칸 2 x 2 · 눈으로 확인 줄(summary, 누르면 시트) · 버금 단추]
 *          다시 묶기(dense)는 순서 카드가 오른 단을 다 쓰고 칸 넷은 무대 아래 한 줄   (1920 x 720 ~ 1000)
 *   tall : 머리 (고정) / [보기 막대 · 무대 · 칸 2 x 2 · 버금 단추] 가 첫 화면을 꼭 채우고, 할 일 카드는 그 아래 (내려 보면)
 * 오른 단은 창 바닥까지: 버금 단추는 단 바닥에 붙고 할 일 카드가 남는 높이를 받는다.
 * dense = 줄이 많은 카드 (다시 묶기)
 */
export function ParkFrame({ banner, stage, tiles, right, foot, edge, summary, dense = false }: { banner: ReactNode; stage: ReactNode; tiles: ReactNode; right: ReactNode; foot?: ReactNode; edge?: ReactNode; summary?: ReactNode; dense?: boolean }) {
  const shape = useParkShape()
  const tileGrid = <div className="nv-tiles jj-stagger">{tiles}</div>
  const card = <div className={'nv-right' + (dense ? ' dense' : '')}>{right}</div>
  if (shape === 'tall')
    return (
      <div className="nv-park shape-tall">
        {banner}
        <div className="nv-scroll">
          {/* 버금 단추가 없는 화면 (다시 묶기) 은 그 자리에 할 일 카드 머리를 내보인다 (내려 보면 된다는 단서) */}
          <div className={'nv-first' + (foot ? '' : ' peek')}>
            <Rail />
            {stage}
            {tileGrid}
            {foot}
          </div>
          {card}
        </div>
        {edge}
      </div>
    )
  if (shape === 'row' && (dense || !summary))
    return (
      <div className={'nv-park shape-row' + (dense ? ' dense' : '')}>
        {banner}
        <div className="nv-body">
          <Rail />
          <div className="nv-main">
            {stage}
            {tileGrid}
          </div>
          <aside className="nv-aside">
            {card}
            {foot}
          </aside>
        </div>
        {edge}
      </div>
    )
  return (
    <div className={'nv-park shape-' + shape}>
      {banner}
      <div className="nv-body">
        <Rail />
        {stage}
        <aside className="nv-aside">
          {tileGrid}
          {shape === 'row' ? summary : card}
          {foot}
        </aside>
      </div>
      {edge}
    </div>
  )
}
