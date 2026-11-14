import puppeteer from 'puppeteer-core'
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, userDataDir: 'C:/Users/DANHA/AppData/Local/Temp/jaejeok-e2e-chrome', args: ['--no-first-run', '--disable-extensions'], defaultViewport: { width: 1800, height: 810 } })
const page = await browser.newPage()
await page.goto('http://127.0.0.1:5190/?fresh=1', { waitUntil: 'networkidle0' })
await page.waitForFunction(() => !!window.__jj)
const S = (ms) => new Promise((r) => setTimeout(r, ms))
const row = () => page.evaluate(() => { const j = window.__jj; const s = j.app.get(); return [Math.round(performance.now() / 100) / 10, s.scenario, j.sim.s.gear, j.sim.s.speedKmh.toFixed(1), j.sim.s.targetKmh, j.sim.s.replayKmh, j.sim.busy, s.out?.mode, s.screen].join('|') })
await page.evaluate(() => window.__jj.playScenario('kit-slide40'))
for (let i = 0; i < 22; i++) { await S(1000); if (i > 15) console.log(await row()) }
await page.evaluate(() => window.__jj.playScenario('arrive'))
for (let i = 0; i < 8; i++) { await S(1000); console.log('A', await row()) }
await browser.close()
