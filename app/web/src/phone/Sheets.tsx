/**
 * 아래에서 올라오는 어두운 판 (시트, --canvas · 위 모서리 24): 내보내기 · 견딜 수 있는 힘 자세히 · 점검 기준 · 기록만 남기고 계속(이유) · 운행 종료 · 기록 지우기.
 */
import { useRef, useState, type ReactNode } from 'react'
import { Check, ChevronDown, FileJson, FileText, X } from 'lucide-react'
import { addOperatorNote, app, clearAll, closeWaybill, verdictFor } from '@/runtime/runtime'
import { useStore } from '@/runtime/store'
import { fmtN } from '@/ui/format'
import { STATUS_TITLE, findWaybill, verdictWord } from './derive'
import { fleet, findTruck, liveHubKey } from './fleet'
import { closeSheet, clearPhone, patchHub, phone, showToast, useIncidents } from './state'
import { PRIVACY, exportJson, printHtml, reportHtml, saveText, shareFile } from './report'
import { Chip, Primary, Secondary } from './ui'
import { usePresence } from '@/ui/parts'

function Sheet({ title, caption, children, footer }: { title: string; caption?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <>
      <div className="ph-scrim" onClick={closeSheet} aria-hidden />
      <div className="ph-sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="hd">
          <div className="tx">
            <span className="t-title">{title}</span>
            {caption && <span className="t-caption">{caption}</span>}
          </div>
          <button type="button" className="ph-icell" aria-label="닫기" onClick={closeSheet}>
            <X size={24} strokeWidth={2} />
          </button>
        </div>
        <div className="bd">{children}</div>
        {footer && <div className="ft">{footer}</div>}
      </div>
    </>
  )
}

function Choice({ on, icon, title, caption, onClick }: { on: boolean; icon: ReactNode; title: string; caption: string; onClick: () => void }) {
  return (
    <button type="button" className="ph-row" role="radio" aria-checked={on} onClick={onClick} style={{ minHeight: 64 }}>
      <span className="ic">{icon}</span>
      <span className="tx">
        <b>{title}</b>
        <span>{caption}</span>
      </span>
      <span className="radio" aria-hidden>
        <Check size={16} strokeWidth={3} />
      </span>
    </button>
  )
}

function ExportSheet({ id }: { id: string }) {
  const [fmt, setFmt] = useState<'pdf' | 'json'>('pdf')
  const [busy, setBusy] = useState(false)
  const go = async () => {
    const s = app.get()
    const w = findWaybill(s.waybill, s.history, id)
    if (!w) return
    const p = phone.get()
    const ctx = {
      loadNote: p.loadNotes[w.id] ?? null,
      eventNotes: p.eventNotes,
      photoTags: p.photoTags,
      details: p.details,
      liveKm: s.waybill?.id === w.id ? s.out?.kmSinceLoad ?? null : null,
    }
    setBusy(true)
    try {
      if (fmt === 'json') {
        const name = '적재기록_' + w.id + '.json'
        const text = JSON.stringify(exportJson(w, ctx), null, 2)
        // 휴대폰 브라우저: Android 공유 창 / 앱 껍데기: 기기에 저장 / PC: 내려받기
        if (await shareFile(name, 'application/json', text)) showToast('이 건만 내보냈습니다')
        else {
          const where = saveText(name, 'application/json', text)
          showToast(where ? '이 건만 내보냈습니다 · ' + where : '내보내지 못했습니다')
        }
      } else {
        const html = reportHtml(w, ctx)
        if (s.native) {
          const where = saveText('적재보고서_' + w.id + '.html', 'text/html', html)
          showToast(where ? '보고서를 저장했습니다 · ' + where : '저장하지 못했습니다')
        } else {
          closeSheet()
          showToast('인쇄 창에서 ‘PDF로 저장’을 고르세요', 4000)
          await printHtml(html)
          return
        }
      }
      closeSheet()
    } finally {
      setBusy(false)
    }
  }
  return (
    <Sheet
      title="내보내기"
      caption={'운송장 ' + id + ' · 이 건만'}
      footer={
        <Primary onClick={go} disabled={busy}>
          내보내기
        </Primary>
      }
    >
      <div className="ph-list" role="radiogroup" aria-label="형식">
        <Choice on={fmt === 'pdf'} icon={<FileText size={24} strokeWidth={1.9} />} title="PDF 보고서" caption="상차 판정 · 사건 · 조치 · 사진을 한 문서로" onClick={() => setFmt('pdf')} />
        <Choice on={fmt === 'json'} icon={<FileJson size={24} strokeWidth={1.9} />} title="원본 데이터 JSON" caption="앱이 남긴 값 그대로 · 사진은 표시만" onClick={() => setFmt('json')} />
      </div>
      <p className="ph-note">{PRIVACY}</p>
    </Sheet>
  )
}

function LimitSheet() {
  const load = useStore(app, (s) => s.load)
  const out = useStore(app, (s) => s.out)
  const wb = useStore(app, (s) => s.waybill)
  const incidents = useIncidents()
  const live = out?.verdict ?? verdictFor(load)
  // 3D 확인 칸과 같은 값: 주행 중은 출발 때 판정, 사건이 열려 있으면 사건 때 값
  const v = out?.mode === 'drive' && out.departVerdict ? out.departVerdict : live
  const open = wb ? incidents.find((i) => i.wb.id === wb.id && !i.resolvedAt) ?? null : null
  const sentence = open
    ? '사건 당시 한계는 ' + open.last.limitG.toFixed(2) + ' g' + (open.last.peakG !== null ? ', 받은 충격은 ' + open.last.peakG.toFixed(2) + ' g입니다' : '이고, 그보다 큰 충격을 받았습니다')
    : v.kind === 'none'
      ? '상차 정보가 없어 판정할 수 없습니다'
      : '이 짐은 ' + (v.wallCovers ? '옆·뒤로 ' : '급제동 ') + v.limit.toFixed(2) + ' g까지 견딜 수 있습니다'
  return (
    <Sheet title={v.wallCovers ? '옆·뒤로 견디는 힘' : '견딜 수 있는 급제동'} caption={'기준 ' + v.critLabel}>
      <div className="big">{sentence}</div>
      <div className="sub">
        {open ? <Chip tone="red">{STATUS_TITLE[open.kind]}</Chip> : <Chip tone={v.tone === 'green' && v.limit < v.crit ? 'orange' : v.tone}>{verdictWord(v.title)}</Chip>}
        {open ? '다시 조인 뒤 지금 장력으로 다시 판정합니다' : null}
      </div>
      <div className="ph-kv">
        <div>
          <span>{v.measured ? '장력 합 · 키트' : '장력 합'}</span>
          <b>{fmtN(v.sumT)} N</b>
        </div>
        <div>
          <span>마찰계수</span>
          <b>{v.mu.toFixed(2)}</b>
        </div>
        <div>
          <span>벨트 각도</span>
          <b>{Math.round(v.angleDeg)}°</b>
        </div>
        <div>
          <span>기준까지</span>
          <b>{v.perBeltNeedN !== null ? '벨트당 ' + fmtN(v.perBeltNeedN) + ' N 더' : '이미 충족'}</b>
        </div>
      </div>
      <HowTo />
    </Sheet>
  )
}

/** '계산 방법' 줄: 누르면 펼친다 (도움말은 두 줄까지, §10.7 · 식은 궁금한 사람만) */
function HowTo() {
  const [on, setOn] = useState(false)
  return (
    <div className="ph-how">
      <button type="button" className="ph-row one" aria-expanded={on} onClick={() => setOn((x) => !x)}>
        <span className="tx">
          <b>계산 방법</b>
        </span>
        <ChevronDown className="chev" size={20} strokeWidth={2} aria-hidden style={{ transform: on ? 'rotate(180deg)' : undefined }} />
      </button>
      {on && (
        <div className="bd">
          <p>한계 = 0.8 × 마찰 × (1 + 2 × 장력 합 × sin 각도 ÷ 짐 무게)</p>
          <p>키트가 없으면 장력은 벨트 표준 장력의 절반으로, 고무바 · 로프는 0으로 봅니다. 마찰은 재질별 낮은 값입니다.</p>
          <p>초록 판정은 계산 결과이며 안전을 보증하지는 않습니다.</p>
        </div>
      )}
    </div>
  )
}

const REASONS = ['관제 영상으로 짐이 제자리인 것을 봤음', '키트 값이 다시 기준 안으로 돌아옴', '다음 허브가 가까워 그때 점검']

function ReasonSheet({ truck }: { truck: string }) {
  const [pick, setPick] = useState<string | null>(null)
  const ok = () => {
    if (!pick) return
    const s = app.get()
    const t = findTruck(fleet(s, phone.get().hub, liveHubKey(s)), truck)
    const key = t?.live ? liveHubKey(s) : truck
    patchHub(key, { ack: { at: Date.now(), reason: pick } })
    if (t?.live) addOperatorNote('기록만 남기고 계속 · 이유: ' + pick)
    closeSheet()
    showToast('기록만 남겼습니다 · 운행은 그대로')
  }
  return (
    <Sheet title="기록만 남기고 계속" caption="이유를 고르면 운송장에 남습니다" footer={
        <Primary onClick={ok} disabled={!pick} why="이유를 하나 고르면 켜집니다">
          이유 남기고 계속
        </Primary>
      }
    >
      <div className="ph-list" role="radiogroup" aria-label="이유">
        {REASONS.map((r) => (
          <button key={r} type="button" className="ph-row one" role="radio" aria-checked={pick === r} onClick={() => setPick(r)}>
            <span className="tx">
              <b className="wrap">{r}</b>
            </span>
            <span className="radio" aria-hidden>
              <Check size={16} strokeWidth={3} />
            </span>
          </button>
        ))}
      </div>
      <p className="ph-note">앱은 차를 세우지 않습니다. 점검 정차는 관제 시스템에 요청합니다.</p>
    </Sheet>
  )
}

/** 허브 점검 기준: 운영 규칙 글은 목록 화면에 두지 않고 (i) 를 누르면 여기서 */
function RuleSheet() {
  return (
    <Sheet title="허브 점검 기준" caption="운영사가 정하는 기본값">
      <div className="ph-kv">
        <div>
          <span>첫 점검</span>
          <b>출발 뒤 80 km</b>
        </div>
        <div>
          <span>그 뒤</span>
          <b>3시간 또는 240 km마다</b>
        </div>
      </div>
      <p className="ph-note" style={{ fontSize: 15, color: 'var(--body)' }}>
        무인 트럭에는 운전자가 없어 짐 고정은 허브 점검자가 확인합니다. 봉인 화물은 점검하지 않습니다.
      </p>
      <p className="ph-note">앱은 차를 세우지 않습니다. 점검 정차는 관제 시스템에 요청하고, 점검 승인은 운송장에 남습니다.</p>
    </Sheet>
  )
}

function CloseSheet() {
  const id = useStore(app, (s) => s.waybill?.id ?? '')
  return (
    <Sheet
      title="운행을 끝낼까요?"
      caption={'운송장 ' + id}
      footer={
        <>
          <Primary
            onClick={() => {
              closeWaybill()
              closeSheet()
              showToast('운행을 끝냈습니다 · 기록에 남았습니다')
            }}
          >
            운행 종료
          </Primary>
          <Secondary onClick={closeSheet}>계속 운행</Secondary>
        </>
      }
    >
      <p className="ph-note" style={{ fontSize: 15, color: 'var(--body)' }}>
        이 운송장을 닫고 기록으로 넘깁니다. 내비도 같은 운송장을 쓰므로 함께 닫힙니다. 기록과 사진은 이 기기에 남습니다.
      </p>
    </Sheet>
  )
}

function ClearSheet() {
  return (
    <Sheet
      title="기록을 모두 지울까요?"
      caption="이 기기의 운송장 · 사진 · 점검 기록"
      footer={
        <>
          <Secondary
            onClick={() => {
              clearAll()
              clearPhone()
              closeSheet()
              showToast('이 기기의 기록을 지웠습니다')
            }}
          >
            모두 지우기
          </Secondary>
          <Primary onClick={closeSheet}>지우지 않기</Primary>
        </>
      }
    >
      <p className="ph-note" style={{ fontSize: 15, color: 'var(--body)' }}>
        지우면 되돌릴 수 없습니다. 협의에 쓸 기록이 있으면 먼저 그 건만 내보내세요.
      </p>
    </Sheet>
  )
}

export function Sheets() {
  const live = useStore(phone, (s) => s.sheet)
  // 닫힌 뒤에도 200 ms 동안 마지막 시트를 그린다 (아래로 내려가며 사라진다)
  const last = useRef(live)
  if (live) last.current = live
  const [on, leaving] = usePresence(!!live, 200)
  const sheet = live ?? (on ? last.current : null)
  if (!sheet) return null
  return <div className={'ph-sheet-wrap' + (leaving ? ' out' : '')}>{pick(sheet)}</div>
}

function pick(sheet: NonNullable<ReturnType<typeof phone.get>['sheet']>) {
  if (sheet.kind === 'export') return <ExportSheet id={sheet.id} />
  if (sheet.kind === 'limit') return <LimitSheet />
  if (sheet.kind === 'rule') return <RuleSheet />
  if (sheet.kind === 'reason') return <ReasonSheet truck={sheet.truck} />
  if (sheet.kind === 'close') return <CloseSheet />
  return <ClearSheet />
}
