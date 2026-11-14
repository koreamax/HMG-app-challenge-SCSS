// 휴대폰 판에 든 3D 무대 (three/BedView) 가 어떻게 보이는지만 찍는다. node phone-3d-shots.mjs [url]
// 390 x 844, 화면 배율 2. shots/nav/ph390_3d_<짐>.png
import puppeteer from 'puppeteer-core'
import { mkdirSync } from 'node:fs'

const BASE = process.argv[2] ?? 'http://127.0.0.1:5173/'
const OUT = new URL('./shots/nav/', import.meta.url)
mkdirSync(OUT, { recursive: true })
const file = (name) => decodeURIComponent(new URL(name + '.png', OUT).pathname.slice(1))
const S = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--no-first-run', '--no-default-browser-check', '--disable-extensions', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  userDataDir: 'C:/Users/DANHA/AppData/Local/Temp/jaejeok-nav-shots-chrome-phone',
  defaultViewport: { width: 390, height: 844, deviceScaleFactor: 2 },
})
const page = await browser.newPage()
// 화면 사진은 멈춘 모습으로 (움직임 확인은 motion-check.mjs): 숫자 세기 · 색 섞임 · 3D 쉼 흔들림이 사진 도중에 찍히지 않게
await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }])
const errors = []
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
await page.goto(BASE + '?app=phone&fresh&demo=1', { waitUntil: 'networkidle0' })
await page.waitForFunction(() => !!window.__jj)
await page.evaluate(() => window.__jj.app.set({ settings: { ...window.__jj.app.get().settings, voice: false } }))
for (const [k, belts, type] of [['pallet', 3, 'ratchet'], ['appliance', 2, 'ratchet'], ['material', 2, 'rubber']]) {
  await page.evaluate((i) => window.__jj.confirmLoad(i, { newWaybill: true }), { kind: k, massKg: 300, belts, beltType: type, frontWall: false })
  await S(1800)
  await page.screenshot({ path: file('ph390_3d_' + k) })
}
console.log(errors.length ? 'errors:\n' + errors.join('\n') : 'no page errors')
await browser.close()
