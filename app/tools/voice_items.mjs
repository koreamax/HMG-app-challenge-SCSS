// 앱이 말하는 문장 목록 (key = manifest 열쇠, text = 읽을 글). make_voice_elevenlabs.mjs 와 같은 목록.
import { LINES } from '../web/src/engine/lines.ts'
import { REST_AREAS } from '../web/src/engine/places.ts'
const fixed = Object.values(LINES).filter((v) => typeof v === 'string')
const joined = [LINES.cargoMoved + ' ' + LINES.restAreaAsk, LINES.cargoMoved + ' ' + LINES.safePlace, LINES.barLoose + ' ' + LINES.restAreaAsk, LINES.barLoose + ' ' + LINES.safePlace]
const recheck = [80, 160, 240, 320, 400].map((km) => LINES.recheckKm(km))
const partsOnly = new Set([LINES.barLoose, LINES.cargoMoved, LINES.restAreaAsk, LINES.safePlace])
export const items = []
for (const text of [...fixed.filter((t) => !partsOnly.has(t)), ...joined, ...recheck]) items.push({ key: text, text })
items.push({ key: '__waypoint', text: LINES.waypointAdded('다음 졸음쉼터') })
for (const r of REST_AREAS) items.push({ key: '__waypoint:' + r.name, text: LINES.waypointAdded(r.name) })
if (process.argv[1] && process.argv[1].endsWith('voice_items.mjs')) console.log(JSON.stringify(items))
