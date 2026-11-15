// 시연 영상 v2 (가로 1920x1080) 용 실제 앱 녹화. 화면 없는 Chrome(GPU) + CDP screencast, 프레임마다 시각 · 표시 · 손가락 자리를 남긴다.
//   node record-demo2.mjs [base] [nav,phone]   ->  shots/demo2/<seg>/f*.jpg + frames.json
// 차 화면: 1920 x 1080 (배율 1), 밤. 상차 시트 -> 짐 종류 바꾸기 -> 밀릴 수 있음 -> 벨트 바꾸기 -> 기준 충족 -> 차량 신호(키트 없음) 급제동
//          -> 확인 필요 -> 듣는 중 -> 네 -> 경유지 -> 졸음쉼터 도착 -> 다시 묶기 순서
// 휴대폰: 432 x 768 CSS px, 배율 2.5 (= 1080 x 1920). 3D 확인 (손가락으로 돌리기) -> 사건 기록 -> Level 4 허브
// 센서 키트는 제품에서 빠졌다: 앱에 남은 '센서 키트' 보기 단추 · '키트' 글은 녹화에서만 감춘다 (앱 소스는 그대로).
import puppeteer from 'puppeteer-core'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'

const BASE = process.argv[2] ?? 'http://127.0.0.1:4173/'
const ONLY = (process.argv[3] ?? 'nav,phone').split(',')
const S = (ms) => new Promise((r) => setTimeout(r, ms))
const now = () => Date.now() / 1000
const ease = (k) => (k < 0.5 ? 2 * k * k : 1 - 2 * (1 - k) * (1 - k))

let browser, page
const errors = []
async function launch(w, h, dsf) {
  if (browser) await browser.close()
  browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true,
    args: ['--mute-audio', '--no-first-run', '--disable-extensions', '--enable-gpu', '--use-angle=d3d11', '--ignore-gpu-blocklist', `--force-device-scale-factor=${dsf}`, `--window-size=${w + 200},${h + 300}`, '--hide-scrollbars'],
    userDataDir: 'C:/Users/DANHA/AppData/Local/Temp/jaejeok-demo2-chrome',
    defaultViewport: null,
  })
  page = (await browser.pages())[0] ?? (await browser.newPage())
  await page.setCacheEnabled(false)
  page.on('pageerror', (e) => errors.push(e.message))
  await page.setViewport({ width: w, height: h, deviceScaleFactor: dsf })
  // 키트 흔적 감추기: '센서 키트' 단추 · 선택지는 없애고, '키트 없음' 같은 글은 자리만 남기고 숨긴다
  await page.evaluateOnNewDocument(() => {
    const hide = () => {
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
      for (let n = w.nextNode(); n; n = w.nextNode()) {
        if (!/키트/.test(n.nodeValue)) continue
        const el = n.parentElement
        if (!el || el.closest('[data-kit-hidden]')) continue
        const btn = el.closest('button, [role=radio], [role=tab], [role=option]')
        const tgt = btn && /키트/.test(btn.textContent) && btn.textContent.trim().length < 12 ? btn : el
        tgt.setAttribute('data-kit-hidden', '1')
        tgt.style.setProperty(tgt === btn ? 'display' : 'visibility', tgt === btn ? 'none' : 'hidden', 'important')
      }
      for (const el of document.querySelectorAll('[aria-label*="키트"]:not([data-kit-hidden])')) {
        if (el.matches('button, [role=radio], [role=tab]')) {
          el.setAttribute('data-kit-hidden', '1')
          el.style.setProperty('display', 'none', 'important')
        }
      }
    }
    let q = false
    const run = () => { if (!q) { q = true; requestAnimationFrame(() => { q = false; try { hide() } catch {} }) } }
    document.addEventListener('DOMContentLoaded', () => { hide(); new MutationObserver(run).observe(document.body, { childList: true, subtree: true, characterData: true }) })
  })
  console.log('window', JSON.stringify(await page.evaluate(() => [innerWidth, innerHeight, devicePixelRatio])))
}
const J = (fn, ...a) => page.evaluate(fn, ...a)
const st = () => J(() => { const s = window.__jj.app.get(); return { screen: s.screen, mode: s.out?.mode, title: s.out?.status?.title, kmh: Math.round(s.sim.speedKmh), listening: s.speech.listening, alert: s.out?.alert?.kind ?? null, waypoint: s.waypoint?.name ?? null, line: s.speech.line } })
const until = async (pred, sec, label) => { const t0 = Date.now(); while (Date.now() - t0 < sec * 1000) { const s = await st(); if (pred(s)) return s; await S(100) } console.log('timeout', label, JSON.stringify(await st())); return st() }
const kitText = () => J(() => { const t = []; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); for (let n = w.nextNode(); n; n = w.nextNode()) { if (/키트/.test(n.nodeValue) && n.parentElement && n.parentElement.closest('[data-kit-hidden]') === null && n.parentElement.getClientRects().length) t.push(n.nodeValue.trim()) } return t.join(' | ') || '-' })

function recorder(seg, w, h) {
  const OUT = `shots/demo2/${seg}`
  rmSync(OUT, { recursive: true, force: true })
  mkdirSync(OUT, { recursive: true })
  const rec = { frames: [], marks: [], pointer: [], size: [w, h] }
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
      await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 93, maxWidth: w, maxHeight: h, everyNthFrame: 1 })
    },
    async mark(what) { const s = await st(); rec.marks.push({ what, t: now(), ...s }); console.log(seg, what, JSON.stringify(s), 'kit:', await kitText()) },
    async drag(x0, y0, x1, y1, dur, tag = 'drag') {
      await page.mouse.move(x0, y0)
      rec.pointer.push({ t: now(), x: x0, y: y0, down: true, tag })
      await page.mouse.down()
      const t0 = Date.now()
      for (;;) {
        const k = Math.min(1, (Date.now() - t0) / (dur * 1000))
        const e = ease(k)
        const x = x0 + (x1 - x0) * e, y = y0 + (y1 - y0) * e + Math.sin(k * Math.PI) * 5
        await page.mouse.move(x, y)
        rec.pointer.push({ t: now(), x, y, down: true, tag })
        if (k >= 1) break
        await S(12)
      }
      await page.mouse.up()
      rec.pointer.push({ t: now(), x: x1, y: y1, down: false, tag })
    },
    /** 글로 찾은 단추를 실제 마우스로 누른다 (가장 짧은 글 = 가장 안쪽) */
    async tap(text, sel = 'button, [role=checkbox], [role=radio]', tag = text) {
      const r = await J((text, sel) => {
        const els = [...document.querySelectorAll(sel)].filter((e) => ((e.textContent ?? '').includes(text) || e.getAttribute('aria-label') === text) && e.getClientRects().length)
        const pick = els.sort((a, b) => (a.textContent ?? '').length - (b.textContent ?? '').length)[0]
        if (!pick) return null
        pick.scrollIntoView({ block: 'nearest' })
        const b = pick.getBoundingClientRect()
        return [b.x + b.width / 2, b.y + b.height / 2]
      }, text, sel)
      if (!r) { console.log('  !! no button', text); return false }
      await page.mouse.move(r[0], r[1])
      rec.pointer.push({ t: now(), x: r[0], y: r[1], down: true, tag })
      await S(90)
      await page.mouse.down(); await S(80); await page.mouse.up()
      await S(90)
      rec.pointer.push({ t: now(), x: r[0], y: r[1], down: false, tag })
      return true
    },
    /** 휠로 천천히 내린다 (손가락 자리도 남긴다) */
    async wheel(x, y, dy, dur, tag = 'wheel') {
      await page.mouse.move(x, y)
      const n = Math.max(1, Math.round(dur * 30))
      for (let i = 0; i < n; i++) {
        rec.pointer.push({ t: now(), x, y: y - (dy * i) / n * 0.0, down: true, tag })
        await page.mouse.wheel({ deltaY: dy / n })
        await S(dur * 1000 / n)
      }
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
const rect = (sel, nth = 0) => J((sel, nth) => { const e = [...document.querySelectorAll(sel)].filter((e) => e.getClientRects().length)[nth]; if (!e) return null; const r = e.getBoundingClientRect(); return [r.x, r.y, r.width, r.height] }, sel, nth)

// ── 차 화면 ──
if (ONLY.includes('nav')) {
  await launch(1920, 1080, 1)
  await page.goto(BASE + '?app=nav&fresh&demo=1', { waitUntil: 'networkidle0' })
  await page.waitForFunction(() => !!window.__jj && !!window.__nav)
  await J(() => window.__jj.app.set({ settings: { ...window.__jj.app.get().settings, voice: false } }))
  await J(() => window.__nav.setTheme('night'))
  await S(2000)

  // 1. 출발 전: 상차 시트 -> 3D -> 짐 종류 -> 벨트 -> 기준 충족
  const A = recorder('load', 1920, 1080)
  await A.start()
  await A.mark('sheet')
  await S(1500)
  const kinds = ['팔레트', '가전', '박스']
  for (let i = 0; i < kinds.length; i++) {
    if (i > 0) {
      await A.tap('짐 종류바꾸기', 'button', 'card')          // 화면 아래 '짐 종류' 카드 -> 상차 시트
      await S(900)
    }
    await A.tap(kinds[i], '.nv-sheet .nv-kinds button', 'kind ' + kinds[i])
    await S(900)
    await A.tap('확인하고 3D로 보기', '.nv-sheet button', 'confirm ' + kinds[i])
    await A.mark('kind ' + kinds[i])
    await S(i < kinds.length - 1 ? 2600 : 3200)
  }
  const c = await rect('canvas')
  A.rec.canvas = c
  await A.drag(c[0] + c[2] * 0.62, c[1] + c[3] * 0.55, c[0] + c[2] * 0.47, c[1] + c[3] * 0.53, 2.2, 'orbit')
  await A.mark('orbit')
  await S(2600)
  await A.tap('벨트 바꾸기', 'button', 'belt change')
  await A.mark('sheet belts')
  await S(1100)
  for (let i = 0; i < 2; i++) {
    await A.tap('벨트 늘리기', '.nv-belts button', 'plus' + i)
    await S(750)
  }
  await A.mark('belts +2')
  await S(1000)
  await A.tap('확인하고 3D로 보기', '.nv-sheet button', 'confirm belts')
  await A.mark('green')
  await S(4500)
  await A.mark('end')
  await A.stop()

  // 2. 주행: 차량 신호로 판단 (키트 없음) 급제동 -> 확인 필요 -> 듣는 중 -> 네 -> 경유지
  await J(() => window.__jj.playScenario('kitless-brake'))
  await until((s) => s.mode === 'drive' && s.kmh > 25, 40, 'drive')
  const B = recorder('drive', 1920, 1080)
  await B.start()
  await B.mark('driving')
  await until((s) => !!s.alert, 120, 'alert')
  await B.mark('alert')
  await until((s) => s.listening, 40, 'listen')
  await B.mark('listening')
  await S(2400)
  await J(() => window.__jj.answerYes())
  await B.mark('yes')
  await until((s) => !!s.waypoint, 20, 'waypoint')
  await B.mark('waypoint')
  await S(4500)
  await B.mark('end')
  await B.stop()

  // 3. 졸음쉼터 도착 -> 다시 묶기
  const C = recorder('relash', 1920, 1080)
  await C.start()
  await C.mark('before arrive')
  await S(500)
  await J(() => window.__jj.playScenario('arrive'))
  await until((s) => s.screen === 'relash' && s.mode === 'park', 40, 'relash')
  await C.mark('relash')
  await S(3000)
  const cc = await rect('canvas')
  C.rec.canvas = cc
  await C.drag(cc[0] + cc[2] * 0.6, cc[1] + cc[3] * 0.58, cc[0] + cc[2] * 0.42, cc[1] + cc[3] * 0.55, 2.6, 'orbit')
  await C.mark('orbit')
  await S(1200)
  await C.tap('바를 손으로 당겨 보기', '[role=checkbox], button, label')
  await C.mark('check1')
  await S(1600)
  await C.tap('짐이 밀렸는지 보기', '[role=checkbox], button, label')
  await C.mark('check2')
  await S(1500)
  await C.tap('밀림 있음')
  await C.mark('moved yes')
  await S(1800)
  await C.tap('다시 조였어요')
  await C.mark('done')
  await S(3500)
  await C.mark('end')
  await C.stop()
}

// ── 휴대폰 ──
if (ONLY.includes('phone')) {
  await launch(432, 768, 2.5)
  await page.goto(BASE + '?app=phone&fresh&device', { waitUntil: 'networkidle0' })
  await page.waitForFunction(() => !!window.__jj && !!window.__jjPhone)
  await J(() => window.__jj.app.set({ settings: { ...window.__jj.app.get().settings, voice: false } }))
  await J(() => window.__jj.confirmLoad({ kind: 'box', massKg: 300, belts: 2, beltType: 'ratchet', frontWall: false }, { newWaybill: true }))
  await S(3000)
  const P = recorder('phone3d', 1080, 1920)
  const c = await rect('canvas')
  P.rec.canvas = c
  await P.start()
  await P.mark('start')
  await S(1200)
  await P.drag(c[0] + c[2] * 0.6, c[1] + c[3] * 0.62, c[0] + c[2] * 0.42, c[1] + c[3] * 0.6, 2.4, 'orbit1')
  await P.mark('orbit1')
  await S(1500)
  await J(() => window.__jj.confirmLoad({ kind: 'box', massKg: 300, belts: 4, beltType: 'ratchet', frontWall: false }))
  await P.mark('belts 4')
  await S(1200)
  await P.drag(c[0] + c[2] * 0.42, c[1] + c[3] * 0.6, c[0] + c[2] * 0.56, c[1] + c[3] * 0.58, 2.0, 'orbit2')
  await P.mark('orbit2')
  await S(2000)
  await P.mark('end')
  await P.stop()

  // 사건: 차량 신호 급제동 -> 쉼터 도착 -> 기록 탭 -> 사건 카드
  await J(() => window.__jj.confirmLoad({ kind: 'box', massKg: 300, belts: 2, beltType: 'ratchet', frontWall: false }))
  await J(() => window.__jj.playScenario('kitless-brake'))
  await until((s) => !!s.alert, 120, 'phone alert')
  await S(1500)
  await J(() => window.__jj.playScenario('arrive'))
  await until((s) => s.mode === 'park', 40, 'phone park')
  await S(1500)
  await J(() => window.__jjPhone.switchTab('records'))
  await S(1200)
  const E = recorder('phoneevent', 1080, 1920)
  await E.start()
  await E.mark('records')
  await S(1800)
  await E.tap('확인 필요', '.ph-ecard, button')
  await E.mark('event')
  await S(2200)
  await E.wheel(216, 520, 420, 1.6, 'scroll')
  await E.mark('scrolled')
  await S(2200)
  await E.mark('end')
  await E.stop()

  // Level 4 허브: 설정 -> 운영자 -> 허브
  await J(() => window.__jjPhone.switchTab('settings'))
  await S(600)
  await E.tap('운영자')
  await S(600)
  await J(() => window.__jjPhone.switchTab('hub'))
  await S(1500)
  const Hb = recorder('phonehub', 1080, 1920)
  await Hb.start()
  await Hb.mark('hub')
  await S(2000)
  await Hb.tap('98사 1234', '.ph-truck, button', 'truck')
  await Hb.mark('truck')
  await S(2200)
  await Hb.wheel(216, 520, 520, 2.0, 'scroll')
  await Hb.mark('scrolled')
  await S(2000)
  await Hb.mark('end')
  await Hb.stop()
}
console.log('errors', errors.length, errors.slice(0, 3).join(' | '))
await browser.close()
