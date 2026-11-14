/**
 * 판정 엔진 상수. 값과 문장은 기획서(적재적소_기획서 v3)의 [표 2]와 "판정 엔진과 앱 구조"를 그대로 따른다.
 * "임시값"이라고 적은 것은 기획서에서도 인터뷰·시범 운영으로 고칠 값이다.
 */
export const G = 9.81
/** 미끄러지는 중의 마찰 (팀 계산식의 0.8) */
export const SLIDE_FACTOR = 0.8
/** 기준: 앞 0.8 g, 옆·뒤 0.5 g */
export const CRIT = { fwd: 0.8, side: 0.5, rear: 0.5 } as const
/** 키트가 없을 때 속도로 구한 감속·회전에 곱하는 배율 (Isaac Sim 37회에서 맞춘 임시값) */
export const KITLESS_FACTOR = 1.25
/** PV5 축간거리 (m) */
export const WHEELBASE_M = 2.995
/** 속도 신호가 이보다 드물면 제동 판정은 회색 */
export const MIN_SPEED_HZ = 5
/** 키트 값이 이만큼 안 오면 키트 없는 판정으로 돌아간다 (s) */
export const KIT_STALE_S = 3
/** 키트가 없을 때의 벨트 각도 (도, 임시값) */
export const DEFAULT_ANGLE_DEG = 45
/** 벨트 라벨 표준 장력 STF 기본값 (N). 250 daN, 임시값 */
export const DEFAULT_STF_N = 2500
/** PV5 오픈베드 적재함 (m). 앞벽 높이는 임시값 */
export const BED = { l: 2.42, w: 1.785, wallH: 1.2, sideH: 0.355 } as const
/** 재점검 주행거리 (km) */
export const RECHECK_KM = 80
/** 같은 안내를 되풀이하지 않는 시간 (s) */
export const SAME_NOTICE_S = 600
/** 주의 구간 안내는 상차 한 번에 이만큼까지 */
export const CAUTION_MAX = 3
/** 주의 구간 안내를 하는 거리 (m) */
export const CAUTION_SPEAK_M = 300
/** 안내음 뒤 마이크를 여는 시간 (s) */
export const LISTEN_S = 5
/** 이만큼 넘게 서 있으면 말해도 된다 (s) */
export const SPEAK_STOP_S = 2
/** 핸들이 곧게 돌아왔다고 보는 앞바퀴 각 (도) */
export const STEER_STRAIGHT_DEG = 3
/** 브레이크 신호가 없을 때 브레이크를 밟았다고 보는 감속 (g) */
export const BRAKE_INFER_G = 0.08
/** 키트: 짐이 이만큼 움직이면 '짐 밀림' (mm) */
export const SHIFT_MOVED_MM = 30
/** 키트: 출발 때 장력의 이 비율 밑이면 '바 풀림' */
export const LOOSE_RATIO = 0.5
/** 키트: 모든 장력이 출발 때의 이 비율 밑이고 태그가 큰 충격을 재면 '짐 이탈 의심' */
export const LOST_RATIO = 0.1
/** 키트 부저: 적재함 가속이 이 밑으로 잦아든 뒤 울린다 (g) */
export const BUZZER_CALM_G = 0.1
/** 움직인다고 보는 속도 (km/h) */
export const MOVING_KMH = 2
