/**
 * PV5 오픈베드 적재함 3D 디지털 트윈 (three.js). 차는 그리지 않고 적재함만 그린다 (바닥 · 옆문 · 뒷문 · 앞 보호 틀 · 고리).
 * 겉모습은 Omniverse 사진(IsaacTwin results/hero_bed)을 따른다: 같은 질감 그림(public/twin/tex: 크라프트 · 옆면 인쇄 · 운송장 ·
 * 테이프 · 웨빙, 512 px 이하)을 쓴다. 그림이 오기 전에는 코드로 그린 크라프트로 먼저 보이고, 온 뒤 다시 그린다.
 * 무대 규칙 (design/DESIGN_SPEC.md §10.6 "Obsidian Studio" — 검은 스튜디오 위의 적재함):
 *   캔버스는 투명, 무대 칸(bed.css)이 --stage-glow → --bg 방사 그라데이션으로 칠한다 (경계 · 사각형 없음).
 *   장면 바닥 = 그림자만 받는 판(--stage-shadow 0.75, bed.css) + 적재함 밑 구운 닿는 그림자 (바닥 1.2 배) + 짐 밑 닿는 그림자
 *   + 짐 하나하나 밑 AO. 바닥 반사 없음 (거꾸로 비친 적재함이 '유령'처럼 읽혔다).
 *   빛 = 사진과 같은 스튜디오: 거의 바로 위에서 내리는 부드러운 주광(그림자) + 뒤(앞 왼쪽)에서 오는 찬 테두리 빛 + 옆(왼쪽)에서 오는 따뜻한
 *   테두리 빛 + 아주 옅은 반구광. 반사 = 검은 스튜디오 + 소프트박스 띠 둘 + 옅은 천장 판 (studioEnvironment, PMREM). ACES 톤 매핑.
 *   적재함: 연마 알루미늄 옆문 (금속 1 · 거칠기 0.22: 소프트박스가 넓은 밝은 줄 · 어두운 줄로 비친다) · 둥근 관 윗 덮개 (반지름 25 mm,
 *   거칠기 0.12: 빛 줄 하나) · 어두운 강판 바닥 · 강관 앞 틀.
 *   짐 상자: 크라프트 + 모서리 6 ~ 8 mm 둥글게 + 윗면 가운데 이음 + 테이프 띠 (윗면 · 앞뒤 면 끝) + 뒷면(+Z) 운송장 + 옆면 인쇄,
 *   상자마다 색이 조금씩 다르다. 상자 면은 그림 한 장(아틀라스)에 모아 짐 하나를 한 번에 그린다.
 *   담요 = 마름모 누빔 이사 담요 (법선 · 거칠기 0.95 · 천 sheen, 칸 18 cm). 자재 = 크라프트 종이 포대 (둥근 베개 모양 · 꿰맨 끝).
 *   벨트: 웨빙 질감 띠 + 강철 라쳇 버클 · 갈고리. 색은 문제 벨트(주황 · 빨강)만, 나머지는 흑연 웨빙.
 *   띠 길 = 갈고리 -> 짐 옆면 아래 -> 옆면 따라 위로 -> 모서리 보호대 위로 모서리를 감아 -> 윗면 (짐 겉면에서 2.5 cm).
 *   꼬리표는 하나 (가장 급한 것) + 순서 배지. 배지는 띠에서 짧은 줄기만큼 떨어져 있고, 줄기 끝 점이 버클에 닿는다.
 *   꼬리표 = --surface-soft 어두운 알약 + 상태 점, 1.5px 상태 색 끌어 선 끝에 8px 점. 순서 배지 = --select 동그라미 + --ink 숫자.
 *   출발 때 자리 = 적재함 안쪽으로 자른 부드러운 반투명 면 (바닥 발자국 + 아래가 진하고 위로 사라지는 몸통, 모서리 선 없음).
 *   앞 = 바닥 위 납작한 V 둘 (--muted 50 %) + '앞' (--muted).
 *   '우와' 는 정차 화면만: 처음 480 ms 검정에서 밝아짐 + 1.2 s 다가오기 · 빛 띠가 적재함을 쓸고 지나감 3 번 · 문제 벨트 숨쉬기 5 번.
 *   모두 끝이 있고, 끝나면 그리기 고리도 멈춘다 (값이 바뀔 때만 다시 그린다). 주행 중 · 움직임 줄이기면 모두 멈춘다.
 *   빛 (2026-11-14 b): 진짜 하늘 HDR(public/twin/env, 256 x 128 흐림)을 검은 스튜디오에 얹어 PMREM · 비등방 알루미늄 · 투명 막 가장자리 빛 ·
 *   테이프 투명 막 · 공단 웨빙 sheen · PCSS 같은 그림자 · 반 해상도 GTAO · ACES + 옅은 S 곡선 + 비네트 (마지막 그림 한 장).
 *   꼬리표는 짐 윤곽(화면에 비친 짐 상자의 볼록 껍질) 밖, 기준점에서 가장 가까운 빈 쪽에 두고
 *   끌어 선은 짧게 (내비 80 px · 폰 48 px 까지), 짐 위를 가로지르지 않게 한다.
 *   더 걸 자리 = 불투명한 주황 띠 (반투명 유령 띠 아님. 정차 중 1.5 s 로 자체 빛만 숨쉰다. 꼬리표가 그 띠에 붙는다).
 *   순서 배지는 번호 하나에 하나 (같은 번호 벨트가 여럿이면 가운데에 두고 벨트마다 가는 선 + 8px 점).
 * 좌표 (m, Y 위): X 오른쪽, Z 뒤(+Z), 앞 = -Z. 적재함 바닥 윗면 가운데가 원점.
 * 시점: 뒤 오른쪽 3/4 (높이 22°, fov 27). 적재함은 '보이는 무대'(무대 칸이 잘라 보이는 곳, 이름표 · 위쪽 앱 글 아래) 폭의 75 % 쯤,
 *   가로는 가운데, 세로는 아래로 앉힌다 (가장 아래 점이 보이는 무대 92.5 %, 단 적재함 가운데는 60 % 까지만: 렌즈 이동, 시점 각도는 그대로).
 *   화면에서 앞 = 오른쪽. 위에서 보기는 직교 투영.
 *   맞추는 범위 = 적재함 (밑 틀 ~ 앞 보호 틀 위) + 짐 (기울어도) + 출발 때 자리 + 벨트 기준점. 모든 모드 같다.
 *   아주 넓은 무대(가로:세로 2.5 넘게)는 더 낮고 옆에서 본다 (높이가 먼저 차므로 잘리는 곳 없이 높이에 맞춘다).
 * 짐 자세는 키트 값 그대로 (출발 때 자리에서 옮긴 x · z, 들림, 기울기). 적재함을 벗어나면 짐을 숨긴다.
 * 정차 중에만 그린다. 값이 바뀌거나 돌릴 때만 다시 그린다. 그림자 지도는 짐 · 벨트가 바뀔 때만 다시 계산한다.
 * 성능 (내비 헤드 유닛): 움직이지 않는 적재함 부품 · 벨트 부품은 재료마다 한 덩어리로 합쳐 그린다 (그리기 약 40 번).
 *   화면 배율 상한 내비 1.5 · 폰 2. 후처리는 그릴 때만 (AO 반 해상도 + 마지막 그림 한 장). 그림이 느리면(가운데 값 34 ms 넘게)
 *   그림자 지도 1024 + 이어 그리는 동안 AO 빼기 (멈추면 AO 와 함께 한 번 더).
 * 폰(작은 무대, data-size="sm")은 꼬리표 하나 + 화살만: 순서 배지는 화면의 순서 목록이 말한다.
 */
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js'
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js'
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js'
import { BED } from '@/engine/constants'
import { CARGO, type CargoKind } from '@/engine/cargo'
import type { Tone } from '@/engine/limit'

/** 상태 넷 + 중립 (센서 없는 벨트 · 값만 보이는 꼬리표) */
export type MarkTone = Tone | 'neutral'
/** 벨트 하나. hint = 더 걸 자리 (점선 띠). loose = 처진 띠로 그린다 (없으면 빨강 = 풀림) */
export type BeltMark = { tone: MarkTone; label?: string | null; badge?: number | null; hint?: boolean; loose?: boolean }
/** 예전 꼬리표 아이콘 이름 (v4 꼬리표는 아이콘 없이 상태 점만 그린다. 입력 호환으로 남긴다) */
export type TagIcon = 'belt' | 'loose' | 'move' | 'alert' | 'gauge' | 'tag' | 'check' | 'plus' | 'fall'
export type TagAnchor =
  | { kind: 'belt'; index: number }
  | { kind: 'cargo' }
  | { kind: 'start' }
  | { kind: 'arrow' }
  | { kind: 'sensor'; which: 'c1' | 'c2' | 'tag' }
export type StageTag = { id: string; text: string; tone: MarkTone; icon?: TagIcon; at: TagAnchor; side?: 'left' | 'right' }
/** 키트가 잰 짐 자세: 출발 때 자리에서 옮김 (m, x 오른쪽 + · z 뒤 +), 들림 (m), 기울기 (도) */
export type BedPose = { x: number; z: number; lift: number; tilt: number }

export type BedInput = {
  kind: CargoKind
  belts: BeltMark[]
  beltType: 'ratchet' | 'rubber'
  frontWall: boolean
  /** 출발 때 자리에서 짐이 움직인 거리 (m). z 음수 = 앞. pose 가 있으면 pose 를 쓴다 */
  shift: { x: number; z: number } | null
  shiftLabel?: string | null
  lost: boolean
  /** 출발 때 자리 (흐린 상자) */
  ghost: boolean
  /** 다시 묶기: 짐 가까이 본다 */
  focus?: boolean
  // ── 아래는 모두 선택 ──
  /** 상차 정보 없음: 빈 적재함 */
  empty?: boolean
  /** 키트가 잰 지금 자세 (있으면 shift 대신) */
  pose?: BedPose | null
  /** 짐이 적재함을 벗어남 (키트 태그) */
  fallen?: boolean
  /** 꼬리표를 직접 준다 (없으면 벨트 label · shiftLabel · lost 로 만든다) */
  tags?: StageTag[] | null
  /** 화살 색 (기본 빨강) */
  arrowTone?: Tone
  /** 키트 센서 그리기: 앞 끝 · 뒤 끝 벨트의 장력 센서, 짐 태그 */
  sensors?: { c1: boolean; c2: boolean; tag: boolean } | null
}

export type BedView = '3d' | 'top'

export type BedHandle = {
  update: (i: BedInput) => void
  setView: (v: BedView) => void
  /** 위쪽에 비워 둘 높이 (px, 이름표) */
  setReserveTop: (px: number) => void
  /** 운송장 번호 (바뀌면 새 짐이 올라오는 모습을 다시 보인다). 모르면 null */
  setLoadId: (id: string | null) => void
  dispose: () => void
}

/** 벨트 띠 색: 보통 벨트는 흑연 웨빙, 문제 벨트(주황 · 빨강)만 상태 색 (--alert · --bad) */
const WEBBING = 0x25282c
/** 문제 벨트 띠 색 = 상태 색. 자체 빛 0.25 를 같은 색으로 더한다 */
const WEB_HEX = { orange: 0xff9640, red: 0xff5a52 } as const
/** 띠의 바탕 색은 상태 색보다 한 단 진하게 (짜임 띠가 주광을 받아 밝아지므로: 크림색으로 바래지 않게). 빛은 상태 색 그대로 */
const WEB_BASE = { orange: 0xd9601a, red: 0xd63a32 } as const
const PROBLEM_GLOW = 0.25

const L = BED.l
const W = BED.w
const GAP_NO_WALL = 0.35
/** 한 화면에 꼬리표 하나 (가장 급한 것) + 순서 배지 */
const MAX_TAGS = 1
/** 질감 그림 자리 (public/twin/tex) */
const TEX_URL = (import.meta.env?.BASE_URL ?? '/') + 'twin/tex/'
const SVG_NS = 'http://www.w3.org/2000/svg'
/** 바닥 밑 틀 높이 (m): 적재함 높이(바닥 판 5 cm + 옆문 + 윗 덮개 ≈ 45 cm)의 10 % 이하 */
const UNDER_H = 0.036
/** 바닥 (스튜디오 바닥 = 그림자만 받는 면). 적재함 밑 틀 아래 끝에 닿는다 */
const GROUND_Y = -0.05 - UNDER_H - 0.001
/** 볼 범위: 적재함 (바닥 밑 틀 ~ 앞 보호 틀 위, 앞 보호 틀 ~ 뒷문). 위에서 보기도 같은 범위 */
const BED_ROI = new THREE.Box3(new THREE.Vector3(-W / 2 - 0.06, GROUND_Y, -L / 2 - 0.07), new THREE.Vector3(W / 2 + 0.06, BED.wallH + 0.03, L / 2 + 0.06))
/** 적재함의 실제 모양 꼭짓점 (몸통: 밑 틀 ~ 윗 덮개, 앞 보호 틀: 바닥 ~ 맨 위). 카메라 맞춤에 쓴다 */
const boxPts = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) => {
  const out: THREE.Vector3[] = []
  for (const x of [x0, x1]) for (const y of [y0, y1]) for (const z of [z0, z1]) out.push(new THREE.Vector3(x, y, z))
  return out
}
const BED_PTS = [
  ...boxPts(-W / 2 - 0.06, GROUND_Y, -L / 2 - 0.07, W / 2 + 0.06, BED.sideH + 0.05, L / 2 + 0.06),
  ...boxPts(-W / 2 - 0.04, 0, -L / 2 - 0.065, W / 2 + 0.04, BED.wallH + 0.03, -L / 2),
]
/** 장면 바닥에 붙은 것(그림자 · 접지 그림자 · 꺾쇠 · 유령 상자)은 이 층에 둔다 (두 카메라 모두 본다) */
const FLOOR_LAYER = 1
/** 벨트 갈고리를 거는 고리: 양옆 바닥, 25 cm 마다 */
const HOOK_X = W / 2 - 0.05
const RING_Z = Array.from({ length: 9 }, (_, i) => -1.0 + i * 0.25)
/** '앞' 글을 둘 곳 (바닥 꺾쇠를 둘 자리가 없을 때): 앞 보호 틀 위 가운데 */
const FRONT_TOP = new THREE.Vector3(0, BED.wallH + 0.06, -L / 2 - 0.03)
/** 시점: 뒤 오른쪽 3/4, 높이 22° (방위 52°, Omniverse 사진의 18 ~ 22°). 내비 · 폰 · 시연 무대 모두 같다 */
const EL = 22
const AZ = 52
/**
 * 가로로 긴 무대 (폰 무대 · 내비 낮은 창): 가로:세로 1.6 → 2.5 에서 높이 22° → 15°, 방위 52° → 58°.
 * 아주 넓은 무대 (2.5 → 3.6): 15° → 11°, 58° → 66° (더 옆에서, 낮게). 높이가 먼저 차는 무대에서 적재함이 작아지지 않게
 */
const MID_A0 = 1.6
const WIDE_A0 = 2.5
const WIDE_A1 = 3.6
const wideK = (aspect: number) => THREE.MathUtils.clamp((aspect - WIDE_A0) / (WIDE_A1 - WIDE_A0), 0, 1)
function dir3d(aspect: number) {
  const km = THREE.MathUtils.smoothstep(aspect, MID_A0, WIDE_A0)
  const kw = wideK(aspect)
  // 낮게 볼수록 바닥 깊이가 세로를 덜 먹어 적재함이 커진다 (12° 아래로는 바닥 위 짐 자리가 안 읽힌다)
  const el = THREE.MathUtils.degToRad(THREE.MathUtils.lerp(THREE.MathUtils.lerp(EL, 15, km), 11, kw))
  const az = THREE.MathUtils.degToRad(THREE.MathUtils.lerp(THREE.MathUtils.lerp(AZ, 58, km), 66, kw))
  return new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).normalize()
}
/** 위에서: 화면 오른쪽 = 앞 (3D 와 같은 쪽), 화면 위 = 왼쪽(-X) */
const DIR_TOP = new THREE.Vector3(0.0001, 1, 0).normalize()
/** 적재함이 무대 폭에서 차지하는 몫 · 높이에서 차지하는 몫 (넘치면 작은 쪽에 맞춘다) */
const FILL_W = 0.75
const FILL_H = 0.82
/** 네 변 8 % 여백 = 화면의 84 % */
const FILL_PAD = 0.84
/** 짐 단면 위 모서리 반지름 (m): 벨트가 이 둥근 모서리를 띄워서 돈다 */
const CORNER_R: Record<CargoKind, number> = { box: 0.008, appliance: 0.02, furniture: 0.022, material: 0.03, pallet: 0.03 }
/** 출발 때 자리 (흐린 상자) 는 적재함 옆문 윗 덮개 높이까지만 (키 큰 짐도 공중에 높은 유리 상자가 서지 않게) */
const GHOST_MAX_H = BED.sideH + 0.06

/** 환경 빛 그림 (public/twin/env): kloofendal 하늘 HDR 을 256 x 128 로 줄이고 흐리게 한 것 (studio_sky_256.hdr, 100 KB) */
const ENV_URL = (import.meta.env?.BASE_URL ?? '/') + 'twin/env/studio_sky_256.hdr'

/**
 * PCSS 같은 부드러운 그림자 (BasicShadowMap 의 getShadow 를 바꾼다: 깊이 그대로 읽는 그림자 지도).
 *   가린 것 찾기 12 번 → 가린 것과 받는 면 사이 거리로 번짐 반지름을 정한다 (닿는 곳은 또렷, 멀수록 넓게) → 16 번 비교.
 *   shadowRadius = 가장 넓은 번짐 (그림자 지도 칸). 주광 그림자 하나만 이것을 쓴다 (빛이 거의 바로 위라 깊이 1 = 13 m)
 */
let pcssReady: boolean | null = null
function installPcss() {
  if (pcssReady !== null) return pcssReady
  const src = THREE.ShaderChunk.shadowmap_pars_fragment
  // 이미 바꾼 조각 (개발 서버가 이 파일만 다시 읽을 때 three 는 그대로): 두 번 넣지 않는다
  if (src.includes('pcssIgn(')) return (pcssReady = true)
  // getShadow( sampler2D ...) 는 VSM · BASIC 둘: 마지막 것이 BASIC (빌드된 three 는 GLSL 주석이 없다)
  const f = src.lastIndexOf('float getShadow( sampler2D shadowMap')
  const a = src.indexOf('SHADOWMAP_TYPE_VSM')
  if (a < 0 || f < a) return (pcssReady = false)
  const endMark = 'return mix( 1.0, shadow, shadowIntensity );'
  const e = f < 0 ? -1 : src.indexOf(endMark, f)
  const close = e < 0 ? -1 : src.indexOf('}', e + endMark.length)
  if (close < 0) return (pcssReady = false)
  const pcss = /* glsl */ `
		float pcssIgn( vec2 p ) { return fract( 52.9829189 * fract( dot( p, vec2( 0.06711056, 0.00583715 ) ) ) ); }
		vec2 pcssVogel( int i, int n, float phi ) {
			float r = sqrt( ( float( i ) + 0.5 ) / float( n ) );
			float t = float( i ) * 2.399963229728653 + phi;
			return vec2( cos( t ), sin( t ) ) * r;
		}
		float getShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {
			float shadow = 1.0;
			shadowCoord.xyz /= shadowCoord.w;
			shadowCoord.z += shadowBias;
			bool inFrustum = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0;
			if ( inFrustum && shadowCoord.z <= 1.0 ) {
				vec2 texel = vec2( 1.0 ) / shadowMapSize;
				float phi = pcssIgn( gl_FragCoord.xy ) * PI2;
				float maxR = shadowRadius * texel.x;
				float blk = 0.0;
				float nb = 0.0;
				for ( int i = 0; i < 12; i ++ ) {
					float d = texture2D( shadowMap, shadowCoord.xy + pcssVogel( i, 12, phi ) * maxR ).r;
					if ( d < shadowCoord.z ) { blk += d; nb += 1.0; }
				}
				if ( nb > 0.0 ) {
					blk /= nb;
					// 깊이 차 0.06 (≈ 80 cm) 에서 가장 넓게. 닿는 곳(차 0)은 1.2 칸
					float pen = clamp( ( shadowCoord.z - blk ) / 0.06, 0.0, 1.0 );
					float r = mix( 1.2 * texel.x, maxR, pen );
					float s = 0.0;
					for ( int i = 0; i < 16; i ++ ) s += step( shadowCoord.z, texture2D( shadowMap, shadowCoord.xy + pcssVogel( i, 16, phi + 1.7 ) * r ).r );
					shadow = s / 16.0;
				}
			}
			return mix( 1.0, shadow, shadowIntensity );
		}
`
  THREE.ShaderChunk.shadowmap_pars_fragment = src.slice(0, f) + pcss + src.slice(close + 1)
  return (pcssReady = true)
}

/**
 * 마지막 그림 (화면): HDR 장면 x AO (반 해상도 GTAO, 이중 선형으로 키움) → ACES → sRGB → 옅은 S 곡선 (대비) → 옅은 비네트.
 *   캔버스는 투명 (premultiplied): 반투명 가장자리는 색을 풀었다가 다시 곱한다. 비네트 = 검정 막을 가장자리에만 얹는다 (무대 바탕까지 같이)
 */
const GRADE_VS = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4( position.xy, 0.0, 1.0 ); }
`
const GRADE_FS = /* glsl */ `
uniform sampler2D tScene;
uniform sampler2D tAo;
uniform float uAo;
uniform float uExposure;
uniform float uContrast;
uniform float uVignette;
uniform vec2 uAspect;
varying vec2 vUv;
vec3 rrtOdt( vec3 v ) {
	vec3 a = v * ( v + 0.0245786 ) - 0.000090537;
	vec3 b = v * ( 0.983729 * v + 0.4329510 ) + 0.238081;
	return a / b;
}
vec3 aces( vec3 c ) {
	const mat3 IN = mat3( vec3( 0.59719, 0.07600, 0.02840 ), vec3( 0.35458, 0.90834, 0.13383 ), vec3( 0.04823, 0.01566, 0.83777 ) );
	const mat3 OUT = mat3( vec3( 1.60475, -0.10208, -0.00327 ), vec3( -0.53108, 1.10813, -0.07276 ), vec3( -0.07367, -0.00605, 1.07602 ) );
	c *= uExposure / 0.6;
	c = OUT * rrtOdt( IN * c );
	return clamp( c, 0.0, 1.0 );
}
vec3 srgb( vec3 c ) { return mix( c * 12.92, 1.055 * pow( c, vec3( 1.0 / 2.4 ) ) - 0.055, step( 0.0031308, c ) ); }
void main() {
	vec4 s = texture2D( tScene, vUv );
	float ao = mix( 1.0, texture2D( tAo, vUv ).r, uAo );
	vec3 c = s.a > 0.0 ? s.rgb / s.a : vec3( 0.0 );
	c = srgb( aces( c * ao ) );
	// 옅은 S 곡선: 가운데 회색은 그대로, 어두운 쪽 · 밝은 쪽을 조금 더 벌린다
	vec3 sc = c * c * ( 3.0 - 2.0 * c );
	c = mix( c, sc, uContrast );
	vec2 q = ( vUv - 0.5 ) * uAspect;
	float v = uVignette * smoothstep( 0.24, 0.78, length( q ) );
	// 비네트는 그린 것(적재함 · 그림자)에만: 무대 바탕(CSS)은 그대로 (무대 칸 가장자리에 네모 경계가 생기지 않게)
	gl_FragColor = vec4( c * s.a * ( 1.0 - v ), s.a );
}
`

/** 화면 배율 (시연 무대처럼 CSS 로 줄인 판이면 그만큼). 상한 = 내비 1.5 · 폰 2 (§10.6 성능) */
function pixelRatio(host: HTMLElement, cap: number) {
  const r = host.getBoundingClientRect()
  const s = r.width / Math.max(1, host.clientWidth)
  return Math.min(cap, Math.max(1, s * (window.devicePixelRatio || 1)))
}

/**
 * 반사용 스튜디오 (Omniverse 사진의 검은 스튜디오): 거의 검은 방 + 세운 소프트박스 띠 둘 (앞 오른쪽 · 뒤 왼쪽, 낮게까지 내려온다)
 *   + 위에 옅은 천장 판 하나. 옆문 판에는 띠가 넓은 밝은 줄로, 그 사이는 어두운 줄로 비친다 (RoomEnvironment 는 고르게 밝아 회색 칠처럼 보였다).
 *   둥근 윗 덮개는 천장 판을 가는 빛 줄 하나로 비춘다.
 */
function studioEnvironment(hdr: THREE.Texture | null = null) {
  const s = new THREE.Scene()
  const sky = new THREE.SphereGeometry(20, 64, 48)
  const pos = sky.getAttribute('position') as THREE.BufferAttribute
  const col = new Float32Array(pos.count * 3)
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 20
    // (2026-11-15) 수평선 아래는 거의 검정 (검은 쇼룸 바닥): 세운 옆문 판은 수평선 아래 15 ~ 22° 를 비추므로 '어두운 거울'이 된다
    //   (예전 0.012 ~ 0.06 + 키 큰 소프트박스 둘 = 판 전체가 고른 밝은 회색 칠처럼 읽혔다). 수평선 위는 옅은 하늘 (HDR 이 오면 그 결)
    //   수평선 바로 아래 (0 ~ -30°)는 멀리 빛 웅덩이가 진 바닥처럼 옅게 밝다: 판 위쪽(얕게 비춘다)이 아래쪽보다 조금 밝다
    //   (높이 -6 ~ -35° 는 거의 고르게: 내비 넓은 창 · 폰처럼 낮게 볼 때 (11 ~ 15°) 도 22° 와 같은 어두운 판)
    const v = y < 0 ? 0.002 + 0.12 * THREE.MathUtils.smoothstep(y, -0.8, -0.1) + 0.2 * THREE.MathUtils.smoothstep(y, -0.1, 0) ** 2 : 0.035 + 0.06 * Math.sqrt(y)
    col[i * 3] = v
    col[i * 3 + 1] = v
    col[i * 3 + 2] = v * 1.06
  }
  sky.setAttribute('color', new THREE.BufferAttribute(col, 3))
  s.add(new THREE.Mesh(sky, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, map: hdr })))
  // 가로로 긴 소프트박스 하나 (수평선 바로 위를 한 바퀴 두르는 좁은 띠, 높이 약 0 ~ 6°): 둥근 윗 덮개 · 눌러 낸 골 · 강관은 휘어 있어
  //   어느 쪽에서 보아도 이 띠를 또렷한 빛 줄 하나로 비춘다. 판판한 판은 띠 아래 검은 바닥을 비춘다 (Omniverse 사진의 옆문)
  //   앞 오른쪽 · 뒤 왼쪽 (기본 시점에서 옆문 · 뒷문이 비추는 쪽)은 조금 더 밝게
  const ring = (y0: number, y1: number, i: number, a0: number, a1: number, tint = 0xffffff) => {
    const r = 18
    const g = new THREE.CylinderGeometry(r, r, (y1 - y0) * r, 96, 1, true, a0, a1 - a0)
    const m = new THREE.MeshBasicMaterial({ color: tint, side: THREE.DoubleSide })
    m.color.multiplyScalar(i)
    const o = new THREE.Mesh(g, m)
    o.position.y = ((y0 + y1) / 2) * r
    s.add(o)
  }
  ring(0.0, 0.1, 1.5, 0, Math.PI * 2, 0xfff8f0)
  // three 의 원기둥 각 0 = +Z, 시계 반대 (+X 쪽). 옆문 반사 = 앞 오른쪽 (방위 +X · -Z 약 128°), 뒷문 반사 = 뒤 왼쪽 (약 -52°)
  ring(0.015, 0.085, 3.4, THREE.MathUtils.degToRad(100), THREE.MathUtils.degToRad(160), 0xfff4e8)
  ring(0.015, 0.085, 2.2, THREE.MathUtils.degToRad(280), THREE.MathUtils.degToRad(340), 0xeef4ff)
  // 천장 판 (옅게): 윗 덮개 · 바닥 판에 가는 빛 줄, 짐 윗면에 고른 빛
  const top = new THREE.Mesh(new THREE.PlaneGeometry(4, 2.4), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffffff).multiplyScalar(1.8), side: THREE.DoubleSide }))
  top.position.set(-0.6, 6, 0.4)
  top.rotation.x = Math.PI / 2
  s.add(top)
  return s
}

export function cargoCenterZ(kind: CargoKind, frontWall: boolean) {
  const l = CARGO[kind].size.l
  return -L / 2 + (frontWall ? 0.02 : GAP_NO_WALL) + l / 2
}

/** 예전 입력 (벨트 label · shiftLabel · lost) 에서 꼬리표 만들기 */
function autoTags(i: BedInput): StageTag[] {
  const out: StageTag[] = []
  const n = i.belts.length
  i.belts.forEach((b, k) => {
    if (b.label) out.push({ id: 'b' + k, text: b.label, tone: b.tone, at: { kind: 'belt', index: k }, side: k < n / 2 ? 'right' : 'left' })
  })
  if (i.shiftLabel && !i.lost) out.push({ id: 'shift', text: i.shiftLabel, tone: i.arrowTone ?? 'red', at: { kind: 'arrow' } })
  if (i.lost) out.unshift({ id: 'lost', text: '짐 이탈 의심', tone: 'red', at: { kind: 'start' } })
  return out
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string)

export function initBedScene(host: HTMLElement, tagLayer: HTMLElement, opts: { interactive?: boolean; compact?: boolean } = {}): BedHandle {
  const interactive = opts.interactive ?? true
  const disposables: { dispose: () => void }[] = []
  const track = <T extends { dispose: () => void }>(o: T) => (disposables.push(o), o)

  const dprCap = opts.compact ? 2 : 1.5
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' })
  renderer.setClearColor(0x000000, 0)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.0
  renderer.shadowMap.enabled = true
  // PCSS 같은 그림자 (installPcss: 닿는 곳은 또렷, 멀수록 넓게 번진다). 바꿀 수 없으면 PCF + radius (고른 번짐)
  const pcss = installPcss()
  renderer.shadowMap.type = pcss ? THREE.BasicShadowMap : THREE.PCFShadowMap
  // 그림자 지도는 짐 · 벨트 · 앞 틀 그림자가 바뀔 때만 다시 계산한다 (shadowDirty)
  renderer.shadowMap.autoUpdate = false
  host.appendChild(renderer.domElement)
  // 처음 보일 때 검정(무대 바탕)에서 480 ms 에 걸쳐 밝아진다 (정차 · 움직임 허용일 때만, 아니면 바로)
  renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;outline:none;opacity:0'
  let shown = false
  let shadowDirty = true
  // 첫 그림 전 자리 그림 (포스터, public/twin/poster.jpg 흐린 적재함): 셰이더를 엮는 동안 (폰 SwiftShader 에서 수 초) 빈 무대가 아니게.
  //   첫 그림이 나오면 그 위로 캔버스가 밝아진다 (bed.css .bv-poster)
  const poster = document.createElement('div')
  poster.className = 'bv-poster'
  poster.style.backgroundImage = `url(${(import.meta.env?.BASE_URL ?? '/') + 'twin/poster.jpg'})`
  host.insertBefore(poster, renderer.domElement)
  // 꼬리표 층은 첫 그림 · 첫 자리 잡기 뒤에 보인다
  tagLayer.style.visibility = 'hidden'
  /** 셰이더를 미리 엮었는지 (compileAsync). 첫 그림은 이것을 1.5 s 까지 기다린다 (그리는 도중 멈춤 없이 한 번에) */
  let compiled = false

  const scene = new THREE.Scene()
  // 길고 낮은 렌즈 (사진처럼 fov 27°: 원근이 덜 과장되어 장난감처럼 보이지 않는다)
  const camera = new THREE.PerspectiveCamera(27, 1, 0.05, 80)
  /** 위에서 보기 (직교). 시점을 옮기는 동안은 원근 카메라로, 다 오면 이것으로 그린다 */
  const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.05, 80)
  ortho.up.set(-1, 0, 0)
  // 바닥에 붙은 것(FLOOR_LAYER)은 두 카메라 모두 본다
  camera.layers.enable(FLOOR_LAYER)
  ortho.layers.enable(FLOOR_LAYER)
  let active: THREE.Camera = camera
  // 방 반사: RoomEnvironment 를 PMREM 으로 (반사에만 · scene.background 없음 = 무대 바탕은 CSS).
  //   흰 방이라 세기를 낮게 둔다 (ENV_I): 금속은 방의 밝은 창 · 천장 빛을 비친 곳만 밝고, 나머지는 어둡다.
  //   방을 돌려 밝은 창이 왼쪽 뒤 위에 오게 한다 (옆문 · 윗 덮개에 길게 빛 줄이 선다)
  //   진짜 하늘 HDR (public/twin/env, 256 x 128 흐린 그림)이 오면 같은 스튜디오에 그 결을 얹어 PMREM 을 한 번 더 만든다 (applyHdrEnv)
  const bakeEnv = (hdr: THREE.Texture | null) => {
    const pm = new THREE.PMREMGenerator(renderer)
    const room = studioEnvironment(hdr)
    const rt = pm.fromScene(room, 0.02)
    room.traverse((o) => {
      const m = o as THREE.Mesh
      m.geometry?.dispose?.()
      const mm = m.material as THREE.Material | undefined
      mm?.dispose?.()
    })
    pm.dispose()
    return rt
  }
  let env = bakeEnv(null)
  const ENV_I = 1.0
  scene.environment = env.texture
  scene.environmentIntensity = ENV_I
  scene.environmentRotation.set(0, 0, 0)

  // 빛 (사진의 스튜디오): 위에서 내리는 부드러운 주광(그림자) + 아주 옅은 반구광 + 뒤(앞 왼쪽)에서 오는 찬 테두리 빛
  //   + 옆(왼쪽, 낮게)에서 오는 따뜻한 테두리 빛. 테두리 빛이 윗 덮개 · 짐 모서리 윤곽을 검은 바탕에서 띄운다
  const hemi = new THREE.HemisphereLight(0xe8ecf0, 0x101214, 0.32)
  scene.add(hemi)
  const key = new THREE.DirectionalLight(0xfff4e6, 2.3)
  // 거의 바로 위 (높이 약 83°, 조금 왼쪽 뒤): 그림자가 짐 · 적재함 바로 밑에 고인다 (오른쪽으로 번진 옅은 자국 없이)
  key.position.set(-0.9, 9.0, 0.6)
  key.castShadow = true
  key.shadow.mapSize.set(2048, 2048)
  Object.assign(key.shadow.camera, { left: -2.7, right: 2.7, top: 2.7, bottom: -2.7, near: 3, far: 16 })
  key.shadow.bias = -0.00025
  key.shadow.normalBias = 0.012
  // PCSS: 가장 넓은 번짐 22 칸 (≈ 6 cm, 앞 보호 틀 관처럼 높은 것의 그림자). 닿는 곳은 1.2 칸
  key.shadow.radius = pcss ? 22 : 6
  scene.add(key)
  // 찬 테두리 빛: 카메라(뒤 오른쪽) 반대편 = 앞 왼쪽 위에서
  const rim = new THREE.DirectionalLight(0xc6d8ff, 1.5)
  rim.position.set(-3.0, 3.6, -5.4)
  scene.add(rim)
  // 따뜻한 테두리 빛: 왼쪽 옆, 낮게 (짐 왼쪽 모서리 · 왼쪽 옆문 안쪽 · 윗 덮개에 호박색 빛 줄)
  const warm = new THREE.DirectionalLight(0xffc690, 1.0)
  warm.position.set(-5.6, 2.0, 1.2)
  scene.add(warm)

  // ── 재료 · 질감 (캔버스로 그린다. 상자 · 벨트는 사진과 같은 질감 그림을 캔버스에 얹는다. 무늬는 정해진 난수라 늘 같은 모습) ──
  const std = (color: number, metalness: number, roughness: number, extra: THREE.MeshStandardMaterialParameters = {}) =>
    track(new THREE.MeshStandardMaterial({ color, metalness, roughness, ...extra }))
  /** 사진 질감 그림 (public/twin/tex). 오기 전에는 null: 코드로 그린 크라프트 · 송장으로 먼저 보인다 */
  const IMG: Record<'kraft' | 'side' | 'waybill' | 'tape' | 'web', HTMLImageElement | null> = { kraft: null, side: null, waybill: null, tape: null, web: null }
  let redrawTimer = 0
  const loadImg = (k: keyof typeof IMG, file: string) => {
    const im = new Image()
    im.decoding = 'async'
    im.onload = () => {
      if (disposed) return
      IMG[k] = im
      clearTimeout(redrawTimer)
      redrawTimer = window.setTimeout(() => redrawPrinted(), 30)
    }
    im.src = TEX_URL + file
  }
  let seed = 20261114
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed / 4294967296
  }
  const maxAniso = Math.min(4, renderer.capabilities.getMaxAnisotropy())
  const canvasTex = (w: number, h: number, draw: (c: CanvasRenderingContext2D, w: number, h: number) => void, repeat = false, color = true) => {
    const cv = document.createElement('canvas')
    cv.width = w
    cv.height = h
    draw(cv.getContext('2d')!, w, h)
    const t = track(new THREE.CanvasTexture(cv))
    if (color) t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = maxAniso
    if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping
    return t
  }
  const fibres = (c: CanvasRenderingContext2D, w: number, h: number, n: number, rgb: string, a: number, len = 8) => {
    for (let i = 0; i < n; i++) {
      c.fillStyle = `rgba(${rgb},${(rnd() * a).toFixed(3)})`
      c.fillRect(rnd() * w, rnd() * h, 1 + rnd() * len, 1)
    }
  }
  /** 면 가장자리 어두운 띠 (아주 옅은 AO): 상자가 무게 있게 앉아 보인다 */
  const aoEdge = (c: CanvasRenderingContext2D, w: number, h: number, k = 0.075, a = 0.2) => {
    const sides: [number, number, number, number, number, number, number, number][] = [
      [0, 0, 0, h * k, 0, 0, w, h * k],
      [0, h, 0, h - h * k, 0, h - h * k, w, h * k],
      [0, 0, w * k, 0, 0, 0, w * k, h],
      [w, 0, w - w * k, 0, w - w * k, 0, w * k, h],
    ]
    for (const [x0, y0, x1, y1, rx, ry, rw, rh] of sides) {
      const g = c.createLinearGradient(x0, y0, x1, y1)
      g.addColorStop(0, `rgba(52,32,12,${a})`)
      g.addColorStop(1, 'rgba(52,32,12,0)')
      c.fillStyle = g
      c.fillRect(rx, ry, rw, rh)
    }
  }
  /** 골판지 바탕: 크라프트 #B4895A (상자마다 색 곱하기로 ±4 %) + 낮은 주파수 얼룩 + 결 + 골 + 가장자리 AO (모서리 둥근 상자라 선은 긋지 않는다) */
  const KRAFT = '#b4895a'
  const kraft = (c: CanvasRenderingContext2D, w: number, h: number, base = KRAFT) => {
    if (IMG.kraft) {
      // 사진 크라프트 (512 px = 상자 면 하나). 면 가장자리만 옅게 어둡게
      c.drawImage(IMG.kraft, 0, 0, w, h)
      aoEdge(c, w, h, 0.06, 0.22)
      return
    }
    c.fillStyle = base
    c.fillRect(0, 0, w, h)
    // 얼룩: 종이 색이 고르지 않다 (한 면 안에서도 조금 밝고 어두운 곳)
    for (let i = 0; i < 16; i++) {
      const x = rnd() * w
      const y = rnd() * h
      const r = (0.18 + rnd() * 0.4) * w
      const g = c.createRadialGradient(x, y, 0, x, y, r)
      const dark = rnd() > 0.45
      g.addColorStop(0, dark ? 'rgba(98,64,30,0.09)' : 'rgba(232,198,150,0.08)')
      g.addColorStop(1, dark ? 'rgba(98,64,30,0)' : 'rgba(232,198,150,0)')
      c.fillStyle = g
      c.fillRect(0, 0, w, h)
    }
    fibres(c, w, h, (w * h) / 26, '92,62,30', 0.08, 10)
    fibres(c, w, h, (w * h) / 90, '236,214,178', 0.07, 16)
    // 골판지 골 (아주 옅은 세로 줄: 가까이서만 보인다)
    for (let x = 0; x < w; x += 6) {
      c.fillStyle = `rgba(90,60,28,${(0.025 + rnd() * 0.02).toFixed(3)})`
      c.fillRect(x, 0, 2, h)
    }
    aoEdge(c, w, h, 0.07, 0.34)
  }
  /** 투명 테이프 (색 지도): 바탕보다 조금 밝고 노랗게 + 가장자리 빛 줄 + 테이프 속 잔주름 (반짝임은 거칠기 0.4 가 만든다) */
  const tape = (c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, along: 'x' | 'y') => {
    if (IMG.tape) {
      // 사진 테이프 (크라프트 위 조금 밝고 노란 띠) + 가장자리 빛 줄 + 끝 그늘
      c.globalAlpha = 0.92
      c.drawImage(IMG.tape, x, y, w, h)
      c.globalAlpha = 1
      c.fillStyle = 'rgba(255,236,200,0.12)'
      c.fillRect(x, y, w, h)
    } else {
      c.fillStyle = 'rgba(214,176,118,0.5)'
      c.fillRect(x, y, w, h)
    }
    c.fillStyle = 'rgba(255,240,214,0.16)'
    for (let i = 0; i < 7; i++) {
      if (along === 'x') c.fillRect(x + rnd() * w, y + h * 0.15, 2 + rnd() * 3, h * 0.7)
      else c.fillRect(x + w * 0.15, y + rnd() * h, w * 0.7, 2 + rnd() * 3)
    }
    c.fillStyle = 'rgba(255,246,226,0.42)'
    if (along === 'x') {
      c.fillRect(x, y, w, 3)
      c.fillRect(x, y + h - 3, w, 2)
    } else {
      c.fillRect(x, y, 3, h)
      c.fillRect(x + w - 3, y, 2, h)
    }
  }
  /** 거칠기 지도 (G 채널 = 거칠기 x 재료 roughness 1): 골판지 0.85, 테이프 0.4, 송장 종이 0.7 */
  const roughOf = (w: number, h: number, rects: [number, number, number, number, number][]) =>
    canvasTex(
      w,
      h,
      (c) => {
        c.fillStyle = 'rgb(217,217,217)'
        c.fillRect(0, 0, w, h)
        for (const [x, y, rw, rh, v] of rects) {
          const g = Math.round(v * 255)
          c.fillStyle = `rgb(${g},${g},${g})`
          c.fillRect(x, y, rw, rh)
        }
      },
      false,
      false,
    )
  const INK = 'rgba(40,28,16,0.8)'
  /** 인쇄 글 (Pretendard 만. 글꼴이 아직 안 왔으면 건너뛰고, 온 뒤 질감을 다시 그린다) */
  const fontOk = () => !!document.fonts?.check?.('700 20px Pretendard')
  const print = (c: CanvasRenderingContext2D, text: string, x: number, y: number, px: number, weight = 700, color = INK) => {
    if (!fontOk()) return
    c.font = `${weight} ${Math.round(px)}px Pretendard`
    c.fillStyle = color
    c.textBaseline = 'top'
    c.fillText(text, x, y)
  }
  /** 글이 든 질감: 글꼴이 오면 다시 그린다 */
  const printed: { t: THREE.CanvasTexture; draw: (c: CanvasRenderingContext2D, w: number, h: number) => void; s: number }[] = []
  const printTex = (w: number, h: number, draw: (c: CanvasRenderingContext2D, w: number, h: number) => void) => {
    const s = seed
    const t = canvasTex(w, h, draw)
    printed.push({ t, draw, s })
    return t
  }
  /** 위쪽 화살 둘 (취급 표시 '위로', 인쇄) */
  const upArrows = (c: CanvasRenderingContext2D, x: number, y: number, s: number) => {
    c.fillStyle = INK
    for (const dx of [0, s * 1.3]) {
      c.beginPath()
      c.moveTo(x + dx, y + s * 0.45)
      c.lineTo(x + dx + s * 0.5, y)
      c.lineTo(x + dx + s, y + s * 0.45)
      c.closePath()
      c.fill()
      c.fillRect(x + dx + s * 0.36, y + s * 0.45, s * 0.28, s * 0.72)
    }
    c.fillRect(x - s * 0.1, y + s * 1.3, s * 2.5, s * 0.1)
  }
  /** 깨지기 쉬움 (잔, 금 간 자리) */
  const glass = (c: CanvasRenderingContext2D, x: number, y: number, s: number) => {
    c.strokeStyle = INK
    c.lineWidth = s * 0.08
    c.lineJoin = 'round'
    c.beginPath()
    c.moveTo(x, y)
    c.lineTo(x + s, y)
    c.lineTo(x + s * 0.64, y + s * 0.46)
    c.lineTo(x + s * 0.36, y + s * 0.46)
    c.closePath()
    c.stroke()
    c.beginPath()
    c.moveTo(x + s * 0.52, y + s * 0.04)
    c.lineTo(x + s * 0.44, y + s * 0.2)
    c.lineTo(x + s * 0.56, y + s * 0.26)
    c.stroke()
    c.fillStyle = INK
    c.fillRect(x + s * 0.46, y + s * 0.46, s * 0.08, s * 0.36)
    c.fillRect(x + s * 0.22, y + s * 0.82, s * 0.56, s * 0.08)
  }
  /** 취급 그림 칸 (가는 테 안에 그림) */
  const pictoBox = (c: CanvasRenderingContext2D, x: number, y: number, s: number, kind: 'up' | 'glass') => {
    c.strokeStyle = INK
    c.lineWidth = Math.max(2, s * 0.035)
    c.strokeRect(x, y, s, s)
    if (kind === 'up') upArrows(c, x + s * 0.2, y + s * 0.18, s * 0.26)
    else glass(c, x + s * 0.26, y + s * 0.16, s * 0.48)
  }
  /** 화물 운송장 (사진 그림: 흰 종이 + 머리 글 + 바코드 + 칸). 그림이 오기 전에는 코드로 그린 송장 */
  const waybill = (c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) => {
    c.fillStyle = 'rgba(40,24,8,0.18)'
    c.fillRect(x + 2, y + 3, w, h)
    if (IMG.waybill) {
      c.drawImage(IMG.waybill, x, y, w, h)
      // 종이가 크라프트 위에서 눈부시지 않게 한 단 누르게
      c.fillStyle = 'rgba(60,52,40,0.10)'
      c.fillRect(x, y, w, h)
      return
    }
    c.fillStyle = '#e4e1da'
    c.fillRect(x, y, w, h)
    print(c, '화물 운송장', x + w * 0.07, y + h * 0.06, h * 0.075, 700, 'rgba(26,26,26,0.9)')
    c.fillStyle = 'rgba(26,26,26,0.55)'
    c.fillRect(x + w * 0.07, y + h * 0.17, w * 0.5, Math.max(1.5, h * 0.018))
    let bx = x + w * 0.07
    c.fillStyle = 'rgba(22,22,22,0.92)'
    while (bx < x + w * 0.93) {
      const bw = rnd() > 0.6 ? 3.2 : 1.6
      c.fillRect(bx, y + h * 0.24, bw, h * 0.2)
      bx += bw + 1.4 + rnd() * 2.2
    }
    c.strokeStyle = 'rgba(26,26,26,0.4)'
    c.lineWidth = 1.2
    for (let k = 0; k < 4; k++) {
      const ly = y + h * (0.52 + k * 0.11)
      c.beginPath()
      c.moveTo(x + w * 0.07, ly)
      c.lineTo(x + w * 0.93, ly)
      c.stroke()
      c.fillStyle = 'rgba(26,26,26,0.5)'
      c.fillRect(x + w * 0.1, ly + h * 0.03, w * 0.12, Math.max(1.5, h * 0.02))
      c.fillRect(x + w * 0.3, ly + h * 0.03, w * (0.5 - k * 0.08), Math.max(1.5, h * 0.02))
    }
  }
  /**
   * 골판지 상자 면 그림 한 장 (1024², 아틀라스): 상자 하나 = 재료 하나 = 그리기 한 번 (짐 하나의 상자들도 한 덩어리).
   *   ±X (옆면) = 사진 옆면 인쇄 (취급 그림 · '취급주의' · 무게), +Z (뒷면, 보는 쪽) = 크라프트 + 위 가운데 테이프 끝 + 오른쪽 아래 운송장,
   *   -Z = 크라프트 + 테이프 끝, 윗면 = 크라프트 + 가운데 날개 이음(어두운 틈) + 그 위 테이프 띠 (Z 방향), 밑면 = 크라프트.
   *   RoundedBoxGeometry 면 순서 +X -X +Y -Y +Z -Z. 캔버스 오른쪽 = 면을 밖에서 볼 때 오른쪽, 캔버스 위 = 위 (윗면은 위 = 앞 -Z)
   */
  type Rgn = { x: number; y: number; w: number; h: number }
  const AT = 1024
  const RG: Rgn[] = [
    { x: 0, y: 0, w: 512, h: 410 }, // +X
    { x: 0, y: 0, w: 512, h: 410 }, // -X
    { x: 512, y: 410, w: 512, h: 512 }, // +Y
    { x: 0, y: 820, w: 512, h: 204 }, // -Y
    { x: 512, y: 0, w: 512, h: 410 }, // +Z
    { x: 0, y: 410, w: 512, h: 410 }, // -Z
  ]
  const TAPE_W = 0.15
  /** 아틀라스 그리기. rough = 거칠기 지도 (G: 크라프트 0.86 · 테이프 0.36 · 송장 0.6) */
  const drawAtlas = (c: CanvasRenderingContext2D, rough: boolean) => {
    const at = (r: Rgn, f: (w: number, h: number) => void) => {
      c.save()
      c.beginPath()
      c.rect(r.x, r.y, r.w, r.h)
      c.clip()
      c.translate(r.x, r.y)
      f(r.w, r.h)
      c.restore()
    }
    // 거칠기 지도 = G 채널 (roughnessMap), 투명 막 = R 채널 (clearcoatMap): 테이프만 반짝이는 막 (R 1), 골판지 · 송장은 막 없음
    const g = (v: number, coat = 0) => {
      const k = Math.round(v * 255)
      return `rgb(${Math.round(coat * 255)},${k},0)`
    }
    const tapeTab = (w: number, h: number) => {
      if (rough) {
        c.fillStyle = g(0.3, 1)
        c.fillRect(w * (0.5 - TAPE_W / 2), 0, w * TAPE_W, h * 0.24)
      } else tape(c, w * (0.5 - TAPE_W / 2), 0, w * TAPE_W, h * 0.24, 'y')
    }
    if (rough) {
      c.fillStyle = g(0.86)
      c.fillRect(0, 0, AT, AT)
      // 골판지 거칠기 얼룩 (0.74 ~ 0.96): 손 닿은 자리 · 눌린 자리는 조금 매끈해 주광을 고르지 않게 받는다
      for (let i = 0; i < 140; i++) {
        const x = rnd() * AT
        const y = rnd() * AT
        const r = 14 + rnd() * 70
        const v = 0.74 + rnd() * 0.22
        const gr = c.createRadialGradient(x, y, 0, x, y, r)
        const k = Math.round(v * 255)
        gr.addColorStop(0, `rgba(0,${k},0,0.55)`)
        gr.addColorStop(1, `rgba(0,${k},0,0)`)
        c.fillStyle = gr
        c.fillRect(x - r, y - r, r * 2, r * 2)
      }
      // 결 (가는 가로 줄)
      for (let i = 0; i < 2600; i++) {
        const k = Math.round((0.8 + rnd() * 0.16) * 255)
        c.fillStyle = `rgba(0,${k},0,0.35)`
        c.fillRect(rnd() * AT, rnd() * AT, 4 + rnd() * 18, 1)
      }
    }
    // 옆면 (±X)
    at(RG[0], (w, h) => {
      if (rough) return
      if (IMG.side) {
        c.drawImage(IMG.side, 0, 0, w, h)
        aoEdge(c, w, h, 0.05, 0.2)
        return
      }
      kraft(c, w, h)
      pictoBox(c, w * 0.06, h * 0.07, w * 0.19, 'up')
      pictoBox(c, w * 0.29, h * 0.07, w * 0.19, 'glass')
      print(c, '취급주의', w * 0.06, h * 0.45, h * 0.09)
      print(c, '총중량 300 kg', w * 0.06, h * 0.58, h * 0.05, 600)
      print(c, '2단 이상 쌓지 마세요', w * 0.06, h * 0.65, h * 0.05, 600)
      print(c, 'NO. 26-1114-0300', w * 0.06, h * 0.86, h * 0.04, 600)
    })
    // 뒷면 (+Z): 테이프 끝 + 운송장 (오른쪽 아래)
    at(RG[4], (w, h) => {
      if (!rough) kraft(c, w, h)
      tapeTab(w, h)
      const ww = w * 0.3
      const wh = ww * (4 / 3)
      const wx = w * 0.62
      const wy = h * 0.88 - wh
      if (rough) {
        c.fillStyle = g(0.6)
        c.fillRect(wx, wy, ww, wh)
      } else waybill(c, wx, wy, ww, wh)
    })
    // 앞면 (-Z)
    at(RG[5], (w, h) => {
      if (!rough) kraft(c, w, h)
      tapeTab(w, h)
    })
    // 윗면: 날개 이음 + 테이프 띠
    at(RG[2], (w, h) => {
      if (rough) {
        c.fillStyle = g(0.3, 1)
        c.fillRect(w * (0.5 - TAPE_W / 2), 0, w * TAPE_W, h)
        return
      }
      kraft(c, w, h)
      const gr = c.createLinearGradient(w * 0.4, 0, w * 0.6, 0)
      gr.addColorStop(0, 'rgba(52,32,12,0)')
      gr.addColorStop(0.45, 'rgba(52,32,12,0.26)')
      gr.addColorStop(0.55, 'rgba(52,32,12,0.26)')
      gr.addColorStop(1, 'rgba(52,32,12,0)')
      c.fillStyle = gr
      c.fillRect(w * 0.4, 0, w * 0.2, h)
      c.fillStyle = 'rgba(40,24,8,0.75)'
      c.fillRect(w / 2 - 2, 0, 4, h)
      tape(c, w * (0.5 - TAPE_W / 2), 0, w * TAPE_W, h, 'y')
    })
    at(RG[3], (w, h) => {
      if (!rough) kraft(c, w, h)
    })
  }
  const cartonAtlas = printTex(AT, AT, (c) => drawAtlas(c, false))
  const cartonAtlasRough = (() => {
    const t = printTex(AT, AT, (c) => drawAtlas(c, true))
    t.colorSpace = THREE.NoColorSpace
    return t
  })()
  /** 상자 모양 (모서리 7 mm 둥글게) + 아틀라스 UV + 상자 색 (꼭짓점 색, 상자마다 조금씩 다르다) */
  const cartonGeo = (w: number, h: number, l: number, tint: [number, number, number]) => {
    const g = new RoundedBoxGeometry(w, h, l, 2, Math.min(0.007, w / 3, h / 3, l / 3))
    const uv = g.getAttribute('uv') as THREE.BufferAttribute
    const n = uv.count / 6
    const col = new Float32Array(uv.count * 3)
    for (let i = 0; i < uv.count; i++) {
      const r = RG[Math.min(5, Math.floor(i / n))]
      const u = uv.getX(i)
      const v = uv.getY(i)
      uv.setXY(i, (r.x + u * r.w) / AT, 1 - (r.y + (1 - v) * r.h) / AT)
      col[i * 3] = tint[0]
      col[i * 3 + 1] = tint[1]
      col[i * 3 + 2] = tint[2]
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3))
    g.clearGroups()
    return g
  }
  // 가전 상자 (키 큰 상자): 테이프 끝 + 아래 인쇄 띠 + 취급 그림 + 송장
  const applianceTex = printTex(256, 512, (c, w, h) => {
    kraft(c, w, h)
    tape(c, w * 0.42, 0, w * 0.16, h * 0.07, 'y')
    tape(c, w * 0.42, h * 0.93, w * 0.16, h * 0.07, 'y')
    c.fillStyle = 'rgba(38,40,44,0.86)'
    c.fillRect(0, h * 0.8, w, h * 0.08)
    c.fillStyle = 'rgba(38,40,44,0.5)'
    c.fillRect(0, h * 0.9, w, 3)
    pictoBox(c, w * 0.1, h * 0.09, w * 0.24, 'up')
    pictoBox(c, w * 0.38, h * 0.09, w * 0.24, 'glass')
    print(c, '취급주의', w * 0.1, h * 0.22, h * 0.04)
    waybill(c, w * 0.1, h * 0.42, w * 0.5, h * 0.14)
  })
  const applianceRough = roughOf(256, 512, [
    [256 * 0.42, 0, 256 * 0.16, 512 * 0.07, 0.4],
    [256 * 0.42, 512 * 0.93, 256 * 0.16, 512 * 0.07, 0.4],
    [256 * 0.1, 512 * 0.42, 256 * 0.5, 512 * 0.14, 0.7],
  ])
  // 이사 담요 (누빔 이사 담요: 마름모 박음질 사이가 도톰하게 부푼 칸 + 촘촘한 천 결). 질감 한 장 = 담요 위 QUILT_M (UV 는 m 단위로 준다:
  //   면 크기와 상관없이 마름모 한 칸이 18 cm). 예전: 면마다 두 장씩 늘린 물결 줄 = 저해상도 플라스틱처럼 읽혔다
  const QN = 512
  /** 질감 한 장이 덮는 길이 (m). 한 장에 마름모 2 x 2 */
  const QUILT_M = 0.36
  const quiltH = new Float32Array(QN * QN)
  {
    const p = QN / 2
    for (let y = 0; y < QN; y++)
      for (let x = 0; x < QN; x++) {
        // 대각 박음선 두 묶음 (x + y = k p, x - y = k p). 선에서의 거리 (px)
        const a = (x + y) / p
        const b = (x - y + QN) / p
        const da = Math.abs(a - Math.round(a)) * p * Math.SQRT1_2
        const db = Math.abs(b - Math.round(b)) * p * Math.SQRT1_2
        const d = Math.min(da, db)
        // 칸이 도톰하게 부풀고 (가운데 1), 박음선에서 좁고 깊게 들어간다
        const puff = 1 - Math.exp(-(d * d) / 260)
        const groove = Math.exp(-(d * d) / 3.2)
        quiltH[y * QN + x] = puff * 0.85 + 0.15 - groove * 0.35
      }
    // 천 결 (아주 작은 짜임): 높이에 2 % 잔무늬
    for (let y = 0; y < QN; y++)
      for (let x = 0; x < QN; x++) quiltH[y * QN + x] += ((x + (y >> 1)) % 4 < 2 ? 0.012 : -0.012) + (rnd() - 0.5) * 0.02
  }
  const quiltTex = canvasTex(QN, QN, (c, w, h) => {
    const img = c.createImageData(w, h)
    for (let i = 0; i < w * h; i++) {
      // 남색 이사 담요 (#3B4A66 쯤): 칸 가운데가 조금 밝고 박음선이 어둡다
      const k = 0.76 + 0.24 * Math.max(0, Math.min(1, quiltH[i]))
      img.data[i * 4] = 64 * k
      img.data[i * 4 + 1] = 78 * k
      img.data[i * 4 + 2] = 108 * k
      img.data[i * 4 + 3] = 255
    }
    c.putImageData(img, 0, 0)
    // 천 보풀 · 실 결
    fibres(c, w, h, 9000, '24,28,40', 0.18, 3)
    fibres(c, w, h, 3000, '150,164,196', 0.08, 4)
  }, true)
  // 누빔 법선 (높이에서 기울기)
  const quiltNormal = canvasTex(QN, QN, (c, w, h) => {
    const img = c.createImageData(w, h)
    const at = (x: number, y: number) => quiltH[((y + h) % h) * w + ((x + w) % w)]
    const s = 6
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const dx = (at(x + 1, y) - at(x - 1, y)) * s
        const dy = (at(x, y + 1) - at(x, y - 1)) * s
        const l = Math.hypot(dx, dy, 1)
        const i = (y * w + x) * 4
        img.data[i] = (-dx / l) * 127 + 128
        img.data[i + 1] = (dy / l) * 127 + 128
        img.data[i + 2] = (1 / l) * 127 + 128
        img.data[i + 3] = 255
      }
    c.putImageData(img, 0, 0)
  }, true, false)
  // 나무 (소나무 #C9A877, 결: 길게 흐르는 줄 + 옹이)
  const woodTex = canvasTex(256, 64, (c, w, h) => {
    c.fillStyle = '#c9a877'
    c.fillRect(0, 0, w, h)
    for (let i = 0; i < 46; i++) {
      const y0 = rnd() * h
      const amp = 1 + rnd() * 3
      const ph = rnd() * 6
      c.strokeStyle = `rgba(${96 + rnd() * 30},${62 + rnd() * 18},30,${0.08 + rnd() * 0.16})`
      c.lineWidth = 0.6 + rnd() * 1.4
      c.beginPath()
      for (let x = 0; x <= w; x += 8) {
        const y = y0 + Math.sin(x / 40 + ph) * amp
        if (x) c.lineTo(x, y)
        else c.moveTo(x, y)
      }
      c.stroke()
    }
    c.fillStyle = 'rgba(78,48,22,0.4)'
    c.beginPath()
    c.ellipse(w * 0.32, h * 0.45, 6, 2.6, 0, 0, Math.PI * 2)
    c.fill()
  }, true)
  // 자재 포대 (크라프트 종이 포대, 시멘트 · 몰탈 같은 무거운 짐): 사진 크라프트 바탕 + 종이 겹 주름 + 가운데 짙은 갈색 인쇄 (품명 · 무게)
  //   + 양 끝 박음질 (v = 포대 길이 방향 0 ~ 1, u = 폭). 예전: 회색 PP 포대 + 흑연 띠 = 손잡이 달린 회색 가방처럼 읽혔다
  const bagTex = printTex(512, 512, (c, w, h) => {
    if (IMG.kraft) {
      c.drawImage(IMG.kraft, 0, 0, w, h)
      // 종이 포대는 상자 골판지보다 한 단 밝고 노랗다
      c.fillStyle = 'rgba(236,206,160,0.28)'
      c.fillRect(0, 0, w, h)
    } else {
      c.fillStyle = '#c29a68'
      c.fillRect(0, 0, w, h)
      fibres(c, w, h, 6000, '92,62,30', 0.08, 10)
      fibres(c, w, h, 2400, '240,220,186', 0.08, 14)
    }
    // 종이 겹 주름 (길게 비스듬한 밝은 · 어두운 줄)
    for (let i = 0; i < 26; i++) {
      const x0 = rnd() * w
      const y0 = rnd() * h
      const ang = (rnd() - 0.5) * 0.9
      const len = 60 + rnd() * 200
      c.strokeStyle = rnd() > 0.5 ? `rgba(255,236,204,${(0.08 + rnd() * 0.1).toFixed(3)})` : `rgba(70,44,18,${(0.07 + rnd() * 0.09).toFixed(3)})`
      c.lineWidth = 1 + rnd() * 2.5
      c.beginPath()
      c.moveTo(x0, y0)
      c.lineTo(x0 + Math.sin(ang) * len, y0 + Math.cos(ang) * len)
      c.stroke()
    }
    // 인쇄 (짙은 갈색 잉크, 포대 가운데): 품명 + 무게 + 가는 테
    const ink = 'rgba(58,34,18,0.78)'
    c.strokeStyle = ink
    c.lineWidth = 4
    c.strokeRect(w * 0.16, h * 0.3, w * 0.68, h * 0.4)
    c.textAlign = 'center'
    print(c, '시멘트', w / 2, h * 0.36, h * 0.13, 800, ink)
    print(c, '40 kg', w / 2, h * 0.53, h * 0.09, 700, ink)
    c.textAlign = 'start'
    // 양 끝: 접어 꿰맨 단 (조금 어둡고) + 박음질
    for (const [y0, y1] of [[0, h * 0.07], [h * 0.93, h]]) {
      c.fillStyle = 'rgba(70,44,18,0.18)'
      c.fillRect(0, y0, w, y1 - y0)
    }
    c.strokeStyle = 'rgba(60,40,22,0.7)'
    c.setLineDash([8, 6])
    c.lineWidth = 3
    for (const y of [h * 0.05, h * 0.95]) {
      c.beginPath()
      c.moveTo(0, y)
      c.lineTo(w, y)
      c.stroke()
    }
    c.setLineDash([])
  })
  /** 높이 지도(캔버스 그림의 밝기)에서 법선 지도를 만든다 */
  const normalFrom = (w: number, h: number, drawHeight: (c: CanvasRenderingContext2D, w: number, h: number) => void, strength: number) => {
    const hc = document.createElement('canvas')
    hc.width = w
    hc.height = h
    const hx = hc.getContext('2d', { willReadFrequently: true })!
    drawHeight(hx, w, h)
    const src = hx.getImageData(0, 0, w, h).data
    const at = (x: number, y: number) => src[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255
    return canvasTex(
      w,
      h,
      (c) => {
        const img = c.createImageData(w, h)
        for (let y = 0; y < h; y++)
          for (let x = 0; x < w; x++) {
            const dx = (at(x + 1, y) - at(x - 1, y)) * strength
            const dy = (at(x, y + 1) - at(x, y - 1)) * strength
            const l = Math.hypot(dx, dy, 1)
            const i = (y * w + x) * 4
            img.data[i] = (-dx / l) * 127 + 128
            img.data[i + 1] = (dy / l) * 127 + 128
            img.data[i + 2] = (1 / l) * 127 + 128
            img.data[i + 3] = 255
          }
        c.putImageData(img, 0, 0)
      },
      true,
      false,
    )
  }
  // 골판지 법선: 아주 옅은 찌그러짐 · 부풂 (평평한 판이 주광을 고르게 받아 플라스틱처럼 보이지 않게)
  const cartonNormal = normalFrom(
    256,
    256,
    (c, w, h) => {
      c.fillStyle = 'rgb(128,128,128)'
      c.fillRect(0, 0, w, h)
      for (let i = 0; i < 22; i++) {
        const x = rnd() * w
        const y = rnd() * h
        const r = (0.08 + rnd() * 0.25) * w
        const up = rnd() > 0.5
        const gr = c.createRadialGradient(x, y, 0, x, y, r)
        gr.addColorStop(0, up ? 'rgba(170,170,170,0.5)' : 'rgba(90,90,90,0.5)')
        gr.addColorStop(1, up ? 'rgba(170,170,170,0)' : 'rgba(90,90,90,0)')
        c.fillStyle = gr
        c.fillRect(0, 0, w, h)
      }
    },
    1.6,
  )
  // 적재함 바닥 (2026-11-15): 매끈한 어두운 도장 강판 + 옅은 얼룩 (Omniverse 바닥). 예전 체크판 법선 · 긁힌 자국 줄은
  //   내비 크기에서 빗줄기 · 잡음처럼 읽혀 뺐다. 한 장(512 px, 선형 값)을 색 지도와 거칠기 지도에 같이 쓴다:
  //   밝은 얼룩 = 먼지 (조금 밝고 거칠다), 어두운 얼룩 = 닦인 곳 (조금 어둡고 매끈하다). 대비는 ±10 % 안
  const deckGrunge = canvasTex(512, 512, (c, w, h) => {
    c.fillStyle = 'rgb(128,128,128)'
    c.fillRect(0, 0, w, h)
    const blob = (x: number, y: number, r: number, v: number, a: number, sy = 1) => {
      c.save()
      c.translate(x, y)
      c.scale(1, sy)
      const g = c.createRadialGradient(0, 0, 0, 0, 0, r)
      g.addColorStop(0, `rgba(${v},${v},${v},${a})`)
      g.addColorStop(1, `rgba(${v},${v},${v},0)`)
      c.fillStyle = g
      c.fillRect(-r, -r, 2 * r, 2 * r)
      c.restore()
    }
    for (let i = 0; i < 46; i++) blob(rnd() * w, rnd() * h, 30 + rnd() * 130, rnd() > 0.5 ? 168 : 92, 0.12 + rnd() * 0.12)
    // 짐을 끈 넓고 흐린 자국 (앞뒤 = 그림 세로 방향, 폭 넓게 · 아주 옅게: 줄로 읽히지 않는다)
    for (let i = 0; i < 10; i++) blob(w * (0.25 + rnd() * 0.5), rnd() * h, 26 + rnd() * 30, 150, 0.08, 4 + rnd() * 3)
    // 잔 얼룩 (작은 점 여럿, 아주 옅게)
    for (let i = 0; i < 260; i++) blob(rnd() * w, rnd() * h, 2 + rnd() * 6, rnd() > 0.5 ? 175 : 80, 0.18)
  }, false, false)
  // 옆문 솔질 알루미늄: 판 길이를 따라 (u = 판 길이 · v = 높이) 가는 가로 결.
  //   색 지도 = 결마다 밝기가 조금씩 다른 가는 줄 (어두운 중간 회색 판에 길게 끊기는 결), 거칠기 지도 = 결마다 ±8 %,
  //   법선 = 줄마다 높이가 조금씩 달라 빛 줄이 결을 따라 길게 끊겼다 이어진다. 비등방 반사(결 방향으로 늘어난 빛)와 함께
  const gateNormal = normalFrom(
    512,
    256,
    (c, w, h) => {
      c.fillStyle = 'rgb(128,128,128)'
      c.fillRect(0, 0, w, h)
      for (let y = 0; y < h; y++) {
        const v = Math.round(128 + (rnd() - 0.5) * 70)
        c.fillStyle = `rgb(${v},${v},${v})`
        c.fillRect(0, y, w, 1)
      }
      for (let i = 0; i < 2200; i++) {
        const v = Math.round(128 + (rnd() - 0.5) * 140)
        c.fillStyle = `rgba(${v},${v},${v},${(0.4 + rnd() * 0.5).toFixed(3)})`
        c.fillRect(rnd() * w, Math.floor(rnd() * h), 60 + rnd() * 300, 1)
      }
    },
    1.1,
  )
  const gateStreak = canvasTex(1024, 256, (c, w, h) => {
    // 결은 아주 옅게 (가는 줄무늬가 칠한 판처럼 읽히지 않게: 판의 밝고 어두운 줄은 반사가 만든다)
    //   (2026-11-15) 가운데 밝기를 낮췄다 (236 → 206): 거울 같은 판이 흰 칠이 아니라 어두운 금속으로 읽히게
    c.fillStyle = 'rgb(206,206,206)'
    c.fillRect(0, 0, w, h)
    for (let i = 0; i < 1800; i++) {
      const v = Math.round(184 + rnd() * 41)
      c.fillStyle = `rgba(${v},${v},${v},${(0.12 + rnd() * 0.25).toFixed(3)})`
      c.fillRect(rnd() * w, Math.floor(rnd() * h), 120 + rnd() * 600, 1)
    }
    // 판 위쪽은 밝고 아래 절반은 어둡게: 판 아래쪽이 비추는 곳은 적재함 밑 그늘진 바닥이다
    //   (환경 빛은 무한히 멀어 판 높이마다 같은 것을 비추므로, 가까운 바닥의 시차를 색 지도로 대신한다). 위아래 끝은 접은 끝 · 먼지
    const g = c.createLinearGradient(0, 0, 0, h)
    g.addColorStop(0, 'rgba(0,0,0,0.1)')
    g.addColorStop(0.05, 'rgba(0,0,0,0)')
    g.addColorStop(0.4, 'rgba(0,0,0,0.05)')
    g.addColorStop(0.7, 'rgba(0,0,0,0.32)')
    g.addColorStop(1, 'rgba(0,0,0,0.45)')
    c.fillStyle = g
    c.fillRect(0, 0, w, h)
  }, true)
  const gateRough = canvasTex(1024, 256, (c, w, h) => {
    c.fillStyle = 'rgb(240,240,240)'
    c.fillRect(0, 0, w, h)
    for (let i = 0; i < 3000; i++) {
      const v = Math.round(220 + rnd() * 35)
      c.fillStyle = `rgba(${v},${v},${v},${(0.35 + rnd() * 0.5).toFixed(3)})`
      c.fillRect(rnd() * w, Math.floor(rnd() * h), 160 + rnd() * 600, 1)
    }
  }, true, false)
  // 벨트 띠: 사진 웨빙 (회색으로 바꾼 짜임: 가장자리 · 가운데 줄 · 잔 짜임) x 띠 색. u 0.2 m 마다 한 번 (512 x 128 = 띠 폭 50 mm)
  //   그림이 오기 전에는 코드로 그린 짜임
  const webTex = printTex(512, 128, (c, w, h) => {
    if (IMG.web) {
      c.drawImage(IMG.web, 0, 0, w, h)
      return
    }
    c.fillStyle = '#e0e0e0'
    c.fillRect(0, 0, w, h)
    for (let y = 2; y < h; y += 6) {
      c.fillStyle = 'rgba(0,0,0,0.08)'
      c.fillRect(0, y, w, 2)
    }
    c.fillStyle = 'rgba(0,0,0,0.22)'
    c.fillRect(0, 0, w, 8)
    c.fillRect(0, h - 8, w, 8)
    c.fillRect(0, h / 2 - 2, w, 4)
  })
  webTex.wrapS = webTex.wrapT = THREE.RepeatWrapping
  // 고무바 (꼰 무늬)
  const bungeeTex = canvasTex(32, 32, (c, w, h) => {
    c.fillStyle = '#f0f0f0'
    c.fillRect(0, 0, w, h)
    c.strokeStyle = 'rgba(0,0,0,0.32)'
    c.lineWidth = 5
    for (let i = -h; i < w * 2; i += 16) {
      c.beginPath()
      c.moveTo(i, 0)
      c.lineTo(i + h, h)
      c.stroke()
    }
  }, true)
  bungeeTex.repeat.set(36, 1)
  /** 닿는 그림자 (둥근 네모를 흐리게). inset = 가장자리에서 비우는 몫 */
  const softRect = (inset: number, blur: number, a: number) =>
    canvasTex(128, 128, (c, w, h) => {
      c.filter = `blur(${blur}px)`
      c.fillStyle = `rgba(0,0,0,${a})`
      const x = w * inset
      const y = h * inset
      if (typeof c.roundRect === 'function') {
        c.beginPath()
        c.roundRect(x, y, w - 2 * x, h - 2 * y, w * 0.08)
        c.fill()
      } else c.fillRect(x, y, w - 2 * x, h - 2 * y)
    })
  const contactTex = softRect(0.2, 7, 0.75)
  const bedSoftTex = softRect(0.22, 14, 1)
  const bedTightTex = softRect(0.1, 4, 1)
  /**
   * 구운 닿는 그림자 (적재함 밑, 판 = 적재함 바닥 1.2 배): 안쪽 1/1.2 (= 적재함 밑)은 진하고, 둘레 10 % 띠에서 사라진다.
   *   둥근 네모 거리 x 방사형 (가운데가 조금 더 진하다) 이라 모서리에서도 고르게 번진다
   */
  const BED_CONTACT_K = 1.4
  const bedContactTex = canvasTex(256, 256, (c, w, h) => {
    const img = c.createImageData(w, h)
    const inner = 1 / BED_CONTACT_K
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const u = Math.abs((x + 0.5) / w - 0.5) * 2
        const v = Math.abs((y + 0.5) / h - 0.5) * 2
        // 둥근 네모 바깥 거리 (0 = 적재함 가장자리, 1 = 판 끝)
        const dx = Math.max(0, u - inner + 0.06)
        const dy = Math.max(0, v - inner + 0.06)
        const d = Math.min(1, Math.hypot(dx, dy) / (1 - inner + 0.06))
        const fall = Math.pow(1 - d, 1.8)
        const radial = 1 - 0.12 * Math.min(1, Math.hypot(u, v) / 1.414)
        const i = (y * w + x) * 4
        img.data[i] = img.data[i + 1] = img.data[i + 2] = 0
        img.data[i + 3] = Math.round(255 * fall * radial)
      }
    c.putImageData(img, 0, 0)
  }, false, true)
  /** 짐 하나하나 밑 좁은 AO (짐 바닥 1.15 배 판, 가장자리 7 % 에서 사라진다) */
  const itemAoTex = softRect(0.07, 3, 1)
  /**
   * 쇼룸 바닥 (2026-11-15): 반짝이는 검은 원판 (지름 FLOOR_D) — 가운데는 진하고 가장자리로 갈수록 투명해져 무대 바탕에 녹는다.
   *   1 m 격자 (옅은 회색 가는 선)는 적재함 가장자리에서 1.5 m 안에서 사라진다. 바닥 반사는 거울 모양이 아니라
   *   환경 빛(PMREM)을 거칠기 0.3 으로 흐리게 비춘 것뿐 (그림 한 장 값). 색 · 알파 한 장 (1024 px)
   */
  const FLOOR_D = 7
  const floorTex = canvasTex(1024, 1024, (c, w, h) => {
    const img = c.createImageData(w, h)
    const px = FLOOR_D / w
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        // 세계 좌표 (m): 그림 가운데 = 적재함 가운데. 그림 위 = -Z (앞)
        const wx = (x + 0.5) * px - FLOOR_D / 2
        const wz = (y + 0.5) * px - FLOOR_D / 2
        const r = Math.hypot(wx * 0.92, wz * 0.78)
        // 알파: 반지름 1.5 m 까지 진하고 3.3 m 에서 0 (부드러운 곡선)
        const a = 1 - THREE.MathUtils.smoothstep(r, 1.3, 2.9)
        // 격자 1 m: 선까지 거리 (m) → 폭 1.6 cm 선, 가장자리 부드럽게. 적재함에서 멀어지며 사라진다
        const gx = Math.abs(wx - Math.round(wx))
        const gz = Math.abs(wz - Math.round(wz))
        const line = Math.max(1 - THREE.MathUtils.smoothstep(gx, 0.004, 0.011), 1 - THREE.MathUtils.smoothstep(gz, 0.004, 0.011))
        const gridFade = 1 - THREE.MathUtils.smoothstep(Math.hypot(Math.max(0, Math.abs(wx) - W / 2), Math.max(0, Math.abs(wz) - L / 2)), 0.25, 1.5)
        // 빛 웅덩이 (흐린 반사를 미리 구운 것): 적재함 오른쪽 뒤 (기본 시점의 앞쪽 바닥) 에 옅고 따뜻한 회색, 둘레로 사라진다
        const pool = Math.exp(-(((wx - 1.25) / 1.2) ** 2 + ((wz - 0.7) / 1.5) ** 2)) * 0.8 + Math.exp(-((wx / 1.6) ** 2 + (wz / 2.0) ** 2)) * 0.35
        const v = 9 + 26 * pool + 40 * line * gridFade
        const i = (y * w + x) * 4
        img.data[i] = v + 3 * pool
        img.data[i + 1] = v + 1 * pool
        img.data[i + 2] = v
        img.data[i + 3] = Math.round(255 * a)
      }
    c.putImageData(img, 0, 0)
  })

  const M = {
    // 바닥: 어두운 강판 #16181B · 거칠기 0.5 · 아주 옅은 줄무늬 체크판 법선 (사진의 매끈하고 어두운 바닥). 금속 몫은 반쯤
    //   (2026-11-14 b: 사진처럼 더 검고 매끈하게 #0F1113 · 거칠기 0.42 · 체크판 법선 0.16 = 가까이서만 보이는 결)
    //   (2026-11-15: 체크판 법선 · 긁힌 자국 빼고 얼룩 지도 하나 = 색 x 거칠기 (0.5 x 2 x 얼룩 ≈ 0.42 ~ 0.58). 색은 지도 가운데 값 0.5 를 되돌려 곱한 값)
    deckTop: std(0x30343a, 0.55, 0.9, { map: deckGrunge, roughnessMap: deckGrunge }),
    deckSide: std(0x1e2125, 0.7, 0.5),
    // 밑 틀: 흑연 강판 (그림자 속에 묻힌다)
    frame: std(0x1e2125, 0.6, 0.55),
    // 알루미늄 옆판: 어두운 솔질 알루미늄 (색 #A3AAB2 x 결 지도 = 화면에서 중간 회색, 흰 판 금지) · 금속 1 · 거칠기 0.36 (결마다 ±8 %) · 결 색 지도 ·
    //   가로 헤어라인 법선 (옅게) · 비등방 0.6 (결 = 판 길이 방향): 빛 줄이 결을 따라 길게 늘어난다 (사진의 옆문)
    //   (2026-11-14: 연마 알루미늄. 금속 1 · 거칠기 0.22 · 헤어라인 법선 0.15 · 스튜디오 소프트박스가 넓은 밝은 줄 · 어두운 줄로 비친다)
    //   (2026-11-14 b: 진짜 하늘 HDR 반사 + 비등방 0.55 (빛 줄이 결 = 판 길이 방향으로 길게) + 얇은 투명 막 0.35 (거칠기 0.06):
    //   비스듬히 보이는 판 끝 · 윗 모서리에 또렷한 빛 줄 (사진의 옆문 윗 끝 반짝임))
    //   비등방 회전 90° (three 는 회전 0 이면 세운 판의 반사를 수평선 아래 검은 땅 쪽으로 굽혀 판이 검게 묻혔다)
    //   (2026-11-15: 연마 거울판. 거칠기 0.3 → 0.13 · 비등방 0.15 · 투명 막 0.6: 검은 스튜디오 바닥을 비춘 어두운 거울 + 가로 소프트박스 빛 줄 하나
    //   (Omniverse 사진과 나란히 놓으면 예전 판은 고른 밝은 회색 칠로 보였다))
    gate: track(new THREE.MeshPhysicalMaterial({ color: 0xc8ced4, map: gateStreak, metalness: 1, roughness: 0.13, roughnessMap: gateRough, normalMap: gateNormal, normalScale: new THREE.Vector2(0.1, 0.1), anisotropy: 0.15, anisotropyRotation: Math.PI / 2, clearcoat: 0.6, clearcoatRoughness: 0.05 })),
    // 눌러 낸 가로 골 (옆판과 같은 알루미늄, 조금 더 매끈: 골을 따라 빛 줄이 선다). 끝(모서리 기둥 옆)이 흰 줄로 타지 않게 중간 회색
    swage: std(0x8a9096, 1, 0.16),
    // 윗 덮개: 둥근 관 (반지름 25 mm) · 거칠기 0.12 → 길이를 따라 또렷한 빛 줄 하나 (사진의 말린 윗 테두리)
    //   관은 솔질 결이 길이 방향 (원기둥 UV 의 v) → 비등방 회전 90°: 빛 줄이 관을 따라 길게 늘어난다. 얇은 투명 막으로 가장자리 반짝임
    gateCap: track(new THREE.MeshPhysicalMaterial({ color: 0xc4cad0, metalness: 1, roughness: 0.16, anisotropy: 0.5, anisotropyRotation: Math.PI / 2, clearcoat: 0.5, clearcoatRoughness: 0.05 })),
    // 앞 보호 틀: 흑연 분체 도장 #1B1D20 · 거칠기 0.6
    graphite: std(0x1b1d20, 0.35, 0.6),
    // 앞 보호 틀 강관: 솔질 강철 (사진의 관 틀. 흰 선이 되지 않게 중간 회색)
    //   (가는 관(반지름 21 mm, 14 각)은 비등방을 쓰면 빛 줄이 점선처럼 끊겨 보여 뺐다: 연마 강관 + 얇은 투명 막)
    //   (2026-11-15: 관을 1.6 배 (지름 약 68 mm → 사진의 관 틀 굵기) · 28 각으로 굵게 하고 윗 덮개와 같은 재료 (거칠기 0.12 · 관을 따라 비등방):
    //   관마다 또렷한 빛 줄 하나)
    rail: track(new THREE.MeshPhysicalMaterial({ color: 0x969ca2, metalness: 1, roughness: 0.12, anisotropy: 0.15, anisotropyRotation: Math.PI / 2, clearcoat: 0.3, clearcoatRoughness: 0.05 })),
    // 모서리 기둥: 어두운 양극 산화 알루미늄 (흰 기둥이 테두리처럼 읽히지 않게)
    post: std(0x50565d, 1, 0.42),
    // 라쳇 버클 · 갈고리 · 고리: 아연 도금 강철 (사진의 버클처럼 밝게 비치는 금속, 거칠기 0.22)
    steel: std(0xa9afb6, 1, 0.22),
    // 라쳇 받침 · 고리 바탕: 어두운 강철 (금속 1, 거칠기 0.35)
    darkSteel: std(0x3b4047, 1, 0.35),
    wood: std(0xffffff, 0.0, 0.82, { map: woodTex }),
    woodDark: std(0xd2bb98, 0.0, 0.86, { map: woodTex }),
    gap: std(0x1d1813, 0.0, 0.95),
    protector: std(0x9c7a4f, 0.0, 0.9),
    guard: std(0x24272b, 0.1, 0.6),
    band: std(0xe9e7e0, 0.0, 0.5),
    appliance: std(0xffffff, 0, 0.84, { map: applianceTex }),
    // 담요: 색 지도 x 꼭짓점 색 (접힌 골 · 아래 단 테두리가 어둡다)
    //   누빔 법선 · 거칠기 0.95 · 천의 sheen (비스듬히 보면 옅게 밝아지는 천 빛)
    blanket: track(new THREE.MeshPhysicalMaterial({ color: 0xffffff, map: quiltTex, normalMap: quiltNormal, normalScale: new THREE.Vector2(0.6, 0.6), roughness: 0.95, metalness: 0, vertexColors: true, sheen: 0.6, sheenRoughness: 0.75, sheenColor: new THREE.Color(0x7d8fb4), envMapIntensity: 0.6 })),
    // 담요 밑으로 보이는 수납장 받침 (어두운 호두색 나무)
    plinth: std(0x6b4a30, 0.0, 0.62),
    sensor: std(0xb8bec5, 0.2, 0.35, { emissive: 0xc5cad0, emissiveIntensity: 0.12 }),
    sensorBody: std(0x24282d, 0.4, 0.4),
    film: track(new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0, roughness: 0.12, transparent: true, opacity: 0.18, depthWrite: false, clearcoat: 1, clearcoatRoughness: 0.2 })),
    contact: track(new THREE.MeshBasicMaterial({ map: contactTex, transparent: true, depthWrite: false, opacity: 0.85, toneMapped: false })),
    bedSoft: track(new THREE.MeshBasicMaterial({ map: bedSoftTex, transparent: true, depthWrite: false, opacity: 0.6, toneMapped: false })),
    bedTight: track(new THREE.MeshBasicMaterial({ map: bedTightTex, transparent: true, depthWrite: false, opacity: 0.75, toneMapped: false })),
    bedContact: track(new THREE.MeshBasicMaterial({ map: bedContactTex, transparent: true, depthWrite: false, opacity: 1, toneMapped: false })),
    // 쇼룸 바닥 원판: 거의 검은 반짝이는 바닥 (거칠기 0.3, 환경 빛을 흐리게 비춘다) + 1 m 격자. 가장자리는 알파로 녹는다
    //   (빛을 받지 않는 재료: 주광 · 테두리 빛이 반짝이는 바닥에 크고 흰 반점을 만들어 무대 끝에서 잘렸다. 반사는 그림에 구운 웅덩이로)
    floor: track(new THREE.MeshBasicMaterial({ color: 0xffffff, map: floorTex, transparent: true, depthWrite: false })),
    // 짐 하나하나 밑 AO (상자 · 포대 · 받침이 바닥에 앉아 보이게)
    itemAo: track(new THREE.MeshBasicMaterial({ map: itemAoTex, color: 0x000000, transparent: true, depthWrite: false, opacity: 0.8, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })),
    // 짐 바로 밑 좁은 닿는 그림자 (짐 바닥 1.05 배): 진한 바닥 위에서도 짐이 바닥에 앉아 보이게
    contactTight: track(new THREE.MeshBasicMaterial({ map: bedTightTex, transparent: true, depthWrite: false, opacity: 0.6, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 })),
    // 앞 표시 꺾쇠: --muted 색 납작한 V (바닥에 칠한 듯)
    //   = --muted 50 % (상태 색과 다투지 않게)
    chevron: track(new THREE.MeshBasicMaterial({ color: 0x959ca4, transparent: true, opacity: 0.5, toneMapped: false, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })),
  }
  // 상자마다 밝기가 ±4 % 다르고 (sRGB 기준, 선형 곱 ±9 %) 색도 조금씩 다르다 (노란 · 붉은 · 회색 기운). 가운데 = #B4895A
  const TINTS: [number, number, number][] = [
    [1, 1, 1],
    [1.09, 1.07, 1.02],
    [0.91, 0.9, 0.88],
    [1.05, 0.99, 0.9],
    [0.95, 0.97, 0.99],
  ]
  const cartonN = new THREE.Vector2(0.35, 0.35)
  // 상자 재료 하나 (아틀라스 x 상자 색 = 꼭짓점 색). 테이프 · 송장은 거칠기 지도로 조금 더 반짝인다
  //   거칠기 지도의 R 채널 = 투명 막 (테이프만): 테이프가 크라프트 위에서 반짝이는 얇은 비닐로 읽힌다
  const cartonMat = track(new THREE.MeshPhysicalMaterial({ color: 0xe6d2bc, metalness: 0, roughness: 1, map: cartonAtlas, roughnessMap: cartonAtlasRough, normalMap: cartonNormal, normalScale: cartonN, vertexColors: true, clearcoat: 0.9, clearcoatRoughness: 0.12, clearcoatMap: cartonAtlasRough }))
  M.appliance.roughness = 1
  M.appliance.roughnessMap = applianceRough
  M.appliance.normalMap = cartonNormal
  M.appliance.normalScale = cartonN
  // 글꼴(Pretendard) · 사진 질감 그림이 늦게 오면 그것이 든 질감을 다시 그린다
  let disposed = false
  function redrawPrinted() {
    if (disposed) return
    for (const p of printed) {
      const cv = p.t.image as HTMLCanvasElement
      const c = cv.getContext('2d')!
      c.clearRect(0, 0, cv.width, cv.height)
      seed = p.s
      p.draw(c, cv.width, cv.height)
      p.t.needsUpdate = true
    }
    invalidate()
  }
  if (!fontOk())
    document.fonts
      ?.load('700 40px Pretendard')
      .then(() => {
        if (!disposed && fontOk()) redrawPrinted()
      })
      .catch(() => {})
  loadImg('kraft', 'kraft.jpg')
  // 옆면 인쇄: 사진의 큰 '취급주의 / ↑↑' 인쇄 (side_print.png 에서 인쇄 칸만 잘라 512 px): 내비 크기에서도 읽힌다
  loadImg('side', 'side_print_big.jpg')
  loadImg('waybill', 'waybill.jpg')
  loadImg('tape', 'tape.jpg')
  loadImg('web', 'webbing.png')
  // 가전 상자 윗면: 크라프트 + 가운데 이음 + 테이프 띠
  const applianceTop = std(0xffffff, 0, 0.86, {
    map: printTex(256, 256, (c, w, h) => {
      kraft(c, w, h)
      c.fillStyle = 'rgba(40,24,8,0.7)'
      c.fillRect(w / 2 - 1.5, 0, 3, h)
      tape(c, w * 0.42, 0, w * 0.16, h, 'y')
    }),
    normalMap: cartonNormal,
    normalScale: cartonN,
  })
  const applianceMats = [M.appliance, M.appliance, applianceTop, M.appliance, M.appliance, M.appliance]
  // 위에서 보기에서 반사를 따로 낮출 재료: 방 반사를 직접 달아 envMapIntensity 가 듣게 한다
  // 모서리 기둥 · 골 끝은 반사를 낮춘다 (뒤 모서리가 흰 세로 띠로 타지 않고 모양이 남게)
  const POST_ENV = 0.55
  const SWAGE_ENV = 0.8
  for (const m of [M.gateCap, M.post, M.swage]) {
    m.envMap = env.texture
    m.envMapIntensity = ENV_I
  }
  M.post.envMapIntensity = POST_ENV
  M.swage.envMapIntensity = SWAGE_ENV
  // 옆문 판은 방 반사를 조금 더 (어두운 방에서 판이 검게 묻히지 않고 중간 회색으로: 결을 따라 빛 줄이 선다)
  const GATE_ENV = 1.0
  M.gate.envMap = env.texture
  M.gate.envMapIntensity = GATE_ENV
  M.gate.envMapRotation.copy(scene.environmentRotation)
  for (const m of [M.gateCap, M.post, M.swage]) m.envMapRotation.copy(scene.environmentRotation)
  // 앞 보호 틀 강관 · 버클 강철: 검은 방에서 검게 묻히지 않게 반사를 1.7 · 1.4 배 (사진의 밝은 크롬 관 · 버클)
  M.rail.envMap = env.texture
  M.rail.envMapIntensity = 0.9
  M.steel.envMap = env.texture
  M.steel.envMapIntensity = 1.4
  M.deckTop.envMap = env.texture
  // 진짜 하늘 HDR: 오면 스튜디오에 얹어 환경 빛을 다시 굽는다. 처음 그림은 이것을 0.8 s 까지 기다린다 (반사가 바뀌며 번쩍이지 않게).
  //   움직임이 꺼져 있으면 (주행 · 움직임 줄이기) 기다리지 않는다: 밝아지는 페이드가 없으니 반사가 바뀌어도 번쩍임이 보이지 않는다
  let envReady = false
  let hdrOk = false
  const initT = performance.now()
  new HDRLoader().load(
    ENV_URL,
    (tex) => {
      if (disposed) return tex.dispose()
      const next = bakeEnv(tex)
      tex.dispose()
      const old = env
      env = next
      scene.environment = env.texture
      for (const m of [M.gate, M.gateCap, M.post, M.swage, M.rail, M.steel, M.deckTop]) m.envMap = env.texture
      old.dispose()
      envReady = true
      hdrOk = true
      invalidate()
    },
    undefined,
    () => {
      envReady = true
      invalidate()
    },
  )

  /**
   * 빛 지나감 (정차 화면의 '우와'): 비스듬한 빛 띠 하나가 적재함을 화면 왼쪽(뒤) → 오른쪽(앞)으로 천천히 쓸고 지나간다 (사진 광고의 라이트 바).
   *   재료 셰이더에 세계 좌표 띠를 더한다 (그림 한 장 값: 빛 · 그림자 계산 없음). 금속은 진하게, 크라프트 · 바닥은 옅게.
   *   uSweepAmt 0 이면 아무것도 하지 않는다 (주행 · 움직임 줄이기 · 세 번 다 지난 뒤)
   */
  const sweepU = { uSweepPos: { value: -9 }, uSweepAmt: { value: 0 }, uSweepDir: { value: new THREE.Vector3(0.62, 0.45, -0.79).normalize() } }
  const addSweep = (m: THREE.Material, k: number) => {
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, sweepU, { uSweepK: { value: k } })
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vSweepW;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvSweepW = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;')
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vSweepW;\nuniform float uSweepPos;\nuniform float uSweepAmt;\nuniform float uSweepK;\nuniform vec3 uSweepDir;')
        .replace(
          '#include <opaque_fragment>',
          `if ( uSweepAmt > 0.0 ) {
	float sd = dot( vSweepW, uSweepDir ) - uSweepPos;
	float band = 0.45 * exp( - sd * sd / 0.05 ) + exp( - sd * sd / 0.0035 );
	float fr = 1.0 - abs( dot( normalize( normal ), normalize( vViewPosition ) ) );
	outgoingLight += vec3( 1.0, 0.95, 0.88 ) * ( uSweepAmt * uSweepK * band * ( 0.3 + 0.7 * fr * fr ) );
}
#include <opaque_fragment>`,
        )
    }
    m.customProgramCacheKey = () => 'sweep'
  }
  addSweep(M.gate, 1.3)
  addSweep(M.gateCap, 2.4)
  addSweep(M.swage, 1.4)
  addSweep(M.rail, 1.8)
  addSweep(M.post, 1.0)
  addSweep(M.steel, 1.4)
  addSweep(M.deckTop, 0.22)
  addSweep(cartonMat, 0.16)
  const bagMats = [0xf4eee4, 0xe8dfd2, 0xddd3c6].map((t) => std(t, 0, 0.92, { map: bagTex, normalMap: cartonNormal, normalScale: new THREE.Vector2(0.5, 0.5), envMapIntensity: 0.6 }))
  /**
   * 포대 하나: 속이 찬 종이 포대 (베개처럼 둥근 옆 · 도톰한 윗면 · 꿰맨 양 끝이 납작하게 오므라든다). 모서리는 두께의 45 % 로 둥글게.
   * UV: u = 폭, v = 포대 길이 (양 끝 박음질이 늘 v 0 · 1). 모양은 크기마다 한 번만 만든다.
   */
  const sackCache = new Map<string, THREE.BufferGeometry>()
  const sackG = (w: number, h: number, l: number) => {
    const k = [w, h, l].map((v) => v.toFixed(3)).join(',')
    let g = sackCache.get(k)
    if (g) return g
    g = track(new RoundedBoxGeometry(w, h, l, 6, Math.min(0.055, h * 0.45)))
    const p = g.getAttribute('position') as THREE.BufferAttribute
    const uv = g.getAttribute('uv') as THREE.BufferAttribute
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i)
      const y = p.getY(i)
      const z = p.getZ(i)
      const ny = (2 * y) / h
      const nx = Math.min(1, Math.abs((2 * x) / w))
      const nz = Math.min(1, Math.abs((2 * z) / l))
      const face = nx >= Math.abs(ny) && nx >= nz ? 'x' : Math.abs(ny) >= nz ? 'y' : 'z'
      // 꿰맨 양 끝: 두께가 40 % 까지 납작해지고 폭도 조금 오므라든다
      const pinch = Math.pow(nz, 5)
      // 옆 불룩 (가운데 높이 · 가운데 길이에서 가장 크다)
      const belly = 1 + 0.05 * (1 - ny * ny) * (1 - nz * nz)
      // 윗면 · 밑면이 도톰하게 (가운데 18 % 솟음)
      const crown = 0.18 * (1 - nx * nx) * (1 - nz * nz)
      const yy = y * (1 - 0.4 * pinch) + Math.sign(y) * (h / 2) * crown * (y > 0 ? 1 : 0.35)
      p.setXYZ(i, x * belly * (1 - 0.06 * pinch), yy, z)
      if (face === 'x') uv.setXY(i, ny * 0.5 + 0.5, z / l + 0.5)
      else if (face === 'y') uv.setXY(i, x / w + 0.5, z / l + 0.5)
      else uv.setXY(i, x / w + 0.5, ny * 0.5 + 0.5)
    }
    g.computeVertexNormals()
    sackCache.set(k, g)
    return g
  }

  /**
   * 이사 담요로 싼 눕힌 수납장 (담요 부분 w x h x l, 바닥 = -h/2). 수납장은 단단하므로 담요는 판판하고 모서리가 또렷하다
   *   (반지름 2.2 cm: 둥근 덩어리가 아니라 네모난 가구로 읽힌다). 천 모양:
   *   옆면 아래 단(6 cm)이 조금 벌어지며 얕은 물결 · 아래 끝 어두운 바이어스 테두리 ·
   *   끝면(±Z)은 선물 포장처럼 위 모서리에서 가운데 아래로 접어 넣은 두 줄 접힘 (골이 어둡고 그 바깥 날개가 조금 솟는다) ·
   *   윗면은 아주 얕은 잔주름만. 꼭짓점 색 = 접힘 골 · 아래 테두리 어둡게
   */
  const BLANKET_R = 0.022
  const blanketG = (w: number, h: number, l: number) => {
    const r = BLANKET_R
    const g = new THREE.BoxGeometry(w, h, l, 36, 18, 64)
    const p = g.getAttribute('position') as THREE.BufferAttribute
    const col = new Float32Array(p.count * 3)
    const hw = w / 2
    const hh = h / 2
    const hl = l / 2
    const v = new THREE.Vector3()
    const q = new THREE.Vector3()
    const n = new THREE.Vector3()
    const gauss = (x: number, s: number) => Math.exp(-(x * x) / (s * s))
    const ss = (a: number, b: number, x: number) => {
      const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
      return t * t * (3 - 2 * t)
    }
    const uvA = g.getAttribute('uv') as THREE.BufferAttribute
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i)
      // 원래 상자 면 (가장 바깥에 닿은 축)
      const fx = Math.abs(v.x) / hw
      const fy = Math.abs(v.y) / hh
      const fz = Math.abs(v.z) / hl
      const face = fx >= fy && fx >= fz ? 'x' : fy >= fz ? 'y' : 'z'
      q.set(THREE.MathUtils.clamp(v.x, -hw + r, hw - r), THREE.MathUtils.clamp(v.y, -hh + r, hh - r), THREE.MathUtils.clamp(v.z, -hl + r, hl - r))
      n.copy(v).sub(q)
      const len = n.length() || 1
      n.divideScalar(len)
      v.copy(q).addScaledVector(n, r)
      const up = (v.y + hh) / h
      let d = 0
      let shade = 1
      if (n.y > 0.6) {
        // 윗면: 아주 얕은 잔주름 (2 mm)
        d += 0.002 * Math.sin((v.z / l) * Math.PI * 4 + 0.7) * Math.cos((v.x / w) * Math.PI)
      } else if (n.y > -0.6) {
        const endFace = Math.abs(n.z) > 0.6
        const along = endFace ? v.x / hw : v.z / hl
        // 아래 단 (6 cm): 바깥으로 조금 벌어지고 얕은 물결 (12 cm 마다)
        const skirt = 1 - ss(0, 0.06 / h, up)
        const wave = Math.sin(along * (endFace ? hw : hl) * ((Math.PI * 2) / 0.12) + along * 3)
        const dh = skirt * (0.008 + 0.003 * wave)
        v.x += n.x * dh
        v.z += n.z * dh
        shade -= skirt * 0.12 * Math.max(0, -wave)
        // 옆면 아주 옅은 불룩 (2 mm)
        d += 0.002 * Math.sin(Math.PI * up) * (1 - along * along)
        if (endFace) {
          // 접어 넣은 끝: 위 모서리 (±1, 1) 에서 가운데 아래 (0, 0.32) 로 가는 두 접힘 골
          const s = Math.abs(v.x) / hw
          const t = up
          const crease = t > 0.32 ? (t - 0.32) / 0.68 : 0
          const dist = s - crease
          const k = t > 0.3 ? gauss(dist, 0.05) : 0
          d -= 0.006 * k
          shade -= 0.26 * k
          // 접힘 바깥 날개 (모서리 쪽)는 3 mm 솟는다
          if (dist > 0 && t > 0.3) d += 0.003 * ss(0, 0.2, dist)
        }
        // 담요 가장자리 테두리 (아래 2 cm, 어두운 바이어스 천)
        if (up < 0.02 / h + 0.001) shade *= 0.5
      }
      v.addScaledVector(n, d)
      p.setXYZ(i, v.x, v.y, v.z)
      col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = Math.max(0.35, shade)
      // UV = m / QUILT_M (면 크기와 상관없이 같은 마름모 크기)
      if (face === 'x') uvA.setXY(i, v.z / QUILT_M, v.y / QUILT_M)
      else if (face === 'y') uvA.setXY(i, v.x / QUILT_M, v.z / QUILT_M)
      else uvA.setXY(i, v.x / QUILT_M, v.y / QUILT_M)
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3))
    g.computeVertexNormals()
    return g
  }

  const rbox = (w: number, h: number, d: number, r = 0.012, seg = 2) => track(new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 3, h / 3, d / 3)))
  const mesh = (g: THREE.BufferGeometry, m: THREE.Material | THREE.Material[], parent: THREE.Object3D, x = 0, y = 0, z = 0, cast = true) => {
    const o = new THREE.Mesh(g, m)
    o.position.set(x, y, z)
    o.castShadow = cast
    o.receiveShadow = true
    parent.add(o)
    return o
  }
  /**
   * 그리기 횟수 줄이기 (내비 헤드 유닛): root 아래 메시들을 재료 · 그림자 · 그리는 순서 · 층이 같은 것끼리 한 덩어리로 합친다.
   *   재료가 여럿인 메시 · keep 에 든 자식은 그대로 둔다. own = 합친 모양을 장면이 끝날 때까지 가진다 (적재함처럼 늘 있는 것).
   *   거울로 뒤집힌 부품(x 배율 -1)은 삼각형 감기를 되돌려 앞면이 그대로 보이게 한다
   */
  const _inv = new THREE.Matrix4()
  const _rel = new THREE.Matrix4()
  function bake(root: THREE.Object3D, keep: THREE.Object3D[] = [], own = false) {
    root.updateMatrixWorld(true)
    _inv.copy(root.matrixWorld).invert()
    const buckets = new Map<string, { mat: THREE.Material; cast: boolean; order: number; layers: number; geos: THREE.BufferGeometry[] }>()
    const visit = (o: THREE.Object3D) => {
      for (const c of [...o.children]) {
        if (keep.includes(c)) continue
        const m = c as THREE.Mesh
        if (m.isMesh && !Array.isArray(m.material)) {
          if (!m.visible) continue
          _rel.multiplyMatrices(_inv, m.matrixWorld)
          const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()
          for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv' && k !== 'color') g.deleteAttribute(k)
          if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2))
          g.clearGroups()
          g.applyMatrix4(_rel)
          if (_rel.determinant() < 0) {
            for (const a of Object.values(g.attributes) as THREE.BufferAttribute[]) {
              const sz = a.itemSize
              const arr = a.array as Float32Array
              for (let t = 0; t + 2 < a.count; t += 3)
                for (let j = 0; j < sz; j++) {
                  const i1 = (t + 1) * sz + j
                  const i2 = (t + 2) * sz + j
                  const tmp = arr[i1]
                  arr[i1] = arr[i2]
                  arr[i2] = tmp
                }
            }
          }
          const key = [m.material.uuid, m.castShadow ? 1 : 0, m.renderOrder, m.layers.mask, g.getAttribute('color') ? 'c' : ''].join('|')
          let b = buckets.get(key)
          if (!b) buckets.set(key, (b = { mat: m.material, cast: m.castShadow, order: m.renderOrder, layers: m.layers.mask, geos: [] }))
          b.geos.push(g)
          o.remove(c)
          if (!disposables.includes(m.geometry)) m.geometry.dispose()
        } else if (c.children.length) {
          visit(c)
          if (!c.children.length) o.remove(c)
        }
      }
    }
    visit(root)
    for (const b of buckets.values()) {
      const merged = b.geos.length === 1 ? b.geos[0] : mergeGeometries(b.geos, false)
      if (b.geos.length > 1) for (const g of b.geos) g.dispose()
      if (!merged) continue
      if (own) track(merged)
      const o = new THREE.Mesh(merged, b.mat)
      o.castShadow = b.cast
      o.receiveShadow = true
      o.renderOrder = b.order
      o.layers.mask = b.layers
      root.add(o)
    }
  }

  // ── 스튜디오 바닥: 그림자만 받는다 (색은 무대 칸의 CSS 그라데이션). 적재함 밑에는 넓고 부드러운 닿는 그림자 둘 ──
  const groundMat = track(new THREE.ShadowMaterial({ opacity: 0.75 }))
  // 바닥 그림자는 적재함에서 멀어질수록 사라진다 (무대 가장자리에서 그림자가 잘려 네모 경계가 생기지 않게)
  groundMat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vGp;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGp = (modelMatrix * vec4(position, 1.0)).xz;')
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vGp;')
      .replace('opacity * ( 1.0 - getShadowMask() )', 'opacity * ( 1.0 - getShadowMask() ) * ( 1.0 - smoothstep( 1.08, 1.55, length( vGp * vec2( 0.85, 0.62 ) ) ) )')
  }
  const ground = new THREE.Mesh(track(new THREE.PlaneGeometry(24, 24)), groundMat)
  ground.rotation.x = -Math.PI / 2
  ground.position.y = GROUND_Y
  ground.receiveShadow = true
  scene.add(ground)
  ground.renderOrder = -1
  const floorPlane = track(new THREE.PlaneGeometry(1, 1))
  const bedSoft = new THREE.Mesh(floorPlane, M.bedSoft)
  bedSoft.rotation.x = -Math.PI / 2
  bedSoft.scale.set(W + 1.3, L + 1.3, 1)
  bedSoft.position.y = GROUND_Y + 0.001
  bedSoft.renderOrder = 0
  const bedTight = new THREE.Mesh(floorPlane, M.bedTight)
  bedTight.rotation.x = -Math.PI / 2
  bedTight.scale.set(W + 0.18, L + 0.18, 1)
  bedTight.position.y = GROUND_Y + 0.002
  const bedContact = new THREE.Mesh(floorPlane, M.bedContact)
  bedContact.rotation.x = -Math.PI / 2
  // 구운 닿는 그림자: 적재함 바닥(밑 틀 포함)의 1.4 배, 바로 밑 (2026-11-15: 1.2 → 1.4 · 더 진하게)
  bedContact.scale.set((W + 0.09) * BED_CONTACT_K, (L + 0.09) * BED_CONTACT_K, 1)
  bedContact.position.y = GROUND_Y + 0.0015
  // 쇼룸 바닥 원판 (반짝이는 검은 바닥 + 옅은 1 m 격자, 가장자리는 투명): 그림자 판들보다 먼저 (밑에) 그린다
  const floor = new THREE.Mesh(floorPlane, M.floor)
  floor.rotation.x = -Math.PI / 2
  floor.scale.set(FLOOR_D, FLOOR_D, 1)
  floor.position.y = GROUND_Y - 0.0005
  floor.renderOrder = -2
  scene.add(floor, bedSoft, bedContact, bedTight)
  for (const o of [ground, floor, bedSoft, bedContact, bedTight]) o.layers.set(FLOOR_LAYER)


  // ── 적재함 (PV5 오픈베드 2,420 x 1,785 mm · 옆문 · 뒷문 355 mm · 앞 보호 틀 · 고리). 차는 그리지 않는다 ──
  const bed = new THREE.Group()
  scene.add(bed)
  const sideH = BED.sideH
  const wallH = BED.wallH
  mesh(rbox(W + 0.09, 0.05, L + 0.09, 0.006), [M.deckSide, M.deckSide, M.deckTop, M.deckSide, M.deckSide, M.deckSide], bed, 0, -0.025, 0)
  // 밑 틀 (세로 보 둘 + 가로 보 넷): 낮고 안쪽으로 들인다. 바닥 판 아래로 UNDER_H 만 (적재함 높이의 10 % 이하)
  for (const sx of [-1, 1]) mesh(rbox(0.09, UNDER_H, L - 0.12, 0.006), M.frame, bed, sx * 0.45, -0.05 - UNDER_H / 2, 0)
  for (const z of [-0.95, -0.32, 0.32, 0.95]) mesh(rbox(W - 0.16, UNDER_H * 0.8, 0.06, 0.006), M.frame, bed, 0, -0.05 - UNDER_H * 0.4, z)
  // 옆문 · 뒷문 (결 낸 알루미늄, 판마다 눌러 낸 가로 골 둘, 굵고 둥근 윗 덮개, 알루미늄 모서리 기둥, 눌러 들어간 기둥 구멍)
  // 윗 덮개: 둥근 관 (반지름 25 mm, 말린 윗 테두리) -> 길이를 따라 빛 줄 하나가 또렷이 선다
  const CAP_R = 0.025
  const CAP_H = CAP_R * 2
  const CAP_Y = sideH + 0.02
  const capTube = (len: number) => track(new THREE.CylinderGeometry(CAP_R, CAP_R, len, 32, 1))
  // 옆 덮개는 앞 덮개 관 속까지 (앞 모서리에서 틈 없이 이어진다), 뒤 끝은 모서리 기둥 속
  const capG = capTube(L + 0.03)
  const SWAGE_Y = [sideH * 0.36, sideH * 0.66]
  const ribX = rbox(0.012, 0.016, L - 0.07, 0.006, 3)
  const ribZ = rbox(W - 0.07, 0.016, 0.012, 0.006, 3)
  const sideOut = W / 2 + 0.0395
  const sideIn = W / 2 + 0.0045
  const rearOut = L / 2 + 0.0395
  const rearIn = L / 2 + 0.0045
  for (const sx of [-1, 1]) {
    mesh(rbox(0.035, sideH, L - 0.02, 0.006), M.gate, bed, sx * (W / 2 + 0.022), sideH / 2, 0)
    for (const y of SWAGE_Y) {
      mesh(ribX, M.swage, bed, sx * (sideOut + 0.002), y, 0, false)
      mesh(ribX, M.swage, bed, sx * (sideIn - 0.002), y, 0, false)
    }
    mesh(capG, M.gateCap, bed, sx * (W / 2 + 0.022), CAP_Y, -0.015).rotation.x = Math.PI / 2
    mesh(rbox(0.068, sideH + 0.05, 0.068, 0.014, 4), M.post, bed, sx * (W / 2 + 0.022), (sideH + 0.05) / 2, L / 2 + 0.02)
    // (예전 옆판의 작은 어두운 네모 = 로프 고리 구멍은 어느 크기에서나 스티커처럼 읽혀 뺐다)
  }
  mesh(rbox(W - 0.02, sideH, 0.035, 0.006), M.gate, bed, 0, sideH / 2, L / 2 + 0.022)
  for (const y of SWAGE_Y) {
    mesh(ribZ, M.swage, bed, 0, y, rearOut + 0.002, false)
    mesh(ribZ, M.swage, bed, 0, y, rearIn - 0.002, false)
  }
  mesh(capTube(W + 0.02), M.gateCap, bed, 0, CAP_Y, L / 2 + 0.022).rotation.z = Math.PI / 2
  // 앞 보호 틀 (운전석 쪽, 사진과 같이): 아래는 옆문과 같은 알루미늄 판 (골 · 윗 덮개), 그 위로 솔질 강관 틀
  //   (기둥 둘 · 가로 관 둘 · 세로 살 둘 = 칸 3 x 2). 관은 둥근 단면이라 빛 줄이 길게 선다
  const fz = -L / 2 - 0.03
  // 앞 보호 틀 부품 (위에서 보기 = 직교에서는 주광 그림자를 끈다: 적재함 밖에 격자 그림자가 '두 번째 앞 틀'처럼 보이지 않게)
  const head = new THREE.Group()
  bed.add(head)
  let headboard: THREE.Mesh[] = []
  mesh(rbox(W + 0.06, sideH, 0.035, 0.006), M.gate, head, 0, sideH / 2, fz)
  for (const y of SWAGE_Y) {
    mesh(ribZ, M.swage, head, 0, y, fz + 0.0195, false)
    mesh(ribZ, M.swage, head, 0, y, fz - 0.0195, false)
  }
  mesh(capTube(W + 0.09), M.gateCap, head, 0, CAP_Y, fz).rotation.z = Math.PI / 2
  // 앞 덮개 관 끝 (둥근 마개)
  for (const sx of [-1, 1]) mesh(track(new THREE.SphereGeometry(CAP_R, 20, 12)), M.gateCap, head, sx * (W / 2 + 0.045), CAP_Y, fz)
  // 관 반지름 34 mm (예전 21 mm 의 1.6 배: 내비 크기에서 철사처럼 읽혔다), 28 각 (빛 줄이 끊기지 않게)
  const TUBE_R = 0.032
  const tube = (len: number) => track(new THREE.CylinderGeometry(TUBE_R, TUBE_R, len, 28, 1))
  const railY0 = CAP_Y + CAP_H / 2
  const postH = wallH - railY0
  const postG = tube(postH)
  for (const sx of [-1, 1]) mesh(postG, M.rail, head, sx * (W / 2 - 0.01), railY0 + postH / 2, fz)
  for (const sx of [-1 / 3, 1 / 3]) mesh(postG, M.rail, head, sx * (W - 0.02), railY0 + postH / 2, fz)
  const railG = tube(W - 0.02 + TUBE_R * 2)
  for (const y of [wallH, railY0 + postH * 0.5]) mesh(railG, M.rail, head, 0, y, fz).rotation.z = Math.PI / 2
  // 모서리 이음 (위 두 모서리를 둥근 공으로: 관이 꺾여 이어진 듯)
  const knuckle = track(new THREE.SphereGeometry(TUBE_R * 1.02, 28, 14))
  for (const sx of [-1, 1]) mesh(knuckle, M.rail, head, sx * (W / 2 - 0.01), wallH, fz)
  let headShadow = true
  const setHeadShadow = (on: boolean) => {
    if (on === headShadow) return
    headShadow = on
    for (const m of headboard) m.castShadow = on
    shadowDirty = true
  }
  // 고리 (양옆 바닥, 25 cm 마다): 벨트 갈고리를 여기에 건다
  const ringG = track(new THREE.TorusGeometry(0.026, 0.006, 6, 14))
  const ringBaseG = rbox(0.07, 0.008, 0.05, 0.003)
  for (const z of RING_Z)
    for (const sx of [-1, 1]) {
      mesh(ringBaseG, M.darkSteel, bed, sx * HOOK_X, 0.004, z, false)
      const r = mesh(ringG, M.steel, bed, sx * HOOK_X, 0.026, z, false)
      r.rotation.y = Math.PI / 2
    }
  // 움직이지 않는 적재함 부품을 재료마다 한 덩어리로 (앞 보호 틀은 그림자를 따로 켜고 끄므로 따로)
  bake(bed, [head], true)
  bake(head, [], true)
  headboard = head.children as THREE.Mesh[]

  // ── 앞 표시: 바닥에 칠한 꺾쇠 둘 (앞 = -Z 를 가리킨다) ──
  const chevShape = new THREE.Shape()
  {
    const s = 0.17
    const a = 0.055
    const t = 0.055
    chevShape.moveTo(-s, -a)
    chevShape.lineTo(0, a)
    chevShape.lineTo(s, -a)
    chevShape.lineTo(s, -a - t)
    chevShape.lineTo(0, a - t)
    chevShape.lineTo(-s, -a - t)
    chevShape.closePath()
  }
  const chevG = track(new THREE.ShapeGeometry(chevShape))
  const chevrons = new THREE.Group()
  for (const dz of [0, 0.12]) {
    const m = new THREE.Mesh(chevG, M.chevron)
    m.rotation.x = -Math.PI / 2
    m.position.set(0, 0, dz)
    m.renderOrder = 1
    chevrons.add(m)
  }
  chevrons.position.y = 0.002
  chevrons.traverse((o) => o.layers.set(FLOOR_LAYER))
  scene.add(chevrons)

  // ── 짐 (cargoRoot = 짐 가운데, 기울기는 여기서) · 벨트 · 센서 ──
  const cargoRoot = new THREE.Group()
  const cargoBody = new THREE.Group()
  cargoRoot.add(cargoBody)
  const tagPuck = new THREE.Group()
  const guards = new THREE.Group()
  cargoBody.add(tagPuck, guards)
  const straps = new THREE.Group()
  const sensors = new THREE.Group()
  const contact = new THREE.Mesh(floorPlane, M.contact)
  contact.rotation.x = -Math.PI / 2
  contact.renderOrder = 1
  const contactTight = new THREE.Mesh(floorPlane, M.contactTight)
  // contact 의 자식 (같이 움직인다). 자리 z = 바닥에서 1.5 mm 위, 크기는 buildCargo 에서 짐 바닥에 맞춘다
  contactTight.renderOrder = 1
  contactTight.position.set(0, 0, 0.0015)
  contact.add(contactTight)
  contact.layers.set(FLOOR_LAYER)
  contactTight.layers.set(FLOOR_LAYER)
  scene.add(cargoRoot, straps, sensors, contact)
  let cargoBuilt: CargoKind | null = null
  /** 닿는 그림자 · AO 의 제자리 값 (짐이 올라오는 동안 여기서 조여진다) */
  const contactBase = new THREE.Vector3(1, 1, 1)
  let contactOpacity = 0.85
  let contactTightOpacity = 0.8
  let itemAoOpacity = 0.8

  const dropMesh = (o: THREE.Object3D) =>
    o.traverse((x) => {
      const m = x as THREE.Mesh
      if (m.geometry && !disposables.includes(m.geometry)) m.geometry.dispose()
    })
  function clearGroup(g: THREE.Group) {
    for (const c of [...g.children]) {
      g.remove(c)
      dropMesh(c)
    }
  }

  /** 상자 하나 (모서리 7 mm 둥글게, 아틀라스 질감, 색은 다섯 중 하나). 짐을 다 만든 뒤 bake 가 한 덩어리로 합친다 */
  const carton = (parent: THREE.Object3D, w: number, h: number, l: number, x: number, y: number, z: number, tint = 0, yaw = 0) => {
    const m = mesh(cartonGeo(w, h, l, TINTS[tint % TINTS.length]), cartonMat, parent, x, y, z)
    m.rotation.y = yaw
    return m
  }

  function buildCargo(kind: CargoKind) {
    for (const c of [...cargoBody.children])
      if (c !== tagPuck && c !== guards) {
        cargoBody.remove(c)
        dropMesh(c)
      }
    cargoBuilt = kind
    seed = 7 + kind.length * 131
    const { l, w, h } = CARGO[kind].size
    const body = cargoBody
    const jit = (a: number) => (rnd() - 0.5) * a
    const tint = () => Math.floor(rnd() * TINTS.length)
    /** 바닥에 닿는 짐 하나 밑 AO 판 (짐 바닥 1.15 배, 바닥 2.5 mm 위). 그림자를 드리우지 않는다 */
    const ao = (aw: number, al: number, x: number, z: number) => {
      const m = mesh(floorPlane, M.itemAo, body, x, 0.0025, z, false)
      m.rotation.x = -Math.PI / 2
      m.scale.set(aw * 1.15, al * 1.15, 1)
      m.renderOrder = 1
    }
    if (kind === 'pallet') {
      // 나무 팔레트 (윗널 일곱 · 받침 아홉 · 밑널 셋, 널 사이는 어둡다) + 상자 세 단 + 모서리 보호대 + 랩
      const ph = 0.144
      mesh(rbox(w - 0.04, 0.01, l - 0.04, 0.003), M.gap, body, 0, ph - 0.027, 0, false)
      for (let k = 0; k < 7; k++) mesh(rbox(w, 0.022, 0.1, 0.004), M.wood, body, 0, ph - 0.011, -l / 2 + 0.05 + (k * (l - 0.1)) / 6)
      for (const xx of [-1, 0, 1]) {
        mesh(rbox(0.1, 0.022, l, 0.004), M.woodDark, body, xx * (w / 2 - 0.05), ph - 0.033, 0)
        for (const zz of [-1, 0, 1]) mesh(rbox(0.1, 0.078, 0.14, 0.004), M.woodDark, body, xx * (w / 2 - 0.05), 0.061, zz * (l / 2 - 0.07))
        mesh(rbox(0.1, 0.022, l, 0.004), M.wood, body, xx * (w / 2 - 0.05), 0.011, 0)
        ao(0.1, l, xx * (w / 2 - 0.05), 0)
      }
      const layers = 3
      const bh = (h - ph) / layers
      const sw = w - 0.06
      const sl = l - 0.06
      for (let iy = 0; iy < layers; iy++)
        for (const ix of [-1, 1])
          for (const iz of [-1, 1]) carton(body, sw / 2 - 0.006, bh - 0.004, sl / 2 - 0.006, (ix * sw) / 4 + jit(0.006), ph + bh * iy + bh / 2, (iz * sl) / 4 + jit(0.006), tint(), jit(0.012))
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) mesh(rbox(0.05, h - ph, 0.05, 0.004), M.protector, body, sx * (sw / 2 - 0.012), ph + (h - ph) / 2, sz * (sl / 2 - 0.012), false)
      mesh(rbox(sw + 0.022, h - ph - 0.02, sl + 0.022, 0.03), M.film, body, 0, ph + (h - ph) / 2 - 0.01, 0, false)
    } else if (kind === 'appliance') {
      // 세운 가전 상자: 나무 받침 + 모서리 둥근 키 큰 상자 + ㄱ자 모서리 보호대 + 포장 끈
      const sk = 0.05
      for (const sz of [-1, 1]) {
        mesh(rbox(w, sk, 0.1, 0.004), M.woodDark, body, 0, sk / 2, sz * (l / 2 - 0.08))
        ao(w, 0.1, 0, sz * (l / 2 - 0.08))
      }
      mesh(rbox(w - 0.012, h - sk, l - 0.012, 0.02, 3), applianceMats, body, 0, sk + (h - sk) / 2, 0)
      const ph = h - sk - 0.03
      const plateX = rbox(0.006, ph, 0.07, 0.002)
      const plateZ = rbox(0.07, ph, 0.006, 0.002)
      for (const sx of [-1, 1])
        for (const sz of [-1, 1]) {
          const cx = sx * (w / 2 - 0.004)
          const cz = sz * (l / 2 - 0.004)
          mesh(plateX, M.protector, body, cx, sk + (h - sk) / 2, cz - sz * 0.033, false)
          mesh(plateZ, M.protector, body, cx - sx * 0.033, sk + (h - sk) / 2, cz, false)
        }
      for (const y of [0.3, 0.72]) mesh(rbox(w + 0.006, 0.014, l + 0.006, 0.002), M.band, body, 0, h * y, 0, false)
    } else if (kind === 'furniture') {
      // 이사 담요로 싼 눕힌 수납장: 담요 밑으로 수납장 받침(어두운 나무 굽 띠)이 6 cm 보인다 = 덩어리가 아니라 가구.
      //   담요는 판판하고 모서리가 또렷하며, 끝면은 선물 포장처럼 접어 넣었다 (담요는 묶음 벨트가 잡는다)
      const ph = 0.06
      mesh(rbox(w - 0.03, ph, l - 0.03, 0.006), M.plinth, body, 0, ph / 2, 0)
      ao(w - 0.03, l - 0.03, 0, 0)
      const bh = h - ph
      mesh(blanketG(w, bh, l), M.blanket, body, 0, ph + bh / 2, 0)
    } else if (kind === 'material') {
      // 받침목 셋 위 짠 PP 포대 (한 포대 45 x 60 x 13 cm 쯤) 네 단. 단마다 반 칸씩 엇갈려 묶음이 단단해 보이게
      const dn = 0.08
      for (const zz of [-1, 0, 1]) {
        mesh(rbox(w, dn, 0.08, 0.006), M.woodDark, body, 0, dn / 2, zz * (l / 2 - 0.1))
        ao(w, 0.08, 0, zz * (l / 2 - 0.1))
      }
      const layers = 4
      const bh = (h - dn) / layers
      const nx = 2
      const nz = 2
      const bw = w / nx
      const bl = l / nz
      const g = sackG(bw - 0.02, bh - 0.004, bl - 0.024)
      for (let iy = 0; iy < layers; iy++) {
        // 홀수 단은 앞뒤로 3 cm 비켜 놓는다 (쌓은 자국)
        const off = iy % 2 ? 0.015 : -0.015
        for (let ix = 0; ix < nx; ix++)
          for (let iz = 0; iz < nz; iz++) {
            const m = mesh(g, bagMats[(ix * 2 + iz + iy) % bagMats.length], body, -w / 2 + bw * (ix + 0.5) + jit(0.01), dn + bh * (iy + 0.5) - 0.002, -l / 2 + bl * (iz + 0.5) + off + jit(0.01))
            m.rotation.y = jit(0.03)
          }
      }
    } else {
      // 쌓은 골판지 상자 넷 (2 단 x 앞뒤 둘, 상자 하나 80 x 50 x 40 cm: 옆면이 사진 인쇄 비율 1.25 와 같다).
      //   윗단은 조금 작고 비뚤게 (손으로 쌓은 자국)
      const bh = h / 2
      for (const iz of [-1, 1]) {
        const x = jit(0.006)
        carton(body, w - 0.008, bh - 0.004, l / 2 - 0.008, x, bh / 2, (iz * l) / 4, tint(), jit(0.01))
        ao(w - 0.008, l / 2 - 0.008, x, (iz * l) / 4)
      }
      for (const iz of [-1, 1]) carton(body, w - 0.03, bh - 0.006, l / 2 - 0.022, jit(0.012), bh + bh / 2, (iz * l) / 4 + jit(0.01), tint(), jit(0.02))
    }
    // 짐 부품을 재료마다 한 덩어리로 (상자 여럿 = 그리기 한 번)
    bake(body, [tagPuck, guards])
    // 키트 태그 (짐 윗면 뒤 오른쪽 모서리: 보는 쪽)
    clearGroup(tagPuck)
    mesh(rbox(0.09, 0.022, 0.09, 0.006), M.sensorBody, tagPuck, 0, 0.011, 0)
    mesh(rbox(0.05, 0.006, 0.05, 0.002), M.sensor, tagPuck, 0, 0.024, 0, false)
    tagPuck.position.set(w / 2 - 0.11, h, l / 2 - 0.11)
    contact.scale.set(w + 0.26, l + 0.26, 1)
    contactBase.copy(contact.scale)
    // 좁은 그림자: 질감의 진한 칸이 가운데 80 % 라 1.05 / 0.8 배로 키우면 진한 칸 = 짐 바닥 1.05 배
    const k = 1.05 / 0.8
    contactTight.scale.set((w * k) / (w + 0.26), (l * k) / (l + 0.26), 1)
  }

  /** 벨트 띠 (폭 50 mm 짜임 띠, 모서리를 부드럽게). u 는 길이를 따라 20 cm 마다 한 번 (웨빙 그림 한 장) */
  function ribbon(pts: THREE.Vector3[], width: number, tension = 0.05) {
    const pos: number[] = []
    const uv: number[] = []
    const idx: number[] = []
    const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', tension)
    const P = curve.getSpacedPoints(72)
    let len = 0
    P.forEach((p, i) => {
      if (i) len += p.distanceTo(P[i - 1])
      pos.push(p.x, p.y, p.z - width / 2, p.x, p.y, p.z + width / 2)
      uv.push(len / 0.2, 0, len / 0.2, 1)
      if (i < P.length - 1) {
        const a = i * 2
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
      }
    })
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
    g.setIndex(idx)
    g.computeVertexNormals()
    return g
  }

  const strapMats = new Map<string, THREE.MeshStandardMaterial>()
  const pulseMats = new Set<THREE.MeshStandardMaterial>()
  /** 더 걸 자리 재료: 정차 중 1.5 s 로 자체 빛만 옅게 숨쉰다 (띠는 늘 불투명) */
  const hintMats = new Set<THREE.MeshStandardMaterial>()
  const HINT_GLOW = PROBLEM_GLOW
  const problem = (t: MarkTone) => t === 'orange' || t === 'red'
  const strapMat = (tone: MarkTone, hint = false, rubber = false) => {
    // 문제 벨트(주황 · 빨강)만 상태 색. 초록 · 회색 · 중립은 모두 흑연 웨빙 #25282C (상태는 꼬리표 점이 말한다).
    // 그래서 장면 안 색은 문제 벨트와 짐뿐이다
    const k = (problem(tone) ? tone : 'web') + (hint ? '-h' : '') + (rubber ? '-r' : '')
    let m = strapMats.get(k)
    if (!m) {
      const map = rubber ? bungeeTex : webTex
      // 웨빙 = 공단 같은 폴리에스터 짜임: 거칠기 0.6 + 천 sheen (비스듬히 보이는 띠 가장자리가 은은히 밝아진다). 고무바는 sheen 없이
      const satin = (color: number, rough: number, extra: THREE.MeshPhysicalMaterialParameters = {}) =>
        track(new THREE.MeshPhysicalMaterial({ color, metalness: 0, roughness: rubber ? Math.max(rough, 0.85) : rough, map, side: THREE.DoubleSide, sheen: rubber ? 0 : 0.7, sheenRoughness: 0.42, sheenColor: new THREE.Color(0xffffff), ...extra }))
      // 더 걸 자리: 반투명 '유령' 띠가 아니라 불투명한 진짜 띠 (라쳇 · 갈고리까지) 를 문제 색(주황)으로 그린다.
      // 비어 있는 자리라는 것은 꼬리표가 말한다 ("여기에 바 하나 더")
      if (hint) {
        const ht = tone === 'neutral' || tone === 'grey' || tone === 'green' ? 'orange' : tone
        m = satin(WEB_BASE[ht], 0.62, { emissive: WEB_HEX[ht], emissiveIntensity: HINT_GLOW, sheenColor: new THREE.Color(WEB_HEX[ht]) })
        hintMats.add(m)
      } else if (!problem(tone)) m = satin(WEBBING, 0.66, { sheenColor: new THREE.Color(0x8c96a4) })
      else m = satin(WEB_BASE[tone as 'orange' | 'red'], 0.62, { emissive: WEB_HEX[tone as 'orange' | 'red'], emissiveIntensity: PROBLEM_GLOW, sheenColor: new THREE.Color(WEB_HEX[tone as 'orange' | 'red']) })
      strapMats.set(k, m)
      // 문제 벨트(주황 · 빨강)는 정차 중 천천히 숨쉰다 (frame 에서 emissiveIntensity 를 바꾼다)
      if (problem(tone) && !hint) pulseMats.add(m)
    }
    return m
  }

  // 라쳇 버클 · 갈고리 · 모서리 보호대 (모양은 한 번만 만든다)
  const G = {
    ratchetBody: rbox(0.03, 0.12, 0.062, 0.006),
    ratchetSpool: track(new THREE.CylinderGeometry(0.017, 0.017, 0.07, 12)),
    ratchetHandle: rbox(0.012, 0.13, 0.056, 0.004),
    ratchetGrip: rbox(0.02, 0.04, 0.06, 0.006),
    hook: rbox(0.012, 0.07, 0.036, 0.004),
    hookTip: track(new THREE.TorusGeometry(0.02, 0.005, 6, 10, Math.PI)),
    cell: rbox(0.06, 0.1, 0.07, 0.008),
    led: rbox(0.012, 0.05, 0.04, 0.003),
  }
  const gripMat = std(0x141618, 0.1, 0.75)
  // 모서리 보호대 (흑연 플라스틱, 굽은 얇은 판이라 양면)
  const guardMat = std(0x1f2226, 0.05, 0.62, { side: THREE.DoubleSide })

  // 출발 때 자리 = 부드러운 반투명 면 (모서리 선 · 철사 틀 없음): --ink(#F3F4F6) 바닥 발자국 (가장자리가 흐린 둥근 네모, 26 %)
  //   + 네 옆면 (아래 20 % 에서 위로 갈수록 사라진다). 적재함 안쪽으로 자르고 높이는 옆문 윗 덮개까지만 (GHOST_MAX_H):
  //   키 큰 짐도 공중에 높은 유리 상자가 서지 않고, 짐이 떨어져도 출발 때 자리는 적재함 안에 머문다
  const GHOST_INK = 0xf3f4f6
  const ghostFade = canvasTex(4, 64, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h)
    g.addColorStop(0, '#000')
    g.addColorStop(0.35, '#222')
    g.addColorStop(1, '#fff')
    c.fillStyle = g
    c.fillRect(0, 0, w, h)
  }, false, false)
  const ghostFillMat = track(new THREE.MeshBasicMaterial({ color: GHOST_INK, alphaMap: ghostFade, transparent: true, opacity: 0.2, depthWrite: false, toneMapped: false }))
  const ghostFootMat = track(new THREE.MeshBasicMaterial({ color: GHOST_INK, map: softRect(0.06, 3, 1), transparent: true, opacity: 0.26, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }))
  const ghost = new THREE.Group()
  // 옆면 넷만 (윗면 · 밑면 없음)
  const ghostG = track(new THREE.BoxGeometry(1, 1, 1))
  {
    const ix = ghostG.getIndex()!.array
    ghostG.setIndex([...Array.from(ix.slice(0, 12)), ...Array.from(ix.slice(24, 36))])
    ghostG.clearGroups()
  }
  const ghostBox = new THREE.Mesh(ghostG, ghostFillMat)
  ghostBox.renderOrder = 2
  const ghostFoot = new THREE.Mesh(floorPlane, ghostFootMat)
  ghostFoot.rotation.x = -Math.PI / 2
  ghostFoot.renderOrder = 2
  ghost.add(ghostFoot, ghostBox)
  ghost.visible = false
  ghost.traverse((o) => o.layers.set(FLOOR_LAYER))
  scene.add(ghost)
  /** 흐린 자리가 차지하는 범위 (세계 좌표, 적재함 안쪽으로 자름, 높이는 GHOST_MAX_H 까지): 꼬리표 기준점 · 겹침 · 볼 범위에 쓴다 */
  const ghostBounds = new THREE.Box3()
  function setGhost(on: boolean, w: number, h: number, l: number, at: THREE.Vector3) {
    const hg = Math.min(h, GHOST_MAX_H)
    const x0 = Math.max(-W / 2 + 0.01, at.x - w / 2)
    const x1 = Math.min(W / 2 - 0.01, at.x + w / 2)
    const z0 = Math.max(-L / 2 + 0.01, at.z - l / 2)
    const z1 = Math.min(L / 2 - 0.01, at.z + l / 2)
    ghostBounds.set(new THREE.Vector3(x0, 0, z0), new THREE.Vector3(x1, hg, z1))
    ghost.visible = on && x1 > x0 && z1 > z0
    if (!ghost.visible) return
    ghost.position.set((x0 + x1) / 2, 0.003, (z0 + z1) / 2)
    ghostBox.scale.set(x1 - x0, hg, z1 - z0)
    ghostBox.position.y = hg / 2
    ghostFoot.scale.set((x1 - x0) * 1.06, (z1 - z0) * 1.06, 1)
    ghostFoot.position.y = 0.0015
  }

  // ── 꼬리표 · 배지 · 화살 (DOM + SVG, 화면 좌표) ──
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('class', 'bv-lines')
  tagLayer.appendChild(svg)
  const arrowG = document.createElementNS(SVG_NS, 'g')
  const arrowLine = document.createElementNS(SVG_NS, 'line')
  const arrowHead = document.createElementNS(SVG_NS, 'path')
  arrowG.append(arrowLine, arrowHead)
  arrowG.setAttribute('class', 'bv-arrow')
  arrowG.style.display = 'none'
  svg.appendChild(arrowG)
  // '앞' (바닥 꺾쇠 옆 작은 글. 꺾쇠를 둘 자리가 없으면 앞 보호 틀 위)
  const frontEl = document.createElement('div')
  frontEl.className = 'bv-dir'
  frontEl.textContent = '앞'
  tagLayer.appendChild(frontEl)

  type TagEl = { el: HTMLDivElement; line: SVGLineElement; dot: SVGCircleElement; html: string; w: number; h: number; at: TagAnchor; side?: 'left' | 'right'; x: number; y: number }
  const tagEls = new Map<string, TagEl>()
  /** 순서 배지 하나 = 번호 하나. 같은 번호 벨트가 여럿이면 배지 하나를 그 버클들 가운데에 두고 벨트마다 가는 끌어 선 + 8px 점 */
  type BadgeEl = { el: HTMLDivElement; lines: SVGLineElement[]; dots: SVGCircleElement[]; belts: number[]; n: number }
  const badgeEls = new Map<string, BadgeEl>()
  const toneClass = (t: MarkTone) => 'tone-' + t

  function setTags(list: StageTag[]) {
    const seen = new Set<string>()
    for (const t of list.slice(0, MAX_TAGS)) {
      seen.add(t.id)
      const html = `<i class="dot"></i><b>${esc(t.text)}</b>`
      let e = tagEls.get(t.id)
      if (!e) {
        const el = document.createElement('div')
        const line = document.createElementNS(SVG_NS, 'line')
        const dot = document.createElementNS(SVG_NS, 'circle')
        dot.setAttribute('r', '4')
        svg.insertBefore(line, arrowG)
        svg.insertBefore(dot, arrowG)
        tagLayer.appendChild(el)
        el.dataset.id = t.id
        // 빨강 꼬리표는 처음 한 번만 점이 퍼진다
        el.className = 'bv-tag ' + toneClass(t.tone) + (t.tone === 'red' ? ' new' : '')
        e = { el, line, dot, html: '', w: 0, h: 0, at: t.at, side: t.side, x: 0, y: 0 }
        tagEls.set(t.id, e)
      } else {
        const keepNew = e.el.classList.contains('new') && t.tone === 'red'
        e.el.className = 'bv-tag ' + toneClass(t.tone) + (keepNew ? ' new' : '')
      }
      e.at = t.at
      e.side = t.side
      if (e.html !== html) {
        e.html = html
        e.el.innerHTML = html
      }
      e.line.setAttribute('class', toneClass(t.tone))
      e.dot.setAttribute('class', toneClass(t.tone))
    }
    for (const [id, e] of tagEls) {
      if (seen.has(id)) continue
      e.el.remove()
      e.line.remove()
      e.dot.remove()
      tagEls.delete(id)
    }
  }

  function setBadges(belts: BeltMark[]) {
    // 번호별로 벨트를 모은다 (같은 번호 = 같이 할 일, 배지는 하나)
    const groups = new Map<number, number[]>()
    belts.forEach((b, k) => {
      if (!b.badge) return
      const g = groups.get(b.badge) ?? []
      g.push(k)
      groups.set(b.badge, g)
    })
    const seen = new Set<string>()
    for (const [n, ks] of groups) {
      const id = 'n' + n
      seen.add(id)
      let e = badgeEls.get(id)
      if (!e) {
        const el = document.createElement('div')
        el.className = 'bv-badge'
        tagLayer.appendChild(el)
        e = { el, lines: [], dots: [], belts: [], n }
        badgeEls.set(id, e)
      }
      // 끌어 선 · 점 수를 벨트 수에 맞춘다
      while (e.lines.length < ks.length) {
        const line = document.createElementNS(SVG_NS, 'line')
        const dot = document.createElementNS(SVG_NS, 'circle')
        dot.setAttribute('r', '4')
        svg.insertBefore(line, arrowG)
        svg.insertBefore(dot, arrowG)
        e.lines.push(line)
        e.dots.push(dot)
      }
      while (e.lines.length > ks.length) {
        e.lines.pop()!.remove()
        e.dots.pop()!.remove()
      }
      e.belts = ks
      e.n = n
      ks.forEach((k, j) => {
        const t = belts[k].tone
        const tone = toneClass(t === 'neutral' ? 'grey' : t)
        e.lines[j].setAttribute('class', 'lead ' + tone)
        e.dots[j].setAttribute('class', tone)
      })
      e.el.textContent = String(n)
    }
    for (const [id, e] of badgeEls) {
      if (seen.has(id)) continue
      e.el.remove()
      for (const l of e.lines) l.remove()
      for (const d of e.dots) d.remove()
      badgeEls.delete(id)
    }
  }

  // ── 낮 · 밤 (앱 뿌리의 data-theme): 테마는 하나(검정)이고 낮 · 밤은 노출 한 단계와 바닥 그림자 진하기만 바꾼다 ──
  function readTheme() {
    const n = !!host.closest('[data-theme="night"]')
    const cs = getComputedStyle(host)
    const sh = parseFloat(cs.getPropertyValue('--stage-shadow'))
    groundMat.opacity = Number.isFinite(sh) && sh > 0 ? sh : n ? 0.8 : 0.75
    renderer.toneMappingExposure = n ? 0.92 : 1.0
    invalidate()
  }
  const themeMo = new MutationObserver(() => readTheme())
  themeMo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'], subtree: true })
  // 무대 위 앱 부품(알림 토스트 · 보기 단추)이 생기거나 사라지면 꼬리표 자리를 다시 고른다
  //   (2026-11-15) 보이는 무대가 바뀌면 (폰 보기 알약이 늦게 붙는 경우) 적재함 자리도 다시 맞춘다
  const uiMo = new MutationObserver(() => {
    const v = visibleRect()
    if (Math.abs(v.x - vis.x) + Math.abs(v.y - vis.y) + Math.abs(v.w - vis.w) + Math.abs(v.h - vis.h) > 2) refit()
    else invalidate()
  })
  queueMicrotask(() => {
    const box = tagLayer.parentElement?.parentElement
    if (box) uiMo.observe(box, { childList: true })
  })

  // ── 장면 값 ──
  let input: BedInput | null = null
  const startPos = new THREE.Vector3()
  const cargoPos = new THREE.Vector3()
  let hidden = false
  let moved = 0
  // ── 움직임 (DESIGN_SPEC §8.2): 주행 중(data-mode="drive") · 움직임 줄이기 설정이면 모두 멈춘다 ──
  const reduceMq = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null
  const motionOk = () => !reduceMq?.matches && !host.closest('[data-mode="drive"]')
  let hasPulse = false
  let hasHint = false
  let pulseT0 = -1
  let hintT0 = -1
  let pulseKey = ''
  let hintKey = ''
  let slideKey = ''
  let slide: { t0: number; dx: number; dz: number } | null = null
  const easeOut = (k: number) => 1 - Math.pow(1 - k, 3)
  function applySlide(k: number) {
    const f = slide ? 1 - easeOut(Math.max(0, Math.min(1, k))) : 0
    const ox = slide ? slide.dx * f : 0
    const oz = slide ? slide.dz * f : 0
    cargoRoot.position.x = cargoPos.x + ox
    cargoRoot.position.z = cargoPos.z + oz
    contact.position.x = cargoPos.x + ox
    contact.position.z = cargoPos.z + oz
    straps.position.set(ox, 0, oz)
    sensors.position.set(ox, 0, oz)
  }
  /** 벨트별 기준점: 위 왼쪽 모서리 · 위 오른쪽 모서리 · 버클 (보는 쪽 = 오른쪽) · 장력 센서 */
  let beltPts: { topL: THREE.Vector3; topR: THREE.Vector3; buckle: THREE.Vector3; cell: THREE.Vector3; sideR: THREE.Vector3; edgeL: THREE.Vector3; tanR: THREE.Vector3; hookR: THREE.Vector3 }[] = []
  let arrow: { a: THREE.Vector3; b: THREE.Vector3 } | null = null
  const startBox = new THREE.Box3()
  const cargoBox = new THREE.Box3()
  let reserveTop = 0
  /** '앞' 글 자리 (바닥 꺾쇠 뒤, 없으면 앞 보호 틀 위) */
  const frontAt = new THREE.Vector3()
  /** 꺾쇠 앞 끝 (글은 꺾쇠 뒤 끝에서 이 반대쪽으로 글 크기만큼 비켜 놓는다) */
  const frontTip = new THREE.Vector3()
  let frontOnDeck = false

  /**
   * 값 열쇠 (2026-11-15, 그리기 아끼기): 앱은 정차 중에도 약 2 s 마다 같은 값을 새 객체로 넘긴다. 예전에는 그때마다 벨트를 다시 만들고
   *   그림자 지도 · PCSS · MSAA · GTAO 를 모두 다시 그렸다 (같은 그림 35 장). 이제:
   *   값이 그대로면 아무것도 안 한다 · 꼬리표 글만 바뀌면 꼬리표 자리만 다시 고른다 (3D 는 안 그린다) ·
   *   그림자 지도는 짐 자세 · 종류 · 벨트 모양이 바뀔 때만 다시 계산한다
   */
  let lastFullKey = ''
  let lastSceneKey = ''
  let lastShadowKey = ''
  const r3 = (v: number) => Math.round(v * 1000) / 1000
  function update(i: BedInput) {
    const fullKey = JSON.stringify(i)
    if (fullKey === lastFullKey) return
    lastFullKey = fullKey
    const shadowKey = JSON.stringify([
      i.kind,
      i.frontWall,
      i.beltType,
      !!i.empty,
      i.lost,
      !!i.fallen,
      i.pose ? [r3(i.pose.x), r3(i.pose.z), r3(i.pose.lift), Math.round(i.pose.tilt * 10) / 10] : null,
      i.shift ? [r3(i.shift.x), r3(i.shift.z)] : null,
      i.belts.map((b) => [!!b.hint, b.loose ?? null, b.tone === 'red']),
      i.sensors ?? null,
    ])
    const sceneKey = JSON.stringify([shadowKey, i.belts.map((b) => b.tone), i.ghost, !!i.focus])
    if (sceneKey === lastSceneKey && input) {
      // 꼬리표 · 배지 글 · 화살 색만 바뀌었다: 3D 는 그대로, 겹침 자리만 다시 고른다
      input = i
      applyTags(i)
      if (shown) placeOverlay()
      else invalidate()
      return
    }
    lastSceneKey = sceneKey
    dbg.updates++
    const shadowChanged = shadowKey !== lastShadowKey
    lastShadowKey = shadowKey
    input = i
    const spec = CARGO[i.kind].size
    if (cargoBuilt !== i.kind) buildCargo(i.kind)
    const zc = cargoCenterZ(i.kind, i.frontWall)
    startPos.set(0, 0, zc)
    let px = 0
    let pz = 0
    let lift = 0
    let tilt = 0
    if (i.pose) {
      px = i.pose.x
      pz = i.pose.z
      lift = Math.max(0, i.pose.lift)
      tilt = i.pose.tilt
    } else if (i.shift) {
      px = i.shift.x
      pz = i.shift.z
    }
    hidden = !!i.empty || i.lost || !!i.fallen
    let cz = zc + pz
    // 앞벽을 뚫지 않게 (실제로는 벽에서 멈춘다)
    if (Math.abs(tilt) < 5) cz = Math.max(-L / 2 + 0.01 + spec.l / 2, cz)
    const tipSide = px < -0.01 ? -1 : 1
    const rz = -tipSide * THREE.MathUtils.degToRad(tilt)
    if (!hidden) {
      // 기운 짐이 옆문 · 바닥을 뚫지 않게 (2026-11-15, 넘어지는 중 자세 = 오른쪽 84 cm · 30°): 짐 단면(가로 x 높이)의 네 모서리를 돌려
      //   가장 낮은 모서리가 바닥 위에 오도록 들고, 옆문 윗 덮개 높이 아래 부분은 옆문 안쪽 면 안에 들어오게 x 를 당긴다.
      //   윗 덮개보다 높은 부분은 밖으로 나가도 된다 (윗 덮개에 기대어 넘어가는 모습)
      const c = Math.cos(rz)
      const s = Math.sin(rz)
      const q = [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ].map(([a, b]) => {
        const x = (a * spec.w) / 2
        const y = (b * spec.h) / 2
        return { x: x * c - y * s, y: spec.h / 2 + lift + x * s + y * c }
      })
      const minY = Math.min(...q.map((p) => p.y))
      if (minY < 0) {
        lift -= minY
        for (const p of q) p.y -= minY
      }
      const railTop = BED.sideH + 0.045
      let x0 = Infinity
      let x1 = -Infinity
      for (let k = 0; k < 4; k++) {
        const a = q[k]
        const b = q[(k + 1) % 4]
        if (a.y <= railTop) {
          x0 = Math.min(x0, a.x)
          x1 = Math.max(x1, a.x)
        }
        if ((a.y - railTop) * (b.y - railTop) < 0) {
          const x = a.x + ((railTop - a.y) / (b.y - a.y)) * (b.x - a.x)
          x0 = Math.min(x0, x)
          x1 = Math.max(x1, x)
        }
      }
      const wall = W / 2 - 0.004
      if (Number.isFinite(x1) && px + x1 > wall) px = wall - x1
      if (Number.isFinite(x0) && px + x0 < -wall) px = -wall - x0
    }
    cargoPos.set(px, lift, cz)
    moved = Math.hypot(px, cz - zc)
    cargoRoot.position.set(px, spec.h / 2 + lift, cz)
    cargoRoot.rotation.set(0, 0, rz)
    cargoBody.position.set(0, -spec.h / 2, 0)
    cargoRoot.visible = !hidden
    tagPuck.visible = !!i.sensors?.tag
    cargoRoot.updateMatrixWorld(true)
    startBox.set(new THREE.Vector3(-spec.w / 2, 0, zc - spec.l / 2), new THREE.Vector3(spec.w / 2, spec.h, zc + spec.l / 2))
    if (hidden) cargoBox.copy(startBox)
    else cargoBox.setFromObject(cargoBody)

    // 닿는 그림자: 짐 밑 바닥에 (들리면 옅어진다)
    contact.visible = !hidden
    contact.position.set(px, 0.004, cz)
    const onFloor = Math.max(0, 1 - lift / 0.25) * (Math.abs(tilt) > 25 ? 0.4 : 1)
    contactOpacity = M.contact.opacity = 0.85 * onFloor
    // 좁은 그림자는 짐이 바닥에 닿아 있을 때만 (들리거나 3° 넘게 기울면 끈다: 기운 짐 밑에 네모 그림자가 남지 않게)
    contactTightOpacity = M.contactTight.opacity = 0.8 * Math.max(0, 1 - lift / 0.05)
    contactTight.visible = Math.abs(tilt) < 3
    // 짐 하나하나 밑 AO 도 바닥에 닿아 있을 때만 (기울거나 들리면 공중에 검은 테가 뜨지 않게)
    itemAoOpacity = M.itemAo.opacity = 0.8 * Math.max(0, 1 - lift / 0.03)
    M.itemAo.visible = Math.abs(tilt) < 3
    contact.scale.copy(contactBase)
    cargoBody.scale.y = 1

    // 벨트: 갈고리는 적재함 고리에 (출발 때 자리에서 가장 가까운 빈 고리), 윗면은 짐을 따라간다
    clearGroup(straps)
    clearGroup(sensors)
    clearGroup(guards)
    beltPts = []
    const n = i.empty ? 0 : i.belts.length
    const rubber = i.beltType === 'rubber'
    // 띠 길 (짐 좌표, 띠 면 = z 고정): 갈고리 -> 짐 옆면 아래 -> 옆면을 따라 위로 -> 위 모서리를 둥근 호로 넘어 -> 윗면 -> 반대쪽도 같이.
    //   띠는 짐 겉면에서 STRAP_OFF (2.5 cm) 띄우고, 모서리마다 모서리 보호대(굽은 판)가 띠 밑에 있다.
    //   (예전: 위 모서리에서 갈고리로 곧장 내려가 줄처럼 보였고, 고무바는 상자 윗면에 붙어 상자를 자르는 검은 선처럼 보였다)
    const rc = CORNER_R[i.kind]
    const pad = i.kind === 'material' ? 0.012 : 0
    const STRAP_OFF = 0.025
    const cxAbs = spec.w / 2 - rc
    const cy = spec.h - rc
    const R = rc + pad + STRAP_OFF
    const arcAt = (sx: number, psi: number, r = R) => new THREE.Vector3(sx * (cxAbs + r * Math.cos(psi)), cy + r * Math.sin(psi), 0)
    /** 띠가 옆면을 떠나 갈고리로 가는 높이 (짐 좌표): 짐 높이의 30 %, 6 ~ 22 cm */
    const yDown = Math.min(cy, THREE.MathUtils.clamp(spec.h * 0.3, 0.06, 0.22))
    let lastRing = -1
    // 새 짐이 올라오는 중이면 (arrival) 벨트를 하나씩 그려 넣으므로 벨트마다 무리(bg · gg)를 따로 두고 다 그린 뒤에 합친다
    const arriving = startArrivalIf(i)
    beltAnim = []
    for (let k = 0; k < n; k++) {
      const b = i.belts[k]
      const bg = new THREE.Group()
      straps.add(bg)
      const gg = new THREE.Group()
      guards.add(gg)
      const anim: BeltAnim = { group: bg, guard: gg, web: null }
      beltAnim.push(anim)
      const zl = -spec.l / 2 + (spec.l * (k + 0.5)) / Math.max(1, n)
      let hookZ = zc + zl
      let ri = -1
      let best = 1e9
      for (let r = lastRing + 1; r <= RING_Z.length - (n - k); r++) {
        const d = Math.abs(RING_Z[r] - hookZ)
        if (d < best) {
          best = d
          ri = r
        }
      }
      if (ri >= 0) {
        hookZ = RING_Z[ri]
        lastRing = ri
      }
      const a = new THREE.Vector3(-HOOK_X, 0.035, hookZ)
      const a2 = new THREE.Vector3(HOOK_X, 0.035, hookZ)
      // 호: 왼쪽 옆면 -> 왼쪽 위, 오른쪽 위 -> 오른쪽 옆면 (90° 를 다 돈다. 짐 좌표에서 만든 뒤 세계로)
      const arc = (sx: number, from: number, to: number) => {
        const steps = Math.max(1, Math.ceil(Math.abs(to - from) / (Math.PI / 12)))
        return Array.from({ length: steps + 1 }, (_, s) => arcAt(sx, from + ((to - from) * s) / steps).setZ(zl))
      }
      const arcL = arc(-1, 0, Math.PI / 2)
      const arcR = arc(1, Math.PI / 2, 0)
      /** 옆면을 따라 내려가는 곧은 띠 (위 -> 아래, 점 넷) */
      const side = (sx: number) => {
        const x = sx * (cxAbs + R)
        return [0.66, 0.33, 0].map((t) => new THREE.Vector3(x, yDown + (cy - yDown) * t, zl))
      }
      const sideL = side(-1).reverse()
      const sideR = side(1)
      const toW = (p: THREE.Vector3) => cargoBody.localToWorld(p.clone())
      const pathW = [...sideL, ...arcL, ...arcR, ...sideR].map(toW)
      // top[0] = 왼쪽 옆면 아래 (띠가 짐을 떠나는 곳) · top[1] = 왼쪽 위 · top[2] = 오른쪽 위 · top[3] = 오른쪽 옆면 아래
      const top = [toW(sideL[0]), toW(arcL[arcL.length - 1]), toW(arcR[0]), toW(sideR[sideR.length - 1])]
      const loose = (b.loose ?? b.tone === 'red') && !b.hint && !hidden
      let pts = [a, ...pathW, a2]
      if (loose) {
        // 느슨한 띠: 옆이 불룩하게 처진다
        const ml = a.clone().lerp(top[0], 0.5)
        ml.x -= 0.08
        ml.y -= 0.06
        const mr = a2.clone().lerp(top[3], 0.5)
        mr.x += 0.08
        mr.y -= 0.06
        pts = [a, ml, ...pathW, mr, a2]
      }
      if (hidden) {
        // 풀린 띠: 바닥에 늘어져 있다
        pts = [
          a,
          new THREE.Vector3(-HOOK_X + 0.25, 0.02, hookZ + 0.06),
          new THREE.Vector3(-0.2, 0.025, hookZ - 0.05),
          new THREE.Vector3(0.25, 0.025, hookZ + 0.04),
          new THREE.Vector3(HOOK_X - 0.3, 0.02, hookZ - 0.05),
          a2,
        ]
      }
      const mat = strapMat(b.tone, !!b.hint, rubber)
      if (rubber) {
        const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'catmullrom', loose ? 0.5 : 0.05), 64, 0.011, 8)
        anim.web = mesh(tube, mat, bg, 0, 0, 0, !b.hint)
      } else {
        anim.web = mesh(ribbon(pts, 0.05, loose ? 0.5 : 0.05), mat, bg, 0, 0, 0, !b.hint)
      }
      // 버클 · 센서는 보는 쪽 (오른쪽, +X) 내려오는 띠에
      const c = top[3]
      const buckle = a2.clone().lerp(c, 0.34)
      const cell = a2.clone().lerp(c, 0.66)
      // 왼쪽 기준으로 만든 부품을 X 로 뒤집어 붙인다 (왼쪽 띠 기울기 = 오른쪽 띠를 거울에 비춘 기울기)
      const leanL = Math.atan2(c.y - a2.y, -(c.x - a2.x)) - Math.PI / 2
      {
        // 갈고리 (양 끝, 고리에 건다). 더 걸 자리 띠도 진짜 띠처럼 갈고리 · 라쳇까지 그린다
        for (const [p, q] of [[a, top[0]], [a2, c]] as const) {
          const hk = mesh(G.hook, M.steel, bg, p.x, p.y, p.z, false)
          hk.rotation.z = hidden ? Math.PI / 2 : Math.atan2(q.y - p.y, q.x - p.x) - Math.PI / 2
          mesh(G.hookTip, M.steel, bg, p.x, 0.022, p.z, false)
        }
      }
      if (!rubber && !hidden) {
        // 라쳇 버클 (사진처럼 도금 강철): 몸통 · 감는 축 · 손잡이는 강철, 손잡이 끝 고무만 검정. 조일 곳에 배지
        const rt = new THREE.Group()
        rt.position.copy(buckle)
        rt.rotation.z = -leanL
        rt.scale.x = -1
        mesh(G.ratchetBody, M.steel, rt, -0.018, 0, 0)
        mesh(G.ratchetSpool, M.steel, rt, -0.032, 0.012, 0, false).rotation.x = Math.PI / 2
        mesh(G.ratchetHandle, M.steel, rt, -0.062, 0.068, 0).rotation.z = 0.5
        mesh(G.ratchetGrip, gripMat, rt, -0.094, 0.126, 0, false).rotation.z = 0.5
        bg.add(rt)
      }
      if (!hidden) {
        // 모서리 보호대 (띠가 짐 모서리를 넘는 곳, 짐과 같이 움직인다): 짐 모서리를 감싸는 두께 2 cm 의 굽은 ㄱ자 판.
        //   띠(짐 2.5 cm 위)가 그 위에 얹혀 모서리를 감아 돈다. 윗면 · 옆면으로 7 cm 씩. 라쳇 벨트 · 고무바 모두. 짐 좌표 (guards 는 cargoBody 의 자식)
        const ri = rc + pad + 0.002
        const ro = rc + pad + 0.022
        const leg = 0.07
        const gw = rubber ? 0.08 : 0.11
        for (const sx of [-1, 1]) {
          const sh = new THREE.Shape()
          const at = (r: number, psi: number) => new THREE.Vector2(sx * (cxAbs + r * Math.cos(psi)), cy + r * Math.sin(psi))
          sh.moveTo(sx * (cxAbs - leg), cy + ro)
          for (let s = 0; s <= 8; s++) {
            const q = at(ro, (Math.PI / 2) * (1 - s / 8))
            sh.lineTo(q.x, q.y)
          }
          sh.lineTo(sx * (cxAbs + ro), cy - leg)
          sh.lineTo(sx * (cxAbs + ri), cy - leg)
          for (let s = 0; s <= 8; s++) {
            const q = at(ri, (Math.PI / 2) * (s / 8))
            sh.lineTo(q.x, q.y)
          }
          sh.lineTo(sx * (cxAbs - leg), cy + ri)
          sh.closePath()
          const eg = new THREE.ExtrudeGeometry(sh, { depth: gw, bevelEnabled: false, curveSegments: 1 })
          eg.translate(0, 0, zl - gw / 2)
          mesh(eg, guardMat, gg, 0, 0, 0, false)
        }
      }
      // 장력 센서 (앞 끝 = c1, 뒤 끝 = c2)
      const which = k === 0 ? 'c1' : k === n - 1 ? 'c2' : null
      if (which && i.sensors?.[which] && !b.hint && !hidden) {
        mesh(G.cell, M.sensorBody, sensors, cell.x + 0.016, cell.y, cell.z).rotation.z = -leanL
        mesh(G.led, M.sensor, sensors, cell.x + 0.05, cell.y, cell.z, false).rotation.z = -leanL
      }
      beltPts.push({ topL: top[1].clone(), topR: top[2].clone(), buckle, cell, sideR: a2.clone().lerp(c, 0.82), edgeL: top[0].clone(), tanR: c.clone(), hookR: a2.clone() })
    }

    // 벨트 · 센서 · 모서리 보호대 부품을 재료마다 한 덩어리로 (벨트 넷 = 그리기 대여섯 번).
    //   새 짐이 올라오는 중이면 벨트를 하나씩 그려 넣은 뒤 (step → finishArrival) 합친다
    bake(sensors)
    if (arriving) applyArrival(performance.now())
    else {
      bake(straps)
      bake(guards)
    }

    // 짐이 밀렸으면 출발 때 자리에서 지금 자리로 한 번 미끄러져 보인다 (정차 중, 1.2 s). 짐 · 벨트 · 센서를 같이 옮긴다
    // 문제 벨트 (주황 · 빨강) 숨쉬기 · 더 걸 자리 숨쉬기: 문제가 새로 생기거나 바뀐 때부터 다섯 번
    const pulling = i.belts.some((b) => problem(b.tone) && !b.hint)
    hasPulse = pulling && !hidden && !i.empty
    hasHint = !hidden && !i.empty && i.belts.some((b) => b.hint)
    const pk = hasPulse ? i.belts.map((b) => b.tone + (b.hint ? 'h' : '')).join() : ''
    if (pk && pk !== pulseKey) pulseT0 = performance.now()
    pulseKey = pk
    const hk = hasHint ? i.belts.map((b) => (b.hint ? 1 : 0)).join() : ''
    if (hk && hk !== hintKey) hintT0 = performance.now()
    hintKey = hk
    const sk = !hidden && !i.empty && moved > 0.02 ? [i.kind, cargoPos.x.toFixed(2), cargoPos.z.toFixed(2)].join(':') : ''
    if (sk && sk !== slideKey && motionOk()) {
      slide = { t0: performance.now() + 250, dx: startPos.x - cargoPos.x, dz: startPos.z - cargoPos.z }
      applySlide(0)
    } else if (!sk) {
      slide = null
      applySlide(1)
    }
    slideKey = sk

    // 출발 때 자리 (흐린 상자) · 밀린 방향 (화살)
    const tilted = Math.abs(tilt) > 3
    setGhost(!i.empty && i.ghost && (moved > 0.02 || hidden || tilted), spec.w, spec.h, spec.l, startPos)
    arrow = null
    if (!hidden && !i.empty && moved > 0.02) {
      // 짐이 비운 자리를 지나는 화살: 출발 때 뒤쪽 면 -> 지금 뒤쪽 면 (짐에 가리지 않는다)
      const d = new THREE.Vector3(cargoPos.x - startPos.x, 0, cargoPos.z - startPos.z)
      const u = d.clone().normalize()
      const ext = Math.abs(u.x) * (spec.w / 2) + Math.abs(u.z) * (spec.l / 2)
      const a = startPos.clone().sub(u.clone().multiplyScalar(ext))
      const b = a.clone().add(d)
      a.y = b.y = 0.02
      arrow = { a, b }
    }

    // 앞 표시: 짐(과 출발 때 자리) 뒤 빈 바닥에 꺾쇠 둘. 빈 바닥이 짧으면 앞 보호 틀 위에 '앞' 글만
    const occMaxZ = i.empty ? -L / 2 : Math.max(startBox.max.z, hidden ? startBox.max.z : cargoBox.max.z)
    const rearFree = L / 2 - occMaxZ
    // 뒷문 가까이는 뒷문에 가려 보이지 않으므로 75 cm 넘게 비어 있을 때만 바닥에 칠한다
    frontOnDeck = rearFree >= 0.75
    chevrons.visible = frontOnDeck
    if (frontOnDeck) {
      const z0 = i.empty ? -L / 2 + 0.45 : occMaxZ + 0.16
      chevrons.position.set(0, 0.002, z0)
      frontAt.set(0, 0.01, z0 + 0.25)
      frontTip.set(0, 0.01, z0 - 0.06)
    } else frontAt.copy(FRONT_TOP)

    applyTags(i)

    // 볼 범위: 모든 모드 · 화면에서 적재함 전체 (밑 틀 ~ 앞 보호 틀 위) + 짐 (기울면 기운 모양 그대로) + 출발 때 자리.
    // 다시 묶기도 같은 범위 (짐만 크게 보면 적재함 왼쪽 · 아래가 잘려 어디인지 읽히지 않는다)
    //   화면에 맞추는 것은 큰 상자 하나가 아니라 실제 모양의 꼭짓점들 (적재함 몸통 · 앞 보호 틀 · 짐 · 출발 때 자리 · 기준점):
    //   '앞 틀 높이 x 적재함 전체' 상자로 맞추면 뒤쪽 빈 공중까지 넣느라 적재함이 작아지고 무대 위가 빈다
    const want = BED_ROI.clone()
    const pts: THREE.Vector3[] = [...BED_PTS]
    const addBox = (b: THREE.Box3) => {
      for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) pts.push(new THREE.Vector3(x, y, z))
      want.union(b)
    }
    if (!i.empty) {
      if (!hidden) addBox(cargoBox)
      if (ghost.visible || hidden) addBox(ghostBounds)
      // 꼬리표 기준점 (벨트 띠 위 · 버클)도 범위 안에. 짐이 없어지면(이탈) 그 점들은 사라진 짐 자세를 따라 멀리 있으므로 뺀다
      if (!hidden)
        for (const b of beltPts) {
          pts.push(b.topL.clone(), b.topR.clone(), b.buckle.clone())
          want.expandByPoint(b.topL).expandByPoint(b.topR).expandByPoint(b.buckle)
        }
    }
    if (!roi.equals(want) && (roi.isEmpty() || want.min.distanceTo(roi.min) + want.max.distanceTo(roi.max) > 0.03)) {
      roi.copy(want)
      roiPts = pts
      computeGoal()
      startTween()
    }
    // 그림자 지도는 짐 자세 · 종류 · 벨트 모양이 바뀔 때만 (벨트 색 · 출발 때 자리만 바뀌면 그대로)
    if (shadowChanged) shadowDirty = true
    // 새 짐: 시점 다가오기를 다시 (시점 바꿈보다 나중에 둔다: 다가오기가 이긴다)
    if (arrival && arrival.t0 < 0 && interactive && view === '3d' && !userMoved) {
      intro = { t0: -1 }
      tween = null
    }
    invalidate()
  }

  /** 꼬리표 · 순서 배지 고르기 (3D 와 따로: 글만 바뀌면 이것만 다시 한다) */
  function applyTags(i: BedInput) {
    // 폰 무대(작은 무대)는 한 번에 하나만: 꼬리표 하나 (화살이 있으면 화살 꼬리표) + 화살. 순서 배지는 화면의 순서 목록이 맡는다
    const small = tagLayer.parentElement?.getAttribute('data-size') === 'sm'
    let tagList = (i.tags ?? autoTags(i)).filter((t) => t.at.kind !== 'arrow' || arrow)
    if (small) {
      const a = tagList.find((t) => t.at.kind === 'arrow')
      tagList = a ? [a] : tagList.slice(0, 1)
    } else {
      // 내비도 꼬리표는 하나: 가장 급한 것 (빨강 > 주황 > 나머지, 같으면 넘겨 준 순서)
      const rank = (t: MarkTone) => (t === 'red' ? 0 : t === 'orange' ? 1 : 2)
      tagList = [...tagList].sort((a, b) => rank(a.tone) - rank(b.tone))
    }
    setTags(tagList)
    setBadges(i.empty || hidden || small ? [] : i.belts)
  }

  // ── 새 짐이 올라온다 (2026-11-15, '우와'를 확인 뒤로): 상차 확인 · 새 운송장일 때 한 번.
  //   짐이 5 cm 위에서 내려앉고 (340 ms, 끝이 느린 곡선) 2.5 % 눌렸다 펴진다 (80 ms) · 닿는 그림자가 같이 조여진다 →
  //   벨트가 하나씩 (80 ms 간격) 갈고리에서 짐을 넘어 반대쪽 갈고리까지 그려진다 (260 ms) → 꼬리표가 나타난다 →
  //   300 ms 뒤 빛 띠가 한 번 지나간다. 시점 다가오기 (1.2 s) 도 같이. 주행 · 움직임 줄이기면 모두 없이 제자리로.
  //   빈 적재함(상차 시트 뒤) 에서는 아무것도 하지 않는다: 확인을 누른 뒤에 보인다
  type BeltAnim = { group: THREE.Group; guard: THREE.Group; web: THREE.Mesh | null }
  let beltAnim: BeltAnim[] = []
  /** 개발 서버 화면 검사용 느리게 (dev.slow). 늘 1 */
  let devSlow = 1
  const dbg = { arrivals: [] as string[], updates: 0, finish: [] as string[] }
  let loadKey = ''
  let loadId: string | null = null
  let arrival: { t0: number; done: boolean } | null = null
  const ARR_DELAY = 160
  const ARR_FALL = 340
  const ARR_SETTLE = 80
  const ARR_DROP = 0.05
  const ARR_BELT_GAP = 40
  const ARR_STAGGER = 80
  const ARR_BELT_MS = 260
  /** 다 끝나는 때 (arrival.t0 부터, ms) */
  const arrivalEnd = () => ARR_DELAY + ARR_FALL + ARR_SETTLE + ARR_BELT_GAP + Math.max(0, beltAnim.length - 1) * ARR_STAGGER + ARR_BELT_MS
  /** 새 짐인지 보고 (짐 종류 · 앞벽 · 운송장) 맞으면 올라오기를 시작한다. 올라오는 중이면 true */
  function startArrivalIf(i: BedInput) {
    const k = i.empty || hidden ? '' : [i.kind, i.frontWall ? 1 : 0, loadId ?? ''].join('|')
    if (k && k !== loadKey && motionOk()) {
      arrival = { t0: -1, done: false }
      dbg.arrivals.push(k + ' @' + Math.round(performance.now()) + ' prev=' + loadKey)
    }
    loadKey = k
    if (!k && arrival) {
      arrival = null
      tagLayer.style.opacity = ''
    }
    return !!arrival && !arrival.done
  }
  /** 올라오기 한 장면 (now). 끝났거나 움직임이 꺼졌으면 제자리로 두고 벨트를 합친다 */
  function applyArrival(now: number) {
    if (!arrival) return
    const spec = input ? CARGO[input.kind].size : null
    const t = arrival.t0 < 0 ? 0 : (now - arrival.t0) / devSlow
    const finish = arrival.done || !motionOk() || t >= arrivalEnd()
    // 짐: 내려앉기 + 눌림
    const tf = THREE.MathUtils.clamp((t - ARR_DELAY) / ARR_FALL, 0, 1)
    const drop = finish ? 0 : ARR_DROP * (1 - easeOut(tf))
    const ts = (t - ARR_DELAY - ARR_FALL) / ARR_SETTLE
    const squash = finish || ts <= 0 || ts >= 1 ? 1 : 1 - 0.025 * Math.sin(Math.PI * ts)
    if (spec) cargoRoot.position.y = spec.h / 2 + cargoPos.y + drop
    cargoBody.scale.y = squash
    // 닿는 그림자: 들려 있으면 넓고 옅다 → 내려앉으며 조여진다
    const e = drop / ARR_DROP
    contact.scale.copy(contactBase).multiplyScalar(1 + 0.3 * e).setZ(1)
    M.contact.opacity = contactOpacity * (1 - 0.6 * e)
    M.contactTight.opacity = contactTightOpacity * (1 - e)
    M.itemAo.opacity = itemAoOpacity * (1 - e)
    // 벨트: 하나씩 그려 넣는다 (띠는 그리는 범위를 늘려 갈고리 → 짐 위 → 반대쪽 갈고리)
    const t0b = ARR_DELAY + ARR_FALL + ARR_SETTLE + ARR_BELT_GAP
    beltAnim.forEach((b, k) => {
      const p = finish ? 1 : THREE.MathUtils.clamp((t - t0b - k * ARR_STAGGER) / ARR_BELT_MS, 0, 1)
      b.group.visible = p > 0
      b.guard.visible = p > 0
      const g = b.web?.geometry
      if (g?.index) {
        const n = g.index.count
        g.setDrawRange(0, p >= 1 ? Infinity : Math.ceil((n * easeOut(p)) / 6) * 6)
      }
    })
    sensors.visible = finish || t >= arrivalEnd() - ARR_BELT_MS * 0.5
    tagLayer.style.opacity = finish || t >= arrivalEnd() - 60 ? '1' : '0'
    shadowDirty = true
    if (finish) {
      dbg.finish.push(`t=${Math.round(t)} done=${arrival.done} motion=${motionOk()} @${Math.round(now)}`)
      arrival.done = true
      for (const b of beltAnim) {
        b.web?.geometry.setDrawRange(0, Infinity)
        b.group.visible = b.guard.visible = true
      }
      bake(straps)
      bake(guards)
      beltAnim = []
      arrival = null
      // 빛 띠 한 번: 다 내려앉고 300 ms 뒤 (움직임이 켜져 있을 때만)
      if (motionOk() && view === '3d' && !userMoved) {
        sweepT0 = now + 300
        sweepsDone = false
      }
    }
  }
  // ── 카메라 ──
  const controls = new OrbitControls(camera, renderer.domElement)
  controls.enabled = interactive
  controls.enablePan = false
  controls.enableDamping = true
  controls.dampingFactor = 0.12
  controls.minPolarAngle = 0.05
  controls.maxPolarAngle = 1.35
  controls.rotateSpeed = 0.6
  let view: BedView = '3d'
  let userMoved = false
  const goal = { pos: new THREE.Vector3(), target: new THREE.Vector3() }
  let tween: { t0: number; from: THREE.Vector3; fromT: THREE.Vector3 } | null = null
  /** 처음 보일 때 다가오기 (1.2 s): 조금 멀고 옆에서 시작해 제자리로 (정차 · 움직임 허용일 때만) */
  let intro: { t0: number } | null = null
  let width = 1
  let height = 1

  // 볼 범위 (상자)를 지금 화면 비율에 맞춰 넣는다. 3D 와 위에서 모두 적재함이 가로로 눕는다 (앞 = 오른쪽)
  const roi = new THREE.Box3()
  let roiPts: THREE.Vector3[] = [...BED_PTS]
  /** 점들(세계 좌표)을 화면 가로 mx · 세로 my 몫 안에 넣는 카메라 거리와 바라볼 곳 (화면 가운데로) */
  function fit(dir: THREE.Vector3, corners: THREE.Vector3[], mx: number, my: number) {
    const b = dir.clone().normalize()
    const r = new THREE.Vector3(0, 1, 0).cross(b).normalize()
    const u = b.clone().cross(r).normalize()
    const t0 = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)
    const tv = t0 * my
    const th = t0 * camera.aspect * mx
    const target = new THREE.Box3().setFromPoints(corners).getCenter(new THREE.Vector3())
    const p = new THREE.Vector3()
    let D = 1
    for (let it = 0; it < 3; it++) {
      D = 0
      for (const c of corners) {
        p.copy(c).sub(target)
        const z = p.dot(b)
        D = Math.max(D, z + Math.abs(p.dot(r)) / th, z + Math.abs(p.dot(u)) / tv)
      }
      // 화면에서 가운데로 (원근 때문에 한쪽으로 쏠린 만큼 옮긴다)
      let x0 = 1e9
      let x1 = -1e9
      let y0 = 1e9
      let y1 = -1e9
      for (const c of corners) {
        p.copy(c).sub(target)
        const depth = Math.max(0.1, D - p.dot(b))
        const nx = p.dot(r) / (depth * th)
        const ny = p.dot(u) / (depth * tv)
        x0 = Math.min(x0, nx)
        x1 = Math.max(x1, nx)
        y0 = Math.min(y0, ny)
        y1 = Math.max(y1, ny)
      }
      target.addScaledVector(r, ((x0 + x1) / 2) * D * th * 0.9).addScaledVector(u, ((y0 + y1) / 2) * D * tv * 0.9)
    }
    return { target, dist: D }
  }
  /** 위에서 보기 (직교): 적재함 길이 = 화면 가로, 폭 = 세로. fw · fh = 캔버스 가로 · 세로에서 채울 몫 */
  function fitOrtho(box: THREE.Box3, fw: number, fh: number) {
    const c = box.getCenter(new THREE.Vector3())
    const sx = (box.max.z - box.min.z) / 2 / fw
    const sy = (box.max.x - box.min.x) / 2 / fh
    const hw = Math.max(sx, sy * camera.aspect)
    const hh = hw / camera.aspect
    ortho.left = -hw
    ortho.right = hw
    ortho.top = hh
    ortho.bottom = -hh
    ortho.position.set(c.x, 12, c.z)
    ortho.lookAt(c.x, 0, c.z)
    ortho.updateProjectionMatrix()
  }
  /**
   * 보이는 무대 (캔버스 px): 장면 판(.bv)이 무대 칸 · 창에 잘려 실제로 보이는 곳에서, 위쪽 이름표(reserveTop)와
   * 무대 위쪽 띠에 붙은 앱 글(폰 무대 caption 같은 것) 아래. 무대 칸(nav.css)이 판을 무대보다 크게 그려도 적재함은 보이는 곳 가운데에 온다
   */
  let vis = { x: 0, y: 0, w: 1, h: 1 }
  function visibleRect() {
    const full = { x: 0, y: reserveTop, w: width, h: Math.max(1, height - reserveTop) }
    const root = tagLayer.parentElement
    const box = root?.parentElement
    if (!root) return full
    const rr = root.getBoundingClientRect()
    if (rr.width < 1 || rr.height < 1) return full
    let x0 = Math.max(rr.left, 0)
    let y0 = Math.max(rr.top, 0)
    let x1 = Math.min(rr.right, window.innerWidth || rr.right)
    let y1 = Math.min(rr.bottom, window.innerHeight || rr.bottom)
    if (box) {
      const br = box.getBoundingClientRect()
      if (br.width > 1 && br.height > 1) {
        x0 = Math.max(x0, br.left)
        y0 = Math.max(y0, br.top)
        x1 = Math.min(x1, br.right)
        y1 = Math.min(y1, br.bottom)
      }
    }
    const sx = width / rr.width
    const sy = height / rr.height
    const v = { x: (x0 - rr.left) * sx, y: (y0 - rr.top) * sy, w: (x1 - x0) * sx, h: (y1 - y0) * sy }
    if (v.w < 40 || v.h < 40) return full
    let top = Math.max(v.y, reserveTop)
    let bottom = v.y + v.h
    // 위쪽 띠(보이는 높이의 15 %)에 붙은 넓은 앱 글 (caption) 아래로. 폰 무대는 아래쪽 띠에 붙은 보기 알약 위로
    //   (내비 알림은 잠깐 뜨는 것이라 맞춤에 넣지 않는다: 알림이 뜰 때 적재함이 작아지지 않게)
    const small = root.getAttribute('data-size') === 'sm'
    for (const r of stageUi()) {
      if (r.w < v.w * 0.3 || r.h > v.h * 0.2) continue
      if (r.y < top + v.h * 0.15) top = Math.max(top, r.y + r.h)
      else if (small && r.y + r.h > bottom - v.h * 0.15) bottom = Math.min(bottom, r.y)
    }
    return { x: v.x, y: top, w: v.w, h: Math.max(40, bottom - top) }
  }
  function computeGoal() {
    if (roi.isEmpty()) roi.copy(BED_ROI)
    vis = visibleRect()
    const top = view === 'top'
    const va = vis.w / vis.h
    const dir = top ? DIR_TOP : dir3d(va)
    const box = top ? BED_ROI : roi
    // 적재함 · 앞 보호 틀 · 짐 전체를 보이는 무대 폭의 75 % 쯤에 넣는다 (정사각에 가까운 무대 77 %, 세로로 긴 무대 80 %).
    //   위아래 여백은 5 % 씩. 가로로 긴 무대(폰 세로 창의 낮은 무대 · 내비 낮은 창)는 높이가 먼저 차므로 위아래 3 % 만 비운다
    const wide = va > WIDE_A0
    const fw = wide ? FILL_PAD : va < 0.9 ? 0.8 : va < 1.25 ? 0.77 : FILL_W
    const fh = va > MID_A0 ? 0.94 : 0.9
    const mx = (fw * vis.w) / width
    const my = (fh * vis.h) / height
    const { target, dist } = fit(dir, top ? BED_PTS : roiPts, mx, my)
    goal.target.copy(target)
    goal.pos.copy(target).addScaledVector(dir, dist)
    controls.minDistance = dist * 0.45
    controls.maxDistance = dist * 1.8
    // 렌즈 이동: 장면 가운데(캔버스 가운데)를 보이는 무대 가운데로 (시점 각도는 그대로). 위아래는 가운데보다 4 % 위
    //   (적재함 밑 접지 그림자가 아래로 번지고, 내비 알림은 아래 가운데에 뜬다: 위 빈 띠를 줄인다)
    const dx = vis.x + vis.w / 2 - width / 2
    let dy = vis.y + vis.h * 0.46 - height / 2
    if (!top) {
      // 사진처럼 적재함을 무대 아래로 앉힌다: 가장 아래 점(가까운 모서리 밑)이 보이는 무대 아래 끝 가까이 오게.
      //   (위로 남는 자리는 꼬리표 몫. 위 끝은 무대 위 끝 3 % 아래까지만 올라간다)
      //   잴 때만 카메라를 목표 자리에 두고, 재고 나면 되돌린다 (시점 옮김 애니메이션이 지금 자리에서 시작하도록)
      const p0 = camera.position.clone()
      const q0 = camera.quaternion.clone()
      camera.position.copy(goal.pos)
      camera.lookAt(goal.target)
      camera.clearViewOffset()
      camera.updateMatrixWorld(true)
      let yt = Infinity
      let yb = -Infinity
      const pp = new THREE.Vector3()
      for (const p of roiPts) {
        pp.copy(p).project(camera)
        const y = (-pp.y * 0.5 + 0.5) * height
        yt = Math.min(yt, y)
        yb = Math.max(yb, y)
      }
      camera.position.copy(p0)
      camera.quaternion.copy(q0)
      camera.updateMatrixWorld(true)
      // (아래 6 % 는 무대 칸 가장자리 녹임(bed.css .bv-host mask) 자리라 7.5 % 위에 앉힌다)
      const want = vis.y + vis.h * 0.925 - yb
      const maxUp = vis.y + vis.h * 0.03 - yt
      // 세로로 긴 무대에서 위가 크게 비지 않게: 적재함 가운데는 무대 높이의 60 % 보다 아래로 내려가지 않는다
      const maxDown = vis.y + vis.h * 0.6 - (yt + yb) / 2
      dy = Math.max(Math.min(want, maxDown), maxUp)
      // 무대가 아주 낮으면 (위 · 아래 둘 다 못 맞추면) 가운데
      if (yb - yt > vis.h * 0.93) dy = vis.y + vis.h / 2 - (yt + yb) / 2
    }
    camera.setViewOffset(width, height, -dx, -dy, width, height)
    fitOrtho(box, ((wide ? 0.94 : FILL_W) * vis.w) / width, ((wide ? 0.9 : FILL_H) * vis.h) / height)
    ortho.setViewOffset(width, height, -dx, -dy, width, height)
  }
  /** 보이는 무대가 바뀌었으면 (이름표 · caption) 다시 맞춘다 */
  function refit() {
    computeGoal()
    if (!tween) {
      camera.position.copy(goal.pos)
      controls.target.copy(goal.target)
      controls.update()
    }
    invalidate()
  }
  function startTween() {
    tween = { t0: performance.now(), from: camera.position.clone(), fromT: controls.target.clone() }
    // 시점 바꿈이 시작되면 처음 다가오기는 그만 (바꿈이 지금 자리에서 이어 간다)
    intro = null
    active = camera
    controls.enabled = interactive && view === '3d'
  }

  // ── 후처리 (그릴 때만): HDR 장면(MSAA 4) → 반 해상도 GTAO → 마지막 그림 (ACES · 대비 · 비네트, GRADE_FS) ──
  //   반 정밀 그림을 그릴 수 없는 기기면 후처리 없이 바로 그린다 (ACES 톤 매핑은 렌더러가)
  const canHalf = renderer.extensions.has('EXT_color_buffer_half_float') || renderer.extensions.has('EXT_color_buffer_float')
  const post = canHalf
    ? (() => {
        const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: Math.min(4, renderer.capabilities.maxSamples) })
        const gtao = new GTAOPass(scene, camera, 1, 1)
        gtao.updateGtaoMaterial({ radius: 0.16, distanceExponent: 1.4, thickness: 0.6, scale: 1.15, samples: 12, distanceFallOff: 1 })
        gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 })
        gtao.output = GTAOPass.OUTPUT.Off
        gtao.setSceneClipBox(new THREE.Box3(new THREE.Vector3(-2.2, GROUND_Y - 0.05, -2.6), new THREE.Vector3(2.2, 3.5, 2.6)))
        const white = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1)
        white.needsUpdate = true
        const mat = new THREE.ShaderMaterial({
          vertexShader: GRADE_VS,
          fragmentShader: GRADE_FS,
          uniforms: {
            tScene: { value: rt.texture },
            tAo: { value: white },
            uAo: { value: 1 },
            uExposure: { value: 1 },
            uContrast: { value: 0.16 },
            uVignette: { value: 0.32 },
            uAspect: { value: new THREE.Vector2(1, 1) },
          },
          depthTest: false,
          depthWrite: false,
          blending: THREE.NoBlending,
        })
        const quad = new FullScreenQuad(mat)
        return { rt, gtao, white, mat, quad }
      })()
    : null
  if (post) renderer.toneMapping = THREE.NoToneMapping
  /** AO 를 그릴 때 투명한 것(닿는 그림자 판 · 출발 때 자리 · 바닥 그림자 판 · 닳은 자국)은 깊이에서 뺀다 (유령 상자 둘레에 AO 띠가 생기지 않게) */
  const aoHidden: THREE.Object3D[] = []
  let renderCount = 0
  let shadowRenders = 0
  let sceneCalls = 0
  function drawScene(withAo: boolean) {
    renderCount++
    if (!post) {
      renderer.render(scene, active)
      sceneCalls = renderer.info.render.calls
      return
    }
    renderer.setRenderTarget(post.rt)
    renderer.clear()
    renderer.render(scene, active)
    sceneCalls = renderer.info.render.calls
    const ao = withAo && active === camera
    if (ao) {
      scene.traverseVisible((o) => {
        const m = (o as THREE.Mesh).material as THREE.Material | undefined
        if ((o as THREE.Mesh).isMesh && m && !Array.isArray(m) && (m.transparent || !m.depthWrite)) aoHidden.push(o)
      })
      for (const o of aoHidden) o.visible = false
      post.gtao.camera = camera
      post.gtao.render(renderer, post.rt, post.rt, 0, false)
      for (const o of aoHidden) o.visible = true
      aoHidden.length = 0
    }
    post.mat.uniforms.tAo.value = ao ? post.gtao.gtaoMap : post.white
    post.mat.uniforms.uExposure.value = renderer.toneMappingExposure
    renderer.setRenderTarget(null)
    post.quad.render(renderer)
  }

  function layout() {
    width = Math.max(1, host.clientWidth)
    height = Math.max(1, host.clientHeight)
    const pr = pixelRatio(host, dprCap)
    renderer.setPixelRatio(pr)
    renderer.setSize(width, height, false)
    if (post) {
      const bw = Math.round(width * pr)
      const bh = Math.round(height * pr)
      post.rt.setSize(bw, bh)
      // AO 는 반 해상도 (헤드 유닛 성능)
      post.gtao.setSize(Math.max(1, Math.round(bw / 2)), Math.max(1, Math.round(bh / 2)))
      const m = Math.max(width, height)
      post.mat.uniforms.uAspect.value.set(width / m, height / m)
    }
    camera.aspect = width / height
    camera.updateProjectionMatrix()
    computeGoal()
    if (!tween) {
      camera.position.copy(goal.pos)
      controls.target.copy(goal.target)
      controls.update()
    }
    invalidate()
  }

  function setView(v: BedView) {
    if (v === view) return
    view = v
    computeGoal()
    startTween()
    invalidate()
  }

  // ── 그리기 (필요할 때만): 그릴 것이 있을 때만 다음 화면을 부른다. 다가오기 · 빛 지나감 · 숨쉬기가 끝나면 고리도 멈춘다 ──
  let dirty = true
  let raf = 0
  let lastInput = 0
  function kick() {
    if (!raf && !disposed) raf = requestAnimationFrame(frame)
  }
  function invalidate() {
    dirty = true
    kick()
  }
  controls.addEventListener('change', invalidate)
  controls.addEventListener('start', () => {
    lastInput = performance.now()
    userMoved = true
    // 손가락이 닿으면 처음 다가오기 · 빛 지나감은 그만 (손이 이긴다)
    intro = null
    kick()
  })
  controls.addEventListener('end', () => {
    lastInput = performance.now()
    kick()
  })
  // 주행으로 바뀌면(data-mode) · 움직임 줄이기가 켜지면 한 번 더 그려 움직이던 것을 제자리 · 고른 빛으로 둔다
  const modeMo = new MutationObserver(() => invalidate())
  modeMo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-mode'], subtree: true })
  reduceMq?.addEventListener?.('change', invalidate)
  const prj = new THREE.Vector3()
  const toScreen = (p: THREE.Vector3) => {
    prj.copy(p).project(active)
    return { x: (prj.x * 0.5 + 0.5) * width, y: (-prj.y * 0.5 + 0.5) * height, behind: prj.z > 1 }
  }

  // ── 화면 위 겹침 셈 (꼬리표 · '앞' 자리 고르기): 볼록 껍질 · 네모 ──
  type P2 = { x: number; y: number }
  type Rc = { x: number; y: number; w: number; h: number }
  const cross2 = (o: P2, a: P2, b: P2) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
  function hull2(pts: P2[]): P2[] {
    const p = [...pts].sort((a, b) => a.x - b.x || a.y - b.y)
    if (p.length < 3) return p
    const lo: P2[] = []
    for (const q of p) {
      while (lo.length >= 2 && cross2(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop()
      lo.push(q)
    }
    const up: P2[] = []
    for (let i = p.length - 1; i >= 0; i--) {
      const q = p[i]
      while (up.length >= 2 && cross2(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop()
      up.push(q)
    }
    lo.pop()
    up.pop()
    return lo.concat(up)
  }
  /** 볼록 다각형 안쪽으로 얼마나 깊은지 (px, 밖이면 음수) */
  function depthIn(q: P2, poly: P2[]) {
    if (poly.length < 3) return -1e9
    let d = 1e9
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i]
      const b = poly[(i + 1) % poly.length]
      const len = Math.hypot(b.x - a.x, b.y - a.y) || 1
      d = Math.min(d, cross2(a, b, q) / len)
    }
    return d
  }
  /** 네모와 볼록 다각형이 겹치는지 (분리 축). pad 만큼 네모를 키워서 본다 */
  function rectHitsPoly(r: Rc, poly: P2[], pad = 0) {
    if (poly.length < 3) return false
    const rc = [
      { x: r.x - pad, y: r.y - pad },
      { x: r.x + r.w + pad, y: r.y - pad },
      { x: r.x + r.w + pad, y: r.y + r.h + pad },
      { x: r.x - pad, y: r.y + r.h + pad },
    ]
    const axes: P2[] = [{ x: 1, y: 0 }, { x: 0, y: 1 }]
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i]
      const b = poly[(i + 1) % poly.length]
      axes.push({ x: -(b.y - a.y), y: b.x - a.x })
    }
    for (const ax of axes) {
      let p0 = 1e9
      let p1 = -1e9
      for (const p of poly) {
        const v = p.x * ax.x + p.y * ax.y
        p0 = Math.min(p0, v)
        p1 = Math.max(p1, v)
      }
      let r0 = 1e9
      let r1 = -1e9
      for (const p of rc) {
        const v = p.x * ax.x + p.y * ax.y
        r0 = Math.min(r0, v)
        r1 = Math.max(r1, v)
      }
      if (r1 < p0 || r0 > p1) return false
    }
    return true
  }
  /** 점 q 와 선분 ab 사이 거리 (px) */
  const segDist = (q: P2, a: P2, b: P2) => {
    const vx = b.x - a.x
    const vy = b.y - a.y
    const l2 = vx * vx + vy * vy || 1
    const t = Math.max(0, Math.min(1, ((q.x - a.x) * vx + (q.y - a.y) * vy) / l2))
    return Math.hypot(q.x - (a.x + vx * t), q.y - (a.y + vy * t))
  }
  /** 선분이 네모(pad 만큼 키운)를 지나는지 (16 점 표본) */
  const segHitsRect = (a: P2, b: P2, r: Rc, pad = 0) => {
    for (let i = 0; i <= 16; i++) {
      const x = a.x + ((b.x - a.x) * i) / 16
      const y = a.y + ((b.y - a.y) * i) / 16
      if (x > r.x - pad && x < r.x + r.w + pad && y > r.y - pad && y < r.y + r.h + pad) return true
    }
    return false
  }
  const rectsHit = (a: Rc, b: Rc, pad = 0) => a.x < b.x + b.w + pad && a.x + a.w + pad > b.x && a.y < b.y + b.h + pad && a.y + a.h + pad > b.y
  /** 선분이 다각형 안쪽(가장자리에서 4 px 넘게)을 지나는 길이 (px) */
  function insideLen(a: P2, b: P2, poly: P2[]) {
    if (poly.length < 3) return 0
    const n = 24
    const seg = Math.hypot(b.x - a.x, b.y - a.y)
    let k = 0
    for (let i = 0; i <= n; i++) {
      const t = i / n
      if (depthIn({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, poly) > 4) k++
    }
    return (k / (n + 1)) * seg
  }
  /** 상자(세계 좌표, off 만큼 옮김)가 화면에 비친 볼록 껍질 */
  const hc = new THREE.Vector3()
  function boxHull(b: THREE.Box3, off?: THREE.Vector3) {
    const pts: P2[] = []
    for (const x of [b.min.x, b.max.x])
      for (const y of [b.min.y, b.max.y])
        for (const z of [b.min.z, b.max.z]) {
          hc.set(x, y, z)
          if (off) hc.add(off)
          const s = toScreen(hc)
          pts.push({ x: s.x, y: s.y })
        }
    return hull2(pts)
  }
  const boxOf = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) => new THREE.Box3(new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x1, y1, z1))
  /** 옆문 · 뒷문 · 앞 판 (이것과 겹치는 '앞' 글은 숨긴다) */
  const GATE_BOXES = [
    boxOf(W / 2, -0.02, -L / 2 - 0.05, W / 2 + 0.05, BED.sideH + 0.03, L / 2 + 0.05),
    boxOf(-W / 2 - 0.05, -0.02, -L / 2 - 0.05, -W / 2, BED.sideH + 0.03, L / 2 + 0.05),
    boxOf(-W / 2 - 0.05, -0.02, L / 2, W / 2 + 0.05, BED.sideH + 0.03, L / 2 + 0.05),
    boxOf(-W / 2 - 0.05, -0.02, -L / 2 - 0.06, W / 2 + 0.05, BED.sideH + 0.03, -L / 2),
  ]
  const DECK_BOX = boxOf(-W / 2, 0, -L / 2, W / 2, 0, L / 2)
  /** 기준점이 옆문 · 뒷문 · 앞 판 뒤에 가려 안 보이는지 (카메라 -> 점 선분이 문 판을 지나는지). 위에서 보기는 가리는 것 없음 */
  function gateHides(p: THREE.Vector3) {
    if (active === ortho) return false
    const c = camera.position
    const planes: [axis: 'x' | 'z', at: number, top: number][] = [
      ['x', W / 2 + 0.02, BED.sideH + 0.03],
      ['x', -W / 2 - 0.02, BED.sideH + 0.03],
      ['z', L / 2 + 0.02, BED.sideH + 0.03],
      ['z', -L / 2 - 0.03, BED.sideH + 0.03],
    ]
    for (const [ax, at, top] of planes) {
      const pc = c[ax] - at
      const pp = p[ax] - at
      if (pc * pp >= 0) continue
      const t = pp / (pp - pc)
      const y = p.y + (c.y - p.y) * t
      const o = ax === 'x' ? p.z + (c.z - p.z) * t : p.x + (c.x - p.x) * t
      const half = ax === 'x' ? L / 2 + 0.05 : W / 2 + 0.05
      if (y > -0.05 && y < top && Math.abs(o) < half) return true
    }
    return false
  }

  /** 꼬리표가 붙을 수 있는 자리 (세계 좌표 여럿). 장면이 고르는 것은 화면에서 가장 짧고 짐을 가로지르지 않는 끌어 선 */
  function anchorsOf(at: TagAnchor): THREE.Vector3[] {
    if (!input) return []
    const spec = CARGO[input.kind].size
    const off = straps.position
    const sb = ghostBounds
    const topCorners = (b: THREE.Box3) => [
      new THREE.Vector3(b.min.x, b.max.y, b.max.z),
      new THREE.Vector3(b.max.x, b.max.y, b.max.z),
      new THREE.Vector3(b.max.x, b.max.y, b.min.z),
      new THREE.Vector3(b.min.x, b.max.y, b.min.z),
    ]
    if (at.kind === 'belt') {
      const b = beltPts[at.index]
      if (!b) return []
      if (hidden) return [b.buckle]
      // 짐 위 띠 양 끝 · 보는 쪽 내려오는 띠 · 버클 (슬라이드 중이면 같이 옮긴다)
      return [b.topL, b.topR, b.sideR, b.buckle].map((p) => p.clone().add(off))
    }
    if (at.kind === 'sensor') {
      if (at.which === 'tag') return hidden ? topCorners(sb) : [tagPuck.localToWorld(new THREE.Vector3(0, 0.03, 0))]
      const k = at.which === 'c1' ? 0 : beltPts.length - 1
      const c = beltPts[k]?.cell
      return c ? [c.clone().add(off)] : []
    }
    if (at.kind === 'arrow') return arrow ? [arrow.a.clone().lerp(arrow.b, 0.5), arrow.a.clone()] : []
    if (at.kind === 'start') return topCorners(sb)
    // 짐: 윗면 네 모서리
    if (hidden) return topCorners(sb)
    return [
      [-1, 1],
      [1, 1],
      [1, -1],
      [-1, -1],
    ].map(([sx, sz]) => cargoBody.localToWorld(new THREE.Vector3((sx * spec.w) / 2, spec.h, (sz * spec.l) / 2)))
  }

  const placeDot = (dot: SVGCircleElement, x: number, y: number, on: boolean) => {
    dot.setAttribute('cx', x.toFixed(1))
    dot.setAttribute('cy', y.toFixed(1))
    dot.style.opacity = on ? '1' : '0'
  }
  /** 12 방향 (0 = 오른쪽, 시계 방향 30° 마다) */
  const DIRS = Array.from({ length: 12 }, (_, i) => ({ x: Math.cos((i * Math.PI) / 6), y: Math.sin((i * Math.PI) / 6) }))
  /** 지난번에 고른 자리 (꼬리표 id -> 열쇠): 쉼 흔들림 동안 꼬리표가 이쪽저쪽 뛰지 않게 조금 붙잡는다 */
  const lastPick = new Map<string, string>()

  /** 무대 칸(.bv)의 형제 중 무대 위에 떠 있는 것의 네모 (무대 좌표). 무대 절반 넘게 덮는 것 · 안 보이는 것은 뺀다 */
  function stageUi(): Rc[] {
    const root = tagLayer.parentElement
    const box = root?.parentElement
    if (!root || !box) return []
    const rr = root.getBoundingClientRect()
    if (rr.width < 1) return []
    const sx = width / rr.width
    const sy = height / rr.height
    const out: Rc[] = []
    /** 바탕이 투명한 감싸개 (폰 보기 알약의 .ph-stage-ctl = 무대 높이 30 % 의 빈 칸) 는 안에 실제로 보이는 것의 네모로 잰다 */
    const tight = (el: Element, depth = 0): DOMRect | null => {
      const r = el.getBoundingClientRect()
      if (r.width < 1 || r.height < 1) return null
      if (depth > 2 || !el.children.length) return r
      // 글이 바로 든 것 (caption 같은 것) 은 그대로
      if (Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent?.trim())) return r
      const cs = getComputedStyle(el)
      const clear = (cs.backgroundColor === 'transparent' || /rgba\(.*,\s*0\)$/.test(cs.backgroundColor)) && cs.borderTopWidth === '0px' && cs.backgroundImage === 'none'
      if (!clear) return r
      let x0 = Infinity
      let y0 = Infinity
      let x1 = -Infinity
      let y1 = -Infinity
      for (const c of Array.from(el.children)) {
        const q = tight(c, depth + 1)
        if (!q) continue
        x0 = Math.min(x0, q.left)
        y0 = Math.min(y0, q.top)
        x1 = Math.max(x1, q.right)
        y1 = Math.max(y1, q.bottom)
      }
      return x1 > x0 && y1 > y0 ? new DOMRect(x0, y0, x1 - x0, y1 - y0) : null
    }
    for (const el of Array.from(box.children)) {
      if (el === root || !(el instanceof HTMLElement)) continue
      const r = tight(el)
      if (!r) continue
      const x0 = Math.max(r.left, rr.left)
      const y0 = Math.max(r.top, rr.top)
      const x1 = Math.min(r.right, rr.right)
      const y1 = Math.min(r.bottom, rr.bottom)
      if (x1 <= x0 || y1 <= y0) continue
      if ((x1 - x0) * (y1 - y0) > rr.width * rr.height * 0.5) continue
      const cs = getComputedStyle(el)
      if (cs.visibility === 'hidden' || cs.display === 'none' || parseFloat(cs.opacity) < 0.05) continue
      out.push({ x: (x0 - rr.left) * sx, y: (y0 - rr.top) * sy, w: (x1 - x0) * sx, h: (y1 - y0) * sy })
    }
    return out
  }

  /** 지금 그린 화살 (화면 좌표): 화살 꼬리표는 이 선 위에 붙는다 */
  let arrowScr: { a: P2; b: P2 } | null = null
  function placeOverlay() {
    const lg = tagLayer.parentElement?.getAttribute('data-size') !== 'sm'
    const cap = lg ? 80 : 48
    // 꼬리표 · 배지 · '앞' 은 보이는 무대 안에만 (장면 판이 무대 칸보다 커서 잘리는 곳 · 이름표 위에 두지 않는다)
    const vx0 = vis.x
    const vx1 = vis.x + vis.w
    const vy1 = vis.y + vis.h
    const minY = vis.y + 8
    const maxY = vy1 - 10
    const edge = 10
    // 짐 윤곽 (숨었으면 출발 때 자리) · 출발 때 자리 윤곽 (보일 때만)
    const cargoHull = hidden || cargoBox.isEmpty() ? boxHull(ghostBounds) : boxHull(cargoBox, straps.position)
    const ghostHull = ghost.visible && !hidden ? boxHull(ghostBounds) : []
    // 바닥 꺾쇠 (꼬리표가 덮지 않게 조금 피한다)
    const chevHull = chevrons.visible ? boxHull(boxOf(-0.17, 0, chevrons.position.z - 0.06, 0.17, 0, chevrons.position.z + 0.24)) : []
    // 무대 위에 떠 있는 앱 쪽 부품 (보기 나눔 단추 · 알림 토스트 등, 무대 칸의 형제): 꼬리표 · 배지 · '앞' 이 그 위에 앉지 않게
    const ui = stageUi()
    const taken: Rc[] = [...ui]
    const gateHulls = active === ortho ? [] : GATE_BOXES.map((b) => boxHull(b))

    // 화살 (4px, 화면에서 짧으면 56px 까지 늘린다). 화살 끝은 늘 지금 짐의 뒤쪽 면에 닿고, 늘릴 때는 꼬리를 뒤로 늘린다
    //   (앞으로 늘리면 화살 머리가 짐 위에 올라앉는다)
    let arrowRect: Rc | null = null
    arrowScr = null
    if (arrow && input) {
      const A0 = toScreen(arrow.a)
      const B = toScreen(arrow.b)
      let dx = B.x - A0.x
      let dy = B.y - A0.y
      let len = Math.hypot(dx, dy)
      if (len < 1) {
        dx = 0
        dy = -1
        len = 1
      }
      const ux = dx / len
      const uy = dy / len
      const span = Math.max(len, 56)
      const A = { x: B.x - ux * span, y: B.y - uy * span }
      const bx = B.x
      const by = B.y
      arrowScr = { a: A, b: { x: bx, y: by } }
      const head = 18
      arrowLine.setAttribute('x1', A.x.toFixed(1))
      arrowLine.setAttribute('y1', A.y.toFixed(1))
      arrowLine.setAttribute('x2', (bx - ux * head * 0.6).toFixed(1))
      arrowLine.setAttribute('y2', (by - uy * head * 0.6).toFixed(1))
      const nx = -uy
      const ny = ux
      const p1 = `${(bx - ux * head + nx * head * 0.62).toFixed(1)},${(by - uy * head + ny * head * 0.62).toFixed(1)}`
      const p2 = `${(bx - ux * head - nx * head * 0.62).toFixed(1)},${(by - uy * head - ny * head * 0.62).toFixed(1)}`
      arrowHead.setAttribute('d', `M${bx.toFixed(1)},${by.toFixed(1)} L${p1} L${p2} Z`)
      arrowG.setAttribute('class', 'bv-arrow tone-' + (input.arrowTone ?? 'red'))
      arrowG.style.display = ''
      arrowRect = { x: Math.min(A.x, bx) - 10, y: Math.min(A.y, by) - 10, w: Math.abs(bx - A.x) + 20, h: Math.abs(by - A.y) + 20 }
    } else arrowG.style.display = 'none'

    // 배지: 버클 바깥 아래 (조일 곳, 보는 쪽). 겹치면 순서대로 옆으로 비켜 놓고 버클까지 2px 선 + 점
    // 배지: 벨트 버클(띠 위 한 점)에 8px 점으로 꽂고, 짐 윤곽 밖으로 짧게 끌어 낸 자리에 동그라미.
    //   같은 번호 벨트가 여럿이면 버클들 가운데에서 끌어 내고, 벨트마다 가는 선 하나씩
    const badgeRects: Rc[] = []
    // 배지가 앉으면 안 되는 선 (화면): 벨트 띠 (보는 쪽 내려오는 띠 · 윗면 띠) + 옆문 · 뒷문 윗 덮개
    const obstacleSegs: [P2, P2][] = []
    {
      const off = straps.position
      const sc = (p: THREE.Vector3, o = true) => {
        const s = toScreen(o ? p.clone().add(off) : p)
        return { x: s.x, y: s.y }
      }
      if (!hidden)
        for (const b of beltPts) {
          obstacleSegs.push([sc(b.hookR), sc(b.tanR)], [sc(b.topL), sc(b.topR)], [sc(b.tanR), sc(b.topR)])
        }
      const capY = BED.sideH + 0.016
      const xs = W / 2 + 0.022
      const zs = L / 2 + 0.022
      for (const [p, q] of [
        [new THREE.Vector3(xs, capY, -L / 2), new THREE.Vector3(xs, capY, zs)],
        [new THREE.Vector3(-xs, capY, -L / 2), new THREE.Vector3(-xs, capY, zs)],
        [new THREE.Vector3(-xs, capY, zs), new THREE.Vector3(xs, capY, zs)],
      ])
        obstacleSegs.push([sc(p, false), sc(q, false)])
    }
    let hcx = 0
    let hcy = 0
    for (const p of cargoHull) {
      hcx += p.x / Math.max(1, cargoHull.length)
      hcy += p.y / Math.max(1, cargoHull.length)
    }
    for (const b of [...badgeEls.values()].sort((a, c) => a.n - c.n)) {
      const pts = b.belts.map((k) => beltPts[k]).map((p) => (p ? toScreen(p.buckle.clone().add(straps.position)) : null))
      const shown = pts.filter((s): s is { x: number; y: number; behind: boolean } => !!s && !s.behind)
      if (!shown.length) {
        b.el.style.opacity = '0'
        for (const l of b.lines) l.style.opacity = '0'
        for (const d of b.dots) d.style.opacity = '0'
        continue
      }
      const size = b.el.offsetWidth || 48
      const mx = shown.reduce((a, s) => a + s.x, 0) / shown.length
      const my = shown.reduce((a, s) => a + s.y, 0) / shown.length
      // 짐 가운데에서 바깥쪽 (아래로 조금 기울여: 배지가 바닥 쪽 빈 곳에 오게). 버클에서 짧은 줄기(stem)만큼 띄운다:
      //   방향을 ±15° 씩 돌리고 줄기를 늘려 가며, 짐 윤곽 · 벨트 띠 · 옆문 윗 덮개 · 다른 배지 · 무대 밖을 모두 피하는 첫 자리
      let dx = mx - hcx
      let dy = my - hcy + size * 0.6
      const dl = Math.hypot(dx, dy) || 1
      dx /= dl
      dy /= dl
      const stem = lg ? 30 : 18
      const rectAt = (x: number, y: number): Rc => ({ x: x - size / 2, y: y - size / 2, w: size, h: size })
      const clearOf = (x: number, y: number) => {
        const r = rectAt(x, y)
        if (x - size / 2 < vx0 + 4 || x + size / 2 > vx1 - 4 || y - size / 2 < vis.y + 4 || y + size / 2 > vy1 - 4) return false
        if (rectHitsPoly(r, cargoHull, 4)) return false
        if (badgeRects.some((t) => rectsHit(r, t, 8))) return false
        if (ui.some((t) => rectsHit(r, t, 8))) return false
        const q = { x, y }
        return !obstacleSegs.some(([a, c]) => segDist(q, a, c) < size / 2 + 3)
      }
      let cx = mx + dx * (size / 2 + stem)
      let cy = my + dy * (size / 2 + stem)
      search: for (const ext of [0, 14, 28, 44, 62]) {
        for (const turn of [0, 15, -15, 30, -30, 45, -45, 60, -60, 80, -80]) {
          const t = THREE.MathUtils.degToRad(turn)
          const ux = dx * Math.cos(t) - dy * Math.sin(t)
          const uy = dx * Math.sin(t) + dy * Math.cos(t)
          const x = mx + ux * (size / 2 + stem + ext)
          const y = my + uy * (size / 2 + stem + ext)
          if (clearOf(x, y)) {
            cx = x
            cy = y
            break search
          }
        }
      }
      cx = Math.min(Math.max(cx, vx0 + size / 2 + 4), vx1 - size / 2 - 4)
      cy = Math.min(Math.max(cy, vis.y + size / 2 + 4), vy1 - size / 2 - 4)
      const r = rectAt(cx, cy)
      badgeRects.push(r)
      taken.push(r)
      b.el.style.transform = `translate3d(${Math.round(r.x)}px, ${Math.round(r.y)}px, 0)`
      b.el.style.opacity = '1'
      // 선: 배지 가장자리 -> 버클. 끝에 8px 점
      pts.forEach((s, j) => {
        const line = b.lines[j]
        const dot = b.dots[j]
        if (!line || !dot) return
        if (!s || s.behind) {
          line.style.opacity = '0'
          dot.style.opacity = '0'
          return
        }
        const d = Math.hypot(s.x - cx, s.y - cy) || 1
        line.setAttribute('x1', (cx + ((s.x - cx) / d) * (size / 2)).toFixed(1))
        line.setAttribute('y1', (cy + ((s.y - cy) / d) * (size / 2)).toFixed(1))
        line.setAttribute('x2', s.x.toFixed(1))
        line.setAttribute('y2', s.y.toFixed(1))
        line.style.opacity = d > size / 2 + 2 ? '1' : '0'
        placeDot(dot, s.x, s.y, true)
      })
    }

    // 꼬리표: 기준점(여럿) x 12 방향 x 끌어 선 길이 중에서 고른다.
    //   반드시: 무대 안 · 짐 윤곽 밖 · 다른 꼬리표 · 배지와 안 겹침 · 끌어 선이 짐 위를 18 px 넘게 지나지 않음 · 길이 cap 이하.
    //   점수 = 끌어 선 길이 + 짐 위를 지난 길이 x 8 + 출발 때 자리 · 화살과 겹침 벌점. 못 찾으면 길이 · 짐 조건을 풀어 다시.
    const lens = [0.3, 0.55, 0.8, 1].map((k) => k * cap)
    const looser = [1.4, 2, 2.8].map((k) => k * cap)
    // 적재함 몸통 윤곽 (옆문 · 뒷문 · 윗 덮개까지, 앞 보호 틀 관은 빼고): 화살 꼬리표는 이 밖에 둔다 (적재함 테두리를 가로질러 덮지 않게)
    const bedHull = active === ortho ? [] : boxHull(boxOf(-W / 2 - 0.045, -0.05, -L / 2 - 0.05, W / 2 + 0.045, BED.sideH + 0.05, L / 2 + 0.045))
    for (const e of tagEls.values()) {
      // 문 뒤에 가린 기준점은 빼되, 모두 가렸으면 (화살처럼 화면 위에 그린 것) 그대로 쓴다
      const all = anchorsOf(e.at)
      const seen = all.filter((p) => !gateHides(p))
      const opts =
        e.at.kind === 'arrow' && arrowScr
          ? [
              { x: (arrowScr.a.x + arrowScr.b.x) / 2, y: (arrowScr.a.y + arrowScr.b.y) / 2, behind: false },
              { x: arrowScr.a.x, y: arrowScr.a.y, behind: false },
            ]
          : (seen.length ? seen : all).map((p) => toScreen(p)).filter((s) => !s.behind)
      e.w = e.el.offsetWidth
      e.h = e.el.offsetHeight
      let best = null as { x: number; y: number; qx: number; qy: number; ax: number; ay: number; score: number; key: string } | null
      const prev = lastPick.get(e.el.dataset.id ?? '')
      for (const strict of [true, false]) {
        for (let ai = 0; ai < opts.length; ai++) {
          const p = opts[ai]
          if (p.x < 0 || p.x > width || p.y < 0 || p.y > height) continue
          // 짐 면 위의 기준점 (센서 · 버클): 짐 윤곽 밖으로 나가는 가장 짧은 길(깊이)만큼은 짐 위를 지나도 된다
          const base = hidden ? 0 : Math.max(0, depthIn(p, cargoHull))
          for (let di = 0; di < DIRS.length; di++) {
            const d = DIRS[di]
            const ls = strict ? lens : looser
            for (let li = 0; li < ls.length; li++) {
              const Ln = base * 1.1 + ls[li]
              const qx = p.x + d.x * Ln
              const qy = p.y + d.y * Ln
              let x: number
              let y: number
              if (Math.abs(d.x) > 0.38) {
                x = d.x > 0 ? qx : qx - e.w
                y = qy - e.h / 2
              } else {
                x = qx - e.w / 2
                y = d.y > 0 ? qy : qy - e.h
              }
              if (x < vx0 + edge || x + e.w > vx1 - edge || y < minY || y + e.h > maxY) continue
              const r = { x, y, w: e.w, h: e.h }
              if (taken.some((t) => rectsHit(r, t, 8))) continue
              let score = Ln
              const onCargo = rectHitsPoly(r, cargoHull, 6)
              if (strict && onCargo) continue
              const inside =Math.max(0, insideLen({ x: qx, y: qy }, p, cargoHull) - base * 1.1)
              if (strict && (onCargo || inside > 18)) continue
              // 끌어 선이 배지 위를 지나지 않게 (배지 둘레 6 px)
              const crossBadge = badgeRects.some((t) => segHitsRect({ x: qx, y: qy }, p, t, 6))
              if (strict && crossBadge) continue
              if (crossBadge) score += 300
              if (onCargo) score += 600
              score += inside * 8
              if (!strict) score += Math.max(0, Ln - base * 1.1 - cap) * 3
              if (e.at.kind === 'arrow' && bedHull.length && rectHitsPoly(r, bedHull, 4)) {
                if (strict) continue
                score += 400
              }
              if (ghostHull.length && rectHitsPoly(r, ghostHull, 4)) score += 120
              if (chevHull.length && rectHitsPoly(r, chevHull, 4)) score += 60
              // 옆문 · 뒷문 위에 걸치면 (알약이 적재함 테두리를 덮어 어수선하다) 조금 피한다
              for (const g of gateHulls) if (rectHitsPoly(r, g, 2)) score += 45
              if (arrowRect && e.at.kind !== 'arrow' && rectsHit(r, arrowRect)) score += 200
              if (e.side && (e.side === 'left') !== d.x < 0) score += 6
              const key = ai + ':' + di + ':' + li + ':' + strict
              if (key === prev) score -= 14
              if (!best || score < best.score) best = { x, y, qx, qy, ax: p.x, ay: p.y, score, key }
            }
          }
        }
        if (best) break
      }
      if (!best) {
        e.el.style.opacity = '0'
        e.line.style.opacity = '0'
        e.dot.style.opacity = '0'
        continue
      }
      lastPick.set(e.el.dataset.id ?? '', best.key)
      e.x = best.x
      e.y = best.y
      taken.push({ x: e.x, y: e.y, w: e.w, h: e.h })
      e.el.style.transform = `translate3d(${Math.round(e.x)}px, ${Math.round(e.y)}px, 0)`
      e.el.style.opacity = '1'
      // 끌어 선: 꼬리표 가장자리(q)에서 기준점까지. 끝 점은 기준점에
      e.line.setAttribute('x1', best.qx.toFixed(1))
      e.line.setAttribute('y1', best.qy.toFixed(1))
      e.line.setAttribute('x2', best.ax.toFixed(1))
      e.line.setAttribute('y2', best.ay.toFixed(1))
      e.line.style.opacity = '1'
      placeDot(e.dot, best.ax, best.ay, true)
    }

    // '앞': 바닥 꺾쇠 뒤 빈 바닥 (또는 앞 보호 틀 위). 보이는 빈 바닥 안에 들어갈 때만 보인다:
    //   적재함 바닥 안 · 옆문 · 뒷문 · 앞 판 · 짐 · 꺾쇠 · 꼬리표 · 배지와 겹치지 않는 자리를 몇 군데 시험해 첫 자리. 없으면 숨긴다
    {
      const fs = toScreen(frontAt)
      const fw = frontEl.offsetWidth
      const fh = frontEl.offsetHeight
      const cands: P2[] = []
      if (frontOnDeck) {
        const tip = toScreen(frontTip)
        const dx = fs.x - tip.x
        const dy = fs.y - tip.y
        const d = Math.hypot(dx, dy) || 1
        const ux = dx / d
        const uy = dy / d
        const off = Math.max(fw, fh) / 2 + 6
        for (const k of [1, 1.6, 2.3]) cands.push({ x: fs.x + ux * off * k - fw / 2, y: fs.y + uy * off * k - fh / 2 })
        // 꺾쇠 옆 (화면에서 꺾쇠 방향에 수직)
        const ch = boxHull(boxOf(-0.17, 0, chevrons.position.z - 0.06, 0.17, 0, chevrons.position.z + 0.24))
        let half = 0
        for (const p of ch) half = Math.max(half, Math.abs((p.x - fs.x) * -uy + (p.y - fs.y) * ux))
        const mid = toScreen(new THREE.Vector3(0, 0, chevrons.position.z + 0.09))
        for (const sgn of [1, -1]) cands.push({ x: mid.x - uy * sgn * (half + fw / 2 + 8) - fw / 2, y: mid.y + ux * sgn * (half + fh / 2 + 8) - fh / 2 })
        // 그래도 없으면 바닥 위 꺾쇠 양옆 (세계 좌표 x ±35 · 55 cm): 뒷문이 가까운 바닥을 가리는 낮은 시점용
        for (const wx of [-0.36, -0.56, 0.36, 0.56]) {
          const s = toScreen(new THREE.Vector3(wx, 0, chevrons.position.z + 0.06))
          cands.push({ x: s.x - fw / 2, y: s.y - fh / 2 })
        }
        const deck = boxHull(DECK_BOX)
        const gates = GATE_BOXES.map((b) => boxHull(b))
        let pick: P2 | null = null
        for (const c of cands) {
          const r = { x: c.x, y: c.y, w: fw, h: fh }
          if (fs.behind || r.x < vx0 + 4 || r.x + fw > vx1 - 4 || r.y < minY || r.y + fh > vy1 - 4) continue
          const corners = [
            { x: r.x, y: r.y },
            { x: r.x + fw, y: r.y },
            { x: r.x + fw, y: r.y + fh },
            { x: r.x, y: r.y + fh },
          ]
          if (corners.some((q) => depthIn(q, deck) < 4)) continue
          if (gates.some((g) => rectHitsPoly(r, g, 3))) continue
          if (!hidden && rectHitsPoly(r, cargoHull, 4)) continue
          if (ghostHull.length && rectHitsPoly(r, ghostHull, 2)) continue
          if (rectHitsPoly(r, ch, 3)) continue
          if (taken.some((t) => rectsHit(r, t, 6))) continue
          if (arrowRect && rectsHit(r, arrowRect)) continue
          pick = c
          break
        }
        frontEl.style.opacity = pick ? '1' : '0'
        if (pick) frontEl.style.transform = `translate3d(${Math.round(pick.x)}px, ${Math.round(pick.y)}px, 0)`
      } else {
        const r = { x: fs.x - fw / 2, y: fs.y - fh - 6, w: fw, h: fh }
        const ok = !fs.behind && r.x >= vx0 + 4 && r.x + fw <= vx1 - 4 && r.y >= minY && r.y + fh <= vy1 - 4 && !taken.some((t) => rectsHit(r, t, 6)) && (hidden || !rectHitsPoly(r, cargoHull, 4))
        frontEl.style.transform = `translate3d(${Math.round(r.x)}px, ${Math.round(r.y)}px, 0)`
        frontEl.style.opacity = ok ? '1' : '0'
      }
      frontEl.classList.toggle('on-deck', frontOnDeck)
    }
  }

  // 시점 바꿈: 600 ms, 들어가고 나오는 곡선 (--ease-emph 와 같은 느낌). 움직임이 꺼져 있으면 바로
  const easeInOut = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2)
  // 정차 화면의 '우와' (움직임 허용 · 정차일 때만, 모두 끝이 있다 → 끝나면 그리기 고리도 멈춘다):
  //   (2026-11-15) 새 짐이 올라올 때 (상차 확인 · 새 운송장): 시점 다가오기 1.2 s + 짐 내려앉기 · 벨트 하나씩 (applyArrival)
  //   → 다 내려앉고 300 ms 뒤 빛 띠 한 번 (1.4 s) → 끝. 빈 적재함 (상차 시트 뒤) 에서는 다가오기를 하지 않는다.
  //   문제 벨트 숨쉬기는 문제가 생긴 때부터 3 번 숨쉬고 고른 빛으로 멈춘다.
  //   (예전: 빈 적재함에서 다가오기 · 빛 띠 세 번 10.8 s = 불러오는 반짝임처럼 읽혔다. 끝없는 쉼 흔들림 ±5° 는 그 전에 뺐다)
  const INTRO_MS = 1200
  const SWEEP_N = 1
  const SWEEP_MS = 1400
  const SWEEP_EVERY = 3600
  const SWEEP_FROM = -2.1
  const SWEEP_TO = 2.3
  const PULSE_MS = 1600
  const PULSE_N = 3
  const HINT_MS = 1500
  let sweepT0 = -1
  let sweepsDone = false
  /** 느린 기기 (gauge 가 정한다): 이어 그리는 동안은 AO 를 뺀다 */
  let slowDevice = false
  let lastFrameT = 0
  let prevRender = -1e9
  const introAxis = new THREE.Vector3(0, 1, 0)
  const introTmp = new THREE.Vector3()
  const easeOutQuart = (k: number) => 1 - Math.pow(1 - k, 4)
  /** 숨쉬기 세기 (0 ~ 1): 시작부터 n 번, 마지막 한 번은 잦아든다 */
  const breath = (now: number, t0: number, period: number, n: number) => {
    const t = now - t0
    if (t0 < 0 || t >= period * n) return 0
    return Math.min(1, (period * n - t) / period)
  }
  function frame(now: number) {
    raf = 0
    step(now)
    // 그릴 것이 남았으면 (이어지는 움직임 · 손가락 뒤 관성 · 아직 못 그린 것) 다음 화면을 부른다. 없으면 여기서 멈춘다
    const moving = motionOk()
    const fx = moving && (!!intro || !!arrival || (sweepT0 >= 0 && !sweepsDone) || (hasPulse && breath(now, pulseT0, PULSE_MS, PULSE_N) > 0) || (hasHint && breath(now, hintT0, HINT_MS, PULSE_N) > 0))
    // 손가락을 뗀 뒤 관성은 움직임이 허용될 때만 (주행 · 움직임 줄이기면 손가락이 멈추면 바로 멈춘다)
    if (dirty || !!tween || !!slide || fx || (moving && now - lastInput < 1200) || !shown) kick()
  }
  function step(now: number) {
    const moving = motionOk()
    // 주행으로 바뀌면 (data-mode="drive") · 움직임 줄이기면 손가락 관성을 끄고 남은 관성을 버린다 (1.2 s 동안 미끄러지지 않게)
    if (controls.enableDamping !== moving) {
      controls.enableDamping = moving
      if (!moving) {
        const c = controls as unknown as { _sphericalDelta?: THREE.Spherical; _panOffset?: THREE.Vector3; _scale?: number }
        c._sphericalDelta?.set(0, 0, 0)
        c._panOffset?.set(0, 0, 0)
        if (c._scale !== undefined) c._scale = 1
      }
    }
    // 매 화면 그리는 때 (시점 바꿈 · 슬라이드 · 손가락 · 처음 다가오기). 숨쉬기 · 빛 지나감은 30 fps 로 일부러 줄이므로 속도 재기에서 뺀다
    const fullRate = !!tween || !!slide || !!intro || !!arrival || (moving && now - lastInput < 1200)
    // 처음 그림은 셰이더 엮기(compileAsync)를 1.5 s 까지, 진짜 하늘 HDR 을 0.8 s 까지 기다린다 (반사가 바뀌며 번쩍이지 않게).
    //   움직임이 꺼져 있으면 HDR 은 기다리지 않는다 (페이드가 없으니 번쩍임도 없다)
    if (!shown && !compiled && now - initT < 1500) return
    if (!shown && moving && !envReady && now - initT < 800) return
    if (intro && intro.t0 < 0) {
      // 새 짐 다가오기: 이미 걸린 시점 바꿈은 버리고 제자리를 끝으로 둔다
      intro.t0 = now
      tween = null
      controls.target.copy(goal.target)
    }
    if (arrival) {
      if (arrival.t0 < 0) arrival.t0 = now
      applyArrival(now)
      dirty = true
    }
    if (intro) {
      const k = moving ? Math.max(0, Math.min(1, (now - intro.t0) / (INTRO_MS * devSlow))) : 1
      const e = easeOutQuart(k)
      introTmp.copy(goal.pos).sub(goal.target).applyAxisAngle(introAxis, THREE.MathUtils.degToRad(-12) * (1 - e)).multiplyScalar(1 + 0.3 * (1 - e))
      introTmp.y += 0.25 * (1 - e)
      camera.position.copy(goal.target).add(introTmp)
      controls.target.copy(goal.target)
      if (k >= 1) intro = null
      dirty = true
    }
    // 빛 지나감: 세 번 쓸고 끝 (주행 · 움직임 줄이기 · 위에서 보기 · 손가락이 닿으면 그만)
    if (sweepT0 >= 0 && !sweepsDone) {
      const t = now - sweepT0
      const idx = Math.floor(t / SWEEP_EVERY)
      const within = t - idx * SWEEP_EVERY
      if (!moving || view !== '3d' || userMoved || idx >= SWEEP_N) {
        sweepsDone = true
        if (sweepU.uSweepAmt.value !== 0) dirty = true
        sweepU.uSweepAmt.value = 0
      } else if (t >= 0 && within < SWEEP_MS) {
        const k = within / SWEEP_MS
        sweepU.uSweepPos.value = SWEEP_FROM + (SWEEP_TO - SWEEP_FROM) * easeInOut(k)
        sweepU.uSweepAmt.value = 1
        if (now - lastFrameT > 33) dirty = true
      } else if (sweepU.uSweepAmt.value !== 0) {
        sweepU.uSweepAmt.value = 0
        dirty = true
      }
    }
    if (tween) {
      const k = moving ? Math.max(0, Math.min(1, (now - tween.t0) / 600)) : 1
      const e = easeInOut(k)
      camera.position.lerpVectors(tween.from, goal.pos, e)
      controls.target.lerpVectors(tween.fromT, goal.target, e)
      if (k >= 1) {
        tween = null
        userMoved = false
        // 위에서 보기는 다 온 뒤 직교로 바꿔 그린다
        if (view === 'top') active = ortho
      }
      dirty = true
    }
    if (slide) {
      const k = moving ? (now - slide.t0) / 1200 : 1
      applySlide(k)
      if (k >= 1) slide = null
      dirty = true
      // 짐 · 벨트가 움직이는 동안은 그림자도 따라간다
      shadowDirty = true
    }
    // 30 fps 로 충분한 반복 움직임 (문제 벨트 숨쉬기)
    const loopTick = moving && now - lastFrameT > 33
    if (pulseMats.size) {
      // 문제 벨트: 자체 빛 0.25 를 가운데로 0.1 ~ 0.6 (1.6 s 주기, 5 번, 마지막에 잦아든다). 주행 · 움직임 줄이기 · 다 숨쉰 뒤는 0.25 그대로
      const a = hasPulse && moving ? breath(now, pulseT0, PULSE_MS, PULSE_N) : 0
      const v = PROBLEM_GLOW + a * (a > 0 ? 0.25 * Math.sin(((now - pulseT0) / PULSE_MS) * Math.PI * 2) + 0.1 : 0)
      let changed = false
      for (const m of pulseMats)
        if (m.emissiveIntensity !== v) {
          m.emissiveIntensity = v
          changed = true
        }
      if (changed && (loopTick || a === 0)) dirty = true
    }
    // 더 걸 자리 띠: 1.5 s 주기로 자체 빛이 옅게 숨쉰다 (5 번). 아니면 그대로
    if (hintMats.size) {
      const a = hasHint && moving ? breath(now, hintT0, HINT_MS, PULSE_N) : 0
      const o = HINT_GLOW + a * 0.18 * Math.sin(((now - hintT0) / HINT_MS) * Math.PI * 2)
      let changed = false
      for (const m of hintMats)
        if (m.emissiveIntensity !== o) {
          m.emissiveIntensity = o
          changed = true
        }
      if (changed && (loopTick || a === 0)) dirty = true
    }
    if (dirty) lastFrameT = now
    if (active === camera && now - lastInput < 1200) controls.update()
    if (!dirty) return
    dirty = false
    if (active === camera) controls.update()
    setHeadShadow(view !== 'top')
    // 위에서 보기: 윗 덮개 · 기둥이 천장 빛을 정면으로 받아 흰 테두리처럼 보이지 않게 반사를 낮춘다
    //   (scene.environment 를 쓰는 재료는 envMapIntensity 를 무시하므로, 이 셋은 envMap 을 직접 단다: 아래 envOwn)
    const flat = active === ortho
    //   주광 · 테두리 빛의 반짝임도 위에서는 덮개 길이 전체에 고르게 서므로 한 단 어둡고 무르게
    M.gateCap.envMapIntensity = ENV_I * (flat ? 0.35 : 1)
    M.gate.envMapIntensity = GATE_ENV * (flat ? 0.7 : 1)
    M.post.envMapIntensity = POST_ENV * (flat ? 0.45 : 1)
    M.swage.envMapIntensity = SWAGE_ENV * (flat ? 0.6 : 1)
    // 바닥 원판의 빛 웅덩이는 비스듬히 볼 때의 반사라 위에서 보기에서는 옅게
    M.floor.opacity = flat ? 0.55 : 1
    M.gateCap.color.setHex(flat ? 0x6a7076 : 0xc4cad0)
    M.gateCap.roughness = flat ? 0.45 : 0.16
    M.post.color.setHex(flat ? 0x43484e : 0x50565d)
    //   테이프 투명 막 · 바닥 강판도 천장 판을 정면으로 비춰 흰 띠 · 회색 판이 되므로 위에서는 낮춘다
    //   (바로 위 주광의 반짝임도: 직교라 판 전체가 같은 각이 된다 → 위에서는 더 거칠게)
    cartonMat.clearcoat = flat ? 0.12 : 0.9
    cartonMat.roughness = flat ? 2.2 : 1
    M.deckTop.envMapIntensity = flat ? 0.35 : 1
    // (거칠기 지도 가운데 값 0.5 를 곱하므로 실제 거칠기는 이 값의 절반쯤: 3D 0.45 · 위에서 0.8)
    M.deckTop.roughness = flat ? 1.6 : 0.9
    renderer.shadowMap.needsUpdate = shadowDirty
    if (shadowDirty) shadowRenders++
    shadowDirty = false
    // AO: 느린 기기(downgraded)는 이어 그리는 동안(시점 바꿈 · 손가락) 빼고, 멈춘 뒤 한 번 더 AO 와 함께 그린다
    const ao = !(slowDevice && fullRate)
    drawScene(ao)
    if (!ao) dirty = true
    // 이어서 그리는 동안(시점 바꿈 · 슬라이드 · 손가락)의 그림 사이 간격 = 기기가 실제로 내는 속도
    if (fullRate && moving && now - prevRender < 200) gauge(now - prevRender)
    prevRender = now
    placeOverlay()
    if (!shown) {
      // 처음 그린 뒤: 포스터(첫 그림 전 자리 그림)에서 480 ms 에 걸쳐 바뀐다 (움직임 허용일 때만, 아니면 바로).
      //   꼬리표 층은 첫 자리 잡기(placeOverlay) 뒤에야 보인다 (그 전에는 끌어 선 점이 왼쪽 끝 (0, y) 에 떠 있었다)
      shown = true
      tagLayer.style.visibility = ''
      const cv = renderer.domElement
      if (moving) {
        cv.style.transition = 'opacity 480ms cubic-bezier(0.2, 0, 0, 1)'
        poster.style.transition = 'opacity 480ms cubic-bezier(0.2, 0, 0, 1)'
        requestAnimationFrame(() => {
          cv.style.opacity = '1'
          poster.style.opacity = '0'
        })
      } else {
        cv.style.opacity = '1'
        poster.style.opacity = '0'
      }
    }
  }
  /**
   * 느린 기기 (Pleos WebView = 안드로이드): 셰이더를 엮는 처음 세 번을 빼고, 이어 그린 12 번의 간격 가운데 값이 34 ms (30 fps 밑) 를 넘으면
   * 그림자 지도 1024. PC (시연 · 사진) 는 늘 그대로
   */
  const samples: number[] = []
  let skip = 3
  let downgraded = !/Android/i.test(navigator.userAgent)
  function gauge(ms: number) {
    if (downgraded || samples.length >= 12) return
    if (skip-- > 0) return
    samples.push(ms)
    if (samples.length < 12) return
    const med = [...samples].sort((a, b) => a - b)[6]
    if (med <= 34) return
    downgraded = true
    slowDevice = true
    key.shadow.mapSize.set(1024, 1024)
    key.shadow.map?.dispose()
    key.shadow.map = null
    shadowDirty = true
    invalidate()
  }

  const ro = new ResizeObserver(() => layout())
  ro.observe(host)
  readTheme()
  layout()
  kick()
  // 짐 · 벨트가 들어온 뒤 (BedView 가 바로 update 를 부른다) 셰이더를 미리 엮는다. 다 되면 첫 그림
  queueMicrotask(() => {
    if (disposed) return
    const done = () => {
      compiled = true
      invalidate()
    }
    try {
      renderer.compileAsync(scene, camera).then(done, done)
    } catch {
      done()
    }
  })
  // 글꼴이 온 뒤 꼬리표 폭을 다시 잰다
  document.fonts?.ready.then(() => invalidate()).catch(() => {})

  const handle: BedHandle = {
    update,
    setView,
    setReserveTop(px: number) {
      if (px === reserveTop) return
      reserveTop = px
      refit()
    },
    setLoadId(id: string | null) {
      if (id === loadId) return
      loadId = id
      // 새 운송장: 같은 짐 종류여도 새 짐이 올라오는 모습을 다시 (값 열쇠를 지워 벨트를 하나씩 다시 만든다)
      if (input && !input.empty) {
        const i = input
        lastFullKey = ''
        lastSceneKey = ''
        update(i)
      }
    },
    dispose() {
      disposed = true
      cancelAnimationFrame(raf)
      raf = 0
      ro.disconnect()
      themeMo.disconnect()
      uiMo.disconnect()
      modeMo.disconnect()
      reduceMq?.removeEventListener?.('change', invalidate)
      if (post) {
        post.rt.dispose()
        post.gtao.dispose()
        post.white.dispose()
        post.mat.dispose()
        post.quad.dispose()
      }
      env.dispose()
      if (import.meta.env?.DEV) {
        const w = window as unknown as { __bedScenes?: unknown[] }
        w.__bedScenes = (w.__bedScenes ?? []).filter((h) => h !== dev)
      }
      controls.dispose()
      for (const t of tagEls.values()) t.el.remove()
      for (const b of badgeEls.values()) b.el.remove()
      badgeEls.clear()
      frontEl.remove()
      svg.remove()
      poster.remove()
      tagLayer.style.visibility = ''
      tagLayer.style.opacity = ''
      clearGroup(cargoBody)
      clearGroup(straps)
      clearGroup(sensors)
      for (const d of disposables) d.dispose()
      renderer.dispose()
      renderer.domElement.remove()
    },
  }
  // 개발 서버에서만: 화면 검사 도구가 장면 값을 바꾸고 그리기 횟수를 잴 수 있게 (window.__bedScenes)
  const dev = {
    update: (i: BedInput) => update(i),
    lastInput: () => input,
    dbg: () => dbg,
    stats: () => ({ renders: renderCount, looping: raf !== 0, intro: !!intro, arrival: !!arrival, sweepsDone, sweepT0, pcss, post: !!post, calls: sceneCalls, envReady, hdrOk, compiled, shadowRenders }),
    /** 조율용 (개발 서버만): 재료 · 빛 · 후처리 값을 바꿔 보고 invalidate() */
    tune: { M, cartonMat, sweepU, post, scene, key, rim, warm, hemi, renderer, invalidate },
    /** 조율용 (개발 서버만): 새 짐 올라오기 · 다가오기를 k 배 느리게 (느린 SwiftShader 화면 사진으로 한 장면씩 보려고) */
    slow: (k: number) => (devSlow = Math.max(1, k)),
  }
  if (import.meta.env?.DEV) {
    const w = window as unknown as { __bedScenes?: unknown[] }
    w.__bedScenes = [...(w.__bedScenes ?? []), dev]
  }
  return handle
}
