/**
 * 휴대폰 판 (Android, 세로 390 x 844, 어두운 테마 하나 §10). design/DESIGN_SPEC.md §4.6 ~ 4.11 · §10.5 폰.
 * 기사와 운영자가 같은 운송장을 쓰는 동반 앱: 출발 전 상차 입력 · 3D 확인 · 짐 사진, 사건 알림 -> 다시 묶기 · 조인 뒤 사진,
 * 기록 · 이 건만 내보내기(PDF · JSON), 운영자는 L4 허브(무인 XCIENT 점검 정차 요청 · 점검 승인).
 * 틀: 상태 표시줄 44 · 앱 바 48 · 내용 · 주 단추 줄 80 · 탭 바 64 · 제스처 20 (시연 화면에서만 기기 틀을 그린다).
 */
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { ClipboardList, Package, Phone, Settings as SettingsIcon, Truck, X } from 'lucide-react'
import type { Tone } from '@/engine/limit'
import { REPORT_PHONES } from '@/engine/lines'
import { app } from '@/runtime/runtime'
import { useStore } from '@/runtime/store'
import { useFrameSize } from '@/ui/Fit'
import { Celebrate } from '@/ui/parts'
import { clock } from '@/ui/format'
import { STATUS_TITLE, incidentCaption } from './derive'
import { closeViewer, detailOf, dismissNotif, openIncident, phone, startPhone, switchTab, TABS_OF, tabFor, useIncidents, useLocked, useUnread, type Route, type Tab } from './state'
import { clearExpand, IconCell, ListRow, Sign, takeExpand } from './ui'
import { Sheets } from './Sheets'
import { Check3DScreen } from './screens/Check3D'
import { EventDetailScreen } from './screens/EventDetail'
import { HubScreen, InspectScreen, TruckScreen } from './screens/Hub'
import { LoadInputScreen } from './screens/LoadInput'
import { RecordsScreen, WaybillScreen } from './screens/Records'
import { SettingsScreen } from './screens/Settings'
import './phone.css'

const THEME = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('theme') : null

function StatusBar() {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 10000)
    return () => window.clearInterval(t)
  }, [])
  return (
    <div className="ph-statusbar" aria-hidden>
      <span className="ph-num">{clock(now)}</span>
      <span className="ic">
        <svg width="17" height="12" viewBox="0 0 17 12">
          <path d="M1 11h2.5V8H1zM5.5 11H8V6H5.5zM10 11h2.5V3.5H10zM14.5 11H17V1h-2.5z" fill="currentColor" />
        </svg>
        <svg width="16" height="12" viewBox="0 0 16 12">
          <path d="M8 11.5 1 4.5a10 10 0 0 1 14 0z" fill="currentColor" />
        </svg>
        <svg width="26" height="12" viewBox="0 0 26 12">
          <rect x="0.75" y="0.75" width="22" height="10.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <rect x="3" y="3" width="15" height="6" fill="currentColor" />
          <rect x="23.5" y="4" width="2" height="4" fill="currentColor" />
        </svg>
      </span>
    </div>
  )
}

function Screen({ tab, route }: { tab: Tab; route: Route | null }) {
  const hasLoad = useStore(app, (s) => !!s.load && !!s.waybill)
  if (route) {
    switch (route.name) {
      case 'edit':
        return <LoadInputScreen edit key="edit" />
      case 'event':
        return <EventDetailScreen ikey={route.key} key={route.key} />
      case 'waybill':
        return <WaybillScreen id={route.id} key={route.id} />
      case 'truck':
        return <TruckScreen id={route.id} key={route.id} />
      case 'inspect':
        return <InspectScreen id={route.id} hk={route.hk} key={route.hk} />
    }
  }
  if (tab === 'load') return hasLoad ? <Check3DScreen /> : <LoadInputScreen edit={false} key="new" />
  if (tab === 'records') return <RecordsScreen />
  if (tab === 'hub') return <HubScreen />
  return <SettingsScreen />
}

const TAB_INFO: Record<Tab, { id: Tab; label: string; icon: typeof Package }> = {
  load: { id: 'load', label: '적재', icon: Package },
  records: { id: 'records', label: '기록', icon: ClipboardList },
  hub: { id: 'hub', label: '허브', icon: Truck },
  settings: { id: 'settings', label: '설정', icon: SettingsIcon },
}

function TabBar({ role, tab }: { role: 'driver' | 'operator'; tab: Tab }) {
  const unread = useUnread().length
  const tabs = TABS_OF[role].map((id) => TAB_INFO[id])
  return (
    <nav className="ph-tabbar" role="tablist" aria-label={(role === 'operator' ? '운영자' : '기사') + ' 아래 탭'} data-n={tabs.length}>
      {tabs.map((t) => {
        const Icon = t.icon
        return (
          <button key={t.id} type="button" role="tab" className="ph-tab" aria-selected={tab === t.id} onClick={() => switchTab(t.id)}>
            <span className="pill" aria-hidden>
              <Icon size={22} strokeWidth={2} />
            </span>
            {t.label}
            {t.id === 'records' && unread > 0 && (
              <span className="cnt" aria-label={'안 읽은 사건 ' + unread}>
                {unread}
              </span>
            )}
          </button>
        )
      })}
    </nav>
  )
}

/**
 * 위 알림 (heads-up, Android 알림과 같은 글) 366 x 72: [경고등 32][제목 한 줄 + 시각 · 장소 한 줄][× 44]. 카드 전체를 누르면 사건 자세히. 6 초 뒤 사라진다.
 * 시스템 알림처럼 상태 표시줄 자리에 떠 있다 (--surface-strong + 짙은 그림자, 그 뒤 위쪽 그늘). 화면 내용은 밀지 않는다.
 * 같은 문장은 한 화면에 한 번만: 그 사건 카드가 이미 보이는 화면(기록 첫 화면 · 그 운송장 · 그 사건)에서는 띄우지 않고,
 * 3D 확인(판정 카드가 같은 사건을 말하는 화면)에서는 떠 있는 동안 판정 카드 · 무대 caption 을 숨긴다 (data-notif-same)
 */
function Notification({ top, tab, route }: { top: number; tab: Tab; route: Route | null }) {
  const notif = useStore(phone, (s) => s.notif)
  const curWb = useStore(app, (s) => s.waybill?.id ?? null)
  const list = useIncidents()
  useStore(phone, (s) => s.details)
  const found = notif ? list.find((i) => i.key === notif.key) ?? null : null
  const onScreen = !!found && ((tab === 'records' && !route) || (route?.name === 'waybill' && route.id === found.wb.id) || (route?.name === 'event' && route.key === found.key))
  const inc = onScreen ? null : found
  const same = !!inc && tab === 'load' && !route && inc.wb.id === curWb && !inc.resolvedAt
  const ref = useRef<HTMLDivElement>(null)
  const shown = !!notif && !!inc
  const title = inc ? STATUS_TITLE[inc.kind] : ''
  useLayoutEffect(() => {
    const root = ref.current?.closest('.ph-root') as HTMLElement | null
    if (!shown || !root) return
    root.setAttribute('data-notif', '')
    // 화면의 판정 카드가 알림과 같은 말이면 (예: 운영자의 실시간 트럭 화면) 그 카드 · 무대 caption 도 알림이 떠 있는 동안 숨긴다
    const vd = root.querySelector('.ph-main .ph-banner:not(.mini) .vd')?.textContent ?? null
    if (same || vd === title) root.setAttribute('data-notif-same', '')
    return () => {
      root.removeAttribute('data-notif')
      root.removeAttribute('data-notif-same')
    }
  }, [shown, same, title, tab, route])
  if (!notif || !inc) return null
  const caption = incidentCaption(inc, detailOf(inc))
  return (
    <>
      <div className="ph-notif-scrim" aria-hidden key={'s' + notif.key + ':' + notif.rank} />
      <div className="ph-notif tone-red" style={{ top }} role="alert" key={notif.key + ':' + notif.rank} ref={ref}>
        <button type="button" className="go" onClick={() => openIncident(inc)} aria-label={title + ', ' + caption + ', 사건 열기'}>
          <Sign tone="red" size={28} />
          <span className="tx">
            <b>{title}</b>
            <span>{caption}</span>
          </span>
        </button>
        <button type="button" className="x" aria-label="알림 닫기" onClick={dismissNotif}>
          <X size={20} strokeWidth={2} />
        </button>
      </div>
    </>
  )
}

/**
 * 토스트: 앱 바 자리에 잠깐 앉는다 (앱 바는 그동안 숨김). 내용 · 주 단추 줄을 밀거나 덮지 않아 첫 화면 배치가 출렁이지 않는다.
 * 위 알림이 떠 있으면 그 아래에
 */
function Toast({ top }: { top: number }) {
  const t = useStore(phone, (s) => s.toast)
  const notif = useStore(phone, (s) => !!s.notif)
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const root = ref.current?.closest('.ph-root') as HTMLElement | null
    if (!root || !t) return
    root.setAttribute('data-toast', '')
    return () => root.removeAttribute('data-toast')
  }, [t])
  if (!t) return null
  return (
    <div className="ph-toast" role="status" key={t} ref={ref} style={{ top: notif ? 88 : top }}>
      {t}
    </div>
  )
}

function Viewer() {
  const v = useStore(phone, (s) => s.viewer)
  if (!v) return null
  return (
    <div className="ph-viewer" role="dialog" aria-modal="true" aria-label={v.caption}>
      <div className="hd">
        {v.caption}
        <IconCell label="닫기" onClick={closeViewer}>
          <X size={24} strokeWidth={2} />
        </IconCell>
      </div>
      <div className="im" onClick={closeViewer}>
        <img src={v.src} alt={v.caption} />
      </div>
    </div>
  )
}

/**
 * 운전 중 잠금 (기사): 휴대폰은 보라고 부르지 않는다. 단추 없음, 움직임 없음.
 * 사건이 없으면 상태 색 없는 중립 등(운전대) + '운전 중입니다'. 사건이 있으면 그 사건 색 경고등 + 사건 이름 한 줄
 * ('짐이 밀렸습니다'), 그 아래 '운전 중입니다 · 차 화면과 음성으로 알려 드립니다'. 원인 없는 경보 모양은 쓰지 않는다.
 * 짐 이탈 의심일 때만 신고 전화 두 줄 (고속도로 1588-2504 · 일반 도로 112). 알림은 서면 보여 준다.
 */
function DriveLock() {
  const tone = useStore(app, (s) => (s.out?.status.tone ?? 'grey') as Tone)
  const kind = useStore(app, (s) => s.out?.alert?.kind ?? null)
  const lost = kind === 'lost'
  const title = kind ? STATUS_TITLE[kind] : '운전 중입니다'
  return (
    <div className="ph-lock" role="status" aria-live="polite" aria-label={kind ? title + ' · 운전 중입니다' : '운전 중입니다'} data-event={kind ? '' : undefined}>
      <div className="body">
        <Sign tone={kind ? (tone === 'green' || tone === 'grey' ? 'red' : tone) : 'neutral'} size={96} />
        <h2>{title}</h2>
        <p>
          {kind ? '운전 중입니다 · 세우면 이어서 봅니다' : '차 화면과 음성으로 알려 드립니다'}
          <br />
          {kind ? '차 화면과 음성으로 알려 드립니다' : '세우면 이어서 봅니다'}
        </p>
      </div>
      {lost && (
        <div className="ph-list">
          {REPORT_PHONES.map((p) => (
            <ListRow key={p.phone} icon={<Phone size={22} strokeWidth={2} />} title={p.road + ' ' + p.phone} caption={p.label + ' · 누르면 전화합니다'} href={'tel:' + p.phone.replace(/-/g, '')} />
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * 화면 바뀜 (§8.2): 탭 바꿈 = fade through, 들어감 = shared axis X (오른쪽에서), 나옴 = 왼쪽에서,
 * 허브 트럭 카드 = 누른 카드 자리에서 펼침 (container transform). 처음 열 때는 움직이지 않는다
 */
function RouteView({ tab, route, depth }: { tab: Tab; route: Route | null; depth: number }) {
  const prev = useRef<{ tab: Tab; depth: number } | null>(null)
  const p = prev.current
  let kind = ''
  let style: CSSProperties | undefined
  if (p) {
    if (p.tab !== tab) kind = ' through'
    else if (depth > p.depth) {
      const e = route?.name === 'truck' ? takeExpand() : null
      if (e) {
        kind = ' expand'
        style = { ['--ex' as string]: `inset(${e.top}px ${e.right}px ${e.bottom}px ${e.left}px round 18px)` }
      } else kind = ' push'
    } else if (depth < p.depth) kind = ' pop'
  }
  useLayoutEffect(() => {
    prev.current = { tab, depth }
    clearExpand()
  })
  const key = tab + ':' + depth + ':' + (route ? route.name + ('id' in route ? route.id : '') + ('key' in route ? route.key : '') : '')
  return (
    <div className={'ph-route' + kind} style={style} key={key}>
      <Screen tab={tab} route={route} />
    </div>
  )
}

export default function PhoneApp() {
  const { W, H } = useFrameSize()
  useEffect(() => startPhone(), [])
  const tab = useStore(phone, (s) => s.tab)
  const role = useStore(phone, (s) => s.role)
  const stacks = useStore(phone, (s) => s.stacks)
  // 넓은 창(시연 무대 · PC 브라우저)은 기기 틀(상태 막대 · 제스처)을 그리고, 실제 폰은 기기 것을 쓴다
  // (?device 를 붙이면 좁은 창에서도 기기 틀을 그린다: 390 x 844 화면 찍기용)
  const device = typeof window !== 'undefined' && (window.innerWidth >= 600 || new URLSearchParams(location.search).has('device'))
  const curTab: Tab = tabFor(role, tab)
  const stack = stacks[curTab]
  const route = stack.length ? stack[stack.length - 1] : null
  // 기사가 운전 중이면 내용 대신 잠금 (움직임도 0: data-mode="drive")
  const locked = useLocked()
  // 테마는 하나(어두운 쪽, §10.4). ?theme=night 이면 밤: 카드 밝기 · 3D 노출만 한 단계 낮춘다. 운전 중 잠금도 밤 단계 (차 모드 화면)
  const theme = locked || THEME === 'night' ? 'night' : undefined
  // 스크롤한 칸에만 data-scrolled: 위 16 px 를 바탕으로 녹여, 판정 카드 밑에서 글이 반쪽으로 칼처럼 잘려 보이지 않게 (phone.css)
  const rootRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const on = (e: Event) => {
      const el = e.target
      if (!(el instanceof HTMLElement) || !el.classList.contains('ph-scroll')) return
      const s = el.scrollTop > 1
      if (s !== el.hasAttribute('data-scrolled')) el.toggleAttribute('data-scrolled', s)
      // 무대가 거의 다 올라갔으면 (남은 높이 72 밑) 무대 위 칩 · 보기 알약을 숨긴다: 판정 줄 밑 녹임에 테두리 실오라기가 비치지 않게
      const st = el.querySelector('.ph-stage')
      if (st instanceof HTMLElement) {
        const off = st.offsetTop + st.offsetHeight - el.scrollTop < 72
        if (off !== el.hasAttribute('data-stage-off')) el.toggleAttribute('data-stage-off', off)
      }
    }
    root.addEventListener('scroll', on, true)
    return () => root.removeEventListener('scroll', on, true)
  }, [])
  return (
    <div className="jj ph-root" ref={rootRef} style={{ width: W, height: H }} data-role={role} data-mode={locked ? 'drive' : undefined} data-theme={theme}>
      {device ? <StatusBar /> : <div style={{ height: 'env(safe-area-inset-top, 0px)', flex: 'none' }} />}
      {locked ? (
        <DriveLock />
      ) : (
        <>
          <main className="ph-main">
            <RouteView tab={curTab} route={route} depth={stack.length} />
          </main>
          <TabBar role={role} tab={curTab} />
        </>
      )}
      {device ? (
        <div className="ph-gesture" aria-hidden>
          <i />
        </div>
      ) : (
        <div style={{ height: 'env(safe-area-inset-bottom, 0px)', flex: 'none' }} />
      )}
      {!locked && (
        <>
          <Notification top={6} tab={curTab} route={route} />
          <Toast top={device ? 46 : 2} />
          <Sheets />
          <Viewer />
          <Celebrate />
        </>
      )}
    </div>
  )
}
