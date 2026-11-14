/**
 * 앱의 심장: 10 Hz 로 차량 신호 · 키트 값을 모아 판정 엔진(TripMonitor)에 넣고,
 * 나온 문장을 차례로 말하고(필요하면 5초 듣고 경유지), 사건을 운송장 기록에 남긴다.
 * 차량 신호 층(native/sim) -> 판정 엔진(engine/) -> 안내 층(화면 -> 음성 -> 5초 응답 -> 경유지)
 */
import { judgeLoad, type LoadInput, type LoadVerdict } from '@/engine/limit'
import { LINES } from '@/engine/lines'
import { TripMonitor, type MonitorOut, type Speech, type VehicleIn } from '@/engine/monitor'
import { nextRestArea, spokenName, REST_AREAS } from '@/engine/places'
import { ALERT_TITLE, exportWaybill, newWaybillId, type RecordEntry, type Waybill } from '@/engine/records'
import { LISTEN_S, DEFAULT_STF_N } from '@/engine/constants'
import { CARGO } from '@/engine/cargo'
import { KitFeed, isaacRun, type KitMode, type KitSnapshot } from './kit'
import { bridge, nativeInfo, onNative, type NativeInfo, type NativeVehicle } from './native'
import { VehicleSim, scenario, type ScenarioKey, type SimState } from './sim'
import { buzz, listen, speak, stopSpeaking, answerByDemo, unlockAudio, voiceKind, earKind, type Voice } from './speech'
import { createStore } from './store'

export type Screen = 'load' | 'home' | 'records' | 'relash'

export type Settings = {
  stfN: number
  voice: boolean
  recordedVoice: boolean
  demo: boolean
  kitUrl: string
  /** Virtual Console 처럼 핸들 각이 오면 조향비로 나눈다 (디버그) */
  steerIsWheel: boolean
  steeringRatio: number
  /** 주행 중 사용(DO) 승인 전: 주행 중 판정은 기록만 하고 정차 때 알린다 (즉시 경고는 키트 부저) */
  holdWhileDriving: boolean
}

export type KitView = { mode: KitMode; fresh: boolean; snap: KitSnapshot | null; ageS: number | null; runLabel: string | null; feedError: string | null }

export type AppState = {
  screen: Screen
  load: LoadInput | null
  waybill: Waybill | null
  history: Waybill[]
  out: MonitorOut | null
  vehicle: VehicleIn
  vehicleSource: 'native' | 'sim'
  sim: SimState
  scenario: string
  kit: KitView
  speech: { line: string | null; voice: Voice | null; listening: boolean; heard: string | null }
  waypoint: { name: string; aheadKm: number } | null
  settings: Settings
  native: NativeInfo | null
  toast: string | null
  relashFor: number | null
  eyeChecks: Record<string, boolean>
  unloads: number
}

const KEY = 'jaejeok.v1'
type Saved = { history: Waybill[]; waybill: Waybill | null; load: LoadInput | null; settings: Partial<Settings> }

/** 저장된 짐 정보가 지금 앱이 아는 짐 종류인가 (예전 버전의 시연용 짐 등은 버린다: 없는 종류를 읽으면 화면이 멈춘다) */
const knownLoad = (l: LoadInput | null | undefined): l is LoadInput =>
  !!l && typeof l === 'object' && Object.prototype.hasOwnProperty.call(CARGO, l.kind) && Number.isFinite(l.massKg) && Number.isFinite(l.belts)

function loadSaved(): Saved | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const s = JSON.parse(raw) as Saved
    const history = Array.isArray(s.history) ? s.history.filter((w) => w && knownLoad(w.input) && Array.isArray(w.entries)) : []
    const waybill = s.waybill && knownLoad(s.waybill.input) && Array.isArray(s.waybill.entries) ? s.waybill : null
    const load = knownLoad(s.load) ? s.load : null
    return { history, waybill: load ? waybill : null, load, settings: s.settings && typeof s.settings === 'object' ? s.settings : {} }
  } catch {
    return null
  }
}

const qs = new URLSearchParams(typeof location !== 'undefined' ? location.search : '')
const native = nativeInfo()
const saved = loadSaved()
const fresh = qs.has('fresh')

const DEFAULT_SETTINGS: Settings = {
  stfN: DEFAULT_STF_N,
  voice: true,
  recordedVoice: false,
  demo: qs.has('demo') ? qs.get('demo') !== '0' : native ? native.debug : true,
  kitUrl: native ? 'http://10.0.2.2:8787/kit' : 'http://localhost:8787/kit',
  steerIsWheel: false,
  steeringRatio: 16,
  holdWhileDriving: false,
}

const IDLE_VEHICLE: VehicleIn = { speedKmh: 0, steerDeg: 0, brake: null, gear: 'P', uxRestricted: null, road: 'highway', caution: null, place: null }

export const app = createStore<AppState>({
  screen: !fresh && saved?.load ? 'home' : 'load',
  load: fresh ? null : saved?.load ?? null,
  waybill: fresh ? null : saved?.waybill ?? null,
  history: fresh ? [] : saved?.history ?? [],
  out: null,
  vehicle: IDLE_VEHICLE,
  vehicleSource: native?.car ? 'native' : 'sim',
  sim: new VehicleSim().s,
  scenario: '',
  kit: { mode: 'off', fresh: false, snap: null, ageS: null, runLabel: null, feedError: null },
  speech: { line: null, voice: null, listening: false, heard: null },
  waypoint: null,
  settings: { ...DEFAULT_SETTINGS, ...(saved?.settings ?? {}), demo: qs.has('demo') ? qs.get('demo') !== '0' : saved?.settings?.demo ?? DEFAULT_SETTINGS.demo },
  native,
  toast: null,
  relashFor: null,
  eyeChecks: { '고리 체결': false, '모서리 보호대': false, 넘어짐: false },
  unloads: 0,
})

const monitor = new TripMonitor()
export const sim = new VehicleSim()
export const kit = new KitFeed()
let nativeVehicle: NativeVehicle | null = null
let nativeAt = 0
/** 차의 속도 값은 온 때마다 받은 시각과 함께 모은다 (10 Hz 로 다시 뽑으면 계단이 생겨 감속이 커 보인다) */
let speedQueue: [number, number][] = []

/** 차 시계(elapsedRealtime, s) -> 앱 시계 (가장 짧게 걸린 전달 시간으로 맞춘다) */
let clockOffset: number | null = null

onNative({
  onVehicle: (json: string) => {
    try {
      const o = JSON.parse(json) as NativeVehicle & { speedT?: number }
      // 조향 값의 출처를 메시지마다 붙인다: Pleos Vehicle SDK = 핸들 각(±540°), AAOS PERF_STEERING_ANGLE = 앞바퀴 각
      if (typeof o.steerDeg === 'number' && !o.steerSource) o.steerSource = 'aaos'
      const wasOpen = (nativeVehicle?.rearDoor ?? 0) > 0
      nativeVehicle = { ...(nativeVehicle ?? {}), ...o }
      // Pleos Vehicle SDK 뒷문(테일게이트): 정차 중 닫힘 -> 열림 이면 짐을 내린 것으로 (남은 짐의 바 확인 안내)
      if (typeof o.rearDoor === 'number' && o.rearDoor > 0 && !wasOpen) {
        const st = app.get()
        if (st.load && (st.out?.mode ?? 'park') === 'park') window.setTimeout(unloadSome, 0)
      }
      nativeAt = performance.now() / 1000
      // 차 신호가 늦게 붙어도 (첫 메시지 때) 차 신호를 쓴다
      if (app.get().vehicleSource !== 'native') app.set({ vehicleSource: 'native' })
      if (typeof o.speedKmh === 'number' && Number.isFinite(o.speedKmh)) {
        let t = nativeAt
        if (typeof o.speedT === 'number' && o.speedT > 0) {
          const off = nativeAt - o.speedT
          clockOffset = clockOffset === null ? off : Math.min(clockOffset, off)
          t = o.speedT + clockOffset
        }
        speedQueue.push([t, o.speedKmh])
        if (speedQueue.length > 200) speedQueue = speedQueue.slice(-100)
      }
    } catch {
      /* 무시 */
    }
  },
  // Pleos NaviHelper: 경유지(쉼터)에 닿음 -> 정차하면 다시 묶기 화면이 뜬다
  onWaypointArrived: (name: string) => {
    const wp = app.get().waypoint
    if (wp) app.set({ waypoint: { ...wp, aheadKm: 0 } })
    toast((name || wp?.name || '쉼터') + '에 도착했습니다. 세우면 다시 묶기를 안내합니다', 4200)
  },
})

// ── 저장 ──
let saveTimer: number | undefined
function persist() {
  window.clearTimeout(saveTimer)
  saveTimer = window.setTimeout(() => {
    const s = app.get()
    try {
      // 사진은 크니 마지막 50건만
      localStorage.setItem(KEY, JSON.stringify({ history: s.history.slice(-50), waybill: s.waybill, load: s.load, settings: s.settings } satisfies Saved))
    } catch {
      /* 저장소가 꽉 참 · 막힘: 화면은 그대로 동작 */
    }
  }, 400)
}

function addEntry(e: RecordEntry) {
  const w = app.get().waybill
  if (!w) return
  const next = { ...w, entries: [...w.entries, e] }
  app.set({ waybill: next })
  persist()
}

/** 사건 기록은 처음 잡힌 순간의 값이라, 사건이 끝날 때까지 커지는 값(받은 세기 · 짐 이동)을 같은 줄에 고쳐 쓴다 */
function updateAlertEntry(a: { wallMs: number; peakG: number | null; shiftMm: number | null }) {
  const w = app.get().waybill
  if (!w) return
  const i = w.entries.findIndex((e) => e.kind === 'alert' && e.at === a.wallMs)
  if (i < 0) return
  const e = w.entries[i]
  if (e.kind !== 'alert' || (e.peakG === a.peakG && e.shiftMm === a.shiftMm)) return
  const entries = w.entries.slice()
  entries[i] = { ...e, peakG: a.peakG, shiftMm: a.shiftMm }
  app.set({ waybill: { ...w, entries } })
  persist()
}

let toastTimer: number | undefined
export function toast(text: string, ms = 2600) {
  app.set({ toast: text })
  window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => app.set({ toast: null }), ms)
}

// ── 상차 ──
export function verdictFor(input: LoadInput | null): LoadVerdict {
  const st = app.get()
  const now = performance.now() / 1000
  const snap = kit.snapshot(now)
  const fresh = !!snap && now - snap.frame.t <= 3 && !snap.frame.fault
  const t = fresh && snap ? { c1: snap.frame.c1, c2: snap.frame.c2 } : null
  return judgeLoad(input ? { ...input, stfN: input.stfN ?? st.settings.stfN } : null, t)
}

/** 상차 정보 확정. 새 운송장이면 상차마다 세는 것들을 처음으로 */
export function confirmLoad(input: LoadInput, opts: { newWaybill?: boolean } = {}) {
  unlockAudio()
  const st = app.get()
  const full = { ...input, stfN: input.stfN ?? st.settings.stfN }
  let w = st.waybill
  const isNew = !w || !!w.closedAt || opts.newWaybill
  if (isNew) {
    if (w && !w.closedAt) w = { ...w, closedAt: Date.now() }
    const history = w ? [...st.history.filter((h) => h.id !== w!.id), w] : st.history
    w = { id: newWaybillId(), createdAt: Date.now(), input: full, entries: [], closedAt: null }
    monitor.newLoading()
    app.set({ history, waybill: w, unloads: 0, eyeChecks: { '고리 체결': false, '모서리 보호대': false, 넘어짐: false } })
  } else if (w) {
    w = { ...w, input: full }
    app.set({ waybill: w })
  }
  const v = verdictFor(full)
  app.set({ load: full, screen: 'home' })
  addEntry({ kind: 'load', at: Date.now(), tone: v.tone, title: v.title, limit: v.limit, crit: v.crit, input: full })
  if (v.tone === 'green') addEntry({ kind: 'green', at: Date.now(), limit: v.limit })
  persist()
}

export function goto(screen: Screen) {
  unlockAudio()
  app.set({ screen })
}

export function setEyeCheck(k: string, v: boolean) {
  app.set((s) => ({ eyeChecks: { ...s.eyeChecks, [k]: v } }))
}

/** 운행 종료: 이 운송장을 닫고 기록으로 */
export function closeWaybill() {
  const st = app.get()
  if (!st.waybill) return
  const w = { ...st.waybill, closedAt: Date.now() }
  app.set({ history: [...st.history.filter((h) => h.id !== w.id), w], waybill: null, load: null, screen: 'load' })
  monitor.newLoading()
  persist()
}

// ── 정차 후 ──
export function relashDone() {
  unlockAudio()
  monitor.relashDone()
  // 시연: 키트 장력을 다시 조인 값으로 (실제로는 키트가 새 장력을 보낸다)
  if (kit.mode === 'isaac' || kit.mode === 'manual') kit.retighten()
  app.set({ relashFor: null, waypoint: null, screen: 'home' })
  window.setTimeout(() => {
    const v = verdictFor(app.get().load)
    addEntry({ kind: 'relash', at: Date.now(), limit: v.limit })
  }, 150)
  toast('다시 조인 것을 기록했습니다')
}

export function unloadSome() {
  unlockAudio()
  const s = monitor.unload(performance.now() / 1000)
  app.set({ unloads: monitor.unloads })
  addEntry({ kind: 'unload', at: Date.now(), count: monitor.unloads })
  if (s) enqueueSpeech([s])
  else toast('남은 짐의 바를 확인하세요 (첫 하차 뒤로는 말하지 않고 화면에만 띄웁니다)', 4200)
}

/** 시범 운영: 빨강 뒤 정차해서 기사가 누르는 '밀림 있음 · 없음' */
export function reportMoved(moved: boolean) {
  addEntry({ kind: 'feedback', at: Date.now(), moved })
  toast(moved ? '밀림 있음으로 기록했습니다' : '밀림 없음으로 기록했습니다')
}

export function addPhoto(dataUrl: string) {
  addEntry({ kind: 'photo', at: Date.now(), dataUrl })
  toast('사진을 기록에 붙였습니다')
}

export function downloadWaybill(id: string) {
  const st = app.get()
  const w = st.waybill?.id === id ? st.waybill : st.history.find((h) => h.id === id)
  if (!w) return
  const text = JSON.stringify(exportWaybill(w), null, 2)
  const name = '적재기록_' + w.id + '.json'
  const b = bridge()
  if (b) {
    const where = b.saveFile(name, 'application/json', text)
    toast(where ? '내보냄: ' + where : '내보내지 못했습니다')
    return
  }
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 2000)
  toast('이 건만 내보냈습니다')
}

export function setSettings(p: Partial<Settings>) {
  app.set((s) => ({ settings: { ...s.settings, ...p } }))
  persist()
}

export function clearAll() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* 없음 */
  }
  monitor.newLoading()
  app.set({ history: [], waybill: null, load: null, screen: 'load', relashFor: null, waypoint: null })
}

// ── 음성 차례 ──
const queue: Speech[] = []
let held: Speech[] = []
let speaking = false

function enqueueSpeech(list: Speech[]) {
  for (const s of list) queue.push(s)
  void drain()
}

async function drain() {
  if (speaking) return
  speaking = true
  while (queue.length) {
    const s = queue.shift()!
    const st = app.get()
    app.set({ speech: { ...st.speech, line: s.text, heard: null } })
    // 말하기 시작할 때 기록한다 (10분 규칙도 이때부터)
    monitor.spoken(s, performance.now() / 1000)
    addEntry({ kind: 'speech', at: Date.now(), text: s.text })
    let v: Voice = 'none'
    if (st.settings.voice) v = await speak(s.text, { prefer: st.settings.recordedVoice ? 'recorded' : 'auto' })
    else await new Promise((r) => window.setTimeout(r, 1200 + s.text.length * 60))
    app.set({ speech: { ...app.get().speech, voice: v } })
    if (s.ask === 'restArea') await askRestArea()
    window.setTimeout(() => {
      if (app.get().speech.line === s.text) app.set({ speech: { ...app.get().speech, line: null } })
    }, 2500)
  }
  speaking = false
}

async function askRestArea() {
  app.set({ speech: { ...app.get().speech, listening: true, heard: null } })
  const h = await listen(LISTEN_S)
  app.set({ speech: { ...app.get().speech, listening: false, heard: h?.heard ?? null } })
  addEntry({ kind: 'answer', at: Date.now(), heard: h ? h.heard + (h.by === 'demo' ? ' (시연 입력)' : '') : '(대답 없음)', yes: !!h?.yes })
  if (!h?.yes) return
  const area = nextRestArea(sim.s.posKm) ?? (REST_AREAS.length ? { ...REST_AREAS[0], aheadKm: 0 } : null)
  if (!area) {
    enqueueSpeech([{ id: 'wp-none', key: 'wp', text: LINES.waypointNone, kind: 'info' }])
    return
  }
  const name = spokenName(area)
  // NaviHelper addWaypoint (껍데기에 있으면). 없으면 앱 안에서만 경유지로 둔다
  bridge()?.addWaypoint(area.name, area.lat, area.lng)
  monitor.setWaypoint(area.name)
  app.set({ waypoint: { name: area.name, aheadKm: area.aheadKm } })
  addEntry({ kind: 'waypoint', at: Date.now(), name })
  const text = LINES.waypointAdded(name)
  const st = app.get()
  addEntry({ kind: 'speech', at: Date.now(), text })
  app.set({ speech: { ...app.get().speech, line: text } })
  if (st.settings.voice) await speak(text, { prefer: st.settings.recordedVoice ? 'recorded' : 'auto' })
}

export const answerYes = () => answerByDemo('네')

// ── 시연 패널 ──
const deps = {
  startIsaacHold: (key: string) => {
    kit.holdIsaacAtStart(key, performance.now() / 1000)
    const r = isaacRun(key)
    if (r) {
      const st = app.get()
      // Isaac Sim 경우와 같은 상차 정보 (짐 종류 · 무게 · 벨트 수 · 종류). 각도 · 마찰은 앱 기본값 그대로 (키트 없는 판정과 같은 조건)
      const kind = (['box', 'pallet', 'appliance', 'furniture', 'material'].includes(r.cargo) ? r.cargo : 'box') as LoadInput['kind']
      const input: LoadInput = { kind, massKg: r.massKg, belts: r.belts, beltType: r.rubber ? 'rubber' : 'ratchet', frontWall: false, stfN: st.settings.stfN }
      const same = st.load && st.load.kind === input.kind && st.load.massKg === input.massKg && st.load.belts === input.belts && st.load.beltType === input.beltType
      if (!same) confirmLoad(input, { newWaybill: true })
      app.set({ screen: 'home' })
    }
  },
  releaseIsaac: () => kit.releaseIsaac(performance.now() / 1000),
  isaacEnded: () => kit.isaacEnded(performance.now() / 1000),
  isaacSpeed: () => kit.snapshot(performance.now() / 1000)?.extras.speedKmh ?? null,
  isaacDrive: () => {
    const e = kit.snapshot(performance.now() / 1000)?.extras
    return e && e.steerDeg != null ? { steerDeg: e.steerDeg, brake: e.brake ?? 0 } : null
  },
  kitOff: () => {
    if (kit.mode === 'isaac') kit.off()
  },
}

export function playScenario(key: ScenarioKey) {
  unlockAudio()
  const sc = scenario(key, deps)
  // 키트 대본은 시험대 짐으로 상차 정보를 스스로 넣는다
  if (!key.startsWith('kit-') && key !== 'arrive' && key !== 'depart' && !app.get().load) {
    toast('먼저 상차 정보를 입력하세요')
    return
  }
  sim.play(key, sc.steps, sc.label)
}

export const simControl = {
  gear: (g: 'P' | 'D') => sim.setGear(g),
  target: (v: number) => sim.setTarget(v),
  hardBrake: () => sim.hardBrake(),
  steer: (d: number) => sim.setSteer(d),
  road: (r: 'highway' | 'local') => sim.setRoad(r),
  caution: (t: 'bump' | 'downhill' | 'slippery') => sim.addCaution(t, 420),
  speedHz: (hz: number) => (sim.s.speedHz = hz),
  stop: () => sim.stopScenario(),
}

export const kitControl = {
  isaac: (key: string) => {
    kit.startIsaac(key, performance.now() / 1000)
    kit.holdIsaacAtStart(key, performance.now() / 1000)
  },
  manual: () => kit.startManual(),
  feed: () => kit.startFeed(app.get().settings.kitUrl),
  off: () => kit.off(),
  setManual: (p: Partial<KitFeed['manual']>) => Object.assign(kit.manual, p),
}

// ── 10 Hz ──
let last = performance.now() / 1000
let started = false

function vehicleNow(now: number): VehicleIn {
  const st = app.get()
  // 디버그 시연: 대본이 돌거나 PC 스크립트가 속도를 넣으면 시연 차량을 쓴다 (차 신호보다 먼저)
  // (대본이 끝나도 시연 차량이 P 로 설 때까지는 시연 차량이 계속 몬다)
  const scripted = st.settings.demo && (sim.busy || sim.s.replayKmh !== null || sim.s.gear !== 'P' || sim.s.speedKmh > 0)
  if (st.vehicleSource === 'native' && nativeVehicle && now - nativeAt < 5 && scripted) {
    // 디버그 시연 + 차 신호: 속도는 시연 차량(에뮬레이터 VHAL 은 속도를 0 으로만 보낸다), 나머지는 차 신호가 있으면 차 신호.
    // 발표자가 Virtual Console 로 밟은 브레이크 · 돌린 핸들 · 바꾼 기어, adb 주행 규제가 그대로 들어간다.
    const n = nativeVehicle
    const simV = sim.snapshot(now)
    let steer = n.steerDeg ?? null
    if (steer !== null && (n.steerSource === 'pleos' || n.steerIsWheel || st.settings.steerIsWheel)) steer = steer / Math.max(1, st.settings.steeringRatio)
    return {
      ...simV,
      // 핸들: 발표자가 돌렸으면(앞바퀴 0.5° 넘게) 그 값, 아니면 대본(Isaac 기록)의 값
      steerDeg: steer !== null && Math.abs(steer) > 0.5 ? steer : simV.steerDeg,
      brake: n.brake === true ? true : simV.brake,
      // 기어: 발표자가 P 가 아닌 기어를 고르면 그 값 (P 이면 대본의 기어로 달린다)
      gear: n.gear && n.gear !== 'P' ? n.gear : simV.gear,
      // 주행 규제: 발표자가 adb 로 켜면(true) 그 값, 아니면 대본의 기어로 판단 (에뮬레이터는 멈춰 있으면 늘 false 를 보낸다)
      uxRestricted: n.uxRestricted === true ? true : simV.uxRestricted,
      odometerKm: n.odometerKm ?? null,
      caution: n.caution != null ? n.caution : simV.caution,
    }
  }
  if (st.vehicleSource === 'native' && nativeVehicle && now - nativeAt < 5 && !scripted) {
    const n = nativeVehicle
    let steer = n.steerDeg ?? null
    // 핸들 각이면 조향비로 나눠 앞바퀴 각으로 (Pleos SDK 값은 늘 핸들 각)
    if (steer !== null && (n.steerSource === 'pleos' || n.steerIsWheel || st.settings.steerIsWheel)) steer = steer / Math.max(1, st.settings.steeringRatio)
    const simV = sim.snapshot(now)
    const samples = speedQueue
    speedQueue = []
    return {
      speedSamples: samples,
      speedKmh: n.speedKmh ?? null,
      steerDeg: steer,
      brake: n.brake ?? null,
      gear: n.gear ?? (n.parkingBrake ? 'P' : null),
      uxRestricted: n.uxRestricted ?? null,
      odometerKm: n.odometerKm ?? null,
      road: simV.road,
      // Pleos NaviHelper 의 앞 주의 지점 (없으면 시연 값)
      caution: n.caution !== undefined ? n.caution : simV.caution,
      place: n.lat != null && n.lng != null ? n.lat.toFixed(4) + ', ' + n.lng.toFixed(4) : null,
    }
  }
  return sim.snapshot(now)
}

function tick() {
  const now = performance.now() / 1000
  const dt = Math.min(0.5, Math.max(0, now - last))
  last = now
  // 디버그(시연): PC 스크립트가 키트 형식에 속도 · 기어를 실어 보내면 시연용 차량이 그 값을 따른다
  // (기획서: Virtual Console 에 속도 입력이 없어 디버그 빌드에서 스크립트가 속도를 넣는다)
  const feedSnap = kit.mode === 'feed' ? kit.snapshot(now) : null
  if (feedSnap && now - feedSnap.frame.t < 3 && feedSnap.extras.speedKmh != null && app.get().settings.demo) {
    sim.s.replayKmh = feedSnap.extras.speedKmh
    if (feedSnap.extras.gear) sim.s.gear = feedSnap.extras.gear
  } else if (kit.mode === 'feed' && !sim.busy) sim.s.replayKmh = null
  sim.step(dt, now)
  const st = app.get()
  const v = vehicleNow(now)
  const snap = kit.snapshot(now)
  const load = st.load ? { ...st.load, stfN: st.load.stfN ?? st.settings.stfN } : null
  const out = monitor.step(now, Date.now(), v, snap?.frame ?? null, load)

  for (const e of out.events) {
    if (e.type === 'depart') {
      kit.zeroShift()
      addEntry({ kind: 'depart', at: e.wallMs, tone: e.verdict.tone, title: e.verdict.title, kit: e.kit })
    } else if (e.type === 'park') addEntry({ kind: 'park', at: e.wallMs, km: Math.round(e.km * 10) / 10 })
    else if (e.type === 'alert') {
      const a = e.alert
      addEntry({ kind: 'alert', at: e.wallMs, alert: a.kind, title: ALERT_TITLE[a.kind], peakG: a.peakG, limitG: a.limitG, dir: a.dir, shiftMm: a.shiftMm, place: a.place, measured: a.measured })
      if (a.kind === 'lost') addEntry({ kind: 'company', at: e.wallMs, text: '짐 이탈 의심: 시각과 위치를 회사에 알림 (시연: 전송 없음)' })
    }
  }
  if (out.alert) updateAlertEntry(out.alert)
  // 승인 전 모드: 주행 중에는 말을 모아 두었다가 정차하면 한 번에 (같은 key 는 마지막 것만)
  if (st.settings.holdWhileDriving && out.mode === 'drive') {
    for (const sp of out.speak) {
      held = held.filter((h) => h.key !== sp.key)
      held.push({ ...sp, ask: undefined })
    }
  } else {
    if (held.length && out.mode === 'park') {
      enqueueSpeech(held)
      held = []
    }
    if (out.speak.length) enqueueSpeech(out.speak)
  }
  if (out.buzzer && st.settings.voice) buzz()

  // 정차했고 사건이 있으면 다시 묶기 화면으로 (사건마다 한 번)
  let screen = st.screen
  let relashFor = st.relashFor
  if (out.mode === 'park' && out.alert && relashFor !== out.alert.at) {
    relashFor = out.alert.at
    screen = 'relash'
  }
  const kv: KitView = {
    mode: kit.mode,
    fresh: out.kitFresh,
    snap,
    ageS: kit.ageS(now),
    runLabel: kit.mode === 'isaac' ? kit.run_?.label ?? null : null,
    feedError: kit.mode === 'feed' ? kit.feedError : null,
  }
  app.set({ out, vehicle: v, sim: { ...sim.s }, scenario: sim.scenarioLabel, kit: kv, screen, relashFor })
}

export function startRuntime() {
  if (started) return
  started = true
  // 개발 · 시험용 손잡이 (브라우저 콘솔)
  ;(window as unknown as { __jj?: unknown }).__jj = { app, sim, kit, monitor, confirmLoad, playScenario, simControl, kitControl, relashDone, answerYes }
  last = performance.now() / 1000
  window.setInterval(tick, 100)
  // Android 껍데기가 0.1초마다 부른다: 화면 뒤(숨은 WebView)에서는 타이머가 느려지거나 멈추므로 네이티브가 판정 루프를 깨운다.
  // 타이머가 살아 있으면 겹치지 않게 건너뛴다
  ;(window as unknown as { __jjTick?: () => void }).__jjTick = () => {
    if (performance.now() / 1000 - last >= 0.06) tick()
  }
  tick()
}

export const capabilities = () => ({ voice: voiceKind(), ear: earKind() })
export { stopSpeaking }

// ── phone ──
/**
 * 휴대폰 판(L4 허브): 관제 · 점검자 기록을 지금 운송장에 남긴다 (점검 정차 요청, 기록만 남기고 계속, 점검 승인).
 * 기록 종류는 엔진의 'company' 그대로 (내비 기록 화면에도 '회사 알림' 줄로 보인다). 운송장이 없으면 아무것도 안 한다.
 */
export function addOperatorNote(text: string) {
  addEntry({ kind: 'company', at: Date.now(), text })
}
