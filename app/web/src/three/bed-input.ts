/**
 * 앱 상태 -> 3D 무대 입력 (벨트 색 · 꼬리표 · 순서 배지 · 키트가 잰 짐 자세). 내비 · 폰이 같이 쓸 수 있다.
 *   park   : 정차 3D 확인. 키트가 있으면 앞 · 뒤 바 꼬리표와 짐 이동, 없으면 벨트 흑연 띠 + 더 걸 자리 (반투명 주황)
 *   relash : 다시 묶기. 순서 목록이 부르는 바만 판정 색(빨강) + 순서 배지, 나머지 흑연 · 풀린 바는 처진 띠 ·
 *            출발 때 자리 흐린 상자 · 화살 (키트 없으면 모든 바 빨강 + 배지 1, 흐린 상자 · 화살 없음)
 *   kit    : 센서 키트 보기. 센서 자리와 지금 값
 * 꼬리표는 4개까지 (장면이 자른다), 짐 가운데는 장면이 비운다.
 */
import type { LoadInput, LoadVerdict } from '@/engine/limit'
import type { ActiveAlert } from '@/engine/monitor'
import type { KitView } from '@/runtime/runtime'
import { SHIFT_MOVED_MM } from '@/engine/constants'
import type { BedInput, BedPose, BeltMark, MarkTone, StageTag } from './bed-scene'
import { BAR_NAME, dirOf, fmtN, shiftWords } from '@/ui/format'

export type StageMode = 'park' | 'relash' | 'kit'
export type StageOut = { input: BedInput; name: string }

const q = (v: number, step: number) => Math.round(v / step) * step

/** 키트 자세 (mm · 도) -> 3D 자세 (m · 도). 5 mm · 1도 단위로 (작은 떨림에 다시 그리지 않게) */
export function kitPose(kit: KitView): BedPose | null {
  const p = kit.snap?.extras.pose
  if (!p) return null
  return { x: q(p.x, 5) / 1000, z: q(p.y, 5) / 1000, lift: q(p.lift, 5) / 1000, tilt: Math.round(p.tilt) }
}

/** 다시 그릴지 가늠하는 키트 값 요약 (10 N · 5 mm 단위). useStore 선택자에 쓴다 */
export function kitKey(kit: KitView) {
  if (kit.mode === 'off' || !kit.snap) return kit.mode
  const f = kit.snap.frame
  const p = kit.snap.extras.pose
  return [
    kit.mode,
    kit.fresh ? 1 : 0,
    f.c1 === null ? '-' : q(f.c1, 10),
    f.c2 === null ? '-' : q(f.c2, 10),
    p ? [q(p.x, 5), q(p.y, 5), q(p.lift, 5), Math.round(p.tilt)].join(',') : '-',
    kit.snap.extras.onBed ? 1 : 0,
  ].join('|')
}

/** 다시 조일 순서 (벨트 번호, 앞 = 0): 풀린 바 먼저, 그다음 짐이 밀린 반대쪽부터 (앞으로 밀리면 뒤 바부터) */
export function relashOrder(load: LoadInput, v: LoadVerdict, a: ActiveAlert): number[] {
  const n = Math.max(0, load.belts)
  const all = Array.from({ length: n }, (_, i) => i)
  const loose = all.filter((i) => {
    const s = v.tensions[i]?.sensor
    return !!s && a.measured && a.loose[s]
  })
  let rest = all.filter((i) => !loose.includes(i))
  if (a.shiftDir === 'front') rest = rest.reverse()
  return [...loose, ...rest]
}

/**
 * 잰 장력 하나의 상태. unsettled = 짐 밀림 · 바 풀림 · 이탈 의심 사건이 아직 열려 있음:
 * 짐이 밀린 뒤에는 늘어난 바가 높게 읽히므로 '충분' · '약함'으로 판정하지 않고 '다시 확인' (다시 조인 뒤에 판정한다)
 */
export function beltState(n: number, need: number | null, loose: boolean, unsettled = false): { tone: MarkTone; word: string } {
  if (loose) return { tone: 'red', word: '풀림' }
  if (unsettled) return { tone: 'orange', word: '다시 확인' }
  if (need !== null && n < need) return { tone: 'orange', word: '약함' }
  return { tone: 'green', word: '충분' }
}

export function kitName(kit: KitView) {
  if (kit.mode === 'off') return '센서 키트 없음 · 차량 신호로 판단'
  return kit.fresh ? '센서 키트 · ■ 연결' : '센서 키트 · □ 끊김'
}

const EMPTY: BedInput = { kind: 'box', belts: [], beltType: 'ratchet', frontWall: false, shift: null, lost: false, ghost: false, empty: true, tags: [] }

export function stageInput(o: { load: LoadInput | null; verdict: LoadVerdict | null; kit: KitView; alert: ActiveAlert | null; mode: StageMode }): StageOut {
  const { load, verdict: v, kit, alert, mode } = o
  const baseName = '3D 디지털 트윈 · PV5 오픈베드'
  if (!load || !v || v.kind === 'none') return { input: EMPTY, name: mode === 'kit' ? kitName(kit) : baseName }

  const n = Math.max(0, Math.round(load.belts))
  const kitOn = kit.mode !== 'off' && !!kit.snap
  const fresh = kitOn && kit.fresh
  const pose = kitOn ? kitPose(kit) : null
  const onBed = kitOn ? kit.snap!.extras.onBed : true
  // 장력 센서는 라쳇 벨트에만 건다 (고무바 · 로프는 장력을 재지 않는다: 키트 값 0 N 은 '센서 없음')
  const strapSensors = load.beltType === 'ratchet'
  const sensors = kitOn || mode === 'kit' ? { c1: strapSensors && n >= 1, c2: strapSensors && n >= 2, tag: true } : null
  const base = { kind: load.kind, beltType: load.beltType, frontWall: load.frontWall, sensors } as const

  // ── 다시 묶기 ──
  if (mode === 'relash' && alert) {
    if (alert.kind === 'lost') {
      return {
        input: {
          ...base,
          belts: Array.from({ length: n }, () => ({ tone: 'red' as const, loose: true })),
          shift: null,
          lost: true,
          ghost: true,
          focus: true,
          pose,
          tags: [{ id: 'lost', text: '짐 이탈 의심', tone: 'red', icon: 'alert', at: { kind: 'start' } }],
        },
        name: '흐린 상자는 출발 때 자리',
      }
    }
    // 장면 색 = 판정 색 (다시 묶기 띠는 늘 빨강). 오른쪽 '순서대로' 목록이 부르는 바만 빨강 + 순서 배지, 나머지는 흑연 띠.
    //   키트: 목록 = 조일 순서 앞 2개 (밀림) · 3개 (풀림). 번호 = 목록 번호.
    //   키트 없음: 목록 1번 '바를 손으로 당겨 보기' 가 모든 바를 부르므로 모든 바가 빨강 + 배지 1.
    const order = relashOrder(load, v, alert).slice(0, alert.kind === 'moved' ? 2 : 3)
    const belts: BeltMark[] = []
    const tags: StageTag[] = []
    for (let i = 0; i < n; i++) {
      const t = v.tensions[i]
      const s = t?.sensor ?? null
      const loose = !!s && alert.measured && alert.loose[s]
      const k = order.indexOf(i)
      const named = !alert.measured || k >= 0
      belts.push({ tone: named ? 'red' : 'neutral', loose, badge: !alert.measured ? 1 : k >= 0 ? k + 1 : null })
      if (loose && s && t) tags.push({ id: s, text: `${BAR_NAME[s]} · 풀림 ${fmtN(t.n)} N`, tone: 'red', icon: 'loose', at: { kind: 'belt', index: i }, side: s === 'c1' ? 'right' : 'left' })
    }
    if (!alert.measured) {
      return { input: { ...base, belts, shift: null, lost: false, ghost: false, focus: true, tags }, name: '키트가 없어 짐이 움직였는지는 모릅니다' }
    }
    // 키트: 지금 자세 (없으면 사건 때 잰 이동)
    let shift: BedInput['shift'] = null
    let label = shiftWords(alert.shiftMm, alert.shiftDir)
    if (!pose && alert.shiftMm && alert.shiftDir) {
      const m = alert.shiftMm / 1000
      const d = alert.shiftDir
      shift = { x: d === 'left' ? -m : d === 'right' ? m : 0, z: d === 'front' ? -m : d === 'rear' ? m : 0 }
    }
    if (pose && !label) label = shiftWords(Math.hypot(pose.x, pose.z) * 1000, dirOf(pose.x * 1000, pose.z * 1000))
    if (label) tags.push({ id: 'shift', text: label, tone: 'red', icon: 'move', at: { kind: 'arrow' } })
    return {
      input: { ...base, belts, shift, pose, fallen: !onBed, lost: false, ghost: true, focus: true, tags, arrowTone: 'red' },
      name: '흐린 상자는 출발 때 자리',
    }
  }

  // ── 정차 3D 확인 · 센서 키트 보기 ──
  type Slot = { real: number } | { hint: true }
  const slots: Slot[] = Array.from({ length: n }, (_, i) => ({ real: i }))
  // 할 일이 '바 … 더 거세요' 일 때만 더 걸 자리를 보인다 (앞벽에 붙이기가 먼저면 보이지 않는다)
  const extra = v.kind === 'slide' && load.beltType === 'ratchet' && v.action.includes('더 거세요') && v.extraBelts !== null && v.extraBelts >= 1 && v.extraBelts <= 2 && mode === 'park' ? v.extraBelts : 0
  if (extra) slots.splice(Math.ceil(n / 2), 0, ...Array.from({ length: extra }, () => ({ hint: true as const })))
  const belts: BeltMark[] = []
  const tags: StageTag[] = []
  let hintAt = -1
  slots.forEach((sl, idx) => {
    if ('hint' in sl) {
      belts.push({ tone: 'orange', hint: true })
      if (hintAt < 0) hintAt = idx
      return
    }
    const t = v.tensions[sl.real]
    const s = t?.sensor ?? null
    if (fresh && s && t?.measured && strapSensors) {
      const st = beltState(t.n, v.perBeltNeedN, !!alert?.loose[s], !!alert && alert.kind !== 'check')
      belts.push({ tone: st.tone })
      if (mode === 'park') tags.push({ id: s, text: `${BAR_NAME[s]} · ${st.word} ${fmtN(t.n)} N`, tone: st.tone, icon: st.tone === 'red' ? 'loose' : 'belt', at: { kind: 'belt', index: idx }, side: s === 'c1' ? 'right' : 'left' })
      else tags.push({ id: s, text: `${BAR_NAME[s]} 장력 · ${fmtN(t.n)} N`, tone: st.tone, icon: 'gauge', at: { kind: 'sensor', which: s } })
    } else {
      belts.push({ tone: 'neutral' })
      if (mode === 'kit' && s && strapSensors) tags.push({ id: s, text: `${BAR_NAME[s]} 장력 · ${kit.mode === 'off' ? '없음' : '끊김'}`, tone: 'neutral', icon: 'gauge', at: { kind: 'sensor', which: s } })
    }
  })
  if (hintAt >= 0) tags.push({ id: 'hint', text: extra === 1 ? '여기에 바 하나 더' : '여기에 바 둘 더', tone: 'orange', icon: 'plus', at: { kind: 'belt', index: hintAt }, side: 'right' })

  const movedMm = pose && onBed ? Math.hypot(pose.x, pose.z) * 1000 : 0
  const dir = pose ? dirOf(pose.x * 1000, pose.z * 1000) : null
  // 정차 화면에서는 사건을 이미 다뤘거나(다시 묶기 뒤) 작은 움직임이라 주황. 센서 키트 보기는 30 mm 넘으면 빨강
  const shiftTone = mode === 'kit' && movedMm >= SHIFT_MOVED_MM ? 'red' : 'orange'
  if (mode === 'kit') {
    const text = !kitOn ? '짐 태그 · 없음' : !onBed ? '짐 태그 · 떨어짐' : movedMm >= 5 ? '짐 태그 · ' + shiftWords(movedMm, dir) : '짐 태그 · 제자리'
    tags.push({ id: 'tag', text, tone: !kitOn ? 'neutral' : !onBed ? 'red' : movedMm >= 20 ? shiftTone : 'neutral', icon: 'tag', at: { kind: 'sensor', which: 'tag' } })
  } else if (!onBed) {
    tags.unshift({ id: 'fall', text: '떨어짐', tone: 'neutral', icon: 'fall', at: { kind: 'start' } })
  } else if (movedMm >= 20) {
    tags.push({ id: 'shift', text: shiftWords(movedMm, dir) ?? '', tone: shiftTone, icon: 'move', at: { kind: 'arrow' } })
  }
  return {
    input: { ...base, belts, shift: null, pose, fallen: !onBed, lost: false, ghost: true, focus: false, tags, arrowTone: shiftTone },
    name: mode === 'kit' ? kitName(kit) : baseName,
  }
}
