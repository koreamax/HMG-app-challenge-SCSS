/** 짐 종류 아이콘 (선 아이콘, 모서리 0) */
import type { ReactNode } from 'react'
import type { CargoKind } from '@/engine/cargo'

const PATH: Record<CargoKind, ReactNode> = {
  pallet: (
    <>
      <path d="M3 14h18v3H3z" />
      <path d="M5 17v3M12 17v3M19 17v3" />
      <path d="M5 6h14v8H5z" />
      <path d="M12 6v8" />
    </>
  ),
  appliance: (
    <>
      <path d="M6 2h12v20H6z" />
      <path d="M6 9h12M9 5v2M9 12v3" />
    </>
  ),
  furniture: (
    <>
      <path d="M4 12V7h16v5" />
      <path d="M2 12h20v5H2z" />
      <path d="M5 17v3M19 17v3" />
    </>
  ),
  material: (
    <>
      <path d="M3 14h8v6H3zM13 14h8v6h-8zM8 7h8v6H8z" />
    </>
  ),
  box: (
    <>
      <path d="M3 8l9-4 9 4v9l-9 4-9-4z" />
      <path d="M3 8l9 4 9-4M12 12v9" />
    </>
  ),
}

export function CargoIcon({ kind, size = 32 }: { kind: CargoKind; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true">
      {PATH[kind]}
    </svg>
  )
}
