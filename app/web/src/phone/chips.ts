/**
 * 폰 3D 무대의 정보 칩 (§11.5-4 · §11.7). 장면(three/bed-scene)은 작은 무대에서 상태 칩 하나 + 정보 칩을 합쳐 둘까지 그린다:
 *   고요한 정차 (사건 없음) : 고른 짐 테두리 + [상태 칩 1 + 짐 칩] 또는 [짐 칩 + 벨트 칩]
 *   사건 (다시 묶기 그림)   : 테두리 없음. 흐린 상자가 보이면 [상태 칩 1 + '출발 때 자리'], 아니면 짐 칩
 * 값은 화면이 이미 가진 것만 (three/bed-input 의 infoChips: 짐 이름 · 키 · 마찰, 벨트 종류 · 장력).
 */
import type { LoadInput, LoadVerdict } from '@/engine/limit'
import { infoChips } from '@/three/bed-input'
import type { BedInput, StageTag } from '@/three/bed-scene'

const START_CHIP: StageTag = { id: 'i-start', text: '출발 때 자리', title: '출발 때 자리', rows: [], tone: 'neutral', at: { kind: 'start' } }

/** 흐린 상자(출발 때 자리)가 지금 짐과 따로 보이는가: 2 cm 넘게 옮겨 갔을 때만 */
function ghostShown(i: BedInput) {
  if (!i.ghost || i.lost || i.empty) return false
  const s = i.pose ?? i.shift
  return !!s && Math.hypot(s.x, s.z) >= 0.02
}

/**
 * 폰 무대(390 x 280 안팎)는 좁다: 벨트 칩은 한 줄 [점 · 이름 … 값] 로 줄인다 (두 줄 칩 둘은 적재함 모서리를 덮는다).
 * 이름이 무엇의 값인지 말한다: '장력 · 추정' · '장력 · 키트' · '고무바·로프'
 */
function slim(t: StageTag): StageTag {
  const r = t.rows?.[0]
  if (t.id !== 'i-belt' || !r) return t
  const title = r.k || t.title || t.text
  return { ...t, text: title, title, rows: [{ k: '', v: r.v }] }
}

/**
 * 짐 칩도 한 줄로 ('박스 키 … 0.8 m'): 상태 칩이 있고 짐이 적재함 가운데 (앞벽에 안 붙음) 면 왼쪽 위 빈 바닥을 상태 칩이 쓰므로
 * 두 줄 칩은 옆문 · 바닥을 덮는다
 */
function slimCargo(t: StageTag): StageTag {
  const r = t.rows?.[0]
  if (t.id !== 'i-cargo' || !r) return t
  const title = (t.title ?? t.text) + ' ' + r.k
  return { ...t, text: title, title, rows: [{ k: '', v: r.v }] }
}

/**
 * calm: 사건이 없는 정차 그림 (고른 짐 테두리를 그린다). chips = false 면 테두리만 (위에서 보기: 적재함이 무대를 가득 채워 칩을 둘 빈 바닥이 없다).
 * 칩은 장면이 둘까지 그린다 (상태 칩 1 + 정보 칩 1, 상태 칩이 없으면 정보 칩 둘):
 *   흐린 상자가 보이면 '출발 때 자리' 가 먼저 (흐린 상자가 무엇인지 말하는 글은 이 칩뿐이다, §11.6)
 */
export function withChips(input: BedInput, v: LoadVerdict | null, load: LoadInput | null, calm: boolean, chips = true): BedInput {
  if (input.empty || !v || !load) return input
  const base = calm ? { ...input, rim: true } : input
  if (!chips || input.lost) return base
  const tags = input.tags ?? []
  if (ghostShown(input)) return { ...base, tags: [...tags, START_CHIP] }
  const info = infoChips(input, v, load)
  // '여기에 바 하나 더' 는 버클 쪽 (오른쪽 아래) 에 앉으므로 왼쪽 위는 비어 있다
  const tight = tags.some((t) => !t.title && t.id !== 'hint') && !input.frontWall
  // 사건 그림에서는 짐 칩 하나만 (벨트는 문제 띠 · 순서가 말한다)
  const list = (calm ? info : info.slice(0, 1)).map((t) => (tight ? slimCargo(t) : t)).map(slim)
  return { ...base, tags: [...tags, ...list] }
}

/**
 * 센서 키트 보기: 잰 값 꼬리표 ('앞 · 뒤 바 장력 · 1,250 N' · '짐 태그 · 제자리') 를 한 줄 정보 칩 [점 · 이름 … 값] 으로 (내비와 같은 규칙).
 * 문제(주황 · 빨강)는 상태 칩 그대로
 */
export function kitChips(input: BedInput): BedInput {
  const tags = input.tags ?? []
  if (!tags.length) return input
  return {
    ...input,
    tags: tags.map((t) => {
      if (t.title || t.tone === 'red' || t.tone === 'orange') return t
      const cut = t.text.indexOf(' · ', t.text.startsWith('앞 · 뒤') ? 6 : 0)
      return cut < 0 ? t : { ...t, title: t.text.slice(0, cut), rows: [{ k: '', v: t.text.slice(cut + 3) }] }
    }),
  }
}
