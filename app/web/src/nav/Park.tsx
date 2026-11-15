/**
 * 4.1 내비 · 정차 3D 확인 (v5 대시보드 트윈, §11.4). 지표 줄(버티는 제동 · 짐 · 벨트 · 앞벽) → 3D 무대 (+ 아래 줄 카드: 계산 근거 · 짐 종류) · 오른 단 판정 판 · 할 일 판(눈으로 확인) · 벨트 장력 판.
 * 할 일 단추는 verdict.kind 로: slide '벨트 바꾸기' · tip '넘어짐 봤어요' · none '상차 정보 넣기' · ok 버금 단추 '다 확인했어요'.
 * 3D 는 주황 판정이면 문제 표시 하나 (색을 띤 벨트 또는 더 걸 자리 띠 하나 + 상태 칩 하나, oneProblem) + 정보 칩 둘 (짐 · 벨트).
 * 지표 칸: 둥근 아이콘 · 이름 · 값. 상태는 막대 색과 이름 옆 점만 (값은 잉크색). 기준 눈금 · 기준 글은 둘째 강조 색.
 * 왜 눈으로 보는지는 판 머리의 정보 단추 뒤에 둔다 (화면에 보조 설명을 늘어놓지 않는다).
 */
import { useMemo, useState } from 'react'
import { Check, ChevronRight, Info, X } from 'lucide-react'
import { CARGO } from '@/engine/cargo'
import { BED } from '@/engine/constants'
import type { LoadInput, LoadVerdict } from '@/engine/limit'
import { app, closeWaybill, setEyeCheck, toast, unloadSome } from '@/runtime/runtime'
import { useStore } from '@/runtime/store'
import { infoChips, stageInput } from '@/three/bed-input'
import type { BedInput, BeltMark, MarkTone, StageTag } from '@/three/bed-scene'
import { fmtG, fmtN } from '@/ui/format'
import { useFrameSize } from '@/ui/Fit'
import { Button, CargoGlyph, ChecklistRow, GGaugeIcon, HeadboardIcon, StatusChip, StrapIcon, useRolled } from '@/ui/parts'
import { Banner, KindPicker, Kpi, PanelHead, ParkFrame, Progress, Stage, type BannerProps } from './Frame'
import { useAlert, useKit, useParkShape, useVerdict } from './hooks'
import { nav, openSheet, toggleDetail, useNav } from './state'

/** 눈으로 확인할 것 (엔진 eyeChecks) -> 보조 글 */
export const EYE_CAPTION: Record<string, string> = {
  넘어짐: '기울지 않게 묶였나요',
  '고리 체결': '고리가 적재함에 걸렸나요',
  '모서리 보호대': '짐 모서리에 대었나요',
}
/** 초록 판정 머리의 할 일 줄 ('고리 · 모서리만 눈으로 확인') */
const EYE_SHORT: Record<string, string> = { 넘어짐: '넘어짐', '고리 체결': '고리', '모서리 보호대': '모서리' }

/**
 * 눈으로 확인할 것 (정차 화면 · 눈으로 확인 시트가 같이 쓴다). 넘어짐 확인 판정은 머리의 주 단추가 그 일을 하므로 뺀다
 * (같은 일을 두 번 묻지 않는다)
 */
export function useEyeChecks() {
  const load = useStore(app, (s) => s.load)
  const v = useVerdict()
  const eye = useStore(app, (s) => s.eyeChecks)
  const judged = !!load && !!v && v.kind !== 'none'
  const checks = judged ? v!.eyeChecks.filter((k) => !(v!.kind === 'tip' && k === '넘어짐')).slice(0, 3) : []
  const doneN = checks.filter((k) => !!eye[k]).length
  return { checks, eye, doneN, green: judged && v!.tone === 'green' }
}

const hot = (t: MarkTone | undefined) => t === 'orange' || t === 'red'
/**
 * 정차 3D 확인의 문제 표시는 하나: 주황 · 빨강 판정이면 색을 띤 벨트(또는 더 걸 자리 띠) 꼭 하나 + 꼬리표 하나.
 * 장면 입력에 문제 벨트가 여럿이면 꼬리표가 가리키는 것 하나만 남기고, 하나도 없으면 할 일에 맞춰 하나 만든다.
 */
function oneProblem(input: BedInput, v: LoadVerdict, load: LoadInput): BedInput {
  if (input.empty || !hot(v.tone)) return input
  const tags = input.tags ?? []
  const tagged = tags.filter((t) => t.at.kind === 'belt' && hot(t.tone)).sort((a, b) => (a.tone === 'red' ? 0 : 1) - (b.tone === 'red' ? 0 : 1))[0]
  const keep = tagged && tagged.at.kind === 'belt' ? tagged.at.index : input.belts.findIndex((b) => hot(b.tone))
  const map: number[] = []
  const belts: BeltMark[] = []
  input.belts.forEach((b, i) => {
    if (b.hint && i !== keep) return void (map[i] = -1)
    map[i] = belts.length
    belts.push(hot(b.tone) && i !== keep ? { ...b, tone: 'neutral' } : b)
  })
  let out: StageTag[] = tags
    .filter((t) => t.at.kind !== 'belt' || (map[t.at.index] >= 0 && (!hot(t.tone) || t.at.index === keep)))
    .map((t) => (t.at.kind === 'belt' ? { ...t, at: { kind: 'belt' as const, index: map[t.at.index] } } : t))
  if (keep < 0) {
    const n = belts.length
    const extra = v.extraBelts ?? 0
    if (v.kind === 'slide' && load.beltType === 'ratchet' && (n === 0 || (extra >= 1 && extra <= 4))) {
      // 더 걸 자리 띠 하나 (가운데) + '여기에 바 … 더'
      const at = Math.ceil(n / 2)
      belts.splice(at, 0, { tone: 'orange', hint: true })
      out = out.map((t) => (t.at.kind === 'belt' && t.at.index >= at ? { ...t, at: { kind: 'belt' as const, index: t.at.index + 1 } } : t))
      const text = n === 0 ? '여기에 바 걸기' : extra === 1 ? '여기에 바 하나 더' : '여기에 바 ' + extra + '개 더'
      out.push({ id: 'hint', text, tone: 'orange', icon: 'plus', at: { kind: 'belt', index: at }, side: 'right' })
    } else if (n > 0) {
      // 벨트 하나를 판정 색으로 + 할 일 한 마디
      const at = Math.floor((n - 1) / 2)
      belts[at] = { ...belts[at], tone: v.tone === 'red' ? 'red' : 'orange' }
      // 머리 글을 되풀이하지 않는 짧은 한 마디 (무엇이 문제인 띠인지)
      const text = load.beltType === 'rubber' ? '고무바 → 라쳇' : v.kind === 'tip' ? EYE_CAPTION['넘어짐'] : '장력 모자람'
      out.push({ id: 'problem', text, tone: v.tone === 'red' ? 'red' : 'orange', icon: 'belt', at: { kind: 'belt', index: at }, side: 'right' })
    }
  }
  return { ...input, belts, tags: out }
}

export function Park() {
  const load = useStore(app, (s) => s.load)
  const v = useVerdict()
  const kit = useKit()
  const alert = useAlert()
  const view = useNav((s) => s.view)
  const detail = useNav((s) => s.detail)
  const hasWaybill = useStore(app, (s) => !!s.waybill)
  const stage = useMemo(() => {
    const out = stageInput({ load, verdict: v, kit, alert, mode: view === 'kit' ? 'kit' : 'park' })
    // 센서 키트 보기는 잰 값이 목적이라 그대로. 3D · 위에서 보기는 문제 표시 하나 + 정보 칩 (짐 · 벨트) + 고른 짐 테두리
    if (view === 'kit' || !load || !v) return out
    const one = oneProblem(out.input, v, load)
    return { ...out, input: { ...one, rim: true, tags: [...(one.tags ?? []), ...infoChips(one, v, load)] } }
  }, [load, v, kit, alert, view])
  const rolled = useRolled(v?.limit ?? 0)
  const shape = useParkShape()
  const { H } = useFrameSize()
  const { checks, eye, doneN } = useEyeChecks()

  const judged = !!load && !!v && v.kind !== 'none'
  const tone = judged ? v!.tone : 'grey'
  const kind = judged ? v!.kind : 'none'
  const allSeen = checks.length > 0 && doneN === checks.length
  let action: BannerProps['action'] = null
  if (kind === 'slide') action = { label: '벨트 바꾸기', onClick: () => openSheet('load') }
  else if (kind === 'tip') action = { label: eye['넘어짐'] ? '넘어짐 확인함' : '넘어짐 봤어요', onClick: () => setEyeCheck('넘어짐', true), disabled: !!eye['넘어짐'] }
  else if (kind === 'none') action = { label: '상차 정보 넣기', onClick: () => openSheet('load') }
  // 초록: 남은 일은 눈으로 확인뿐. 주 단추 색 없이 버금 단추 하나로 (다 봤으면 한 번에 체크)
  else if (kind === 'ok' && checks.length) action = { label: allSeen ? '확인 끝' : '다 확인했어요', onClick: () => checks.forEach((k) => setEyeCheck(k, true)), disabled: allSeen, quiet: true }
  // 한 화면에 같은 말은 한 번: 머리 글이 할 일 카드의 항목을 다시 말하면 머리에서 뺀다 ('고리 체결은 눈으로 확인하세요' 등)
  const said = (t: string | null | undefined) => !!t && checks.some((k) => t.includes(k))
  let todo = judged ? (said(v!.action) ? null : v!.action) : '상차 정보를 입력하세요'
  const alt = judged ? (said(v!.alt) ? null : v!.alt) : '짐 종류 · 무게 · 벨트 수 · 앞벽, 10초면 끝납니다'
  // 초록 판정도 할 일 줄은 늘 찬다 (머리 박자가 판정마다 같게): 카드 항목 이름을 줄여 한 줄로
  if (kind === 'ok' && !todo && checks.length) todo = allSeen ? '눈으로 확인까지 마쳤습니다' : checks.map((k) => EYE_SHORT[k] ?? k).join(' · ') + '만 눈으로 확인'
  const banner = <Banner tone={tone} word={judged ? v!.title : '판정 불가'} todo={todo} alt={alt} action={action} />

  const toLoad = () => openSheet('load')
  const spec = load ? CARGO[load.kind] : null
  const lowEnough = spec ? spec.size.h <= BED.wallH : true
  const tiles = (
    <>
      <Kpi
        tone={judged ? tone : 'neutral'}
        icon={<GGaugeIcon />}
        name="버티는 제동"
        value={judged ? rolled : '—'}
        unit={judged ? 'g' : undefined}
        ratio={judged ? v!.limit / 1.2 : null}
        mark={judged ? v!.crit / 1.2 : null}
        markText={judged ? '기준 ' + fmtG(v!.crit) + ' g' : null}
        selected={detail}
        onClick={judged ? toggleDetail : undefined}
        label="버티는 제동 자세히"
      />
      <Kpi icon={<CargoGlyph kind={load?.kind ?? 'box'} />} name="짐" caption={spec ? spec.label : null} value={load ? load.massKg : '—'} unit={load ? 'kg' : undefined} onClick={toLoad} label="짐 고치기" />
      <Kpi
        icon={<StrapIcon />}
        name="벨트"
        caption={load ? (load.beltType === 'ratchet' ? '라쳇' : '고무바·로프') : null}
        value={load ? load.belts : '—'}
        unit={load ? '개' : undefined}
        onClick={toLoad}
        label="벨트 고치기"
      />
      <Kpi
        icon={<HeadboardIcon />}
        name="앞벽"
        caption={load ? (load.frontWall ? (lowEnough ? '앞벽이 받음' : '짐이 더 높음') : lowEnough ? '붙이면 기준 0.50' : '키 큰 짐') : null}
        value={load ? (load.frontWall ? '붙임' : '안 붙임') : '—'}
        onClick={toLoad}
        label="앞벽 고치기"
      />
    </>
  )

  const endTrip = () => {
    closeWaybill()
    nav.set({ loadDismissed: false })
    toast('운행을 마쳤습니다 · 기록에 남겼습니다')
  }
  const right = <EyeCard />
  // row 인데 창이 조금 높으면 (1920 x 800 쯤부터) 눈으로 확인 줄 대신 체크 줄을 다 편다: 판정 판은 내용 높이가 되고 빈 면이 남지 않는다.
  //   오른 단 = 가장자리 48 + 도구 줄 76 + 판정 판 252 (할 일이 두 줄이면 + 37) + 짐 종류 88 + 버금 단추 76 + 사이 16 x 4 + 할 일 판 (머리 48 + 줄 64 x n + 8)
  const full = shape === 'row' && checks.length > 0 && H >= 780 && H >= 660 + 64 * checks.length + ((todo?.length ?? 0) > 14 ? 37 : 0)
  // 1920 x 720 (row): 오른 단은 [판정 판 -> 짐 종류 줄 -> 눈으로 확인 줄 -> 버금 단추]. 눈으로 확인 줄을 누르면 같은 판이 시트로
  const summary =
    shape === 'row' && !full ? (
      <button type="button" className="nv-sum" onClick={() => openSheet('checks')} disabled={!checks.length} aria-label={'눈으로 확인 ' + doneN + ' / ' + checks.length + ' 열기'}>
        <i className="tri" aria-hidden="true" />
        <b>눈으로 확인</b>
        {checks.length > 0 ? (
          <>
            <Progress done={doneN} total={checks.length} />
            <small className="tnum">
              {allSeen ? <Check strokeWidth={2.6} aria-hidden="true" /> : null}
              {doneN + ' / ' + checks.length}
            </small>
          </>
        ) : (
          <small>상차 정보 뒤</small>
        )}
        <ChevronRight strokeWidth={2} aria-hidden="true" />
      </button>
    ) : null
  const foot = (
    <div className="nv-foot">
      <Button onClick={unloadSome} disabled={!hasWaybill}>
        일부 내렸어요
      </Button>
      <Button onClick={endTrip} disabled={!hasWaybill}>
        운행 종료
      </Button>
    </div>
  )
  // 높은 창: 아래 줄 카드 둘 [계산 근거][짐 종류] + 오른 단 할 일 판 아래에 벨트 장력 판. 계산 근거는 낮은 창에서 무대 위에 뜨는 카드
  const side = shape === 'side'
  const strip = (
    <>
      <LimitCard />
      <KindPicker kind={load?.kind ?? null} card />
    </>
  )

  return (
    <ParkFrame
      banner={banner}
      stage={
        <Stage input={stage.input}>
          {detail && judged && !side && <LimitDetail />}
          {detail && judged && side && <LimitNote />}
        </Stage>
      }
      tiles={tiles}
      right={right}
      summary={summary}
      kinds={<KindPicker kind={load?.kind ?? null} />}
      strip={strip}
      extra={<BeltPanel />}
      foot={foot}
      full={full}
    />
  )
}

/**
 * 벨트 장력 판 (높은 창의 오른 단, 할 일 판 아래 남는 높이): 벨트마다 세로 막대 (폭 28, 판 폭에 고르게 편다) + 값.
 * 키트가 잰 값 = 강조 색 채움, 추정값 = 강조 색 테두리 + 옅은 강조 면 (18 %), 고무바 = 흐린 점선 테두리 (계산에 넣지 않는 띠).
 * 필요 장력 = 둘째 강조 색 점선, 그 오른쪽 끝에 '기준 … N'. 값은 화면이 이미 쓰는 v.tensions · v.perBeltNeedN · v.sumT 뿐. 막대 높이는 판 높이를 따라 늘어난다
 */
function BeltPanel() {
  const v = useVerdict()
  const load = useStore(app, (s) => s.load)
  const judged = !!v && !!load && v.kind !== 'none'
  const ts = judged ? v!.tensions.slice(0, 8) : []
  const rubber = load?.beltType === 'rubber'
  const need = judged && !rubber ? v!.perBeltNeedN : null
  const top = Math.max(1, need ?? 0, ...ts.map((t) => t.n)) * 1.08
  const pct = (n: number) => Math.max(0, Math.min(100, (n / top) * 100)) + '%'
  const name = (i: number) => (i === 0 ? '앞' : i === ts.length - 1 ? '뒤' : String(i + 1))
  // 칸: 셋까지는 넓게 (막대 위에 값), 다섯까지 76, 그보다 많으면 같은 폭으로 나눈다 (값은 머리의 장력 합이 말한다)
  const n = ts.length
  const cols = { gridTemplateColumns: n <= 3 ? `repeat(${n}, 84px)` : n <= 5 ? `repeat(${n}, minmax(0, 76px))` : `repeat(${n}, minmax(0, 1fr))` }
  return (
    <section className="nv-card belts" aria-label="벨트 장력">
      <PanelHead title="벨트 장력">
        {judged && n > 0 && (
          <span className="meta tnum">
            {rubber ? '장력 합' : '장력 합 · ' + (v!.measured ? '키트' : '추정')}
            <b>{rubber ? '계산 제외' : fmtN(v!.sumT) + ' N'}</b>
          </span>
        )}
      </PanelHead>
      {n ? (
        <div className={'plot' + (n > 5 ? ' many' : '') + (need !== null ? ' has-need' : '')} role="img" aria-label={'벨트 ' + n + '개 장력'}>
          <div className="vals">
            {!rubber && n <= 3 && (
              <span className="cols" style={cols}>
                {ts.map((t, i) => (
                  <em className="tnum" key={i}>
                    {fmtN(t.n)}
                  </em>
                ))}
              </span>
            )}
          </div>
          <div className="chart">
            <span className="cols" style={cols}>
              {ts.map((t, i) => (
                <span className="area" key={i}>
                  <i className={rubber ? 'none' : t.measured ? 'meas' : 'est'} style={{ height: rubber ? '56%' : pct(t.n) }} />
                </span>
              ))}
            </span>
            {need !== null && (
              <span className="need" style={{ bottom: pct(need) }}>
                <em className="tnum">{'기준 ' + fmtN(need) + ' N'}</em>
              </span>
            )}
          </div>
          <span className="cols names" style={cols}>
            {ts.map((_, i) => (
              <span key={i}>{name(i)}</span>
            ))}
          </span>
        </div>
      ) : (
        <p className="nv-card-empty">{judged ? '벨트가 없습니다' : '상차 정보 뒤'}</p>
      )}
    </section>
  )
}

/** 계산에 들어간 값 넷 + 한 줄 문장 (아래 줄 카드 · 떠 있는 자세히 카드가 같이 쓴다) */
function useLimitFacts() {
  const v = useVerdict()
  const load = useStore(app, (s) => s.load)
  if (!v || !load || v.kind === 'none') return null
  const margin = v.limit - v.crit
  const sentence = margin >= 0 ? `기준 ${fmtG(v.crit)} g 보다 ${fmtG(margin)} g 더 버팁니다` : `기준 ${fmtG(v.crit)} g 에 ${fmtG(-margin)} g 모자랍니다`
  const cells: [string, string][] = [
    ['장력 합', fmtN(v.sumT) + ' N'],
    ['마찰계수', v.mu.toFixed(2)],
    ['벨트 각도', Math.round(v.angleDeg) + '°'],
    ['짐 무게', load.massKg + ' kg'],
  ]
  const note = (v.perBeltNeedN !== null ? '벨트당 약 ' + fmtN(Math.ceil(v.perBeltNeedN / 10)) + ' daN 이면 기준을 맞춥니다. ' : '') + (v.measured ? '장력은 키트가 잰 값입니다.' : '장력은 벨트 라벨 표준 장력의 절반으로 잡았습니다.')
  return { v, sentence, cells, note }
}

/** 계산 근거 카드 (아래 줄, 높은 창): 한 줄 문장 + 값 넷. 누르면 자세히 (버티는 제동 칸과 같은 일). inert = 누르지 않는 카드 (다시 묶기) */
export function LimitCard({ inert = false }: { inert?: boolean }) {
  const f = useLimitFacts()
  const detail = useNav((s) => s.detail)
  const head = <PanelHead title="계산 근거">{f && <span className="meta">{f.v.measured ? '키트' : '추정'}</span>}</PanelHead>
  if (!f)
    return (
      <section className="nv-card facts" aria-label="계산 근거">
        {head}
        <p className="nv-card-empty">상차 정보 뒤</p>
      </section>
    )
  const body = (
    <>
      {head}
      <strong>{f.sentence}</strong>
      <span className="cells">
        {f.cells.map(([k, val]) => (
          <span className="cell" key={k}>
            <span>{k}</span>
            <b className="tnum">{val}</b>
          </span>
        ))}
      </span>
    </>
  )
  if (inert)
    return (
      <section className="nv-card facts" aria-label="계산 근거">
        {body}
      </section>
    )
  return (
    <button type="button" className={'nv-card facts' + (detail ? ' sel' : '')} aria-pressed={detail} onClick={toggleDetail} aria-label="계산 근거 자세히">
      {body}
    </button>
  )
}

/** 자세히 설명 한 줄 (높은 창: 무대 아래 가운데, 알림 독 위) */
function LimitNote() {
  const f = useLimitFacts()
  if (!f) return null
  return (
    <div className="nv-limit-note" role="note">
      {f.note}
    </div>
  )
}

/** 눈으로 확인 카드 (오른 단 · 낮은 넓은 창의 시트가 같이 쓴다): 머리 [이름][0 / 2][정보 단추] -> 체크 줄 */
function EyeCard({ inSheet = false }: { inSheet?: boolean }) {
  const { checks, eye, doneN, green } = useEyeChecks()
  // 시트에는 자리가 있으니 정보 단추 뒤의 글을 늘 보인다
  const [infoOpen, setInfo] = useState(false)
  const info = infoOpen || inSheet
  return (
    <>
      <PanelHead title="눈으로 확인" className="nv-rhead">
        {checks.length > 0 && <Progress done={doneN} total={checks.length} />}
        {checks.length > 0 && <small className="tnum">{doneN + ' / ' + checks.length}</small>}
        {checks.length > 0 && (
          <button type="button" className="nv-info" aria-label="왜 눈으로 확인하나요" aria-expanded={info} onClick={() => setInfo((x) => !x)}>
            <Info strokeWidth={2} />
          </button>
        )}
      </PanelHead>
      {/* 초록 판정의 '계산상 기준일 뿐' 이라는 말은 정보 단추 뒤에 (카드 바닥에 늘 깔지 않는다) */}
      {info && checks.length > 0 && (
        <p className="nv-info-text">
          센서가 보지 못하는 것만 눈으로 확인합니다.
          {green && ' 계산상 기준을 넘었다고 안전이 보장되지는 않습니다.'}
        </p>
      )}
      {checks.length ? (
        <div className="nv-rows jj-stagger">
          {checks.map((k) => (
            <ChecklistRow key={k} title={k} caption={EYE_CAPTION[k]} checked={!!eye[k]} onToggle={() => setEyeCheck(k, !eye[k])} />
          ))}
        </div>
      ) : (
        <p className="nv-empty">상차 정보를 넣으면 눈으로 확인할 것이 나옵니다</p>
      )}
      {/* 눈으로 확인할 것이 없는 초록 판정만 (정보 단추가 없으니) 카드 바닥에 한 줄 */}
      {green && checks.length === 0 && <p className="nv-note">계산상 기준을 넘었다고 안전이 보장되지는 않습니다</p>}
    </>
  )
}

/** 눈으로 확인 시트 (1920 x 720 처럼 낮은 넓은 창): 오른 단 카드와 같은 내용. 다 보면 닫는다 */
export function EyeSheet({ onClose }: { onClose: () => void }) {
  const { checks, doneN } = useEyeChecks()
  return (
    <>
      <div className="nv-scrim" onClick={onClose} aria-hidden="true" />
      <section className="nv-sheet eye" role="dialog" aria-modal="true" aria-label="눈으로 확인">
        <div className="nv-sheet-head">
          <h2>
            눈으로 확인
            {checks.length > 0 && <small className="tnum">{doneN + ' / ' + checks.length}</small>}
          </h2>
          <button type="button" className="x" aria-label="닫기" onClick={onClose}>
            <X strokeWidth={2.4} />
          </button>
        </div>
        <div className="nv-right in-sheet">
          <EyeCard inSheet />
        </div>
        <div className="nv-sheet-foot">
          <Button onClick={onClose}>닫기</Button>
        </div>
      </section>
    </>
  )
}

/** 버티는 제동 자세히 (낮은 창 · 세로 창: 무대 왼쪽 위에 떠 있는 카드 하나): 계산에 들어간 값 */
function LimitDetail() {
  const f = useLimitFacts()
  if (!f) return null
  const { v } = f
  return (
    <div className={'nv-detail tone-' + v.tone} role="button" tabIndex={0} onClick={toggleDetail} aria-label="자세히 닫기">
      <div className="hd">
        버티는 제동 {fmtG(v.limit)} g
        <StatusChip tone={v.tone}>{v.title}</StatusChip>
      </div>
      <strong>{f.sentence}</strong>
      <div className="cells">
        {f.cells.map(([k, val], i) => (
          <div className="cell" key={k}>
            <span>{i === 0 ? k + ' · ' + (v.measured ? '키트' : '추정') : k}</span>
            <b>{val}</b>
          </div>
        ))}
      </div>
      <p>{f.note}</p>
    </div>
  )
}
