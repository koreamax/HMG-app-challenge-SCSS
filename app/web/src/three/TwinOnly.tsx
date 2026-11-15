/**
 * 트윈만 찍기 (design/DESIGN_SPEC.md §11.9): 기획서용 짐 종류별 그림. 적재함 3D 하나만 창 가득, 단추 · 판 · 지표 · 알림 · 글 없음.
 *   ?app=twin&cargo=<pallet|appliance|furniture|material|box>&view=<3d|top|kit>&theme=<night|day>
 *            [&mass=<kg>][&belts=<n>][&belt=<ratchet|rubber>][&wall=<0|1>][&chips=<0|1>][&rim=<0|1>][&grid=<0|1>]
 * 벨트는 모두 중립 (흑연 띠): 문제 색 · 더 걸 자리 · 화살 · 흐린 상자 없음. 런타임은 시작하지 않는다 (판정 계산만 빌려 쓴다).
 * 첫 그림이 나오고 글꼴이 준비되고 새 짐 올라오기가 끝나면 document.documentElement.dataset.twinReady = '1'
 */
import { useMemo } from 'react'
import { PICKABLE, type CargoKind } from '@/engine/cargo'
import type { BeltType, LoadInput } from '@/engine/limit'
import { verdictFor, type KitView } from '@/runtime/runtime'
import BedView from './BedView'
import { infoChips, stageInput } from './bed-input'
import type { BedInput } from './bed-scene'

const DEFAULTS: Record<CargoKind, { massKg: number; belts: number; frontWall: boolean }> = {
  pallet: { massKg: 500, belts: 4, frontWall: true },
  appliance: { massKg: 300, belts: 2, frontWall: false },
  furniture: { massKg: 300, belts: 3, frontWall: true },
  material: { massKg: 700, belts: 3, frontWall: true },
  box: { massKg: 300, belts: 3, frontWall: false },
}
/** 카메라 맞춤은 짐 다섯의 자리 전체에 잠근다: 짐 종류별 그림을 나란히 놓아도 적재함 크기 · 자리가 같다 (키 큰 가전에 맞춘 거리) */
const FIT_ALL = PICKABLE.map((kind) => ({ kind, frontWall: DEFAULTS[kind].frontWall }))
const KIT_OFF: KitView = { mode: 'off', fresh: false, snap: null, ageS: null, runLabel: null, feedError: null }

function readQuery() {
  const q = new URLSearchParams(typeof location !== 'undefined' ? location.search : '')
  const c = q.get('cargo')
  const kind: CargoKind = (PICKABLE as string[]).includes(c ?? '') ? (c as CargoKind) : 'box'
  const d = DEFAULTS[kind]
  const num = (k: string, fallback: number, lo: number, hi: number) => {
    const raw = q.get(k)
    const v = raw === null || raw === '' ? NaN : Number(raw)
    return Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : fallback
  }
  const flag = (k: string, fallback: boolean) => (q.has(k) ? q.get(k) !== '0' : fallback)
  const v = q.get('view')
  const beltType: BeltType = q.get('belt') === 'rubber' ? 'rubber' : 'ratchet'
  const load: LoadInput = { kind, massKg: num('mass', d.massKg, 1, 2000), belts: Math.round(num('belts', d.belts, 0, 8)), beltType, frontWall: flag('wall', d.frontWall) }
  return {
    load,
    view: v === 'top' ? ('top' as const) : v === 'kit' ? ('kit' as const) : ('3d' as const),
    night: q.get('theme') !== 'day',
    chips: flag('chips', false),
    rim: flag('rim', false),
    grid: flag('grid', true),
  }
}

export default function TwinOnly() {
  const o = useMemo(readQuery, [])
  const input = useMemo<BedInput>(() => {
    const v = verdictFor(o.load)
    const base = stageInput({ load: o.load, verdict: v, kit: KIT_OFF, alert: null, mode: o.view === 'kit' ? 'kit' : 'park' }).input
    // 벨트는 모두 중립, 더 걸 자리 · 화살 · 흐린 상자 · 상태 칩 없음
    const clean: BedInput = { ...base, belts: base.belts.filter((b) => !b.hint).map(() => ({ tone: 'neutral' as const })), shift: null, pose: null, ghost: false, focus: false, rim: o.rim, tags: [] }
    return o.chips ? { ...clean, tags: infoChips(clean, v, o.load) } : clean
  }, [o])
  const ready = () => {
    const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
    const done = () => window.setTimeout(() => (document.documentElement.dataset.twinReady = '1'), still ? 400 : 2600)
    if (document.fonts?.ready) document.fonts.ready.then(done, done)
    else done()
  }
  return (
    <div className="jj twin" data-theme={o.night ? 'night' : undefined} data-view={o.view}>
      <BedView input={input} view={o.view === 'top' ? 'top' : '3d'} interactive={false} size="lg" grid={o.grid} fitKinds={FIT_ALL} onShown={ready} />
    </div>
  )
}
