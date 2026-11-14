/**
 * 4.9 사건 자세히 + 다시 묶기. 사건 카드나 알림(Android 알림과 같은 글)으로 들어온다.
 * 판정 띠 고정('짐이 밀렸습니다' · '다시 묶기 2단계', 보조 줄 없음) -> 무대 390 x 240 이하 (왼쪽 위 장소 caption 한 줄 · 오른쪽 아래 '출발 때 자리' 꼬리표)
 * -> 순서 할 일 줄 (첫 화면에 보인다) -> 칸 3개 -> (키트 없음) '짐이 실제로 밀렸나요?' -> '조인 뒤 사진'. 고정 영역 '다시 조였어요'
 * (체크 안 한 단계는 '확인 안 함'). 이탈 의심은 칸 대신 신고 줄 2개 (누르면 전화)가 할 일보다 먼저.
 */
import { useEffect, useMemo, useState } from 'react'
import { Activity, Gauge, Move, Phone } from 'lucide-react'
import { judgeLoad } from '@/engine/limit'
import type { ActiveAlert } from '@/engine/monitor'
import { REPORT_PHONES } from '@/engine/lines'
import { app, relashDone, reportMoved } from '@/runtime/runtime'
import { useStore } from '@/runtime/store'
import type { KitView } from '@/runtime/runtime'
import { kitKey, stageInput } from '@/three/bed-input'
import { clock, SHIFT_WORD } from '@/ui/format'
import { hitWord, incidentAlert, incidentBanner, limitShort, placeWord, shiftWord, stepsFor } from '../derive'
import { addWaybillPhoto, back, detailOf, markSeen, openViewer, phone, saveEventNote, showToast, useIncidents } from '../state'
import { usePhotoInput } from '../photo'
import { AppBar, Banner, CheckRow, Fixed, Head, ListRow, PhotoCell, Primary, Segmented, Tile } from '../ui'
import { celebrate } from '@/ui/parts'
import { Stage } from './Stage'

const KIT_OFF: KitView = { mode: 'off', fresh: false, snap: null, ageS: null, runLabel: null, feedError: null }
/** three/bed-input 이 유령 상자를 그릴 때 붙이는 설명. 글 줄 대신 무대 안 작은 꼬리표로 보인다 */
const GHOST_NAME = '흐린 상자는 출발 때 자리'

/** 무대 오른쪽 아래 작은 꼬리표: 점선 네모 = 출발 때 자리 (3D 유령 상자와 같은 모양) */
function GhostLegend() {
  return (
    <span className="ph-legend">
      <i aria-hidden />
      출발 때 자리
    </span>
  )
}

export function EventDetailScreen({ ikey }: { ikey: string }) {
  const incidents = useIncidents()
  const out = useStore(app, (s) => s.out)
  const kit = useStore(app, (s) => s.kit)
  const curWb = useStore(app, (s) => s.waybill)
  const notes = useStore(phone, (s) => s.eventNotes)
  const tags = useStore(phone, (s) => s.photoTags)
  const seen = useStore(phone, (s) => s.seen)
  useStore(phone, (s) => s.details)
  const inc = incidents.find((i) => i.key === ikey) ?? null
  const d = detailOf(inc)
  const live: ActiveAlert | null = inc && out?.alert && curWb?.id === inc.wb.id && out.alert.wallMs === inc.last.at ? out.alert : null
  const loose = live?.loose ?? d?.loose ?? null
  const steps = inc ? stepsFor(inc.kind, inc.last.measured, loose, live?.shiftDir ?? d?.shiftDir ?? null, inc.wb.input) : []
  const note = inc ? notes[inc.key] ?? null : null
  const [checked, setChecked] = useState<boolean[]>(() => (note ? note.steps.map((s) => s.done) : steps.map(() => false)))
  const photo = usePhotoInput(
    (url) => {
      if (inc && addWaybillPhoto(url, 'after', inc.key)) showToast('조인 뒤 사진을 붙였습니다')
    },
    (m) => showToast(m),
    'after',
  )
  const unseen = !!inc && (seen[inc.key] ?? 0) < inc.rank
  useEffect(() => {
    if (unseen && inc) markSeen(inc)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unseen])

  // 무대 (내비와 같은 three/bed-input 'relash'): 지금 사건이면 키트 실측 그대로, 지난 사건이면 기록 값으로 그 순간을 다시 그린다
  const kk = kitKey(kit)
  const bedKey = inc ? inc.key + ':' + inc.last.at + ':' + (live ? live.kind + ':' + Math.round((live.shiftMm ?? 0) / 5) + ':' + live.loose.c1 + live.loose.c2 + ':' + kk : 'rec:' + (d ? d.shiftDir + ':' + d.loose.c1 + d.loose.c2 : '-')) : ''
  const stage = useMemo(() => {
    if (!inc) return null
    const input = inc.wb.input
    if (live && out) return stageInput({ load: input, verdict: out.verdict, kit, alert: live, mode: 'relash' })
    const a = incidentAlert(inc, d)
    return stageInput({ load: input, verdict: judgeLoad(input), kit: KIT_OFF, alert: a, mode: 'relash' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bedKey])

  if (!inc) {
    return (
      <div className="ph-screen">
        <AppBar title="사건" onBack={back} />
        <div className="ph-empty">
          <b>이 사건 기록을 찾지 못했습니다</b>
          <span>기록을 지웠거나 다른 기기의 기록입니다</span>
        </div>
      </div>
    )
  }

  const e = inc.last
  const lost = inc.kind === 'lost'
  const resolved = !!inc.resolvedAt
  const canAct = !resolved && curWb?.id === inc.wb.id && !curWb.closedAt
  const driving = canAct && out?.mode === 'drive'
  const crit = judgeLoad(inc.wb.input).crit
  const shiftDirNow = d?.shiftDir ?? live?.shiftDir ?? null
  const shift = shiftWord(e.shiftMm, shiftDirNow)
  const after = inc.wb.entries.filter((x): x is Extract<typeof x, { kind: 'photo' }> => x.kind === 'photo' && tags[inc.wb.id + ':' + x.at]?.ref === inc.key)
  const lastAfter = after[after.length - 1] ?? null
  const done = checked.filter(Boolean).length
  // 한 화면에 한 번만: 사건 시각은 앱 바, 장소는 무대 왼쪽 위 caption 한 줄. 판정 카드 밑 보조 줄은 두지 않는다
  const banner = { ...incidentBanner(inc, steps.length, d), alt: null }
  const ghost = stage?.name === GHOST_NAME
  // 이미 남긴 조치는 남긴 그대로 (단계 글 · 체크)
  const shown = note ? note.steps.map((n, i) => ({ title: n.title, caption: steps[i]?.caption, tone: steps[i]?.tone ?? ('orange' as const) })) : steps
  const shiftNote = !lost && e.measured && shift && !(inc.kind === 'moved' && (d?.shiftDir ?? live?.shiftDir)) ? '짐이 ' + shift + ' 움직였습니다' : null
  const helper =
    !resolved && !canAct
      ? '운행이 끝난 운송장이라 조치를 더할 수 없습니다'
      : !lost && !e.measured
        ? '키트가 없어 속도 변화로 추정한 값입니다'
        : (shiftNote ?? (canAct && done < steps.length ? '체크하지 않은 단계는 ‘확인 안 함’으로 남습니다' : null))

  const finish = () => {
    const rec = steps.map((s, i) => ({ title: s.title, done: !!checked[i] }))
    saveEventNote(inc.key, { at: Date.now(), steps: rec })
    relashDone()
    const miss = rec.filter((r) => !r.done).length
    celebrate(lost ? '확인한 것을 기록했습니다' : '다시 조인 것을 기록했습니다')
    showToast(lost ? '확인한 것을 기록했습니다' + (miss ? ' · 확인 안 함 ' + miss + '단계' : '') : '다시 조인 것을 기록했습니다' + (miss ? ' · 확인 안 함 ' + miss + '단계' : ''))
    back()
  }

  return (
    <div className="ph-screen">
      <AppBar title={'사건 · ' + clock(inc.first.at)} onBack={back} />
      <Banner data={banner} />
      <div className="ph-scroll">
        <Stage input={stage?.input ?? null} short tone={banner.tone} keep={lost ? '.ph-calls' : '.ph-steps'} name={null} foot={placeWord(inc, d)} legend={ghost ? <GhostLegend /> : null} />
        {/* 이탈 의심: 신고 전화가 먼저 (누르면 전화). 그 밖: 할 일이 먼저 (무대 바로 아래, 첫 화면에 1단계가 보인다), 값 칸은 그 아래 */}
        {lost && (
          <div className="ph-list ph-calls">
            {REPORT_PHONES.map((p) => (
              <ListRow key={p.phone} icon={<Phone size={22} strokeWidth={2} />} title={p.road + ' ' + p.phone} caption={p.label + ' · 누르면 전화합니다'} href={'tel:' + p.phone.replace(/-/g, '')} />
            ))}
          </div>
        )}
        <Head
          title="순서대로"
          caption={
            resolved
              ? (lost ? '확인 ' : '조치 ') + clock(inc.resolvedAt!) + (note ? ' · ' + note.steps.filter((s) => s.done).length + ' / ' + note.steps.length + ' 확인' : '')
              : done + ' / ' + steps.length + ' 확인'
          }
        />
        <div className="ph-list ph-steps">
          {shown.map((s, i) => (
            <CheckRow
              key={i}
              badge={i + 1}
              badgeTone={s.tone}
              title={s.title}
              caption={note && !note.steps[i]?.done ? '확인 안 함으로 기록됨' : s.caption}
              checked={note ? !!note.steps[i]?.done : !!checked[i]}
              onToggle={canAct ? () => setChecked((c) => steps.map((_, k) => (k === i ? !c[k] : !!c[k]))) : undefined}
            />
          ))}
        </div>
        {lost ? null : (
          <div className="ph-tiles c3 gap-top">
            <Tile
              tone="red"
              icon={<Activity size={16} strokeWidth={2} />}
              name={hitWord(d?.dir)}
              value={e.peakG !== null ? e.peakG.toFixed(2) : '—'}
              unit="g"
              bar={e.peakG !== null ? { ratio: e.peakG / 1.2, mark: e.limitG / 1.2 } : null}
            />
            <Tile tone="neutral" icon={<Gauge size={16} strokeWidth={2} />} name={limitShort(crit)} value={e.limitG.toFixed(2)} unit="g" bar={{ ratio: e.limitG / 1.2, mark: crit / 1.2 }} />
            <Tile
              tone={e.measured ? (e.shiftMm && e.shiftMm >= 30 ? 'red' : 'neutral') : 'neutral'}
              icon={<Move size={16} strokeWidth={2} />}
              name="짐 이동"
              value={e.measured ? (e.shiftMm && e.shiftMm >= 5 ? Math.max(1, Math.round(e.shiftMm / 10)) : 0) : '모름'}
              unit={e.measured ? 'cm' : undefined}
              cap={e.measured ? (e.shiftMm && e.shiftMm >= 5 ? (shiftDirNow ? SHIFT_WORD[shiftDirNow] : '움직임') : '제자리') : '키트 없음'}
            />
          </div>
        )}
        {/* 도움말은 화면에 한 줄만 (조치할 수 없는 까닭 > 키트 없는 추정 > 움직인 방향 > 체크 안 한 단계) */}
        {helper && <p className="ph-note">{helper}</p>}
        {!e.measured && !lost && (
          <>
            <Head title="짐이 실제로 밀렸나요?" />
            <div className="ph-pad">
              <Segmented
                label="짐이 실제로 밀렸나요"
                items={[
                  { id: 'yes', label: '밀림 있음' },
                  { id: 'no', label: '없음' },
                ]}
                value={inc.moved === null ? null : inc.moved ? 'yes' : 'no'}
                onChange={(x) => canAct && reportMoved(x === 'yes')}
              />
            </div>
          </>
        )}
        <Head title={lost ? '남은 짐 사진' : '조인 뒤 사진'} caption={after.length ? after.length + '장' : null} />
        <div className="ph-pad">
          <PhotoCell
            src={lastAfter?.dataUrl ?? null}
            title={canAct ? (lost ? '남은 짐 사진 찍기' : '조인 뒤 사진 찍기') : '사진 없음'}
            tag={lastAfter ? (lost ? '남은 짐 · ' : '조인 뒤 · ') + clock(lastAfter.at) : undefined}
            onTake={canAct ? photo.open : () => undefined}
            onView={lastAfter ? () => openViewer(lastAfter.dataUrl, (lost ? '남은 짐 · ' : '조인 뒤 · ') + clock(lastAfter.at)) : undefined}
          />
        </div>
      </div>
      {canAct && (
        <Fixed>
          <Primary onClick={finish} disabled={driving}>
            {driving ? '정차한 뒤에 기록합니다' : lost ? '확인했어요' : '다시 조였어요'}
          </Primary>
        </Fixed>
      )}
      {photo.input}
    </div>
  )
}
