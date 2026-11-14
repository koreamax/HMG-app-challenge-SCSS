// 적재적소 앱 끝에서 끝까지 시험 (화면 없는 Edge). node run.mjs [url]
// 기획서의 시연 흐름을 그대로 돌리고 화면을 shots/ 에 남긴다.
import puppeteer from 'puppeteer-core'
import { mkdirSync } from 'node:fs'

const URL0 = process.argv[2] ?? 'http://127.0.0.1:5190/'
const OUT = new globalThis.URL('./shots/', import.meta.url)
mkdirSync(OUT, { recursive: true })
const EDGE = 'C:/Program Files/Google/Chrome/Application/chrome.exe' // 화면 없는 Chrome (따로 만든 프로필, 확장 없음)
const only = process.env.ONLY ? process.env.ONLY.split(',') : null

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: true,
  args: ['--autoplay-policy=no-user-gesture-required', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--window-size=1800,810'],
  userDataDir: 'C:/Users/DANHA/AppData/Local/Temp/jaejeok-e2e-chrome',
  dumpio: !!process.env.DUMPIO,
  defaultViewport: { width: 1800, height: 810 },
})
const page = await browser.newPage()
const errors = []
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
page.on('console', (m) => {
  if (m.type() === 'error') errors.push('console: ' + m.text())
})
const S = (ms) => new Promise((r) => setTimeout(r, ms))
const st = () => page.evaluate(() => {
  const s = window.__jj.app.get()
  return { screen: s.screen, mode: s.out?.mode, tone: s.out?.status.tone, title: s.out?.status.title, line: s.out?.status.line, kmh: Math.round(s.sim.speedKmh), gear: s.sim.gear, speech: s.speech.line, listening: s.speech.listening, waypoint: s.waypoint?.name ?? null, grey: s.out?.greyReason ?? null, alert: s.out?.alert ? { kind: s.out.alert.kind, peakG: s.out.alert.peakG, limitG: s.out.alert.limitG, dir: s.out.alert.dir, shiftMm: s.out.alert.shiftMm } : null, verdict: s.out ? { title: s.out.verdict.title, limit: +s.out.verdict.limit.toFixed(3) } : null }
})
const entries = () => page.evaluate(() => window.__jj.app.get().waybill?.entries.map((e) => e.kind + ':' + (e.text || e.title || e.name || e.heard || '')) ?? [])
const shot = async (name) => page.screenshot({ path: new globalThis.URL(name + '.png', OUT).pathname.slice(1) })
const J = (fn, ...a) => page.evaluate(fn, ...a)
const results = []
const check = (name, ok, info) => {
  results.push((ok ? 'PASS ' : 'FAIL ') + name + (info ? ' :: ' + info : ''))
}
async function fresh(q = '') {
  await page.goto(URL0 + '?fresh=1' + q, { waitUntil: 'networkidle0' })
  await page.waitForFunction(() => !!window.__jj)
  await S(800)
}
const run = (k) => !only || only.includes(k)
/** 쉼터 도착 대본 -> 정차할 때까지 기다린다 */
async function arrive(maxS = 16) {
  await J(() => window.__jj.playScenario('arrive'))
  for (let i = 0; i < maxS; i++) {
    await S(1000)
    const s = await st()
    if (s.mode === 'park') break
  }
  await S(1500)
}

// 1. 상차 화면 -> 3D 확인
if (run('load')) {
  await fresh()
  await shot('01_load')
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('확인하고 3D로 보기')).click())
  await S(2500)
  const s = await st()
  check('상차 확인 -> 3D 화면', s.screen === 'home', JSON.stringify(s.verdict))
  await shot('02_home')
  await J(() => [...document.querySelectorAll('[role=tab]')].find((b) => b.textContent.includes('위에서'))?.click())
  await S(900)
  await shot('03_home_top')
}

// 2. 키트 없음 · 고속도로 급제동
if (run('kitless')) {
  await fresh()
  await J(() => window.__jj.confirmLoad({ kind: 'appliance', massKg: 300, belts: 2, beltType: 'ratchet', frontWall: false }))
  await J(() => window.__jj.playScenario('kitless-brake'))
  await S(4000)
  let s = await st()
  check('주행 중 주황', s.mode === 'drive' && s.tone === 'orange', s.title + ' / ' + s.line)
  await shot('04_drive_orange')
  for (let i = 0; i < 40; i++) {
    await S(1000)
    s = await st()
    if (s.alert) break
  }
  check('급제동 -> 확인 필요', s.alert?.kind === 'check' && s.tone === 'red', JSON.stringify(s.alert))
  await S(4500)
  await shot('05_drive_red')
  await arrive()
  s = await st()
  check('정차 -> 다시 묶기 화면', s.screen === 'relash' && s.mode === 'park', s.screen)
  await shot('06_relash_kitless')
  const e = await entries()
  check('기록: 확인 필요 음성', e.includes('speech:방금 짐에 큰 힘이 걸렸습니다. 다음에 설 때 짐을 확인하세요.'), e.join(' / '))
}

// 3. 키트 · 40 N -> 짐 밀림 -> 네 -> 경유지 -> 다시 묶기
if (run('kit40')) {
  await fresh()
  await J(() => window.__jj.playScenario('kit-slide40'))
  let s
  let asked = false
  for (let i = 0; i < 45; i++) {
    await S(1000)
    s = await st()
    if (s.listening && !asked) {
      asked = true
      await shot('07_drive_listening')
      await J(() => window.__jj.answerYes())
    }
    if (s.waypoint) break
  }
  check('키트 40 N -> 짐 밀림', s.alert?.kind === 'moved', JSON.stringify(s.alert))
  check('네 -> 쉼터 경유지', !!s.waypoint, s.line)
  await S(1500)
  await shot('08_drive_waypoint')
  await arrive()
  s = await st()
  check('정차 -> 다시 묶기 (키트)', s.screen === 'relash', s.screen)
  await shot('09_relash_kit')
  await J(() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('다시 조였어요'))?.click())
  await S(1500)
  await J(() => [...document.querySelectorAll('[role=tab]')].find((b) => b.textContent.includes('센서 키트'))?.click())
  await S(3500)
  await shot('10_home_kit_twin')
  const e = await entries()
  check('기록: 짐 밀림 문장 + 대답 + 경유지 + 조치', ['speech:짐이 밀렸습니다. 다음 졸음쉼터에서 확인하세요. 안내할까요?', 'answer:네 (시연 입력)'].every((x) => e.includes(x)) && e.some((x) => x.startsWith('waypoint:')) && e.some((x) => x.startsWith('relash')), e.join(' / '))
  await J(() => window.__jj.app.set({ screen: 'records' }))
  await S(1200)
  await shot('11_records')
  await J(() => [...document.querySelectorAll('[role=tab]')].find((b) => b.textContent.includes('관리자 집계'))?.click())
  await S(1200)
  await shot('12_records_manager')
}

// 4. 키트 · 15 N -> 짐 이탈 의심
if (run('kit15')) {
  await fresh()
  await J(() => window.__jj.playScenario('kit-lost15'))
  let s
  for (let i = 0; i < 30; i++) {
    await S(1000)
    s = await st()
    if (s.alert?.kind === 'lost' && s.kmh === 0) break
  }
  await S(3000)
  await shot('13_drive_lost')
  await arrive()
  s = await st()
  check('키트 15 N -> 짐 이탈 의심 화면', s.screen === 'relash' && s.alert?.kind === 'lost', JSON.stringify(s.alert))
  await S(8000)
  const e = await entries()
  const ev = e.filter((x) => x.startsWith('speech:') && !x.includes('급제동 때'))
  check('이탈 문장 하나만', ev.length === 1 && ev[0].includes('짐이 떨어졌을 수 있습니다'), ev.join(' / '))
  await shot('14_relash_lost')
}

// 5. 키트 · 60 N -> 사건 없음
if (run('kit60')) {
  await fresh()
  await J(() => window.__jj.playScenario('kit-hold60'))
  let s
  for (let i = 0; i < 26; i++) {
    await S(1000)
    s = await st()
  }
  check('키트 60 N -> 사건 없음', !s.alert, s.title)
}

// 6. 방지턱 안내 · 회전 · 드문 속도 신호
if (run('misc')) {
  await fresh()
  await J(() => window.__jj.confirmLoad({ kind: 'box', massKg: 300, belts: 2, beltType: 'ratchet', frontWall: false }))
  await J(() => window.__jj.playScenario('caution'))
  let s
  let saw = null
  for (let i = 0; i < 25; i++) {
    await S(1000)
    s = await st()
    if (s.line?.includes('방지턱')) {
      if (!saw) await shot('15_drive_bump')
      saw = s.line
    }
    const e = await entries()
    if (e.includes('speech:짐 고정이 약합니다. 방지턱을 천천히 넘으세요.')) break
  }
  const e1 = await entries()
  check('방지턱 300 m 앞 안내', e1.includes('speech:짐 고정이 약합니다. 방지턱을 천천히 넘으세요.') && !!saw, saw)
  await arrive()
  await J(() => window.__jj.confirmLoad({ kind: 'appliance', massKg: 300, belts: 2, beltType: 'ratchet', frontWall: false }, { newWaybill: true }))
  await J(() => window.__jj.playScenario('kitless-turn'))
  for (let i = 0; i < 20; i++) {
    await S(1000)
    s = await st()
    if (s.alert) break
  }
  check('급한 회전 -> 확인 필요 (회전)', s.alert?.kind === 'check' && s.alert?.dir === 'turn', JSON.stringify(s.alert))
  await arrive()
  await J(() => window.__jj.relashDone())
  await J(() => (window.__jj.simControl.speedHz(2), window.__jj.simControl.gear('D'), window.__jj.simControl.target(40)))
  await S(9000)
  s = await st()
  check('속도 신호 2 Hz -> 회색', s.tone === 'grey' && s.grey === '속도 신호가 드묾', s.title + ' / ' + s.line)
  await shot('16_drive_grey')
  await J(() => window.__jj.simControl.speedHz(10))
  await S(3000)
  s = await st()
  check('10 Hz 로 돌아오면 회색 풀림', s.tone !== 'grey', s.title)
}

// 7. 설정 시트
if (run('settings')) {
  await fresh()
  await J(() => window.__jj.confirmLoad({ kind: 'pallet', massKg: 500, belts: 3, beltType: 'ratchet', frontWall: true }))
  await S(1500)
  await J(() => document.querySelector('button[aria-label="설정"]').click())
  await S(800)
  await shot('17_settings')
}

console.log(results.join('\n'))
console.log(errors.length ? 'ERRORS:\n' + [...new Set(errors)].slice(0, 20).join('\n') : 'no page errors')
await browser.close()
