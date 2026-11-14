/**
 * 상차 정보 (오른쪽 시트, 폭 720). 짐 종류 · 무게 단계 · 벨트 수와 종류 · 앞벽. 10초면 끝난다.
 * 묶음은 카드 없이 간격과 작은 이름으로만 나눈다 (시트 > 고르는 칸 두 단계뿐).
 * 고칠 때마다 아래 판정 미리 보기가 바뀌고, 바로 아래 '확인하고 3D로 보기' 로 운송장에 남긴다.
 * 시트 높이는 내용만큼 (빈 시트 면을 두지 않는다).
 */
import { useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { CARGO, PICKABLE, WEIGHTS } from '@/engine/cargo'
import type { BeltType, LoadInput } from '@/engine/limit'
import { app, confirmLoad, verdictFor } from '@/runtime/runtime'
import { useStore } from '@/runtime/store'
import { CargoIcon } from '@/ui/icons'
import { Button, Segmented, Sign, Stepper, ToggleRow } from '@/ui/parts'

const DEFAULT: LoadInput = { kind: 'appliance', massKg: 300, belts: 2, beltType: 'ratchet', frontWall: false }

export function LoadSheet({ onClose }: { onClose: () => void }) {
  const cur = useStore(app, (s) => s.load)
  const [f, setF] = useState<LoadInput>(() => cur ?? DEFAULT)
  const set = (p: Partial<LoadInput>) => setF((x) => ({ ...x, ...p }))
  const v = useMemo(() => verdictFor(f), [f])
  const weights = WEIGHTS.map((w) => ({ id: String(w), label: '약 ' + w + ' kg' }))
  return (
    <>
      <div className="nv-scrim" onClick={onClose} aria-hidden="true" />
      <section className="nv-sheet load" role="dialog" aria-modal="true" aria-label="상차 정보">
        <div className="nv-sheet-head">
          <h2>상차 정보</h2>
          <button type="button" className="x" aria-label="닫기" onClick={onClose}>
            <X strokeWidth={2.4} />
          </button>
        </div>
        <div className="nv-sheet-body jj-stagger">
          <div className="nv-field">
            <h3 className="nv-field-h">짐 종류</h3>
            <div className="nv-kinds" role="group" aria-label="짐 종류">
              {PICKABLE.map((k) => (
                <button key={k} type="button" aria-pressed={f.kind === k} onClick={() => set({ kind: k })}>
                  {/* 아이콘 46 설계 px = 35 CSS px (1224 창). 칸을 채워 보이게 */}
                  <CargoIcon kind={k} size={46} />
                  {CARGO[k].label}
                </button>
              ))}
            </div>
          </div>
          <div className="nv-field">
            <h3 className="nv-field-h">무게</h3>
            <Segmented options={weights} value={String(f.massKg)} onChange={(w) => set({ massKg: Number(w) })} label="무게" />
          </div>
          <div className="nv-field">
            <h3 className="nv-field-h">벨트</h3>
            <div className="nv-belts">
              <Stepper value={f.belts} unit="개" min={0} max={8} onChange={(b) => set({ belts: b })} label="벨트" />
              <Segmented<BeltType>
                options={[
                  { id: 'ratchet', label: '라쳇 벨트' },
                  { id: 'rubber', label: '고무바·로프' },
                ]}
                value={f.beltType}
                onChange={(t) => set({ beltType: t })}
                label="벨트 종류"
              />
            </div>
          </div>
          <div className="nv-field wall">
            <ToggleRow label="앞벽에 빈틈없이 붙여 실었나요?" caption="붙이면 앞쪽은 앞벽이 받습니다" on={f.frontWall} onChange={(on) => set({ frontWall: on })} />
          </div>
        </div>
        {/* 판정 미리 보기는 주 단추 바로 위 (고른 것 -> 결과 -> 확인) */}
        <div className="nv-sheet-foot">
          <div className={'nv-preview tone-' + v.tone} role="status">
            <Sign tone={v.tone} />
            <div className="tx">
              <b>{v.title}</b>
              <span>{[v.action, v.alt].filter(Boolean).join(' · ')}</span>
            </div>
          </div>
          <Button
            kind="primary"
            onClick={() => {
              confirmLoad(f)
              onClose()
            }}
          >
            확인하고 3D로 보기
          </Button>
        </div>
      </section>
    </>
  )
}
