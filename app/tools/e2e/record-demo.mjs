// 시연 무대(?app=stage)를 실제 속도로 녹화한다: 상차 입력 -> 3D 확인 -> Isaac Sim 급제동 기록 재생 -> "네" -> 쉼터 -> P 에서 다시 묶기 -> 기록.
//   node record-demo.mjs [base]   ->  shots/video/stage/*.jpg + frames.json (타임스탬프)
import puppeteer from 'puppeteer-core'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'

const BASE = process.argv[2] ?? 'http://127.0.0.1:5175/'
const OUT = 'shots/video/stage'
rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })
const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--mute-audio', '--no-first-run', '--disable-extensions', '--enable-gpu', '--use-angle=d3d11', '--ignore-gpu-blocklist', '--force-device-scale-factor=1'],
  userDataDir: 'C:/Users/DANHA/AppData/Local/Temp/jaejeok-record-chrome',
})
const page = await browser.newPage()
await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 })
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
const S = (ms) => new Promise((r) => setTimeout(r, ms))
const J = (fn, ...a) => page.evaluate(fn, ...a)
const until = async (fn, ms) => {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    if (await J(fn)) return true
    await S(200)
  }
  return false
}
await page.goto(BASE + '?app=stage&fresh&demo=1', { waitUntil: 'networkidle0' })
await page.waitForFunction(() => !!window.__jj)
await J(() => window.__jj.app.set({ settings: { ...window.__jj.app.get().settings, voice: false } }))
await S(1500)

const cdp = await page.createCDPSession()
const frames = []
let n = 0
cdp.on('Page.screencastFrame', async (f) => {
  const name = `f${String(n++).padStart(5, '0')}.jpg`
  writeFileSync(`${OUT}/${name}`, Buffer.from(f.data, 'base64'))
  frames.push({ name, t: f.metadata.timestamp })
  cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {})
})
await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 })
const marks = []
const mark = async (what) => {
  marks.push({ what, t: Date.now() / 1000 })
  console.log(what, JSON.stringify(await J(() => { const s = window.__jj.app.get(); return { screen: s.screen, mode: s.out?.mode, title: s.out?.status?.title, alert: s.out?.alert?.kind ?? null, line: s.speech.line } })))
}

await mark('start')
await S(2500)
await J(() => window.__jj.confirmLoad({ kind: 'box', massKg: 300, belts: 2, beltType: 'ratchet', frontWall: false }, { newWaybill: true }))
await mark('load confirmed')
await S(5000)
await J(() => window.__jj.playScenario('kit-slide'))
await mark('kit-slide')
const asked = await until(() => window.__jj.app.get().speech.listening, 60000)
await mark('asked ' + asked)
await S(1800)
await J(() => window.__jj.answerYes())
await mark('answered')
await until(() => !!window.__jj.app.get().waypoint, 8000)
await S(3500)
await J(() => window.__jj.playScenario('arrive'))
await mark('arrive')
await until(() => window.__jj.app.get().screen === 'relash', 30000)
await mark('relash')
await S(6000)
await J(() => window.__jj.relashDone())
await mark('relash done')
await S(5000)
await mark('end')
await cdp.send('Page.stopScreencast')
await S(300)
writeFileSync(`${OUT}/frames.json`, JSON.stringify({ frames, marks }, null, 1))
console.log('FRAMES', frames.length, 'errors', errors.length, errors.slice(0, 3).join(' | '))
await browser.close()
