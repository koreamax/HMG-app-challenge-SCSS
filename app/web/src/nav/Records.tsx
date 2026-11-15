/**
 * 4.5 내비 · 기록 요약. 위 띠 [←][기록] … '사진 · 내보내기는 휴대폰에서' / 운송장 목록 (줄 96) / 머리 · 요약 칸 4 · 시간 줄 (줄 80).
 * 기록은 기사 본인 것. 관리자 집계는 내비에서 뺀다.
 * 운송장 셋 이하 · 넓은 창: [머리] / [시간 줄 | 칸 2 x 2 + 고른 기록 자세히] (side) 또는 [칸 4] / [시간 줄 | 자세히] (row).
 *   시간 줄 한 줄을 누르면 오른쪽 자세히 카드가 그 기록을 보인다 (처음은 마지막 사건). 시간 줄 아래는 바탕으로 녹여 잘린 줄이 없게.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronRight, Minus, RotateCcw, Route, TriangleAlert } from 'lucide-react'
import { CARGO } from '@/engine/cargo'
import type { Tone } from '@/engine/limit'
import type { RecordEntry, Waybill } from '@/engine/records'
import { app } from '@/runtime/runtime'
import { useStore } from '@/runtime/store'
import { clock, dayLabel, DIR_WORD, fmtG, fmtKm, placeText } from '@/ui/format'
import { GGaugeIcon, ListRow, NumText, type TileTone } from '@/ui/parts'
import { Kpi, TopBar } from './Frame'
import { useFrameSize } from '@/ui/Fit'
import { useNavLayout, useParkShape } from './hooks'
import { openRecords } from './state'

const ALERT_WORD = { check: '확인 필요', loose: '바가 느슨해졌습니다', moved: '짐이 밀렸습니다', lost: '짐 이탈 의심' } as const

function line(e: RecordEntry): { tone: TileTone; title: string; caption?: string } | null {
  switch (e.kind) {
    case 'load':
      // 시간 줄은 한 줄 요약만 (버티는 제동 같은 계산 값은 오른쪽 자세히 카드에)
      return {
        tone: e.tone,
        title: '상차 · ' + e.title,
        caption: CARGO[e.input.kind].label + ' ' + e.input.massKg + ' kg · ' + (e.input.beltType === 'ratchet' ? '라쳇 ' : '고무바 ') + e.input.belts + '개',
      }
    case 'green':
      return null
    case 'depart':
      return { tone: e.tone, title: '출발 · ' + e.title, caption: e.kit ? '센서 키트 연결' : '키트 없음 · 차량 신호로 판단' }
    case 'alert': {
      // 받은 힘 · 버팀 값은 자세히 카드에. 시간 줄에는 무슨 일이 어디서 있었는지만
      const cm = e.shiftMm ? Math.round(e.shiftMm / 10) : 0
      return {
        tone: 'red',
        title: '사건 · ' + ALERT_WORD[e.alert],
        caption: [cm ? '짐 ' + cm + ' cm 밀림' : null, placeText(e.place)].filter(Boolean).join(' · ') || undefined,
      }
    }
    case 'speech':
      return { tone: 'neutral', title: '음성 안내', caption: '“' + e.text + '”' }
    case 'answer': {
      // 들은 말은 대답과 다를 때만 (괄호 속 시연 표시 등은 뺀다)
      const heard = e.heard.replace(/\s*\([^)]*\)/g, '').trim()
      return { tone: 'neutral', title: '대답 · ' + (e.yes ? '네' : '대답 없음'), caption: heard && heard !== '네' ? '“' + heard + '”' : undefined }
    }
    case 'waypoint':
      return { tone: 'neutral', title: '경유지 추가', caption: e.name }
    case 'park':
      return { tone: 'neutral', title: '정차', caption: '상차 뒤 ' + fmtKm(e.km) + ' km' }
    case 'relash':
      return { tone: 'neutral', title: '다시 조임', caption: e.limit !== null ? '버티는 제동 ' + fmtG(e.limit) + ' g' : undefined }
    case 'unload':
      return { tone: 'neutral', title: '일부 하차 · ' + e.count + '번째', caption: '남은 짐의 바를 다시 확인' }
    case 'photo':
      return { tone: 'neutral', title: '사진 첨부', caption: '사진은 휴대폰에서 봅니다' }
    case 'company':
      return { tone: 'red', title: '회사 알림', caption: e.text }
    case 'feedback':
      return { tone: 'neutral', title: '기사 확인 · ' + (e.moved ? '밀림 있음' : '밀림 없음'), caption: '기사가 짐을 직접 보고 남김' }
  }
}

function summary(w: Waybill, liveKm: number | null) {
  const alerts = w.entries.filter((e) => e.kind === 'alert')
  const relash = w.entries.filter((e) => e.kind === 'relash')
  const loads = w.entries.filter((e) => e.kind === 'load')
  const load = loads[loads.length - 1]
  let km = 0
  for (const e of w.entries) if (e.kind === 'park') km = Math.max(km, e.km)
  if (liveKm !== null) km = Math.max(km, liveKm)
  const lastAlert = alerts[alerts.length - 1]
  return {
    alerts: alerts.length,
    lastAlert: lastAlert && lastAlert.kind === 'alert' ? lastAlert : null,
    relash: relash.length,
    lastRelash: relash[relash.length - 1] ?? null,
    tone: (load && load.kind === 'load' ? load.tone : 'grey') as Tone,
    title: load && load.kind === 'load' ? load.title : '상차 정보 없음',
    limit: load && load.kind === 'load' ? load.limit : null,
    km,
  }
}

/** 고른 기록 자세히: 칸 넷까지 (이름 · 값) + 아래 한 줄 */
function facts(e: RecordEntry): { cells: [string, string][]; foot?: string | null } {
  switch (e.kind) {
    case 'alert':
      return {
        cells: [
          ['받은 ' + (e.dir && e.dir in DIR_WORD ? DIR_WORD[e.dir as keyof typeof DIR_WORD] : '힘'), e.peakG !== null ? fmtG(e.peakG) + ' g' : '—'],
          ['버티는 제동', fmtG(e.limitG) + ' g'],
          ['짐 이동', e.shiftMm ? Math.round(e.shiftMm / 10) + ' cm' : e.measured ? '제자리' : '모름'],
          ['잰 것', e.measured ? '센서 키트' : '속도로 추정'],
        ],
        foot: placeText(e.place),
      }
    case 'load':
      return {
        cells: [
          ['짐 · ' + CARGO[e.input.kind].label, e.input.massKg + ' kg'],
          ['벨트 · ' + (e.input.beltType === 'ratchet' ? '라쳇' : '고무바'), e.input.belts + ' 개'],
          ['버티는 제동', fmtG(e.limit) + ' g'],
          ['기준', fmtG(e.crit) + ' g'],
        ],
        foot: e.input.frontWall ? '앞벽에 붙여 실음' : '앞벽에 붙이지 않음',
      }
    case 'depart':
      return { cells: [['출발 판정', e.title], ['판단', e.kit ? '센서 키트' : '차량 신호']] }
    case 'relash':
      return { cells: e.limit !== null ? [['버티는 제동', fmtG(e.limit) + ' g']] : [], foot: '사건 뒤 다시 조인 기록' }
    case 'park':
      return { cells: [['상차 뒤 거리', fmtKm(e.km) + ' km']] }
    default:
      return { cells: [] }
  }
}

/** 고른 기록 뒤에 이어진 것 (사건 -> 조치, 상차 -> 운행): 다음 같은 종류 기록 전까지 처음 한 번의 시각. 없으면 null */
function after(e: RecordEntry, w: Waybill): { title: string; at: number | null }[] {
  const i = w.entries.indexOf(e)
  if (i < 0 || (e.kind !== 'alert' && e.kind !== 'load')) return []
  const rest: RecordEntry[] = []
  for (const x of w.entries.slice(i + 1)) {
    if (x.kind === e.kind) break
    rest.push(x)
  }
  const first = (ok: (x: RecordEntry) => boolean) => rest.find(ok)?.at ?? null
  if (e.kind === 'alert')
    return [
      { title: '“네”', at: first((x) => x.kind === 'answer' && x.yes) },
      { title: '정차', at: first((x) => x.kind === 'park') },
      { title: '다시 조임', at: first((x) => x.kind === 'relash') },
      { title: '사진 첨부', at: first((x) => x.kind === 'photo') },
    ]
  const ended = rest.length === w.entries.length - i - 1 ? w.closedAt : null
  return [
    { title: '출발', at: first((x) => x.kind === 'depart') },
    { title: '정차', at: first((x) => x.kind === 'park') },
    { title: '다시 조임', at: first((x) => x.kind === 'relash') },
    { title: '운행 종료', at: ended },
  ]
}

/** 시간 줄을 내렸으면 위 가장자리도 녹인다 (반쯤 잘린 줄이 위에 보이지 않게) */
const markTop = (ol: HTMLElement) => ol.parentElement?.classList.toggle('scrolled', ol.scrollTop > 4)

export function Records() {
  const cur = useStore(app, (s) => s.waybill)
  const history = useStore(app, (s) => s.history)
  const liveKm = useStore(app, (s) => Math.round((s.out?.kmSinceLoad ?? 0) * 10) / 10)
  const list = useMemo(() => [...(cur ? [cur] : []), ...[...history].reverse().filter((h) => h.id !== cur?.id)], [cur, history])
  const [sel, setSel] = useState<string | null>(null)
  // 세로 창: 한 단. 운송장 목록은 고른 것 한 줄로 접어 두고, 누르면 펼친다
  const tall = useNavLayout() === 'tall'
  const shape = useParkShape()
  const frame = useFrameSize()
  const [open, setOpen] = useState(false)
  const w = list.find((x) => x.id === sel) ?? list[0] ?? null
  // 운송장이 셋 이하면 왼쪽 목록 단 대신 위에 고르는 줄 (하나뿐이면 고를 것이 없으니 없음)
  const few = list.length <= 3
  const shown = tall && !open ? list.filter((x) => x.id === w?.id) : list
  const pick = (id: string) => {
    if (tall && !open) {
      if (list.length > 1) setOpen(true)
      return
    }
    setSel(id)
    setOpen(false)
  }
  const s = w ? summary(w, w.id === cur?.id ? liveKm : null) : null
  // 음성 안내 줄은 펼쳤을 때만 (시간 줄은 일어난 일 위주로 짧게)
  const [voice, setVoice] = useState(false)
  const voiceN = w ? w.entries.filter((e) => e.kind === 'speech').length : 0
  const rows = w ? w.entries.filter((e) => voice || e.kind !== 'speech').map((e) => ({ e, at: e.at, l: line(e) })).filter((r) => r.l) : []
  // 넓은 창 · 운송장 셋 이하: 시간 줄 옆에 고른 기록 자세히 (처음은 마지막 사건, 없으면 상차)
  const split = few && !tall
  const [pickRow, setPickRow] = useState<number | null>(null)
  useEffect(() => setPickRow(null), [w?.id, voice])
  let lastAlert = -1
  rows.forEach((r, i) => r.e.kind === 'alert' && (lastAlert = i))
  const selRow = pickRow !== null && pickRow < rows.length ? pickRow : lastAlert >= 0 ? lastAlert : rows.length ? 0 : -1
  const selEntry = selRow >= 0 ? rows[selRow] : null
  // 처음 연 때 (고른 줄이 저절로 정해진 때) 그 줄이 아래 녹는 띠 밑에 숨으면 보일 만큼만 올린다 (이 목록 칸만 움직인다)
  const timeRef = useRef<HTMLOListElement>(null)
  useEffect(() => {
    const ol = timeRef.current
    const row = ol?.querySelector<HTMLElement>('.nv-trow.sel')
    if (!ol || !row || pickRow !== null) return
    // 창 크기가 바뀌면 처음부터 다시 잰다 (넓은 창에서 내린 만큼이 좁은 창에 남지 않게)
    ol.scrollTop = 0
    const top = row.getBoundingClientRect().top - ol.getBoundingClientRect().top
    const bottom = top + row.offsetHeight
    const room = ol.clientHeight - 96
    if (bottom > ol.scrollTop + room) ol.scrollTop = Math.max(0, Math.min(top - 48, bottom - room))
    markTop(ol)
  }, [w?.id, selRow, pickRow, split, frame.W, frame.H])

  // 운송장이 셋 이하 (둘 이상): 고르는 줄. 넓은 창은 머리 줄 오른쪽에 올려 아래 칸 · 자세히 카드에 높이를 남긴다 (좁으면 머리 아래로 접힌다)
  const waybillPick = few && list.length > 1 && (
          <div className="nv-rec-pick" role="group" aria-label="운송장">
            {list.map((x) => {
              const sx = summary(x, null)
              return (
                <button key={x.id} type="button" aria-pressed={w?.id === x.id} onClick={() => setSel(x.id)}>
                  <i className={'ui-dot tone-' + sx.tone} aria-hidden="true" />
                  <b className="tnum">{x.id}</b>
                  <span>{sx.alerts ? '사건 ' + sx.alerts : x.closedAt ? '종료' : '운행 중'}</span>
                </button>
              )
            })}
          </div>
  )

  return (
    <div className={'nv-records' + (few ? ' few' : '')}>
      <TopBar mode="park" title="기록" back={() => openRecords(false)} caption="사진 · 내보내기는 휴대폰에서" />
      <div className="nv-rec-body">
        {waybillPick && !split && waybillPick}
        {list.length === 0 && <p className="nv-empty">아직 기록이 없습니다</p>}
        {!few && (
        <div className="nv-rec-list jj-stagger" role="list" aria-label="운송장">
          {shown.map((x) => {
            const sx = summary(x, null)
            return (
              <ListRow
                key={x.id}
                tone={sx.tone}
                title={x.id}
                caption={dayLabel(x.createdAt) + ' · ' + CARGO[x.input.kind].label + ' ' + x.input.massKg + ' kg'}
                value={tall && !open && list.length > 1 ? '운송장 ' + list.length + '건' : sx.alerts ? '사건 ' + sx.alerts : x.closedAt ? '종료' : '운행 중'}
                chevron={<ChevronRight strokeWidth={2.2} />}
                selected={w?.id === x.id}
                onClick={() => pick(x.id)}
              />
            )
          })}
        </div>
        )}
        {tall && open ? null : w && s ? (
          <div className={'nv-rec-main' + (split ? ' split ' + (shape === 'row' ? 'rs-row' : 'rs-side') : '')}>
            <div className="nv-rec-head">
              <b>{w.id}</b>
              <span>
                {(w.closedAt ? '종료' : '운행 중') + ' · 사건 ' + s.alerts + ' · ' + dayLabel(w.createdAt) + ' ' + clock(w.createdAt) + ' 상차'}
              </span>
              {waybillPick && split && waybillPick}
              {voiceN > 0 && (
                <button type="button" className="nv-rec-voice" aria-pressed={voice} onClick={() => setVoice((x) => !x)}>
                  {voice ? '음성 안내 숨기기' : '음성 안내 ' + voiceN + '건 보기'}
                </button>
              )}
            </div>
            <div className="nv-rec-tiles jj-stagger">
              {/* 이름은 내비 · 폰 · 운송장이 같이 쓰는 '버티는 제동'. 판정 말은 기준 자리 (점 색과 같이) */}
              {/* 정차 화면의 지표 칸과 같은 모양 (둥근 아이콘 · 이름 · 값 … 보조 글). 짐 · 벨트 · 사건 종류는 시간 줄과 자세히 카드가 말한다 */}
              <Kpi tone={s.tone} icon={<GGaugeIcon />} name="버티는 제동" caption={s.title.replace(/^계산상 /, '')} value={s.limit !== null ? fmtG(s.limit) : '—'} unit={s.limit !== null ? 'g' : undefined} />
              <Kpi tone={s.alerts ? 'red' : 'neutral'} icon={<TriangleAlert />} name="사건" caption={s.lastAlert ? '마지막 ' + clock(s.lastAlert.at) : '없음'} value={s.alerts} unit="건" />
              <Kpi icon={<RotateCcw />} name="다시 조임" caption={s.lastRelash ? '마지막 ' + clock(s.lastRelash.at) : '없음'} value={s.relash} unit="번" />
              <Kpi icon={<Route />} name="거리" caption="상차 뒤" value={fmtKm(s.km)} unit="km" />
            </div>
            <div className="nv-rec-timewrap">
              <ol ref={timeRef} className="nv-rec-time jj-stagger" aria-label="시간 줄" onScroll={(e) => markTop(e.currentTarget)}>
                {rows.map((r, i) => {
                  const body = (
                    <>
                      <time>{clock(r.at)}</time>
                      <span className="rl" aria-hidden="true">
                        <i className={'ui-dot ' + (r.l!.tone === 'neutral' ? 'neutral' : 'tone-' + r.l!.tone)} />
                      </span>
                      <span className="tx">
                        <b>{r.l!.title}</b>
                        {r.l!.caption && <span>{r.l!.caption}</span>}
                      </span>
                    </>
                  )
                  return (
                    <li key={i}>
                      {split ? (
                        <button type="button" className={'nv-trow' + (i === selRow ? ' sel' : '')} aria-pressed={i === selRow} onClick={() => setPickRow(i)}>
                          {body}
                        </button>
                      ) : (
                        <div className="nv-trow">{body}</div>
                      )}
                    </li>
                  )
                })}
                <li className="nv-rec-note">사진 · 내보내기는 휴대폰에서</li>
              </ol>
            </div>
            {split && selEntry && <RecordDetail at={selEntry.at} l={selEntry.l!} e={selEntry.e} w={w} />}
          </div>
        ) : (
          <div className="nv-rec-none">기록을 고르세요</div>
        )}
      </div>
    </div>
  )
}

/** 고른 기록 자세히 (오른쪽 카드): [시각 · 점 · 종류 … 위치] / 제목 / 우물 넷 (칸과 같은 값 + 단위) / 그 뒤 조치 2 x 2 (✓ 시각 · – 아직) */
function RecordDetail({ at, l, e, w }: { at: number; l: { tone: TileTone; title: string; caption?: string }; e: RecordEntry; w: Waybill }) {
  const f = facts(e)
  const steps = after(e, w)
  const [kind, ...rest] = l.title.split(' · ')
  const title = rest.length ? rest.join(' · ') : kind
  return (
    <section className="nv-rec-detail" aria-label="고른 기록">
      <div className="in">
        <div className="hd">
          <time className="tnum">{clock(at)}</time>
          <i className={'ui-dot ' + (l.tone === 'neutral' ? 'neutral' : 'tone-' + l.tone)} aria-hidden="true" />
          <span>{rest.length ? kind : '기록'}</span>
          {/* 아래 한 줄(위치 · 앞벽)은 머리 줄 오른쪽 끝으로: 카드 아래를 조치 줄에 내준다 */}
          {f.foot && <span className="where">{f.foot}</span>}
        </div>
        <strong>{title}</strong>
        {f.cells.length > 0 ? (
          <div className="cells">
            {f.cells.map(([k, v]) => (
              <div className="cell" key={k}>
                <span>{k}</span>
                <NumText text={v} className="v" />
              </div>
            ))}
          </div>
        ) : (
          l.caption && <p className="cap">{l.caption}</p>
        )}
        {steps.length > 0 && (
          <div className="steps">
            <span className="steps-h">{e.kind === 'alert' ? '그 뒤 조치' : '그 뒤 운행'}</span>
            <ul>
              {steps.map((s) => (
                <li key={s.title} className={s.at !== null ? 'done' : undefined}>
                  {s.at !== null ? <Check strokeWidth={2.4} aria-label="함" /> : <Minus strokeWidth={2} aria-label="아직" />}
                  <b>{s.title}</b>
                  <time className="tnum">{s.at !== null ? clock(s.at) : '아직'}</time>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  )
}
