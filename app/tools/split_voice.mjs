// ElevenLabs 에서 한 번에 만든 긴 음성(mp3: 문장 사이에 [long pause])을 문장별 파일로 자른다.
//   node --experimental-strip-types tools/split_voice.mjs "<받은 mp3>"
// 화면 없는 Chrome 의 Web Audio 로 풀어서 (ffmpeg 없음), 가장 긴 쉼 N-1 개에서 자르고 wav(24 kHz 모노)로 쓴다.
import { readFileSync, readdirSync, unlinkSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import { items } from './voice_items.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(pathToFileURL(join(ROOT, 'tools', 'e2e', 'package.json')))
const puppeteer = require('puppeteer-core')
const OUT = join(ROOT, 'web', 'public', 'voice')
const src = process.argv[2]
if (!src) throw new Error('mp3 경로를 주세요')
const b64 = readFileSync(src).toString('base64')
const RATE = 24000

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true,
  args: ['--no-first-run', '--disable-extensions', '--autoplay-policy=no-user-gesture-required'],
  userDataDir: 'C:/Users/DANHA/AppData/Local/Temp/jaejeok-voice-chrome',
})
const page = await browser.newPage()
await page.goto('about:blank')
const res = await page.evaluate(async (b64, RATE, n) => {
  const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
  const ctx = new OfflineAudioContext(1, RATE, RATE)
  const buf = await ctx.decodeAudioData(bin.buffer)
  const x = buf.getChannelData(0)
  const win = Math.round(RATE * 0.02)
  const rms = []
  for (let i = 0; i + win <= x.length; i += win) {
    let s = 0
    for (let j = i; j < i + win; j++) s += x[j] * x[j]
    rms.push(Math.sqrt(s / win))
  }
  const peak = Math.max(...rms)
  const quiet = rms.map((v) => v < peak * 0.02)
  // 쉼 구간 (창 번호)
  const gaps = []
  let st = -1
  for (let i = 0; i < quiet.length; i++) {
    if (quiet[i] && st < 0) st = i
    if ((!quiet[i] || i === quiet.length - 1) && st >= 0) {
      gaps.push([st, i])
      st = -1
    }
  }
  const first = quiet.findIndex((q) => !q)
  const last = quiet.length - 1 - [...quiet].reverse().findIndex((q) => !q)
  const inner = gaps.filter((g) => g[0] > first && g[1] <= last).sort((a, b) => b[1] - b[0] - (a[1] - a[0]))
  const cuts = inner.slice(0, n - 1).sort((a, b) => a[0] - b[0])
  const gapLens = inner.slice(0, n + 3).map((g) => +((g[1] - g[0]) * 0.02).toFixed(2))
  const segs = []
  let a = first
  for (const g of cuts) {
    segs.push([a, g[0]])
    a = g[1]
  }
  segs.push([a, last + 1])
  const pad = Math.round(RATE * 0.12)
  const out = segs.map(([s, e]) => {
    const i0 = Math.max(0, s * win - pad)
    const i1 = Math.min(x.length, e * win + pad)
    const pcm = new Int16Array(i1 - i0)
    for (let i = i0; i < i1; i++) {
      // 앞뒤 20 ms 는 부드럽게
      const k = Math.min(1, (i - i0) / (RATE * 0.02), (i1 - i) / (RATE * 0.02))
      pcm[i - i0] = Math.max(-32768, Math.min(32767, Math.round(x[i] * k * 32767)))
    }
    let bin = ''
    const u8 = new Uint8Array(pcm.buffer)
    for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000))
    return { sec: +((i1 - i0) / RATE).toFixed(2), b64: btoa(bin) }
  })
  return { dur: +(x.length / RATE).toFixed(1), gapLens, out }
}, b64, RATE, items.length)
await browser.close()

console.log('길이', res.dur, 's · 쉼 길이(긴 순서):', res.gapLens.join(' '), '· 조각', res.out.length)
if (res.out.length !== items.length) throw new Error('조각 수가 문장 수와 다릅니다')
const wav = (pcm) => {
  const h = Buffer.alloc(44)
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVEfmt ', 8); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22)
  h.writeUInt32LE(RATE, 24); h.writeUInt32LE(RATE * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40)
  return Buffer.concat([h, pcm])
}
mkdirSync(OUT, { recursive: true })
for (const f of readdirSync(OUT)) if (/^(v|e)\d+\.(wav|mp3)$/.test(f)) unlinkSync(join(OUT, f))
const manifest = { __engine: 'elevenlabs', __voice: 'Mina - Clear, Calm & Warm', __model: 'Eleven v4' }
res.out.forEach((o, i) => {
  const file = 'e' + String(i + 1).padStart(2, '0') + '.wav'
  writeFileSync(join(OUT, file), wav(Buffer.from(o.b64, 'base64')))
  manifest[items[i].key] = file
  console.log(file, o.sec + ' s', items[i].text)
})
writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1), 'utf8')
