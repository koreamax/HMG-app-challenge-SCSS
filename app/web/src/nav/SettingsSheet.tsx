/**
 * 설정 (오른쪽 시트, 폭 720): 판단 값 · 음성 · 센서 키트 · 시연. 묶음은 카드 없이 간격과 작은 이름으로 나눈다.
 * 시연 묶음 (시연 패널 · 조향 보정 · 키트 서버 주소 · 연결 단추) 은 개발용이라 주소에 ?demo=1 을 붙여 연 때만 보인다.
 * 제품 화면에는 개발용 글 (음성 엔진 이름 · 임시값 · 시연 빌드) 을 쓰지 않는다.
 */
import { X } from 'lucide-react'
import { CARGO, PICKABLE } from '@/engine/cargo'
import { ISAAC } from '@/runtime/kit'
import { app, capabilities, clearAll, kitControl, setSettings } from '@/runtime/runtime'
import { useStore } from '@/runtime/store'
import { Button, Stepper, ToggleRow } from '@/ui/parts'

/** 주소에 ?demo=1 이 지금 붙어 있나 (그릴 때마다 읽는다) */
const devUrl = () => typeof location !== 'undefined' && new URLSearchParams(location.search).get('demo') === '1'

export function SettingsSheet({ onClose }: { onClose: () => void }) {
  const st = useStore(app, (s) => s.settings)
  const kitMode = useStore(app, (s) => s.kit.mode)
  const kitFresh = useStore(app, (s) => s.kit.fresh)
  const feedError = useStore(app, (s) => s.kit.feedError)
  const native = useStore(app, (s) => s.native)
  const cap = capabilities()
  // 듣기가 있으면 '네' 로 답하고, 없으면 답은 정차 뒤 화면에서 (개발용 엔진 이름은 화면에 쓰지 않는다)
  const voiceCaption = cap.ear === 'android' ? '경고를 말로 알리고 “네” 로 답을 듣습니다' : '경고를 말로 알립니다 · 답은 정차 후 화면에서'
  const kitWord = kitMode === 'off' ? '없음 · 차량 신호로만 판단' : kitMode === 'isaac' ? '모의 주행 기록 재생 · ' + (kitFresh ? '연결' : '끊김') : kitMode === 'feed' ? '키트 서버 · ' + (feedError ?? (kitFresh ? '연결' : '기다리는 중')) : '손으로 넣는 값 (시연)'
  // 시연 묶음 (시연 패널 · 조향 보정 · 키트 서버) 은 시연 주소 (?demo=1) 에서만. 제품 화면에는 차량 신호 줄만 (차에서 돌 때)
  const dev = devUrl()
  const kitServer = st.demo && dev
  return (
    <>
      <div className="nv-scrim" onClick={onClose} aria-hidden="true" />
      <section className="nv-sheet settings" role="dialog" aria-modal="true" aria-label="설정">
        <div className="nv-sheet-head">
          <h2>설정</h2>
          <button type="button" className="x" aria-label="닫기" onClick={onClose}>
            <X strokeWidth={2.4} />
          </button>
        </div>
        <div className="nv-sheet-body jj-stagger">
          <div className="grp">
            <h3 className="nv-field-h">판단에 쓰는 값</h3>
            <div className="nv-srow">
              <div className="tx">
                <b>벨트 라벨 표준 장력</b>
                <span>키트가 없을 때 장력 = 표준 ÷ 2</span>
              </div>
              <Stepper value={Math.round(st.stfN / 10)} unit="daN" min={50} max={1000} step={50} label="표준 장력" onChange={(v) => setSettings({ stfN: v * 10 })} />
            </div>
            <div className="nv-srow">
              <div className="tx">
                <b>마찰계수 (재질별 낮은 값)</b>
                <span className="mu">
                  {PICKABLE.map((k, i) => (
                    <span key={k}>
                      {CARGO[k].label + ' ' + CARGO[k].mu.toFixed(2)}
                      {i < PICKABLE.length - 1 ? ' · ' : ''}
                    </span>
                  ))}
                </span>
              </div>
            </div>
          </div>
          <div className="grp">
            <h3 className="nv-field-h">음성</h3>
            <ToggleRow label="음성 안내" caption={voiceCaption} on={st.voice} onChange={(v) => setSettings({ voice: v })} />
            <ToggleRow label="주행 중 안내 보류" caption="주행 중 사용 승인 전: 기록했다가 정차 때 알립니다" on={st.holdWhileDriving} onChange={(v) => setSettings({ holdWhileDriving: v })} />
            <ToggleRow label="녹음한 문장으로 말하기" caption="음성 합성이 준비되지 않았을 때" on={st.recordedVoice} onChange={(v) => setSettings({ recordedVoice: v })} />
          </div>
          <div className="grp">
            <h3 className="nv-field-h">센서 키트</h3>
            <ToggleRow label="센서 키트" caption={kitWord} on={kitMode !== 'off'} onChange={(v) => (v ? kitControl.isaac(ISAAC.runs[1].key) : kitControl.off())} />
            {kitServer && (
              <div className="nv-srow">
                <div className="tx">
                  <b>키트 서버 주소</b>
                  <span>시연 PC가 키트 형식으로 값을 보냅니다</span>
                </div>
                <input value={st.kitUrl} onChange={(e) => setSettings({ kitUrl: e.target.value })} aria-label="키트 서버 주소" spellCheck={false} />
              </div>
            )}
            {kitServer && (
              <Button onClick={kitControl.feed} className="nv-srow-btn">
                키트 서버에 연결
              </Button>
            )}
          </div>
          {native && !dev && (
            <div className="grp">
              <h3 className="nv-field-h">차량</h3>
              <div className="nv-srow">
                <div className="tx">
                  <b>차량 신호</b>
                  <span>{[native.speed ? '속도' : null, native.steering ? '조향' : null, native.gear ? '기어' : null, native.uxr ? '주행 규제' : null].filter(Boolean).join(' · ') + ' · 앱 ' + native.version}</span>
                </div>
              </div>
            </div>
          )}
          {dev && (
            <div className="grp">
              <h3 className="nv-field-h">시연 · 차량</h3>
              <ToggleRow label="시연 패널" caption="발표용 차량 · 키트 흉내" on={st.demo} onChange={(v) => setSettings({ demo: v })} />
              <ToggleRow label="조향 값이 핸들 각" caption={'핸들 각이 오면 조향비 ' + st.steeringRatio + '로 나눕니다'} on={st.steerIsWheel} onChange={(v) => setSettings({ steerIsWheel: v })} />
              <div className="nv-srow">
                <div className="tx">
                  <b>차량 신호</b>
                  <span>
                    {native
                      ? [native.speed ? '속도' : null, native.steering ? '조향' : null, native.gear ? '기어' : null, native.uxr ? '주행 규제' : null].filter(Boolean).join(' · ') + ' · 앱 ' + native.version
                      : '브라우저에서 실행 중 · 차량 신호는 시연 패널'}
                  </span>
                </div>
              </div>
            </div>
          )}
          <div className="grp">
            <Button
              className="nv-danger"
              onClick={() => {
                if (window.confirm('이 기기의 적재 기록을 모두 지울까요? 되돌릴 수 없습니다.')) clearAll()
              }}
            >
              이 기기의 기록 모두 지우기
            </Button>
          </div>
          <p className="nv-note">초록은 계산상 기준 충족일 뿐 안전 보증이 아닙니다. 짐 고정 책임은 운전자에게 있습니다.</p>
        </div>
      </section>
    </>
  )
}
