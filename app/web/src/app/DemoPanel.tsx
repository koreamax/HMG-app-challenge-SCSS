/**
 * 시연 패널 (발표자용, 차 화면 밖). 기획서 시연: "상차 3D 확인 -> 주행 중 색 하나 -> 급제동 뒤 한 문장 음성 -> '네' -> 쉼터 경유지 -> 정차 후 3D 다시 묶기"
 * 를 키트 없는 모드와 키트 모드(Isaac Sim PV5 기록 재생)로. 실제 차(Android)에서는 디버그 빌드에서만 보인다.
 * 모양은 앱 밤 토큰 그대로 (Obsidian 어두운 면, 고른 것 = --select 면, 누를 것만 파랑). 시연 무대 오른쪽 접는 서랍 안에 뜬다. 발표자만 보므로 글자는 작다.
 */
import { useState, type ReactNode } from 'react'
import { answerYes, app, kitControl, playScenario, simControl } from '@/runtime/runtime'
import { useStore } from '@/runtime/store'
import { ISAAC } from '@/runtime/kit'
import { KIT_RUN, type ScenarioKey } from '@/runtime/sim'
import { nav, setNavTheme, themeOf, useNav } from '@/nav/state'
import { SignShape } from '@/ui/parts'
import './demo.css'

function Btn({ children, onClick, on, accent, disabled, wide }: { children: ReactNode; onClick: () => void; on?: boolean; accent?: boolean; disabled?: boolean; wide?: boolean }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} aria-pressed={on} className={'dp-btn' + (accent ? ' accent' : '') + (wide ? ' wide' : '')}>
      {children}
    </button>
  )
}

function Sec({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="dp-sec">
      <div className="dp-sec-head">
        <span>{title}</span>
        {aside}
      </div>
      {children}
    </section>
  )
}

/** 대본. 부제는 Isaac Sim PV5 기록의 잰 값 */
const SCENES: { key: ScenarioKey; label: string; sub: string }[] = [
  { key: 'kitless-brake', label: '① 키트 없음 · 고속도로 급제동', sub: '80 km/h → 급제동 → 확인 필요 → 쉼터 질문' },
  { key: 'kit-slide', label: '② 키트 · 라쳇 2개 급제동', sub: '0.89 g → 짐 11 cm 밀림 → 쉼터 질문' },
  { key: 'kit-hold', label: '③ 키트 · 라쳇 4개 급제동', sub: '0.88 g → 제자리 (사건 없음)' },
  { key: 'kit-loose', label: '④ 키트 · 주행 중 앞 바 풀림', sub: '회전 · 제동 0.78 g → 바 풀림 · 짐 밀림' },
  { key: 'kit-rubber', label: '⑤ 키트 · 고무바 제동', sub: '0.62 g → 짐 35 cm 밀림' },
  { key: 'kit-lost', label: '⑥ 키트 · 고무바 키 큰 짐 1.8 m', sub: '램프 회전 0.46 g → 넘어져 떨어짐 → 짐 이탈 의심' },
  { key: 'caution', label: '방지턱 앞 안내', sub: '짐 고정이 약할 때 300 m 앞' },
  { key: 'kitless-turn', label: '키트 없음 · 급한 회전', sub: '40 km/h, 앞바퀴 7°' },
]
/** 돌고 있는 대본의 이름 (sim.scenarioLabel) */
const PLAYING: Partial<Record<ScenarioKey, string>> = {
  'kitless-brake': '키트 없음 · 고속도로 급제동',
  'kitless-turn': '키트 없음 · 급한 회전',
  caution: '방지턱 앞 안내',
  arrive: '쉼터 도착 · 정차',
  ...Object.fromEntries(Object.entries(KIT_RUN).map(([k, v]) => [k, v.label])),
}

export function DemoPanel({ onClose }: { onClose?: () => void }) {
  const sim = useStore(app, (s) => s.sim)
  const out = useStore(app, (s) => s.out)
  const kit = useStore(app, (s) => s.kit)
  const scenario = useStore(app, (s) => s.scenario)
  const speech = useStore(app, (s) => s.speech)
  const load = useStore(app, (s) => s.load)
  const nativeNight = useStore(app, (s) => s.native?.night)
  const navTheme = useNav((s) => themeOf(s, nativeNight))
  const navView = useNav((s) => s.view)
  const [run, setRun] = useState(ISAAC.runs[1].key)
  const f = kit.snap?.frame
  const st = out?.status
  const est = out?.est
  return (
    <div className="jj dp" data-theme="night">
      <div className="dp-head">
        <div>
          <b>시연 패널</b>
          <span>발표자용 · 차 화면 밖 · 시연 빌드</span>
        </div>
        {onClose && (
          <button type="button" className="dp-x" onClick={onClose}>
            접기
          </button>
        )}
      </div>

      <div className={'dp-state tone-' + (st?.tone ?? 'grey')}>
        <div className="dp-state-top">
          <span className="dp-lamp" aria-hidden>
            <SignShape tone={st?.tone ?? 'grey'} />
          </span>
          <b>{st ? st.title : '—'}</b>
          <span>{out?.mode === 'drive' ? 'D 주행' : 'P 정차'}</span>
        </div>
        <div className="dp-grid tnum">
          <span>속도 {sim.speedKmh.toFixed(0)} km/h</span>
          <span>신호 {est ? est.speedHz.toFixed(0) : 0} Hz</span>
          <span>제동 {est?.decel != null ? est.decel.toFixed(2) + ' g' : '—'}</span>
          <span>회전 {est?.lat != null ? est.lat.toFixed(2) + ' g' : '—'}</span>
          <span>근거 {est?.source === 'kit' ? '키트 값' : est?.source === 'speed' ? '속도 × 1.25' : '—'}</span>
          <span>한계 {out ? (out.departVerdict ?? out.verdict).limit.toFixed(2) + ' g' : '—'}</span>
          {f && (
            <>
              <span>앞 {f.c1 != null ? Math.round(f.c1) : '—'} · 뒤 {f.c2 != null ? Math.round(f.c2) : '—'} N</span>
              <span>짐 이동 {Math.round(f.shiftMm)} mm</span>
            </>
          )}
        </div>
        {scenario && (
          <div className="dp-line">
            대본 진행 중 · <b>{scenario}</b>
          </div>
        )}
        {speech.line && (
          <div className="dp-line">
            말하는 중 · <b>{speech.line}</b>
          </div>
        )}
      </div>

      <div className="dp-yes">
        <Btn accent={speech.listening} wide onClick={answerYes}>
          “네” 라고 답하기{speech.listening ? ' · 듣는 중' : ''}
          <small>음성 인식이 불안정할 때 스크립트 입력 (기획서)</small>
        </Btn>
      </div>

      <Sec title="내비 화면">
        <div className="dp-row2">
          <Btn on={navTheme === 'day'} onClick={() => setNavTheme('day')}>
            낮
          </Btn>
          <Btn on={navTheme === 'night'} onClick={() => setNavTheme('night')}>
            밤
          </Btn>
        </div>
        <div className="dp-row3">
          {(['3d', 'top', 'kit'] as const).map((v) => (
            <Btn key={v} on={navView === v} onClick={() => nav.set({ view: v, detail: false })}>
              {v === '3d' ? '3D' : v === 'top' ? '위에서' : '센서 키트'}
            </Btn>
          ))}
        </div>
      </Sec>

      <Sec title="대본">
        {!load && <div className="dp-warn">먼저 상차 정보를 넣으세요 (키트 대본은 Isaac Sim 짐으로 저절로)</div>}
        {SCENES.map((s) => (
          <Btn key={s.key} wide on={!!scenario && PLAYING[s.key] === scenario} onClick={() => playScenario(s.key)}>
            {s.label}
            <small>{s.sub}</small>
          </Btn>
        ))}
        <div className="dp-row2">
          <Btn accent onClick={() => playScenario('arrive')}>
            쉼터 도착 · 정차 (P)
          </Btn>
          <Btn onClick={simControl.stop}>대본 멈춤</Btn>
        </div>
      </Sec>

      <Sec title="차량 (Virtual Console 대신)">
        <div className="dp-row4">
          <Btn on={sim.gear === 'P'} onClick={() => simControl.gear('P')}>
            P
          </Btn>
          <Btn on={sim.gear === 'D'} onClick={() => simControl.gear('D')}>
            D
          </Btn>
          <Btn onClick={simControl.hardBrake}>급제동</Btn>
          <Btn onClick={() => simControl.target(0)}>서기</Btn>
        </div>
        <label className="dp-range">
          <span>목표 속도</span>
          <input type="range" min={0} max={110} step={5} value={sim.targetKmh} onChange={(e) => simControl.target(Number(e.target.value))} />
          <b className="tnum">{sim.targetKmh} km/h</b>
        </label>
        <label className="dp-range">
          <span>앞바퀴 각</span>
          <input type="range" min={-12} max={12} step={0.5} value={sim.steerDeg} onChange={(e) => simControl.steer(Number(e.target.value))} />
          <b className="tnum">{sim.steerDeg}°</b>
        </label>
        <div className="dp-row2">
          <Btn on={sim.road === 'highway'} onClick={() => simControl.road('highway')}>
            고속도로
          </Btn>
          <Btn on={sim.road === 'local'} onClick={() => simControl.road('local')}>
            일반 도로
          </Btn>
        </div>
        <div className="dp-row3">
          <Btn onClick={() => simControl.caution('bump')}>방지턱</Btn>
          <Btn onClick={() => simControl.caution('downhill')}>내리막</Btn>
          <Btn onClick={() => simControl.caution('slippery')}>미끄러운 길</Btn>
        </div>
        <div className="dp-row4">
          <span className="dp-lbl">속도 신호</span>
          {[10, 5, 2].map((hz) => (
            <Btn key={hz} on={sim.speedHz === hz} onClick={() => simControl.speedHz(hz)}>
              {hz} Hz
            </Btn>
          ))}
        </div>
      </Sec>

      <Sec title="센서 키트">
        <div className="dp-row4">
          <Btn on={kit.mode === 'off'} onClick={kitControl.off}>
            없음
          </Btn>
          <Btn on={kit.mode === 'isaac'} onClick={() => kitControl.isaac(run)}>
            Isaac
          </Btn>
          <Btn on={kit.mode === 'feed'} onClick={kitControl.feed}>
            서버
          </Btn>
          <Btn on={kit.mode === 'manual'} onClick={() => (kitControl.manual(), kitControl.setManual({ c1: 1250, c2: 1250 }))}>
            손으로
          </Btn>
        </div>
        <select value={run} onChange={(e) => setRun(e.target.value)} className="dp-select">
          {ISAAC.runs.map((r) => (
            <option key={r.key} value={r.key}>
              {r.label}
            </option>
          ))}
        </select>
        {kit.mode === 'manual' && (
          <>
            {(['c1', 'c2'] as const).map((k) => (
              <label key={k} className="dp-range">
                <span>{k === 'c1' ? '앞 바 장력' : '뒤 바 장력'}</span>
                <input type="range" min={0} max={2500} step={10} defaultValue={1250} onChange={(e) => kitControl.setManual({ [k]: Number(e.target.value) })} />
              </label>
            ))}
            <label className="dp-range">
              <span>짐 이동 (mm)</span>
              <input type="range" min={0} max={400} step={5} defaultValue={0} onChange={(e) => kitControl.setManual({ shiftMm: Number(e.target.value) })} />
            </label>
          </>
        )}
        {kit.feedError && <div className="dp-warn">{kit.feedError}</div>}
        <div className="dp-note">{ISAAC.source}</div>
      </Sec>
    </div>
  )
}
