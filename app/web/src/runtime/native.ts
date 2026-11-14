/**
 * Android(Pleos/AAOS) 껍데기와의 다리. 앱이 WebView 안에서 돌면 window.JaejeokAndroid 가 있다 (android/ 의 Kotlin 코드).
 * 네이티브 -> 웹 은 window.jaejeokNative.on*(...) 로 부른다.
 */
export type NativeInfo = {
  platform: 'aaos' | 'android'
  debug: boolean
  car: boolean
  speed: boolean
  steering: boolean
  gear: boolean
  uxr: boolean
  tts: boolean
  stt: boolean
  version: string
  /** nav | phone (Android 빌드 종류) */
  device?: 'nav' | 'phone'
  camera?: boolean
  /** 시스템 밤 모드 (내비 판 밤 화면). 바뀌면 onTheme 이 불린다 */
  night?: boolean
  /** Pleos Playground SDK 가 붙었나 */
  pleosVehicle?: boolean
  pleosNavi?: boolean
  pleosTts?: boolean
  pleosStt?: boolean
  pleosLocation?: boolean
}

export type AndroidBridge = {
  info(): string
  speak(id: string, text: string): void
  stopSpeaking(): void
  listen(id: string, timeoutMs: number): void
  cancelListen(): void
  saveFile(name: string, mime: string, text: string): string
  addWaypoint(name: string, lat: number, lng: number): string
  log(msg: string): void
}

export type NativeVehicle = {
  speedKmh?: number | null
  steerDeg?: number | null
  steerIsWheel?: boolean
  brake?: boolean | null
  gear?: 'P' | 'R' | 'N' | 'D' | null
  uxRestricted?: boolean | null
  parkingBrake?: boolean | null
  lat?: number | null
  lng?: number | null
  /** Pleos Vehicle SDK: 뒷문(테일게이트) 열림 정도 0~100. 정차 중 열리면 하차로 본다 */
  rearDoor?: number | null
  /** Pleos Vehicle SDK: 누적 주행거리 (km) */
  odometerKm?: number | null
  /** Pleos NaviHelper: 앞의 주의 지점 (방지턱 · 내리막 · 미끄러운 길) */
  caution?: { id: string; type: 'bump' | 'downhill' | 'slippery'; distM: number } | null
  steerSource?: 'pleos' | 'aaos'
}

export type NativeCallbacks = {
  onVehicle: (json: string) => void
  onSpeechDone: (id: string, ok: boolean) => void
  onListenResult: (id: string, json: string) => void
  /** Pleos NaviHelper: 경유지(쉼터)에 닿음 */
  onWaypointArrived: (name: string) => void
  /** 시스템 낮 · 밤이 바뀜 */
  onTheme: (night: boolean) => void
}

declare global {
  interface Window {
    JaejeokAndroid?: AndroidBridge
    jaejeokNative?: Partial<NativeCallbacks>
  }
}

export const bridge = (): AndroidBridge | null => (typeof window !== 'undefined' && window.JaejeokAndroid ? window.JaejeokAndroid : null)

export function nativeInfo(): NativeInfo | null {
  const b = bridge()
  if (!b) return null
  try {
    return JSON.parse(b.info()) as NativeInfo
  } catch {
    return null
  }
}

/** 네이티브가 부를 함수를 등록 (여러 곳에서 나눠 등록해도 합쳐진다) */
export function onNative(part: Partial<NativeCallbacks>) {
  window.jaejeokNative = { ...(window.jaejeokNative ?? {}), ...part }
}
