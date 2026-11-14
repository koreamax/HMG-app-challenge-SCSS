// 실제 폰처럼 (기기 틀 없이, 창 = 화면) 한 장씩. node phone-natural.mjs
import puppeteer from 'puppeteer-core'
const BASE = process.argv[2] ?? 'http://localhost:5174/'
const OUT = new globalThis.URL('./shots/phone/', import.meta.url)
const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--no-first-run', '--mute-audio'], userDataDir: 'C:/Users/DANHA/AppData/Local/Temp/jaejeok-phone-chrome2' })
const p = await b.newPage()
const errs = []
p.on('pageerror', (e) => errs.push(e.message))
for (const [w, h, name] of [[390, 780, '70_natural_390x780'], [360, 640, '71_natural_360x640']]) {
  await p.setViewport({ width: w, height: h, deviceScaleFactor: 2 })
  await p.goto(BASE + '?app=phone&fresh', { waitUntil: 'networkidle0' })
  await new Promise((r) => setTimeout(r, 1500))
  await p.screenshot({ path: new globalThis.URL(name + '.png', OUT).pathname.slice(1) })
}
await p.evaluate(() => window.__jj.confirmLoad({ kind: 'appliance', massKg: 300, belts: 2, beltType: 'ratchet', frontWall: false }))
await new Promise((r) => setTimeout(r, 2500))
await p.screenshot({ path: new globalThis.URL('72_natural_360_check.png', OUT).pathname.slice(1) })
console.log('errors', errs)
await b.close()
