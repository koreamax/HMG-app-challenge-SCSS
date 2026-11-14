// v2 겉면 크기 검사 (화면 없는 Chrome): 실제 창에서 글자 · 터치 최소 크기를 잰다.
//   내비 1224 x 880 · 611 x 880 (CSS px): 글자 18 이상, 누를 것 56 이상.  폰 390 x 844: 글자 12 이상, 누를 것 48 이상.
// node v2-sizes.mjs [base]
import puppeteer from 'puppeteer-core'
const BASE = process.argv[2] ?? 'http://127.0.0.1:5175/'
const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--mute-audio', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  userDataDir: 'C:/Users/DANHA/AppData/Local/Temp/jaejeok-v2-sizes-chrome',
})
const page = await browser.newPage()
const S = (ms) => new Promise((r) => setTimeout(r, ms))
const J = (fn, ...a) => page.evaluate(fn, ...a)
const measure = (minText, minTouch) =>
  J(
    (minText, minTouch) => {
      const root = document.querySelector('.jj.nav, .jj.ph-root')
      const scale = root.getBoundingClientRect().width / root.offsetWidth
      const vis = (el) => {
        const r = el.getBoundingClientRect()
        if (r.width <= 0 || r.height <= 0) return false
        const cs = getComputedStyle(el)
        return cs.visibility !== 'hidden' && cs.display !== 'none' && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth
      }
      const bad = []
      let texts = 0
      let touches = 0
      for (const el of root.querySelectorAll('*')) {
        if (el.closest('.bv') || el.closest('svg') || !vis(el)) continue
        const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())
        if (own) {
          texts++
          const fs = parseFloat(getComputedStyle(el).fontSize) * scale
          if (fs < minText - 0.05) bad.push('text ' + fs.toFixed(1) + ' "' + el.textContent.trim().slice(0, 24) + '" .' + el.className)
        }
        if (el.matches('button, a[href], [role=checkbox], [role=switch], [role=radio], [role=tab], input')) {
          if (el.matches('[aria-readonly]') || (el.tagName === 'DIV' && !el.onclick && el.getAttribute('role') === 'checkbox')) continue
          touches++
          const r = el.getBoundingClientRect()
          if (Math.min(r.width, r.height) < minTouch - 0.5) bad.push('touch ' + r.width.toFixed(0) + 'x' + r.height.toFixed(0) + ' "' + (el.textContent.trim() || el.getAttribute('aria-label') || '').slice(0, 24) + '" .' + el.className)
        }
      }
      return { scale: +scale.toFixed(3), texts, touches, bad: [...new Set(bad)] }
    },
    minText,
    minTouch,
  )
const report = (name, r) => console.log((r.bad.length ? 'FAIL ' : 'ok   ') + name + ' (scale ' + r.scale + ', 글자 ' + r.texts + ', 누를 것 ' + r.touches + ')' + (r.bad.length ? '\n  ' + r.bad.join('\n  ') : ''))

// ── 내비 ──
for (const [w, h] of [[1224, 880], [611, 880]]) {
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 })
  await page.goto(BASE + '?app=nav&fresh&demo=1', { waitUntil: 'networkidle0' })
  await page.waitForFunction(() => !!window.__jj && !!window.__nav)
  await J(() => window.__jj.app.set({ settings: { ...window.__jj.app.get().settings, voice: false } }))
  await S(800)
  for (const theme of ['day', 'night']) {
    await J((t) => window.__nav.setTheme(t), theme)
    await J(() => window.__nav.nav.set({ sheet: 'load', records: false }))
    await S(400)
    report(`nav ${w} ${theme} load sheet`, await measure(18, 56))
    await J(() => window.__jj.confirmLoad({ kind: 'appliance', massKg: 300, belts: 2, beltType: 'ratchet', frontWall: false }))
    await J(() => window.__nav.nav.set({ sheet: null, detail: true }))
    await S(900)
    report(`nav ${w} ${theme} park + detail`, await measure(18, 56))
    await J(() => window.__nav.nav.set({ detail: false, sheet: 'settings' }))
    await S(400)
    report(`nav ${w} ${theme} settings`, await measure(18, 56))
    await J(() => window.__nav.nav.set({ sheet: null, records: true }))
    await S(400)
    report(`nav ${w} ${theme} records`, await measure(18, 56))
    await J(() => window.__nav.nav.set({ records: false }))
  }
  // 주행 -> 사건 -> 다시 묶기 (키트 없음)
  await J(() => window.__jj.playScenario('kitless-brake'))
  for (let i = 0; i < 240; i++) {
    await S(250)
    if (await J(() => window.__jj.app.get().out?.alert?.kind === 'check')) break
  }
  report(`nav ${w} drive red`, await measure(18, 56))
  await J(() => window.__jj.playScenario('arrive'))
  for (let i = 0; i < 160; i++) {
    await S(250)
    if (await J(() => window.__jj.app.get().out?.mode === 'park')) break
  }
  await S(1200)
  report(`nav ${w} relash`, await measure(18, 56))
}

// ── 폰 ──
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 })
await page.goto(BASE + '?app=phone&fresh&device', { waitUntil: 'networkidle0' })
await page.waitForFunction(() => !!window.__jj && !!window.__jjPhone)
await S(800)
report('phone load input', await measure(12, 48))
await J(() => window.__jj.confirmLoad({ kind: 'box', massKg: 300, belts: 2, beltType: 'ratchet', frontWall: false }))
await S(1500)
report('phone check 3D', await measure(12, 48))
await J(() => window.__jjPhone.openSheet({ kind: 'limit' }))
await S(400)
report('phone limit sheet', await measure(12, 48))
await J(() => window.__jjPhone.closeSheet())
await J(() => window.__jjPhone.switchTab('records'))
await S(400)
report('phone records', await measure(12, 48))
await J(() => document.querySelector('.ph-list button.ph-row')?.click())
await S(600)
report('phone waybill', await measure(12, 48))
await J(() => window.__jjPhone.openSheet({ kind: 'export', id: window.__jj.app.get().waybill.id }))
await S(400)
report('phone export sheet', await measure(12, 48))
await J(() => window.__jjPhone.closeSheet())
await J(() => window.__jjPhone.switchTab('settings'))
await S(400)
report('phone settings', await measure(12, 48))
await J(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '운영자')?.click())
await S(300)
await J(() => window.__jjPhone.switchTab('hub'))
await S(600)
report('phone hub', await measure(12, 48))
await J(() => document.querySelector('.ph-truck')?.click())
await S(1500)
report('phone truck', await measure(12, 48))
await browser.close()
