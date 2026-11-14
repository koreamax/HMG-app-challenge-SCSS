/**
 * 운송장 단위 적재 기록. 기록은 운전자 것이고, 건별로 내보낼 때만 밖으로 나간다.
 * 관리자는 집계(결박 부족 비율, 안내 횟수)만 본다. 예외는 "짐 이탈 의심" 하나 (회사에 시각과 위치를 바로 알림).
 */
import type { LoadInput, Tone } from './limit.ts'
import type { AlertKind } from './monitor.ts'

export type RecordEntry =
  | { kind: 'load'; at: number; tone: Tone; title: string; limit: number; crit: number; input: LoadInput }
  | { kind: 'green'; at: number; limit: number }
  | { kind: 'depart'; at: number; tone: Tone; title: string; kit: boolean }
  | { kind: 'alert'; at: number; alert: AlertKind; title: string; peakG: number | null; limitG: number; dir: string | null; shiftMm: number | null; place: string | null; measured: boolean }
  | { kind: 'speech'; at: number; text: string }
  | { kind: 'answer'; at: number; heard: string; yes: boolean }
  | { kind: 'waypoint'; at: number; name: string }
  | { kind: 'park'; at: number; km: number }
  | { kind: 'relash'; at: number; limit: number | null }
  | { kind: 'unload'; at: number; count: number }
  | { kind: 'photo'; at: number; dataUrl: string }
  | { kind: 'company'; at: number; text: string }
  /** 시범 운영: 빨강 뒤 정차하면 기사가 '밀림 있음 · 없음'을 누른다 (키트 없는 판정을 실측과 견줌) */
  | { kind: 'feedback'; at: number; moved: boolean }

export type Waybill = {
  id: string
  createdAt: number
  input: LoadInput
  entries: RecordEntry[]
  closedAt: number | null
}

export const ALERT_TITLE: Record<AlertKind, string> = {
  check: '확인 필요',
  loose: '바 풀림',
  moved: '짐 밀림',
  lost: '짐 이탈 의심',
}

export function newWaybillId(now = new Date(), n = Math.floor(Math.random() * 9000) + 1000) {
  const yy = String(now.getFullYear()).slice(2)
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  return 'KR-' + yy + mm + '-' + n
}

/** 관리자 집계: 개인 기록 없이 숫자만 */
export function aggregate(list: Waybill[]) {
  let departs = 0
  let underAtDepart = 0
  let notices = 0
  let alerts = 0
  let relashAfterAlert = 0
  let falseAlerts = 0
  let feedbacks = 0
  for (const w of list) {
    let hadAlert = false
    for (const e of w.entries) {
      if (e.kind === 'depart') {
        departs += 1
        if (e.tone !== 'green') underAtDepart += 1
      } else if (e.kind === 'speech') notices += 1
      else if (e.kind === 'alert') {
        alerts += 1
        hadAlert = true
      } else if (e.kind === 'relash' && hadAlert) {
        relashAfterAlert += 1
        hadAlert = false
      } else if (e.kind === 'feedback') {
        feedbacks += 1
        if (!e.moved) falseAlerts += 1
      }
    }
  }
  return { waybills: list.length, departs, underAtDepart, underRatio: departs ? underAtDepart / departs : 0, notices, alerts, relashAfterAlert, feedbacks, falseAlerts }
}

/** 건별 내보내기 (사진은 빼고 표시만) */
export function exportWaybill(w: Waybill) {
  return {
    app: '적재적소',
    waybill: w.id,
    createdAt: new Date(w.createdAt).toISOString(),
    closedAt: w.closedAt ? new Date(w.closedAt).toISOString() : null,
    load: w.input,
    entries: w.entries.map((e) => (e.kind === 'photo' ? { kind: 'photo', at: new Date(e.at).toISOString(), attached: true } : { ...e, at: new Date(e.at).toISOString() })),
    note: '이 기록은 운전자 본인의 것이며, 운전자가 이 건만 내보냈습니다.',
  }
}
