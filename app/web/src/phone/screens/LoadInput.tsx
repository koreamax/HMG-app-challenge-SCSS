/**
 * 4.7 상차 정보: 짐 칸 3 x 2 -> 무게 4칸 -> 벨트 증감 + 종류 -> 앞벽 켜기. 아래 작은 판정 띠는 고칠 때마다 바뀐다.
 * '확인하고 3D로 보기'를 누르면 운송장에 남고, 같은 운송장을 쓰는 내비에도 바로 보인다.
 */
import { useMemo, useState } from 'react'
import { CARGO, PICKABLE, WEIGHTS } from '@/engine/cargo'
import type { BeltType, LoadInput } from '@/engine/limit'
import { app, confirmLoad, verdictFor } from '@/runtime/runtime'
import { useStore } from '@/runtime/store'
import { loadBanner } from '../derive'
import { back, showToast } from '../state'
import { AppBar, Banner, CargoIcon, Fixed, Primary, Segmented, Stepper, ToggleRow } from '../ui'

const DEFAULT: LoadInput = { kind: 'appliance', massKg: 300, belts: 2, beltType: 'ratchet', frontWall: false }

export function LoadInputScreen({ edit }: { edit: boolean }) {
  const cur = useStore(app, (s) => s.load)
  // 키트가 붙거나 끊기면 판정이 바뀐다 (실측 장력)
  const kitTick = useStore(app, (s) => (s.kit.fresh && s.kit.snap ? Math.round((s.kit.snap.frame.c1 ?? 0) / 20) + ':' + Math.round((s.kit.snap.frame.c2 ?? 0) / 20) : 'off'))
  const [f, setF] = useState<LoadInput>(() => (cur ? { ...cur } : DEFAULT))
  const set = (p: Partial<LoadInput>) => setF((x) => ({ ...x, ...p }))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const v = useMemo(() => verdictFor(f), [f, kitTick])

  const confirm = () => {
    confirmLoad(f)
    showToast(edit ? '고친 상차 정보를 운송장에 남겼습니다' : '운송장에 남겼습니다 · 내비에도 보입니다')
    if (edit) back()
  }

  return (
    <div className="ph-screen">
      <AppBar title={edit ? '상차 정보 고치기' : '상차 정보'} onBack={edit ? back : undefined} />
      <div className="ph-scroll">
        <div className="ph-head tight">
          <b>무엇을 실었나요?</b>
        </div>
        <div className="ph-pad">
          <div className="ph-cargo" role="group" aria-label="짐 종류">
            {PICKABLE.map((k) => (
              <button key={k} type="button" aria-pressed={f.kind === k} onClick={() => set({ kind: k })}>
                <CargoIcon kind={k} />
                {CARGO[k].label}
              </button>
            ))}
          </div>
          <p className="ph-cargo-cap">마찰은 재질별 낮은 값으로 계산합니다</p>
        </div>
        <div className="ph-head tight">
          <b>대략 얼마나 무겁나요?</b>
        </div>
        <div className="ph-pad">
          <Segmented label="무게" items={WEIGHTS.map((w) => ({ id: String(w), label: '약 ' + w + ' kg' }))} value={String(f.massKg)} onChange={(w) => set({ massKg: Number(w) })} />
        </div>
        <div className="ph-head tight">
          <b>벨트</b>
          <span>건 바 개수와 종류</span>
        </div>
        <div className="ph-pad" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <Stepper label="벨트" value={f.belts} unit="개" min={0} max={8} onChange={(n) => set({ belts: n })} />
          <Segmented<BeltType>
            label="벨트 종류"
            items={[
              { id: 'ratchet', label: '라쳇 벨트' },
              { id: 'rubber', label: '고무바·로프' },
            ]}
            value={f.beltType}
            onChange={(t) => set({ beltType: t })}
          />
        </div>
        <div className="ph-list" style={{ marginTop: 12 }}>
          <ToggleRow on={f.frontWall} onChange={(on) => set({ frontWall: on })} title="앞벽에 빈틈없이 붙여 실었나요?" caption="붙이면 앞쪽은 앞벽이 받습니다 (짐이 앞벽보다 낮을 때)" />
        </div>
        {/* 스크롤 내용은 앞벽 카드에서 끝난다: 그 아래 설명 줄은 판정 띠 밑으로 반쯤 비쳐 보였다 (운송장에 남는다는 말은 누른 뒤 토스트가 한다) */}
      </div>
      <Banner mini data={loadBanner(v)} />
      <Fixed>
        <Primary onClick={confirm}>확인하고 3D로 보기</Primary>
      </Fixed>
    </div>
  )
}
