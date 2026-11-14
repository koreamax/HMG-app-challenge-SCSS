/** 상태 -> 화면 값 (3D 입력, 문구, 숫자 형식) */
import type { BedInput, BeltMark } from '@/three/bed-scene'
import type { LoadInput, LoadVerdict } from '@/engine/limit'
import type { ActiveAlert } from '@/engine/monitor'
import type { KitSnapshot } from '@/runtime/kit'
import { CARGO } from '@/engine/cargo'

export const fmt2 = (v: number) => v.toFixed(2)
export const kgf = (n: number) => Math.round(n / 9.81 / 10) * 10
export const daN = (n: number) => Math.round(n / 10)
export const clock = (ms: number) => {
  const d = new Date(ms)
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0')
}
export const dateTime = (ms: number) => {
  const d = new Date(ms)
  return d.getMonth() + 1 + '월 ' + d.getDate() + '일 ' + clock(ms)
}

export const SHIFT_WORD = { front: '앞으로', rear: '뒤로', left: '왼쪽으로', right: '오른쪽으로' } as const
export const DIR_WORD = { brake: '제동', turn: '회전', accel: '출발' } as const

export function shiftText(a: ActiveAlert | null | undefined) {
  if (!a?.shiftMm || a.shiftMm < 5) return null
  const cm = Math.round(a.shiftMm / 10)
  return (a.shiftDir ? SHIFT_WORD[a.shiftDir] + ' ' : '') + cm + ' cm'
}

/** 벨트별 색 · 이름표. 키트 센서는 앞 끝(c1) · 뒤 끝(c2) */
export function beltMarks(load: LoadInput, v: LoadVerdict, kit: { fresh: boolean; snap: KitSnapshot | null }, alert: ActiveAlert | null, relash = false): BeltMark[] {
  const n = Math.max(0, load.belts)
  const need = v.perBeltNeedN
  const marks: BeltMark[] = []
  const order: number[] = []
  for (let i = 0; i < n; i++) {
    const t = v.tensions[i]
    const sensor = t?.sensor ?? null
    let tone: BeltMark['tone'] = v.tone === 'grey' ? 'grey' : v.kind === 'slide' ? 'orange' : 'green'
    let label: string | null = null
    if (kit.fresh && sensor && t?.measured) {
      const name = sensor === 'c1' ? '앞 바' : '뒤 바'
      const loose = alert?.loose[sensor]
      if (loose) {
        tone = 'red'
        label = name + ' · 풀림 ' + Math.round(t.n) + ' N'
      } else if (need !== null && t.n < need) {
        tone = 'orange'
        label = name + ' · 약함 ' + Math.round(t.n) + ' N'
      } else {
        tone = 'green'
        label = name + ' · 충분 ' + Math.round(t.n) + ' N'
      }
      if (loose) order.unshift(i)
      else order.push(i)
    } else {
      if (kit.fresh) tone = 'neutral'
      order.push(i)
    }
    if (relash && alert && alert.kind !== 'lost') tone = alert.measured && sensor && alert.loose[sensor] ? 'red' : 'orange'
    marks.push({ tone, label })
  }
  if (relash && alert && alert.kind !== 'lost') {
    // 다시 조일 차례: 풀린 바부터, 그다음 나머지 (앞에서 뒤로)
    const loosen = order.filter((i) => {
      const s = v.tensions[i]?.sensor
      return s && alert.loose[s]
    })
    const rest = order.filter((i) => !loosen.includes(i))
    ;[...loosen, ...rest].slice(0, 4).forEach((i, k) => (marks[i] = { ...marks[i], badge: k + 1 }))
  }
  return marks
}

export function bedInput(load: LoadInput, v: LoadVerdict, kit: { fresh: boolean; snap: KitSnapshot | null }, alert: ActiveAlert | null, relash = false): BedInput {
  const f = kit.snap?.frame
  let shift: BedInput['shift'] = null
  const mm = relash && alert?.shiftMm ? alert.shiftMm : kit.fresh && f ? f.shiftMm : 0
  const dir = relash && alert?.shiftDir ? alert.shiftDir : f?.shiftDir ?? null
  if (mm > 5 && dir) {
    const m = mm / 1000
    shift = { x: dir === 'left' ? -m : dir === 'right' ? m : 0, z: dir === 'front' ? -m : dir === 'rear' ? m : 0 }
  }
  const lost = alert?.kind === 'lost' || (kit.fresh && !!kit.snap && !kit.snap.extras.onBed)
  // 짐이 없어졌으면 벨트 이름표 · 이동 거리는 빼고 '짐 이탈 의심' 하나만
  const belts = beltMarks(load, v, kit, alert, relash).map((b) => (lost ? { tone: 'red' as const, label: null, badge: null } : b))
  if (lost) shift = null
  return {
    kind: load.kind,
    belts,
    beltType: load.beltType,
    frontWall: load.frontWall,
    shift,
    shiftLabel: shift ? shiftText(alert) ?? (dir ? SHIFT_WORD[dir] + ' ' + Math.round(mm / 10) + ' cm' : null) : null,
    lost,
    ghost: relash || !!shift || lost,
    focus: relash && !lost,
  }
}

export const loadSummary = (load: LoadInput) => ({
  cargo: CARGO[load.kind].label + ' · ' + load.massKg + ' kg',
  belts: (load.beltType === 'ratchet' ? '라쳇 ' : '고무바 ') + load.belts + '개',
  wall: load.frontWall ? '붙임' : '안 붙임',
})
