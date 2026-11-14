// 시연 무대 빠른 시험: node smoke.mjs [base]  (화면 없는 Chrome)
//   키트 없음 · 고속도로 급제동 -> '확인 필요' -> 선 뒤 쉼터 질문 -> "네" -> 경유지, 그리고 키트 대본 하나. 콘솔 오류가 없어야 한다.
import puppeteer from 'puppeteer-core'

const BASE = process.argv[2] ?? 'http://127.0.0.1:5173'
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--autoplay-policy=no-user-gesture-required', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--window-size=1800,810', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  userDataDir: 'C:/Users/DANHA/AppData/Local/Temp/jaejeok-smoke-chrome',
  defaultViewport: { width: 1800, height: 810 },
})
const page = await browser.newPage()
const errors = []
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
page.on('console', (m) => m.type() === 'error' && errors.push('console: ' + m.text()))
const state = () => page.evaluate(() => {
  const s = window.__jj.app.get()
  return { mode: s.out?.mode, title: s.out?.status?.title, alert: s.out?.alert?.kind ?? null, listening: s.speech.listening, line: s.speech.line, waypoint: s.waypoint?.name ?? null }
})
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const fails = []
const check = (ok, what) => { if (!ok) fails.push(what); console.log((ok ? 'OK   ' : 'FAIL ') + what) }

await page.goto(BASE + '/?app=stage&fresh', { waitUntil: 'networkidle0' })
await page.evaluate(() => window.__jj.confirmLoad({ kind: 'appliance', massKg: 300, belts: 2, beltType: 'ratchet', frontWall: false }, { newWaybill: true }))
await page.evaluate(() => window.__jj.playScenario('kitless-brake'))
let st = null
let sawCheck = false
let sawListen = false
for (let i = 0; i < 70; i++) {
  await wait(500)
  st = await state()
  if (st.alert === 'check') sawCheck = true
  if (st.listening) { sawListen = true; break }
}
check(sawCheck, 'kitless highway brake raises 확인 필요')
check(sawListen, 'after the stop the app asks about a rest area and listens')
await page.evaluate(() => window.__jj.answerYes())
await wait(2500)
st = await state()
check(!!st.waypoint, 'saying 네 adds the rest-area waypoint (' + st.waypoint + ')')
await page.screenshot({ path: 'shots/smoke_kitless.png' })

await page.goto(BASE + '/?app=stage&fresh', { waitUntil: 'networkidle0' })
await page.evaluate(() => window.__jj.playScenario('kit-slide'))
let moved = false
for (let i = 0; i < 80; i++) {
  await wait(500)
  st = await state()
  if (st.alert === 'moved') { moved = true; break }
}
check(moved, 'kit-slide replay raises 짐이 밀렸습니다')
check(errors.length === 0, 'no console or page errors' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''))
await browser.close()
console.log(fails.length ? 'SMOKE_FAIL ' + fails.length : 'SMOKE_OK')
process.exit(fails.length ? 1 : 0)
