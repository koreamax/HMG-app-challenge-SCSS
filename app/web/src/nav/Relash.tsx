/**
 * 4.4 내비 · 다시 묶기 (사건 뒤 정차). 4.1 틀 그대로, 다른 것만:
 *   띠 '다시 묶기' · 할 일 '뒤 바부터 다시 조이세요' / '짐이 앞으로 35 cm 밀렸습니다 · 14:32 졸음쉼터 A' · 단추 '다시 조였어요'. 테두리 빨강 6 px 숨쉬기.
 *   무대: 가까이, 풀린 바 빨강 · 조일 바 주황, 순서 배지, 출발 때 자리 점선, 화살 + '앞으로 35 cm' (키트 없음: 점선 · 화살 없음).
 *   칸: 방금 받은 제동 · 버티는 제동 · 짐 이동 (키트 없음 '모름') · 사건 시각 / 위치.
 *   오른 단: 순서대로 할 일 -> (키트 없음) '짐이 실제로 밀렸나요?' -> '사진은 휴대폰 알림에서 붙입니다'.
 *   짐 이탈 의심: 할 일 셋, 칸 둘 다음 자리에 신고 전화 줄 둘 (고속도로 1588-2504 / 일반 도로 112, 누르면 전화), 단추 '확인했어요'.
 */
import { useMemo } from 'react'
import { Check, ChevronRight, Phone } from 'lucide-react'
import type { Tone } from '@/engine/limit'
import { REPORT_PHONES } from '@/engine/lines'
import { app, relashDone, reportMoved } from '@/runtime/runtime'
import { useStore } from '@/runtime/store'
import { relashOrder, stageInput } from '@/three/bed-input'
import { BAR_NAME, clock, DIR_WORD, fmtG, placeText, SHIFT_WORD, shiftWords } from '@/ui/format'
import { Button, celebrate, ChecklistRow, Tile } from '@/ui/parts'
import { Banner, ParkFrame, Stage } from './Frame'
import { useAlert, useKit, useParkShape, useVerdict } from './hooks'
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
  const stage = useMemo(() => stageInput({ load, verdict: v, kit, alert: a, mode: view === 'kit' ? 'kit' : 'relash' }), [load, v, kit, a, view])
  // 기준을 막대 아래에 두는 것은 오른 단 칸 2 x 2 (side) 만. 낮은 넓은 창은 칸 넷이 무대 아래 한 줄이라 기준을 이름 오른쪽에
  const below = useParkShape() === 'side'
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
    alt = '짐이 떨어졌을 수 있습니다 · ' + when
  } else if (!a.measured) {
    todo = '바를 당겨 느슨한지 확인하세요'
    alt = '방금 짐에 큰 힘이 걸렸습니다 · ' + when
  } else {
    todo = order.length ? barName(order[0]) + '부터 다시 조이세요' : '바를 거세요'
    const sw = shiftWords(a.shiftMm, a.shiftDir)
    if (a.kind === 'moved' && sw) alt = '짐이 ' + sw + ' 밀렸습니다 · ' + when
    else {
      const both = a.loose.c1 && a.loose.c2
      const one = a.loose.c1 ? BAR_NAME.c1 : a.loose.c2 ? BAR_NAME.c2 : '바'
      alt = (both ? '바가' : one + '가') + ' 느슨해졌습니다 · ' + when
    }
  }
  const banner = <Banner tone="red" word={word} todo={todo} alt={alt} action={{ label: lost ? '확인했어요' : '다시 조였어요', onClick: () => (celebrate(lost ? '확인한 것을 기록했습니다' : '다시 조인 것을 기록했습니다'), relashDone()) }} />

  // ── 칸 ──
  const peakName = '방금 받은 ' + (a.dir ? DIR_WORD[a.dir] : '힘')
  const shiftCm = a.shiftMm ? Math.round(a.shiftMm / 10) : 0
  const tiles = (
    <>
      <Tile
        tone="red"
        captionBelow={below}
        name={peakName}
        caption={a.measured ? '키트' : '추정'}
        value={a.peakG !== null ? fmtG(a.peakG) : '—'}
        unit={a.peakG !== null ? 'g' : undefined}
        sub={a.measured ? '적재함 가속 (키트)' : '속도 변화로 추정'}
        ratio={a.peakG !== null ? a.peakG / 1.2 : null}
        mark={a.limitG / 1.2}
      />
      <Tile
        tone="neutral"
        captionBelow={below}
        name="버티는 제동"
        caption={'기준 ' + fmtG(v.crit) + ' g'}
        value={fmtG(a.limitG)}
        unit="g"
        sub={a.peakG !== null && a.peakG > a.limitG ? fmtG(a.peakG - a.limitG) + ' g 넘었습니다' : '받은 힘과 견준 값'}
        ratio={a.limitG / 1.2}
        mark={v.crit / 1.2}
      />
      {lost ? (
        // 신고 번호는 값 칸이 아니라 누르는 전화 줄 (폰 사건 화면과 같은 짜임): [전화 아이콘][도로 번호 / 받는 곳 · 누르면 전화합니다][›]
        <div className="nv-calls" role="group" aria-label="신고 전화">
          {REPORT_PHONES.map((p) => (
            <a key={p.phone} className="nv-call" href={'tel:' + p.phone.replace(/-/g, '')} aria-label={p.road + ' ' + p.label + ' ' + p.phone + ' 전화 걸기'}>
              <span className="ic" aria-hidden="true">
                <Phone strokeWidth={2} />
              </span>
              <span className="tx">
                <b>
                  {p.road} <span className="tnum">{p.phone}</span>
                </b>
                <span>
                  {p.label}
                  <span className="hint"> · 누르면 전화합니다</span>
                </span>
              </span>
              <ChevronRight className="chev" strokeWidth={2} aria-hidden="true" />
            </a>
          ))}
        </div>
      ) : (
        <>
          <Tile
            tone={a.measured && (a.shiftMm ?? 0) >= 30 ? 'red' : 'neutral'}
            captionBelow={below}
            name="짐 이동"
            caption={a.measured ? (a.shiftDir && shiftCm ? SHIFT_WORD[a.shiftDir] : '제자리') : '키트 없음'}
            value={a.measured ? shiftCm : '모름'}
            unit={a.measured ? 'cm' : undefined}
            sub={a.measured ? '짐 태그가 잰 거리' : '키트가 있으면 잽니다'}
          />
          <Tile tone="neutral" captionBelow={below} name="사건" caption={waypoint ?? undefined} value={clock(a.wallMs)} sub={placeText(a.place) ?? undefined} />
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
      <div className="nv-rhead">
        <span>
          순서대로
          {lost && <em>신고가 먼저</em>}
        </span>
        <small className="tnum">{doneN + ' / ' + list.length}</small>
      </div>
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

  return <ParkFrame dense banner={banner} stage={<Stage input={stage.input} name={stage.name} />} tiles={tiles} right={right} edge={<div className="nv-edge breathe" aria-hidden="true" />} />
}
