// Pleos Connect 에뮬레이터에서 차량 신호만으로 앱을 시험한다 (앱 안 시연 차량은 쓰지 않는다).
//   준비: adb forward tcp:8088 tcp:8088  (Pleos Virtual Console)
//         adb forward tcp:9333 localabstract:webview_devtools_remote_<앱 pid>
//   실행: node pleos-drive.mjs
// Virtual Console 은 브라우저가 1초마다 /browser/session 에 신호를 보내야 값을 받는다. 여기서 그 신호를 대신 보낸다.
import puppeteer from 'puppeteer-core'
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'

const ADB = 'C:/Users/DANHA/tools/android-sdk/platform-tools/adb.exe'
/** 에뮬레이터 화면을 shots/pleos_<name>.png 로 */
const shot = (name) => {
  try {
    writeFileSync('shots/pleos_' + name + '.png', execFileSync(ADB, ['exec-out', 'screencap', '-p'], { maxBuffer: 64 * 1024 * 1024, timeout: 15000 }))
  } catch (e) {
    console.log('shot failed', name, String(e).slice(0, 80))
  }
}

const VC = 'http://127.0.0.1:8088'
const client = 'jaejeok-e2e-' + Date.now()
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const req = async (method, path) => {
  const c = new AbortController()
  const t = setTimeout(() => c.abort(), 4000)
  try {
    const r = await fetch(VC + path, { method, signal: c.signal })
    return { status: r.status, text: (await r.text()).slice(0, 200) }
  } catch (e) {
    return { status: 0, text: String(e) }
  } finally {
    clearTimeout(t)
  }
}
const beat = setInterval(() => req('POST', '/browser/session?client=' + client), 1000)
await req('POST', '/browser/session?client=' + client)

const b = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9333', defaultViewport: null, protocolTimeout: 15000 })
const page = (await b.pages()).find((x) => x.url().includes('app.jaejeok.local'))
const app = () =>
  page.evaluate(() => {
    const s = window.__jj.app.get()
    const v = s.vehicle
    const o = s.out
    return {
      src: s.vehicleSource, gear: v.gear, kmh: v.speedKmh == null ? null : Math.round(v.speedKmh * 10) / 10, steer: v.steerDeg == null ? null : Math.round(v.steerDeg * 10) / 10,
      brake: v.brake, uxr: v.uxRestricted, odo: v.odometerKm, mode: o?.mode, title: o?.status?.title, alert: o?.alert?.kind ?? null,
      hz: o?.est ? Math.round(o.est.speedHz * 10) / 10 : null, decel: o?.est?.decel == null ? null : Math.round(o.est.decel * 100) / 100,
      lat: o?.est?.lat == null ? null : Math.round(o.est.lat * 100) / 100, listening: s.speech.listening, line: s.speech.line, waypoint: s.waypoint?.name ?? null, screen: s.screen,
      rearDoor: window.__jjNative?.rearDoor,
    }
  })
const log = async (what) => console.log(what.padEnd(34), JSON.stringify(await app()))
const fails = []
const check = (ok, what) => { if (!ok) fails.push(what); console.log((ok ? 'OK   ' : 'FAIL ') + what) }
const ctl = (speed, brake = 0, steering = 0, accelerator = 0) => req('PUT', `/vehicle/controls?speed=${speed}&accelerator=${accelerator}&brake=${brake}&steering=${steering}`)

try {
  // 처음 상태: 정차 (P)
  await ctl(0)
  console.log('gear Park ->', JSON.stringify(await req('PUT', '/vehicle/gear?gear=Park')))
  await wait(1500)
  await page.evaluate(() => window.__jj.confirmLoad({ kind: 'appliance', massKg: 300, belts: 2, beltType: 'ratchet', frontWall: false }, { newWaybill: true }))
  await wait(800)
  await log('parked, load entered')
  shot('1_parked')
  // BG=1: 내비 지도를 앞에 띄우고 (우리 앱은 뒤로) 같은 주행을 한다 = 화면 뒤에서도 감시 · 음성이 이어지는지
  const BG = process.env.BG === '1'
  if (BG) {
    execFileSync(ADB, ['shell', 'monkey', '--pct-syskeys', '0', '-p', 'ai.umos.maps.android.navigation.app', '-c', 'android.intent.category.LAUNCHER', '1'], { timeout: 15000 })
    await wait(4000)
    console.log('navigation app in front, page hidden =', await page.evaluate(() => document.hidden))
    shot('bg_1_map_in_front')
  }
  let st = await app()
  check(st.src === 'native', 'vehicle source is the car (native), not the in-app demo car')

  // 출발: D, 0 -> 80 km/h (약 0.15 g)
  console.log('gear Drive ->', JSON.stringify(await req('PUT', '/vehicle/gear?gear=Drive')))
  await wait(1200)
  await log('gear D')
  for (let v = 0; v <= 80; v += 1) {
    await ctl(v, 0, 0, 30)
    await wait(180)
  }
  await wait(2500)
  st = await app()
  await log('cruising 80 km/h')
  if (!BG) shot('2_driving')
  check(st.gear === 'D' && st.mode === 'drive', 'gear D from the Vehicle SDK puts the app in driving mode')
  check(Math.abs((st.kmh ?? 0) - 80) < 3, 'speed arrives through the car (' + st.kmh + ' km/h)')
  check((st.hz ?? 0) >= 5, 'speed signal rate is enough to judge (' + st.hz + ' Hz)')

  // 핸들: 16도 (조향비 16 -> 앞바퀴 약 1도, 시속 80 km 에서 옆으로 약 0.3 g: 한계 0.53 g 밑이라 경보 없음)
  await ctl(80, 0, 16, 30)
  await wait(1500)
  st = await app()
  await log('steering wheel 16 deg')
  check(st.steer !== null && Math.abs(Math.abs(st.steer) - 1) < 0.3, 'steering-wheel angle is divided by the steering ratio (' + st.steer + ' deg at the front wheel)')
  check(st.alert === null, 'a gentle turn raises no alert (side ' + st.lat + ' g)')
  await ctl(80, 0, 0, 30)
  await wait(2500)
  // 누적 주행거리 (Vehicle SDK Odometer, 앱은 10초마다 읽는다)
  console.log('odometer ->', JSON.stringify(await req('PUT', '/vehicle/odometer?traveled_distance_km=1234')))

  // 급제동: 80 -> 0 km/h 를 약 3초 (약 0.75 g), 브레이크 80 %
  let sawBrake = false
  let peakDecel = 0
  for (let v = 80; v >= 0; v -= 3) {
    const t0 = Date.now()
    await ctl(Math.max(0, v), 80, 0, 0)
    const a = await app()
    if (a.brake === true) sawBrake = true
    if ((a.decel ?? 0) > peakDecel) peakDecel = a.decel
    await wait(Math.max(0, 115 - (Date.now() - t0)))
  }
  await ctl(0, 80)
  await log('just stopped')
  check(sawBrake, 'brake pedal from the Vehicle SDK arrives')
  check(peakDecel > 0.53, 'deceleration is estimated from the car speed (peak ' + peakDecel + ' g x 1.25 included)')
  let sawCheck = false
  let sawListen = false
  for (let i = 0; i < 24; i++) {
    await wait(500)
    st = await app()
    if (st.alert === 'check') sawCheck = true
    if (st.listening) { sawListen = true; break }
  }
  await log('after the stop')
  shot(BG ? 'bg_3_listening' : '3_listening')
  check(sawCheck, 'hard braking measured from the car speed raises 확인 필요')
  check(sawListen, 'the app asks about a rest area (Pleos TTS) and listens (Pleos STT)')
  // VOICE=<wav>: 손으로 '네'를 넣지 않고, 에뮬레이터 가상 마이크로 소리를 넣어 Pleos STT 가 알아듣게 한다 (emulator -grpc 8554)
  if (process.env.VOICE) {
    const { injectAudio } = await import('./emu-grpc.mjs')
    const sec = await injectAudio(process.env.VOICE, +(process.env.PRE ?? 150), +(process.env.POST ?? 0), +(process.env.GAIN ?? 1))
    console.log('voice injected', sec, 's')
    for (let i = 0; i < 20; i++) {
      await wait(500)
      st = await app()
      if (st.waypoint || !st.listening) break
    }
    await wait(2500)
    const heard = await page.evaluate(() => window.__jj.app.get().speech.heard ?? null)
    console.log('heard =', JSON.stringify(heard))
  } else {
    await page.evaluate(() => window.__jj.answerYes())
    await wait(3000)
  }
  st = await app()
  await log('answered 네')
  check(!!st.waypoint, 'rest-area waypoint added through NaviHelper (' + st.waypoint + ')')

  // 정차: P -> 다시 묶기
  await ctl(0, 0)
  console.log('gear Park ->', JSON.stringify(await req('PUT', '/vehicle/gear?gear=Park')))
  await wait(2500)
  st = await app()
  await log('parked again')
  shot(BG ? 'bg_4_parked' : '4_relash')
  check(st.mode === 'park' && st.screen === 'relash', 'gear P opens the re-lash screen')
  check(st.odo === 1234, 'odometer read through the Vehicle SDK (' + st.odo + ' km)')
  // 정차 중 뒷문(트렁크) 열림 = 하차
  const before = await page.evaluate(() => window.__jj.app.get().unloads)
  console.log('trunk open ->', JSON.stringify(await req('PUT', '/vehicle/body?trunk=1')))
  await wait(2500)
  const after = await page.evaluate(() => window.__jj.app.get().unloads)
  check(after === before + 1, 'opening the rear door while parked counts as unloading (' + before + ' -> ' + after + ')')
  await req('PUT', '/vehicle/body?trunk=0')
} catch (e) {
  console.log('ERROR', e)
  fails.push('exception')
} finally {
  await ctl(0, 0).catch(() => {})
  await req('PUT', '/vehicle/gear?gear=Park').catch(() => {})
  clearInterval(beat)
  await req('POST', '/browser/session?client=' + client + '&closing=1').catch(() => {})
  b.disconnect()
}
console.log(fails.length ? 'PLEOS_FAIL ' + fails.length : 'PLEOS_OK')
process.exit(fails.length ? 1 : 0)
