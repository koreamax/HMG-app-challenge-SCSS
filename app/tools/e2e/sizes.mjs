import puppeteer from 'puppeteer-core'
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, userDataDir: 'C:/Users/DANHA/AppData/Local/Temp/jaejeok-e2e-chrome', args: ['--no-first-run', '--disable-extensions'] })
const page = await browser.newPage()
const S = (ms) => new Promise((r) => setTimeout(r, ms))
for (const [w, h] of [[1024, 768], [1920, 720], [1280, 720]]) {
  await page.setViewport({ width: w, height: h })
  await page.goto('http://127.0.0.1:5190/?fresh=1&demo=0', { waitUntil: 'networkidle0' })
  await page.waitForFunction(() => !!window.__jj)
  await page.evaluate(() => window.__jj.confirmLoad({ kind: 'furniture', massKg: 300, belts: 3, beltType: 'ratchet', frontWall: true }))
  await S(2500)
  await page.screenshot({ path: `shots/size_${w}x${h}_home.png` })
}
await browser.close()
console.log('ok')
