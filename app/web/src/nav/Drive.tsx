/**
 * 4.2 내비 · 주행: 색 하나 + 한 줄. 숫자 · 단추 · 3D · 목록 · 둘째 줄 · 움직임 없음. 할 일은 음성으로 (status.line 은 음성과 정차 화면 몫).
 *   v4: 가운데 한 덩어리 = 경고등 (낮 200, 밤 160: 밤에는 큰 상태 면을 두지 않는다) 위, 한 줄 96/700 잉크 아래.
 *   위 띠는 칩 없이 글 (적재적소 · D 주행 중 … 차량 신호로 판단). 화면 바탕 하나, 색은 경고등에만.
 *   테두리 (창 안쪽, 고정): 빨강 8 px, 주황 4 px.
 * 4.3 경고 뒤 듣는 중: 질문 음성이 끝나고 5 s 동안 알약. 자리는 늘 비워 두어 글이 움직이지 않는다.
 * 10 Hz 상태 전체가 아니라 보이는 값(색 · 글 · 듣는 중)만 구독한다.
 */
import { app } from '@/runtime/runtime'
import { useStore } from '@/runtime/store'
import { ListeningPill, Sign } from '@/ui/parts'
import { TopBar } from './Frame'

export function Drive() {
  const tone = useStore(app, (s) => s.out?.status.tone ?? 'grey')
  const title = useStore(app, (s) => s.out?.status.title ?? '판정 불가')
  const listening = useStore(app, (s) => s.speech.listening)
  // 화면 글만: '확인 필요' 하나로는 무엇을 볼지 모르므로 '짐 확인 필요' (말하는 문장은 그대로)
  const line = title === '확인 필요' ? '짐 확인 필요' : title
  return (
    <div className="nv-drive">
      <TopBar mode="drive" />
      <div className="nv-drive-block">
        <Sign tone={tone} className="nv-drive-lamp" />
        <h1 className="nv-line" aria-live="polite">
          {line}
        </h1>
        <div className="nv-listen">{listening && <ListeningPill />}</div>
      </div>
      {(tone === 'red' || tone === 'orange') && <div className={'nv-edge ' + tone} aria-hidden="true" />}
    </div>
  )
}
