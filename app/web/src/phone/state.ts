/**
 * 휴대폰 판의 자기 상태 (탭 · 화면 쌓기 · 읽은 사건 · 알림 · 시트 · 허브 점검 기록 · 사진 쓰임).
 * 운송장 · 판정은 runtime 의 app 하나를 내비와 같이 읽는다 (시연 무대에서 한쪽 입력이 다른 쪽에 바로 보이는 까닭).
 * 실제 제품에서는 운송장을 클라우드로 같이 쓴다.
 */
import { useMemo } from 'react'
import { addPhoto, app } from '@/runtime/runtime'
import { createStore, useStore } from '@/runtime/store'
import type { Waybill } from '@/engine/records'
import type { Tone } from '@/engine/limit'
import type { MonitorOut } from '@/engine/monitor'
import { SPEAK_STOP_S } from '@/engine/constants'
import { allIncidents, type AlertDetail, type Incident, type PhotoPurpose } from './derive'

export type Role = 'driver' | 'operator'
export type Tab = 'load' | 'records' | 'hub' | 'settings'
export type Route =
  | { name: 'edit' }
  | { name: 'event'; key: string }
  | { name: 'waybill'; id: string }
  | { name: 'truck'; id: string }
  /** hk = 허브 기록 key (LIVE 트럭은 사건마다 달라서 들어갈 때 정해 둔다) */
  | { name: 'inspect'; id: string; hk: string }

export type Sheet =
  | { kind: 'export'; id: string }
  | { kind: 'limit' }
  /** 허브 점검 기준 (운영 규칙 글은 화면 대신 여기에) */
  | { kind: 'rule' }
  | { kind: 'reason'; truck: string }
  | { kind: 'close' }
  | { kind: 'clear' }

export type EventNote = { at: number; steps: { title: string; done: boolean }[] }
export type LoadNote = { at: number; eye: Record<string, boolean>; photos: number }
export type HubNote = {
  /** 기록만 남기고 계속 (이유) */
  ack: { at: number; reason: string } | null
  /** 다음 허브에서 점검 정차 요청 (관제 시스템에 보냄) */
  request: { at: number; hub: string; etaMin?: number } | null
  arrivedAt: number | null
  checks: Record<string, boolean>
  /** 시연 트럭 점검 사진 (기기에 저장하지 않는다) */
  photos: string[]
  approval: { at: number; by: string; photos: number } | null
}

export type PhoneState = {
  role: Role
  tab: Tab
  stacks: Record<Tab, Route[]>
  /** 사건 key -> 본 단계 (밀림 -> 이탈 의심처럼 올라가면 다시 안 읽음) */
  seen: Record<string, number>
  notify: boolean
  notif: { key: string; rank: number } | null
  toast: string | null
  sheet: Sheet | null
  viewer: { src: string; caption: string } | null
  loadNotes: Record<string, LoadNote>
  eventNotes: Record<string, EventNote>
  /** 운송장id:사진시각 -> 쓰임 */
  photoTags: Record<string, { purpose: PhotoPurpose; ref?: string }>
  /** 운송장id:경보시각 -> 길 · 방향 · 풀린 바 */
  details: Record<string, AlertDetail>
  hub: Record<string, HubNote>
  hubFilter: Tone | null
}

export const ACCOUNT: Record<Role, { name: string; org: string }> = {
  driver: { name: '기사 A', org: 'PV5 오픈베드 · 개인 화물' },
  operator: { name: '허브 점검자 A', org: '관제 · 허브 점검' },
}

const KEY = 'jaejeok.phone.v1'
type Saved = Pick<PhoneState, 'role' | 'seen' | 'notify' | 'loadNotes' | 'eventNotes' | 'photoTags' | 'details'> & { hub: Record<string, Omit<HubNote, 'photos'>> }

const qs = new URLSearchParams(typeof location !== 'undefined' ? location.search : '')
const fresh = qs.has('fresh')

function loadSaved(): Partial<Saved> | null {
  if (fresh) return null
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as Partial<Saved>) : null
  } catch {
    return null
  }
}

const saved = loadSaved()
const qRole = qs.get('role')
const role: Role = qRole === 'operator' || qRole === 'driver' ? qRole : saved?.role ?? 'driver'
const qTab = qs.get('tab')
const tab: Tab = qTab === 'records' || qTab === 'settings' || qTab === 'hub' || qTab === 'load' ? (role === 'operator' ? (qTab === 'settings' ? 'settings' : 'hub') : qTab === 'hub' ? 'load' : (qTab as Tab)) : role === 'operator' ? 'hub' : 'load'

const savedHub: Record<string, HubNote> = {}
for (const [k, v] of Object.entries(saved?.hub ?? {})) savedHub[k] = { ...v, photos: [] }

export const phone = createStore<PhoneState>({
  role,
  tab,
  stacks: { load: [], records: [], hub: [], settings: [] },
  seen: saved?.seen ?? {},
  notify: saved?.notify ?? true,
  notif: null,
  toast: null,
  sheet: null,
  viewer: null,
  loadNotes: saved?.loadNotes ?? {},
  eventNotes: saved?.eventNotes ?? {},
  photoTags: saved?.photoTags ?? {},
  details: saved?.details ?? {},
  hub: savedHub,
  hubFilter: null,
})

let saveTimer: number | undefined
function persist() {
  window.clearTimeout(saveTimer)
  saveTimer = window.setTimeout(() => {
    const s = phone.get()
    const hub: Saved['hub'] = {}
    for (const [k, v] of Object.entries(s.hub)) {
      const { photos: _p, ...rest } = v
      hub[k] = rest
    }
    const out: Saved = { role: s.role, seen: s.seen, notify: s.notify, loadNotes: s.loadNotes, eventNotes: s.eventNotes, photoTags: s.photoTags, details: s.details, hub }
    try {
      localStorage.setItem(KEY, JSON.stringify(out))
    } catch {
      /* 저장소가 막힘: 화면은 그대로 */
    }
  }, 300)
}

// ── 탭 · 화면 쌓기 ──
export function switchTab(t: Tab) {
  const s = phone.get()
  if (s.tab === t) {
    if (s.stacks[t].length) phone.set({ stacks: { ...s.stacks, [t]: [] } })
    return
  }
  phone.set({ tab: t })
}

export function push(r: Route) {
  const s = phone.get()
  phone.set({ stacks: { ...s.stacks, [s.tab]: [...s.stacks[s.tab], r] } })
}

export function back() {
  const s = phone.get()
  const st = s.stacks[s.tab]
  if (st.length) phone.set({ stacks: { ...s.stacks, [s.tab]: st.slice(0, -1) } })
}

/** 이 탭의 쌓인 화면을 r 하나로 (예: 허브 -> 트럭 -> 점검 뒤 트럭으로) */
export function replaceTop(r: Route) {
  const s = phone.get()
  const st = s.stacks[s.tab]
  phone.set({ stacks: { ...s.stacks, [s.tab]: [...st.slice(0, -1), r] } })
}

/** 역할마다 보이는 탭: 기사 = 적재 · 기록 · 설정, 운영자 = 허브 · 설정 (기록은 기사 본인 것) */
export const TABS_OF: Record<Role, Tab[]> = { driver: ['load', 'records', 'settings'], operator: ['hub', 'settings'] }
/** 이 역할에 없는 탭이면 그 역할의 첫 탭으로 */
export const tabFor = (role: Role, t: Tab): Tab => (TABS_OF[role].includes(t) ? t : TABS_OF[role][0])

export function setRole(r: Role) {
  const s = phone.get()
  phone.set({ role: r, tab: tabFor(r, s.tab), hubFilter: null })
  persist()
}

// ── 토스트 · 시트 · 사진 보기 ──
let toastTimer: number | undefined
export function showToast(text: string, ms = 2600) {
  phone.set({ toast: text })
  window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => phone.set({ toast: null }), ms)
}
export const openSheet = (sheet: Sheet) => phone.set({ sheet })
export const closeSheet = () => phone.set({ sheet: null })
export const openViewer = (src: string, caption: string) => phone.set({ viewer: { src, caption } })
export const closeViewer = () => phone.set({ viewer: null })

// ── 사건 ──
export function markSeen(inc: Incident) {
  const s = phone.get()
  if ((s.seen[inc.key] ?? 0) >= inc.rank) return
  phone.set({ seen: { ...s.seen, [inc.key]: inc.rank }, notif: s.notif?.key === inc.key ? null : s.notif })
  persist()
}

export function openIncident(inc: Incident) {
  markSeen(inc)
  push({ name: 'event', key: inc.key })
}

export function setNotify(on: boolean) {
  phone.set({ notify: on, notif: on ? phone.get().notif : null })
  persist()
}

export const dismissNotif = () => phone.set({ notif: null })

export function saveLoadNote(wbId: string, note: LoadNote) {
  phone.set((s) => ({ loadNotes: { ...s.loadNotes, [wbId]: note } }))
  persist()
}

export function saveEventNote(key: string, note: EventNote) {
  phone.set((s) => ({ eventNotes: { ...s.eventNotes, [key]: note } }))
  persist()
}

export function tagPhoto(wbId: string, at: number, purpose: PhotoPurpose, ref?: string) {
  phone.set((s) => ({ photoTags: { ...s.photoTags, [wbId + ':' + at]: { purpose, ref } } }))
  persist()
}

/** 지금 운송장에 사진을 붙이고 쓰임(상차 · 조인 뒤 · 점검)을 적어 둔다 */
export function addWaybillPhoto(dataUrl: string, purpose: PhotoPurpose, ref?: string): boolean {
  const w = app.get().waybill
  if (!w) return false
  addPhoto(dataUrl)
  const w2 = app.get().waybill
  if (!w2) return false
  for (let i = w2.entries.length - 1; i >= 0; i--) {
    const e = w2.entries[i]
    if (e.kind === 'photo') {
      tagPhoto(w2.id, e.at, purpose, ref)
      break
    }
  }
  return true
}

// ── 허브 ──
export const EMPTY_HUB: HubNote = { ack: null, request: null, arrivedAt: null, checks: {}, photos: [], approval: null }
export function patchHub(id: string, p: Partial<HubNote> | ((h: HubNote) => Partial<HubNote>)) {
  phone.set((s) => {
    const cur = s.hub[id] ?? EMPTY_HUB
    const patch = typeof p === 'function' ? p(cur) : p
    return { hub: { ...s.hub, [id]: { ...cur, ...patch } } }
  })
  persist()
}
export const setHubFilter = (t: Tone | null) => phone.set({ hubFilter: t })

export function clearPhone() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* 없음 */
  }
  phone.set({ seen: {}, loadNotes: {}, eventNotes: {}, photoTags: {}, details: {}, hub: {}, notif: null, stacks: { load: [], records: [], hub: [], settings: [] } })
}

// ── 운전 중 잠금 ──
/**
 * 달리는 중 (엔진이 사건 안내를 미루는 동안): 기어 D 이고 2초 넘게 서 있지 않음.
 * 기사 휴대폰은 이때 화면을 잠그고 알림도 미뤘다가, P 이거나 2초 넘게 서면 보여 준다 (엔진의 말하는 때와 같다)
 */
export const isMoving = (out: MonitorOut | null) => !!out && out.mode === 'drive' && out.stoppedFor < SPEAK_STOP_S
/** 기사가 운전 중이면 true. 운영자(허브)는 운전하지 않으므로 잠그지 않는다 */
export function useLocked(): boolean {
  const role = useStore(phone, (s) => s.role)
  const moving = useStore(app, (s) => isMoving(s.out))
  return role === 'driver' && moving
}

// ── 읽기 손잡이 ──
export function useIncidents(): Incident[] {
  const wb = useStore(app, (s) => s.waybill)
  const history = useStore(app, (s) => s.history)
  return allIncidents(wb, history)
}

export function useUnread(): Incident[] {
  const list = useIncidents()
  const seen = useStore(phone, (s) => s.seen)
  return useMemo(() => list.filter((i) => (seen[i.key] ?? 0) < i.rank), [list, seen])
}

/** 사건의 길 · 방향 · 풀린 바 (마지막 경보 줄 것, 없으면 첫 줄 것) */
export function detailOf(inc: Incident | null): AlertDetail | null {
  if (!inc) return null
  const d = phone.get().details
  return d[inc.wb.id + ':' + inc.last.at] ?? d[inc.wb.id + ':' + inc.first.at] ?? null
}

// ── 운송장 지켜보기: 새 사건이면 알림 (Android 알림과 같은 글), 경보 값 받아 두기 ──
let lastWb: Waybill | null | undefined
let lastHist: Waybill[] | undefined
const known = new Map<string, number>()
let ready = false
let notifTimer: number | undefined
let started = false
/** 운전 중이라 미뤄 둔 알림 (서면 보여 준다) */
let queued: { key: string; rank: number } | null = null

function showNotif(q: { key: string; rank: number }) {
  phone.set({ notif: q })
  window.clearTimeout(notifTimer)
  // 위 알림은 6 초 뒤 사라진다 (§10.5 폰 3)
  notifTimer = window.setTimeout(() => phone.set({ notif: null }), 6000)
}

function watch() {
  const s = app.get()
  const locked = phone.get().role === 'driver' && isMoving(s.out)
  if (queued && !locked) {
    const q = queued
    queued = null
    const inc = allIncidents(s.waybill, s.history).find((i) => i.key === q.key)
    if (inc && !inc.resolvedAt && (phone.get().seen[inc.key] ?? 0) < inc.rank) showNotif({ key: inc.key, rank: inc.rank })
  }
  const a = s.out?.alert
  if (a && s.waybill) {
    const k = s.waybill.id + ':' + a.wallMs
    const d = phone.get().details[k]
    if (!d || d.shiftDir !== a.shiftDir || d.loose.c1 !== a.loose.c1 || d.loose.c2 !== a.loose.c2 || d.road !== a.road || d.dir !== a.dir) {
      phone.set((p) => ({ details: { ...p.details, [k]: { road: a.road, shiftDir: a.shiftDir, loose: { ...a.loose }, dir: a.dir } } }))
      persist()
    }
  }
  if (s.waybill === lastWb && s.history === lastHist) return
  lastWb = s.waybill
  lastHist = s.history
  const list = allIncidents(s.waybill, s.history)
  for (const inc of list) {
    const prev = known.get(inc.key)
    if (prev !== undefined && prev >= inc.rank) continue
    known.set(inc.key, inc.rank)
    if (!ready || inc.resolvedAt || inc.wb.id !== s.waybill?.id) continue
    const p = phone.get()
    const top = p.stacks[p.tab][p.stacks[p.tab].length - 1]
    if (top?.name === 'event' && top.key === inc.key) {
      markSeen(inc)
      continue
    }
    if (!p.notify) continue
    // 운전 중이면 미뤘다가 서면 (같은 사건이 올라가면 마지막 것 하나만)
    if (locked) queued = { key: inc.key, rank: inc.rank }
    else showNotif({ key: inc.key, rank: inc.rank })
  }
  ready = true
}

export function startPhone() {
  if (started) return
  started = true
  app.subscribe(watch)
  watch()
  ;(window as unknown as { __jjPhone?: unknown }).__jjPhone = { phone, switchTab, push, back, setRole, addWaybillPhoto, patchHub, openSheet, closeSheet }
}
