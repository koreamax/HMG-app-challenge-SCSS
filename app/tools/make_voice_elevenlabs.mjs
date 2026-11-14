// 앱이 말하는 문장을 ElevenLabs 목소리로 미리 만들어 앱에 넣는다 (web/public/voice/*.mp3 + manifest.json).
// 실행 중에는 외부 서비스를 부르지 않는다: 문장이 정해져 있어서 미리 만든 소리를 튼다 (차 안에서 통신이 끊겨도 된다).
//
//   준비: ElevenLabs API 키를 환경 변수 ELEVENLABS_API_KEY 에 넣거나, C:\Users\<나>\.elevenlabs\api_key.txt 에 한 줄로 적는다
//         (저장소 안에는 두지 않는다).
//   목소리 목록:  node --experimental-strip-types tools/make_voice_elevenlabs.mjs --list
//   만들기:       node --experimental-strip-types tools/make_voice_elevenlabs.mjs
//   고르기:       ELEVENLABS_VOICE_ID=<id> (없으면 한국어 표시가 있는 목소리, 그것도 없으면 계정의 첫 목소리)
//                 ELEVENLABS_MODEL=eleven_multilingual_v2 (기본) | eleven_v3 | eleven_flash_v2_5 ...
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { LINES } from '../web/src/engine/lines.ts'
import { REST_AREAS } from '../web/src/engine/places.ts'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'web', 'public', 'voice')
const API = 'https://api.elevenlabs.io/v1'
const keyFile = join(homedir(), '.elevenlabs', 'api_key.txt')
const KEY = (process.env.ELEVENLABS_API_KEY ?? (existsSync(keyFile) ? readFileSync(keyFile, 'utf8') : '')).trim()
if (!KEY) {
  console.error('ElevenLabs API 키가 없습니다. 환경 변수 ELEVENLABS_API_KEY 에 넣거나 ' + keyFile + ' 에 한 줄로 적어 주세요.')
  process.exit(2)
}
const MODEL = process.env.ELEVENLABS_MODEL ?? 'eleven_multilingual_v2'
const headers = { 'xi-api-key': KEY }

// ── 문장: 엔진이 말하는 것 전부 ──
const fixed = Object.values(LINES).filter((v) => typeof v === 'string')
const joined = [
  LINES.cargoMoved + ' ' + LINES.restAreaAsk,
  LINES.cargoMoved + ' ' + LINES.safePlace,
  LINES.barLoose + ' ' + LINES.restAreaAsk,
  LINES.barLoose + ' ' + LINES.safePlace,
]
const recheck = [80, 160, 240, 320, 400].map((km) => LINES.recheckKm(km))
// 문장 조각만으로는 말하지 않는 것은 뺀다 (이어 붙인 문장으로만 쓴다)
const partsOnly = new Set([LINES.barLoose, LINES.cargoMoved, LINES.restAreaAsk, LINES.safePlace])
const items = []
for (const text of [...fixed.filter((t) => !partsOnly.has(t)), ...joined, ...recheck]) items.push({ key: text, text })
// 경유지: 거리 숫자는 빼고 쉼터 이름만 (앱이 이름으로 찾는다). 이름이 없으면 '다음 졸음쉼터'
items.push({ key: '__waypoint', text: LINES.waypointAdded('다음 졸음쉼터') })
for (const r of REST_AREAS) items.push({ key: '__waypoint:' + r.name, text: LINES.waypointAdded(r.name) })

async function voices() {
  const r = await fetch(API + '/voices', { headers })
  if (!r.ok) throw new Error('목소리 목록을 못 받았습니다: ' + r.status + ' ' + (await r.text()).slice(0, 200))
  return (await r.json()).voices ?? []
}
const isKo = (v) => /ko|korean|한국/i.test(JSON.stringify([v.labels ?? {}, v.verified_languages ?? [], v.fine_tuning?.language ?? '']))

if (process.argv.includes('--list')) {
  for (const v of await voices()) console.log(v.voice_id, '|', v.name, '|', v.category, '|', isKo(v) ? '한국어' : '', '|', JSON.stringify(v.labels ?? {}))
  process.exit(0)
}

let voiceId = process.env.ELEVENLABS_VOICE_ID
let voiceName = voiceId
if (!voiceId) {
  const vs = await voices()
  const v = vs.find(isKo) ?? vs[0]
  if (!v) throw new Error('계정에 쓸 수 있는 목소리가 없습니다. ElevenLabs 에서 목소리를 하나 더한 뒤 다시 실행하세요.')
  voiceId = v.voice_id
  voiceName = v.name
}
console.log('목소리:', voiceName, '(' + voiceId + ')', '모델:', MODEL, '문장', items.length + '개')

mkdirSync(OUT, { recursive: true })
const manifest = { __engine: 'elevenlabs', __voice: String(voiceName), __model: MODEL }
let n = 0
for (const it of items) {
  const file = 'e' + String(++n).padStart(2, '0') + '.mp3'
  const r = await fetch(API + '/text-to-speech/' + voiceId + '?output_format=mp3_44100_128', {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify({ text: it.text, model_id: MODEL, voice_settings: { stability: 0.55, similarity_boost: 0.8, style: 0, use_speaker_boost: true } }),
  })
  if (!r.ok) throw new Error('만들지 못했습니다 (' + it.text + '): ' + r.status + ' ' + (await r.text()).slice(0, 300))
  writeFileSync(join(OUT, file), Buffer.from(await r.arrayBuffer()))
  manifest[it.key] = file
  console.log(file, it.text)
}
// 예전 녹음(wav)은 지운다
for (const f of readdirSync(OUT)) if (/^v\d+\.wav$/.test(f)) unlinkSync(join(OUT, f))
writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1), 'utf8')
console.log('끝: ' + n + '개 -> ' + OUT + ' (다음: cd web && npm run build, 그리고 APK 다시 빌드)')
