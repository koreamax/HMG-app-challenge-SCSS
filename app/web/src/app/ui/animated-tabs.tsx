/**
 * 움직이는 탭 (21st.dev 의 builduilabs 'Animated Tabs' 조리법: motion layoutId 로 고른 칸 뒤의 '거품'이 미끄러진다).
 * Night Navy 에 맞춰 거품은 흰색 12%, 움직임은 300 ms 이하.
 */
import { motion } from 'motion/react'
import type { ReactNode } from 'react'

export type Tab<T extends string> = { id: T; label: ReactNode }

export function AnimatedTabs<T extends string>({ tabs, value, onChange, id, size = 'md' }: { tabs: Tab<T>[]; value: T; onChange: (v: T) => void; id: string; size?: 'md' | 'lg' }) {
  const h = size === 'lg' ? 'h-14 text-lg' : 'h-9 text-sm'
  return (
    <div className="flex rounded-xl bg-white/5 p-1" role="tablist">
      {tabs.map((t) => {
        const on = t.id === value
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(t.id)}
            className={`relative flex-1 rounded-[9px] px-3.5 font-semibold whitespace-nowrap ${h} ${on ? 'text-white' : 'text-mute hover:text-ink2'}`}
          >
            {on && (
              <motion.span
                layoutId={'tab-bubble-' + id}
                className="absolute inset-0 rounded-[9px] bg-white/12"
                transition={{ type: 'spring', bounce: 0.2, duration: 0.3 }}
              />
            )}
            <span className="relative z-10">{t.label}</span>
          </button>
        )
      })}
    </div>
  )
}
