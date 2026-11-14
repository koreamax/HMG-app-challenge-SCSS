/**
 * 4.10 기록: [전체 | 사건 있음] -> 안 읽은 사건 카드 -> 운송장 줄 72.
 * 운송장: 앱 바 오른쪽 내보내기 -> 요약 칸 2 x 2 -> 시간 줄 -> 사진 3열 -> 고정 영역 '이 건만 내보내기'.
 * 기록은 기사 본인 것이다. 밖으로는 기사가 이 건만 직접 내보낼 때만 나간다.
 */
import { useMemo, useState } from 'react'
import { Gauge, Route, Share2, Siren, Wrench } from 'lucide-react'
import type { Waybill } from '@/engine/records'
import { CARGO } from '@/engine/cargo'
import { app } from '@/runtime/runtime'
import { useStore } from '@/runtime/store'
import { clock, dayLabel, fmtKm } from '@/ui/format'
import { STATUS_TITLE, entryLine, findWaybill, incidentCaption, incidentsOf, purposeWord, waybillSummary } from '../derive'
import { back, detailOf, openIncident, openSheet, openViewer, phone, push, useIncidents, useUnread } from '../state'
import { PRIVACY } from '../report'
import { AppBar, Chip, EventCard, Fixed, Gap, Head, IconCell, ListRow, Primary, PullScroll, Segmented, Tile } from '../ui'

export function RecordsScreen() {
  const wb = useStore(app, (s) => s.waybill)
  const history = useStore(app, (s) => s.history)
  useStore(phone, (s) => s.details)
  const unread = useUnread()
  const [filter, setFilter] = useState<'all' | 'events'>('all')
  const list = useMemo(() => {
    const all: Waybill[] = [...(wb ? [wb] : []), ...[...history].reverse().filter((h) => h.id !== wb?.id)]
    return all.map((w) => ({ w, inc: incidentsOf(w) }))
  }, [wb, history])
  const shown = filter === 'events' ? list.filter((x) => x.inc.length) : list

  return (
    <div className="ph-screen">
      <AppBar title="기록" />
      <div className="ph-filter">
        <Segmented
          label="기록 거르기"
          items={[
            { id: 'all', label: '전체' },
            { id: 'events', label: '사건 있음' },
          ]}
          value={filter}
          onChange={setFilter}
        />
      </div>
      <PullScroll>
        {unread.length > 0 && (
          <>
            <div className="ph-cards">
              {unread.map((i) => (
                <EventCard key={i.key} tone="red" title={STATUS_TITLE[i.kind]} caption={incidentCaption(i, detailOf(i)) + (i.resolvedAt ? ' · 조치함' : '')} unread onClick={() => openIncident(i)} />
              ))}
            </div>
            <div style={{ height: 8 }} />
          </>
        )}
        <Head title="운송장" caption={shown.length + '건'} />
        {shown.length ? (
          <div className="ph-list">
            {shown.map(({ w, inc }) => {
              const load = [...w.entries].reverse().find((e) => e.kind === 'load')
              const tone = inc.length ? 'red' : load && load.kind === 'load' ? load.tone : 'grey'
              return (
                <ListRow
                  key={w.id}
                  tone={tone}
                  title={w.id}
                  sub={w.closedAt ? null : <Chip tone="neutral">운행 중</Chip>}
                  caption={dayLabel(w.createdAt) + ' ' + clock(w.createdAt) + ' · ' + CARGO[w.input.kind].label + ' ' + w.input.massKg + ' kg' + ' · 사건 ' + inc.length}
                  onClick={() => push({ name: 'waybill', id: w.id })}
                />
              )
            })}
          </div>
        ) : (
          <div className="ph-empty">
            <b>{filter === 'events' ? '사건이 있는 운송장이 없습니다' : '아직 기록이 없습니다'}</b>
            <span>상차 정보를 넣으면 운송장이 생기고, 판정 · 사건 · 조치 · 사진이 여기에 쌓입니다</span>
          </div>
        )}
        <RecentIncidents skip={unread.map((i) => i.key)} />
        <p className="ph-note">{PRIVACY}</p>
      </PullScroll>
    </div>
  )
}

/**
 * 최근 사건 (기록 첫 화면 아래): 이 기기의 사건을 최근 것부터 넷까지, 조치했는지와 함께.
 * 위 '안 읽은 사건' 카드에 이미 나온 것은 빼고, 머리에 모두 몇 건 · 조치 몇 건을 셈으로 보인다
 */
function RecentIncidents({ skip }: { skip: string[] }) {
  const all = useIncidents()
  if (!all.length) return null
  const rest = all.filter((i) => !skip.includes(i.key))
  const fixed = all.filter((i) => i.resolvedAt).length
  const shown = rest.slice(0, 4)
  return (
    <>
      <Head title="최근 사건" caption={'모두 ' + all.length + '건 · 조치 ' + fixed + '건'} />
      {shown.length > 0 && (
        <div className="ph-list">
          {shown.map((i) => (
            <ListRow
              key={i.key}
              tone={i.resolvedAt ? 'none' : 'red'}
              title={STATUS_TITLE[i.kind]}
              caption={incidentCaption(i, detailOf(i)) + ' · ' + (i.resolvedAt ? '조치 ' + clock(i.resolvedAt) : '조치 전')}
              onClick={() => openIncident(i)}
            />
          ))}
        </div>
      )}
    </>
  )
}

export function WaybillScreen({ id }: { id: string }) {
  const wb = useStore(app, (s) => s.waybill)
  const history = useStore(app, (s) => s.history)
  const liveKm = useStore(app, (s) => (s.waybill?.id === id ? Math.round((s.out?.kmSinceLoad ?? 0) * 10) / 10 : null))
  const tags = useStore(phone, (s) => s.photoTags)
  const seen = useStore(phone, (s) => s.seen)
  useStore(phone, (s) => s.details)
  const w = findWaybill(wb, history, id)
  if (!w) {
    return (
      <div className="ph-screen">
        <AppBar title="운송장" onBack={back} />
        <div className="ph-empty">
          <b>운송장을 찾지 못했습니다</b>
          <span>이 기기의 기록을 지웠을 수 있습니다</span>
        </div>
      </div>
    )
  }
  const sum = waybillSummary(w, w.closedAt ? null : liveKm)
  const photos = w.entries.filter((e): e is Extract<typeof e, { kind: 'photo' }> => e.kind === 'photo')
  const load = sum.load
  const open = !w.closedAt && wb?.id === w.id

  return (
    <div className="ph-screen">
      <AppBar
        title={w.id}
        onBack={back}
        extra={open ? <Chip tone="neutral">운행 중</Chip> : null}
        right={
          <IconCell label="이 건만 내보내기" onClick={() => openSheet({ kind: 'export', id: w.id })}>
            <Share2 size={22} strokeWidth={2} />
          </IconCell>
        }
      />
      <div className="ph-scroll">
        <div className="ph-tiles c2">
          <Tile tone={load ? load.tone : 'grey'} icon={<Gauge size={18} strokeWidth={2} />} name="상차 판정" word value={load ? load.title : '판정 불가'} unit={load ? load.limit.toFixed(2) + ' g' : undefined} bar={load ? { ratio: load.limit / 1.2, mark: load.crit / 1.2 } : null} />
          <Tile
            tone={sum.incidents.length ? 'red' : 'neutral'}
            icon={<Siren size={18} strokeWidth={2} />}
            name="사건"
            value={sum.incidents.length}
            unit="건"
            cap={sum.incidents.length ? '조치 끝 ' + sum.incidents.filter((i) => i.resolvedAt).length + ' / ' + sum.incidents.length : '사건 없음'}
          />
          <Tile tone="neutral" icon={<Wrench size={18} strokeWidth={2} />} name="다시 조임" value={sum.relash} unit="번" cap="사건 뒤 다시 묶음" />
          <Tile tone="neutral" icon={<Route size={18} strokeWidth={2} />} name="거리" value={fmtKm(sum.km)} unit="km" cap={w.closedAt ? '상차부터 종료까지' : '상차 뒤 지금까지'} />
        </div>
        <p className="ph-note">
          {dayLabel(w.createdAt)} {clock(w.createdAt)} 상차 · {CARGO[w.input.kind].label} {w.input.massKg} kg · {w.input.beltType === 'ratchet' ? '라쳇' : '고무바'} {w.input.belts}개 · 앞벽 {w.input.frontWall ? '붙임' : '안 붙임'}
          {w.closedAt ? ' · ' + clock(w.closedAt) + ' 운행 종료' : ''}
        </p>
        {sum.incidents.length > 0 && (
          <>
            <Head title="사건" caption={sum.incidents.length + '건'} />
            <div className="ph-cards" style={{ paddingTop: 0 }}>
              {sum.incidents.map((i) => (
                <EventCard key={i.key} tone="red" title={STATUS_TITLE[i.kind]} caption={incidentCaption(i, detailOf(i)) + (i.resolvedAt ? ' · 조치 ' + clock(i.resolvedAt) : ' · 조치 전')} unread={(seen[i.key] ?? 0) < i.rank} onClick={() => openIncident(i)} />
              ))}
            </div>
          </>
        )}
        <Head title="시간 줄" caption={w.entries.length + '줄'} />
        <div className="ph-list tl">
          {w.entries.map((e, k) => {
            const l = entryLine(e, e.kind === 'photo' ? tags[w.id + ':' + e.at]?.purpose : undefined)
            return (
              <div key={k} className="ph-time">
                <span className="tm">{clock(e.at)}</span>
                <span className={'sq ' + (l.tone ? 'tone-' + l.tone : 'none')} aria-hidden />
                <span className="tx">
                  <b>{l.title}</b>
                  {l.detail && <span>{l.detail}</span>}
                </span>
              </div>
            )
          })}
        </div>
        <Head title="사진" caption={photos.length + '장'} />
        {photos.length ? (
          <div className="ph-pad">
            <div className="ph-pgrid">
              {photos.map((p) => {
                const word = purposeWord(tags[w.id + ':' + p.at]?.purpose)
                return (
                  <button key={p.at} type="button" onClick={() => openViewer(p.dataUrl, word + ' · ' + clock(p.at))} aria-label={word + ' 사진 크게 보기'}>
                    <img src={p.dataUrl} alt="" />
                    <span className="tag">
                      {word} {clock(p.at)}
                    </span>
                  </button>
                )
              })}
              {Array.from({ length: (3 - (photos.length % 3)) % 3 }, (_, i) => (
                <span key={'pad' + i} className="pad" aria-hidden />
              ))}
            </div>
          </div>
        ) : (
          <p className="ph-note" style={{ paddingTop: 0 }}>
            사진 없음
          </p>
        )}
        {open && (
          <>
            <div style={{ height: 16 }} />
            <Gap />
            <div className="ph-list">
              <ListRow one title="운행 종료" caption="내비와 함께 이 운송장을 닫습니다" onClick={() => openSheet({ kind: 'close' })} />
            </div>
          </>
        )}
      </div>
      <Fixed>
        <Primary onClick={() => openSheet({ kind: 'export', id: w.id })}>
          <Share2 size={20} strokeWidth={2} />이 건만 내보내기
        </Primary>
      </Fixed>
    </div>
  )
}
