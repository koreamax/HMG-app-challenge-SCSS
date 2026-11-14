/**
 * 굴러가는 숫자 (21st.dev 의 builduilabs 'Animated Counter' 조리법: 자리마다 useSpring, useTransform 으로 0~9 를 굴린다).
 * 정차 중 숫자에만 쓴다. 주행 중에는 숫자를 보이지 않는다.
 */
import { motion, useSpring, useTransform, type MotionValue } from 'motion/react'
import { useEffect } from 'react'

function Num({ mv, n, h }: { mv: MotionValue<number>; n: number; h: number }) {
  const y = useTransform(mv, (latest) => {
    const place = ((latest % 10) + 10) % 10
    let off = (10 + n - place) % 10
    let px = off * h
    if (off > 5) px -= 10 * h
    return px
  })
  return (
    <motion.span style={{ y }} className="absolute inset-0 flex items-center justify-center">
      {n}
    </motion.span>
  )
}

function Digit({ place, value, h }: { place: number; value: number; h: number }) {
  const rounded = Math.floor(value / place)
  const mv = useSpring(rounded, { stiffness: 260, damping: 32, mass: 0.6 })
  useEffect(() => {
    mv.set(rounded)
  }, [mv, rounded])
  return (
    <span className="relative inline-block w-[0.62em] overflow-hidden" style={{ height: h }}>
      {Array.from({ length: 10 }, (_, i) => (
        <Num key={i} mv={mv} n={i} h={h} />
      ))}
    </span>
  )
}

/** value 를 decimals 자리까지 굴린다 (예: 0.53 -> 0 . 5 3) */
export function AnimatedCounter({ value, decimals = 2, size = 28, suffix }: { value: number; decimals?: number; size?: number; suffix?: string }) {
  const h = Math.round(size * 1.2)
  const scaled = Math.round(Math.max(0, value) * 10 ** decimals)
  const intDigits = Math.max(1, String(Math.floor(scaled / 10 ** decimals)).length)
  const places: number[] = []
  for (let i = intDigits + decimals - 1; i >= 0; i--) places.push(10 ** i)
  return (
    <span className="tnum inline-flex items-center" style={{ fontSize: size, lineHeight: h + 'px' }} aria-label={(scaled / 10 ** decimals).toFixed(decimals) + (suffix ?? '')}>
      {places.map((p, i) => (
        <span key={p} className="inline-flex">
          {i === intDigits && <span className="inline-block w-[0.3em] text-center">.</span>}
          <Digit place={p} value={scaled} h={h} />
        </span>
      ))}
      {suffix && <span className="ml-[0.18em]">{suffix}</span>}
    </span>
  )
}
