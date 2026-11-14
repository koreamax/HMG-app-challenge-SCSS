/**
 * 공용 부품 (design/DESIGN_SPEC.md §3, 겉면은 §10 v5 'Obsidian Studio'): 경고등 · 상태 칩 · 단추 · 칸 단추 · 나눔 단추 · 증감 · 켜기 · 칸 · 목록 줄 · 할 일 줄 · 듣는 중 알약 · 값 + 단위 · 업무 아이콘.
 * 모양은 ui.css, 크기는 앱 뿌리의 변수 (내비 1920 설계 px, 폰). 색 뜻은 늘 말 + 모양으로 (색만으로 뜻을 전하지 않는다).
 * 색의 역할: 상태 색 = 경고등 · 막대 · 점, 파랑 = 주 단추 하나, 고른 것 = 진한 면(--select). 값은 잉크색.
 * 움직임 (§8.2): CountUp(숫자 세기) · usePresence(나가는 움직임) · celebrate/Celebrate(다 됐어요) · motionOk(주행 중 · 움직임 줄이기면 false).
 */
import { useEffect, useRef, useState, useSyncExternalStore, type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from 'react'
import { Check, Mic, Minus, Plus } from 'lucide-react'
import type { Tone } from '@/engine/limit'
import './ui.css'

/** 움직여도 되는가: 주행 중(앱 뿌리 data-mode="drive")이 아니고, 움직임 줄이기 설정이 아니다 */
export function motionOk() {
  if (typeof document === 'undefined') return false
  if (document.querySelector('.jj[data-mode="drive"]')) return false
  return !(typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches)
}

/** 나가는 움직임을 위해 닫힌 뒤에도 ms 동안 붙여 둔다. [붙어 있나, 나가는 중] */
export function usePresence(open: boolean, ms = 200): [boolean, boolean] {
  const [mounted, setMounted] = useState(open)
  const [leaving, setLeaving] = useState(false)
  useEffect(() => {
    if (open) {
      setMounted(true)
      setLeaving(false)
      return
    }
    if (!mounted) return
    if (!motionOk()) {
      setMounted(false)
      return
    }
    setLeaving(true)
    const t = window.setTimeout(() => {
      setMounted(false)
      setLeaving(false)
    }, ms)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])
  return [mounted, leaving]
}

/** 숫자 세기: 처음 보일 때 0 에서 값까지 (700 ms, 끝에서 느려짐). 뒤에 바뀌는 값은 바로 보인다 */
export function CountUp({ value, ms = 700 }: { value: string | number; ms?: number }) {
  const text = String(value)
  const m = /^(-?)(\d{1,3}(?:,\d{3})*|\d+)(\.\d+)?$/.exec(text)
  const target = m ? Number(text.replace(/,/g, '')) : NaN
  const decimals = m && m[3] ? m[3].length - 1 : 0
  const comma = !!m && m[2].includes(',')
  const fmt = (v: number) => {
    const f = v.toFixed(decimals)
    return comma ? Number(f).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) : f
  }
  const [shown, setShown] = useState<string | null>(() => (m && motionOk() && target !== 0 ? fmt(0) : null))
  const animate = useRef(shown !== null)
  useEffect(() => {
    if (!animate.current) return
    // 시각은 모두 performance.now() 로 (rAF 시각과 섞으면 첫 프레임에 k 가 음수가 될 수 있다)
    const t0 = performance.now()
    let raf = 0
    const step = () => {
      const k = Math.max(0, Math.min(1, (performance.now() - t0) / ms))
      const e = 1 - Math.pow(1 - k, 4)
      if (k >= 1) {
        animate.current = false
        setShown(null)
      } else {
        setShown(fmt(target * e))
        raf = requestAnimationFrame(step)
      }
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return <span className="ui-count">{shown ?? text}</span>
}

// ── 다 됐어요: 한 번 보이는 확인 (다시 조였어요 · 확인했어요 뒤). 어느 화면에서든 celebrate('…') 를 부르면 앱 뿌리의 <Celebrate/> 가 보인다 ──
type Done = { text: string; at: number } | null
let done: Done = null
const doneSubs = new Set<() => void>()
export function celebrate(text: string) {
  if (!motionOk()) return
  done = { text, at: Date.now() }
  doneSubs.forEach((f) => f())
}
const doneSub = (f: () => void) => (doneSubs.add(f), () => void doneSubs.delete(f))
export function Celebrate() {
  const d = useSyncExternalStore(doneSub, () => done)
  const [shown, setShown] = useState<Done>(null)
  // 보이는 시간은 CSS 움직임(ui-done-life 1.8 s)이 정한다: 화면이 바뀌며 3D 를 다시 만드느라 잠깐 멈춰도 그린 뒤부터 센다.
  // 움직임이 멈춘 경우(주행 시작 등)를 위해 4 s 뒤에는 어쨌든 거둔다
  useEffect(() => {
    // 오래된 것(다시 붙은 화면이 지난 확인을 또 보이지 않게)은 건너뛴다
    if (!d || Date.now() - d.at > 1500) return
    setShown(d)
    const t = window.setTimeout(() => setShown(null), 4000)
    return () => window.clearTimeout(t)
  }, [d])
  if (!shown) return null
  return (
    <div className="ui-done-layer" role="status" aria-live="polite" key={shown.at} onAnimationEnd={(e) => e.target === e.currentTarget && setShown(null)}>
      <div className="ui-done">
        <span className="ui-done-mark" aria-hidden="true">
          <Check strokeWidth={2} />
        </span>
        <b>{shown.text}</b>
      </div>
    </div>
  )
}

/**
 * 토스트: 글만큼 폭인 알약 + 앞에 ✓ (주 단추와 다른 모양). dock = 단추 줄 위 가운데 줄에 16 px 띄워 담는다.
 * 앱 뿌리(내비 nv-notice · 폰 ph-toast)가 이것으로 바꿔 쓰면 두 앱이 같은 토스트가 된다
 */
export function Toast({ children, dock = false, icon = true }: { children: ReactNode; dock?: boolean; icon?: boolean }) {
  const t = (
    <div className="ui-toast" role="status" aria-live="polite">
      {icon && <Check strokeWidth={2.5} aria-hidden="true" />}
      <span>{children}</span>
    </div>
  )
  return dock ? <div className="ui-toast-dock">{t}</div> : t
}

export type TileTone = Tone | 'neutral'
export const toneClass = (t: TileTone) => (t === 'neutral' ? 'neutral' : 'tone-' + t)

/** 상태 모양 넷: 초록 ● ✓ · 주황 ▲ ! · 빨강 ◆ ! · 회색 ○ –. 면 = --shape, 안 표시 = --mark */
export function SignShape({ tone, className = '' }: { tone: Tone; className?: string }) {
  return (
    <svg className={'ui-shape ' + className} viewBox="0 0 100 100" aria-hidden="true">
      {tone === 'green' && (
        <>
          <circle className="sh" cx="50" cy="50" r="47" />
          <path className="mk-line" d="M27 51 43.5 67.5 74 36" strokeWidth="11" strokeLinecap="square" strokeLinejoin="miter" />
        </>
      )}
      {tone === 'orange' && (
        <>
          <path className="sh" d="M50 4 97 92H3Z" />
          <rect className="mk" x="44" y="35" width="12" height="31" />
          <rect className="mk" x="44" y="72" width="12" height="11" />
        </>
      )}
      {tone === 'red' && (
        <>
          <path className="sh" d="M50 2 98 50 50 98 2 50Z" />
          <rect className="mk" x="44" y="24" width="12" height="34" />
          <rect className="mk" x="44" y="64" width="12" height="12" />
        </>
      )}
      {tone === 'grey' && (
        <>
          <circle className="sh-ring" cx="50" cy="50" r="42" strokeWidth="10" />
          <rect className="sh" x="28" y="44" width="44" height="12" />
        </>
      )}
    </svg>
  )
}

const TONE_WORD: Record<Tone, string> = { green: '초록', orange: '주황', red: '빨강', grey: '회색' }

/** 경고등: 상태 색으로 꽉 찬 둥근 네모 + 흑연 모양 (계기판 경고등처럼). 깜박이지 않는다 */
export function Sign({ tone, className = '' }: { tone: Tone; className?: string }) {
  return (
    <div className={`ui-sign tone-${tone} ${className}`} role="img" aria-label={TONE_WORD[tone] + ' 표지'}>
      <SignShape tone={tone} />
    </div>
  )
}

/** 상태 칩: 중립 면 + 상태 점 + 상태 글자. solid = 꽉 찬 상태 면 (화면에 '사건' 하나만) */
export function StatusChip({ tone, children, solid = false, className = '' }: { tone: TileTone; children: ReactNode; solid?: boolean; className?: string }) {
  return <span className={`ui-chip ${tone === 'neutral' ? 'neutral' : 'tone-' + tone}${solid ? ' solid' : ''} ${className}`}>{children}</span>
}

/** 값 + 단위: 값은 잉크 700 tabular, 단위는 값의 0.45 배 --muted (글자 바닥 caption 밑으로 줄지 않는다) */
export function Num({ value, unit, className = '', style }: { value: ReactNode; unit?: string; className?: string; style?: CSSProperties }) {
  return (
    <span className={'ui-num ' + className} style={style}>
      {value}
      {unit && <small>{unit}</small>}
    </span>
  )
}

/**
 * '0.88 g' · '1,250 N' · '11 cm' 같은 글을 값과 단위로 나눠 <Num> 으로 (단위 0.45 배 · --muted · tabular).
 * 숫자로 시작하지 않는 글은 그대로 둔다. 기록 우물 · 장력 줄처럼 값이 글로 오는 곳에서 쓴다
 */
export function NumText({ text, className = '', style }: { text: string; className?: string; style?: CSSProperties }) {
  const m = /^\s*([-−+]?[\d][\d.,:]*)\s*(.*?)\s*$/.exec(text)
  if (!m) return <span className={className} style={style}>{text}</span>
  return <Num value={m[1]} unit={m[2] || undefined} className={className} style={style} />
}

/** 상태 점 10 px (글 옆에 상태를 붙일 때는 이것 하나) */
export function Dot({ tone, className = '' }: { tone: TileTone; className?: string }) {
  return <i className={`ui-dot ${toneClass(tone)} ${className}`} aria-hidden="true" />
}

/** 단추: primary = 파랑 면 (화면에 하나) · secondary = 중립 면 · quiet = 면 없음 */
export function Button({ kind = 'secondary', className = '', children, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { kind?: 'primary' | 'secondary' | 'quiet' }) {
  return (
    <button type="button" {...p} className={`ui-btn ${kind} ${className}`}>
      {children}
    </button>
  )
}

export function CellButton({ icon, label, pressed, onClick, disabled, className = '' }: { icon: ReactNode; label: string; pressed?: boolean; onClick: () => void; disabled?: boolean; className?: string }) {
  return (
    <button type="button" className={'ui-cell ' + className} aria-pressed={pressed} onClick={onClick} disabled={disabled}>
      {icon}
      <span>{label}</span>
    </button>
  )
}

export type SegOption<T extends string> = { id: T; label: string; icon?: ReactNode; disabled?: boolean }

/** 나눔 단추. 고른 칸은 진한 면 + 밝은 글 (면은 용수철로 미끄러진다, 글자는 바로 바뀐다). 자리 셈은 ui.css 가 --n · --i 로 한다 */
export function Segmented<T extends string>({ options, value, onChange, vertical = false, dark = false, className = '', label }: { options: SegOption<T>[]; value: T; onChange: (v: T) => void; vertical?: boolean; dark?: boolean; className?: string; label?: string }) {
  const n = options.length
  const i = Math.max(0, options.findIndex((o) => o.id === value))
  const on = options.some((o) => o.id === value)
  const ind = { '--n': n, '--i': i } as CSSProperties
  return (
    <div className={`ui-seg ${vertical ? 'vertical' : ''} ${dark ? 'dark' : ''} ${className}`} role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.id} type="button" aria-pressed={o.id === value} disabled={o.disabled} onClick={() => onChange(o.id)}>
          {o.icon}
          <span>{o.label}</span>
        </button>
      ))}
      {on && <i className="ind" style={ind} aria-hidden="true" />}
    </div>
  )
}

export function Stepper({ value, unit, min, max, step = 1, onChange, label }: { value: number; unit?: string; min: number; max: number; step?: number; onChange: (v: number) => void; label: string }) {
  return (
    <div className="ui-stepper" role="group" aria-label={label}>
      <button type="button" aria-label={label + ' 줄이기'} disabled={value <= min} onClick={() => onChange(Math.max(min, value - step))}>
        <Minus strokeWidth={2} />
      </button>
      <div className="val">
        <b>{value}</b>
        {unit && <small>{unit}</small>}
      </div>
      <button type="button" aria-label={label + ' 늘리기'} disabled={value >= max} onClick={() => onChange(Math.min(max, value + step))}>
        <Plus strokeWidth={2} />
      </button>
    </div>
  )
}

export function Toggle({ on }: { on: boolean }) {
  return <span className={'ui-toggle' + (on ? ' on' : '')} aria-hidden="true" />
}

/** 켜기 줄: 줄 전체가 누르는 곳 */
export function ToggleRow({ label, caption, on, onChange }: { label: string; caption?: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} className="ui-trow" onClick={() => onChange(!on)}>
      <span className="tx">
        <b>{label}</b>
        {caption && <span>{caption}</span>}
      </span>
      <Toggle on={on} />
    </button>
  )
}

/** 숫자 굴림 (300 ms, 넘침 없음). 0.01 넘게 바뀔 때만, 1초에 한 번까지 */
export function useRolled(v: number, decimals = 2) {
  const [shown, setShown] = useState(() => (motionOk() ? 0 : v))
  const cur = useRef(motionOk() ? 0 : v)
  const last = useRef(0)
  useEffect(() => {
    const from = cur.current
    if (Math.abs(v - from) < 0.01 || !motionOk()) {
      cur.current = v
      setShown(v)
      return
    }
    const now = performance.now()
    const wait = Math.max(0, 1000 - (now - last.current))
    let raf = 0
    const t = window.setTimeout(() => {
      last.current = performance.now()
      const t0 = performance.now()
      const step = () => {
        const dur = from === 0 ? 700 : 300
        const k = Math.max(0, Math.min(1, (performance.now() - t0) / dur))
        const e = 1 - Math.pow(1 - k, from === 0 ? 4 : 3)
        cur.current = from + (v - from) * e
        setShown(cur.current)
        if (k < 1) raf = requestAnimationFrame(step)
      }
      raf = requestAnimationFrame(step)
    }, wait)
    return () => {
      window.clearTimeout(t)
      cancelAnimationFrame(raf)
    }
  }, [v])
  return shown.toFixed(decimals)
}

/** 숫자로 읽히는 값인가: 0.67 · 1,250 · -3 · 14:32 · '—'(숫자 자리 비움) */
export function isNumeric(v: string) {
  return /^[-−+]?[\d.,:\s]+$/.test(v.trim()) || v.trim() === '—' || v.trim() === '-'
}

export type TileProps = {
  tone: TileTone
  icon?: ReactNode
  name: string
  caption?: ReactNode
  value: ReactNode
  unit?: string
  /** 1080 에서만 보이는 둘째 보조 줄 */
  sub?: ReactNode
  /** true 면 caption(기준값)을 이름 오른쪽이 아니라 막대 아래에 둔다 (이름 → 값 → 막대 → 기준) */
  captionBelow?: boolean
  /** 막대 채움 0~1 (없으면 막대 없음) · 기준 눈금 0~1 */
  ratio?: number | null
  mark?: number | null
  selected?: boolean
  onClick?: () => void
  label?: string
}

/**
 * 칸: 이름(label · muted) → 값(잉크) → 막대(상태 색) [→ 기준]. 상태는 막대와 오른쪽 위 점이 전한다.
 * icon 은 API 를 지키려고 받기만 한다 (v4: 칸 이름 앞 아이콘 없음).
 */
export function Tile({ tone, name, caption, value, unit, sub, ratio, mark, selected, onClick, label, captionBelow = false }: TileProps) {
  const hasCap = caption != null && caption !== ''
  const capNode = hasCap && (typeof caption === 'string' ? <span className="cap">{caption}</span> : caption)
  const dot = tone !== 'neutral'
  // 값이 말('안 붙임' · '붙임' · '모름')이면 제목 크기로: 판정 말(display)과 무게를 다투지 않게. 숫자 · 시각 · '—' 은 값 크기 그대로
  const word = typeof value === 'string' && !isNumeric(value)
  const body = (
    <>
      <div className={'ui-tile-head' + (dot ? ' has-dot' : '')}>
        <span className="nm">{name}</span>
        {!captionBelow && capNode}
        {dot && <i className="dot" aria-hidden="true" />}
      </div>
      <div className={'ui-tile-val' + (word ? ' word' : '')}>
        <b>{word ? value : typeof value === 'number' || typeof value === 'string' ? <CountUp value={value} /> : value}</b>
        {unit && <small>{unit}</small>}
      </div>
      {sub != null && <div className="ui-tile-sub">{sub}</div>}
      <div className={'ui-tile-bar' + (ratio == null ? ' none' : '')}>
        {ratio != null && <i style={{ transform: `scaleX(${Math.max(0, Math.min(1, ratio))})` }} />}
        {ratio != null && mark != null && <s style={{ left: `${Math.max(0, Math.min(1, mark)) * 100}%` }} />}
      </div>
      {captionBelow && hasCap && <div className="ui-tile-foot">{capNode}</div>}
    </>
  )
  const cls = `ui-tile ${toneClass(tone)}${selected ? ' sel' : ''}`
  return onClick ? (
    <button type="button" className={cls} aria-pressed={selected} onClick={onClick} aria-label={label}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  )
}

export function ListRow({ tone, title, caption, value, chevron, selected, onClick }: { tone?: TileTone; title: ReactNode; caption?: ReactNode; value?: ReactNode; chevron?: ReactNode; selected?: boolean; onClick?: () => void }) {
  const body = (
    <>
      {tone && <span className={'sq ' + toneClass(tone)} aria-hidden="true" />}
      <span className="tx">
        <b>{title}</b>
        {caption && <span>{caption}</span>}
      </span>
      {(value || chevron) && (
        <span className="val">
          {value}
          {chevron}
        </span>
      )}
    </>
  )
  return onClick ? (
    <button type="button" className={'ui-lrow' + (selected ? ' sel' : '')} aria-pressed={selected} onClick={onClick}>
      {body}
    </button>
  ) : (
    <div className="ui-lrow">{body}</div>
  )
}

/**
 * 할 일 줄. auto = 손으로 누르지 않고 조건이 차면 저절로 체크되는 줄:
 * 점선 칸 대신 '흐린 꽉 찬 체크' + 아래 '자동' 글 (누를 수 없다는 것을 선이 아니라 면과 말로)
 */
export function ChecklistRow({ badge, badgeTone = 'orange', title, caption, checked, onToggle, auto = false }: { badge?: number | null; badgeTone?: Tone; title: string; caption?: string; checked: boolean; onToggle?: () => void; auto?: boolean }) {
  const body = (
    <>
      {badge != null && <span className={'badge tone-' + badgeTone}>{badge}</span>}
      <span className="tx">
        <b>{title}</b>
        {caption && <span>{caption}</span>}
      </span>
      {auto ? (
        <span className="auto" aria-hidden="true">
          <span className="box">
            <Check strokeWidth={2} />
          </span>
          <small>자동</small>
        </span>
      ) : (
        <span className="box" aria-hidden="true">
          {checked && <Check strokeWidth={2} />}
        </span>
      )}
    </>
  )
  if (auto || !onToggle)
    return (
      <div role="checkbox" aria-checked={checked} aria-disabled={auto || undefined} aria-readonly className={'ui-check' + (auto ? ' is-auto' : '')}>
        {body}
      </div>
    )
  return (
    <button type="button" role="checkbox" aria-checked={checked} className="ui-check" onClick={onToggle}>
      {body}
    </button>
  )
}

/** 듣는 중: 진한 면 + 마이크 + 목소리 막대 넷 + '듣는 중' · '“네” 하면 쉼터 안내'. 막대는 정차 중에만 오르내린다 (주행 중에는 멈춘 모양) */
export function ListeningPill({ className = '' }: { className?: string }) {
  return (
    <div className={'ui-listen ' + className} role="status" aria-live="polite">
      <Mic strokeWidth={2} />
      <span className="ui-level" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
      </span>
      <b>듣는 중</b>
      <span>· “네” 하면 쉼터 안내</span>
    </div>
  )
}

// ── 업무 아이콘: lucide 와 같은 격자 (24 · 선 2 · 둥근 끝 · 채움 없음). 남의 그림을 옮기지 않고 직접 그렸다. 크기는 내비 32 · 폰 24 ──
type GlyphProps = { size?: number | string; strokeWidth?: number; className?: string; 'aria-label'?: string }
function Glyph({ size = 24, strokeWidth = 2, className = '', children, ...a }: GlyphProps & { children: ReactNode }) {
  const label = a['aria-label']
  return (
    <svg
      className={'jj-glyph ' + className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {children}
    </svg>
  )
}

/** 라쳇 벨트: 양쪽 웨빙 + 가운데 라쳇 몸통 · 톱니바퀴 · 손잡이 */
export function StrapIcon(p: GlyphProps) {
  return (
    <Glyph {...p}>
      <path d="M2 10h5M2 14h5M17 10h5M17 14h5" />
      <rect x="7" y="8" width="10" height="8" rx="2" />
      <circle cx="12" cy="12" r="1.5" />
      <path d="M9.5 8V5.5h5V8" />
    </Glyph>
  )
}

/** 짐 상자: 둥근 상자 + 뚜껑 선 + 가운데 테이프 */
export function CrateIcon(p: GlyphProps) {
  return (
    <Glyph {...p}>
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M3 11h18" />
      <path d="M10 7v4h4V7" />
      <path d="M5 7l1.5-3h11L19 7" />
    </Glyph>
  )
}

/** 앞벽 (헤드보드): 적재함 바닥 + 앞쪽 격자 벽 + 벽에 붙은 짐 */
export function HeadboardIcon(p: GlyphProps) {
  return (
    <Glyph {...p}>
      <path d="M2 20h20" />
      <rect x="4" y="4" width="5" height="16" rx="1" />
      <path d="M4 9.5h5M4 14.5h5" />
      <rect x="11" y="12" width="9" height="8" rx="1.5" />
    </Glyph>
  )
}

/** 팔레트 (옆에서): 위 깔판 · 블록 셋 · 아래 깔판. 가구(소파)와 헷갈리지 않게 등받이 · 다리 없음 */
export function PalletIcon(p: GlyphProps) {
  return (
    <Glyph {...p}>
      <rect x="2" y="5.5" width="20" height="3" rx="1" />
      <rect x="2" y="15.5" width="20" height="3" rx="1" />
      {/* 블록 셋: 꽉 찬 짧은 기둥 (선 두 줄로 그리면 2 px 격자에서 틈이 막혀 석쇠처럼 보인다) */}
      <path d="M3.5 9.5h3.5v5H3.5zM10.25 9.5h3.5v5h-3.5zM17 9.5h3.5v5H17z" fill="currentColor" stroke="none" />
    </Glyph>
  )
}

/** 자재 (끝에서 본 관 · 각재 묶음): 아래 셋 · 가운데 둘 · 위 하나로 쌓인 동그라미 */
export function MaterialIcon(p: GlyphProps) {
  return (
    <Glyph {...p}>
      <circle cx="5.5" cy="17.5" r="3" />
      <circle cx="12" cy="17.5" r="3" />
      <circle cx="18.5" cy="17.5" r="3" />
      <circle cx="8.75" cy="11.9" r="3" />
      <circle cx="15.25" cy="11.9" r="3" />
      <circle cx="12" cy="6.3" r="3" />
    </Glyph>
  )
}

/** 가전 (냉장고 꼴): 키 큰 둥근 네모 + 문 나눔 + 손잡이 */
export function ApplianceIcon(p: GlyphProps) {
  return (
    <Glyph {...p}>
      <rect x="6" y="2.5" width="12" height="19" rx="2" />
      <path d="M6 9h12M9 5.5v1M9 12v2.5" />
    </Glyph>
  )
}

/** 가구 (소파 꼴): 등받이 + 앉는 면 + 다리 */
export function FurnitureIcon(p: GlyphProps) {
  return (
    <Glyph {...p}>
      <path d="M5 11V8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v3" />
      <rect x="2.5" y="11" width="19" height="6" rx="2" />
      <path d="M5.5 17v2.5M18.5 17v2.5" />
    </Glyph>
  )
}

/** 짐 종류 다섯을 한 벌로 (24 격자 · 선 2 · 둥근 끝). 내비 짐 시트 · 폰 짐 입력이 함께 쓴다. 박스 = CrateIcon */
export function CargoGlyph({ kind, ...p }: GlyphProps & { kind: 'pallet' | 'appliance' | 'furniture' | 'material' | 'box' }) {
  if (kind === 'pallet') return <PalletIcon {...p} />
  if (kind === 'appliance') return <ApplianceIcon {...p} />
  if (kind === 'furniture') return <FurnitureIcon {...p} />
  if (kind === 'material') return <MaterialIcon {...p} />
  return <CrateIcon {...p} />
}

/** 사진 넣는 곳 · 추가 칸: 우물 면 + 꽉 찬 아이콘 + 이름 (+ 보조). 점선 테두리 없음 */
export function DropWell({ icon, title, caption, onClick, className = '', style }: { icon: ReactNode; title?: ReactNode; caption?: ReactNode; onClick: () => void; className?: string; style?: CSSProperties }) {
  return (
    <button type="button" className={'ui-drop ' + className} style={style} onClick={onClick}>
      {icon}
      {title && <b>{title}</b>}
      {caption && <span>{caption}</span>}
    </button>
  )
}

/** 제동 g: 원 + 눈금 넷 + 한쪽으로 쏠린 점 (짐에 걸린 힘) */
export function GGaugeIcon(p: GlyphProps) {
  return (
    <Glyph {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="15" cy="9" r="2" />
    </Glyph>
  )
}
