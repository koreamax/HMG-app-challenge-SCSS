/**
 * 내비 정차 화면의 뼈대 (v5 대시보드 트윈, design/DESIGN_SPEC.md §11.4). 설계 px (1920 폭).
 *   왼 덩어리: [지표 줄 76] / [3D 무대 (왼쪽 끝까지, 설명 글 없음)] / [아래 줄 카드 164 (높은 창의 정차 확인만)]
 *   오른 단 472: [도구 줄 76: 보기 셋 + 기록 · 설정] / [판정 판: 판정 · 할 일 · 주 단추 (늘 같은 자리)] / [할 일 판] / [벨트 장력 · 방금 받은 힘 판 (높은 창만)] / [버금 단추]
 * 4.1 정차 3D 확인 · 4.4 다시 묶기가 같이 쓴다. 위 띠(TopBar)는 주행 · 기록 화면용.
 */
import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from 'react'
import { ArrowLeft, Box, FileText, Grid2x2, Radio, Settings } from 'lucide-react'
import { CARGO, PICKABLE, type CargoKind } from '@/engine/cargo'
import type { Tone } from '@/engine/limit'
import { LINES } from '@/engine/lines'
import type { BedInput, StageTag } from '@/three/bed-scene'
import { app } from '@/runtime/runtime'
import { createStore, useStore } from '@/runtime/store'
import { Button, CargoGlyph, CellButton, CountUp, isNumeric, ListeningPill, Segmented, Sign, toneClass, type TileTone } from '@/ui/parts'
import { kitText, useKitState, useNavLayout, useParkShape, type KitState } from './hooks'
import { openRecords, openSheet, setView, useNav, type NavView } from './state'

const BedView = lazy(() => import('@/three/BedView'))

export type BannerProps = {
  tone: Tone
  word: string
  /** 할 일. 오른쪽 할 일 카드와 같은 말이면 비운다 (한 화면에 같은 말은 한 번) */
  todo?: string | null
  alt?: string | null
  /** 한 줄 뒤에 붙는 시각 · 장소 ('10:23 졸음쉼터 A'). 낮은 창의 다시 묶기에서는 지표 줄이 같은 것을 보이므로 뺀다 */
  when?: string | null
  /** 주 단추 (판정 판 바닥, 늘 같은 자리). quiet = 초록 판정의 버금 단추 (주 단추 색은 할 일이 있을 때만) */
  action?: { label: string; onClick: () => void; disabled?: boolean; quiet?: boolean } | null
  /** 판 머리 이름 (기본 '판정') */
  head?: string
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

/** 판 머리 (모든 판 공통): [강조 세모][이름] … [오른쪽 것]. 머리 아래 선 없음 */
export function PanelHead({ title, children, className = '' }: { title: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <div className={'nv-phead ' + className}>
      <i className="tri" aria-hidden="true" />
      <b>{title}</b>
      {children}
    </div>
  )
}

/** 가는 진행 막대 (길 3 px, 채움 강조 색). 다 차도 색은 그대로 (초록은 판정에만) */
export function Progress({ done, total }: { done: number; total: number }) {
  return (
    <span className="nv-prog" aria-hidden="true">
      <i style={{ transform: `scaleX(${total > 0 ? Math.max(0, Math.min(1, done / total)) : 0})` }} />
    </span>
  )
}

/**
 * 판정 판 (오른 단 맨 위): 머리 [세모 · 판정 … 운송장 번호] → [표지 44][판정 말 44] → 할 일 30 → 한 줄 24 → 주 단추 (판 바닥, 폭 가득 x 80).
 * 낮은 창(1920 x 720)은 머리 줄 없이, 세로 창(tall)은 판 없이 바탕 위에 쌓는다. 판정마다 같은 박자: 단추 자리가 늘 찬다 (초록은 버금 단추).
 */
export function Banner({ tone, word, todo, alt, when, action, head = '판정' }: BannerProps) {
  const waybill = useStore(app, (s) => s.waybill?.id ?? null)
  useLayoutEffect(() => {
    headerSaid.set({ text: [word, todo, alt, when].filter(Boolean).join(' · ') })
  }, [word, todo, alt, when])
  return (
    <header className={'nv-banner tone-' + tone}>
      <PanelHead title={head}>{waybill && <span className="meta tnum">{waybill}</span>}</PanelHead>
      <div className="nv-vrow">
        <Sign tone={tone} className="nv-lamp" />
        <div className="nv-verdict" role="status">
          {word}
        </div>
      </div>
      {(todo || alt) && (
        <div className="nv-todo">
          {todo && <strong>{todo}</strong>}
          {alt && (
            <span>
              {alt}
              {when && <i className="when">{' · ' + when}</i>}
            </span>
          )}
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

/**
 * 지표 칸 (무대 위 지표 줄, 높이 76): [둥근 아이콘 44][이름 · 상태 점 … 기준 글 / 값 + 단위 + (가는 막대 | … 보조 글)].
 * 막대는 값 줄의 남는 폭 (이름이 잘리지 않게 이름 줄과 다투지 않는다). 상태는 이름 옆 점과 막대 색만 (값은 잉크색).
 * 보조 글('박스' · '라쳇' · '붙이면 기준 0.50')은 값 줄 오른쪽 끝 (이름과 붙어 한 문장처럼 읽히지 않게). 막대가 있는 칸만 이름 줄 오른쪽.
 * 막대의 기준 눈금 · 기준 글은 둘째 강조 색. 자리가 모자라면 보조 글 · 기준 글이 통째로 빠진다.
 */
export function Kpi({
  tone = 'neutral',
  icon,
  name,
  caption,
  value,
  unit,
  ratio,
  mark,
  markText,
  selected,
  onClick,
  label,
}: {
  tone?: TileTone
  icon: ReactNode
  name: string
  caption?: string | null
  value: string | number
  unit?: string
  /** 막대 채움 0~1 (없으면 막대 없음) · 기준 눈금 0~1 · 기준 글 (이름 줄 오른쪽) */
  ratio?: number | null
  mark?: number | null
  markText?: string | null
  selected?: boolean
  onClick?: () => void
  label?: string
}) {
  const word = typeof value === 'string' && !isNumeric(value)
  const note = caption && ratio == null ? caption : null
  const body = (
    <>
      <span className="ic" aria-hidden="true">
        {icon}
      </span>
      <span className="tx">
        <span className="nm">
          <b>{name}</b>
          {tone !== 'neutral' && <i className="dot" aria-hidden="true" />}
          {caption && !note && <em>{caption}</em>}
          {markText && <em className="mark">{markText}</em>}
        </span>
        <span className={'vl' + (word ? ' word' : '') + (note ? ' has-note' : '')}>
          <b>{word ? value : <CountUp value={value} />}</b>
          {unit && <small>{unit}</small>}
          {ratio != null && (
            <span className="bar" aria-hidden="true">
              <i style={{ transform: `scaleX(${Math.max(0, Math.min(1, ratio))})` }} />
              {mark != null && <s style={{ left: `${Math.max(0, Math.min(1, mark)) * 100}%` }} />}
            </span>
          )}
          {note && <em className="note">{note}</em>}
        </span>
      </span>
    </>
  )
  const cls = `nv-kpi ${toneClass(tone)}${selected ? ' sel' : ''}`
  return onClick ? (
    <button type="button" className={cls} aria-pressed={selected} onClick={onClick} aria-label={label}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  )
}

/**
 * 짐 종류 (짐 그림 다섯, 지금 짐 강조). 전체가 단추 하나 → 상차 시트.
 * card = 아래 줄 카드 (머리 + '바꾸기'), 아니면 오른 단의 한 줄 (낮은 넓은 창)
 */
export function KindPicker({ kind, card = false }: { kind: CargoKind | null; card?: boolean }) {
  return (
    <button type="button" className={'nv-kindbar' + (card ? ' card' : '')} onClick={() => openSheet('load')} aria-label="짐 종류 바꾸기">
      {card && (
        <PanelHead title="짐 종류">
          <span className="go">바꾸기</span>
        </PanelHead>
      )}
      <span className="list">
        {PICKABLE.map((k) => (
          <span key={k} className={'k' + (k === kind ? ' on' : '')}>
            <CargoGlyph kind={k} size={30} />
            {CARGO[k].label}
          </span>
        ))}
      </span>
    </button>
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

const VIEWS: { id: NavView; label: string; icon: ReactNode }[] = [
  { id: '3d', label: '3D', icon: <Box strokeWidth={2} /> },
  { id: 'top', label: '위에서', icon: <Grid2x2 strokeWidth={2} /> },
  { id: 'kit', label: '센서 키트', icon: <Radio strokeWidth={2} /> },
]

/**
 * 도구 줄 (오른 단 맨 위, 높이 76, 바탕 위): 보기 셋 + [기록][설정]. 고른 보기 = 강조 면 + 강조 색 아이콘 + 아래 2 px 표시 줄.
 * 센서 키트가 끊김 · 없음이면 그 칸 아이콘만 흐리게 (글로 알리지 않는다). 세로 창에서는 같은 폭 칸 다섯
 */
export function Rail() {
  const view = useNav((s) => s.view)
  const kit = useKitState()
  return (
    <nav className="nv-rail" aria-label="보기 · 메뉴" data-kit={kit}>
      <Segmented options={VIEWS} value={view} onChange={setView} label="3D 보기" />
      <div className="grp">
        <CellButton icon={<FileText strokeWidth={2} />} label="기록" onClick={() => openRecords(true)} />
        <CellButton icon={<Settings strokeWidth={2} />} label="설정" onClick={() => openSheet('settings')} />
      </div>
    </nav>
  )
}

type Tag = StageTag
const tagRank = (t: Tag) => (t.tone === 'red' ? 0 : t.tone === 'orange' ? 1 : t.id === 'fall' || t.id === 'lost' ? 1 : 9)
/** 잰 값 꼬리표 ('앞 바 장력 · 1,250 N' · '짐 태그 · 제자리') → 정보 칩 (이름 / 값). 문제(주황 · 빨강)는 상태 칩 그대로 */
const asInfo = (t: Tag): Tag => {
  if (t.title || t.tone === 'red' || t.tone === 'orange') return t
  const cutAt = t.text.indexOf(' · ')
  if (cutAt < 0) return t
  return { ...t, title: t.text.slice(0, cutAt), rows: [{ k: '', v: t.text.slice(cutAt + 3) }] }
}
/**
 * 무대 위 칩 (§11.5-4): 상태 칩 하나 (가장 급한 것, 빨강 먼저) + 정보 칩 둘까지 (화면이 넘겨 준 순서).
 * 센서 키트 보기는 잰 값이 목적이라 잰 값 꼬리표를 정보 칩으로 (문제는 상태 칩). 세로 창은 칩 하나
 */
function stageTags(tags: Tag[], view: NavView, tall: boolean): Tag[] {
  const list = view === 'kit' ? tags.map(asInfo) : tags
  const status = list
    .map((t, i) => ({ t, i, r: tagRank(t) }))
    .filter((x) => !x.t.title && x.r < 9)
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .slice(0, 1)
    .map((x) => x.t)
  const infos = list.filter((t) => !!t.title)
  if (tall) return status.length ? status : infos.slice(0, 1)
  return [...status, ...infos].slice(0, 3)
}

/**
 * 3D 무대: 판 · 테두리 없이 바탕 위에 바로 (옅은 격자 바닥 · 강조 색 발판 선은 장면이 그린다). 왼 덩어리의 남는 높이를 다 쓴다.
 * 무대 위에 뜨는 것은 칩(셋까지) · 알림 하나 (아래 가운데) 뿐. 보기에 따라 바뀌는 설명 글은 없다 (§11.6).
 * 정차 중 쉼터 질문을 들을 때는 알림 자리에 듣는 중 알약
 */
export function Stage({ input, children }: { input: BedInput; name?: string; children?: ReactNode }) {
  const view = useNav((s) => s.view)
  const tall = useNavLayout() === 'tall'
  const listening = useStore(app, (s) => s.speech.listening)
  const shown = useMemo(() => ({ ...input, tags: stageTags(input.tags ?? [], view, tall) }), [input, view, tall])
  const waybill = useStore(app, (s) => s.waybill?.id ?? null)
  return (
    <section className="nv-stage-wrap" aria-label="3D 디지털 트윈">
      <div className="nv-stage" data-view={view === 'top' ? 'top' : '3d'}>
        <Suspense fallback={<div className="nv-loading jj-skeleton">불러오는 중</div>}>
          <BedView input={shown} view={view === 'top' ? 'top' : '3d'} loadId={waybill} size="lg" />
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
 * 정차 틀 (§11.4). 모양마다 (useParkShape):
 *   side : [지표 줄 / 무대 / 아래 줄 카드] · [도구 줄 / 판정 판 / 할 일 판 / (벨트 장력 판) / 버금 단추]      (1224 x 880 실제 창 · 1920 x 1000 이상)
 *   row  : [지표 줄 / 무대] · [도구 줄 / 판정 판 / 짐 종류 줄 / 눈으로 확인 줄(누르면 시트) / 버금 단추]   (1920 x 720 ~ 1000)
 *          창이 조금 높으면 (full, 1920 x 800 쯤부터) 눈으로 확인 줄 대신 체크 줄을 다 편 할 일 판 (판정 판은 내용 높이: 빈 면이 남지 않게)
 *          다시 묶기(dense)는 [도구 줄 / 판정 판 / 순서 판]
 *   tall : 판정 (고정, 판 없이) / [도구 줄 · 무대 · 지표 2 x 2 · 버금 단추] 가 첫 화면을 꼭 채우고, 할 일 판은 그 아래 (내려 보면)
 * 주 단추는 늘 판정 판 바닥 (오른쪽 위 1/3, 운전석 쪽 손이 닿는 곳). dense = 줄이 많은 판 (다시 묶기)
 */
export function ParkFrame({
  banner,
  stage,
  tiles,
  right,
  foot,
  edge,
  summary,
  strip,
  kinds,
  extra,
  dense = false,
  full = false,
}: {
  banner: ReactNode
  stage: ReactNode
  tiles: ReactNode
  right: ReactNode
  foot?: ReactNode
  edge?: ReactNode
  summary?: ReactNode
  /** 아래 줄 카드 (높은 창만) */
  strip?: ReactNode
  /** 짐 종류 줄 (낮은 넓은 창의 오른 단) */
  kinds?: ReactNode
  /** 오른 단 할 일 판 아래의 판 (높은 창만): 할 일 판은 내용 높이, 이 판이 남는 높이를 받는다 */
  extra?: ReactNode
  dense?: boolean
  /** row 에서 눈으로 확인 줄 대신 할 일 판을 다 편다 (창 높이가 받쳐 줄 때) */
  full?: boolean
}) {
  const shape = useParkShape()
  const tileGrid = <div className="nv-tiles jj-stagger">{tiles}</div>
  const card = <div className={'nv-right' + (dense ? ' dense' : '')}>{right}</div>
  if (shape === 'tall')
    return (
      <div className="nv-park shape-tall">
        {banner}
        <div className="nv-scroll">
          {/* 버금 단추가 없는 화면 (다시 묶기) 은 그 자리에 할 일 판 머리를 내보인다 (내려 보면 된다는 단서) */}
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
  const rowFull = shape === 'row' && !dense && full
  const sheetRow = shape === 'row' && !dense && !rowFull && !!summary
  const more = shape === 'side' ? extra : null
  return (
    <div className={'nv-park shape-' + shape + (dense ? ' dense' : '') + (more ? ' has-extra' : '') + (rowFull ? ' row-full' : '')}>
      <div className="nv-left">
        {tileGrid}
        {stage}
        {shape === 'side' && strip && <div className="nv-strip">{strip}</div>}
      </div>
      <aside className="nv-aside">
        <Rail />
        {banner}
        {sheetRow ? (
          <>
            {kinds}
            {summary}
          </>
        ) : rowFull ? (
          <>
            {kinds}
            {card}
          </>
        ) : (
          card
        )}
        {more}
        {foot}
      </aside>
      {edge}
    </div>
  )
}
