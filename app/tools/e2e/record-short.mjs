// 숏폼(세로 1080x1920)용 실제 앱 화면 녹화. 화면 없는 Chrome(GPU) + CDP screencast, 프레임마다 시각을 남긴다.
//   node record-short.mjs [base] [phone,drive]   ->  shots/short/<seg>/f*.jpg + frames.json (frames, marks, pointer, rects)
// seg: phone = 휴대폰 3D 확인 (손가락으로 돌리기), drive = 차 화면 주행 -> 짐 밀림 -> 듣는 중 -> 경유지, relash = 정차 뒤 다시 묶기 (drive 에 이어서)
import puppeteer from 'puppeteer-core'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'

const BASE = process.argv[2] ?? 'http://127.0.0.1:4173/'
const ONLY = (process.argv[3] ?? 'phone,drive').split(',')
const S = (ms) => new Promise((r) => setTimeout(r, ms))
const now = () => Date.now() / 1000
const ease = (k) => (k < 0.5 ? 2 * k * k : 1 - 2 * (1 - k) * (1 - k))

// screencast 는 흉내 낸 배율(setViewport 의 deviceScaleFactor)을 무시하고 CSS px 로 찍는다. 그래서 Chrome 자체 배율(--force-device-scale-factor)로 띄운다.
let browser, page
const errors = []
async function launch(w, h, dsf) {
  if (browser) await browser.close()
  browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true,
    args: ['--mute-audio', '--no-first-run', '--disable-extensions', '--enable-gpu', '--use-angle=d3d11', '--ignore-gpu-blocklist', `--force-device-scale-factor=${dsf}`, `--window-size=${w + 200},${h + 300}`, '--hide-scrollbars'],
    userDataDir: 'C:/Users/DANHA/AppData/Local/Temp/jaejeok-short-chrome',
    defaultViewport: null,
  })
  page = (await browser.pages())[0] ?? (await browser.newPage())
  page.on('pageerror', (e) => errors.push(e.message))
  await page.setViewport({ width: w, height: h, deviceScaleFactor: dsf })
  console.log('window', JSON.stringify(await page.evaluate(() => [innerWidth, innerHeight, devicePixelRatio])))
}
const J = (fn, ...a) => page.evaluate(fn, ...a)
const st = () => J(() => { const s = window.__jj.app.get(); return { screen: s.screen, mode: s.out?.mode, title: s.out?.status?.title, todo: s.out?.status?.line, kmh: Math.round(s.sim.speedKmh), listening: s.speech.listening, alert: s.out?.alert?.kind ?? null, waypoint: s.waypoint?.name ?? null, line: s.speech.line } })
const until = async (pred, sec, label) => { const t0 = Date.now(); while (Date.now() - t0 < sec * 1000) { const s = await st(); if (pred(s)) return s; await S(100) } console.log('timeout', label, JSON.stringify(await st())); return st() }

function recorder(seg, w, h) {
  const OUT = `shots/short/${seg}`
  rmSync(OUT, { recursive: true, force: true })
  mkdirSync(OUT, { recursive: true })
  const rec = { frames: [], marks: [], pointer: [], rects: {}, size: [w, h] }
  let cdp, n = 0
  return {
    rec,
    async start() {
      cdp = await page.createCDPSession()
      cdp.on('Page.screencastFrame', (f) => {
        const name = `f${String(n++).padStart(5, '0')}.jpg`
        writeFileSync(`${OUT}/${name}`, Buffer.from(f.data, 'base64'))
        rec.frames.push({ name, t: f.metadata.timestamp })
        cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {})
      })
      await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 95, maxWidth: w, maxHeight: h, everyNthFrame: 1 })
    },
    async mark(what) { const s = await st(); rec.marks.push({ what, t: now(), ...s }); console.log(seg, what, JSON.stringify(s)) },
    /** 손가락으로 끄는 동작 (CSS px). 실제 시간 dur 초 */
    async drag(x0, y0, x1, y1, dur, tag = 'drag') {
      await page.mouse.move(x0, y0)
      rec.pointer.push({ t: now(), x: x0, y: y0, down: true, tag })
      await page.mouse.down()
      const t0 = Date.now()
      for (;;) {
        const k = Math.min(1, (Date.now() - t0) / (dur * 1000))
        const e = ease(k)
        const x = x0 + (x1 - x0) * e, y = y0 + (y1 - y0) * e + Math.sin(k * Math.PI) * 6
        await page.mouse.move(x, y)
        rec.pointer.push({ t: now(), x, y, down: true, tag })
        if (k >= 1) break
        await S(12)
      }
      await page.mouse.up()
      rec.pointer.push({ t: now(), x: x1, y: y1, down: false, tag })
    },
    async tap(x, y, tag = 'tap') {
      await page.mouse.move(x, y)
      rec.pointer.push({ t: now(), x, y, down: true, tag })
      await page.mouse.down(); await S(70); await page.mouse.up()
      rec.pointer.push({ t: now(), x, y, down: false, tag })
    },
    async stop() {
      await cdp.send('Page.stopScreencast')
      await S(300)
      await cdp.detach()
      writeFileSync(`${OUT}/frames.json`, JSON.stringify(rec))
      const span = rec.frames.length ? rec.frames.at(-1).t - rec.frames[0].t : 0
      console.log(seg, 'FRAMES', rec.frames.length, 'span', span.toFixed(1), 's')
    },
  }
}
const rect = (sel, nth = 0) => J((sel, nth) => { const e = document.querySelectorAll(sel)[nth]; if (!e) return null; const r = e.getBoundingClientRect(); return [r.x, r.y, r.width, r.height] }, sel, nth)

// ── 휴대폰: 출발 전 3D 확인 (432 x 768 CSS px, 배율 2.5 = 1080 x 1920) ──
if (ONLY.includes('phone')) {
  await launch(432, 768, 2.5)
  await page.goto(BASE + '?app=phone&fresh&device', { waitUntil: 'networkidle0' })
  await page.waitForFunction(() => !!window.__jj && !!window.__jjPhone)
  await J(() => window.__jj.app.set({ settings: { ...window.__jj.app.get().settings, voice: false } }))
  await J(() => window.__jj.confirmLoad({ kind: 'box', massKg: 300, belts: 3, beltType: 'ratchet', frontWall: false }, { newWaybill: true }))
  await S(3000)
  const R = recorder('phone', 1080, 1920)
  R.rec.rects.canvas = await rect('canvas')
  const [cx, cy, cw, ch] = R.rec.rects.canvas
  await R.start()
  await R.mark('start')
  await S(900)
  await R.drag(cx + cw * 0.6, cy + ch * 0.62, cx + cw * 0.47, cy + ch * 0.6, 2.6, 'orbit1')
  await R.mark('orbit1 done')
  await S(2300)
  await J(() => window.__jj.confirmLoad({ kind: 'box', massKg: 300, belts: 4, beltType: 'ratchet', frontWall: false }))
  await R.mark('belts 4')
  await S(1300)
  await R.drag(cx + cw * 0.45, cy + ch * 0.6, cx + cw * 0.56, cy + ch * 0.58, 2.0, 'orbit2')
  await R.mark('orbit2 done')
  await S(2000)
  await R.mark('end')
  await R.stop()
}

// ── 차 화면 (Pleos Connect 앱 하나 1224 x 880 CSS px, 배율 2), 밤 ──
if (ONLY.includes('drive')) {
  await launch(1224, 880, 2)
  await page.goto(BASE + '?app=nav&fresh&demo=1', { waitUntil: 'networkidle0' })
  await page.waitForFunction(() => !!window.__jj && !!window.__nav)
  await J(() => window.__jj.app.set({ settings: { ...window.__jj.app.get().settings, voice: false } }))
  await J(() => window.__nav.setTheme('night'))
  await S(1200)
  const R = recorder('drive', 2448, 1760)
  await J(() => window.__jj.playScenario('kit-slide'))
  await until((s) => s.mode === 'drive' && s.kmh > 35, 40, 'drive')
  await R.start()
  await R.mark('driving')
  await until((s) => !!s.alert, 70, 'alert')
  await R.mark('alert')
  await until((s) => s.listening, 30, 'listen')
  await R.mark('listening')
  await S(2600)
  await J(() => window.__jj.answerYes())
  await R.mark('yes')
  await until((s) => !!s.waypoint, 20, 'waypoint')
  await R.mark('waypoint')
  await S(5000)
  await R.mark('end')
  await R.stop()

  // 정차 -> 다시 묶기
  await until((s) => s.kmh === 0 || s.mode === 'park', 60, 'stopped')
  const Q = recorder('relash', 2448, 1760)
  await Q.start()
  await Q.mark('before arrive')
  await S(600)
  await J(() => window.__jj.playScenario('arrive'))
  await until((s) => s.screen === 'relash' && s.mode === 'park', 40, 'relash')
  await Q.mark('relash')
  await S(2600)
  Q.rec.rects.canvas = await rect('canvas')
  Q.rec.rects.checks = [await rect('.ui-check', 0), await rect('.ui-check', 1), await rect('.ui-check', 2)]
  console.log(JSON.stringify(Q.rec.rects))
  const [cx, cy, cw, ch] = Q.rec.rects.canvas
  await Q.drag(cx + cw * 0.62, cy + ch * 0.62, cx + cw * 0.4, cy + ch * 0.58, 2.6, 'orbit')
  await Q.mark('orbit done')
  await S(1500)
  const c = Q.rec.rects.checks
  if (c[0]) { await Q.tap(c[0][0] + c[0][2] / 2, c[0][1] + c[0][3] / 2, 'check1'); await Q.mark('check1') }
  await S(1700)
  if (c[1]) { await Q.tap(c[1][0] + c[1][2] / 2, c[1][1] + c[1][3] / 2, 'check2'); await Q.mark('check2') }
  await S(2500)
  await Q.mark('end')
  await Q.stop()
}
console.log('errors', errors.length, errors.slice(0, 3).join(' | '))
await browser.close()
