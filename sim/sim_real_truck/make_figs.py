"""기획서 그림: Isaac Sim 렌더 전후 비교 (fig_renders.png) + 주행 기록 시간축 (fig_trip.png)

  env_isaacsim42 python 으로: python sim_real_truck/make_figs.py
"""
import json
from pathlib import Path

import matplotlib

matplotlib.use('Agg')
import matplotlib.pyplot as plt  # noqa: E402
from PIL import Image, ImageDraw, ImageFont  # noqa: E402

HERE = Path(__file__).resolve().parent
RES = HERE / 'results'
SHOTS = RES / 'shots'
RUNS = Path(r'C:\Users\DANHA\DigitalTwinWorkspace\jaejeok-app\web\src\data\isaac-runs.json')
INK, INK2, GRID, BLUE, NAVY = '#262626', '#6b6b6b', '#e6e6e6', '#1c69d4', '#1a2129'
OK, ALERT, BAD = '#0f8a5c', '#c45200', '#d2302a'
FONT_B = 'C:/Windows/Fonts/malgunbd.ttf'
FONT_R = 'C:/Windows/Fonts/malgun.ttf'

# ── 그림 A: 렌더 전후 (3줄 x 2칸) ──
ROWS = [
    ('slide_b2_T1250', '라쳇 벨트 2개 (각 1,250 N) · 급제동 0.89 g', '짐이 앞으로 11 cm 밀림', BAD),
    ('hold_b4_T1250', '라쳇 벨트 4개 (각 1,250 N) · 같은 급제동 0.88 g', '제자리 (2 mm)', OK),
    ('tip_fridge_rubber', '고무바 · 키 큰 짐 1.8 m · 나들목 램프 회전 0.46 g', '회전 2초 만에 넘어짐 -> 적재함 밖으로 떨어짐', BAD),
]
CROP = (300, 110, 1530, 910)          # 1920 x 1080 렌더에서 트럭 둘레
CW = 820                               # 칸 폭
# 넓게 찍은 넘어짐 장면: 같은 가로세로 비율로 화면 가운데를 거의 다
CROP_TIP = (240, 0, 240 + int(1000 * (CROP[2] - CROP[0]) / (CROP[3] - CROP[1])), 1000)
CROP_WIDE = (130, 20, 130 + int(1040 * (CROP[2] - CROP[0]) / (CROP[3] - CROP[1])), 1060)
CH = int(CW * (CROP[3] - CROP[1]) / (CROP[2] - CROP[0]))
GAP = 16
HEAD = 64
CAP = 60
W = 2 * CW + GAP
H = HEAD + len(ROWS) * (CH + CAP + GAP) - GAP
img = Image.new('RGB', (W, H), 'white')
d = ImageDraw.Draw(img)
fb = ImageFont.truetype(FONT_B, 30)
fr = ImageFont.truetype(FONT_R, 26)
fs = ImageFont.truetype(FONT_B, 26)
for i, t in enumerate(['출발 전', '사건 뒤 (남색 상자 = 출발 때 자리)']):
    d.text((i * (CW + GAP) + 4, 14), t, font=fb, fill=INK)
y = HEAD
for key, cond, result, tone in ROWS:
    for j, part in enumerate(('before', 'after')):
        crop = CROP_WIDE if key == 'tip_fridge_rubber' and part == 'before' else CROP_TIP if key == 'tip_fridge_rubber' else CROP
        im = Image.open(SHOTS / f'{key}_{part}.png').convert('RGB').crop(crop).resize((CW, CH), Image.LANCZOS)
        img.paste(im, (j * (CW + GAP), y))
    # 아래 설명 줄: 왼쪽 조건, 오른쪽 결과 (색 네모 + 글)
    cy = y + CH + 12
    d.text((4, cy), cond, font=fr, fill=INK)
    x = CW + GAP + 4
    d.rectangle((x, cy + 6, x + 22, cy + 28), fill=tone)
    d.text((x + 34, cy), result, font=fs, fill=INK)
    y += CH + CAP + GAP
img.save(RES / 'fig_renders.png', optimize=True)
print('fig_renders', img.size)

# ── 그림 B: 주행 기록 (바 2개 vs 바 4개), 시간축 작은 그림 4개 ──
plt.rcParams['font.family'] = 'Malgun Gothic'
plt.rcParams['axes.unicode_minus'] = False
runs = {r['key']: r for r in json.loads(RUNS.read_text(encoding='utf-8'))['runs']}
SER = [('slide2', '라쳇 2개', BLUE), ('hold4', '라쳇 4개', INK)]
fig, axs = plt.subplots(4, 1, figsize=(6.4, 6.2), dpi=220, sharex=True)
panels = [
    (1, '속도 (km/h)', lambda v: v),
    (4, '적재함 앞뒤 가속 (g)', lambda v: v),
    (2, '앞 벨트 장력 (N)', lambda v: v),
    (7, '짐 이동 (mm, 앞 +)', lambda v: -v),
]
for ax, (col, name, f) in zip(axs, panels):
    for key, label, color in SER:
        rows = runs[key]['rows']
        ax.plot([r[0] for r in rows], [f(r[col]) for r in rows], color=color, lw=1.6, label=label)
    ax.set_ylabel(name, fontsize=8.5, color=INK, rotation=0, ha='left', va='bottom')
    ax.yaxis.set_label_coords(0.0, 1.02)
    for side in ('top', 'right'):
        ax.spines[side].set_visible(False)
    for side in ('left', 'bottom'):
        ax.spines[side].set_color(GRID)
    ax.tick_params(length=0, colors=INK2, labelsize=8)
    ax.grid(True, color=GRID, linewidth=.7)
    ax.set_axisbelow(True)
# 앱이 짐 밀림을 알아챈 때 (짐 이동 30 mm)
s2 = runs['slide2']['rows']
t_move = next(r[0] for r in s2 if -r[7] >= 30)
for ax in axs:
    ax.axvline(t_move, color=BAD, lw=1, ls='--')
axs[3].axhline(30, color=INK2, lw=.8, ls=':')
axs[3].text(t_move + 0.3, 70, f'{t_move:.1f} s: 짐 30 mm 이동 -> 앱 \u2018짐이 밀렸습니다\u2019', color=BAD, fontsize=8)
axs[0].legend(frameon=False, fontsize=8, loc='upper left', ncol=2)
axs[-1].set_xlabel('시간 (s)', fontsize=9, color=INK)
fig.suptitle('Isaac Sim PV5: 짐 300 kg · 시속 50 km 급제동, 벨트 수만 다르게', fontsize=10.5, color=INK, x=0.02, ha='left', fontweight='bold')
fig.tight_layout(rect=(0, 0, 1, 0.97))
fig.savefig(RES / 'fig_trip.png', facecolor='white')
print('fig_trip', t_move)
