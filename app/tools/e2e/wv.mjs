// 에뮬레이터 앱(WebView)에 붙어 상태를 읽는다: node wv.mjs "<js expression>"
import puppeteer from 'puppeteer-core'
const b = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9333', defaultViewport: null })
const pages = await b.pages()
const p = pages.find((x) => x.url().includes('app.jaejeok.local')) ?? pages[0]
const r = await p.evaluate(process.argv[2])
console.log(typeof r === 'string' ? r : JSON.stringify(r, null, 1))
b.disconnect()
