/** 화면 조각들 (Claude Design 시안 'Tokens' 의 부품 그대로) */
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import type { Tone } from '@/engine/limit'
import type { CargoKind } from '@/engine/cargo'

export const TONE_CLASS: Record<Tone, string> = { green: 'tone-green', orange: 'tone-orange', red: 'tone-red', grey: 'tone-grey' }
export const TONE_HEX: Record<Tone, string> = { green: '#33D69F', orange: '#FFA53B', red: '#FF5C5C', grey: '#8A94A6' }

export function Primary({ children, className = '', shine = true, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { shine?: boolean }) {
  return (
    <button
      type="button"
      {...p}
      className={`${shine ? 'shine' : ''} rounded-2xl bg-active font-extrabold text-[#04121A] transition-[filter,transform] duration-150 hover:brightness-110 active:scale-[0.985] disabled:opacity-40 ${className}`}
    >
      <span className="relative z-10">{children}</span>
    </button>
  )
}

export function Ghost({ children, className = '', ...p }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" {...p} className={`rounded-2xl border border-white/16 bg-transparent font-bold text-ink transition-colors duration-150 hover:bg-white/5 active:bg-white/8 disabled:opacity-40 ${className}`}>
      {children}
    </button>
  )
}

export function GearChip({ mode }: { mode: 'park' | 'drive' }) {
  return mode === 'drive' ? (
    <span className="rounded-full bg-[rgba(47,195,230,0.12)] px-3 py-1.5 text-sm font-semibold text-cyan2">D · 주행 중</span>
  ) : (
    <span className="rounded-full bg-white/7 px-3 py-1.5 text-sm font-semibold text-ink2">P · 정차 중</span>
  )
}

export function Dot({ tone, size = 20, ripple = false, glow = true }: { tone: Tone; size?: number; ripple?: boolean; glow?: boolean }) {
  return (
    <span
      className={`relative inline-block flex-none rounded-full ${TONE_CLASS[tone]} ${ripple ? 'ripple' : ''}`}
      style={{ width: size, height: size, background: TONE_HEX[tone], boxShadow: glow ? `0 0 0 ${Math.round(size * 0.3)}px ${TONE_HEX[tone]}2e` : undefined }}
    />
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-[20px] border border-white/6 bg-card ${className}`}>{children}</div>
}

export function ToneCard({ tone, children, className = '' }: { tone: Tone; children: ReactNode; className?: string }) {
  return <div className={`tone-card ${TONE_CLASS[tone]} rounded-[20px] ${className}`}>{children}</div>
}

export function MicIcon({ size = 24, color = '#2FC3E6' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <line x1="12" y1="18" x2="12" y2="21" />
    </svg>
  )
}

/** 듣는 중 (시안 Alert). 주행 중에는 막대가 움직이지 않는다 (.is-driving) */
export function ListeningPill({ text, demoYes }: { text: string; demoYes?: () => void }) {
  return (
    <div className="flex items-center gap-4 rounded-full border border-[rgba(47,195,230,0.35)] bg-card px-6 py-3.5">
      <MicIcon />
      <span className="wave flex h-6 items-end gap-1" aria-hidden="true">
        {[10, 20, 14, 22, 8].map((h, i) => (
          <span key={i} className="w-1 rounded bg-cyan" style={{ height: h }} />
        ))}
      </span>
      <span className="text-xl font-semibold">{text}</span>
      {demoYes && (
        <button type="button" onClick={demoYes} className="ml-2 rounded-full border border-dashed border-white/25 px-3 py-1 text-sm text-mute hover:text-ink" title="시연: 음성 대신 스크립트 입력">
          시연 입력 “네”
        </button>
      )}
    </div>
  )
}

const ICON: Record<CargoKind, ReactNode> = {
  pallet: (
    <>
      <rect x="3" y="14" width="18" height="3" />
      <path d="M5 17v3M12 17v3M19 17v3" />
      <rect x="5" y="6" width="14" height="8" />
    </>
  ),
  appliance: (
    <>
      <rect x="6" y="2" width="12" height="20" rx="1.5" />
      <path d="M6 9h12M9 5v2M9 12v3" />
    </>
  ),
  furniture: (
    <>
      <path d="M4 12V9a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3" />
      <rect x="2" y="12" width="20" height="5" rx="1.5" />
      <path d="M5 17v2M19 17v2" />
    </>
  ),
  material: (
    <>
      <rect x="3" y="14" width="8" height="6" />
      <rect x="13" y="14" width="8" height="6" />
      <rect x="8" y="7" width="8" height="6" />
    </>
  ),
  box: (
    <>
      <path d="M3 8l9-4 9 4v9l-9 4-9-4z" />
      <path d="M3 8l9 4 9-4M12 12v9" />
    </>
  ),
}

export function CargoIcon({ kind, size = 34 }: { kind: CargoKind; size?: number }) {
  const k = kind
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      {ICON[k]}
    </svg>
  )
}

export function GearIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </svg>
  )
}

export function ListIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M9 8h6M9 12h6M9 16h4" />
    </svg>
  )
}

export function KitDot({ state }: { state: 'on' | 'stale' | 'off' }) {
  const c = state === 'on' ? '#2FC3E6' : state === 'stale' ? '#FFA53B' : 'rgba(255,255,255,0.18)'
  return <span role="img" aria-label={state === 'on' ? '센서 키트 연결됨' : state === 'stale' ? '센서 키트 끊김' : '센서 키트 없음'} className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: c }} />
}
