/**
 * 주행 감시 (상태 기계). 차량 신호 + (있으면) 키트 값 + 상차 정보 -> 화면 색 한 줄, 말할 문장, 기록할 사건.
 * 부작용 없음: 말하기 · 듣기 · 경유지 · 저장은 runtime 이 한다. 시험은 engine.test.ts.
 *
 * [표 2] 상태: 초록 기준 충족 / 주황 밀릴 수 있음 · 넘어짐 확인 / 빨강 확인 필요(키트 없음) · 바 풀림 · 짐 밀림 · 짐 이탈 의심(키트) / 회색 판정 불가
 * 말하는 때: 사건 안내는 브레이크를 떼고 핸들이 곧게 돌아온 뒤, 또는 2초 넘게 선 뒤. 주의 구간은 상차 한 번에 세 번까지,
 *   "확인 필요"는 다음에 설 때까지 한 번, 같은 안내는 10분 안에 되풀이하지 않는다. 정차 중 벨트를 푸는 것은 경고하지 않는다.
 * 재점검: 출발 뒤 처음 설 때와 80 km마다, 일부 하차 뒤에는 첫 하차 때만 말하고 그 뒤로는 화면에만.
 */
import {
  BRAKE_INFER_G, BUZZER_CALM_G, CAUTION_MAX, CAUTION_SPEAK_M, KIT_STALE_S, LOOSE_RATIO, LOST_RATIO, MIN_SPEED_HZ, MOVING_KMH,
  RECHECK_KM, SAME_NOTICE_S, SHIFT_MOVED_MM, SPEAK_STOP_S, STEER_STRAIGHT_DEG,
} from './constants.ts'
import { LINES } from './lines.ts'
import { judgeLoad, type LoadInput, type LoadVerdict, type Tone } from './limit.ts'
import { MotionEstimator } from './motion.ts'

export type Gear = 'P' | 'R' | 'N' | 'D'
export type Road = 'highway' | 'local'
export type CautionType = 'bump' | 'downhill' | 'slippery'
export type CautionPoint = { id: string; type: CautionType; distM: number }
export type ShiftDir = 'front' | 'rear' | 'left' | 'right'

export type VehicleIn = {
  speedKmh: number | null
  /** 앞바퀴 조향각 (도) */
  steerDeg: number | null
  brake: boolean | null
  gear: Gear | null
  /** 주행 규제 (CarUxRestrictions). null 이면 기어로 본다 */
  uxRestricted: boolean | null
  road: Road
  caution: CautionPoint | null
  place: string | null
  /** 차에서 온 속도 값들 (받은 시각 s, km/h). 있으면 now 의 값 대신 이것으로 감속을 구한다 */
  speedSamples?: [number, number][]
  /** 누적 주행거리 (km, Pleos Vehicle SDK Odometer). 있으면 재점검 거리를 이것으로 센다 (없으면 속도를 적분) */
  odometerKm?: number | null
}

export type KitIn = {
  /** 받은 시각 (monitor 의 now 와 같은 시계, s) */
  t: number
  c1: number | null
  c2: number | null
  /** 적재함 앞뒤 가속 (g, + 앞으로 가속, - 제동) */
  axG: number | null
  ayG: number | null
  /** 출발 뒤 짐이 움직인 거리 (mm) 와 방향 */
  shiftMm: number
  shiftDir: ShiftDir | null
  tagShock: boolean
  tagLost: boolean
  fault: boolean
}

export type AlertKind = 'check' | 'loose' | 'moved' | 'lost'
export const ALERT_RANK: Record<AlertKind, number> = { check: 1, loose: 2, moved: 3, lost: 4 }

export type ActiveAlert = {
  kind: AlertKind
  at: number
  wallMs: number
  road: Road
  /** 받은 세기 (g) 와 그 방향, 짐이 버티는 한계 */
  peakG: number | null
  dir: 'brake' | 'turn' | 'accel' | null
  limitG: number
  shiftMm: number | null
  shiftDir: ShiftDir | null
  loose: { c1: boolean; c2: boolean }
  place: string | null
  measured: boolean
}

export type SpeechKind = 'event' | 'caution' | 'depart' | 'recheck' | 'info'
export type Speech = { id: string; key: string; text: string; kind: SpeechKind; ask?: 'restArea' }

export type MonitorEvent =
  | { type: 'depart'; wallMs: number; verdict: LoadVerdict; kit: boolean }
  | { type: 'park'; wallMs: number; km: number }
  | { type: 'alert'; wallMs: number; alert: ActiveAlert }
  | { type: 'caution'; wallMs: number; caution: CautionType; text: string }

export type Status = { tone: Tone; title: string; line: string; reason: AlertKind | 'load' | 'grey' }

export type Estimates = { decel: number | null; lat: number | null; accel: number | null; source: 'kit' | 'speed' | 'none'; speedHz: number }

export type MonitorOut = {
  mode: 'park' | 'drive'
  status: Status
  /** 지금 판정 (정차 중 키트 값이 바뀌면 바로 바뀜) */
  verdict: LoadVerdict
  departVerdict: LoadVerdict | null
  kitFresh: boolean
  est: Estimates
  alert: ActiveAlert | null
  speak: Speech[]
  events: MonitorEvent[]
  buzzer: boolean
  kmSinceLoad: number
  greyReason: string | null
  stoppedFor: number
}

const CAUTION_LINE: Record<CautionType, string> = {
  bump: LINES.cautionBump,
  downhill: LINES.cautionSection,
  slippery: LINES.cautionSection,
}
export const CAUTION_SHORT: Record<CautionType, string> = { bump: '앞에 방지턱 · 천천히', downhill: '앞에 내리막 · 천천히', slippery: '미끄러운 길 · 천천히' }

let seq = 0
const sid = () => 's' + ++seq

export class TripMonitor {
  private motion = new MotionEstimator()
  private mode: 'park' | 'drive' = 'park'
  private lastNow = 0
  private stoppedSince: number | null = 0
  private km = 0
  /** 마지막으로 받은 누적 주행거리 (km). null 이면 아직 없음 */
  private odoLast: number | null = null
  private departVerdict: LoadVerdict | null = null
  private baseline: { c1: number | null; c2: number | null } | null = null
  private looseSince: number | null = null
  private alert: ActiveAlert | null = null
  private alertSpokenRank = 0
  private checkSpoken = false
  private pending: Speech[] = []
  private lastSaid = new Map<string, number>()
  private cautionCount = 0
  private cautionDone = new Set<string>()
  private firstStopDone = false
  private recheckAt = RECHECK_KM
  private recheckDue = false
  private unloadCount = 0
  private hadTrip = false
  private eventAt = -10
  private calmSince: number | null = null
  private buzzed = false
  private peak = { decel: 0, lat: 0, accel: 0, at: -10 }
  private waypoint: string | null = null
  private eventsOut: MonitorEvent[] = []

  /** 새 상차: 상차마다 세는 것들을 처음으로 */
  newLoading() {
    this.cautionCount = 0
    this.cautionDone.clear()
    this.firstStopDone = false
    this.km = 0
    this.odoLast = null
    this.recheckAt = RECHECK_KM
    this.recheckDue = false
    this.unloadCount = 0
    this.alert = null
    this.alertSpokenRank = 0
    this.checkSpoken = false
    this.pending = []
    this.waypoint = null
    this.hadTrip = false
    this.baseline = null
    this.departVerdict = null
  }

  get activeAlert() {
    return this.alert
  }
  get waypointName() {
    return this.waypoint
  }
  get unloads() {
    return this.unloadCount
  }

  setWaypoint(name: string | null) {
    this.waypoint = name
  }

  /** 정차 후 "다시 조였어요": 경보를 풀고 기준 장력을 다시 잡는다 */
  relashDone() {
    this.alert = null
    this.alertSpokenRank = 0
    this.baseline = null
    this.looseSince = null
    this.waypoint = null
    this.buzzed = false
    this.pending = this.pending.filter((p) => p.kind !== 'event')
  }

  /** 일부 하차: 첫 하차 때만 말하고, 그 뒤로는 화면에만 (null) */
  unload(nowS: number): Speech | null {
    this.unloadCount += 1
    this.baseline = null
    if (this.unloadCount === 1) return this.say('unload', LINES.unloadFirst, 'recheck', nowS, true)
    return null
  }

  private say(key: string, text: string, kind: SpeechKind, nowS: number, force = false, ask?: 'restArea'): Speech | null {
    const last = this.lastSaid.get(text)
    if (!force && last !== undefined && nowS - last < SAME_NOTICE_S) return null
    return { id: sid(), key, text, kind, ask }
  }

  /** runtime 이 실제로 말한 뒤 부른다 (10분 규칙) */
  spoken(s: Speech, nowS: number) {
    this.lastSaid.set(s.text, nowS)
  }

  private enqueue(s: Speech | null) {
    if (!s) return
    // 같은 key 의 아직 안 한 말은 새 것으로 바꾼다 (예: 짐 밀림 -> 짐 이탈 의심)
    this.pending = this.pending.filter((p) => p.key !== s.key)
    this.pending.push(s)
  }

  step(now: number, wallMs: number, v: VehicleIn, kit: KitIn | null, load: LoadInput | null): MonitorOut {
    const dt = this.lastNow ? Math.max(0, Math.min(1, now - this.lastNow)) : 0
    this.lastNow = now
    this.eventsOut = []
    const speak: Speech[] = []

    // ── 신호 ──
    if (v.speedSamples) for (const [t, k] of v.speedSamples) this.motion.push(t, k)
    else this.motion.push(now, v.speedKmh)
    const speedHz = this.motion.rateHz(now)
    const speed = v.speedKmh ?? 0
    const moving = speed > MOVING_KMH
    if (moving) this.stoppedSince = null
    else if (this.stoppedSince === null) this.stoppedSince = now
    const stoppedFor = this.stoppedSince === null ? 0 : now - this.stoppedSince
    // 거리: 누적 주행거리가 오면 그 차이로 (한 번에 0 ~ 5 km 만 믿는다), 아니면 속도를 적분
    const odo = typeof v.odometerKm === 'number' && Number.isFinite(v.odometerKm) ? v.odometerKm : null
    if (odo !== null) {
      if (this.odoLast !== null) {
        const d = odo - this.odoLast
        if (d >= 0 && d < 5) this.km += d
      }
      this.odoLast = odo
    } else if (v.speedKmh !== null) this.km += (speed / 3600) * dt

    const kitFresh = !!kit && now - kit.t <= KIT_STALE_S && !kit.fault
    const kitT = kitFresh && kit ? { c1: kit.c1, c2: kit.c2 } : null

    // ── 모드: 주행 규제가 켜져 있으면 주행. 아니면 기어(P 가 아니면 주행), 기어도 없으면 주행 규제 값, 그것도 없으면 속도 ──
    // (Pleos 에뮬레이터: D 에서 주행 규제가 켜진다. 규제를 꺼 둔 개발 환경에서도 D 로 달리면 주행으로 본다)
    const driveNow = v.uxRestricted === true || (v.gear !== null ? v.gear !== 'P' : v.uxRestricted === null ? moving : false)
    const nextMode: 'park' | 'drive' = driveNow ? 'drive' : 'park'

    // 정차 중 판정은 실시간 (다시 조이면 바로 바뀜), 주행 중 화면은 출발 때 판정
    const live = judgeLoad(load, kitT)
    if (nextMode === 'drive' && this.mode === 'park') this.onDepart(now, wallMs, live, kitFresh, kit)
    if (nextMode === 'park' && this.mode === 'drive') this.onPark(now, wallMs)
    this.mode = nextMode
    const verdict = this.mode === 'drive' && this.departVerdict ? this.departVerdict : live

    // ── 세기: 키트가 있으면 적재함 가속, 없으면 속도·조향 추정 ──
    let decel: number | null
    let accel: number | null
    let lat: number | null
    let source: 'kit' | 'speed' | 'none'
    if (kitFresh && kit && kit.axG !== null) {
      decel = Math.max(0, -kit.axG)
      accel = Math.max(0, kit.axG)
      lat = kit.ayG === null ? this.motion.latG(v.steerDeg) : Math.abs(kit.ayG)
      source = 'kit'
    } else {
      decel = this.motion.decelG(now)
      accel = this.motion.accelG(now)
      lat = this.motion.latG(v.steerDeg)
      source = decel === null && lat === null ? 'none' : 'speed'
    }
    if (now - this.peak.at > 3) this.peak = { decel: 0, lat: 0, accel: 0, at: now }
    this.peak.decel = Math.max(this.peak.decel, decel ?? 0)
    this.peak.lat = Math.max(this.peak.lat, lat ?? 0)
    this.peak.accel = Math.max(this.peak.accel, accel ?? 0)

    // ── 회색 사유 ──
    let greyReason: string | null = null
    if (!load) greyReason = '상차 정보 없음'
    else if (kit && kit.fault && now - kit.t <= KIT_STALE_S) greyReason = '센서 이상'
    else if (!kitFresh && v.speedKmh === null) greyReason = '속도 신호 없음'
    else if (!kitFresh && this.mode === 'drive' && moving && speedHz < MIN_SPEED_HZ) greyReason = '속도 신호가 드묾'

    // ── 사건 판정 (주행 중 + 선 뒤 3초까지. 정차 중 벨트를 푸는 것은 경고하지 않는다) ──
    const watching = this.mode === 'drive' && (moving || stoppedFor < 3)
    if (watching && load) {
      if (kitFresh && kit) this.checkKit(now, wallMs, kit, v, verdict)
      else if (!greyReason) this.checkKitless(now, wallMs, v, verdict, decel, lat, accel)
    }

    // ── 키트 부저: 적재함 가속이 잦아든 뒤 (시연에서는 소리로 흉내) ──
    let buzzer = false
    if (this.alert && this.alert.measured && !this.buzzed) {
      const ax = kitFresh && kit ? kit.axG ?? 0 : 0
      if (Math.abs(ax) < BUZZER_CALM_G) {
        if (this.calmSince === null) this.calmSince = now
        if (now - this.calmSince > 0.3) {
          buzzer = true
          this.buzzed = true
        }
      } else this.calmSince = null
    }

    // ── 주의 구간 (짐 고정이 약할 때만, 상차 한 번에 세 번까지) ──
    if (this.mode === 'drive' && v.caution && verdict.kind === 'slide' && !this.alert) {
      const c = v.caution
      if (c.distM <= CAUTION_SPEAK_M && c.distM >= 0 && !this.cautionDone.has(c.id) && this.cautionCount < CAUTION_MAX) {
        this.cautionDone.add(c.id)
        const s = this.say('caution', CAUTION_LINE[c.type], 'caution', now)
        if (s) {
          this.cautionCount += 1
          this.enqueue(s)
          this.eventsOut.push({ type: 'caution', wallMs, caution: c.type, text: s.text })
        }
      }
    }

    // ── 재점검 (80 km마다: 다음에 설 때 말한다) ──
    if (this.km >= this.recheckAt) {
      this.recheckDue = true
      this.recheckAt += RECHECK_KM
    }

    // ── 말할 때인가 ──
    const brakeOn = v.brake ?? (decel !== null && decel > BRAKE_INFER_G)
    const straight = v.steerDeg === null || Math.abs(v.steerDeg) < STEER_STRAIGHT_DEG
    const settled = now - this.eventAt > 0.6
    // 브레이크 신호가 '뗌'이어도 아직 크게 서는 중이면 기다린다 (제동이 끝난 뒤에 말한다)
    const calm = (decel ?? 0) < BRAKE_INFER_G
    const eventGate = this.mode === 'park' || stoppedFor >= SPEAK_STOP_S || (!brakeOn && straight && settled && moving && calm)
    const softGate = this.mode === 'park' || stoppedFor >= SPEAK_STOP_S || (!brakeOn && straight)
    const keep: Speech[] = []
    for (const s of this.pending) {
      const ok = s.kind === 'event' ? eventGate : s.kind === 'caution' ? softGate : true
      if (ok) speak.push(s)
      else keep.push(s)
    }
    this.pending = keep

    return {
      mode: this.mode,
      status: this.statusOf(verdict, v, greyReason),
      verdict: live,
      departVerdict: this.departVerdict,
      kitFresh,
      est: { decel, lat, accel, source, speedHz },
      alert: this.alert,
      speak,
      events: this.eventsOut,
      buzzer,
      kmSinceLoad: this.km,
      greyReason,
      stoppedFor,
    }
  }

  private onDepart(now: number, wallMs: number, live: LoadVerdict, kitFresh: boolean, kit: KitIn | null) {
    this.departVerdict = live
    this.hadTrip = true
    this.baseline = kitFresh && kit ? { c1: kit.c1, c2: kit.c2 } : null
    this.looseSince = null
    this.checkSpoken = false
    this.buzzed = false
    this.eventsOut.push({ type: 'depart', wallMs, verdict: live, kit: kitFresh })
    // 출발 때 한 번
    const text = live.kind === 'slide' ? LINES.departSlide : live.kind === 'tip' ? LINES.departTip : live.kind === 'none' ? LINES.departGrey : null
    if (text) this.enqueue(this.say('depart', text, 'depart', now))
  }

  private onPark(now: number, wallMs: number) {
    this.eventsOut.push({ type: 'park', wallMs, km: this.km })
    this.checkSpoken = false
    this.pending = this.pending.filter((p) => p.kind !== 'caution')
    if (!this.alert) {
      if (!this.firstStopDone && this.hadTrip) {
        this.firstStopDone = true
        this.enqueue(this.say('recheck', LINES.firstStop, 'recheck', now))
      } else if (this.recheckDue) {
        this.recheckDue = false
        this.enqueue(this.say('recheck', LINES.recheckKm(this.recheckAt - RECHECK_KM), 'recheck', now))
      }
    } else {
      this.firstStopDone = true
      // 사건 뒤 세웠다: 화면을 열라고 한 번 말한다 (Pleos 에서는 주행 중 화면이 가려지고, 경유지를 넣으면 내비 지도가 앞에 온다)
      if (this.alert.kind !== 'lost') this.enqueue(this.say('relash', LINES.parkedRelash, 'recheck', now, true))
    }
  }

  private raise(now: number, wallMs: number, a: Omit<ActiveAlert, 'at' | 'wallMs'>) {
    if (this.alert && ALERT_RANK[this.alert.kind] >= ALERT_RANK[a.kind]) {
      // 같은 사건: 값만 키운다
      if (a.peakG !== null && (this.alert.peakG ?? 0) < a.peakG) this.alert.peakG = a.peakG
      if (a.shiftMm !== null && (this.alert.shiftMm ?? 0) < a.shiftMm) {
        this.alert.shiftMm = a.shiftMm
        this.alert.shiftDir = a.shiftDir
      }
      this.alert.loose = { c1: this.alert.loose.c1 || a.loose.c1, c2: this.alert.loose.c2 || a.loose.c2 }
      return
    }
    const prev = this.alert
    this.alert = { ...a, at: now, wallMs }
    if (prev) {
      // 올라간 사건은 앞 사건의 값도 이어 받는다
      this.alert.peakG = Math.max(prev.peakG ?? 0, a.peakG ?? 0) || null
      this.alert.shiftMm = Math.max(prev.shiftMm ?? 0, a.shiftMm ?? 0) || null
      this.alert.shiftDir = a.shiftDir ?? prev.shiftDir
      this.alert.loose = { c1: prev.loose.c1 || a.loose.c1, c2: prev.loose.c2 || a.loose.c2 }
    }
    this.eventAt = now
    this.calmSince = null
    this.eventsOut.push({ type: 'alert', wallMs, alert: { ...this.alert } })
    const k = a.kind
    let s: Speech | null = null
    if (k === 'check') {
      if (this.checkSpoken) return
      this.checkSpoken = true
      // 고속도로는 다음에 설 곳이 멀다: 쉼터를 묻고 "네" 면 경유지로 (키트가 없어도)
      s = a.road === 'highway'
        ? this.say('event', LINES.checkNeededAsk, 'event', now, false, 'restArea')
        : this.say('event', LINES.checkNeeded, 'event', now)
    } else if (k === 'lost') {
      s = this.say('event', LINES.cargoLost, 'event', now, true)
    } else {
      // 바 풀림을 이미 말했으면 짐 밀림은 말하지 않는다 (아직 말하기 전이면 바꿔 말한다)
      const said = this.alertSpokenRank >= ALERT_RANK.loose && !this.pending.some((p) => p.key === 'event')
      if (said) return
      const head = k === 'moved' ? LINES.cargoMoved : LINES.barLoose
      const tail = a.road === 'highway' ? LINES.restAreaAsk : LINES.safePlace
      s = this.say('event', head + ' ' + tail, 'event', now, true, a.road === 'highway' ? 'restArea' : undefined)
    }
    if (s) {
      this.alertSpokenRank = ALERT_RANK[k]
      this.enqueue(s)
    }
  }

  private checkKit(now: number, wallMs: number, kit: KitIn, v: VehicleIn, verdict: LoadVerdict) {
    if (!this.baseline) this.baseline = { c1: kit.c1, c2: kit.c2 }
    const b = this.baseline
    const lowOf = (cur: number | null, base: number | null, ratio: number) => base !== null && base > 5 && cur !== null && cur < base * ratio
    const loose = { c1: lowOf(kit.c1, b.c1, LOOSE_RATIO), c2: lowOf(kit.c2, b.c2, LOOSE_RATIO) }
    const sensed = [b.c1 !== null && b.c1 > 5, b.c2 !== null && b.c2 > 5]
    const allGone = (sensed[0] || sensed[1]) && (!sensed[0] || lowOf(kit.c1, b.c1, LOST_RATIO)) && (!sensed[1] || lowOf(kit.c2, b.c2, LOST_RATIO))
    const p = this.peak
    const peakG = Math.max(p.decel, p.accel, p.lat) || null
    const dir: ActiveAlert['dir'] = peakG === null ? null : p.decel >= Math.max(p.lat, p.accel) ? 'brake' : p.lat >= p.accel ? 'turn' : 'accel'
    const common = { road: v.road, peakG, dir, limitG: verdict.limit, shiftMm: kit.shiftMm || null, shiftDir: kit.shiftDir, loose, place: v.place, measured: true }
    // 장력 센서가 걸린 벨트가 없으면 (고무바 · 로프) 태그가 적재함을 벗어난 것만으로 '짐 이탈 의심'
    const noSensor = !sensed[0] && !sensed[1]
    if ((allGone && (kit.tagShock || kit.tagLost)) || (noSensor && kit.tagLost)) return this.raise(now, wallMs, { ...common, kind: 'lost' })
    if (kit.shiftMm >= SHIFT_MOVED_MM) return this.raise(now, wallMs, { ...common, kind: 'moved' })
    if (loose.c1 || loose.c2) {
      if (this.looseSince === null) this.looseSince = now
      if (now - this.looseSince >= 0.3) this.raise(now, wallMs, { ...common, kind: 'loose' })
    } else this.looseSince = null
  }

  private checkKitless(now: number, wallMs: number, v: VehicleIn, verdict: LoadVerdict, decel: number | null, lat: number | null, accel: number | null) {
    if (verdict.kind === 'none') return
    const lim = verdict.limit
    // 앞벽이 앞쪽을 받으면 제동은 견주지 않는다 (옆·뒤만)
    let over: { g: number; dir: 'brake' | 'turn' | 'accel' } | null = null
    if (!verdict.wallCovers && decel !== null && decel > lim) over = { g: decel, dir: 'brake' }
    else if (lat !== null && lat > lim) over = { g: lat, dir: 'turn' }
    else if (accel !== null && accel > lim) over = { g: accel, dir: 'accel' }
    if (!over) return
    this.raise(now, wallMs, {
      kind: 'check', road: v.road, peakG: over.g, dir: over.dir, limitG: lim, shiftMm: null, shiftDir: null,
      loose: { c1: false, c2: false }, place: v.place, measured: false,
    })
  }

  private statusOf(verdict: LoadVerdict, v: VehicleIn, greyReason: string | null): Status {
    const a = this.alert
    const wp = this.waypoint
    if (a?.kind === 'lost') return { tone: 'red', title: '짐 이탈 의심', line: '안전한 곳에 세우고 신고', reason: 'lost' }
    if (a?.kind === 'moved' || a?.kind === 'loose') {
      const title = a.kind === 'moved' ? '짐이 밀렸습니다' : '바가 느슨해졌습니다'
      const line = wp ? wp + ' 경유' : a.road === 'highway' ? '다음 졸음쉼터에서 확인' : '안전한 곳에 세우고 확인'
      return { tone: 'red', title, line, reason: a.kind }
    }
    if (a?.kind === 'check') return { tone: 'red', title: '확인 필요', line: wp ? wp + ' 경유' : '다음에 설 때 짐 확인', reason: 'check' }
    if (greyReason) return { tone: 'grey', title: '판정 불가', line: greyReason, reason: 'grey' }
    if (verdict.kind === 'slide') {
      const c = v.caution && v.caution.distM <= 600 && v.caution.distM >= 0 ? CAUTION_SHORT[v.caution.type] : '짐 고정이 약함'
      return { tone: 'orange', title: '밀릴 수 있음', line: c, reason: 'load' }
    }
    if (verdict.kind === 'tip') return { tone: 'orange', title: '넘어짐 확인', line: '키 큰 짐 · 회전 천천히', reason: 'load' }
    return { tone: 'green', title: '계산상 기준 충족', line: '필요할 때만 말합니다', reason: 'load' }
  }
}
