/**
 * 시연 무대 전용: Omniverse RTX 실사 디지털 트윈 (IsaacTwin/sim_real_truck/render_hero.py, 같은 PhysX 장면을 경로 추적으로 그림).
 * 키트 대본 '라쳇 2개 급제동' 이 돌면 급제동 영상을 한 번 틀고, 아니면 출발 전 사진을 보여 준다.
 * 영상은 같은 짐 · 같은 결박의 따로 돌린 주행이라 앱의 재생 기록과 시각을 맞추지 않는다 (자막에 적는다).
 * 판은 내비 폭을 다 쓴다 (오른쪽에 빈 흑연 덩어리를 두지 않는다). 영상에 구워진 자막 · 계기 글(위 왼쪽 · 아래 왼쪽)은
 *   demo.css 가 잘라 낸다: 글 없는 띠(영상 높이 13 ~ 75 %)만 판에 보인다. 같은 값은 위 이름표 한 줄에 글로 적는다.
 * 무대를 처음 열면 이 칸과 같은 짐(상자 300 kg · 라쳇 2개 · 앞벽 안 붙임)을 실은 정차 화면 '밀릴 수 있음' 에서 시작한다
 *   (상차 시트 덮개 밑의 흐린 내비로 시작하지 않게). 이미 실은 짐이 있으면 (저장된 운송장) 그대로 둔다.
 */
import { useEffect, useRef } from 'react'
import { app, confirmLoad } from '@/runtime/runtime'
import { useStore } from '@/runtime/store'
import { KIT_RUN } from '@/runtime/sim'

const SLIDE = KIT_RUN['kit-slide'].label

export function TwinTile() {
  const scenario = useStore(app, (s) => s.scenario)
  const playing = scenario === SLIDE
  const ref = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    if (!app.get().load) confirmLoad({ kind: 'box', massKg: 300, belts: 2, beltType: 'ratchet', frontWall: false })
  }, [])
  useEffect(() => {
    const v = ref.current
    if (!v) return
    if (playing) {
      v.currentTime = 0
      v.play().catch(() => {})
    }
  }, [playing])
  return (
    <div className="twin-tile">
      <div className="twin-head">
        {/* 오른 단 폭 (약 420 px) 에 말줄임 없이 들어가게 짧게 */}
        <span>실사 디지털 트윈</span>
        <span className="twin-sub">{playing ? '같은 짐 · 같은 결박 · 급제동 0.89 g → 11 cm' : 'Omniverse RTX · 상자 300 kg · 라쳇 2개'}</span>
      </div>
      <div className="twin-body">
        <div className={'twin-media' + (playing ? ' playing' : '')}>
          {/* 출발 전 사진 (글 없음) 은 따로 둔다: 영상과 다른 자리로 잘라야 상자 윗면이 보인다 */}
          <img className="twin-still" src="/twin/bed.jpg" alt="" aria-hidden="true" />
          <video ref={ref} src="/twin/brake.mp4" muted playsInline preload="auto" />
        </div>
      </div>
    </div>
  )
}
