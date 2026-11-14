"""적재적소 구성도 (한눈에 보는 판, draw.io). 글은 짧게, 아이콘으로 말한다.

  python make_arch_simple.py      -> jaejeok_architecture.drawio
  node render_drawio.mjs jaejeok_architecture.drawio jaejeok_architecture.png 3
"""
from pathlib import Path
from xml.sax.saxutils import escape

HERE = Path(__file__).resolve().parent
INK, BODY, MUTED, LINE, BLUE = '#121519', '#3A414A', '#6B7380', '#8A929C', '#1D5FD0'
FONT = 'fontFamily=Pretendard;'
cells = []
n = [1]


def q(s):
    return escape(s, {'"': '&quot;', '\n': '&#xa;'})


def nid():
    n[0] += 1
    return f'n{n[0]}'


def card(x, y, w, h, icon, title, sub='', dashed=False, accent=False):
    i = nid()
    stroke = BLUE if accent else ('#B3BAC3' if dashed else 'none')
    fill = '#FFFFFF' if (dashed or accent) else '#EEF0F2'
    label = (f'<div style="font-size:34px;line-height:1.1;margin-bottom:6px">{icon}</div>'
             f'<div style="font-size:19px;font-weight:600;color:{INK if not dashed else BODY}">{escape(title)}</div>'
             + (f'<div style="font-size:14.5px;color:{MUTED};margin-top:4px;line-height:1.35">{escape(sub)}</div>' if sub else ''))
    style = (f'rounded=1;arcSize=10;whiteSpace=wrap;html=1;{FONT}fillColor={fill};strokeColor={stroke};'
             f'strokeWidth={2.2 if accent else 1.4};align=center;verticalAlign=middle;spacing=8;'
             + ('dashed=1;dashPattern=6 4;' if dashed else ''))
    cells.append(f'<mxCell id="{i}" value="{q(label)}" style="{style}" vertex="1" parent="1"><mxGeometry x="{x}" y="{y}" width="{w}" height="{h}" as="geometry"/></mxCell>')
    return i


def text(x, y, w, h, s, size=15, color=MUTED, align='left', bold=False):
    i = nid()
    style = f'text;html=1;{FONT}fontSize={size};fontColor={color};align={align};verticalAlign=middle;' + ('fontStyle=1;' if bold else '')
    cells.append(f'<mxCell id="{i}" value="{q(s)}" style="{style}" vertex="1" parent="1"><mxGeometry x="{x}" y="{y}" width="{w}" height="{h}" as="geometry"/></mxCell>')
    return i


def arrow(a, b, label='', dashed=False, both=False, exit=None, entry=None, pts=()):
    i = nid()
    style = (f'edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;{FONT}fontSize=13.5;fontColor={MUTED};strokeColor={LINE};strokeWidth=2;'
             f'endArrow=block;endFill=1;endSize=8;labelBackgroundColor=#FFFFFF;'
             + ('startArrow=block;startFill=1;startSize=8;' if both else '')
             + ('dashed=1;dashPattern=6 4;' if dashed else ''))
    if exit:
        style += f'exitX={exit[0]};exitY={exit[1]};exitDx=0;exitDy=0;'
    if entry:
        style += f'entryX={entry[0]};entryY={entry[1]};entryDx=0;entryDy=0;'
    arr = ''.join(f'<mxPoint x="{px}" y="{py}"/>' for px, py in pts)
    geo = '<mxGeometry relative="1" as="geometry">' + (f'<Array as="points">{arr}</Array>' if arr else '') + '</mxGeometry>'
    cells.append(f'<mxCell id="{i}" value="{q(label)}" style="{style}" edge="1" parent="1" source="{a}" target="{b}">{geo}</mxCell>')


W, H, G = 170, 150, 46          # 카드 크기와 사이
X = [20 + k * (W + G) for k in range(5)]
Y1, Y2, Y3 = 70, 290, 500

text(20, 10, 900, 40, '적재적소 구성 한눈에 보기', size=24, color=INK, bold=True)
car = card(X[0], Y1, W, H, '🚚', '차량 신호', '속도 · 브레이크\n조향 · 기어 · 뒷문')
app = card(X[1], Y1, W, H, '📲', '내비 앱', 'Pleos SDK 5종\n받아서 넘김')
eng = card(X[2], Y1, W, H, '🧠', '판정 엔진', '짐이 버티는 힘\nvs 차가 거는 힘', accent=True)
out = card(X[3], Y1, W, H, '🔊', '화면 · 음성', '정차: 3D 확인\n주행: 한 문장')
drv = card(X[4], Y1, W, H, '🙋', '운전자', '"네" 한마디로\n쉼터 경유')

kit = card(X[0], Y2, W, H - 10, '📡', '센서 키트', '아이디어 (미제작)', dashed=True)
nav = card(X[1], Y2, W, H - 10, '🧭', 'Pleos 내비', '쉼터를 경유지로')
ph = card(X[2], Y2, W, H - 10, '📱', '휴대폰 판', '상차 · 사진 · 기록' + chr(10) + 'L4 허브 (무인 트럭)')
cloud = card(X[3], Y2, W, H - 10, '☁️', '운송장 공유', '계획 (미제작)', dashed=True)

ver = card(X[0], Y3 - 40, X[4] + W - X[0], 120, '🧪',
           '검증: Isaac Sim PV5 91회  ·  Omniverse 실사 렌더  ·  Pleos 에뮬레이터 14/14',
           '실제 트럭 측정 없이 시뮬레이션과 공식 에뮬레이터로 확인')

arrow(car, app)
arrow(app, eng)
arrow(eng, out)
arrow(out, drv)
arrow(kit, app, dashed=True, exit=(1, .25), entry=(0, .8), pts=((X[1] - G // 2, Y2 + 35), (X[1] - G // 2, Y1 + 120)))
arrow(app, nav, both=True, exit=(.6, 1), entry=(.6, 0))
arrow(eng, ph, both=True)
arrow(ph, cloud, dashed=True)

text(X[3] + W + G + W - 280, 10, 300, 40, '실선 = 동작함   점선 = 계획 · 아이디어', size=14, color=MUTED, align='right')

xml = ('<mxfile host="drawio" agent="jaejeok make_arch_simple.py"><diagram id="arch" name="구성 한눈에">'
       f'<mxGraphModel dx="1100" dy="660" grid="0" page="1" pageWidth="1100" pageHeight="620" background="#ffffff"><root><mxCell id="0"/><mxCell id="1" parent="0"/>'
       + ''.join(cells) + '</root></mxGraphModel></diagram></mxfile>')
(HERE / 'jaejeok_architecture.drawio').write_text(xml, encoding='utf-8')
print('DRAWIO', len(cells))
