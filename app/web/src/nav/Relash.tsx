/**
 * 4.4 내비 · 다시 묶기 (사건 뒤 정차). 4.1 틀 그대로, 다른 것만:
 *   띠 '다시 묶기' · 할 일 '뒤 바부터 다시 조이세요' / '짐이 앞으로 35 cm 밀렸습니다 · 14:32 졸음쉼터 A' · 단추 '다시 조였어요'. 테두리 빨강 6 px 숨쉬기.
 *   무대: 가까이, 풀린 바 빨강 · 조일 바 주황, 순서 배지, 출발 때 자리 점선, 화살 + '앞으로 35 cm' (키트 없음: 점선 · 화살 없음).
 *   칸: 방금 받은 제동 · 버티는 제동 · 짐 이동 (키트 없음 '모름') · 사건 시각 / 위치.
 *   오른 단: 순서대로 할 일 -> (키트 없음) '짐이 실제로 밀렸나요?' -> '사진은 휴대폰 알림에서 붙입니다'.
 *   짐 이탈 의심: 할 일 셋, 칸 둘 다음 자리에 신고 전화 줄 둘 (고속도로 1588-2504 / 일반 도로 112, 누르면 전화), 단추 '확인했어요'.
 */
import { useMemo } from 'react'
import { Activity, Check, ChevronRight, Clock, MoveHorizontal, Phone } from 'lucide-react'
import type { Tone } from '@/engine/limit'
import { REPORT_PHONES } from '@/engine/lines'
import { app, relashDone, reportMoved } from '@/runtime/runtime'
import { useStore } from '@/runtime/store'
import { relashOrder, stageInput } from '@/three/bed-input'
import { BAR_NAME, clock, DIR_WORD, fmtG, placeText, SHIFT_WORD, shiftWords } from '@/ui/format'
import { Button, celebrate, ChecklistRow, GGaugeIcon } from '@/ui/parts'
import { Banner, Kpi, PanelHead, ParkFrame, Progress, Stage } from './Frame'
import { useAlert, useKit, useVerdict } from './hooks'
import { Park } from './Park'
import { toggleStep, useNav } from './state'

type Step = { title: string; caption?: string; tone: Tone }

export function Relash() {
  const load = useStore(app, (s) => s.load)
  const v = useVerdict()
  const a = useAlert()
  const kit = useKit()
  const view = useNav((s) => s.view)
  const steps = useNav((s) => s.steps)
  const waypoint = useStore(app, (s) => s.waypoint?.name ?? null)
  // 키트 없는 판정 뒤 기사가 누른 '밀림 있음 · 없음' (이 사건 뒤의 마지막 것)
  const at = a?.wallMs ?? 0
  const fed = useStore(app, (s) => {
    const e = s.waybill?.entries ?? []
    for (let i = e.length - 1; i >= 0; i--) {
      const x = e[i]
      if (x.at < at) break
      if (x.kind === 'feedback') return x.moved ? 'yes' : 'no'
    }
    return 'none'
  })
  const stage = useMemo(() => {
    const out = stageInput({ load, verdict: v, kit, alert: a, mode: view === 'kit' ? 'kit' : 'relash' })
    // '흐린 상자는 출발 때 자리' 설명은 흐린 상자에 붙는 정보 칩 하나로 (§11.5-4). 그 자리에 이미 상태 칩이 있으면 (짐 이탈) 붙이지 않는다
    const tags = out.input.tags ?? []
    if (view !== 'kit' && out.name === '흐린 상자는 출발 때 자리' && !tags.some((t) => t.at.kind === 'start'))
      return { ...out, input: { ...out.input, tags: [...tags, { id: 'i-start', text: '출발 때 자리', title: '출발 때 자리', tone: 'neutral' as const, at: { kind: 'start' as const }, side: 'left' as const }] } }
    return out
  }, [load, v, kit, a, view])
  if (!load || !v || !a) return <Park />

  const lost = a.kind === 'lost'
  const where = waypoint ?? placeText(a.place) ?? ''
  const when = clock(a.wallMs) + (where ? ' ' + where : '')
  const n = Math.max(0, load.belts)
  const barName = (i: number) => {
    const s = v.tensions[i]?.sensor
    if (s && n <= 2) return BAR_NAME[s]
    if (i === 0) return '앞 바'
    if (i === n - 1) return '뒤 바'
    return n === 3 ? '가운데 바' : i + 1 + '번째 바'
  }

  // ── 띠 ──
  let word = '다시 묶기'
  let todo: string
  let alt: string
  const order = relashOrder(load, v, a)
  if (lost) {
    word = '짐 이탈 의심'
    todo = '안전한 곳에 세우고 신고하세요'
    alt = '짐이 떨어졌을 수 있습니다'
  } else if (!a.measured) {
    todo = '바를 당겨 느슨한지 확인하세요'
    alt = '방금 짐에 큰 힘이 걸렸습니다'
  } else {
    todo = order.length ? barName(order[0]) + '부터 다시 조이세요' : '바를 거세요'
    const sw = shiftWords(a.shiftMm, a.shiftDir)
    if (a.kind === 'moved' && sw) alt = '짐이 ' + sw + ' 밀렸습니다'
    else {
      const both = a.loose.c1 && a.loose.c2
      const one = a.loose.c1 ? BAR_NAME.c1 : a.loose.c2 ? BAR_NAME.c2 : '바'
      alt = (both ? '바가' : one + '가') + ' 느슨해졌습니다'
    }
  }
  // 시각 · 장소는 한 줄 뒤에 따로 넘긴다 (낮은 창에서는 지표 줄의 '사건' 칸이 같은 것을 보이므로 판정 판에서 뺀다)
  const banner = <Banner tone="red" word={word} todo={todo} alt={alt} when={when} action={{ label: lost ? '확인했어요' : '다시 조였어요', onClick: () => (celebrate(lost ? '확인한 것을 기록했습니다' : '다시 조인 것을 기록했습니다'), relashDone()) }} />

  // ── 칸 ──
  const peakName = '방금 받은 ' + (a.dir ? DIR_WORD[a.dir] : '힘')
  const shiftCm = a.shiftMm ? Math.round(a.shiftMm / 10) : 0
  const tiles = (
    <>
      <Kpi
        tone="red"
        icon={<Activity />}
        name={peakName}
        caption={a.measured ? '키트' : '추정'}
        value={a.peakG !== null ? fmtG(a.peakG) : '—'}
        unit={a.peakG !== null ? 'g' : undefined}
        ratio={a.peakG !== null ? a.peakG / 1.2 : null}
        mark={a.limitG / 1.2}
      />
      <Kpi icon={<GGaugeIcon />} name="버티는 제동" value={fmtG(a.limitG)} unit="g" ratio={a.limitG / 1.2} mark={v.crit / 1.2} markText={'기준 ' + fmtG(v.crit) + ' g'} />
      {lost ? (
        // 신고 번호는 값 칸이 아니라 누르는 전화 줄: [전화 아이콘 동그라미][도로 이름 / 번호]
        <div className="nv-calls" role="group" aria-label="신고 전화">
          {REPORT_PHONES.map((p) => (
            <a key={p.phone} className="nv-call" href={'tel:' + p.phone.replace(/-/g, '')} aria-label={p.road + ' ' + p.label + ' ' + p.phone + ' 전화 걸기'}>
              <span className="ic" aria-hidden="true">
                <Phone strokeWidth={2} />
              </span>
              <span className="tx">
                <span>{p.road}</span>
                <b className="tnum">{p.phone}</b>
              </span>
              <ChevronRight className="chev" strokeWidth={2} aria-hidden="true" />
            </a>
          ))}
        </div>
      ) : (
        <>
          <Kpi
            tone={a.measured && (a.shiftMm ?? 0) >= 30 ? 'red' : 'neutral'}
            icon={<MoveHorizontal />}
            name="짐 이동"
            caption={a.measured ? (a.shiftDir && shiftCm ? SHIFT_WORD[a.shiftDir] : '제자리') : '키트 없음'}
            value={a.measured ? shiftCm : '모름'}
            unit={a.measured ? 'cm' : undefined}
          />
          <Kpi icon={<Clock />} name="사건" caption={waypoint ?? placeText(a.place) ?? null} value={clock(a.wallMs)} />
        </>
      )}
    </>
  )

  // ── 순서대로 ──
  let list: Step[]
  if (lost)
    list = [
      { title: '비상등 켜고 세우기', caption: '안전한 곳에 세우세요', tone: 'red' },
      { title: '떨어진 짐은 신고', caption: '직접 줍지 마세요', tone: 'red' },
      { title: '남은 짐의 바 확인', caption: '느슨하면 다시 조이기', tone: 'red' },
    ]
  else if (!a.measured)
    list = [
      { title: '바를 손으로 당겨 보기', caption: '느슨한 바는 다시 조이기', tone: 'orange' },
      { title: '짐이 밀렸는지 보기', caption: '밀렸으면 제자리로', tone: 'orange' },
    ]
  else {
    list = order.slice(0, a.kind === 'moved' ? 2 : 3).map((i, k) => {
      const s = v.tensions[i]?.sensor
      const loose = !!s && a.loose[s]
      return { title: barName(i) + ' 다시 조이기', caption: loose ? '키트가 풀림을 잡은 바' : k === 0 && a.kind === 'moved' ? '짐이 밀린 반대쪽부터' : '당겨서 단단히', tone: loose ? 'red' : 'orange' }
    })
    if (a.kind === 'moved') list.push({ title: '짐 제자리 확인', caption: '다음 하차 때 제자리로', tone: 'orange' })
  }
  const key = String(a.at)
  const doneN = list.filter((_, i) => !!steps[key + ':' + i]).length
  const right = (
    <>
      <PanelHead title="순서대로" className="nv-rhead">
        {lost && <em>신고가 먼저</em>}
        <Progress done={doneN} total={list.length} />
        <small className="tnum">{doneN + ' / ' + list.length}</small>
      </PanelHead>
      <div className="nv-rows jj-stagger">
        {list.map((s, i) => (
          <ChecklistRow key={i} badge={i + 1} badgeTone={s.tone} title={s.title} caption={s.caption} checked={!!steps[key + ':' + i]} onToggle={() => toggleStep(key + ':' + i)} />
        ))}
      </div>
      {!lost && !a.measured && (
        <div className="nv-ask">
          <b>짐이 실제로 밀렸나요?</b>
          {fed === 'none' ? (
            <div className="pair">
              <Button onClick={() => reportMoved(true)}>밀림 있음</Button>
              <Button onClick={() => reportMoved(false)}>없음</Button>
            </div>
          ) : (
            <div className="done">
              <Check strokeWidth={2.6} />
              {fed === 'yes' ? '밀림 있음으로 기록했습니다' : '밀림 없음으로 기록했습니다'}
            </div>
          )}
        </div>
      )}
      <p className="nv-note">{lost ? '회사에 바로 알립니다 · 사진은 폰에서' : '사진은 휴대폰 알림에서 붙입니다'}</p>
    </>
  )

  // 높은 창: 오른 단 순서 판 아래에 방금 받은 힘 판 (받은 · 버틴 · 기준을 한 눈금 위에). 아래 줄 카드는 없다 (무대가 바닥까지: 조일 바가 크게 보인다)
  const extra = <ForcePanel peak={a.peakG} held={a.limitG} crit={v.crit} measured={a.measured} />

  return <ParkFrame dense banner={banner} stage={<Stage input={stage.input} />} tiles={tiles} right={right} extra={extra} edge={<div className="nv-edge breathe" aria-hidden="true" />} />
}

/**
 * 방금 받은 힘 (높은 창의 오른 단, 순서 판 아래): 가로 눈금 0 … 1.2 g 위에 받은 힘 (상태 색) · 버틴 힘 (강조 색 점) · 기준 (둘째 강조 색 눈금),
 * 그 아래 값 세 줄. 값은 화면이 이미 쓰는 a.peakG · a.limitG · v.crit 뿐
 */
function ForcePanel({ peak, held, crit, measured }: { peak: number | null; held: number; crit: number; measured: boolean }) {
  const MAX = 1.2
  const pos = (g: number) => Math.max(0, Math.min(1, g / MAX)) * 100 + '%'
  return (
    <section className="nv-card force" aria-label="방금 받은 힘">
      <PanelHead title="방금 받은 힘">
        <span className="meta">{measured ? '키트' : '추정'}</span>
      </PanelHead>
      <div className="track" aria-hidden="true">
        {peak !== null && <i className="fill" style={{ width: pos(peak) }} />}
        <s style={{ left: pos(crit) }} />
        <i className="pt held" style={{ left: pos(held) }} />
        {peak !== null && <i className="pt peak" style={{ left: pos(peak) }} />}
      </div>
      <div className="legend">
        <span className="peak">
          <i />
          받은 힘<b className="tnum">{peak !== null ? fmtG(peak) + ' g' : '—'}</b>
        </span>
        <span className="held">
          <i />
          버틴 힘<b className="tnum">{fmtG(held) + ' g'}</b>
        </span>
        <span className="crit">
          <i />
          기준<b className="tnum">{fmtG(crit) + ' g'}</b>
        </span>
      </div>
    </section>
  )
}
