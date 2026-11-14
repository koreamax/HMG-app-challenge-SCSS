// 에뮬레이터 GPS 를 1초마다 넣는다 (emulator -grpc 8554). 점들을 잇는 선을 따라 일정 속도로 움직인다.
//   node gps-feed.mjs <km/h> <초> <lat,lng> [<lat,lng> ...]      점이 하나면 그 자리에 서 있는다
import { execFileSync } from 'node:child_process'
// 에뮬레이터가 스스로 만드는 NMEA 는 검사합(*47)이 틀려 Pleos 내비가 버린다. 그래서 검사합이 맞는 문장을 직접 만들어 콘솔(geo nmea)로 넣는다.
const ADB = 'C:/Users/DANHA/tools/android-sdk/platform-tools/adb.exe'
const cs = (body) => {
  let c = 0
  for (const ch of body) c ^= ch.charCodeAt(0)
  return '$' + body + '*' + c.toString(16).toUpperCase().padStart(2, '0')
}
const dm = (deg, w) => {
  const d = Math.floor(Math.abs(deg))
  const m = (Math.abs(deg) - d) * 60
  return String(d).padStart(w, '0') + m.toFixed(4).padStart(7, '0')
}
const gps = async (lat, lng, speed, course) => {
  const n = new Date()
  const p2 = (x) => String(x).padStart(2, '0')
  const hms = p2(n.getUTCHours()) + p2(n.getUTCMinutes()) + p2(n.getUTCSeconds())
  const dmy = p2(n.getUTCDate()) + p2(n.getUTCMonth() + 1) + p2(n.getUTCFullYear() % 100)
  const la = dm(lat, 2) + ',' + (lat >= 0 ? 'N' : 'S')
  const lo = dm(lng, 3) + ',' + (lng >= 0 ? 'E' : 'W')
  // 에뮬레이터 GNSS HAL 은 에뮬레이터가 쓰는 모양 그대로만 읽는다 (다르면 'failed to parse')
  const gga = cs(`GPGGA,${hms},${la},${lo},1,10,0.8,30.0,M,0.0,M,,`)
  const rmc = cs(`GPRMC,${hms},A,${la},${lo},${(speed * 1.943844).toFixed(2)},${course.toFixed(2)},${dmy},0.0,W`)
  for (const s of [gga, rmc]) execFileSync(ADB, ['emu', 'geo', 'nmea', s], { timeout: 5000 })
}
const [kmh, secs, ...pts] = process.argv.slice(2)
const P = pts.map((s) => s.split(',').map(Number))
const v = (+kmh * 1000) / 3600
const R = 6371000
const rad = (d) => (d * Math.PI) / 180
const dist = (a, b) => {
  const x = rad(b[1] - a[1]) * Math.cos(rad((a[0] + b[0]) / 2))
  const y = rad(b[0] - a[0])
  return Math.hypot(x, y) * R
}
const bearing = (a, b) => {
  const x = rad(b[1] - a[1]) * Math.cos(rad((a[0] + b[0]) / 2))
  const y = rad(b[0] - a[0])
  return ((Math.atan2(x, y) * 180) / Math.PI + 360) % 360
}
let seg = 0
let along = 0
let last = 0
for (let t = 0; t < +secs; t++) {
  let pos = P[Math.min(seg, P.length - 1)]
  let moving = false
  if (seg < P.length - 1) {
    along += v
    while (seg < P.length - 1 && along >= dist(P[seg], P[seg + 1])) {
      along -= dist(P[seg], P[seg + 1])
      seg++
    }
    if (seg < P.length - 1) {
      const k = along / dist(P[seg], P[seg + 1])
      pos = [P[seg][0] + (P[seg + 1][0] - P[seg][0]) * k, P[seg][1] + (P[seg + 1][1] - P[seg][1]) * k]
      last = bearing(P[seg], P[seg + 1])
      moving = true
    } else pos = P[P.length - 1]
  }
  await gps(pos[0], pos[1], moving ? v : 0, last)
  if (t % 10 === 0) console.log(t + ' s', pos[0].toFixed(5), pos[1].toFixed(5), moving ? 'moving' : 'stopped')
  await new Promise((r) => setTimeout(r, 1000))
}
process.exit(0)
