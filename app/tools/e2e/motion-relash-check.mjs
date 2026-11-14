import puppeteer from 'puppeteer-core'
const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, userDataDir: 'C:/Users/DANHA/AppData/Local/Temp/jaejeok-v3-dbg', args: ['--no-first-run', '--mute-audio', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const p = await b.newPage()
p.on('pageerror', (e) => console.log('err', e.message))
await p.setViewport({ width: 1224, height: 880 })
await p.goto('http://127.0.0.1:5175/?app=nav&fresh&demo=1', { waitUntil: 'networkidle0' })
const S = (ms) => new Promise((r) => setTimeout(r, ms))
const J = (f, ...a) => p.evaluate(f, ...a)
await J(() => window.__jj.app.set({ settings: { ...window.__jj.app.get().settings, voice: false } }))
await J(() => window.__jj.playScenario('kit-slide'))
for (let i = 0; i < 300; i++) {
  await S(250)
  const s = await J(() => ({ l: window.__jj.app.get().speech.listening, w: !!window.__jj.app.get().waypoint }))
  if (s.l) await J(() => window.__jj.answerYes())
  if (s.w) break
}
for (let i = 0; i < 200; i++) { await S(250); if ((await J(() => Math.round(window.__jj.app.get().sim.speedKmh))) === 0) break }
await J(() => window.__jj.playScenario('arrive'))
for (let i = 0; i < 200; i++) { await S(100); if ((await J(() => window.__jj.app.get().screen)) === 'relash' && (await J(() => window.__jj.app.get().out?.mode)) === 'park') break }
const info = () => J(() => { const w = document.querySelector('.nv-screen'); return { key: w?.querySelector('.nv-park') ? 'park-frame' : w?.firstElementChild?.className, op: w && getComputedStyle(w).opacity, anim: w && getComputedStyle(w).animationName, mode: document.querySelector('.jj')?.getAttribute('data-mode'), screen: window.__jj.app.get().screen } })
for (const t of [0, 200, 500, 1000, 2000]) { await S(t ? t - (t > 200 ? (t === 500 ? 200 : t === 1000 ? 500 : 1000) : 0) : 0); console.log(t, JSON.stringify(await info())); await p.screenshot({ path: `shots/v3/motion/dbg_relash_${t}.png` }) }
await J(() => { window.__log = []; const t0 = performance.now(); new MutationObserver((ms) => { for (const m of ms) { for (const n of m.removedNodes) if (n.nodeType === 1 && (n.matches?.('.ui-done-layer') || n.querySelector?.('.ui-done-layer'))) window.__log.push('removed ' + Math.round(performance.now() - t0) + ' ' + (n.className || '').toString().slice(0, 40)); for (const n of m.addedNodes) if (n.nodeType === 1 && (n.matches?.('.ui-done-layer') || n.querySelector?.('.ui-done-layer'))) window.__log.push('added ' + Math.round(performance.now() - t0)) } }).observe(document.body, { childList: true, subtree: true }) }); await J(() => document.querySelector('.ui-check')?.click())
await S(300)
const btn = await p.$('.nv-action button')
await btn.click()
for (const t of [100, 400, 900, 1700, 2100]) { await S(t === 100 ? 100 : 300 + (t > 900 ? 500 : 200)); console.log('done', t, await J(() => !!document.querySelector('.ui-done-layer'))); await p.screenshot({ path: `shots/v3/motion/dbg_done_${t}.png` }) }
console.log(await J(() => window.__log.join(" | ")), await J(() => document.querySelector(".jj")?.getAttribute("data-mode")))
await b.close()
