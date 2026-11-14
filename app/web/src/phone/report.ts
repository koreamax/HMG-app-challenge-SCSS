/**
 * 이 건만 내보내기: PDF 보고서(인쇄 창 -> 'PDF로 저장') 와 원본 데이터 JSON.
 * 기록은 기사 본인 것이고, 협의가 필요할 때만 기사가 직접 내보낸다 (자동 전송 없음).
 */
import { exportWaybill, type Waybill } from '@/engine/records'
import { CARGO } from '@/engine/cargo'
import { bridge } from '@/runtime/native'
import { clock, dayLabel } from '@/ui/format'
import { STATUS_TITLE, entryLine, verdictWord, incidentsOf, placeWord, purposeWord, shiftWord, stepsFor, waybillSummary, type AlertDetail, type PhotoPurpose } from './derive'
import type { EventNote, LoadNote } from './state'

const dateTime = (ms: number) => dayLabel(ms) + ' ' + clock(ms)

export const PRIVACY = '기록은 기사 본인 것입니다. 협의가 필요할 때만 직접 내보냅니다.'

export type ExportCtx = {
  loadNote: LoadNote | null
  eventNotes: Record<string, EventNote>
  photoTags: Record<string, { purpose: PhotoPurpose; ref?: string }>
  details: Record<string, AlertDetail>
  liveKm: number | null
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

const TONE_HEX = { green: '#58c49a', orange: '#d9a13f', red: '#d5503f', grey: '#9aa1a9' } as const

/** 경고등 (화면의 Sign 과 같은 그림, v4): 상태 색 둥근 네모 + 흑연 모양. 초록 ● ✓ · 주황 ▲ ! · 빨강 ◆ ! · 회색 ○ – */
function signSvg(tone: keyof typeof TONE_HEX) {
  const c = TONE_HEX[tone]
  const g = '#14171b'
  const body =
    tone === 'green'
      ? `<circle cx="50" cy="50" r="47" fill="${g}"/><path d="M27 51 43.5 67.5 74 36" fill="none" stroke="${c}" stroke-width="11"/>`
      : tone === 'orange'
        ? `<path d="M50 4 97 92H3Z" fill="${g}"/><rect x="44" y="35" width="12" height="31" fill="${c}"/><rect x="44" y="72" width="12" height="11" fill="${c}"/>`
        : tone === 'red'
          ? `<path d="M50 2 98 50 50 98 2 50Z" fill="${g}"/><rect x="44" y="24" width="12" height="34" fill="${c}"/><rect x="44" y="64" width="12" height="12" fill="${c}"/>`
          : `<circle cx="50" cy="50" r="42" fill="none" stroke="${g}" stroke-width="10"/><rect x="28" y="44" width="44" height="12" fill="${g}"/>`
  return `<svg width="30" height="30" viewBox="0 0 100 100">${body}</svg>`
}

/** 사건마다: 체크한 단계 · 확인 안 한 단계 · 밀렸나요 답 · 조인 뒤 사진 */
function incidentRows(w: Waybill, ctx: ExportCtx) {
  return incidentsOf(w).map((inc) => {
    const d = ctx.details[w.id + ':' + inc.last.at] ?? ctx.details[w.id + ':' + inc.first.at] ?? null
    const note = ctx.eventNotes[inc.key] ?? null
    const steps = note?.steps ?? stepsFor(inc.kind, inc.last.measured, d?.loose ?? null, d?.shiftDir ?? null, w.input).map((s) => ({ title: s.title, done: false }))
    const after = w.entries.filter((e) => e.kind === 'photo' && ctx.photoTags[w.id + ':' + e.at]?.ref === inc.key)
    return { inc, d, note, steps, after }
  })
}

export function exportJson(w: Waybill, ctx: ExportCtx) {
  const base = exportWaybill(w)
  const iso = (ms: number) => new Date(ms).toISOString()
  return {
    ...base,
    entries: base.entries.map((e, i) => {
      const src = w.entries[i]
      if (src?.kind === 'photo') return { ...e, purpose: purposeWord(ctx.photoTags[w.id + ':' + src.at]?.purpose) }
      return e
    }),
    phone: {
      loadCheck: ctx.loadNote ? { at: iso(ctx.loadNote.at), eyeChecks: Object.fromEntries(Object.entries(ctx.loadNote.eye).map(([k, v]) => [k, v ? '확인함' : '확인 안 함'])), photos: ctx.loadNote.photos } : null,
      incidents: incidentRows(w, ctx).map(({ inc, note, steps, after }) => ({
        at: iso(inc.first.at),
        title: STATUS_TITLE[inc.kind],
        resolvedAt: inc.resolvedAt ? iso(inc.resolvedAt) : null,
        steps: note ? steps.map((s) => ({ step: s.title, result: s.done ? '확인함' : '확인 안 함' })) : null,
        movedAnswer: inc.moved === null ? null : inc.moved ? '밀림 있음' : '밀림 없음',
        afterPhotos: after.length,
      })),
    },
    privacy: PRIVACY,
  }
}

export function reportHtml(w: Waybill, ctx: ExportCtx): string {
  const sum = waybillSummary(w, ctx.liveKm)
  const load = sum.load
  const rows = incidentRows(w, ctx)
  const photos = w.entries.filter((e): e is Extract<typeof e, { kind: 'photo' }> => e.kind === 'photo')
  const font = new URL('/fonts/PretendardVariable.woff2', location.href).href
  const sq = (tone: keyof typeof TONE_HEX | null) => `<i class="sq" style="background:${tone ? TONE_HEX[tone] : '#b3bac3'}"></i>`
  const loadTone = load?.tone ?? 'grey'
  // 칸: 이름(caption) + 상태 점 → 값(잉크) → 보조. 상태는 점이 전한다 (값을 상태 색으로 칠하지 않는다)
  const cell = (name: string, value: string, sub: string, tone: keyof typeof TONE_HEX | null) =>
    `<div class="cell"><span>${esc(name)}${tone ? `<i class="dot" style="background:${TONE_HEX[tone]}"></i>` : ''}</span><b>${esc(value)}</b><small>${esc(sub)}</small></div>`
  const eye = ctx.loadNote ? Object.entries(ctx.loadNote.eye).map(([k, v]) => `<li><b class="${v ? 'ok' : 'no'}">${v ? '확인함' : '확인 안 함'}</b> ${esc(k)}</li>`).join('') : ''
  const inc = rows
    .map(({ inc: i, d, note, steps, after }) => {
      const shift = i.kind === 'lost' ? null : shiftWord(i.last.shiftMm, d?.shiftDir ?? null)
      const g = i.last.peakG !== null ? `충격 ${i.last.peakG.toFixed(2)} g · 한계 ${i.last.limitG.toFixed(2)} g (${i.last.measured ? '키트 측정' : '속도로 추정'})` : '충격 값 없음'
      const st = steps
        .map((s, k) => `<li><em>${k + 1}</em> ${esc(s.title)} <b class="${note ? (s.done ? 'ok' : 'no') : 'wait'}">${note ? (s.done ? '확인함' : '확인 안 함') : '조치 전'}</b></li>`)
        .join('')
      const pics = after.map((p) => (p.kind === 'photo' ? `<img src="${p.dataUrl}" alt="조인 뒤 사진">` : '')).join('')
      return `<section class="inc">
        <h3>${sq('red')} ${esc(STATUS_TITLE[i.kind])} <span>${esc(dateTime(i.first.at))} · ${esc(placeWord(i, d))}</span></h3>
        <p>${esc(g)}${shift ? ' · 짐 ' + esc(shift) + ' 움직임' : ''}</p>
        <ol>${st}</ol>
        <p class="muted">${i.resolvedAt ? '다시 조임 기록 ' + clock(i.resolvedAt) : '아직 조치 기록 없음'}${i.moved !== null ? ' · 기사 확인: ' + (i.moved ? '밀림 있음' : '밀림 없음') : ''}</p>
        ${pics ? `<div class="pics">${pics}</div>` : ''}
      </section>`
    })
    .join('')
  const lines = w.entries
    .map((e) => {
      const l = entryLine(e, e.kind === 'photo' ? ctx.photoTags[w.id + ':' + e.at]?.purpose : undefined)
      return `<tr><td class="tm">${clock(e.at)}</td><td>${sq(l.tone)}</td><td><b>${esc(l.title)}</b>${l.detail ? `<br><span>${esc(l.detail)}</span>` : ''}</td></tr>`
    })
    .join('')
  const gallery = photos.map((p) => `<figure><img src="${p.dataUrl}" alt=""><figcaption>${esc(purposeWord(ctx.photoTags[w.id + ':' + p.at]?.purpose))} · ${clock(p.at)}</figcaption></figure>`).join('')
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>적재 기록 ${esc(w.id)}</title>
<style>
@font-face{font-family:'Pretendard';font-weight:100 900;src:url('${font}') format('woff2')}
@page{size:A4;margin:14mm}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Pretendard',sans-serif;color:#3a414a;font-size:10pt;line-height:1.5;font-variant-numeric:tabular-nums;-webkit-print-color-adjust:exact;print-color-adjust:exact}
header{display:flex;align-items:center;gap:14px;padding-bottom:14px;border-bottom:1px solid #d3d7dc}
.sign{flex:none;width:52px;height:52px;display:grid;place-items:center;border-radius:12px;background:${TONE_HEX[loadTone]};box-shadow:inset 0 0 0 1px rgba(0,0,0,.06)}
@media screen{body{max-width:860px;margin:0 auto;padding:32px 28px;background:#fff}html{background:#e2e5e9}}
header .t{flex:1;min-width:0}
header h1{font-size:16pt;font-weight:700;line-height:1.25;letter-spacing:-0.01em;color:#121519}
header p{margin-top:2px;color:#545d6a;font-size:9pt}
.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:14px 0 4px}
.cell{background:#eef0f2;border-radius:10px;padding:10px 12px 10px;display:flex;flex-direction:column;gap:4px}
.cell span{display:flex;align-items:center;font-size:8.5pt;font-weight:600;color:#545d6a}
.cell .dot{width:7px;height:7px;border-radius:50%;margin-left:auto}
.cell b{font-size:14pt;font-weight:700;line-height:1.15;letter-spacing:-0.01em;color:#121519}
.cell small{font-size:8pt;color:#545d6a}
h2{font-size:11.5pt;font-weight:600;color:#121519;margin:20px 0 6px;padding-bottom:5px;border-bottom:1px solid #d3d7dc}
.sq{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:5px;vertical-align:1px}
ul.eye{list-style:none;display:flex;gap:18px}
b.ok{color:#0a6b45;font-weight:600}b.no{color:#b3241e;font-weight:600}b.wait{color:#545d6a;font-weight:600}
.inc{background:#f6f7f8;border-radius:10px;padding:12px 14px;margin-bottom:8px;break-inside:avoid}
.inc h3{font-size:11pt;font-weight:600;color:#121519}
.inc h3 span{font-weight:400;color:#545d6a;font-size:9pt;margin-left:6px}
.inc ol{list-style:none;margin:6px 0}
.inc li{padding:4px 0;border-top:1px solid #e2e5e9}
.inc li em{font-style:normal;display:inline-block;width:16px;height:16px;line-height:16px;border-radius:50%;text-align:center;font-size:8pt;font-weight:700;background:#16191e;color:#fff;margin-right:6px}
.inc li b{float:right}
.muted{color:#545d6a;font-size:9pt}
.pics{display:flex;gap:6px;margin-top:6px}.pics img{width:120px;height:90px;object-fit:cover;border-radius:6px}
table{width:100%;border-collapse:collapse}
td{padding:6px 4px;border-top:1px solid #e2e5e9;vertical-align:top;font-size:9.5pt}
tr:first-child td{border-top:0}
td.tm{width:44px;color:#545d6a;font-weight:600}
td b{font-weight:600;color:#121519}
td span{color:#545d6a}
.gal{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
figure{break-inside:avoid}figure img{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:6px}
figcaption{margin-top:2px;font-size:8.5pt;color:#545d6a}
footer{margin-top:20px;padding-top:8px;border-top:1px solid #d3d7dc;font-size:8pt;color:#545d6a}
</style></head><body>
<header><div class="sign">${signSvg(loadTone)}</div><div class="t"><h1>적재 기록 · 운송장 ${esc(w.id)}</h1><p>${esc(dateTime(w.createdAt))} 상차 · ${w.closedAt ? esc(dateTime(w.closedAt)) + ' 운행 종료' : '운행 중'} · 적재적소 휴대폰에서 기사가 이 건만 내보냄</p></div></header>
<div class="grid">
${cell('상차 판정', load ? verdictWord(load.title) : '판정 불가', load ? '견딜 수 있는 급제동 ' + load.limit.toFixed(2) + ' g · 기준 ' + load.crit.toFixed(2) + ' g' : '상차 정보 없음', load ? load.tone : 'grey')}
${cell('사건', sum.incidents.length + '건', sum.incidents.length ? sum.incidents.map((i) => STATUS_TITLE[i.kind]).join(' · ') : '없음', sum.incidents.length ? 'red' : null)}
${cell('다시 조임', sum.relash + '번', '사건 뒤 조치 기록', null)}
${cell('거리', sum.km.toFixed(1) + ' km', '상차 뒤 달린 거리', null)}
</div>
<h2>상차</h2>
<p>${esc(CARGO[w.input.kind].label)} ${w.input.massKg} kg · ${w.input.beltType === 'ratchet' ? '라쳇 벨트' : '고무바·로프'} ${w.input.belts}개 · 앞벽 ${w.input.frontWall ? '붙임' : '안 붙임'}</p>
${eye ? `<ul class="eye">${eye}</ul>` : '<p class="muted">눈으로 확인 기록 없음</p>'}
<h2>사건과 조치</h2>
${inc || '<p class="muted">사건 없음</p>'}
<h2>시간 줄</h2>
<table>${lines}</table>
${gallery ? `<h2>사진 ${photos.length}장</h2><div class="gal">${gallery}</div>` : ''}
<footer>초록 판정은 계산 결과이며 안전을 보증하지는 않습니다. 짐 고정 책임은 운전자에게 있습니다.<br>${esc(PRIVACY)}<br>만든 시각 ${esc(dateTime(Date.now()))}</footer>
</body></html>`
}

/** 파일로 남긴다 (Android 껍데기면 기기 저장, 브라우저면 내려받기). 저장된 곳 또는 null */
export function saveText(name: string, mime: string, text: string): string | null {
  const b = bridge()
  if (b) {
    try {
      return b.saveFile(name, mime, text) || null
    } catch {
      return null
    }
  }
  const url = URL.createObjectURL(new Blob([text], { type: mime }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 4000)
  return '내려받기'
}

/**
 * 휴대폰 브라우저면 Android 공유 창으로 (파일 하나). 공유가 안 되는 곳(PC 시연 화면 · 앱 껍데기 WebView)이면 false.
 * 기사가 고른 곳으로만 나간다 (앱이 스스로 보내지 않는다).
 */
export async function shareFile(name: string, mime: string, text: string): Promise<boolean> {
  try {
    if (bridge() || typeof navigator.share !== 'function' || !matchMedia('(pointer: coarse)').matches) return false
    const file = new File([text], name, { type: mime })
    if (navigator.canShare && !navigator.canShare({ files: [file] })) return false
    await navigator.share({ files: [file], title: name })
    return true
  } catch {
    return false
  }
}

/** 숨은 틀에 보고서를 그리고 인쇄 창을 연다 (Chrome: 'PDF로 저장') */
export function printHtml(html: string): Promise<boolean> {
  return new Promise((resolve) => {
    const f = document.createElement('iframe')
    f.setAttribute('aria-hidden', 'true')
    f.style.cssText = 'position:fixed;left:-10000px;top:0;width:820px;height:1160px;border:0'
    f.srcdoc = html
    f.onload = async () => {
      const doc = f.contentDocument
      const win = f.contentWindow
      try {
        await Promise.all(Array.from(doc?.images ?? []).map((i) => (i.complete ? null : new Promise((r) => ((i.onload = r), (i.onerror = r))))))
        await (doc as Document & { fonts?: FontFaceSet })?.fonts?.ready
        win?.focus()
        win?.print()
        resolve(true)
      } catch {
        resolve(false)
      }
      window.setTimeout(() => f.remove(), 1500)
    }
    document.body.appendChild(f)
  })
}
