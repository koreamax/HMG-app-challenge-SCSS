// 내비 판 화면 찍기 (화면 없는 Chrome). node nav-shots.mjs [url]   (ONLY=park,drive,... 로 일부만)
// 1920 x 720 · 1920 x 1080, 낮 · 밤. shots/nav/ 에 남긴다.
import puppeteer from 'puppeteer-core'
import { mkdirSync } from 'node:fs'

const BASE = process.argv[2] ?? 'http://127.0.0.1:5173/'
const OUT = new URL('./shots/v2/nav/', import.meta.url)
mkdirSync(OUT, { recursive: true })
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const only = process.env.ONLY ? process.env.ONLY.split(',') : null
const run = (k) => !only || only.includes(k)
const QUICK = !!process.env.QUICK

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--window-size=1920,1080', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  userDataDir: 'C:/Users/DANHA/AppData/Local/Temp/jaejeok-v2-nav-chrome',
  defaultViewport: { width: 1920, height: 720 },
})
const page = await browser.newPage()
const errors = []
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text())
})
const S = (ms) => new Promise((r) => setTimeout(r, ms))
const J = (fn, ...a) => page.evaluate(fn, ...a)
const st = () =>
  J(() => {
    const s = window.__jj.app.get()
    return { screen: s.screen, mode: s.out?.mode, tone: s.out?.status.tone, title: s.out?.status.title, kmh: Math.round(s.sim.speedKmh), listening: s.speech.listening, alert: s.out?.alert?.kind ?? null, waypoint: s.waypoint?.name ?? null }
  })
const file = (name) => decodeURIComponent(new URL(name + '.png', OUT).pathname.slice(1))

async function setTheme(t) {
  await J((t) => window.__nav.setTheme(t), t)
}
async function size(h) {
  await page.setViewport({ width: 1920, height: h, deviceScaleFactor: 1 })
}
// Pleos Connect 에뮬레이터 (2560 x 1440, 화면 배율 1.375) 의 실제 앱 창 (CSS px): 앱 하나 1224 x 880, 앱 둘(세로 창) 611 x 880
const REAL = [
  [1224, 880],
  [611, 880],
]
/** 지금 화면을 실제 창 크기 둘 x 낮 · 밤으로: p1224_<step>_<day|night>.png, p611_... */
async function shootReal(step, { themes = ['day', 'night'], wait = 600, sizes = REAL } = {}) {
  for (const [w, h] of sizes) {
    await page.setViewport({ width: w, height: h, deviceScaleFactor: 1.375 })
    for (const t of themes) {
      await setTheme(t)
      await S(wait)
      await page.screenshot({ path: file(`p${w}_${step}_${t}`) })
    }
  }
  await size(720)
  await setTheme('day')
  await S(250)
}
/** 지금 화면을 크기 둘 x 낮 · 밤으로 */
async function shoot(name, { sizes = QUICK ? [720] : [720, 1080], themes = ['day', 'night'], wait = 650, real = null } = {}) {
  if (process.env.REALONLY && real) return shootReal(real)
  for (const h of sizes) {
    await size(h)
    for (const t of themes) {
      await setTheme(t)
      await S(wait)
      await page.screenshot({ path: file(`${name}_${h}_${t}`) })
    }
  }
  await size(720)
  await setTheme('day')
  await S(200)
  if (real) await shootReal(real)
}
async function fresh(q = '') {
  await size(720)
  await page.goto(BASE + '?app=nav&fresh&demo=1' + q, { waitUntil: 'networkidle0' })
  await page.waitForFunction(() => !!window.__jj && !!window.__nav)
  await J(() => window.__jj.app.set({ settings: { ...window.__jj.app.get().settings, voice: false } }))
  await S(900)
}
async function waitFor(pred, maxS = 60, label = '') {
  for (let i = 0; i < maxS * 4; i++) {
    const s = await st()
    if (pred(s)) return s
    await S(250)
  }
  const s = await st()
  console.log('timeout', label, JSON.stringify(s))
  return s
}
async function arrive() {
  await J(() => window.__jj.playScenario('arrive'))
  await waitFor((s) => s.mode === 'park', 30, 'arrive')
  await S(1500)
}
const load = (input) => J((i) => window.__jj.confirmLoad(i), input)
const clickText = (t) => J((t) => [...document.querySelectorAll('button')].find((b) => b.textContent.includes(t))?.click(), t)

// 1. 처음: 상차 시트 -> 3D 확인 (주황 · 바 하나 더)
if (run('park')) {
  await fresh()
  await shoot('01_load_sheet', { real: 'load_sheet' })
  await load({ kind: 'box', massKg: 300, belts: 3, beltType: 'ratchet', frontWall: false })
  await S(1500)
  await shoot('02_park_slide', { real: 'park_slide' })
  await J(() => window.__nav.nav.set({ detail: true }))
  await shoot('03_park_detail', { sizes: [720], themes: ['day', 'night'] })
  await J(() => window.__nav.nav.set({ detail: false, view: 'top' }))
  await shoot('04_park_top', { sizes: [720], themes: ['day'] })
  await J(() => window.__nav.nav.set({ view: 'kit' }))
  await shoot('04_park_kitview_nokit', { sizes: [720], themes: ['night'] })
  await J(() => window.__nav.nav.set({ view: '3d' }))
  // AAOS 막대로 창이 낮아진 경우 (900 밑이면 720 값, 3D 무대만 준다)
  await page.setViewport({ width: 1920, height: 800 })
  await S(700)
  await page.screenshot({ path: file('09_park_slide_800_day') })
  await size(720)
  await load({ kind: 'furniture', massKg: 300, belts: 3, beltType: 'ratchet', frontWall: true })
  await S(1200)
  await shoot('05_park_green', { real: 'park_green' })
  await load({ kind: 'appliance', massKg: 300, belts: 4, beltType: 'ratchet', frontWall: false })
  await S(1200)
  await shoot('06_park_tip', { sizes: [720], themes: ['day', 'night'] })
  await J(() => window.__nav.nav.set({ sheet: 'settings' }))
  await shoot('07_settings', { sizes: [720, 1080], themes: ['day', 'night'], real: 'settings' })
  await J(() => window.__nav.nav.set({ sheet: null }))
  await J(() => window.__nav.nav.set({ sheet: 'load' }))
  await shoot('08_load_sheet_edit', { sizes: [1080], themes: ['day'] })
  await J(() => window.__nav.nav.set({ sheet: null }))
}

// 2. 키트 (Isaac 기록 출발 전) -> 벨트 꼬리표 · 센서 키트 보기
if (run('kit')) {
  await fresh()
  await load({ kind: 'box', massKg: 300, belts: 2, beltType: 'ratchet', frontWall: false })
  await J(() => window.__jj.kitControl.isaac('slide2'))
  await S(1500)
  await shoot('10_park_kit')
  await J(() => window.__nav.nav.set({ view: 'kit' }))
  await shoot('11_park_kitview')
  await J(() => window.__nav.nav.set({ view: '3d' }))
}

// 3. 주행: 주황 -> 키트 없음 급제동 -> 빨강 확인 필요 -> 정차 -> 다시 묶기 (키트 없음)
if (run('kitless')) {
  await fresh()
  await load({ kind: 'appliance', massKg: 300, belts: 2, beltType: 'ratchet', frontWall: false })
  await J(() => window.__jj.playScenario('kitless-brake'))
  await waitFor((s) => s.mode === 'drive' && s.kmh > 30, 30, 'drive')
  await shoot('20_drive_orange', { real: 'drive_orange' })
  await waitFor((s) => s.alert === 'check', 60, 'check')
  // 제동 중 (아직 묻기 전): 빨강 '확인 필요' 한 줄만
  await S(300)
  await shoot('21_drive_red_check')
  // 고속도로 · 키트 없음: 선 뒤 2 s 에 '다음 졸음쉼터에서 확인할까요?' -> 5 s 듣는 중
  const ls = await waitFor((s) => s.listening, 30, 'kitless listen')
  console.log('kitless listen', JSON.stringify(ls))
  if (ls.listening) {
    // 듣는 중은 5 s 뿐: 720 낮 하나, 그다음 실제 창 (세로 창 먼저)
    await page.screenshot({ path: file('23_drive_listening_kitless_720_day') })
    await shootReal('drive_listening_kitless', { wait: 220, sizes: [REAL[1], REAL[0]] })
    console.log('still listening after shots', (await st()).listening)
    await J(() => window.__jj.answerYes())
  }
  const wp = await waitFor((s) => !!s.waypoint, 20, 'kitless waypoint')
  console.log('kitless after yes', JSON.stringify({ ...wp, line: await J(() => window.__jj.app.get().out?.status.line) }))
  await S(800)
  await shoot('24_drive_red_check_waypoint', { sizes: [720], themes: ['day'] })
  await arrive()
  await shoot('22_relash_kitless', { real: 'relash_kitless' })
  await clickText('밀림 있음')
  await S(600)
  await shoot('25_relash_kitless_answered', { sizes: [720], themes: ['day'] })
}

// 3b. 정차 중에 묻는 경우: 급제동으로 선 순간 P -> 다시 묶기 화면 + 듣는 중 알약 -> 네 -> 경유지 문장
if (run('kitlesspark')) {
  await fresh()
  await load({ kind: 'appliance', massKg: 300, belts: 2, beltType: 'ratchet', frontWall: false })
  await J(() => window.__jj.playScenario('kitless-brake'))
  await waitFor((s) => s.alert === 'check', 60, 'check')
  await waitFor((s) => s.kmh === 0, 20, 'stopped')
  await J(() => (window.__jj.simControl.stop(), window.__jj.simControl.gear('P')))
  const s1 = await waitFor((s) => s.listening, 20, 'parked listen')
  console.log('parked listen', JSON.stringify(s1))
  await S(300)
  await shoot('26_relash_listening_parked', { sizes: [720], themes: ['day', 'night'], wait: 250 })
  await J(() => window.__jj.answerYes())
  await waitFor((s) => !!s.waypoint, 20, 'parked waypoint')
  await S(700)
  await shoot('27_relash_waypoint_parked', { sizes: [720], themes: ['day'] })
}

// 4. 키트 · 바 2개 급제동 -> 짐 밀림 -> 듣는 중 -> 네 -> 정차 -> 다시 묶기 (배지 · 점선 · 화살)
if (run('slide')) {
  await fresh()
  await J(() => window.__jj.playScenario('kit-slide'))
  const s = await waitFor((s) => s.listening, 70, 'listen')
  if (s.listening) {
    await setTheme('day')
    await S(300)
    await page.screenshot({ path: file('30_drive_listening_720_day') })
    await setTheme('night')
    await S(300)
    await page.screenshot({ path: file('30_drive_listening_720_night') })
    await size(1080)
    await setTheme('day')
    await S(500)
    await page.screenshot({ path: file('30_drive_listening_1080_day') })
    await size(720)
    await setTheme('day')
    await J(() => window.__jj.answerYes())
  }
  await waitFor((s) => !!s.waypoint, 20, 'waypoint')
  await S(1500)
  await shoot('31_drive_red_moved', { sizes: [720, 1080], themes: ['day', 'night'] })
  await waitFor((s) => s.kmh === 0 || s.mode === 'park', 40, 'slide end')
  await arrive()
  await shoot('32_relash_kit', { real: 'relash_kit' })
  await J(() => window.__nav.nav.set({ view: 'top' }))
  await shoot('33_relash_kit_top', { sizes: [720], themes: ['day'] })
  await J(() => window.__nav.nav.set({ view: '3d' }))
  await clickText('다시 조였어요')
  await S(1500)
  await shoot('34_park_after_relash', { sizes: [720], themes: ['day', 'night'] })
  await J(() => window.__nav.nav.set({ records: true }))
  await shoot('35_records', { real: 'records' })
  await J(() => window.__nav.nav.set({ records: false }))
}

// 5. 키트 · 주행 중 바 풀림
if (run('loose')) {
  await fresh()
  await J(() => window.__jj.playScenario('kit-loose'))
  await waitFor((s) => s.alert === 'loose' || s.alert === 'moved', 70, 'loose')
  await S(3000)
  await shoot('40_drive_red_loose', { sizes: [720], themes: ['day', 'night'] })
  await waitFor((s) => s.kmh === 0, 60, 'loose end')
  await arrive()
  await shoot('41_relash_loose')
}

// 6. 키트 · 키 큰 짐 고무바 -> 넘어져 떨어짐 -> 짐 이탈 의심
if (run('lost')) {
  await fresh()
  await J(() => window.__jj.playScenario('kit-lost'))
  await waitFor((s) => s.alert === 'lost', 70, 'lost')
  await S(3000)
  await shoot('50_drive_lost', { sizes: [720], themes: ['day', 'night'] })
  await waitFor((s) => s.kmh === 0, 60, 'lost end')
  await arrive()
  await shoot('51_relash_lost', { real: 'relash_lost' })
}

// 7. 회색 (속도 신호 드묾) · 초록 주행
if (run('grey')) {
  await fresh()
  await load({ kind: 'furniture', massKg: 300, belts: 3, beltType: 'ratchet', frontWall: true })
  await J(() => (window.__jj.simControl.gear('D'), window.__jj.simControl.target(40)))
  await waitFor((s) => s.mode === 'drive' && s.kmh > 20, 30, 'green drive')
  await S(800)
  await shoot('60_drive_green', { sizes: [720, 1080], themes: ['day', 'night'] })
  await J(() => window.__jj.simControl.speedHz(2))
  await waitFor((s) => s.tone === 'grey', 20, 'grey')
  await S(500)
  await shoot('61_drive_grey', { sizes: [720], themes: ['day', 'night'] })
}

// 7b. 키트가 잰 짐 자세 그대로 (정차 중 Isaac 'lost' 기록을 20 s 쯤부터: 키 큰 짐이 옆으로 넘어가는 중 -> 떨어짐)
if (run('pose')) {
  await fresh()
  await load({ kind: 'appliance', massKg: 300, belts: 2, beltType: 'rubber', frontWall: false })
  await S(800)
  // 기록 안의 시각을 20.3 s 에 붙들어 둔다 (넘어지는 중: 오른쪽으로 0.84 m, 30°)
  await J(() => {
    window.__jj.kit.startIsaac('lost', performance.now() / 1000 - 20.3)
    window.__freeze = setInterval(() => (window.__jj.kit.runStart = performance.now() / 1000 - 20.3), 20)
  })
  await S(1200)
  await page.screenshot({ path: file('65_pose_tipping_720_day') })
  await J(() => window.__nav.nav.set({ view: 'kit' }))
  await S(700)
  await page.screenshot({ path: file('65_pose_tipping_kitview_720_day') })
  await J(() => window.__nav.nav.set({ view: '3d' }))
  await J(() => clearInterval(window.__freeze))
  await S(1500)
  await page.screenshot({ path: file('66_pose_fallen_720_day') })
  await J(() => window.__nav.nav.set({ view: 'kit' }))
  await S(700)
  await page.screenshot({ path: file('67_pose_fallen_kitview_720_day') })
  await J(() => window.__nav.nav.set({ view: '3d' }))
}

// 7c. 짐 다섯 가지 (적재함만 그린 3D, 가까이): 1920 x 1080 낮
if (run('cargo')) {
  await fresh()
  await size(1080)
  for (const [k, belts, type, wall] of [['pallet', 3, 'ratchet', false], ['appliance', 2, 'ratchet', false], ['furniture', 3, 'ratchet', true], ['material', 2, 'ratchet', false], ['box', 2, 'rubber', false]]) {
    await load({ kind: k, massKg: 300, belts, beltType: type, frontWall: wall })
    await S(1300)
    await page.screenshot({ path: file('80_cargo_' + k + '_1080_day') })
  }
  await J(() => window.__nav.nav.set({ view: 'top' }))
  await S(900)
  await page.screenshot({ path: file('81_cargo_box_top_1080_day') })
  await J(() => window.__nav.nav.set({ view: '3d' }))
  await size(720)
}

// 8. 시연 무대 (내비 + 폰 + 시연 패널)
if (run('stage')) {
  await page.setViewport({ width: 1920, height: 1080 })
  await page.goto(BASE + '?app=stage&fresh&demo=1', { waitUntil: 'networkidle0' })
  await page.waitForFunction(() => !!window.__jj)
  await S(1500)
  await page.screenshot({ path: file('70_stage') })
}

console.log(errors.length ? 'errors:\n' + [...new Set(errors)].slice(0, 30).join('\n') : 'no console errors')
await browser.close()
