// 휴대폰 판 화면 찍기 (화면 없는 Chrome, 따로 만든 프로필). node phone-shots.mjs [base]
// 390 x 844 (deviceScaleFactor 2) 로 모든 화면을 찍어 shots/phone/ 에 남긴다. ONLY=load,event,... 로 일부만.
// 시연 대본(kit-slide · kitless-brake · kit-lost)으로 실제 사건을 만들어 알림 -> 사건 -> 다시 묶기를 지난다.
import puppeteer from 'puppeteer-core'
import { mkdirSync, writeFileSync } from 'node:fs'

const BASE = process.argv[2] ?? 'http://localhost:5174/'
const HERO_B64 = (await import('node:fs')).readFileSync('C:/Users/DANHA/DigitalTwinWorkspace/IsaacTwin/sim_real_truck/results/hero/hero_bed.png').toString('base64')
const OUT = new globalThis.URL('./shots/phone/', import.meta.url)
mkdirSync(OUT, { recursive: true })
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const only = process.env.ONLY ? process.env.ONLY.split(',') : null
const run = (k) => !only || only.includes(k)

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--autoplay-policy=no-user-gesture-required', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--mute-audio', '--window-size=390,844'],
  userDataDir: 'C:/Users/DANHA/AppData/Local/Temp/jaejeok-phone-chrome',
  defaultViewport: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: false, hasTouch: false },
})
const page = await browser.newPage()
// 화면 사진은 멈춘 모습으로 (움직임 확인은 motion-check.mjs): 숫자 세기 · 색 섞임 · 3D 쉼 흔들림이 사진 도중에 찍히지 않게
await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }])
const errors = []
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') errors.push('console.' + m.type() + ': ' + m.text().slice(0, 300))
})
await page.evaluateOnNewDocument(() => {
  // 인쇄 창은 막는다 (화면 없는 Chrome 이 멈추지 않게)
  window.print = () => {
    window.__printed = (window.__printed ?? 0) + 1
  }
  // 개발 서버의 HMR 연결을 막는다: 다른 사람이 파일을 고쳐도 찍는 도중 페이지가 다시 읽히지 않게 (앱은 WebSocket 을 쓰지 않는다)
  const Real = window.WebSocket
  window.WebSocket = function (url, proto) {
    if (String(proto ?? '').includes('vite-hmr')) return { readyState: 0, send() {}, close() {}, addEventListener() {}, removeEventListener() {} }
    return new Real(url, proto)
  }
})
const S = (ms) => new Promise((r) => setTimeout(r, ms))
const log = []
const note = (s) => {
  log.push(s)
  console.log(s)
}
const path = (name) => new globalThis.URL(name + '.png', OUT).pathname.slice(1)
async function shot(name) {
  await S(350)
  await page.screenshot({ path: path(name) })
  note('shot ' + name)
}
/** 보이는 단추 · 링크 중 글이 맞는 것을 누른다 (가장 안쪽) */
async function tap(text, sel = 'button, a, [role=checkbox], [role=radio]') {
  const ok = await page.evaluate(
    (text, sel) => {
      const els = [...document.querySelectorAll(sel)].filter((e) => (e.textContent ?? '').includes(text) || e.getAttribute('aria-label') === text)
      const vis = els.filter((e) => {
        const r = e.getBoundingClientRect()
        return r.width > 0 && r.height > 0
      })
      const pick = vis.sort((a, b) => (a.textContent ?? '').length - (b.textContent ?? '').length)[0]
      if (!pick || pick.disabled) return false
      pick.click()
      return true
    },
    text,
    sel,
  )
  if (!ok) note('  !! no button: ' + text)
  await S(250)
  return ok
}
async function scrollMain(to) {
  await page.evaluate((to) => {
    const els = [...document.querySelectorAll('.ph-scroll')]
    const el = els[els.length - 1]
    if (el) el.scrollTop = to === 'end' ? el.scrollHeight : to
  }, to)
  await S(300)
}
const st = () =>
  page.evaluate(() => {
    const s = window.__jj.app.get()
    const p = window.__jjPhone.phone.get()
    return { mode: s.out?.mode, title: s.out?.status.title, alert: s.out?.alert?.kind ?? null, wb: s.waybill?.id, entries: s.waybill?.entries.length, kmh: Math.round(s.sim.speedKmh), tab: p.tab, notif: !!p.notif, scen: s.scenario }
  })
async function open(q = '') {
  await page.goto(BASE + '?app=phone&fresh&device' + q, { waitUntil: 'networkidle0' })
  await page.waitForFunction(() => !!window.__jj && !!window.__jjPhone)
  await S(900)
}
/** 사진 하나를 카메라 입력에 넣는다 (그린 짐 사진, 1600 x 1200 JPEG) */
async function feedPhoto(tag, seed = 1) {
  await page.evaluate((b) => { window.__heroB64 = b }, HERO_B64)
  const ok = await page.evaluate(
    async (tag, seed) => {
      const input = document.querySelector('input[data-photo="' + tag + '"]')
      if (!input) return false
      // 사진: Omniverse RTX 실사 렌더(같은 PV5 적재함)를 사진처럼 잘라 쓴다. 장면마다 자르는 자리를 조금 바꾼다
      const img = new Image()
      img.src = 'data:image/png;base64,' + window.__heroB64
      await img.decode()
      const cv = document.createElement('canvas')
      cv.width = 1600
      cv.height = 1200
      const g = cv.getContext('2d')
      const k = seed % 3
      const sw = 1440 - k * 60
      const sh = sw * 0.75
      g.drawImage(img, 240 + k * 50, 0 + k * 20, sw, sh, 0, 0, 1600, 1200)
      const blob = await new Promise((res) => cv.toBlob(res, 'image/jpeg', 0.9))
      const file = new File([blob], 'cargo.jpg', { type: 'image/jpeg' })
      const dt = new DataTransfer()
      dt.items.add(file)
      input.files = dt.files
      input.dispatchEvent(new Event('change', { bubbles: true }))
      return true
    },
    tag,
    seed,
  )
  if (!ok) note('  !! no photo input: ' + tag)
  await S(900)
}
/** 대본을 돌리고 사건(또는 정차)까지 기다린다 */
async function scenario(key, until = (s) => !!s.alert, maxS = 60) {
  await page.evaluate((k) => window.__jj.playScenario(k), key)
  for (let i = 0; i < maxS * 2; i++) {
    await S(500)
    const s = await st()
    if (until(s)) return s
  }
  note('  !! scenario timeout ' + key + ' ' + JSON.stringify(await st()))
  return st()
}
async function arrive() {
  await page.evaluate(() => window.__jj.playScenario('arrive'))
  for (let i = 0; i < 40; i++) {
    await S(500)
    if ((await st()).mode === 'park') break
  }
  await S(800)
}

// ── 1. 상차 정보 -> 3D 확인 -> 짐 사진 -> 상차 끝 ──
if (run('load')) {
  await open()
  await shot('01_load_input')
  await tap('팔레트')
  await tap('약 500 kg')
  await tap('벨트 하나 더하기')
  await tap('벨트 하나 더하기')
  await shot('02_load_input_changed')
  await scrollMain('end')
  await tap('앞벽에 빈틈없이')
  await shot('03_load_input_wall')
  await tap('확인하고 3D로 보기')
  await S(2500)
  await shot('04_check3d')
  await tap('위에서')
  await S(900)
  await shot('05_check3d_top')
  await tap('3D')
  await scrollMain(380)
  await shot('06_check3d_tiles')
  await scrollMain('end')
  await feedPhoto('load', 1)
  await scrollMain('end')
  await shot('07_check3d_photo')
  await tap('고리 체결')
  await tap('상차 끝 · 운송장에 남기기')
  await S(300)
  await shot('08_check3d_done')
  await page.evaluate(() => window.__jjPhone.openSheet({ kind: 'limit' }))
  await shot('09_limit_sheet')
  await page.evaluate(() => window.__jjPhone.closeSheet())
  await tap('상차 정보 고치기')
  await S(400)
  await shot('10_load_edit')
  await tap('뒤로')
}

// ── 2. 키트 사건: 바 2개 급제동 -> 알림 -> 사건 -> 다시 묶기 ──
if (run('event')) {
  if (!run('load')) await open()
  const s = await scenario('kit-slide', (s) => !!s.alert, 70)
  note('  kit-slide: ' + JSON.stringify(s))
  await S(1200)
  // 기사 휴대폰은 운전 중 잠금 (알림은 서면)
  await shot('11a_lock_driving')
  await arrive()
  await shot('11_notification')
  await tap('짐이 밀렸습니다', '.ph-notif button, .ph-ecard')
  await S(1500)
  await shot('12_event_kit')
  await scrollMain(300)
  await shot('13_event_kit_steps')
  await tap('뒤 바 다시 조이기')
  await scrollMain('end')
  await feedPhoto('after', 2)
  await scrollMain('end')
  await shot('14_event_kit_photo')
  await tap('다시 조였어요')
  await S(600)
  await shot('15_after_relash')
  await tap('키트')
  await S(1500)
  await shot('15b_check3d_kit')
  await tap('3D')
}

// ── 3. 키트 없음 급제동 -> '짐이 실제로 밀렸나요?' ──
if (run('kitless')) {
  if (!run('load') && !run('event')) await open()
  await page.evaluate(() => window.__jj.confirmLoad({ kind: 'appliance', massKg: 300, belts: 2, beltType: 'ratchet', frontWall: false }))
  const s = await scenario('kitless-brake', (s) => !!s.alert, 60)
  note('  kitless: ' + JSON.stringify(s))
  await arrive()
  await page.evaluate(() => window.__jjPhone.switchTab('records'))
  await S(500)
  await shot('16_records_unread')
  await tap('확인 필요', '.ph-ecard')
  await S(1500)
  await shot('17_event_kitless')
  await scrollMain('end')
  await tap('밀림 있음')
  await S(500)
  await shot('18_event_kitless_moved')
  await tap('다시 조였어요')
  await S(600)
}

// ── 4. 짐 이탈 의심 -> 신고 줄 ──
if (run('lost')) {
  if (!run('load') && !run('event') && !run('kitless')) await open()
  const s = await scenario('kit-lost', (s) => s.alert === 'lost', 90)
  note('  lost: ' + JSON.stringify(s))
  await S(800)
  // 운전 중 잠금: 짐 이탈 의심이면 신고 전화 두 줄만
  await shot('19a_lock_lost')
  await arrive()
  await shot('19_notification_lost')
  await tap('짐 이탈 의심', '.ph-notif button, .ph-ecard')
  await S(1500)
  await shot('20_event_lost')
  await scrollMain('end')
  await shot('21_event_lost_bottom')
}

// ── 5. 기록 · 운송장 · 내보내기 ──
if (run('records')) {
  await page.evaluate(() => window.__jjPhone.switchTab('records'))
  await page.evaluate(() => window.__jjPhone.switchTab('records'))
  await S(500)
  await shot('22_records')
  await tap('사건 있음')
  await shot('23_records_events')
  await tap('전체')
  const first = await page.evaluate(() => document.querySelector('.ph-list .ph-row')?.textContent ?? '')
  note('  first waybill row: ' + first)
  await page.evaluate(() => document.querySelector('.ph-list button.ph-row')?.click())
  await S(700)
  await shot('24_waybill')
  await scrollMain(520)
  await shot('25_waybill_timeline')
  await scrollMain('end')
  await shot('26_waybill_photos')
  if (await page.evaluate(() => !!document.querySelector('.ph-pgrid button'))) {
    await page.evaluate(() => document.querySelector('.ph-pgrid button')?.click())
    await S(400)
    await shot('26b_photo_viewer')
    await tap('닫기')
  }
  if (await tap('운행 종료')) {
    await S(400)
    await shot('26c_close_sheet')
    await page.evaluate(() => window.__jjPhone.closeSheet())
  }
  await tap('이 건만 내보내기')
  await S(400)
  await shot('27_export_sheet')
  await tap('원본 데이터 JSON')
  await shot('28_export_json')
  // PDF 보고서 글을 따로 그려 본다
  const html = await page.evaluate(async () => {
    const m = await import('/src/phone/report.ts')
    const s = window.__jj.app.get()
    const p = window.__jjPhone.phone.get()
    const w = s.waybill ?? s.history[s.history.length - 1]
    return m.reportHtml(w, { loadNote: p.loadNotes[w.id] ?? null, eventNotes: p.eventNotes, photoTags: p.photoTags, details: p.details, liveKm: s.out?.kmSinceLoad ?? null })
  })
  writeFileSync(new globalThis.URL('report.html', OUT), html)
  await page.evaluate(() => window.__jjPhone.closeSheet())
}

// ── 6. 설정 · 역할 -> 허브 ──
if (run('hub')) {
  if (only && !run('records') && !run('lost')) await open()
  await page.evaluate(() => window.__jjPhone.switchTab('settings'))
  await S(400)
  await shot('29_settings')
  await tap('운영자')
  await S(300)
  await shot('30_settings_operator')
  await page.evaluate(() => window.__jjPhone.switchTab('hub'))
  await S(600)
  await shot('31_hub')
  await tap('사건', '.ph-count')
  await shot('32_hub_filter')
  await tap('사건', '.ph-count')
  await page.evaluate(() => [...document.querySelectorAll('.ph-truck')].find((b) => b.textContent.includes('83아 5521'))?.click())
  await S(1500)
  await shot('33_truck')
  await scrollMain('end')
  await shot('34_truck_rows')
  await tap('기록만 남기고 계속')
  await S(400)
  await shot('35_reason_sheet')
  await page.evaluate(() => window.__jjPhone.closeSheet())
  await tap('다음 허브에서 점검 정차 요청')
  await S(500)
  await shot('36_truck_requested')
  await tap('허브 도착 · 점검 시작')
  await S(600)
  await shot('37_inspect')
  for (const t of ['짐 제자리', '바 다시 조임과 키트 값', '고리 체결', '모서리 보호대']) await tap(t, '[role=checkbox]')
  await feedPhoto('inspect', 3)
  await feedPhoto('inspect', 4)
  await scrollMain('end')
  await shot('38_inspect_ready')
  await tap('점검 끝 · 운행 재개 승인')
  await S(900)
  await shot('39_truck_approved')
  await tap('점검 기록 보기')
  await S(500)
  await shot('39b_inspect_readonly')
  await tap('뒤로')
  await tap('뒤로')
  await S(400)
  await shot('40_hub_after')
  // 기록만 남기고 계속 (이유 고르기)
  await page.evaluate(() => [...document.querySelectorAll('.ph-truck')].find((b) => b.textContent.includes('97바 3307'))?.click())
  await S(1200)
  await tap('기록만 남기고 계속')
  await S(300)
  await tap('관제 영상으로 짐이 제자리인 것을 봤음')
  await tap('이유 남기고 계속')
  await S(500)
  await scrollMain('end')
  await shot('40b_truck_ack')
  await tap('뒤로')
  await S(300)
}

// ── 7. LIVE 트럭: 대본 사건이 허브 목록 맨 위로 ──
if (run('live')) {
  if (only && !run('hub')) {
    await open('&role=operator&tab=hub')
  }
  await page.evaluate(() => window.__jjPhone.switchTab('hub'))
  const s = await scenario('kit-loose', (s) => !!s.alert, 90)
  note('  kit-loose: ' + JSON.stringify(s))
  await S(1500)
  await page.evaluate(() => window.__jjPhone.phone.set({ notif: null }))
  await shot('41_hub_live_red')
  await page.evaluate(() => document.querySelector('.ph-truck')?.click())
  await S(1500)
  await shot('42_truck_live')
  await tap('다음 허브에서 점검 정차 요청')
  await S(400)
  await shot('43_truck_live_requested')
  await arrive()
  await tap('허브 도착 · 점검 시작')
  await S(500)
  for (const t of ['짐 제자리', '바 다시 조임과 키트 값', '고리 체결', '모서리 보호대']) await tap(t, '[role=checkbox]')
  await feedPhoto('inspect', 5)
  await feedPhoto('inspect', 6)
  await scrollMain('end')
  await shot('44_inspect_live')
  await tap('점검 끝 · 운행 재개 승인')
  await S(1200)
  await shot('45_truck_live_approved')
  const entries = await page.evaluate(() => window.__jj.app.get().waybill?.entries.map((e) => e.kind + (e.text ? ':' + e.text : '')).slice(-6))
  note('  live entries: ' + JSON.stringify(entries))
}

// ── 8. 시연 무대: 내비 + 폰 같은 운송장 ──
if (run('stage')) {
  await page.setViewport({ width: 1800, height: 810, deviceScaleFactor: 1 })
  await page.goto(BASE + '?app=stage&fresh', { waitUntil: 'networkidle0' })
  await page.waitForFunction(() => !!window.__jj && !!window.__jjPhone)
  await S(1500)
  await page.screenshot({ path: path('50_stage_start') })
  // 폰 화면에서 상차를 넣으면 내비에 바로 보인다 (같은 운송장)
  await page.evaluate(() => {
    const b = (t) => [...document.querySelectorAll('.ph-root button')].find((x) => x.textContent.includes(t))
    b('박스')?.click()
  })
  await S(300)
  await page.evaluate(() => [...document.querySelectorAll('.ph-root button')].find((x) => x.textContent.includes('확인하고 3D로 보기'))?.click())
  await S(2500)
  note('  stage load from phone: ' + JSON.stringify(await page.evaluate(() => window.__jj.app.get().load)))
  await page.screenshot({ path: path('51_stage_loaded') })
  const s = await scenario('kit-slide', (s) => !!s.alert, 70)
  note('  stage kit-slide: ' + JSON.stringify(s))
  await S(1500)
  await page.screenshot({ path: path('52_stage_event') })
  await arrive()
  await S(1500)
  await page.screenshot({ path: path('53_stage_parked') })
  note('shot stage 50-53')
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 })
}

// ── 9. 보고서 (PDF 로 인쇄될 글) ──
if (run('report')) {
  const p2 = await browser.newPage()
  await p2.setViewport({ width: 820, height: 1160, deviceScaleFactor: 1 })
  await p2.goto(new globalThis.URL('report.html', OUT).href, { waitUntil: 'networkidle0' }).catch(() => {})
  await S(600)
  await p2.screenshot({ path: path('60_report'), fullPage: true })
  await p2.close()
  note('shot 60_report')
}

writeFileSync(new globalThis.URL('log.txt', OUT), log.join('\n') + '\n\nerrors:\n' + errors.join('\n'))
console.log('\nerrors (' + errors.length + '):\n' + errors.slice(0, 30).join('\n'))
await browser.close()
