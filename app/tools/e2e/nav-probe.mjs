// 내비 한 장면 살펴보기 (화면 없는 Chrome): 장면으로 바로 가서 사진 + 넘침 · 낮은 누를 것 보고. shots/_probe/ 에 남긴다.
//   node nav-probe.mjs <url> <scene[,scene]> [h[,h]]     h: 720 · 1080 (1920 폭) · 880 (실제 창 1224 x 880) · 881 (세로 창 611 x 880)
//   scene: park | green | tip | many | rubber | detail | three | top | kitview | sheet | relash-kitless | drive      (THEMES=night,day · DUMP=<selector>)
import puppeteer from 'puppeteer-core'
import { mkdirSync } from 'node:fs'

const BASE = process.argv[2] ?? 'http://127.0.0.1:4173/'
const SCENES = (process.argv[3] ?? 'park').split(',')
const SIZES = (process.argv[4] ?? '720,1080').split(',').map(Number)
const OUT = new URL('./shots/_probe/', import.meta.url)
mkdirSync(OUT, { recursive: true })
const file = (name) => decodeURIComponent(new URL(name + '.png', OUT).pathname.slice(1))
const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--autoplay-policy=no-user-gesture-required', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--window-size=1920,1080', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  userDataDir: 'C:/Users/DANHA/AppData/Local/Temp/jaejeok-v5-probe-chrome',
  defaultViewport: { width: 1920, height: 720 },
})
const page = await browser.newPage()
await page.setCacheEnabled(false)
await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }])
const errors = []
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
page.on('console', (m) => {
  if (m.type() === 'error') errors.push('error: ' + m.text())
})
const S = (ms) => new Promise((r) => setTimeout(r, ms))
const J = (fn, ...a) => page.evaluate(fn, ...a)
const st = () =>
  J(() => {
    const s = window.__jj.app.get()
    return { screen: s.screen, mode: s.out?.mode, kmh: Math.round(s.sim.speedKmh), listening: s.speech.listening, alert: s.out?.alert?.kind ?? null, waypoint: s.waypoint?.name ?? null }
  })
async function waitFor(pred, maxS = 60, label = '') {
  for (let i = 0; i < maxS * 4; i++) {
    const s = await st()
    if (pred(s)) return s
    await S(250)
  }
  console.log('timeout', label, JSON.stringify(await st()))
}
async function fresh(q = '') {
  await page.setViewport({ width: 1920, height: 720, deviceScaleFactor: 1 })
  await page.goto(BASE + '?app=nav&fresh&demo=1' + q, { waitUntil: 'networkidle0' })
  await page.waitForFunction(() => !!window.__jj && !!window.__nav)
  await J(() => window.__jj.app.set({ settings: { ...window.__jj.app.get().settings, voice: false } }))
  await S(900)
}
const load = (input) => J((i) => window.__jj.confirmLoad(i), input)
async function arrive() {
  await J(() => window.__jj.playScenario('arrive'))
  await waitFor((s) => s.mode === 'park', 30, 'arrive')
  await S(1500)
}
async function shoot(name) {
  for (const h of SIZES) {
    if (h === 880) await page.setViewport({ width: 1224, height: 880, deviceScaleFactor: 1.375 })
    else if (h === 881) await page.setViewport({ width: 611, height: 880, deviceScaleFactor: 1.375 })
    else await page.setViewport({ width: 1920, height: h, deviceScaleFactor: 1 })
    await S(900)
    for (const t of (process.env.THEMES ?? 'night').split(',')) {
      await J((t) => window.__nav.setTheme(t), t)
      await S(700)
      await page.screenshot({ path: file(`${name}_${h}_${t}`) })
      console.log('saved', `${name}_${h}_${t}.png`)
    }
  }
  // 넘침 · 잘림 · 낮은 누를 것 살피기 (마지막 크기에서)
  const rep = await J(() => {
    const root = document.querySelector('.jj.nav')
    const k = root.getBoundingClientRect().width / root.offsetWidth
    const out = []
    for (const el of root.querySelectorAll('.nv-right, .nv-banner, .nv-kpi .nm b, .nv-card, .nv-verdict, .nv-todo strong, .nv-todo span, .nv-phead .meta')) {
      if (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1) out.push('overflow ' + el.className + ' "' + el.textContent.slice(0, 24) + '" ' + el.scrollWidth + 'x' + el.scrollHeight + ' in ' + el.clientWidth + 'x' + el.clientHeight)
    }
    for (const el of root.querySelectorAll('button, a[href], [role=button], [role=checkbox]')) {
      const r = el.getBoundingClientRect()
      if (r.width && r.height / k < 59.5) out.push('low target ' + Math.round(r.height / k) + ' ' + (el.getAttribute('aria-label') || el.textContent.slice(0, 16)))
    }
    return out
  })
  console.log(name, rep.length ? rep.join('\n  ') : 'no overflow, targets ok')
  if (process.env.DUMP) console.log(await J((sel) => [...document.querySelectorAll(sel)].map((e) => e.outerHTML.slice(0, 1500) + ' @' + JSON.stringify(e.getBoundingClientRect())).join('\n---\n') || 'none: ' + sel, process.env.DUMP))
}

for (const scene of SCENES) {
  if (scene === 'park') {
    await fresh()
    await load({ kind: 'box', massKg: 300, belts: 3, beltType: 'ratchet', frontWall: false })
    await S(2500)
    await shoot('park')
  } else if (scene === 'detail' || scene === 'three') {
    // detail = 자세히 켬, three = 눈으로 확인 셋 (키 큰 짐 + 밀릴 수 있음) + 정보 글 펼침
    await fresh()
    await load(scene === 'detail' ? { kind: 'box', massKg: 300, belts: 3, beltType: 'ratchet', frontWall: false } : { kind: 'appliance', massKg: 300, belts: 2, beltType: 'ratchet', frontWall: false })
    await S(2000)
    if (scene === 'detail') await J(() => window.__nav.nav.set({ detail: true }))
    await S(800)
    await shoot(scene)
  } else if (scene === 'green') {
    await fresh()
    await load({ kind: 'furniture', massKg: 300, belts: 3, beltType: 'ratchet', frontWall: true })
    await S(2500)
    await shoot('green')
  } else if (scene === 'tip') {
    await fresh()
    await load({ kind: 'appliance', massKg: 300, belts: 4, beltType: 'ratchet', frontWall: false })
    await S(2500)
    await shoot('tip')
  } else if (scene === 'many') {
    await fresh()
    await load({ kind: 'pallet', massKg: 700, belts: 6, beltType: 'ratchet', frontWall: true })
    await S(2500)
    await shoot('many')
  } else if (scene === 'rubber') {
    await fresh()
    await load({ kind: 'material', massKg: 500, belts: 2, beltType: 'rubber', frontWall: false })
    await S(2500)
    await shoot('rubber')
  } else if (scene === 'top' || scene === 'kitview') {
    await fresh()
    await load({ kind: 'box', massKg: 300, belts: 3, beltType: 'ratchet', frontWall: false })
    await S(2000)
    await J((v) => window.__nav.nav.set({ view: v }), scene === 'top' ? 'top' : 'kit')
    await S(1500)
    await shoot(scene)
  } else if (scene === 'sheet') {
    await fresh()
    await S(1200)
    await shoot('sheet')
  } else if (scene === 'relash-kitless') {
    await fresh()
    await load({ kind: 'appliance', massKg: 300, belts: 2, beltType: 'ratchet', frontWall: false })
    await J(() => window.__jj.playScenario('kitless-brake'))
    await waitFor((s) => s.alert === 'check', 90, 'check')
    const ls = await waitFor((s) => s.listening, 30, 'listen')
    if (ls?.listening) await J(() => window.__jj.answerYes())
    await S(800)
    await arrive()
    await shoot('relash_kitless')
  } else if (scene === 'drive') {
    await fresh()
    await load({ kind: 'appliance', massKg: 300, belts: 2, beltType: 'ratchet', frontWall: false })
    await J(() => window.__jj.playScenario('kitless-brake'))
    await waitFor((s) => s.mode === 'drive' && s.kmh > 30, 30, 'drive')
    await shoot('drive_orange')
    await waitFor((s) => s.alert === 'check', 90, 'check')
    await S(300)
    await shoot('drive_red')
  }
}
console.log(errors.length ? 'errors:\n' + [...new Set(errors)].join('\n') : 'no console errors')
await browser.close()
