// Android 에뮬레이터 gRPC 통로 (emulator -grpc 8554). 사람이 없어도 가상 마이크와 여러 손가락 터치를 넣을 수 있다.
//   node emu-grpc.mjs audio <wav> [앞 쉼 ms] [뒤 쉼 ms]   가상 마이크로 wav(16비트 모노)를 넣는다
//   node emu-grpc.mjs swipe3 <x1> <y1> <x2> <y2> [ms] [간격px] [가로|세로]   세 손가락으로 끈다
//   node emu-grpc.mjs tap <x> <y>
//   node emu-grpc.mjs shot <out.png>
//   node emu-grpc.mjs gps <lat> <lng> [speed m/s] [bearing]
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const grpc = require('@grpc/grpc-js')
const loader = require('@grpc/proto-loader')

const PROTO = 'C:/Users/DANHA/tools/android-sdk/emulator/lib/emulator_controller.proto'
const def = loader.loadSync(PROTO, { keepCase: true, longs: Number, enums: String, defaults: true, includeDirs: ['C:/Users/DANHA/tools/android-sdk/emulator/lib'] })
const pkg = grpc.loadPackageDefinition(def).android.emulation.control
export const emu = new pkg.EmulatorController('127.0.0.1:' + (process.env.EMU_GRPC ?? '8554'), grpc.credentials.createInsecure(), {
  'grpc.max_receive_message_length': 64 * 1024 * 1024,
})
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const call = (name, arg) => new Promise((res, rej) => emu[name](arg, (e, v) => (e ? rej(e) : res(v))))

/** wav 의 fmt · data 를 읽는다 */
const readWav = (path) => {
  const b = readFileSync(path)
  let p = 12
  let rate = 44100
  let ch = 1
  let bits = 16
  let data = null
  while (p + 8 <= b.length) {
    const id = b.toString('ascii', p, p + 4)
    const n = b.readUInt32LE(p + 4)
    if (id === 'fmt ') {
      ch = b.readUInt16LE(p + 10)
      rate = b.readUInt32LE(p + 12)
      bits = b.readUInt16LE(p + 22)
    } else if (id === 'data') data = b.subarray(p + 8, p + 8 + n)
    p += 8 + n + (n & 1)
  }
  if (!data || bits !== 16 || ch !== 1) throw new Error('16비트 모노 wav 만 됩니다')
  return { rate, data }
}

/** 가상 마이크로 소리를 넣는다. 에뮬레이터가 가져가는 속도에 맞춰 흘러간다 */
export const injectAudio = (path, preMs = 400, postMs = 1200, gain = 1) =>
  new Promise((res, rej) => {
    const { rate, data } = readWav(path)
    const sil = (ms) => Buffer.alloc(Math.round((rate * ms) / 1000) * 2)
    let body = Buffer.from(data)
    if (process.env.TRIM !== '0') {
      // 앞뒤 조용한 부분을 잘라 낱말만 남긴다 (끝난 뒤에도 흘려 넣으면 에뮬레이터가 꺼진다: 마이크가 닫힌 뒤 넣기가 이어지면 안 된다)
      let peak = 0
      for (let i = 0; i + 1 < body.length; i += 2) peak = Math.max(peak, Math.abs(body.readInt16LE(i)))
      let i0 = 0
      let i1 = body.length - 2
      while (i0 < i1 && Math.abs(body.readInt16LE(i0)) < peak * 0.03) i0 += 2
      while (i1 > i0 && Math.abs(body.readInt16LE(i1)) < peak * 0.03) i1 -= 2
      body = body.subarray(i0, i1 + 2)
    }
    if (gain !== 1) for (let i = 0; i + 1 < body.length; i += 2) body.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(body.readInt16LE(i) * gain))), i)
    const all = Buffer.concat([sil(preMs), body, sil(postMs)])
    const format = { samplingRate: rate, channels: 'Mono', format: 'AUD_FMT_S16', mode: 'MODE_UNSPECIFIED' }
    const st = emu.injectAudio((e) => (e ? rej(e) : res(all.length / 2 / rate)))
    const step = Math.round(rate * 0.02) * 2
    let p = 0
    const push = () => {
      while (p < all.length) {
        const ok = st.write({ format, timestamp: Date.now() * 1000, audio: all.subarray(p, p + step) })
        p += step
        if (!ok) return st.once('drain', push)
      }
      st.end()
    }
    push()
  })

/** 손가락 n 개로 끈다. pressure 0 이 떼기 */
export const swipeN = async (n, x1, y1, x2, y2, ms = 500, gap = 160, axis = 'x') => {
  const at = (x, y, pressure) => ({
    touches: Array.from({ length: n }, (_, i) => {
      const off = (i - (n - 1) / 2) * gap
      return { x: Math.round(axis === 'x' ? x + off : x), y: Math.round(axis === 'x' ? y : y + off), identifier: i + 1, pressure, touch_major: pressure ? 10 : 0, touch_minor: pressure ? 10 : 0 }
    }),
    display: 0,
  })
  const steps = Math.max(8, Math.round(ms / 16))
  for (let i = 0; i <= steps; i++) {
    const k = i / steps
    await call('sendTouch', at(x1 + (x2 - x1) * k, y1 + (y2 - y1) * k, 1))
    await wait(16)
  }
  await wait(60)
  await call('sendTouch', at(x2, y2, 0))
}

export const tap = async (x, y) => {
  await call('sendTouch', { touches: [{ x, y, identifier: 1, pressure: 1, touch_major: 10, touch_minor: 10 }], display: 0 })
  await wait(80)
  await call('sendTouch', { touches: [{ x, y, identifier: 1, pressure: 0 }], display: 0 })
}

export const shot = async (out) => {
  const img = await call('getScreenshot', { format: 'PNG', width: +(process.env.SHOT_W ?? 0), height: 0, display: 0 })
  writeFileSync(out, img.image)
  return img.format
}

export const gps = (latitude, longitude, speed = 0, bearing = 0) => call('setGps', { latitude, longitude, speed, bearing, altitude: 30, satellites: 12, passiveUpdate: false })

if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('emu-grpc.mjs')) {
  const [cmd, ...a] = process.argv.slice(2)
  try {
    if (cmd === 'audio') console.log('injected', await injectAudio(a[0], +(a[1] ?? 400), +(a[2] ?? 1200), +(a[3] ?? 1)), 's')
    else if (cmd === 'swipe3') await swipeN(3, +a[0], +a[1], +a[2], +a[3], +(a[4] ?? 500), +(a[5] ?? 160), a[6] === '세로' || a[6] === 'y' ? 'y' : 'x')
    else if (cmd === 'swipeN') await swipeN(+a[0], +a[1], +a[2], +a[3], +a[4], +(a[5] ?? 500), +(a[6] ?? 160), a[7] === 'y' ? 'y' : 'x')
    else if (cmd === 'tap') await tap(+a[0], +a[1])
    else if (cmd === 'shot') console.log(JSON.stringify(await shot(a[0])))
    else if (cmd === 'gps') await gps(+a[0], +a[1], +(a[2] ?? 0), +(a[3] ?? 0))
    else if (cmd === 'status') console.log(JSON.stringify(await call('getStatus', {})))
    else if (cmd === 'mic') console.log(JSON.stringify(await call('getMicrophoneState', {})))
    else throw new Error('명령: audio | swipe3 | swipeN | tap | shot | gps | status | mic')
    process.exit(0)
  } catch (e) {
    console.log('ERROR', e.code, e.details ?? e.message)
    process.exit(1)
  }
}
