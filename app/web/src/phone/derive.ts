/**
 * 휴대폰 판의 계산: 운송장 기록 -> 사건(밀림 · 풀림 · 이탈 의심 · 확인 필요) 묶음, 판정 띠 글, 다시 묶기 단계, 시간 줄 글.
 * 엔진 · 기록 형식은 그대로 읽기만 한다 (engine/records.ts).
 */
import type { RecordEntry, Waybill } from '@/engine/records'
import type { ActiveAlert, AlertKind, ShiftDir } from '@/engine/monitor'
import { judgeLoad, type LoadInput, type LoadVerdict, type Tone } from '@/engine/limit'
import { relashOrder } from '@/three/bed-input'
import { CARGO } from '@/engine/cargo'
import { BAR_NAME, clock, SHIFT_WORD, placeText } from '@/ui/format'
import type { BannerData } from './ui'

export type AlertEntry = Extract<RecordEntry, { kind: 'alert' }>
export type PhotoEntry = Extract<RecordEntry, { kind: 'photo' }>

/** 화면 판정 말 (정해진 여덟 가지 중 사건 넷) */
export const STATUS_TITLE: Record<AlertKind, string> = {
  check: '확인 필요',
  loose: '바가 느슨해졌습니다',
  moved: '짐이 밀렸습니다',
  lost: '짐 이탈 의심',
}
export const RANK: Record<AlertKind, number> = { check: 1, loose: 2, moved: 3, lost: 4 }
export const TONE_RANK: Record<Tone, number> = { red: 0, orange: 1, grey: 2, green: 3 }

/** 사건이 열렸을 때 휴대폰이 받아 둔 값 (기록 줄에는 없는 것: 길 종류 · 밀린 방향 · 풀린 바) */
export type AlertDetail = { road: 'highway' | 'local'; shiftDir: ShiftDir | null; loose: { c1: boolean; c2: boolean }; dir: 'brake' | 'turn' | 'accel' | null }

/** 사건 하나 = '다시 조였어요' 전까지 이어진 경보 줄들 (풀림 -> 밀림 -> 이탈 의심으로 올라가면 같은 사건) */
export type Incident = {
  key: string
  wb: Waybill
  first: AlertEntry
  last: AlertEntry
  kind: AlertKind
  rank: number
  resolvedAt: number | null
  moved: boolean | null
  waypoint: string | null
}

export function incidentsOf(w: Waybill): Incident[] {
  const out: Incident[] = []
  let open: Incident | null = null
  for (const e of w.entries) {
    if (e.kind === 'alert') {
      if (open) {
        open.last = e
        open.kind = e.alert
        open.rank = Math.max(open.rank, RANK[e.alert])
      } else {
        open = { key: w.id + ':' + e.at, wb: w, first: e, last: e, kind: e.alert, rank: RANK[e.alert], resolvedAt: null, moved: null, waypoint: null }
        out.push(open)
      }
    } else if (e.kind === 'relash') {
      if (open) {
        open.resolvedAt = e.at
        open = null
      }
    } else if (e.kind === 'feedback') {
      const t = open ?? out[out.length - 1]
      if (t) t.moved = e.moved
    } else if (e.kind === 'waypoint') {
      if (open) open.waypoint = e.name.replace(/^\d+킬로미터 앞 /, '')
    }
  }
  return out
}

let memo: { wb: Waybill | null; history: Waybill[]; list: Incident[] } | null = null
/** 이 기기의 모든 사건 (최근 것 먼저) */
export function allIncidents(wb: Waybill | null, history: Waybill[]): Incident[] {
  if (memo && memo.wb === wb && memo.history === history) return memo.list
  const list: Incident[] = []
  const seen = new Set<string>()
  for (const w of [...(wb ? [wb] : []), ...history]) {
    if (seen.has(w.id)) continue
    seen.add(w.id)
    list.push(...incidentsOf(w))
  }
  list.sort((a, b) => b.last.at - a.last.at)
  memo = { wb, history, list }
  return list
}

export function findWaybill(wb: Waybill | null, history: Waybill[], id: string): Waybill | null {
  if (wb?.id === id) return wb
  return history.find((h) => h.id === id) ?? null
}

/** 사건 카드 · 알림 둘째 줄: '14:32 · 졸음쉼터 A' */
export function placeWord(inc: Incident, d?: AlertDetail | null): string {
  const p = placeText(inc.last.place)
  if (p) return p
  if (inc.waypoint) return inc.waypoint
  if (d?.road === 'local') return '일반 도로'
  if (d?.road === 'highway') return '고속도로'
  return '위치 없음'
}
export const incidentCaption = (inc: Incident, d?: AlertDetail | null) => clock(inc.first.at) + ' · ' + placeWord(inc, d)

/** 기록된 사건을 엔진의 ActiveAlert 꼴로 (무대를 다시 묶기로 그릴 때: 키트 알림이 이미 지나갔거나 다시 연 앱) */
export function incidentAlert(inc: Incident, d: AlertDetail | null): ActiveAlert {
  return {
    kind: inc.kind,
    at: 0,
    wallMs: inc.last.at,
    road: d?.road ?? 'highway',
    peakG: inc.last.peakG,
    dir: d?.dir ?? null,
    limitG: inc.last.limitG,
    shiftMm: inc.last.shiftMm,
    shiftDir: d?.shiftDir ?? null,
    loose: d?.loose ?? { c1: false, c2: false },
    place: inc.last.place,
    measured: inc.last.measured,
  }
}

export function shiftWord(mm: number | null, dir: ShiftDir | null): string | null {
  if (!mm || mm < 5) return null
  return (dir ? SHIFT_WORD[dir] + ' ' : '') + Math.max(1, Math.round(mm / 10)) + ' cm'
}

export type Step = { title: string; caption?: string; tone: Tone }

/**
 * 다시 묶기 순서. 내비 4.4 와 같은 말 · 같은 순서 (3D 배지 번호와 맞다):
 * 풀린 바 먼저, 그다음 짐이 밀린 반대쪽부터 (three/bed-input 의 relashOrder). 밀림이면 마지막에 '짐 제자리 확인'.
 */
export function stepsFor(kind: AlertKind, measured: boolean, loose: { c1: boolean; c2: boolean } | null, shiftDir: ShiftDir | null, input: LoadInput): Step[] {
  if (kind === 'lost')
    return [
      { title: '비상등 켜고 세우기', caption: '안전한 곳에 세우세요', tone: 'red' },
      { title: '떨어진 짐은 신고', caption: '직접 줍지 마세요 · 고속도로 1588-2504 · 일반 도로 112', tone: 'red' },
      { title: '남은 짐의 바 확인', caption: '느슨하면 다시 조이기', tone: 'red' },
    ]
  if (!measured)
    return [
      { title: '바를 손으로 당겨 보기', caption: '느슨한 바는 다시 조이기', tone: 'orange' },
      { title: '짐이 밀렸는지 보기', caption: '밀렸으면 제자리로', tone: 'orange' },
    ]
  const v = judgeLoad(input)
  const n = Math.max(0, input.belts)
  const a = { measured: true, loose: loose ?? { c1: false, c2: false }, shiftDir } as Pick<ActiveAlert, 'measured' | 'loose' | 'shiftDir'>
  const barName = (i: number) => {
    const s = v.tensions[i]?.sensor
    if (s && n <= 2) return BAR_NAME[s]
    if (i === 0) return '앞 바'
    if (i === n - 1) return '뒤 바'
    return n === 3 ? '가운데 바' : i + 1 + '번째 바'
  }
  const list: Step[] = relashOrder(input, v, a as ActiveAlert)
    .slice(0, kind === 'moved' ? 2 : 3)
    .map((i, k) => {
      const s = v.tensions[i]?.sensor
      const isLoose = !!s && a.loose[s]
      return { title: barName(i) + ' 다시 조이기', caption: isLoose ? '키트가 풀림을 잡은 바' : k === 0 && kind === 'moved' ? '짐이 밀린 반대쪽부터' : '당겨서 단단히', tone: isLoose ? 'red' : 'orange' }
    })
  if (kind === 'moved') list.push({ title: '짐 제자리 확인', caption: '다음 하차 때 제자리로', tone: 'orange' })
  return list
}

export function incidentBanner(inc: Incident, steps: number, d: AlertDetail | null): BannerData {
  const k = inc.kind
  const todo = k === 'lost' ? '안전한 곳에 세우고 신고' : k === 'check' ? '짐 확인 ' + steps + '단계' : '다시 묶기 ' + steps + '단계'
  const shift = shiftWord(inc.last.shiftMm, d?.shiftDir ?? null)
  const g = inc.last.peakG !== null ? hitWord(d?.dir) + ' ' + inc.last.peakG.toFixed(2) + ' g' : null
  // 밀림: 밀린 방향 · 거리는 3D 꼬리표 하나만 말한다 (띠 아래 줄 · 칸 아래 줄에 되풀이하지 않는다)
  const what = k === 'lost' ? null : k === 'moved' ? (shift && d?.shiftDir ? null : shift ? '짐이 ' + shift + ' 밀렸습니다' : g) : k === 'loose' ? (shift ? '짐 ' + shift + ' 움직임' : g) : g
  const alt = [what, incidentCaption(inc, d).replace(' · ', ' ')].filter(Boolean).join(' · ')
  return { tone: 'red', title: STATUS_TITLE[k], todo, alt }
}

export function loadBanner(v: LoadVerdict): BannerData {
  return { tone: v.tone, title: verdictWord(v.title), todo: v.action, alt: v.alt }
}

export const cargoWord = (i: LoadInput) => CARGO[i.kind].label + ' ' + i.massKg + ' kg'
export const beltWord = (i: LoadInput) => (i.beltType === 'ratchet' ? '라쳇 ' : '고무바 ') + i.belts + '개'

export type Line = { tone: Tone | null; title: string; detail?: string }

const PURPOSE_WORD = { load: '상차', after: '조인 뒤', inspect: '점검' } as const
export type PhotoPurpose = keyof typeof PURPOSE_WORD
export const purposeWord = (p: PhotoPurpose | undefined) => (p ? PURPOSE_WORD[p] : '첨부')

/** 시간 줄 한 줄 (색 네모는 상태가 있는 줄만, 나머지는 회색 선 네모) */
export function entryLine(e: RecordEntry, photoPurpose?: PhotoPurpose): Line {
  switch (e.kind) {
    case 'load':
      return {
        tone: e.tone,
        title: '상차 · ' + verdictWord(e.title),
        detail: cargoWord(e.input) + ' · ' + beltWord(e.input) + ' · 앞벽 ' + (e.input.frontWall ? '붙임' : '안 붙임') + ' · 견딜 수 있는 ' + (e.crit < 0.8 ? '힘 ' : '급제동 ') + e.limit.toFixed(2) + ' g (기준 ' + e.crit.toFixed(2) + ')',
      }
    case 'green':
      return { tone: 'green', title: '고정 상태 양호 · 자동 기록', detail: '견딜 수 있는 급제동 ' + e.limit.toFixed(2) + ' g' }
    case 'depart':
      return { tone: e.tone, title: '출발 · ' + verdictWord(e.title), detail: e.kit ? '센서 키트 연결' : '센서 키트 없음' }
    case 'alert': {
      const parts = [
        e.peakG !== null ? '충격 ' + e.peakG.toFixed(2) + ' g · 한계 ' + e.limitG.toFixed(2) + ' g (' + (e.measured ? '키트 측정' : '추정') + ')' : null,
        e.alert !== 'lost' && e.shiftMm && e.shiftMm >= 5 ? '짐 ' + Math.max(1, Math.round(e.shiftMm / 10)) + ' cm 움직임' : null,
        placeText(e.place),
      ].filter(Boolean)
      return { tone: 'red', title: '사건 · ' + STATUS_TITLE[e.alert], detail: parts.join(' · ') || undefined }
    }
    case 'speech':
      return { tone: null, title: '음성 안내', detail: '“' + e.text + '”' }
    case 'answer':
      return { tone: null, title: '대답 · ' + (e.yes ? '네' : '아님'), detail: e.heard }
    case 'waypoint':
      return { tone: null, title: '경유지 추가', detail: e.name }
    case 'park':
      return { tone: null, title: '정차', detail: '상차 뒤 ' + e.km.toFixed(1) + ' km' }
    case 'relash':
      return { tone: null, title: '조치 · 다시 조임', detail: e.limit !== null ? '견딜 수 있는 급제동 ' + e.limit.toFixed(2) + ' g' : undefined }
    case 'unload':
      return { tone: null, title: '일부 하차 ' + e.count + '번째' }
    case 'photo':
      return { tone: null, title: '사진 · ' + purposeWord(photoPurpose) }
    case 'company':
      return { tone: null, title: e.text.startsWith('짐 이탈') ? '회사 알림' : '관제 기록', detail: e.text }
    case 'feedback':
      return { tone: null, title: '기사 확인 · ' + (e.moved ? '밀림 있음' : '밀림 없음') }
  }
}

/** 운송장 요약: 마지막 상차 판정 · 사건 수 · 다시 조임 수 · 거리 */
export function waybillSummary(w: Waybill, liveKm: number | null) {
  let load: Extract<RecordEntry, { kind: 'load' }> | null = null
  let relash = 0
  let km = 0
  let photos = 0
  for (const e of w.entries) {
    if (e.kind === 'load') load = e
    else if (e.kind === 'relash') relash += 1
    else if (e.kind === 'park') km = Math.max(km, e.km)
    else if (e.kind === 'photo') photos += 1
  }
  if (liveKm !== null) km = Math.max(km, liveKm)
  const incidents = incidentsOf(w)
  return { load, incidents, relash, km, photos }
}

export const fmtG = (g: number) => g.toFixed(2)

/**
 * 화면 말 (엔진 값은 그대로, 보이는 말만 우리말 보고서 말투로).
 * 견딜 수 있는 값 이름: 옆·뒤 0.50 기준(앞쪽은 앞벽 · 앞 줄이 받음)이면 '옆·뒤로 견디는 힘', 앞 0.80 기준이면 '견딜 수 있는 급제동'
 */
export const limitName = (crit: number) => (crit < 0.8 ? '옆·뒤로 견디는 힘' : '견딜 수 있는 급제동')
/** 좁은 셋 칸용 짧은 이름: 칸 이름이 잘리지 않게 */
export const limitShort = (crit: number) => (crit < 0.8 ? '견디는 힘' : '견디는 한계')
/** 사건 때 받은 힘의 이름 (방향을 알면 급제동 · 급회전 · 급출발) */
export const hitWord = (dir: 'brake' | 'turn' | 'accel' | null | undefined) => (dir === 'turn' ? '급회전' : dir === 'accel' ? '급출발' : dir === 'brake' ? '급제동' : '충격')
/** 엔진 판정 말 중 번역투로 읽히는 것만 화면 말로 ('계산상 기준 충족' -> '고정 상태 양호'). 안전 보증이 아니라는 말은 화면 아래 한 줄이 맡는다 */
export const verdictWord = (title: string) => (title === '계산상 기준 충족' ? '고정 상태 양호' : title)
/** 초록 판정 아래 한 줄 */
export const GREEN_NOTE = '초록 판정은 계산 결과이며 안전을 보증하지는 않습니다'
export const fmtN = (n: number) => Math.round(n).toLocaleString('ko-KR')
