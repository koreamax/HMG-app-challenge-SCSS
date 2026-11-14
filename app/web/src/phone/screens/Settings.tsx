/** 설정: 역할(기사 · 운영자) · 계정 · 같은 운송장(내비와 함께) · 알림 · 기록 지우기 */
import { Gauge, Link2, Package, Radio, Trash2, Truck, UserRound } from 'lucide-react'
import { app } from '@/runtime/runtime'
import { useStore } from '@/runtime/store'
import { ACCOUNT, openSheet, phone, setNotify } from '../state'
import { PRIVACY } from '../report'
import { AppBar, Head, ListRow, ToggleRow } from '../ui'

export function SettingsScreen() {
  const role = useStore(phone, (s) => s.role)
  const notify = useStore(phone, (s) => s.notify)
  const wb = useStore(app, (s) => s.waybill?.id ?? null)
  const kitMode = useStore(app, (s) => s.kit.mode)
  const kitFresh = useStore(app, (s) => s.kit.fresh)
  const stf = useStore(app, (s) => s.settings.stfN)
  const acc = ACCOUNT[role]
  const kitWord = kitMode === 'off' ? '없음' : kitFresh ? '연결됨' : '끊김'
  return (
    <div className="ph-screen">
      <AppBar title="설정" />
      <div className="ph-scroll">
        <Head title="계정" />
        <div className="ph-list">
          <ListRow icon={<UserRound size={22} strokeWidth={2} />} title={acc.name} caption={acc.org} value={role === 'operator' ? '운영자 모드' : '기사 모드'} />
          <ListRow
            icon={role === 'operator' ? <Truck size={22} strokeWidth={2} /> : <Package size={22} strokeWidth={2} />}
            title={role === 'operator' ? '허브 · 설정' : '적재 · 기록 · 설정'}
            caption={role === 'operator' ? '점검 정차 요청 · 점검 승인' : '상차 · 3D 확인 · 사건 기록'}
          />
        </div>
        <Head title="내비와 함께" />
        <div className="ph-list">
          <ListRow icon={<Link2 size={22} strokeWidth={2} />} title={wb ? '운송장 ' + wb : '열린 운송장 없음'} caption="내비와 같은 운송장" />
          <ListRow icon={<Radio size={22} strokeWidth={2} />} title="센서 키트" value={kitWord} />
          <ListRow icon={<Gauge size={22} strokeWidth={2} />} title="벨트 표준 장력" value={stf / 10 + ' daN'} />
        </div>
        <Head title="알림" />
        <div className="ph-list">
          <ToggleRow on={notify} onChange={setNotify} title="사건 알림" caption="짐이 밀리거나 바가 느슨해질 때" />
        </div>
        <Head title="기록" />
        <div className="ph-list">
          <ListRow one icon={<Trash2 size={22} strokeWidth={2} />} title="이 기기의 기록 모두 지우기" caption="운송장 · 사진 · 점검 기록" onClick={() => openSheet({ kind: 'clear' })} />
        </div>
        <p className="ph-note">
          {PRIVACY}
        </p>
      </div>
    </div>
  )
}
