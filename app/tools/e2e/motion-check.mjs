// 움직임 확인 (DESIGN_SPEC §8.2): 화면 없는 Chrome 으로 정차 · 폰의 움직임을 프레임으로 남기고, 주행 중에는 움직임이 0 인지 잰다.
// node motion-check.mjs [base]   ->  shots/v3/motion/*.png + 결과 줄
import puppeteer from 'puppeteer-core'
import { mkdirSync } from 'node:fs'

const BASE = process.argv[2] ?? 'http://127.0.0.1:5175/'
const OUT = new URL('./shots/v3/motion/', import.meta.url)
mkdirSync(OUT, { recursive: true })
const file = (n) => decodeURIComponent(new URL(n + '.png', OUT).pathname.slice(1))
const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--mute-audio', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  userDataDir: 'C:/Users/DANHA/AppData/Local/Temp/jaejeok-v3-motion-chrome',
})
const page = await browser.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
const S = (ms) => new Promise((r) => setTimeout(r, ms))
const J = (fn, ...a) => page.evaluate(fn, ...a)
const anims = () => J(() => document.getAnimations().filter((a) => a.playState === 'running').map((a) => a.animationName ?? a.transitionProperty ?? 'anim'))
const out = []
const log = (s) => (out.push(s), console.log(s))
/** 한 동작 뒤 프레임 여러 장 (ms 시점) */
async function frames(name, act, at = [0, 60, 120, 200, 320, 600], rate = 0.2) {
  // CSS 움직임을 1/5 속도로 (사진 한 장이 수백 ms 걸려도 중간 모습이 남게). 프레임 이름의 ms 는 실제 속도 기준
  const cdp = await page.createCDPSession()
  await cdp.send('Animation.enable')
  await cdp.send('Animation.setPlaybackRate', { playbackRate: rate })
  const t0 = Date.now()
  await act()
  await S(30)
  const names = await anims()
  for (const t of at) {
    const w = t / rate - (Date.now() - t0)
    if (w > 0) await S(w)
    await page.screenshot({ path: file(`${name}_${String(t).padStart(4, '0')}ms`) })
  }
  await cdp.send('Animation.setPlaybackRate', { playbackRate: 1 })
  await cdp.detach()
  log(`${name}: 움직임 ${names.length}개 (${[...new Set(names)].slice(0, 6).join(', ')})`)
}

// ── 내비 1224 x 880 (Pleos 앱 하나) ──
await page.setViewport({ width: 1224, height: 880, deviceScaleFactor: 1 })
await page.goto(BASE + '?app=nav&fresh&demo=1', { waitUntil: 'networkidle0' })
await page.waitForFunction(() => !!window.__jj && !!window.__nav)
await J(() => window.__jj.app.set({ settings: { ...window.__jj.app.get().settings, voice: false } }))
await S(1200)
await frames('nav_1_load_confirm', () => J(() => window.__jj.confirmLoad({ kind: 'box', massKg: 300, belts: 2, beltType: 'ratchet', frontWall: false })), [0, 80, 200, 400, 800, 1600], 1)
await S(800)
await frames('nav_2_settings_open', () => J(() => window.__nav.nav.set({ sheet: 'settings' })))
await frames('nav_3_settings_close', () => J(() => window.__nav.nav.set({ sheet: null })), [0, 80, 160, 260])
await frames('nav_4_records', () => J(() => window.__nav.nav.set({ records: true })))
await J(() => window.__nav.nav.set({ records: false }))
await S(600)
await frames('nav_5_view_top', () => J(() => window.__nav.nav.set({ view: 'top' })), [0, 150, 300, 450, 700])
await J(() => window.__nav.nav.set({ view: '3d' }))
// 3D 쉼 흔들림: 손대지 않고 5 s 뒤 시점이 천천히 움직인다
await S(10000)
const a = await page.screenshot({ clip: { x: 200, y: 160, width: 600, height: 400 }, encoding: 'base64' })
await S(1500)
const b = await page.screenshot({ clip: { x: 200, y: 160, width: 600, height: 400 }, encoding: 'base64' })
log('nav_6_idle_orbit: 1.5 s 사이 3D 그림 ' + (a === b ? '같음 (움직이지 않음)' : '바뀜 (쉼 흔들림 동작)'))
await page.screenshot({ path: file('nav_6_idle_orbit') })
// 주행: 움직임 0
await J(() => (window.__jj.simControl.gear('D'), window.__jj.simControl.target(40)))
await page.waitForFunction(() => window.__jj.app.get().out?.mode === 'drive', { timeout: 30000 })
await S(400)
const dn = await anims()
const d1 = await page.screenshot({ encoding: 'base64' })
await S(500)
const d2 = await page.screenshot({ encoding: 'base64' })
log(`nav_7_drive: 도는 움직임 ${dn.length}개 · 0.5 s 사이 화면 ${d1 === d2 ? '같음' : '바뀜'}`)
await page.screenshot({ path: file('nav_7_drive') })
// 정차 · 다시 묶기 (키트 대본): 짐이 출발 때 자리에서 미끄러져 온다 · 체크 · 다 됐어요
await J(() => window.__jj.playScenario('kit-slide'))
for (let i = 0; i < 280; i++) {
  await S(250)
  const s = await J(() => ({ l: window.__jj.app.get().speech.listening, w: !!window.__jj.app.get().waypoint, m: window.__jj.app.get().out?.mode }))
  if (s.l) await J(() => window.__jj.answerYes())
  if (s.w && i > 20) break
}
for (let i = 0; i < 160; i++) {
  await S(250)
  if ((await J(() => window.__jj.app.get().out?.mode)) !== 'drive' || (await J(() => Math.round(window.__jj.app.get().sim.speedKmh))) === 0) break
}
await J(() => window.__jj.playScenario('arrive'))
await page.waitForFunction(() => window.__jj.app.get().out?.mode === 'park', { timeout: 40000 })
await frames('nav_8_relash_enter', () => S(0), [0, 300, 600, 900, 1300, 1800])
const box = await page.$('.ui-check')
if (box) await frames('nav_9_check', () => box.click(), [0, 80, 160, 300])
const act = await page.evaluateHandle(() => [...document.querySelectorAll('.nv-action button')][0])
await frames('nav_10_relashed', () => act.asElement()?.click(), [0, 120, 300, 700, 1500, 2200], 1)

// ── 폰 390 x 844 ──
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 })
await page.goto(BASE + '?app=phone&fresh&device', { waitUntil: 'networkidle0' })
await page.waitForFunction(() => !!window.__jj && !!window.__jjPhone)
await S(900)
await frames('ph_1_confirm', () => J(() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('확인하고 3D로 보기'))?.click()), [0, 80, 200, 400, 800])
await S(800)
await frames('ph_2_tab_records', () => J(() => window.__jjPhone.switchTab('records')))
// 당겨서 새로 고침 (마우스로 끌기)
const sc = await page.$('.ph-pull')
if (sc) {
  const r = await sc.boundingBox()
  await page.mouse.move(r.x + r.width / 2, r.y + 40)
  await page.mouse.down()
  for (let i = 1; i <= 8; i++) await page.mouse.move(r.x + r.width / 2, r.y + 40 + i * 22)
  await page.screenshot({ path: file('ph_3_pull_drag') })
  await frames('ph_3_pull_release', () => page.mouse.up(), [0, 150, 400, 800])
}
await frames('ph_4_sheet_open', () => J(() => window.__jjPhone.openSheet({ kind: 'export', id: window.__jj.app.get().waybill.id })))
await frames('ph_5_sheet_close', () => J(() => window.__jjPhone.closeSheet()), [0, 80, 160, 260])
await J(() => (window.__jjPhone.setRole('operator'), window.__jjPhone.switchTab('hub')))
await S(1200)
await frames('ph_6_hub_expand', () => J(() => document.querySelectorAll('.ph-truck')[1]?.click()), [0, 80, 160, 280, 480, 800])
await frames('ph_7_pop', () => J(() => window.__jjPhone.back()), [0, 120, 320])
log('errors: ' + (errors.length ? errors.slice(0, 5).join(' | ') : '없음'))
await browser.close()
