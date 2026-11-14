"""적재적소 시스템 구성도 (draw.io 파일). 코드 기준: jaejeok-app/android, web/src, IsaacTwin/sim_real_truck.

  python make_drawio.py         -> jaejeok_architecture.drawio  (draw.io 에서 열어 고칠 수 있다)
  node render_drawio.mjs        -> jaejeok_architecture.png (draw.io 뷰어로 그린 그림)
"""
from pathlib import Path
from xml.sax.saxutils import escape

HERE = Path(__file__).resolve().parent
FONT = 'fontFamily=Pretendard;'
INK, BODY, MUTED = '#161b22', '#2f3741', '#4a525d'
BLUE = '#1c69d4'

cells = []
nid = [1]


def new_id():
    nid[0] += 1
    return f'c{nid[0]}'


def q(s):
    return escape(s, {'"': '&quot;'})


def html(title, lines=(), size=15, sub=12.5):
    t = f'<div style="font-size:{size}px;font-weight:600;color:{INK};margin-bottom:4px">{escape(title)}</div>'
    for ln in lines:
        t += f'<div style="font-size:{sub}px;color:{BODY};line-height:1.45">{escape(ln)}</div>'
    return t


def box(x, y, w, h, title, lines=(), fill='#ffffff', stroke='#c4ced9', dashed=False, width=1.2, size=15, sub=12.5, align='left'):
    i = new_id()
    style = (f'rounded=1;arcSize=6;whiteSpace=wrap;html=1;{FONT}fillColor={fill};strokeColor={stroke};strokeWidth={width};'
             f'align={align};verticalAlign=top;spacingLeft=12;spacingRight=10;spacingTop=8;' + ('dashed=1;dashPattern=6 4;' if dashed else ''))
    cells.append(f'<mxCell id="{i}" value="{q(html(title, lines, size, sub))}" style="{style}" vertex="1" parent="1">'
                 f'<mxGeometry x="{x}" y="{y}" width="{w}" height="{h}" as="geometry"/></mxCell>')
    return i


def group(x, y, w, h, title, fill='#eef2f6', stroke='#c4ced9', dashed=False):
    i = new_id()
    style = (f'rounded=1;arcSize=3;whiteSpace=wrap;html=1;{FONT}fillColor={fill};strokeColor={stroke};strokeWidth=1.2;'
             f'align=left;verticalAlign=top;spacingLeft=16;spacingTop=10;fontSize=16;fontStyle=1;fontColor={INK};'
             + ('dashed=1;dashPattern=8 5;' if dashed else ''))
    cells.append(f'<mxCell id="{i}" value="{q(title)}" style="{style}" vertex="1" parent="1">'
                 f'<mxGeometry x="{x}" y="{y}" width="{w}" height="{h}" as="geometry"/></mxCell>')
    return i


def text(x, y, w, h, value, size=13, color=MUTED, bold=False, align='left'):
    i = new_id()
    style = f'text;html=1;{FONT}fontSize={size};fontColor={color};align={align};verticalAlign=middle;whiteSpace=wrap;' + ('fontStyle=1;' if bold else '')
    cells.append(f'<mxCell id="{i}" value="{q(value)}" style="{style}" vertex="1" parent="1">'
                 f'<mxGeometry x="{x}" y="{y}" width="{w}" height="{h}" as="geometry"/></mxCell>')
    return i


def edge(a, b, label='', both=False, dashed=False, exit=None, entry=None, points=(), color='#4a525d'):
    i = new_id()
    style = (f'edgeStyle=orthogonalEdgeStyle;rounded=1;html=1;{FONT}fontSize=12;fontColor={MUTED};strokeColor={color};strokeWidth=1.6;'
             f'endArrow=block;endFill=1;endSize=7;labelBackgroundColor=#ffffff;'
             + ('startArrow=block;startFill=1;startSize=7;' if both else 'startArrow=none;')
             + ('dashed=1;dashPattern=6 4;' if dashed else ''))
    if exit:
        style += f'exitX={exit[0]};exitY={exit[1]};exitDx=0;exitDy=0;'
    if entry:
        style += f'entryX={entry[0]};entryY={entry[1]};entryDx=0;entryDy=0;'
    pts = ''.join(f'<mxPoint x="{px}" y="{py}"/>' for px, py in points)
    geo = f'<mxGeometry relative="1" as="geometry">' + (f'<Array as="points">{pts}</Array>' if pts else '') + '</mxGeometry>'
    cells.append(f'<mxCell id="{i}" value="{q(label)}" style="{style}" edge="1" parent="1" source="{a}" target="{b}">{geo}</mxCell>')
    return i


# ── 제목 ──
text(20, 8, 1200, 40, '적재적소 시스템 구성 (2026-11-14 코드 기준)', size=22, color=INK, bold=True)
text(1060, 12, 640, 32, '실선 = 만들어서 동작함 · 점선 = 계획 · 아이디어 (만들지 않음) · 파란 테두리 = 판정 엔진', size=12.5, align='right')

# ── A. 차 (Pleos Connect) ──
g_car = group(20, 60, 410, 690, 'Pleos Connect 차량 (AAOS)')
a_aaos = box(40, 110, 370, 74, 'AAOS 표준 API', ['속도 10 Hz · 기어 · 조향 (CarPropertyManager)', '주행 규제 (CarUxRestrictionsManager)'])
a_veh = box(40, 200, 370, 74, 'Pleos Vehicle SDK 2.3.2', ['기어 · 브레이크 · 핸들 각 · 뒷문 · 주행거리'])
a_navi = box(40, 290, 370, 74, 'Pleos NaviHelper 3.0.5', ['경유지 넣기 · 주의 지점 · 경로 · 도착 이벤트'])
a_tts = box(40, 380, 370, 74, 'Pleos TextToSpeech 3.3.1', ['정해진 한 문장 말하기 (기기 안, ko-KR)'])
a_stt = box(40, 470, 370, 74, 'Pleos SpeechToText 3.3.1', ['운전자의 "네"를 5초만 듣기 (기기 안, 저장 안 함)'])
a_loc = box(40, 560, 370, 74, 'Pleos FusedLocation 1.1.3', ['위치 · 쉼터 200 m 안 도착 알림'])
text(40, 650, 370, 80, 'Pleos 내비게이션 앱이 경유지를 받아 안내합니다. 외부 음성 인식 서비스는 쓰지 않습니다.', size=12.5)

# ── B. 내비 판 Android 앱 ──
group(460, 60, 410, 690, '내비 판 Android 앱 (Kotlin)')
b_vs = box(480, 110, 200, 74, 'VehicleSource', ['AAOS 차량 값 읽기'], sub=12)
b_pb = box(480, 200, 200, 434, 'PleosBridge', ['SDK 5종을 하나씩 시도', '안 되는 기능만 대체', '(AAOS 값 · Android TTS ·', ' 앱 안 표시)', '', '조향: 핸들 각 ÷ 조향비 16', 'TTS · STT 로캘 ko-KR'], sub=12)
b_br = box(700, 200, 150, 150, 'Bridge', ['웹 ↔ 네이티브', '말하기 · 듣기', '경유지 · 파일 저장'], sub=12)
b_ms = box(700, 366, 150, 130, 'MonitorService', ['포그라운드 서비스', '0.1 s 틱으로', '지도가 앞이어도 감시'], sub=12)
b_wv = box(700, 512, 150, 122, 'MainActivity', ['WebView 로 웹 앱', '낮 · 밤 테마'], sub=12)
text(480, 650, 370, 80, '같은 코드로 휴대폰 판 APK 도 만듭니다 (차량 SDK 없이).', size=12.5)

# ── C. 웹 앱 ──
group(900, 60, 450, 690, '웹 앱 (WebView 안, TypeScript · React)')
c_rt = box(920, 110, 410, 150, '실행 루프 (runtime) · 10 Hz', ['차량 값과 키트 값을 합쳐 엔진에 넣고', '결과를 화면과 음성 순서로 보냄', '음성: Pleos TTS (오류면 Android TTS)'], sub=12.5)
c_en = box(920, 276, 410, 170, '판정 엔진 (engine) · 단위 시험 26개', [
    '한계 = 0.8 × μ × (1 + 2 ΣT sin α ÷ mg)',
    '기준: 앞 0.8 g, 옆 · 뒤 0.5 g (EN 12195-1)',
    '제동 · 회전 추정 × 1.25 (키트 없을 때)',
    '상태 · 말할 때 · 정해진 문장 · 운송장 기록'], fill='#ffffff', stroke=BLUE, width=2.2, sub=12.5)
c_ui = box(920, 462, 200, 160, '내비 판 화면', ['정차: 3D 확인 · 다시 묶기', '주행: 음성 (승인 뒤', '색 하나와 한 줄)', '기록'], sub=12)
c_3d = box(1130, 462, 200, 160, '적재함 3D 트윈', ['three.js', '짐 · 벨트 · 밀린 자리', '번호 배지로 할 일'], sub=12)
c_data = box(920, 640, 410, 80, '시연 자료: isaac-runs.json', ['Isaac Sim 주행 기록을 키트 값으로 재생 (센서 키트 자리)'], fill='#f6f8fa', sub=12)

# ── D. 사람 ──
group(1380, 60, 310, 300, '운전자', fill='#eef2f6')
d_drv = box(1400, 110, 270, 230, '하는 일', ['출발 전 3D 로 확인', '주행 중 화면 조작 없음', '필요할 때만 한 문장을 듣고', '"네"로 대답', '정차 뒤 다시 묶기'], sub=13)
group(1380, 380, 310, 210, '휴대폰 판 (같은 웹 코드)')
d_ph = box(1400, 430, 270, 140, '하는 일', ['상차 입력 · 짐 사진', '사건 자세히 · 기록', 'L4 허브 (운영자 화면, 시연 자료)'], sub=13)

# ── E. 계획 (점선) ──
group(1380, 610, 310, 400, '계획 · 아이디어 (만들지 않음)', fill='#f6f8fa', dashed=True)
e_cloud = box(1400, 660, 270, 150, '운송장 클라우드 공유', ['내비 판과 휴대폰 판이', '같은 운송장을 씀', '지금은 각 기기 안에만 저장'], dashed=True, fill='#ffffff', sub=12.5)
e_kit = box(1400, 830, 270, 160, '센서 키트', ['끝 벨트 장력 센서 2개', '+ 짐 태그 (움직임 · 충격)', '시연은 Isaac Sim 기록으로 대신'], dashed=True, fill='#ffffff', sub=12.5)

# ── F. 검증 · 개발 도구 ──
group(20, 780, 1330, 230, '검증 · 개발 도구 (앱에 들어가지 않음)', fill='#f6f8fa')
f_emu = box(40, 830, 410, 160, 'Pleos Connect 에뮬레이터 v2.1.0', ['Virtual Console 로 기어 · 속도 · 브레이크 · 조향 신호', '자동 시험 14개 통과 (앱이 앞 · 지도가 앞)', '가상 마이크 "네" 인식 · 세 손가락 세로 창'], sub=12.5)
f_ov = box(480, 830, 390, 160, 'Omniverse RTX 렌더', ['같은 물리 장면을 경로 추적으로 그림', '실사 사진 · 급제동 영상', '(보고서 · 발표용)'], sub=12.5)
f_isaac = box(900, 830, 430, 160, 'Isaac Sim 4.2 · PhysX 240 Hz', ['Kia PV5 오픈베드 공식 제원 + 가정값', '짐 · 벨트 · 마찰 · 제동 · 회전 91회', '판정식 검증: 놓친 경우 0, 거짓 경보 3'], sub=12.5)

# ── 연결 ──
edge(a_aaos, b_vs, '')
edge(a_veh, b_pb, '', entry=(0, .1))
edge(a_navi, b_pb, '', both=True, entry=(0, .3))
edge(b_pb, a_tts, '', exit=(0, .5))
edge(a_stt, b_pb, '', both=True, entry=(0, .7))
edge(a_loc, b_pb, '', entry=(0, .9))
edge(b_vs, c_rt, '차량 값', exit=(1, .5), entry=(0, .23))
edge(b_pb, b_br, '', both=True, exit=(1, .16), entry=(0, .5))
edge(b_br, c_rt, '말하기 · 듣기 · 경유지', both=True, exit=(1, .2), entry=(0, .55))
edge(b_ms, c_rt, '0.1 s 틱', exit=(1, .5), entry=(0, .88), points=((882, 431), (882, 242)))
edge(b_wv, c_ui, '웹 화면', exit=(1, .5), entry=(0, .45))
edge(c_rt, c_en, '')
edge(c_en, c_ui, '', exit=(.25, 1), entry=(.5, 0))
edge(c_en, c_3d, '', exit=(.75, 1), entry=(.5, 0))
edge(c_rt, d_drv, '화면 · 음성', exit=(1, .4), entry=(0, .3))
edge(c_en, e_cloud, '', dashed=True, exit=(1, .8), entry=(0, .35), points=((1358, 412), (1358, 712)))
edge(d_ph, e_cloud, '', dashed=True, exit=(.5, 1), entry=(.5, 0))
edge(e_kit, c_data, '', dashed=True, exit=(0, .5), entry=(1, .5), points=((1370, 910), (1370, 680)))
edge(f_isaac, c_data, '주행 기록 내보내기', exit=(.5, 0), entry=(.5, 1))
edge(f_isaac, f_ov, '', exit=(0, .5), entry=(1, .5))
edge(f_emu, g_car, '차량 신호 넣기', exit=(.85, 0), entry=(.89, 1))

xml = ('<mxfile host="drawio" agent="jaejeok make_drawio.py"><diagram id="arch" name="시스템 구성">'
       '<mxGraphModel dx="1700" dy="1030" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" '
       'pageWidth="1710" pageHeight="1030" background="#ffffff" math="0" shadow="0"><root><mxCell id="0"/><mxCell id="1" parent="0"/>'
       + ''.join(cells) + '</root></mxGraphModel></diagram></mxfile>')
(HERE / 'jaejeok_architecture.drawio').write_text(xml, encoding='utf-8')
print('DRAWIO', len(cells), 'cells')
