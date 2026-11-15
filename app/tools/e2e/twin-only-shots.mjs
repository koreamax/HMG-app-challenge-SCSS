// 트윈만 찍기 (기획서용 짐 종류별 그림, 화면 없는 Chrome). 적재함 3D 하나만 창 가득: 단추 · 판 · 글 없음 (?app=twin, DESIGN_SPEC §11.9).
//   node twin-only-shots.mjs [url]        기본 http://127.0.0.1:4173/
//   짐 다섯 (팔레트 · 가전 · 가구 · 자재 · 박스) x 3D 보기 + 박스 위에서 보기 한 장, 1920 x 1080, 밤.
//   shots/twin_only/twin_<cargo>_<view>_night.png  (CHIPS=1 이면 정보 칩을 그린 한 벌 ..._chips.png 도, DAY=1 이면 낮 한 벌도)
import puppeteer from 'puppeteer-core'
import { mkdirSync } from 'node:fs'

const BASE = process.argv[2] ?? 'http://127.0.0.1:4173/'
const OUT = new URL('./shots/twin_only/', import.meta.url)
mkdirSync(OUT, { recursive: true })
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const file = (name) => decodeURIComponent(new URL(name + '.png', OUT).pathname.slice(1))

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-first-run', '--no-default-browser-check', '--disable-extensions', '--window-size=1920,1080', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  userDataDir: 'C:/Users/DANHA/AppData/Local/Temp/jaejeok-twin-only-shots-chrome',
  defaultViewport: { width: 1920, height: 1080, deviceScaleFactor: 1 },
})
const page = await browser.newPage()
// 멈춘 모습으로 (새 짐 올라오기 · 빛 띠가 사진 도중에 찍히지 않게)
await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }])
const errors = []
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
page.on('console', (m) => {
  if (m.type() === 'error') errors.push('error: ' + m.text())
})
const S = (ms) => new Promise((r) => setTimeout(r, ms))

async function shot(cargo, view, { theme = 'night', chips = false } = {}) {
  const q = new URLSearchParams({ app: 'twin', cargo, view, theme })
  if (chips) q.set('chips', '1')
  await page.goto(BASE + '?' + q.toString(), { waitUntil: 'networkidle0' })
  await page.waitForFunction(() => document.documentElement.dataset.twinReady === '1', { timeout: 60000 })
  await S(600)
  // 트윈 말고는 아무것도 없어야 한다: 단추 · 입력 · 판이 하나라도 있으면 알린다
  const extra = await page.evaluate(() => document.querySelectorAll('button, a[href], input, .nv-park, .ph-root, .nv-kpi, .nv-banner').length)
  if (extra) errors.push(`${cargo} ${view}: 트윈 말고 다른 것 ${extra}개`)
  const name = `twin_${cargo}_${view}_${theme}${chips ? '_chips' : ''}`
  await page.screenshot({ path: file(name) })
  console.log('saved', name + '.png')
}

const CARGO = ['pallet', 'appliance', 'furniture', 'material', 'box']
for (const c of CARGO) await shot(c, '3d')
await shot('box', 'top')
if (process.env.CHIPS) for (const c of CARGO) await shot(c, '3d', { chips: true })
if (process.env.DAY) for (const c of CARGO) await shot(c, '3d', { theme: 'day' })

console.log(errors.length ? 'errors:\n' + [...new Set(errors)].join('\n') : 'no console errors')
await browser.close()
