// WebView 의 오류를 스택과 함께 잡는다: node wv-err.mjs
import puppeteer from 'puppeteer-core'
const b = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9333', defaultViewport: null })
const pages = await b.pages()
const p = pages.find((x) => x.url().includes('app.jaejeok.local')) ?? pages[0]
const out = await p.evaluate(() => new Promise((res) => {
  const errs = []
  window.addEventListener('error', (e) => errs.push(String(e.error && e.error.stack || e.message)))
  setTimeout(() => res({ errs: errs.slice(0, 2), native: (window.JaejeokAndroid ? window.JaejeokAndroid.info() : null), w: innerWidth, h: innerHeight, root: document.getElementById('root')?.innerHTML.slice(0, 300) }), 1500)
}))
console.log(JSON.stringify(out, null, 1))
b.disconnect()
