// Pleos Connect 에뮬레이터: 주의 지점(방지턱) 알림.
// 에뮬레이터 내비는 자기 위치를 움직일 수 없어 (GPS 문장 검사합이 틀려 내비가 버린다) NaviHelper 가 주의 지점을 실제로 보내지 않는다.
// 그래서 NaviHelper 가 보낼 때 앱의 Kotlin 다리가 부르는 바로 그 JS 입구(jaejeokNative.onVehicle)로 주의 지점을 넣고,
// 나머지 (차량 신호 = Virtual Console, 판정 = 엔진, 음성 = Pleos TTS)는 전부 실제로 돌린다.
//   준비는 pleos-run.sh 와 같다 (8088, 9333 forward). 실행: node pleos-caution.mjs
import puppeteer from 'puppeteer-core'
const VC = 'http://127.0.0.1:8088'
const client = 'jaejeok-caution-' + Date.now()
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const req = async (method, path) => {
  try {
    const r = await fetch(VC + path, { method, signal: AbortSignal.timeout(4000) })
    return r.status
  } catch {
    return 0
  }
}
const beat = setInterval(() => req('POST', '/browser/session?client=' + client), 1000)
await req('POST', '/browser/session?client=' + client)
const b = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9333', defaultViewport: null, protocolTimeout: 15000 })
const page = (await b.pages()).find((x) => x.url().includes('app.jaejeok.local'))
const st = () =>
  page.evaluate(() => {
    const s = window.__jj.app.get()
    return { mode: s.out?.mode, title: s.out?.status?.title, alert: s.out?.alert?.kind ?? null, line: s.speech.line, voice: s.speech.voice, kmh: s.vehicle.speedKmh, tts: (() => { try { return JSON.parse(window.JaejeokAndroid.info()).pleosTts } catch { return null } })() }
  })
const fails = []
const check = (ok, what) => { if (!ok) fails.push(what); console.log((ok ? 'OK   ' : 'FAIL ') + what) }
const ctl = (speed) => req('PUT', `/vehicle/controls?speed=${speed}&accelerator=20&brake=0&steering=0`)
try {
  await ctl(0)
  await req('PUT', '/vehicle/gear?gear=Park')
  await wait(1500)
  // 고정이 약한 짐: 300 kg 가전, 라쳇 2개, 앞벽에 안 붙임 -> '밀릴 수 있음'
  await page.evaluate(() => window.__jj.confirmLoad({ kind: 'appliance', massKg: 300, belts: 2, beltType: 'ratchet', frontWall: false }, { newWaybill: true }))
  await wait(800)
  await req('PUT', '/vehicle/gear?gear=Drive')
  for (let v = 0; v <= 40; v += 2) { await ctl(v); await wait(200) }
  // 출발 안내가 끝날 때까지
  await wait(9000)
  let s = await st()
  console.log('driving', JSON.stringify(s))
  check(s.mode === 'drive' && s.alert === null, 'driving at 40 km/h with a weakly secured load, no alert yet')
  // NaviHelper onCautionPointInfo -> Kotlin send({caution}) -> 이 JS 입구
  await page.evaluate(() => window.jaejeokNative.onVehicle(JSON.stringify({ caution: { id: 'bump-test-1', type: 'bump', distM: 150 } })))
  let line = null
  for (let i = 0; i < 16; i++) {
    await ctl(40)
    await wait(400)
    s = await st()
    if (s.line && s.line.includes('방지턱')) { line = s.line; break }
  }
  console.log('after caution', JSON.stringify(s))
  check(!!line, 'a speed bump 150 m ahead makes the app say: ' + line)
  check(s.tts === true, 'the sentence goes out through Pleos TTS')
  await page.evaluate(() => window.jaejeokNative.onVehicle(JSON.stringify({ caution: null })))
} catch (e) {
  console.log('ERROR', String(e).slice(0, 300))
  fails.push('exception')
} finally {
  await ctl(0)
  await req('PUT', '/vehicle/gear?gear=Park')
  clearInterval(beat)
  b.disconnect()
}
console.log(fails.length ? 'CAUTION_FAIL ' + fails.length : 'CAUTION_OK')
process.exit(fails.length ? 1 : 0)
