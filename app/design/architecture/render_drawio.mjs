// draw.io 파일을 draw.io 공식 뷰어(viewer-static)로 그려 PNG 로 저장한다. 그림은 브라우저 안에서만 그린다.
//   node render_drawio.mjs [in.drawio] [out.png] [scale]
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'

const HERE = dirname(fileURLToPath(import.meta.url))
const require = createRequire(pathToFileURL(join(HERE, '..', '..', 'tools', 'e2e', 'package.json')))
const puppeteer = require('puppeteer-core')
const src = process.argv[2] ?? join(HERE, 'jaejeok_architecture.drawio')
const out = process.argv[3] ?? src.replace(/\.drawio$/, '.png')
const scale = +(process.argv[4] ?? 2.5)
const xml = readFileSync(src, 'utf8')
const cfg = JSON.stringify({ highlight: '#0000ff', nav: false, resize: false, toolbar: '', edit: null, xml, border: 16 }).replace(/&/g, '&amp;').replace(/'/g, '&#39;').replace(/</g, '&lt;')
const html = `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;background:#fff;font-family:Pretendard}</style></head>
<body><div id="d" class="mxgraph" data-mxgraph='${cfg}'></div>
<script src="https://viewer.diagrams.net/js/viewer-static.min.js"></script></body></html>`
const tmp = join(HERE, '_render.html')
writeFileSync(tmp, html)
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--no-first-run', '--allow-file-access-from-files'] })
const page = await browser.newPage()
await page.setViewport({ width: 1800, height: 1200, deviceScaleFactor: scale })
await page.goto(pathToFileURL(tmp).href, { waitUntil: 'networkidle0', timeout: 60000 })
await page.waitForSelector('#d svg', { timeout: 30000 })
await page.evaluate(() => document.fonts.ready)
await new Promise((r) => setTimeout(r, 800))
const el = await page.$('#d svg')
const fam = await page.evaluate(() => getComputedStyle(document.querySelector('#d svg foreignObject div div') ?? document.body).fontFamily)
writeFileSync(out, await el.screenshot({ omitBackground: false }))
console.log('PNG', out, 'font', fam)
await browser.close()
