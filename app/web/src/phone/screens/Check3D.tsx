/**
 * 4.8 3D 확인 (§11.7, 390 x 844 첫 화면에 스크롤 없이): 판정 줄 64 -> 3D 무대 폭 가득 280 안팎 [정보 칩 둘까지 + 고른 짐 테두리, 오른쪽 아래 보기 알약 3D · 위에서 · 키트]
 * -> 지표 줄 (판 하나에 2 x 2, 칸 60) -> '눈으로 확인' 머리 + 첫 줄 -> 주 단추 52. 그 아래로 스크롤: '눈으로 확인' -> 짐 사진 358 x 200.
 * 주 단추: '짐 사진 찍기' -> 찍은 뒤 '상차 끝 · 운송장에 남기기'. 사건이 열려 있으면 판정 카드가 사건을 말하고 단추는 '다시 묶기 시작' (사건 카드를 따로 두지 않는다).
 */
import { useMemo, useState } from 'react'
import { BrickWall, Camera, Gauge, Link2, Pencil } from 'lucide-react'
import { CARGO } from '@/engine/cargo'
import type { LoadVerdict, Tone } from '@/engine/limit'
import { app, setEyeCheck, verdictFor } from '@/runtime/runtime'
import { useStore } from '@/runtime/store'
import { kitKey, stageInput, type StageOut } from '@/three/bed-input'
import type { StageTag } from '@/three/bed-scene'
import { fmtN } from '@/ui/format'
import { GREEN_NOTE, incidentAlert, incidentBanner, limitName, loadBanner, stepsFor, type Incident } from '../derive'
import { addWaybillPhoto, detailOf, openIncident, openSheet, openViewer, phone, push, saveLoadNote, showToast, useIncidents } from '../state'
import { kitChips, withChips } from '../chips'
import { usePhotoInput } from '../photo'
import { AppBar, Banner, CargoIcon, CheckRow, Fixed, Head, IconCell, PhotoCell, Primary, Secondary, Segmented, Tile, useRolled } from '../ui'
import { Stage } from './Stage'

type View = '3d' | 'top' | 'kit'

const EYE_CAPTION: Record<string, string> = {
  '고리 체결': '벨트 고리가 적재함 고리에 걸렸는지',
  '모서리 보호대': '벨트가 짐 모서리에 닿는 곳마다',
  넘어짐: '키 큰 짐이 흔들리지 않게 묶였는지',
}

export function Check3DScreen() {
  const load = useStore(app, (s) => s.load)
  const out = useStore(app, (s) => s.out)
  const kit = useStore(app, (s) => s.kit)
  const waybill = useStore(app, (s) => s.waybill)
  const eye = useStore(app, (s) => s.eyeChecks)
  const loadNotes = useStore(phone, (s) => s.loadNotes)
  const tags = useStore(phone, (s) => s.photoTags)
  useStore(phone, (s) => s.details)
  const incidents = useIncidents()
  const [view, setView] = useState<View>('3d')
  const photo = usePhotoInput(
    (url) => {
      if (addWaybillPhoto(url, 'load')) showToast('짐 사진을 운송장에 붙였습니다')
    },
    (m) => showToast(m),
    'load',
  )

  const live = out?.verdict ?? verdictFor(load)
  // 주행 중에는 출발 때 판정 (엔진의 주행 상태 · 내비 화면과 같다). 정차 중에는 지금 판정 (다시 조이면 바로 바뀐다)
  const v = out?.mode === 'drive' && out.departVerdict ? out.departVerdict : live
  const alert = out?.alert ?? null
  const open = waybill ? incidents.find((i) => i.wb.id === waybill.id && !i.resolvedAt) ?? null : null
  const detail = detailOf(open)
  // 내비와 같은 무대 입력 (three/bed-input). 사건이 열려 있으면 다시 묶기 그림 (늘어난 바를 '충분'으로 보이지 않는다)
  const kk = kitKey(kit)
  const stageAlert = alert ?? (open ? incidentAlert(open, detail) : null)
  const stageMode = view === 'kit' ? 'kit' : open ? 'relash' : 'park'
  // 다시 묶기를 마친 운송장 (열린 사건 · 지금 경보 없음): 기사가 '짐 제자리'를 확인했으므로 지난 사건의 이동 화살 · 흐린 상자는 지운다
  const settled = !open && !alert && !!waybill && incidents.some((i) => i.wb.id === waybill.id && !!i.resolvedAt)
  // 고무바 · 로프는 장력을 계산에 넣지 않는다: 판정이 주황 · 빨강이면 그 띠를 판정 색으로 칠하고 까닭을 꼬리표로
  const rubberWarn = !open && load?.beltType === 'rubber' && (v.tone === 'orange' || v.tone === 'red')
  const stage3d = useMemo(
    () => {
      const out = tidyStage(capTags(stageInput({ load, verdict: open ? live : v, kit, alert: stageAlert, mode: stageMode })), settled, rubberWarn)
      // 센서 키트 보기는 잰 값 칩이 목적이라 그대로. 3D · 위에서: 고른 짐 테두리 + 정보 칩 (상태 칩 1 + 짐, 상태가 없으면 짐 · 벨트. 장면이 둘까지 그린다)
      //   위에서: 적재함이 무대를 가득 채우므로 테두리만 (칩은 적재함 바닥을 덮는다)
      if (view === 'kit') return { ...out, input: kitChips(out.input) }
      return { ...out, input: withChips(out.input, open ? live : v, load, !open && !stageAlert, view !== 'top') }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [load, v.tone, v.kind, v.limit.toFixed(3), v.extraBelts, kk, stageAlert?.kind, stageAlert?.wallMs, stageAlert?.loose.c1, stageAlert?.loose.c2, stageAlert?.shiftMm, stageMode, view, settled, rubberWarn],
  )
  if (!load || !waybill) return null

  const loadPhotos = waybill.entries.filter((e): e is Extract<typeof e, { kind: 'photo' }> => {
    if (e.kind !== 'photo') return false
    const t = tags[waybill.id + ':' + e.at]
    return t ? t.purpose === 'load' : true
  })
  const lastPhoto = loadPhotos[loadPhotos.length - 1] ?? null
  const note = loadNotes[waybill.id] ?? null
  // 첫 화면은 판정 줄 하나에 판정 · 할 일만 (보조 줄 없음). 사건 시각 · 장소는 사건 화면에서 (무대에는 글이 없다, §11.6), 다른 방법은 눈으로 확인 아래 한 줄
  const full = open ? incidentBanner(open, stepsFor(open.kind, open.last.measured, detail?.loose ?? alert?.loose ?? null, detail?.shiftDir ?? alert?.shiftDir ?? null, open.wb.input).length, detail) : loadBanner(v)
  const banner = { ...full, alt: null }
  const altTip = open ? null : full.alt
  const eyeList = v.eyeChecks.length ? v.eyeChecks : ['고리 체결', '모서리 보호대']
  const eyeDone = eyeList.filter((k) => eye[k]).length
  const t0 = v.tensions[0]
  const tLast = v.tensions[v.tensions.length - 1]
  // 벨트 칸 아래 한 줄: 키트가 잰 장력 > 고무바(계산 제외) > 권장 개수. 판정 카드의 할 일 문장과 같은 말은 쓰지 않는다
  const beltCap = open
    ? '다시 조인 뒤 판정'
    : v.measured && t0
      ? '키트 ' + fmtN(t0.n) + (tLast && tLast !== t0 ? ' / ' + fmtN(tLast.n) : '') + ' N'
      : load.beltType === 'rubber'
        ? '장력 계산 제외'
        : v.kind === 'none'
          ? '판정 불가'
          : v.limit >= v.crit
          ? '기준 충족'
          : v.extraBelts !== null && v.extraBelts > 0
            ? '권장 ' + (load.belts + v.extraBelts) + '개'
            : '바만으로는 부족'

  const finish = () => {
    const e: Record<string, boolean> = {}
    for (const k of eyeList) e[k] = !!eye[k]
    saveLoadNote(waybill.id, { at: Date.now(), eye: e, photos: loadPhotos.length })
    const miss = eyeList.length - eyeDone
    showToast(miss ? '상차를 남겼습니다 · 확인 안 함 ' + miss + '가지' : '상차를 운송장에 남겼습니다')
  }

  const stage = (
    <Stage
      input={stage3d.input}
      view={view === 'top' ? 'top' : '3d'}
      tone={banner.tone}
      top={<ViewSeg view={view} onChange={setView} />}
    />
  )

  return (
    <div className="ph-screen">
      <AppBar
        title="3D 확인"
        right={
          <IconCell label="상차 정보 고치기" onClick={() => push({ name: 'edit' })}>
            <Pencil size={22} strokeWidth={2} />
          </IconCell>
        }
      />
      <Banner data={banner} />
      <div className="ph-scroll">
        {stage}
        <div className="ph-kpis c2">
          <LimitTile v={v} open={open} />
          <Tile tone="neutral" icon={<CargoIcon kind={load.kind} size={18} />} name="짐" value={load.massKg} unit="kg" cap={CARGO[load.kind].label} onClick={() => push({ name: 'edit' })} label="짐 고치기" />
          <Tile
            tone="neutral"
            icon={<Link2 size={18} strokeWidth={2} />}
            name={'벨트 · ' + (load.beltType === 'ratchet' ? '라쳇' : '고무바')}
            value={load.belts}
            unit="개"
            cap={beltCap}
            onClick={() => push({ name: 'edit' })}
            label="벨트 고치기"
          />
          <Tile
            tone="neutral"
            icon={<BrickWall size={18} strokeWidth={2} />}
            name="앞벽"
            value={load.frontWall ? '붙임' : '안 붙임'}
            cap={load.frontWall ? '앞쪽은 앞벽이 받음' : '앞쪽도 바가 받음'}
            onClick={() => push({ name: 'edit' })}
            label="앞벽 고치기"
          />
        </div>
        <Head title="눈으로 확인" caption={eyeDone + ' / ' + eyeList.length} progress={{ done: eyeDone, total: eyeList.length }} />
        <div className="ph-list">
          {eyeList.map((k) => (
            <CheckRow key={k} title={k} caption={EYE_CAPTION[k]} checked={!!eye[k]} onToggle={() => setEyeCheck(k, !eye[k])} />
          ))}
        </div>
        {/* 도움말은 화면에 한 줄만: 초록이면 계산 한계 한 줄, 아니면 다른 방법 한 줄 */}
        {v.tone === 'green' ? <p className="ph-note">{GREEN_NOTE}</p> : altTip ? <p className="ph-note">다른 방법 · {altTip}</p> : null}
        <Head title="짐 사진" caption={note ? '상차 끝 ' + new Date(note.at).toTimeString().slice(0, 5) + ' · 운송장에 남음' : loadPhotos.length ? loadPhotos.length + '장 · 운송장에 남음' : '출발 전 상태'} />
        <div className="ph-pad" style={{ paddingBottom: 16 }}>
          <PhotoCell
            src={lastPhoto?.dataUrl ?? null}
            title="사진 찍기"
            tag={lastPhoto ? '상차 · ' + new Date(lastPhoto.at).toTimeString().slice(0, 5) : undefined}
            onTake={photo.open}
            onView={lastPhoto ? () => openViewer(lastPhoto.dataUrl, '상차 사진 · ' + new Date(lastPhoto.at).toTimeString().slice(0, 5)) : undefined}
          />
        </div>
      </div>
      <Fixed>
        {open ? (
          // 사건이 열려 있으면 판정 카드의 할 일('다시 묶기 3단계')로 바로 들어가는 단추 하나
          <Primary onClick={() => openIncident(open)}>{open.kind === 'lost' ? '확인할 것 보기' : open.kind === 'check' ? '짐 확인 시작' : '다시 묶기 시작'}</Primary>
        ) : !loadPhotos.length ? (
          <Primary onClick={photo.open}>
            <Camera size={22} strokeWidth={2} />짐 사진 찍기
          </Primary>
        ) : !note ? (
          <Primary onClick={finish}>상차 끝 · 운송장에 남기기</Primary>
        ) : (
          <Secondary onClick={photo.open}>
            <Camera size={20} strokeWidth={2} />짐 사진 더 찍기
          </Secondary>
        )}
      </Fixed>
      {photo.input}
    </div>
  )
}

/**
 * 견딜 수 있는 급제동 칸. 색은 보이는 값(굴러가는 숫자)과 기준으로 정한다: 기준 밑이면 초록일 수 없다.
 * 사건이 열려 있으면 사건 때 버틴 값을 빨강으로 (밀린 뒤 늘어난 바로 다시 잰 값은 다시 조인 뒤에 판정한다)
 */
function LimitTile({ v, open }: { v: LoadVerdict; open: Incident | null }) {
  const target = open ? open.last.limitG : v.limit
  const shown = Math.round(useRolled(target) * 100) / 100
  const none = !open && v.kind === 'none'
  const tone: Tone = none ? 'grey' : open ? 'red' : shown < v.crit ? 'orange' : v.tone
  return (
    <Tile
      tone={tone}
      icon={<Gauge size={18} strokeWidth={2} />}
      name={open ? '사건 당시 한계' : limitName(v.crit)}
      value={none ? '—' : shown.toFixed(2)}
      unit="g"
      foot={'기준 ' + v.crit.toFixed(2)}
      bar={none ? null : { ratio: shown / 1.2, mark: v.crit / 1.2 }}
      onClick={() => openSheet({ kind: 'limit' })}
      label="견딜 수 있는 힘 자세히"
    />
  )
}

const TONE_RANK: Record<string, number> = { red: 3, orange: 2, grey: 1, green: 0, neutral: -1 }

/**
 * 3D 꼬리표는 둘까지 (DESIGN_SPEC §9). 넘치면 앞 · 뒤 바 꼬리표를 하나로 합친다:
 * 같은 말이면 '앞 · 뒤 바 약함 1,250 N' (값이 다르면 '1,250 / 1,100 N'), 말이 다르면 더 나쁜 바 하나만.
 * 그래도 넘치면 바 값은 아래 칸에 맡기고 움직임 · 더 걸 자리 꼬리표만 남긴다
 */
function capTags(out: StageOut): StageOut {
  const tags = out.input.tags ?? []
  if (tags.length <= 2) return out
  const isBelt = (t: StageTag) => t.id === 'c1' || t.id === 'c2'
  const belts = tags.filter(isBelt)
  const rest = tags.filter((t) => !isBelt(t))
  let belt: StageTag | null = belts[0] ?? null
  if (belts.length === 2) {
    const [a, b] = belts
    const wa = a.text.split(' · ')[1] ?? ''
    const wb = b.text.split(' · ')[1] ?? ''
    const [worda, ...va] = wa.split(' ')
    const [wordb, ...vb] = wb.split(' ')
    // 말 없이 값만 있는 꼬리표('앞 바 · 1,250 N', 키트 보기): 값이 같으면 하나로, 다르면 '1,250 / 1,100 N'
    const numeric = /^[\d,.]+$/.test(worda ?? '') && /^[\d,.]+$/.test(wordb ?? '')
    // 키트 보기의 잰 값 ('앞 바 장력 · …') 은 이름과 값 사이 ' · ' 를 남긴다 (정보 칩이 이름 / 값으로 나눈다)
    const pre = a.text.includes(' 장력 · ') ? '앞 · 뒤 바 장력 · ' : '앞 · 뒤 바 '
    if (numeric) belt = { ...a, id: 'c12', text: pre + (wa === wb ? wa : worda + ' / ' + wb) }
    else if (worda && worda === wordb) {
      const na = va.join(' ').replace(/ N$/, '')
      const nb = vb.join(' ').replace(/ N$/, '')
      // 값이 없는 말 ('없음' · '끊김') 은 말만
      belt = { ...a, id: 'c12', text: !na && !nb ? pre + worda : pre + worda + ' ' + (na === nb ? na : na + ' / ' + nb) + ' N' }
    } else belt = (TONE_RANK[b.tone] ?? 0) > (TONE_RANK[a.tone] ?? 0) ? b : a
  }
  const next = belt && rest.length < 2 ? [belt, ...rest] : rest.slice(0, 2)
  return { ...out, input: { ...out.input, tags: next } }
}

/**
 * 폰 3D 확인의 마무리 손질 (장면 입력은 내비와 같은 three/bed-input 그대로 받고 여기서만 고친다).
 * settled: 다시 묶기를 마쳤다 = 짐은 제자리. 지난 사건의 이동(화살 · 흐린 상자 · '앞으로 11 cm')을 지운다.
 * rubber: 고무바 · 로프 띠를 문제 띠로 칠하고 첫 꼬리표 '고무바 · 계산 제외' (장면은 꼬리표를 하나만 그린다)
 */
function tidyStage(out: StageOut, settled: boolean, rubber: boolean): StageOut {
  let i = out.input
  if (settled && (i.pose || i.shift || i.ghost)) {
    i = {
      ...i,
      pose: i.pose ? { ...i.pose, x: 0, z: 0 } : null,
      shift: null,
      ghost: false,
      tags: (i.tags ?? [])
        .filter((t) => t.id !== 'shift')
        .map((t) => (t.id === 'tag' && /cm|mm|밀림|이동/.test(t.text) ? { ...t, text: '짐 태그 · 제자리', tone: 'neutral' as const } : t)),
    }
  }
  if (rubber && i.belts.length) {
    i = {
      ...i,
      belts: i.belts.map((b) => (b.hint ? b : { ...b, tone: 'orange' as const })),
      tags: [{ id: 'rubber', text: '고무바 · 계산 제외', tone: 'orange' as const, icon: 'belt' as const, at: { kind: 'belt' as const, index: Math.floor((i.belts.length - 1) / 2) }, side: 'right' as const }, ...(i.tags ?? []).filter((t) => t.id !== 'hint')],
    }
  }
  return i === out.input ? out : { ...out, input: i }
}

function ViewSeg({ view, onChange }: { view: View; onChange: (v: View) => void }) {
  return (
    <Segmented<View>
      pill
      label="보기"
      items={[
        { id: '3d', label: '3D' },
        { id: 'top', label: '위에서' },
        { id: 'kit', label: '키트' },
      ]}
      value={view}
      onChange={onChange}
    />
  )
}
