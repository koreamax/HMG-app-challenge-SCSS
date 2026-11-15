/**
 * 4.11 L4 허브 (운영자만). XCIENT 레벨 4 무인 화물 트럭: 운전자가 없으니 짐 고정은 허브 점검자가 다시 본다.
 * 트럭 목록(셈 칸 4개, 누르면 거름) -> 트럭 하나(판정 띠 · 무대 · 칸 3개 · 위치) -> 다음 허브 점검 정차 요청(관제 시스템) ->
 * 점검 · 승인(할 일 5개 · 사진 · 점검자). 앱은 차를 세우지 않는다. 승인은 운송장에 남는다.
 */
import { useEffect, useMemo, useState } from 'react'
import { Activity, Camera, ChevronRight, ClipboardCheck, Gauge, Info, MapPin, Move, Package, Route as RouteIcon, UserRound } from 'lucide-react'
import type { Tone } from '@/engine/limit'
import { addOperatorNote, app, relashDone } from '@/runtime/runtime'
import { useStore } from '@/runtime/store'
import { clock } from '@/ui/format'
import { hitWord, limitShort, verdictWord } from '../derive'
import { MODEL, fleet, findTruck, kitText, kitValues, liveHubKey, liveKey, retightKit, type FleetTruck } from '../fleet'
import { ACCOUNT, EMPTY_HUB, addWaybillPhoto, back, openSheet, openViewer, patchHub, phone, push, setHubFilter, showToast, type HubNote } from '../state'
import { usePhotoInput } from '../photo'
import { AppBar, Banner, CheckRow, Chip, Fixed, Head, IconCell, ListRow, Primary, Rolled, Secondary, StatusText, TONE_CLS, Tile, markExpand, type BannerData } from '../ui'
import { Stage } from './Stage'

const ORDER: Tone[] = ['red', 'orange', 'grey', 'green']
const COUNT_WORD: Record<Tone, string> = { red: '사건', orange: '고정 약함', grey: '판정 불가', green: '양호' }
/** 점검 주기 (짧게, 줄 caption 용). 자세한 기준은 허브 앱 바 (i) 시트 */
const RULE_SHORT = '3시간 · 240 km마다'

/** 지금 트럭 목록 (LIVE 는 판정 엔진 출력이 바뀔 때만 다시 만든다) */
function useFleet() {
  const key = useStore(app, liveKey)
  const hub = useStore(phone, (s) => s.hub)
  return useMemo(() => {
    const s = app.get()
    const hk = liveHubKey(s)
    return { list: fleet(s, hub, hk), liveHk: hk, hub }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, hub])
}

export function HubScreen() {
  const { list } = useFleet()
  const filter = useStore(phone, (s) => s.hubFilter)
  const counts: Record<Tone, number> = { red: 0, orange: 0, grey: 0, green: 0 }
  for (const t of list) counts[t.tone] += 1
  const shown = filter ? list.filter((t) => t.tone === filter) : list
  return (
    <div className="ph-screen">
      <AppBar
        title="허브 · 무인 트럭"
        right={
          <IconCell label="점검 기준" onClick={() => openSheet({ kind: 'rule' })}>
            <Info size={22} strokeWidth={2} />
          </IconCell>
        }
      />
      <div className="ph-counts" role="group" aria-label="상태별 트럭 수. 누르면 거릅니다">
        {ORDER.map((t) => (
          <button key={t} type="button" className={'ph-count ' + TONE_CLS[t]} aria-pressed={filter === t} onClick={() => setHubFilter(filter === t ? null : t)}>
            <b>
              <i aria-hidden />
              <Rolled value={counts[t]} digits={0} />
            </b>
            <span>{COUNT_WORD[t]}</span>
          </button>
        ))}
      </div>
      {/* 상태별 대수 비율 (4 px 막대 하나, 각 상태 색) */}
      <div className="ph-ratio" aria-hidden>
        {ORDER.map((t) => (counts[t] > 0 ? <i key={t} className={TONE_CLS[t]} style={{ flexGrow: counts[t] }} /> : null))}
      </div>
      <div className="ph-scroll">
        {filter && <div className="ph-alt">{COUNT_WORD[filter] + ' ' + shown.length + '대만 봅니다 · 다시 누르면 전체'}</div>}
        <Head title={MODEL} caption={(filter ? shown.length + ' / ' : '') + list.length + '대'} />
        <div className="ph-list">
          {shown.map((t) => (
            <TruckRow key={t.id} t={t} />
          ))}
        </div>
        {!shown.length && (
          <div className="ph-empty">
            <b>이 상태의 트럭이 없습니다</b>
          </div>
        )}
      </div>
    </div>
  )
}

function TruckRow({ t }: { t: FleetTruck }) {
  return (
    <button type="button" className={'ph-truck ' + TONE_CLS[t.tone]} onClick={(e) => (markExpand(e.currentTarget), push({ name: 'truck', id: t.id }))}>
      {/* 두 줄: [번호판 (실시간) ……… 길 · 시각] / [점 + 상태 (잉크) · 사정 (가장 중요한 값, 자르지 않음)]. 색은 10 px 점만 */}
      <span className="tx">
        <span className="l1">
          <b>{t.plate}</b>
          {t.live && <i className="live">실시간</i>}
          <em>
            <span className="rt">{t.route}</span>
            <span className="tm"> · {clock(t.sortAt)}</span>
          </em>
        </span>
        <span className="l2">
          <StatusText tone={t.tone}>{verdictWord(t.title)}</StatusText>
          <span className="why">{t.line}</span>
        </span>
      </span>
      <ChevronRight className="chev" size={20} strokeWidth={2} aria-hidden />
    </button>
  )
}

/**
 * 허브 시계: 모의 트럭은 요청 뒤 실제로 몇 초 만에 '도착'하므로, 도착 · 점검 · 승인 시각을 요청 시각 + 도착 예정(분)으로 옮겨 보인다.
 * LIVE 트럭은 시연 차가 실제로 선 시각 그대로.
 */
function hubShift(t: FleetTruck, note: HubNote): number {
  if (t.live || !note.request || !note.arrivedAt || note.request.etaMin == null) return 0
  return Math.max(0, note.request.at + note.request.etaMin * 60_000 - note.arrivedAt)
}

/** 지난 점검 승인 (LIVE 는 사건마다 key 가 달라 운송장 안에서 가장 최근 것) */
function lastApproval(t: FleetTruck, hub: Record<string, HubNote>, hk: string) {
  if (!t.live) return hub[hk]?.approval ? { ...hub[hk].approval!, at: hub[hk].approval!.at + hubShift(t, hub[hk]), hub: hub[hk].request?.hub ?? t.nextHub.name } : null
  let best: { at: number; by: string; photos: number; hub: string } | null = null
  for (const [k, v] of Object.entries(hub)) {
    if (!k.startsWith('live:' + t.waybill) || !v.approval) continue
    if (!best || v.approval.at > best.at) best = { ...v.approval, hub: v.request?.hub ?? t.nextHub.name }
  }
  return best
}

export function TruckScreen({ id }: { id: string }) {
  const { list, liveHk, hub } = useFleet()
  const mode = useStore(app, (s) => s.out?.mode ?? 'park')
  const t = findTruck(list, id)
  if (!t) {
    return (
      <div className="ph-screen">
        <AppBar title="트럭" onBack={back} />
        <div className="ph-empty">
          <b>트럭을 찾지 못했습니다</b>
        </div>
      </div>
    )
  }
  const hk = t.live ? liveHk : t.id
  const note = hub[hk] ?? EMPTY_HUB
  const ev = t.event
  const approved = lastApproval(t, hub, hk)
  const banner: BannerData = {
    tone: t.tone,
    title: verdictWord(t.title),
    todo: t.todo,
    // 보조 줄은 두지 않는다: 사건 시각은 받은 힘 칸, 장소는 '운행 · 점검' 첫 줄, 움직인 거리는 '짐 이동' 칸이 말한다 (무대에는 글이 없다)
    alt: null,
  }
  const limitTone: Tone = ev ? 'red' : t.limitG === null ? 'grey' : t.limitG < t.crit ? 'orange' : t.tone === 'green' ? 'green' : 'orange'
  const kv = kitValues(t)

  const request = () => {
    const hubName = t.nextHub.name
    patchHub(hk, { request: { at: Date.now(), hub: hubName, etaMin: t.nextHub.etaMin }, ack: null })
    if (t.live) addOperatorNote('점검 정차 요청 · ' + hubName + ' · 관제 시스템에 보냄 (앱은 차를 세우지 않음)')
    showToast('관제 시스템에 점검 정차를 요청했습니다 · ' + hubName)
  }
  const cancel = () => {
    patchHub(hk, { request: null, arrivedAt: null })
    if (t.live) addOperatorNote('점검 정차 요청 취소')
    showToast('점검 정차 요청을 취소했습니다')
  }
  const arrive = () => {
    if (!note.arrivedAt) patchHub(hk, { arrivedAt: Date.now() })
    push({ name: 'inspect', id: t.id, hk })
  }

  let fixed
  if (note.approval && !t.live) fixed = <Secondary onClick={() => push({ name: 'inspect', id: t.id, hk })}>점검 기록 보기</Secondary>
  else if (note.arrivedAt) fixed = <Primary onClick={arrive}>점검 계속하기</Primary>
  else if (note.request) {
    const ready = !t.live || mode === 'park'
    fixed = (
      <>
        <Secondary onClick={cancel}>요청 취소</Secondary>
        <Primary onClick={arrive} disabled={!ready}>
          {ready ? '허브 도착 · 점검 시작' : '허브로 가는 중 · 서면 점검'}
        </Primary>
      </>
    )
  } else if (t.tone === 'green') fixed = <Secondary onClick={request}>다음 허브에서 점검 정차 요청</Secondary>
  else
    fixed = (
      <>
        <Secondary onClick={() => openSheet({ kind: 'reason', truck: t.id })}>기록만 남기고 계속</Secondary>
        <Primary onClick={request}>다음 허브에서 점검 정차 요청</Primary>
      </>
    )

  return (
    <div className="ph-screen">
      <AppBar title={MODEL + ' · ' + t.plate} onBack={back} extra={t.live ? <Chip tone="neutral">실시간</Chip> : null} />
      <Banner data={banner} />
      <div className="ph-scroll">
        <Stage input={t.bed} short tone={t.tone} />
        <div className="ph-kpis c3">
          <Tile
            tone={ev ? 'red' : 'neutral'}
            icon={<Activity size={16} strokeWidth={2} />}
            name={hitWord(ev?.dir)}
            value={ev?.peakG != null ? ev.peakG.toFixed(2) : '—'}
            unit={ev?.peakG != null ? 'g' : undefined}
            bar={ev?.peakG != null ? { ratio: ev.peakG / 1.2, mark: ev.limitG / 1.2 } : null}
            cap={ev ? clock(ev.at) : undefined}
          />
          <Tile tone={limitTone} icon={<Gauge size={16} strokeWidth={2} />} name={limitShort(t.crit)} value={t.limitG !== null ? t.limitG.toFixed(2) : '—'} unit={t.limitG !== null ? 'g' : undefined} bar={t.limitG !== null ? { ratio: t.limitG / 1.2, mark: t.crit / 1.2 } : null} />
          <Tile
            tone={t.shiftNowMm !== null && t.shiftNowMm >= 30 ? 'red' : 'neutral'}
            icon={<Move size={16} strokeWidth={2} />}
            name="짐 이동"
            value={t.shiftNowMm !== null ? Math.max(0, Math.round(t.shiftNowMm / 10)) : '모름'}
            unit={t.shiftNowMm !== null ? 'cm' : undefined}
            cap={t.shiftNowMm === null ? '키트 없음' : t.shiftNowMm >= 5 ? '키트가 잰 값' : '제자리'}
          />
        </div>
        <Head title="운행 · 점검" />
        <div className="ph-list">
          <ListRow icon={<MapPin size={22} strokeWidth={2} />} title={t.place} caption={'다음 허브 ' + t.nextHub.name + ' · ' + t.nextHub.km + ' km · 약 ' + t.nextHub.etaMin + '분'} />
          <ListRow icon={<RouteIcon size={22} strokeWidth={2} />} title={t.route + ' · ' + t.road} caption={t.kmDone + ' / ' + t.kmTotal + ' km · ' + clock(t.departAt) + ' 출발'} />
          <ListRow icon={<Package size={22} strokeWidth={2} />} title={t.cargo} caption={t.kitWord + (kv ? ' · ' + kv : '') + (t.total ? ' · ' + t.total : '')} />
          <ListRow
            icon={<ClipboardCheck size={22} strokeWidth={2} />}
            title={approved ? '점검 승인 ' + clock(approved.at) + ' · ' + approved.by : '마지막 점검 ' + clock(t.lastCheck.at) + ' · ' + t.lastCheck.where}
            caption={approved ? approved.hub + ' · 사진 ' + approved.photos + '장 · 운송장 ' + t.waybill + '에 남음' : '점검 주기 ' + RULE_SHORT}
          />
          {note.ack && <ListRow tone="none" title={'기록만 남김 · ' + clock(note.ack.at)} caption={note.ack.reason} />}
          {note.request && (
            <ListRow
              tone="none"
              title={'점검 정차 요청 · ' + clock(note.request.at) + ' · ' + note.request.hub}
              caption={note.arrivedAt ? clock(note.arrivedAt + hubShift(t, note)) + ' ' + note.request.hub + ' 도착 · 점검 중' : '관제 시스템이 받음 · 도착 예정 약 ' + (note.request.etaMin ?? t.nextHub.etaMin) + '분'}
            />
          )}
          {t.live && <ListRow title={'운송장 ' + t.waybill} caption="이 앱의 지금 운송장 · 누르면 기록" onClick={t.waybill !== '—' ? () => push({ name: 'waybill', id: t.waybill }) : undefined} />}
        </div>
        {/* 운영 규칙(앱은 차를 세우지 않음 · 점검 주기)은 허브 첫 화면 (i) 시트에. 여기는 모의 트럭의 3D 가 예시라는 한 줄만 */}
        {!t.live && <p className="ph-note">3D 모형은 예시입니다 · 판정은 이 트럭의 무게 · 바 · 장력 값으로 합니다</p>}
      </div>
      <Fixed>{fixed}</Fixed>
    </div>
  )
}

const ITEMS = [
  { id: 'place', title: '짐 제자리', caption: '출발 때 자리로 다시 놓기' },
  { id: 'belts', title: '바 다시 조임과 키트 값', caption: '' },
  { id: 'hooks', title: '고리 체결', caption: '벨트 고리가 적재함 고리에 걸렸는지' },
  { id: 'edges', title: '모서리 보호대', caption: '벨트가 짐 모서리에 닿는 곳마다' },
] as const

export function InspectScreen({ id, hk }: { id: string; hk: string }) {
  const { list, hub } = useFleet()
  const wb = useStore(app, (s) => s.waybill)
  const tags = useStore(phone, (s) => s.photoTags)
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 15000)
    return () => window.clearInterval(t)
  }, [])
  const t = findTruck(list, id)
  const note = hub[hk] ?? EMPTY_HUB
  const photo = usePhotoInput(
    (url) => {
      if (!t) return
      if (t.live) {
        if (!addWaybillPhoto(url, 'inspect', hk)) return showToast('운송장이 없어 사진을 붙이지 못했습니다')
      } else patchHub(hk, (h) => ({ photos: [...h.photos, url] }))
      showToast('점검 사진을 붙였습니다')
    },
    (m) => showToast(m),
    'inspect',
  )
  if (!t) {
    return (
      <div className="ph-screen">
        <AppBar title="점검" onBack={back} />
        <div className="ph-empty">
          <b>트럭을 찾지 못했습니다</b>
        </div>
      </div>
    )
  }
  const photos: { src: string; at: number }[] = t.live
    ? (wb?.entries ?? []).filter((e): e is Extract<typeof e, { kind: 'photo' }> => e.kind === 'photo' && tags[(wb?.id ?? '') + ':' + e.at]?.ref === hk).map((e) => ({ src: e.dataUrl, at: e.at }))
    : note.photos.map((src, i) => ({ src, at: (note.arrivedAt ?? now) + i * 1000 }))
  const readOnly = !!note.approval
  const photosOk = photos.length >= 2
  const done = ITEMS.filter((i) => note.checks[i.id]).length + (photosOk ? 1 : 0)
  const all = done === ITEMS.length + 1
  const hubName = note.request?.hub ?? t.nextHub.name
  const shift = hubShift(t, note)
  const hubClock = (ms: number) => clock(ms + shift)
  const kv = kitValues(t)
  // 모의 트럭: 체크하면 허브에서 다시 당긴 값 (승인 뒤 엔진 판정에 쓰는 그 값)
  const beltCaption = t.kit ? (note.checks.belts && !t.live ? '다시 조인 값 · ' + kitText(retightKit(t.kit)) : '지금 키트 값 · ' + kv) : '키트 없음 · 손으로 당겨 확인'

  const approve = () => {
    const at = Date.now()
    const by = ACCOUNT.operator.name
    patchHub(hk, { approval: { at, by, photos: photos.length } })
    if (t.live) {
      relashDone()
      window.setTimeout(() => addOperatorNote('점검 끝 · 운행 재개 승인 · ' + by + ' · ' + hubName + ' · 사진 ' + photos.length + '장'), 250)
    }
    showToast('운행 재개를 승인했습니다 · 운송장에 남았습니다')
    back()
  }

  return (
    <div className="ph-screen">
      <AppBar title={'점검 · ' + t.plate} onBack={back} />
      <div className="ph-scroll">
        <div className="ph-alt">
          {hubName} · {note.arrivedAt ? hubClock(note.arrivedAt) + ' 도착' : '도착 전'} · 운송장 {t.waybill}
        </div>
        <Head title="점검 항목" caption={done + ' / ' + (ITEMS.length + 1)} progress={{ done, total: ITEMS.length + 1 }} />
        <div className="ph-list">
          {ITEMS.map((i, k) => (
            <CheckRow
              key={i.id}
              badge={k + 1}
              badgeTone="orange"
              title={i.title}
              caption={i.id === 'belts' ? beltCaption : i.caption}
              checked={!!note.checks[i.id]}
              onToggle={readOnly ? undefined : () => patchHub(hk, (h) => ({ checks: { ...h.checks, [i.id]: !h.checks[i.id] } }))}
            />
          ))}
          <CheckRow auto badge={ITEMS.length + 1} badgeTone="orange" title="사진 2장 이상" caption={'지금 ' + photos.length + '장'} checked={photosOk} />
        </div>
        <Head title="사진" caption={photos.length + '장'} />
        <div className="ph-pad">
          <div className="ph-pgrid">
            {!readOnly && (
              <button type="button" onClick={photo.open} aria-label="점검 사진 찍기">
                <Camera size={28} strokeWidth={1.8} />
                사진 찍기
              </button>
            )}
            {photos.map((p, i) => (
              <button key={i} type="button" onClick={() => openViewer(p.src, '점검 · ' + hubClock(p.at))} aria-label="점검 사진 크게 보기">
                <img src={p.src} alt="" />
                <span className="tag">점검 {i + 1}</span>
              </button>
            ))}
            {Array.from({ length: (3 - ((photos.length + (readOnly ? 0 : 1)) % 3)) % 3 }, (_, i) => (
              <span key={'pad' + i} className="pad" aria-hidden />
            ))}
          </div>
        </div>
        <Head title="점검자" />
        <div className="ph-list">
          <ListRow
            icon={<UserRound size={22} strokeWidth={2} />}
            title={ACCOUNT.operator.name}
            caption={hubName + ' 점검 · ' + (readOnly && note.approval ? hubClock(note.approval.at) + ' 승인' : note.arrivedAt ? hubClock(Math.max(now, note.arrivedAt)) + ' 점검 중' : '도착 전')}
          />
        </div>
      </div>
      <Fixed>
        {readOnly ? (
          <Primary onClick={() => undefined} disabled>
            승인함 · {hubClock(note.approval!.at)} · {note.approval!.by}
          </Primary>
        ) : (
          <Primary onClick={approve} disabled={!all} why={'항목 ' + (ITEMS.length + 1) + '개를 모두 확인하면 켜집니다'}>
            점검 끝 · 운행 재개 승인
          </Primary>
        )}
      </Fixed>
      {photo.input}
    </div>
  )
}
