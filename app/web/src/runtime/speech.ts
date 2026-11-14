/**
 * 말하기 · 듣기.
 *   말하기: Android TextToSpeech (껍데기) -> 브라우저 음성 (ko-KR) -> 녹음한 문장 (public/voice) -> 소리 없이 화면만
 *   듣기:   Android SpeechRecognizer -> 브라우저 음성 인식 -> 없음 (시연에서는 '네' 단추가 대신 답한다)
 * 기획서: TTS/STT SDK 가 "준비 중"이면 녹음한 문장을 재생하고, 응답은 정차 후 화면에서 고른다.
 * 마이크는 안내음 뒤 5초만 열고, 음성은 저장하지 않는다 (들은 글자만 기록).
 */
import { bridge, nativeInfo, onNative } from './native'

export type Voice = 'android' | 'web' | 'recorded' | 'none'
export type Ear = 'android' | 'none'
export type Heard = { heard: string; yes: boolean; by: 'voice' | 'demo' }

const YES = /^(네|예|응|그래|좋아|어|넵|넹|안내|부탁|해 ?줘|yes|ok)/i
export const isYes = (s: string) => YES.test(s.trim().replace(/^[\s.,!?]+/, ''))

let manifest: Record<string, string> | null = null
let manifestLoad: Promise<void> | null = null
function loadManifest() {
  manifestLoad ??= fetch('./voice/manifest.json')
    .then((r) => (r.ok ? r.json() : {}))
    .then((m) => {
      manifest = m as Record<string, string>
    })
    .catch(() => {
      manifest = {}
    })
  return manifestLoad
}

let koVoice: SpeechSynthesisVoice | null = null
function pickVoice() {
  if (typeof speechSynthesis === 'undefined') return null
  const vs = speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith('ko'))
  // 자연스러운 목소리를 먼저 (Edge 'Online (Natural)', Chrome 'Google')
  koVoice = vs.find((v) => /natural|online/i.test(v.name)) ?? vs.find((v) => /google/i.test(v.name)) ?? vs[0] ?? null
  return koVoice
}
if (typeof speechSynthesis !== 'undefined') {
  pickVoice()
  speechSynthesis.addEventListener?.('voiceschanged', pickVoice)
}

export function voiceKind(prefer: 'auto' | 'recorded' = 'auto'): Voice {
  const info = nativeInfo()
  if (prefer === 'auto' && info?.tts) return 'android'
  if (prefer === 'auto' && !info && typeof speechSynthesis !== 'undefined' && (koVoice ?? pickVoice())) return 'web'
  return 'recorded'
}

/** 듣기: 차의 Pleos STT(ON_DEVICE) 만. 브라우저 음성 인식(Web Speech API)은 소리를 외부 서버로 보내므로 쓰지 않는다
 *  (공모전 규칙: 외부 음성 인식 금지). 시연 무대에서는 "네" 를 시연 패널에서 고른다 */
export function earKind(): Ear {
  const info = nativeInfo()
  return info?.stt ? 'android' : 'none'
}

// ── 네이티브 콜백 ──
const nativeSpeak = new Map<string, (ok: boolean) => void>()
const nativeListen = new Map<string, (r: { heard: string } | null) => void>()
onNative({
  onSpeechDone: (id, ok) => {
    nativeSpeak.get(id)?.(ok)
    nativeSpeak.delete(id)
  },
  onListenResult: (id, json) => {
    let r: { heard: string } | null = null
    try {
      const o = JSON.parse(json) as { heard?: string }
      r = o.heard ? { heard: o.heard } : null
    } catch {
      r = null
    }
    nativeListen.get(id)?.(r)
    nativeListen.delete(id)
  },
})

let seq = 0
let current: HTMLAudioElement | null = null

/** 말이 끝나면 풀린다. 소리를 못 내면 글자 길이만큼 기다린다 (화면 표시 시간) */
/** 미리 만든 소리 파일 (tools/make_voice_elevenlabs.mjs). 경유지 문장은 거리 숫자를 빼고 쉼터 이름으로 찾는다 */
function recordedFile(text: string): string | undefined {
  if (!manifest) return undefined
  if (manifest[text]) return manifest[text]
  const m = text.match(/(졸음쉼터 \S+?)를 경유지로 넣었습니다\.$/)
  if (m) return manifest['__waypoint:' + m[1]] ?? manifest['__waypoint']
  return /경유지로 넣었습니다\.$/.test(text) ? manifest['__waypoint'] : undefined
}

function playRecorded(file: string, volume: number): Promise<boolean> {
  return new Promise<boolean>((res) => {
    const a = new Audio('./voice/' + file)
    current = a
    a.volume = volume
    a.onended = () => res(true)
    a.onerror = () => res(false)
    a.play().catch(() => res(false))
  }).finally(() => {
    current = null
  })
}

export async function speak(text: string, opts: { prefer?: 'auto' | 'recorded'; volume?: number } = {}): Promise<Voice> {
  const kind = voiceKind(opts.prefer ?? 'auto')
  const id = 'sp' + ++seq
  await loadManifest()
  const file = recordedFile(text)
  // 목소리 순서: ElevenLabs 로 미리 만든 소리가 있으면 그것을 먼저 튼다.
  // 단 Pleos Connect 에서는 Pleos TextToSpeech SDK 가 기본이다 (설정 '녹음한 문장 쓰기'를 켜면 차에서도 미리 만든 소리).
  const recordedFirst = !!file && (opts.prefer === 'recorded' || (manifest?.__engine === 'elevenlabs' && !nativeInfo()?.pleosTts))
  if (recordedFirst && (await playRecorded(file, opts.volume ?? 1))) return 'recorded'
  if (kind === 'android') {
    const b = bridge()
    if (b) {
      const ok = await new Promise<boolean>((res) => {
        nativeSpeak.set(id, res)
        b.speak(id, text)
        window.setTimeout(() => res(true), 2000 + text.length * 220)
      })
      if (ok) return 'android'
    }
  }
  if (kind === 'web' && koVoice) {
    const done = await new Promise<boolean>((res) => {
      const u = new SpeechSynthesisUtterance(text)
      u.voice = koVoice
      u.lang = koVoice?.lang ?? 'ko-KR'
      u.rate = 1.02
      u.volume = opts.volume ?? 1
      u.onend = () => res(true)
      u.onerror = () => res(false)
      speechSynthesis.cancel()
      speechSynthesis.speak(u)
      window.setTimeout(() => res(true), 3000 + text.length * 250)
    })
    if (done) return 'web'
  }
  if (file && !recordedFirst && (await playRecorded(file, opts.volume ?? 1))) return 'recorded'
  await new Promise((r) => window.setTimeout(r, 900 + text.length * 120))
  return 'none'
}

export function stopSpeaking() {
  bridge()?.stopSpeaking()
  if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel()
  current?.pause()
}

// ── 듣기 ──
let demoAnswer: ((h: Heard) => void) | null = null
/** 질문을 말하는 중에 미리 누른 '네' (듣기가 열리면 바로 쓴다, 15초 안) */
let early: { h: Heard; at: number } | null = null

/** 시연: '네' 단추 (음성 인식이 불안정할 때 스크립트 입력으로 대신한다는 기획서 방침) */
export function answerByDemo(text = '네') {
  const h: Heard = { heard: text, yes: isYes(text), by: 'demo' }
  if (demoAnswer) demoAnswer(h)
  else early = { h, at: performance.now() }
}

/** 질문이 끝나기 전에 받아 둔 대답을 버린다 (새 질문이 아닐 때) */
export function clearEarlyAnswer() {
  early = null
}

type Rec = {
  lang: string
  interimResults: boolean
  maxAlternatives: number
  continuous: boolean
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  onerror: (() => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}

/** seconds 동안 듣는다. 못 들으면 null */
export function listen(seconds: number): Promise<Heard | null> {
  if (early && performance.now() - early.at < 15000) {
    const h = early.h
    early = null
    return Promise.resolve(h)
  }
  early = null
  return new Promise((resolve) => {
    let settled = false
    const finish = (h: Heard | null) => {
      if (settled) return
      settled = true
      demoAnswer = null
      window.clearTimeout(timer)
      if (nid) bridge()?.cancelListen()
      resolve(h)
    }
    demoAnswer = finish
    const timer = window.setTimeout(() => finish(null), seconds * 1000 + 600)
    let nid: string | null = null
    const ear = earKind()
    if (ear === 'android') {
      const b = bridge()
      if (b) {
        nid = 'ls' + ++seq
        nativeListen.set(nid, (r) => finish(r ? { heard: r.heard, yes: isYes(r.heard), by: 'voice' } : null))
        b.listen(nid, seconds * 1000)
      }
    }
  })
}

// ── 키트 부저 (시연용 소리). 실제 부저는 키트에 있고 통신이 끊겨도 울린다 ──
let ctx: AudioContext | null = null
export function buzz(pattern: number[] = [0.18, 0.12, 0.18, 0.12, 0.18]) {
  try {
    ctx ??= new AudioContext()
    let t = ctx.currentTime + 0.02
    pattern.forEach((d, i) => {
      if (i % 2 === 0) {
        const o = ctx!.createOscillator()
        const g = ctx!.createGain()
        o.type = 'square'
        o.frequency.value = 2400
        g.gain.setValueAtTime(0.0001, t)
        g.gain.exponentialRampToValueAtTime(0.08, t + 0.01)
        g.gain.exponentialRampToValueAtTime(0.0001, t + d)
        o.connect(g).connect(ctx!.destination)
        o.start(t)
        o.stop(t + d + 0.02)
      }
      t += d
    })
  } catch {
    /* 소리를 못 내는 환경 */
  }
}

/** 사용자 동작으로 오디오를 깨운다 (브라우저 자동재생 정책) */
export function unlockAudio() {
  try {
    ctx ??= new AudioContext()
    if (ctx.state === 'suspended') void ctx.resume()
  } catch {
    /* 없음 */
  }
  void loadManifest()
}
