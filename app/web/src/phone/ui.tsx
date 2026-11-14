/**
 * 휴대폰 판 부품 (DESIGN_SPEC §3 의 폰 크기). 모양은 phone.css 의 ph-* 규칙이 맡는다.
 * 표지 · 판정 띠 · 앱 바 · 고정 영역 · 단추 · 나눔 · 증감 · 켜기 · 칸 · 칩 · 목록 줄 · 사건 카드 · 할 일 줄 · 사진.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { animate } from 'motion/react'
import { Camera, Check, ChevronLeft, ChevronRight, Minus, Plus, Radio } from 'lucide-react'
import type { Tone } from '@/engine/limit'
import type { CargoKind } from '@/engine/cargo'
import { createStore, useStore } from '@/runtime/store'
import { CountUp, motionOk, SignShape as LampShape } from '@/ui/parts'
import { phone, setRole } from './state'

export const TONE_CLS: Record<Tone, string> = { green: 'tone-green', orange: 'tone-orange', red: 'tone-red', grey: 'tone-grey' }

/**
 * 경고등 (v4, 내비와 같은 그림 @/ui/parts SignShape): 상태 색으로 꽉 찬 둥근 네모 + 흑연 모양 (초록 ● ✓ · 주황 ▲ ! · 빨강 ◆ ! · 회색 ○ –).
 * 판정 카드 48 · 작은 카드 40 · 사건 카드 44 · 위 알림 32 · 잠금 112. 모서리 12 (위 알림 32 는 8, 잠금 28). 깜박이지 않는다
 */
export function Sign({ tone, size = 48, shape }: { tone: Tone | 'neutral'; size?: number; shape?: number }) {
  const k = shape ? Math.round((shape / size) * 100) : 58
  return (
    <span className={'ph-sign ' + (tone === 'neutral' ? 'neutral' : TONE_CLS[tone])} style={{ width: size, height: size, ['--sign-shape' as string]: k + '%', ['--lamp-r' as string]: size >= 100 ? '28px' : size <= 32 ? '8px' : '12px' }} aria-hidden>
      {tone === 'green' ? <CheckGlyph /> : tone === 'neutral' ? <WheelGlyph /> : <LampShape tone={tone} />}
    </span>
  )
}

/** 초록 경고등 모양: 원판 없이 흑연 ✓ 하나 (주황 ▲ · 빨강 ◆ 와 같은 흑연 · 같은 획 굵기, 모서리 각진 평면 글리프) */
function CheckGlyph() {
  return (
    <svg className="ui-shape" viewBox="0 0 100 100" aria-hidden="true">
      <path d="M14 52 38 76 86 26" fill="none" stroke="var(--shape)" strokeWidth="15" strokeLinecap="square" strokeLinejoin="miter" />
    </svg>
  )
}

/** 사건 없는 운전 중: 상태 색 없는 중립 등 (운전대). 경보처럼 보이지 않게 흑연 면 + 옅은 선 */
function WheelGlyph() {
  return (
    <svg className="ui-shape" viewBox="0 0 100 100" aria-hidden="true" fill="none" stroke="var(--shape)" strokeWidth="9">
      <circle cx="50" cy="50" r="40" />
      <circle cx="50" cy="54" r="9" />
      <path d="M12 46c12-6 24-8 38-8s26 2 38 8M41 59 26 84M59 59 74 84" strokeLinecap="round" />
    </svg>
  )
}

export type BannerData = { tone: Tone; title: string; todo: string; alt?: string | null }

/**
 * 판정 카드 (폰 88): [경고등 48][판정 말 · 할 일]. 아래 보조 줄은 카드 안 글과 겹치는 조각을 빼고 남는 것만
 * (같은 문장을 한 화면에 두 번 쓰지 않는다, §10.5 폰 4)
 */
export function Banner({ data, mini = false }: { data: BannerData; mini?: boolean }) {
  const alt = mini ? null : altLine(data)
  return (
    <>
      <div className={'ph-banner ' + TONE_CLS[data.tone] + (mini ? ' mini' : '')} role="status" aria-live="polite">
        <Sign tone={data.tone} size={mini ? 40 : 48} />
        <div className="tx">
          <div className="vd">{data.title}</div>
          <div className="todo">{data.todo}</div>
        </div>
      </div>
      {alt && <div className="ph-alt">{alt}</div>}
    </>
  )
}

/** 보조 줄에서 판정 말 · 할 일과 같은 조각을 뺀다 ('짐이 밀렸습니다' 를 카드와 줄에 두 번 쓰지 않게) */
function altLine(d: BannerData): string | null {
  if (!d.alt) return null
  const parts = d.alt.split(' · ').filter((s) => s && s !== d.title && s !== d.todo)
  return parts.length ? parts.join(' · ') : null
}

// ── 앱 바 · 고정 영역 ──
export function AppBar({ title, onBack, right, extra }: { title: ReactNode; onBack?: () => void; right?: ReactNode; extra?: ReactNode }) {
  return (
    <header className="ph-appbar">
      {onBack && (
        <button type="button" className="ph-icell" aria-label="뒤로" onClick={onBack}>
          <ChevronLeft size={26} strokeWidth={2} />
        </button>
      )}
      <h1>
        <span>{title}</span>
        {extra}
      </h1>
      {/* 탭 첫 화면(뒤로 없음)마다 오른쪽에 역할 바꿈: 운영자 모드는 숨은 탭이 아니라 머리에서 바꾸는 다른 모드 */}
      {!onBack && <RoleSwitch />}
      {right}
    </header>
  )
}

/**
 * 역할 바꿈 [기사 | 운영자] (앱 바 오른쪽). 기사 = 적재 · 기록 · 설정, 운영자 = 허브 · 설정 (기록은 기사 본인 것이라 운영자 모드에 없다).
 * 고른 쪽 = 진한 면 (나눔 단추와 같은 말투). 높이 40, 칸마다 누르는 곳 56 x 40
 */
export function RoleSwitch() {
  const role = useStore(phone, (s) => s.role)
  return (
    <div className="ph-role" role="radiogroup" aria-label="역할">
      {(['driver', 'operator'] as const).map((r) => (
        <button key={r} type="button" role="radio" aria-checked={role === r} onClick={() => role !== r && setRole(r)}>
          {r === 'driver' ? '기사' : '운영자'}
        </button>
      ))}
    </div>
  )
}

/** 키트 연결 표시: ■ 글자 대신 키트 아이콘 + 말 (끊기면 흐리게) */
export function KitMark({ word, on }: { word: string; on: boolean }) {
  return (
    <span className={'ph-kit' + (on ? '' : ' off')}>
      <Radio size={14} strokeWidth={2.2} aria-hidden />
      {word}
    </span>
  )
}

export function IconCell({ label, onClick, children, pressed }: { label: string; onClick: () => void; children: ReactNode; pressed?: boolean }) {
  return (
    <button type="button" className="ph-icell" aria-label={label} title={label} aria-pressed={pressed} onClick={onClick}>
      {children}
    </button>
  )
}

/** 지금 화면에 아래 고정 판이 있는지 (있으면 토스트는 판 안 맨 위에 붙어 살아 있는 내용을 덮지 않는다) */
const fixedHere = createStore({ n: 0 })
export function useHasFixed() {
  return useStore(fixedHere, (s) => s.n > 0)
}

/** 아래 주 단추 줄 (바탕 위 주 단추 358 x 56, 판 · 선 없음). 토스트는 앱 바 자리에 뜨므로 이 줄은 자라지 않는다 */
export function Fixed({ children }: { children: ReactNode }) {
  useEffect(() => {
    fixedHere.set((s) => ({ n: s.n + 1 }))
    return () => fixedHere.set((s) => ({ n: s.n - 1 }))
  }, [])
  return <div className="ph-fixed">{children}</div>
}

/**
 * 주 단추 (파랑, 화면에 하나). 꺼진 단추는 버금 단추와 다른 제 모양(옅은 우물 + 흐린 글, 누름 없음)이고,
 * why 를 주면 무엇을 하면 켜지는지 단추 바로 위 caption 한 줄로 말한다
 */
export function Primary({ children, onClick, disabled, label, why }: { children: ReactNode; onClick: () => void; disabled?: boolean; label?: string; why?: string | null }) {
  const btn = (
    <button type="button" className="ph-btn" onClick={onClick} disabled={disabled} aria-label={label} aria-describedby={disabled && why ? 'ph-why' : undefined}>
      {children}
    </button>
  )
  if (!disabled || !why) return btn
  return (
    <>
      <p className="ph-why" id="ph-why">
        {why}
      </p>
      {btn}
    </>
  )
}

export function Secondary({ children, onClick, disabled, bad }: { children: ReactNode; onClick: () => void; disabled?: boolean; bad?: boolean }) {
  return (
    <button type="button" className={'ph-btn2' + (bad ? ' bad' : '')} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  )
}

// ── 나눔 단추: 고른 칸 뒤로 --select 면이 미끄러진다. 자리 셈은 phone.css 가 --n · --i 로 한다 ──
export function Segmented<T extends string>({
  items,
  value,
  onChange,
  small = false,
  pill = false,
  label,
}: {
  items: { id: T; label: ReactNode }[]
  value: T | null
  onChange: (v: T) => void
  small?: boolean
  /** 무대 안 보기 알약 (높이 48, 칸마다 64) */
  pill?: boolean
  label: string
}) {
  const n = items.length
  const i = items.findIndex((x) => x.id === value)
  return (
    <div className={'ph-seg' + (pill ? ' pill' : small ? ' sm' : '')} role="group" aria-label={label}>
      {i >= 0 && <span className="bub" style={{ ['--n' as string]: n, ['--i' as string]: i }} />}
      {items.map((x) => (
        <button key={x.id} type="button" aria-pressed={x.id === value} onClick={() => onChange(x.id)}>
          <span>{x.label}</span>
        </button>
      ))}
    </div>
  )
}

// ── 증감 [−][값 + 단위][+] ──
export function Stepper({ value, unit, min, max, onChange, label }: { value: number; unit: string; min: number; max: number; onChange: (v: number) => void; label: string }) {
  return (
    <div className="ph-stepper" role="group" aria-label={label}>
      <button type="button" aria-label={label + ' 하나 빼기'} disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))}>
        <Minus size={24} strokeWidth={2.4} />
      </button>
      <div className="val" aria-live="polite">
        <b className="t-value">{value}</b>
        <small>{unit}</small>
      </div>
      <button type="button" aria-label={label + ' 하나 더하기'} disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))}>
        <Plus size={24} strokeWidth={2.4} />
      </button>
    </div>
  )
}

// ── 켜기 줄 (줄 전체가 누르는 곳) ──
export function ToggleRow({ on, onChange, title, caption }: { on: boolean; onChange: (v: boolean) => void; title: string; caption?: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} className="ph-toggle-row" onClick={() => onChange(!on)}>
      <span className="tx">
        <span className="t-row">{title}</span>
        {caption && <span className="t-caption">{caption}</span>}
      </span>
      <span className={'ph-toggle' + (on ? ' on' : '')} aria-hidden>
        <i />
      </span>
    </button>
  )
}

// ── 칸 (GitHub tw-tile) ──
export function Tile({
  tone,
  icon,
  name,
  value,
  word = false,
  unit,
  bar,
  onClick,
  label,
  foot,
  cap,
}: {
  tone: Tone | 'neutral'
  icon?: ReactNode
  name: string
  value: ReactNode
  /** 값이 숫자가 아니라 말이면 18 px */
  word?: boolean
  unit?: string
  bar?: { ratio: number | null; mark?: number | null } | null
  onClick?: () => void
  label?: string
  /** 막대 아래 기준값 한 줄 (caption) */
  foot?: string
  /** 막대 자리(맨 아래)에 caption 한 줄. 막대가 없는 칸도 같은 줄의 막대 칸과 균형이 맞게 (빈 아래 반쪽 없음) */
  cap?: ReactNode
}) {
  // v4: 이름 앞 아이콘 없음 (icon 은 API 만 지킨다). 상태는 오른쪽 위 점 + 막대, 값은 잉크
  void icon
  const cls = 'ph-tile ' + (tone === 'neutral' ? 'neutral' : TONE_CLS[tone]) + (foot ? ' has-foot' : '')
  const showBar = !!bar || !cap
  const body = (
    <>
      <span className="hd">
        <span className="nm">{name}</span>
        {tone !== 'neutral' && <i className="dot" aria-hidden />}
      </span>
      <span className="val">
        <b className={word ? 'word' : ''}>{typeof value === 'number' || typeof value === 'string' ? <CountUp value={value} /> : value}</b>
        {unit && <small>{unit}</small>}
        {foot && <span className="ft">{foot}</span>}
      </span>
      {showBar && (
        <span className="bar" aria-hidden>
          {bar && bar.ratio !== null && <i style={{ transform: `scaleX(${Math.max(0, Math.min(1, bar.ratio))})` }} />}
          {bar && bar.mark != null && <s style={{ left: `${Math.max(0, Math.min(1, bar.mark)) * 100}%` }} />}
        </span>
      )}
      {cap && <span className="cap">{cap}</span>}
    </>
  )
  return onClick ? (
    <button type="button" className={cls} onClick={onClick} aria-label={label}>
      {body}
    </button>
  ) : (
    <div className={cls} aria-label={label}>
      {body}
    </div>
  )
}

/** 상태 칩: 중립 면 + 8 px 점 + 잉크 글자 (색은 점만). solid = 꽉 찬 상태 면, 화면에 '사건' 하나만 */
export function Chip({ tone, children, solid = false }: { tone: Tone | 'neutral'; children: ReactNode; solid?: boolean }) {
  return <span className={'ph-chip ' + (tone === 'neutral' ? 'neutral' : TONE_CLS[tone]) + (solid ? ' solid' : '')}>{children}</span>
}

/** 상태 점 + 상태 글자 (목록 줄 오른쪽): 칩 면 없이 */
export function StatusText({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span className={'ph-stat ' + TONE_CLS[tone]}>
      <i aria-hidden />
      {children}
    </span>
  )
}

// ── 목록 줄 [색 네모][제목 + caption][값 · ›] ──
export function ListRow({
  tone,
  icon,
  title,
  caption,
  value,
  onClick,
  href,
  one = false,
  chevron,
  wrap = false,
  valueBlue = false,
  sub,
}: {
  tone?: Tone | 'none' | null
  icon?: ReactNode
  title: ReactNode
  /** 제목 바로 아래 칩 한 줄 (예: '운행 중') */
  sub?: ReactNode
  caption?: ReactNode
  value?: ReactNode
  onClick?: () => void
  href?: string
  one?: boolean
  chevron?: boolean
  wrap?: boolean
  valueBlue?: boolean
}) {
  const inner = (
    <>
      {tone && <span className={'sq ' + (tone === 'none' ? 'none' : TONE_CLS[tone])} aria-hidden />}
      {icon && <span className="ic">{icon}</span>}
      <span className="tx">
        <b className={wrap ? 'wrap' : ''}>{title}</b>
        {sub && <i className="sub">{sub}</i>}
        {caption && <span>{caption}</span>}
      </span>
      {value != null && <span className={'vl' + (valueBlue ? ' blue' : '')}>{value}</span>}
      {(chevron ?? !!(onClick || href)) && <ChevronRight className="chev" size={20} strokeWidth={2} aria-hidden />}
    </>
  )
  const cls = 'ph-row' + (one ? ' one' : '')
  if (href)
    return (
      <a className={cls} href={href}>
        {inner}
      </a>
    )
  if (onClick)
    return (
      <button type="button" className={cls} onClick={onClick}>
        {inner}
      </button>
    )
  return <div className={cls}>{inner}</div>
}

// ── 사건 카드 (358 x 80). Android 알림도 같은 글 ──
export function EventCard({ tone, title, caption, unread, onClick }: { tone: Tone; title: string; caption: string; unread?: boolean; onClick: () => void }) {
  return (
    <button type="button" className="ph-ecard" onClick={onClick} aria-label={title + ', ' + caption + (unread ? ', 안 읽음' : '')}>
      <Sign tone={tone} size={44} shape={26} />
      <span className="tx">
        <b>{title}</b>
        <span>{caption}</span>
      </span>
      <ChevronRight className="chev" size={20} strokeWidth={2} aria-hidden />
      {unread && <span className="unread" aria-hidden />}
    </button>
  )
}

// ── 할 일 줄 [순서 배지][제목 + caption][체크 칸] ──
export function CheckRow({
  title,
  caption,
  checked,
  onToggle,
  badge,
  badgeTone = 'red',
  auto = false,
}: {
  title: string
  caption?: string | null
  checked: boolean
  onToggle?: () => void
  badge?: number
  badgeTone?: Tone
  /** 손으로 체크하지 않고 조건이 차면 저절로 (사진 2장 이상) */
  auto?: boolean
}) {
  const cls = 'ph-check' + (caption ? ' cap' : '') + (auto ? ' auto' : '')
  const body = (
    <>
      {badge != null && (
        <span className={'badge ' + TONE_CLS[badgeTone]} aria-hidden>
          {badge}
        </span>
      )}
      <span className="tx">
        <b>{title}</b>
        {caption && <span>{caption}</span>}
      </span>
      <span className="box" aria-hidden>
        <Check size={20} strokeWidth={3} />
      </span>
    </>
  )
  if (!onToggle)
    return (
      <div className={cls} role="checkbox" aria-checked={checked} aria-readonly>
        {body}
      </div>
    )
  return (
    <button type="button" className={cls} role="checkbox" aria-checked={checked} onClick={onToggle}>
      {body}
    </button>
  )
}

export function Gap() {
  return <div className="ph-gap" aria-hidden />
}

export function Head({ title, caption }: { title: string; caption?: ReactNode }) {
  return (
    <div className="ph-head">
      <b>{title}</b>
      {caption && <span>{caption}</span>}
    </div>
  )
}

// ── 사진 칸 (358 x 200) ──
export function PhotoCell({ src, title, caption, tag, onTake, onView }: { src: string | null; title: string; caption?: string | null; tag?: string; onTake: () => void; onView?: () => void }) {
  if (src)
    return (
      <button type="button" className="ph-photo" onClick={onView ?? onTake} aria-label={title + ' 크게 보기'}>
        <img src={src} alt={title} />
        {tag && (
          <span className="cap">
            <span>{tag}</span>
            <span>크게 보기</span>
          </span>
        )}
      </button>
    )
  // 빈 칸: 평평한 우물 면(--surface-soft) 한 장에 아이콘 + 말 (그라데이션 · 테두리 없음)
  return (
    <button type="button" className="ph-photo empty" onClick={onTake}>
      <Camera size={28} strokeWidth={1.8} color="var(--ink)" aria-hidden />
      <b>{title}</b>
      {caption && <span>{caption}</span>}
    </button>
  )
}

// ── 짐 아이콘: 공용 업무 아이콘과 같은 격자 (24 · 선 2 · 둥근 끝 · 채움 없음). 직접 그렸다 ──
const CARGO_ICON: Record<CargoKind, ReactNode> = {
  // 팔레트: 깔판(위 판 · 다리 셋 · 아래 판) 위에 상자 둘
  pallet: (
    <>
      <rect x="4" y="4.5" width="7.5" height="8.5" rx="1.2" />
      <rect x="12.5" y="7" width="7.5" height="6" rx="1.2" />
      <path d="M2.5 13h19M2.5 20h19M4.5 13v7M12 13v7M19.5 13v7" />
    </>
  ),
  appliance: (
    <>
      <rect x="6" y="2.5" width="12" height="19" rx="2" />
      <path d="M6 9h12M9 5.5v1M9 12v2.5" />
    </>
  ),
  furniture: (
    <>
      <path d="M5 11V8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v3" />
      <rect x="2.5" y="11" width="19" height="6" rx="2" />
      <path d="M5.5 17v2.5M18.5 17v2.5" />
    </>
  ),
  // 자재: 쌓은 관 셋 (끝에서 본 모양, 속 빈 관)
  material: (
    <>
      <circle cx="7.5" cy="16" r="4.5" />
      <circle cx="16.5" cy="16" r="4.5" />
      <circle cx="12" cy="8.2" r="4.5" />
      <circle cx="7.5" cy="16" r="1.2" />
      <circle cx="16.5" cy="16" r="1.2" />
      <circle cx="12" cy="8.2" r="1.2" />
    </>
  ),
  box: (
    <>
      <path d="M3.5 7.8 12 4l8.5 3.8v8.4L12 20l-8.5-3.8z" />
      <path d="M3.5 7.8 12 11.6l8.5-3.8M12 11.6V20" />
    </>
  ),
}

export function CargoIcon({ kind, size = 28 }: { kind: CargoKind; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {CARGO_ICON[kind]}
    </svg>
  )
}

/**
 * 숫자 굴림 (21st.dev Animated Counter 를 GitHub 말투로): 300 ms, 넘침 없음.
 * 0.01 넘게(정수는 1 이상) 바뀔 때만, 1초에 한 번까지. 보이는 값을 돌려준다 (색 · 막대도 이 값으로 맞춘다)
 */
export function useRolled(value: number, digits = 2, fromZero = false): number {
  const start = fromZero && motionOk() ? 0 : value
  const [shown, setShown] = useState(start)
  const shownRef = useRef(start)
  const lastAt = useRef(0)
  const target = useRef(start)
  // 처음 세기는 1초 제한 없이 (StrictMode 의 두 번 실행에서도 바로)
  const counted = useRef(false)
  useEffect(() => {
    const step = digits > 0 ? 0.01 : 0.5
    if (Math.abs(value - target.current) < step && Math.abs(value - shownRef.current) < step) return
    let stop: (() => void) | null = null
    const run = () => {
      target.current = value
      lastAt.current = performance.now()
      if (!motionOk()) {
        shownRef.current = value
        setShown(value)
        return
      }
      const c = animate(shownRef.current, value, {
        duration: shownRef.current === 0 ? 0.7 : 0.3,
        ease: [0.2, 0.8, 0.2, 1],
        onUpdate: (v) => {
          shownRef.current = v
          setShown(v)
        },
        onComplete: () => {
          counted.current = true
        },
      })
      stop = () => c.stop()
    }
    const wait = 1000 - (performance.now() - lastAt.current)
    if (wait <= 0 || !counted.current) run()
    else {
      const id = window.setTimeout(run, wait)
      return () => {
        window.clearTimeout(id)
        stop?.()
      }
    }
    return () => stop?.()
  }, [value, digits])
  return shown
}

export function Rolled({ value, digits = 2 }: { value: number; digits?: number }) {
  const shown = useRolled(value, digits, true)
  return <span className="ph-num">{shown.toFixed(digits)}</span>
}

/** 카드 펼침 (container transform, §8.2): 누른 카드의 화면 안 자리 (.ph-main 기준, 설계 px) */
export let expandFrom: { top: number; left: number; right: number; bottom: number } | null = null
export function markExpand(el: HTMLElement) {
  const main = el.closest('.ph-main') as HTMLElement | null
  if (!main) return
  const m = main.getBoundingClientRect()
  const r = el.getBoundingClientRect()
  const k = m.width / main.offsetWidth || 1
  expandFrom = { top: (r.top - m.top) / k, left: (r.left - m.left) / k, right: (m.right - r.right) / k, bottom: (m.bottom - r.bottom) / k }
}
/** 읽기만 (StrictMode 가 그리기를 두 번 해도 같은 값). 지우기는 clearExpand 로, 화면이 붙은 뒤에 */
export function takeExpand() {
  return expandFrom
}
export function clearExpand() {
  expandFrom = null
}

/**
 * 당겨서 새로 고침 (기록 목록): 맨 위에서 아래로 끌면 목록이 고무줄처럼 따라오고 (끈 거리의 절반, 96 까지),
 * 64 넘게 끌고 놓으면 원이 한 바퀴 돌며 다시 읽는다 (기록은 기기 안에 있으므로 짧게 600 ms). 놓으면 용수철로 돌아간다
 */
export function PullScroll({ children, onRefresh }: { children: ReactNode; onRefresh?: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [pull, setPull] = useState(0)
  const [busy, setBusy] = useState(false)
  const drag = useRef<{ y: number; id: number } | null>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const down = (e: PointerEvent) => {
      if (el.scrollTop > 0 || busy || !motionOk()) return
      drag.current = { y: e.clientY, id: e.pointerId }
    }
    const move = (e: PointerEvent) => {
      const d = drag.current
      if (!d || d.id !== e.pointerId) return
      const k = el.getBoundingClientRect().height / el.offsetHeight || 1
      const dy = (e.clientY - d.y) / k
      setPull(Math.max(0, Math.min(96, dy * 0.5)))
    }
    const up = () => {
      if (!drag.current) return
      drag.current = null
      setPull((p) => {
        if (p >= 64) {
          setBusy(true)
          onRefresh?.()
          window.setTimeout(() => setBusy(false), 600)
        }
        return 0
      })
    }
    el.addEventListener('pointerdown', down)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => {
      el.removeEventListener('pointerdown', down)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
  }, [busy, onRefresh])
  const off = busy ? 56 : pull
  return (
    <div className={'ph-scroll ph-pull' + (pull ? ' dragging' : '')} ref={ref}>
      <div className={'ph-pull-ind' + (busy ? ' busy' : '')} style={{ opacity: busy ? 1 : Math.min(1, pull / 64), transform: `translateY(${off - 44}px) rotate(${pull * 4}deg)` }} aria-hidden>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
          <path d="M21 12a9 9 0 1 1-3-6.7" />
          <path d="M21 4v5h-5" />
        </svg>
      </div>
      <div className="ph-pull-body" style={{ transform: off ? `translateY(${off}px)` : undefined }}>
        {children}
      </div>
    </div>
  )
}
