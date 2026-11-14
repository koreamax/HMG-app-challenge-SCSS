// 판정 엔진 시험: node --experimental-strip-types --test src/engine/engine.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { judgeLoad, limitG, type LoadInput } from './limit.ts'
import type { CargoKind } from './cargo.ts'
import { TripMonitor, type KitIn, type VehicleIn, type Speech } from './monitor.ts'
import { LINES } from './lines.ts'
import { nextRestArea } from './places.ts'

// Isaac Sim PV5 가상 트럭 주행 기록 (sim_real_truck/export_app_runs.py)
type Run = { key: string; rows: number[][]; massKg: number; belts: number; cargo: string; rubber: boolean; preloadN: number; angleDeg: number; mu: number }
const runs = JSON.parse(readFileSync(new URL('../data/isaac-runs.json', import.meta.url), 'utf8')).runs as Run[]
const runOf = (k: string) => {
  const r = runs.find((x) => x.key === k)
  if (!r) throw new Error('no run ' + k)
  return r
}
const run = (k: string) => runOf(k).rows
/** 기록과 같은 상차 정보. 앱(runtime.startIsaacHold)과 같은 규칙: 각도 · 마찰은 앱 기본값 */
const loadOf = (k: string): LoadInput => {
  const r = runOf(k)
  return { kind: r.cargo as CargoKind, massKg: r.massKg, belts: r.belts, beltType: r.rubber ? 'rubber' : 'ratchet', frontWall: false }
}

const veh = (o: Partial<VehicleIn> = {}): VehicleIn => ({ speedKmh: 0, steerDeg: 0, brake: null, gear: 'P', uxRestricted: null, road: 'highway', caution: null, place: null, ...o })
test('팀 계산식: PV5 가상 트럭 (상자 300 kg · 마찰 0.30 · 라쳇 1,250 N)', () => {
  const r = runOf('slide2')
  // Isaac 모형의 실제 벨트 각도(61°)로: 바 2개 0.60 g < 받은 급제동 0.89 g < 바 4개 0.95 g
  const lim = (belts: number) => limitG(r.mu, belts * r.preloadN, r.angleDeg, r.massKg)
  assert.ok(Math.abs(lim(2) - 0.597) < 0.01, 'lim2 ' + lim(2))
  assert.ok(lim(2) < 0.75 && lim(4) > 0.9, 'lim4 ' + lim(4))
  // 앱 기본값(각도 45°)은 더 낮춰 잡는다
  assert.ok(Math.abs(limitG(0.3, 2500, 45, 300) - 0.528) < 0.005)
  assert.equal(judgeLoad(loadOf('slide2')).kind, 'slide')
  assert.equal(judgeLoad(loadOf('hold4')).tone, 'green')
  // 키트가 잰 장력을 쓰면 measured
  assert.equal(judgeLoad(loadOf('slide2'), { c1: 1250, c2: 1250 }).measured, true)
})

test('상차 판정: 가전 300 kg 라쳇 2개 = 밀릴 수 있음 + 넘어짐도 확인', () => {
  const v = judgeLoad({ kind: 'appliance', massKg: 300, belts: 2, beltType: 'ratchet', frontWall: false })
  assert.equal(v.kind, 'slide')
  assert.ok(v.tall)
  assert.ok(v.alt?.includes('넘어짐'))
})

test('상차 판정: 박스 300 kg + 앞벽 = 옆·뒤 기준만 보고 초록', () => {
  const v = judgeLoad({ kind: 'box', massKg: 300, belts: 2, beltType: 'ratchet', frontWall: true })
  assert.equal(v.wallCovers, true)
  assert.equal(v.crit, 0.5)
  assert.equal(v.tone, 'green')
  const no = judgeLoad({ kind: 'box', massKg: 300, belts: 2, beltType: 'ratchet', frontWall: false })
  assert.equal(no.kind, 'slide')
  assert.equal(no.action, '짐을 앞벽에 붙여 실으세요')
})

test('상차 판정: 고무바는 장력 0 -> 라쳇으로', () => {
  const v = judgeLoad({ kind: 'material', massKg: 100, belts: 3, beltType: 'rubber', frontWall: false })
  assert.equal(v.sumT, 0)
  assert.equal(v.action, '라쳇 벨트로 묶으세요')
})

test('상차 판정: 바 하나 더면 맞는 경우', () => {
  const v = judgeLoad({ kind: 'pallet', massKg: 100, belts: 1, beltType: 'ratchet', frontWall: false })
  assert.equal(v.kind, 'slide')
  assert.equal(v.extraBelts, 1)
  assert.equal(v.action, '바 하나 더 거세요')
})

/** 0 -> 40 km/h 를 10 s 동안 (0.11 g) */
function rampUp(m: TripMonitor, load: Parameters<typeof judgeLoad>[0]) {
  let t = 0
  for (let v = 0; v <= 40; v += 0.4) {
    t += 0.1
    m.step(t, t * 1000, veh({ gear: 'D', speedKmh: v }), null, load)
  }
  return t
}

type Said = { t: number; s: Speech }
function replay(key: string, load: LoadInput = loadOf(key), withKit = true, road: 'highway' | 'local' = 'highway', brake: boolean | null = null) {
  const m = new TripMonitor()
  m.newLoading()
  const rows = run(key)
  const said: Said[] = []
  const alerts: string[] = []
  const kitOf = (r: number[], t: number): KitIn => ({
    t, c1: r[2], c2: r[3], axG: r[4], ayG: r[5], shiftMm: Math.hypot(r[6], r[7]),
    shiftDir: Math.hypot(r[6], r[7]) < 1 ? null : Math.abs(r[7]) >= Math.abs(r[6]) ? (r[7] < 0 ? 'front' : 'rear') : r[6] > 0 ? 'right' : 'left',
    tagShock: r[8] === 0, tagLost: r[8] === 0, fault: false,
  })
  let out = m.step(0, 0, veh(), withKit ? kitOf(rows[0], 0) : null, load)
  for (const r of rows) {
    const t = r[0] + 1
    // 차 신호도 기록 그대로 (앞바퀴 각 · 브레이크). brake 를 주면 그 값으로 (신호가 꺼진 경우 시험)
    out = m.step(t, t * 1000, veh({ speedKmh: r[1], steerDeg: r[9], gear: 'D', road, brake: brake ?? r[10] > 0.05 }), withKit ? kitOf(r, t) : null, load)
    for (const e of out.events) if (e.type === 'alert') alerts.push(e.alert.kind)
    for (const s of out.speak) {
      said.push({ t, s })
      m.spoken(s, t)
    }
  }
  return { m, out, said, alerts }
}

test('키트: 라쳇 2개 급제동 0.89 g -> 짐 11 cm 밀림, 고속도로 문장 + 쉼터 질문', () => {
  const { out, said } = replay('slide2')
  assert.equal(out.alert?.kind, 'moved')
  assert.ok((out.alert?.shiftMm ?? 0) > 80, 'shift ' + out.alert?.shiftMm)
  assert.equal(out.alert?.shiftDir, 'front')
  const ev = said.filter((x) => x.s.kind === 'event')
  assert.equal(ev.length, 1)
  assert.equal(ev[0].s.text, LINES.cargoMoved + ' ' + LINES.restAreaAsk)
  assert.equal(ev[0].s.ask, 'restArea')
  assert.equal(out.status.tone, 'red')
  // 출발 때 한 번: 바 2개는 기준 미달이라 출발 안내
  const dep = said.filter((x) => x.s.kind === 'depart')
  assert.equal(dep.length, 1)
  assert.equal(dep[0].s.text, LINES.departSlide)
})

test('키트: 바 4개 같은 급제동 -> 사건 없음, 아무 말도 하지 않음', () => {
  const { out, said } = replay('hold4')
  assert.equal(out.alert, null)
  assert.deepEqual(said.map((x) => x.s.text), [])
  assert.equal(out.status.tone, 'green')
})

test('키트: 주행 중 앞 바가 풀림 -> 바 느슨 먼저 말하고, 뒤이은 밀림은 되풀이하지 않음', () => {
  const { out, said, alerts } = replay('loose2')
  assert.equal(alerts[0], 'loose')
  assert.equal(out.alert?.kind, 'moved')
  assert.equal(out.alert?.loose.c1, true)
  const ev = said.filter((x) => x.s.kind === 'event')
  assert.equal(ev.length, 1)
  assert.equal(ev[0].s.text, LINES.barLoose + ' ' + LINES.restAreaAsk)
})

test('키트: 고무바 제동 0.62 g -> 짐 35 cm 밀림 (장력 센서 없이 태그로)', () => {
  const { out, said } = replay('rubber')
  assert.equal(out.alert?.kind, 'moved')
  assert.ok((out.alert?.shiftMm ?? 0) > 300)
  assert.equal(said.filter((x) => x.s.kind === 'event').length, 1)
  assert.equal(said.find((x) => x.s.kind === 'depart')?.s.text, LINES.departSlide)
})

test('키트: 고무바로 묶은 키 큰 짐이 회전 중 넘어져 떨어짐 -> 짐 이탈 의심 한 번', () => {
  const { out, said } = replay('lost')
  assert.equal(out.alert?.kind, 'lost')
  const ev = said.filter((x) => x.s.kind === 'event')
  assert.equal(ev.length, 1)
  assert.equal(ev[0].s.text, LINES.cargoLost)
  assert.equal(out.status.title, '짐 이탈 의심')
})

test('키트: 일반 도로는 안전한 곳 문장, 질문 없음', () => {
  const { said } = replay('slide2', loadOf('slide2'), true, 'local')
  const ev = said.find((x) => x.s.kind === 'event')
  assert.ok(ev)
  assert.equal(ev.s.text, LINES.cargoMoved + ' ' + LINES.safePlace)
  assert.equal(ev.s.ask, undefined)
})

test('키트 없음: 같은 급제동, 가전 300 kg -> 확인 필요 한 번', () => {
  const load = { kind: 'appliance' as const, massKg: 300, belts: 2, beltType: 'ratchet' as const, frontWall: false }
  const { out, said } = replay('slide2', load, false)
  assert.equal(out.alert?.kind, 'check')
  // 속도로 구한 감속 x 1.25 (적재함이 받은 최대 약 0.8 g 보다 크게 잡는다)
  const peak = out.alert?.peakG ?? 0
  assert.ok(peak > 0.75 && peak < 1.1, 'peak ' + peak)
  const ev = said.filter((x) => x.s.kind === 'event')
  assert.equal(ev.length, 1)
  // 고속도로: 키트가 없어도 쉼터를 묻는다
  assert.equal(ev[0].s.text, LINES.checkNeededAsk)
  assert.equal(ev[0].s.ask, 'restArea')
})

test('키트 없음: 일반 도로의 확인 필요는 묻지 않고 다음에 설 때 확인', () => {
  const load = { kind: 'appliance' as const, massKg: 300, belts: 2, beltType: 'ratchet' as const, frontWall: false }
  const { out, said } = replay('slide2', load, false, 'local')
  assert.equal(out.alert?.kind, 'check')
  const ev = said.filter((x) => x.s.kind === 'event')
  assert.equal(ev.length, 1)
  assert.equal(ev[0].s.text, LINES.checkNeeded)
  assert.equal(ev[0].s.ask, undefined)
})

test('키트 없음: 박스 300 kg + 앞벽이면 제동은 견주지 않는다', () => {
  const load = { kind: 'box' as const, massKg: 300, belts: 2, beltType: 'ratchet' as const, frontWall: true }
  const { out } = replay('slide2', load, false)
  assert.equal(out.alert, null)
})

test('속도 신호가 초당 5회보다 드물면 회색', () => {
  const m = new TripMonitor()
  const load = { kind: 'box' as const, massKg: 300, belts: 2, beltType: 'ratchet' as const, frontWall: false }
  m.step(0, 0, veh(), null, load)
  let out = m.step(0.1, 100, veh({ gear: 'D', speedKmh: 30 }), null, load)
  for (let t = 0.5; t < 6; t += 0.5) out = m.step(t, t * 1000, veh({ gear: 'D', speedKmh: 30 }), null, load)
  assert.equal(out.status.tone, 'grey')
  assert.equal(out.greyReason, '속도 신호가 드묾')
})

test('주의 구간: 짐 고정이 약할 때 300 m 앞에서, 같은 문장은 10분 안에 한 번', () => {
  const m = new TripMonitor()
  const load = { kind: 'box' as const, massKg: 300, belts: 2, beltType: 'ratchet' as const, frontWall: false }
  m.step(0, 0, veh(), null, load)
  const said: Speech[] = []
  let t = rampUp(m, load)
  for (let i = 0; i < 5; i++) {
    for (let d = 800; d >= 0; d -= 50) {
      t += 0.1
      const out = m.step(t, t * 1000, veh({ gear: 'D', speedKmh: 40, caution: { id: 'c' + i, type: i % 2 ? 'downhill' : 'bump', distM: d } }), null, load)
      for (const s of out.speak) {
        said.push(s)
        m.spoken(s, t)
      }
    }
  }
  const c = said.filter((s) => s.kind === 'caution')
  assert.equal(c.length, 2)
  assert.equal(c[0].text, LINES.cautionBump)
  assert.equal(c[1].text, LINES.cautionSection)
})

test('재점검: 출발 뒤 첫 정차에 한 번', () => {
  const m = new TripMonitor()
  const load = { kind: 'box' as const, massKg: 300, belts: 2, beltType: 'ratchet' as const, frontWall: true }
  m.step(0, 0, veh(), null, load)
  let t = rampUp(m, load)
  for (const end = t + 20; t < end; t += 0.1) m.step(t, t * 1000, veh({ gear: 'D', speedKmh: 40 }), null, load)
  // 천천히 선다 (0.1 g)
  for (let v = 40; v > 0; v -= 0.35) {
    t += 0.1
    m.step(t, t * 1000, veh({ gear: 'D', speedKmh: v }), null, load)
  }
  for (const end = t + 3; t < end; t += 0.1) m.step(t, t * 1000, veh({ gear: 'D', speedKmh: 0 }), null, load)
  const out = m.step(t + 0.1, (t + 0.1) * 1000, veh({ gear: 'P', speedKmh: 0 }), null, load)
  assert.equal(out.alert, null)
  assert.equal(out.speak[0]?.text, LINES.firstStop)
})

test('쉼터: 경로 앞쪽에서 가장 가까운 곳', () => {
  assert.equal(nextRestArea(10)?.name, '졸음쉼터 A')
  assert.equal(nextRestArea(20)?.name, '졸음쉼터 B')
  assert.equal(nextRestArea(100), null)
})

test('말하는 때: 브레이크 신호가 꺼져 있어도 크게 서는 중에는 말하지 않는다 (이탈 문장 하나)', () => {
  const { said } = replay('lost', loadOf('lost'), true, 'highway', false)
  const ev = said.filter((x) => x.s.kind === 'event')
  assert.equal(ev.length, 1)
  assert.equal(ev[0].s.text, LINES.cargoLost)
})

test('주의 구간: 10분이 지나도 상차 한 번에 세 번까지만', () => {
  const m = new TripMonitor()
  const load = { kind: 'box' as const, massKg: 300, belts: 2, beltType: 'ratchet' as const, frontWall: false }
  m.step(0, 0, veh(), null, load)
  let t = rampUp(m, load)
  const said: Speech[] = []
  for (let i = 0; i < 5; i++) {
    // 11분 정속 (1초 간격)
    for (const end = t + 660; t < end; t += 1) m.step(t, t * 1000, veh({ gear: 'D', speedKmh: 40 }), null, load)
    for (let d = 500; d >= 0; d -= 50) {
      t += 0.5
      const out = m.step(t, t * 1000, veh({ gear: 'D', speedKmh: 40, caution: { id: 'b' + i, type: 'bump', distM: d } }), null, load)
      for (const s of out.speak) {
        said.push(s)
        m.spoken(s, t)
      }
    }
  }
  assert.equal(said.filter((s) => s.kind === 'caution').length, 3)
})

test('재점검: 80 km 를 달리면 다음 정차 때 알린다', () => {
  const m = new TripMonitor()
  const load = { kind: 'box' as const, massKg: 300, belts: 2, beltType: 'ratchet' as const, frontWall: true }
  m.step(0, 0, veh(), null, load)
  let t = rampUp(m, load)
  // 첫 정차 (첫 정차 안내는 따로)
  const stop = () => {
    for (let v = 40; v > 0; v -= 0.35) {
      t += 0.1
      m.step(t, t * 1000, veh({ gear: 'D', speedKmh: v }), null, load)
    }
    for (const end = t + 3; t < end; t += 0.1) m.step(t, t * 1000, veh({ gear: 'D', speedKmh: 0 }), null, load)
    t += 0.1
    return m.step(t, t * 1000, veh({ gear: 'P', speedKmh: 0 }), null, load)
  }
  assert.equal(stop().speak[0]?.text, LINES.firstStop)
  t += 1
  m.step(t, t * 1000, veh({ gear: 'D', speedKmh: 0 }), null, load)
  for (let v = 0; v <= 40; v += 0.4) {
    t += 0.1
    m.step(t, t * 1000, veh({ gear: 'D', speedKmh: v }), null, load)
  }
  // 40 km/h 로 2시간 (80 km)
  for (const end = t + 7300; t < end; t += 1) m.step(t, t * 1000, veh({ gear: 'D', speedKmh: 40 }), null, load)
  assert.equal(stop().speak[0]?.text, LINES.recheckKm(80))
})

test('키트가 3초 넘게 끊기면 키트 없는 판정으로 돌아간다', () => {
  const m = new TripMonitor()
  const load = { kind: 'appliance' as const, massKg: 300, belts: 2, beltType: 'ratchet' as const, frontWall: false }
  const kitAt = (t: number) => ({ t, c1: 1250, c2: 1250, axG: 0, ayG: 0, shiftMm: 0, shiftDir: null, tagShock: false, tagLost: false, fault: false })
  let out = m.step(0, 0, veh(), kitAt(0), load)
  let t = 0
  for (let v = 0; v <= 80; v += 0.5) {
    t += 0.1
    out = m.step(t, t * 1000, veh({ gear: 'D', speedKmh: v }), kitAt(t), load)
  }
  assert.equal(out.kitFresh, true)
  const lastKit = kitAt(t)
  for (const end = t + 4; t < end; t += 0.1) out = m.step(t, t * 1000, veh({ gear: 'D', speedKmh: 80 }), lastKit, load)
  assert.equal(out.kitFresh, false)
  // 급제동 0.72 g -> 키트 없는 판정이 '확인 필요'
  for (let v = 80; v > 0; v -= 2.54) {
    t += 0.1
    out = m.step(t, t * 1000, veh({ gear: 'D', speedKmh: Math.max(0, v) }), lastKit, load)
  }
  assert.equal(out.alert?.kind, 'check')
  assert.equal(out.est.source, 'speed')
})

test('속도 신호 이상: 트럭이 낼 수 없는 변화(0 <-> 72 km/h 번갈아)는 버리고 경보를 내지 않는다', () => {
  const m = new TripMonitor()
  const load = { kind: 'appliance' as const, massKg: 300, belts: 2, beltType: 'ratchet' as const, frontWall: false }
  m.step(0, 0, veh(), null, load)
  let out = m.step(0.1, 100, veh({ gear: 'D', speedKmh: 0 }), null, load)
  for (let i = 0; i < 60; i++) {
    const t = 0.2 + i * 0.1
    out = m.step(t, t * 1000, veh({ gear: 'D', speedKmh: i % 2 ? 72 : 0 }), null, load)
  }
  assert.equal(out.alert, null)
})

test('재점검: 누적 주행거리(Pleos Odometer)가 오면 속도 적분 대신 그것으로 80 km 를 센다', () => {
  const m = new TripMonitor()
  const load = { kind: 'box' as const, massKg: 300, belts: 2, beltType: 'ratchet' as const, frontWall: true }
  m.step(0, 0, veh(), null, load)
  let t = rampUp(m, load)
  let odo = 1000
  const stop = () => {
    for (let v = 40; v > 0; v -= 0.35) {
      t += 0.1
      m.step(t, t * 1000, veh({ gear: 'D', speedKmh: v, odometerKm: odo }), null, load)
    }
    for (const end = t + 3; t < end; t += 0.1) m.step(t, t * 1000, veh({ gear: 'D', speedKmh: 0, odometerKm: odo }), null, load)
    t += 0.1
    return m.step(t, t * 1000, veh({ gear: 'P', speedKmh: 0, odometerKm: odo }), null, load)
  }
  assert.equal(stop().speak[0]?.text, LINES.firstStop)
  // 80 초 동안 계기판 거리가 1 km 씩 (속도 적분이면 1 km 도 안 된다)
  for (let i = 0; i < 80; i++) {
    t += 1
    odo += 1
    m.step(t, t * 1000, veh({ gear: 'D', speedKmh: 40, odometerKm: odo }), null, load)
  }
  assert.equal(stop().speak[0]?.text, LINES.recheckKm(80))
})

test('모드: 주행 규제가 꺼져 있어도 기어가 D 면 주행, P 면 정차 (Pleos 에뮬레이터 · 개발 환경)', () => {
  const m = new TripMonitor()
  const load = { kind: 'box' as const, massKg: 300, belts: 2, beltType: 'ratchet' as const, frontWall: true }
  let out = m.step(0, 0, veh({ gear: 'P', uxRestricted: false }), null, load)
  assert.equal(out.mode, 'park')
  out = m.step(0.1, 100, veh({ gear: 'D', uxRestricted: false, speedKmh: 0 }), null, load)
  assert.equal(out.mode, 'drive')
  out = m.step(0.2, 200, veh({ gear: 'D', uxRestricted: true, speedKmh: 0 }), null, load)
  assert.equal(out.mode, 'drive')
  out = m.step(0.3, 300, veh({ gear: 'P', uxRestricted: false, speedKmh: 0 }), null, load)
  assert.equal(out.mode, 'park')
})

test('사건 뒤 정차: 화면을 열어 다시 묶을 순서를 보라고 한 번 말한다', () => {
  const load = { kind: 'appliance' as const, massKg: 300, belts: 2, beltType: 'ratchet' as const, frontWall: false }
  const { m, out } = replay('slide2', load, false)
  assert.equal(out.alert?.kind, 'check')
  const t = 200
  const parked = m.step(t, t * 1000, veh({ gear: 'P', speedKmh: 0 }), null, load)
  assert.ok(parked.speak.some((s) => s.text === LINES.parkedRelash), parked.speak.map((s) => s.text).join(' | '))
})
