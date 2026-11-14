"""PV5 가상 트럭 검증 결과 정리: 숫자 요약 (results/summary.json) + 기획서 그림 (results/fig_*.png)

  python sim_real_truck/analyze.py
"""
import json
import math
from pathlib import Path

import matplotlib

matplotlib.use('Agg')
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402

HERE = Path(__file__).resolve().parent
RES = HERE / 'results'
rows = [json.loads(l) for l in (RES / 'all.jsonl').read_text(encoding='utf-8').splitlines() if l.strip()]
plt.rcParams['font.family'] = 'Malgun Gothic'
plt.rcParams['axes.unicode_minus'] = False
# 깃허브 적재적소 화면의 색 (twin-page.css)
INK, INK2, GRID, BLUE, NAVY = '#262626', '#6b6b6b', '#e6e6e6', '#1c69d4', '#1a2129'
OK, ALERT, BAD = '#0f8a5c', '#c45200', '#d2302a'
MOVED = 30.


def clean(ax):
    for side in ('top', 'right'):
        ax.spines[side].set_visible(False)
    for side in ('left', 'bottom'):
        ax.spines[side].set_color(GRID)
    ax.tick_params(length=0, colors=INK2, labelsize=9)
    ax.grid(True, color=GRID, linewidth=.7)
    ax.set_axisbelow(True)


def wheelbase_lat(r):
    return None


brake = [r for r in rows if r['kind'] == 'brake' and r['front_gap'] > 0 and not r['rubber']]
wall = [r for r in rows if r['kind'] == 'brake' and r['front_gap'] == 0]
rub = [r for r in rows if r['rubber'] and r['kind'] in ('brake', 'trip')]
turns = [r for r in rows if r['kind'] == 'turn' and not r['rubber'] and r['belts'] >= 2]
tips = [r for r in rows if r['id'].startswith('tip_')]
bumps = [r for r in rows if r['kind'] == 'bump']
trips = [r for r in rows if r['kind'] == 'trip']


def conf(items, demand_key, limit_key):
    tp = fn = fp = tn = 0
    for r in items:
        moved = r['max_shift_mm'] >= MOVED
        flag = r[demand_key] > r[limit_key]
        tp += moved and flag
        fn += moved and not flag
        fp += (not moved) and flag
        tn += (not moved) and not flag
    return {'n': len(items), 'moved': tp + fn, 'tp': tp, 'fn': fn, 'fp': fp, 'tn': tn}


summary = {
    'cases_total': len(rows),
    'brake_cases': len(brake),
    'formula_measured': conf(brake, 'peak_decel_g', 'limit_low_actual_angle'),     # 키트: 적재함 가속(시뮬레이션 센서) vs 실제 각도로 계산한 한계
    'app_kitless': conf(brake, 'speed_est_decel_g', 'limit_low_app_default'),      # 앱(키트 없음): 속도로 구한 감속 x 1.25 vs 기본값(45도) 한계
    'est_over_peak_min': round(min(r['speed_est_decel_g'] / r['peak_decel_g'] for r in brake + wall), 3),
    'est_over_peak_max': round(max(r['speed_est_decel_g'] / r['peak_decel_g'] for r in brake + wall), 3),
    'peak_decel_max': round(max(r['peak_decel_g'] for r in brake + wall), 3),
    'wall_max_shift_mm': max(r['max_shift_mm'] for r in wall) if wall else None,
    'wall_max_decel': max(r['peak_decel_g'] for r in wall) if wall else None,
    'rubber': [{'id': r['id'], 'decel': r['peak_decel_g'], 'shift': r['max_shift_mm']} for r in rub],
    'turns': [{'id': r['id'], 'lat': r['peak_lat_g'], 'limit': r['limit_low_actual_angle'], 'shift': r['max_shift_mm']} for r in turns],
    'tips': [{'id': r['id'], 'lat': r['peak_lat_g'], 'tilt': r['max_tilt_deg'], 'shift': r['max_shift_mm'], 'fell': r['fell_off']} for r in tips],
    'bumps': [{'id': r['id'], 'min_vert_g': r.get('min_vert_g'), 'shift': r['max_shift_mm']} for r in bumps],
    'trips': [{'id': r['id'], 'decel': r['peak_decel_g'], 'shift': r['max_shift_mm'], 'T': r['max_T'], 'minT': r['min_T']} for r in trips],
}
(RES / 'summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=1), encoding='utf-8')
print(json.dumps({k: summary[k] for k in ('cases_total', 'brake_cases', 'formula_measured', 'app_kitless', 'est_over_peak_min', 'est_over_peak_max', 'wall_max_shift_mm', 'wall_max_decel')}, ensure_ascii=False, indent=1))

# ── 그림 1: 짐이 버티는 한계(낮춰 잡은 값) 와 받은 제동 ──
fig, ax = plt.subplots(figsize=(6.4, 4.6), dpi=220)
lim = np.array([r['limit_low_actual_angle'] for r in brake])
dem = np.array([r['peak_decel_g'] for r in brake])
mv = np.array([r['max_shift_mm'] >= MOVED for r in brake])
x = np.linspace(0.2, 1.75, 50)
ax.fill_between(x, x, 1.05, color=BAD, alpha=.06, lw=0)
ax.plot(x, x, color=BAD, lw=1.4, ls='--')
ax.text(0.24, 1.035, '경고 영역 (받은 제동 > 한계)', color=BAD, fontsize=8.5, ha='left', va='top')
ax.scatter(lim[~mv], dem[~mv], s=34, facecolors='white', edgecolors=OK, linewidths=1.4, label='제자리 (30 mm 미만)', zorder=3)
ax.scatter(lim[mv], dem[mv], s=34, color=BAD, label='밀림 (30 mm 이상)', zorder=3)
ax.axhline(0.8, color=INK2, lw=.9, ls=':')
ax.text(1.72, 0.81, '급제동 기준 0.8 g', color=INK2, fontsize=8, ha='right', va='bottom')
ax.set_xlim(0.2, 1.75)
ax.set_ylim(0.3, 1.05)
ax.set_xlabel('앱이 계산한 한계 (낮춰 잡은 값, g)', fontsize=9.5, color=INK)
ax.set_ylabel('적재함이 받은 최대 감속 (g)', fontsize=9.5, color=INK)
fm = summary['formula_measured']
ax.set_title(f"제동 {fm['n']}회: 밀린 {fm['moved']}회는 모두 경고 영역 (놓친 것 {fm['fn']}회)", fontsize=10.5, color=INK, loc='left', fontweight='bold')
ax.legend(frameon=False, fontsize=8.5, loc='upper left', bbox_to_anchor=(0.0, -0.16), ncol=2)
clean(ax)
fig.tight_layout()
fig.savefig(RES / 'fig_limit_vs_decel.png', facecolor='white')
plt.close(fig)

# ── 그림 2: 속도로 구한 감속 x 1.25 와 적재함이 받은 최대 ──
fig, ax = plt.subplots(figsize=(6.4, 3.6), dpi=220)
pk = np.array([r['peak_decel_g'] for r in brake + wall])
es = np.array([r['speed_est_decel_g'] for r in brake + wall])
raw = es / 1.25
order = np.argsort(pk)
ax.plot(pk[order], pk[order], color=INK2, lw=1, label='적재함이 받은 최대 (같은 값)')
ax.scatter(pk, raw, s=14, color='#9a9a9a', label='속도로 구한 감속 (10 Hz)', zorder=3)
ax.scatter(pk, es, s=16, color=BLUE, label='x 1.25 (앱, 키트 없음)', zorder=3)
ax.set_xlabel('적재함이 받은 최대 감속 (g, 시뮬레이션)', fontsize=9.5, color=INK)
ax.set_ylabel('g', fontsize=9.5, color=INK)
ax.set_title(f"x 1.25 는 {len(pk)}회 모두 적재함 최대보다 큼 ({summary['est_over_peak_min']:.2f}~{summary['est_over_peak_max']:.2f}배)", fontsize=10.5, color=INK, loc='left', fontweight='bold')
ax.set_ylim(0.3, 1.32)
ax.legend(frameon=False, fontsize=8.5, loc='upper left')
clean(ax)
fig.tight_layout()
fig.savefig(RES / 'fig_speed_estimate.png', facecolor='white')
plt.close(fig)
print('FIGS_DONE')
