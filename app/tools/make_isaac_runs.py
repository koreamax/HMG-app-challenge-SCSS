"""Isaac Sim 기록(twin_log.jsonl) -> 앱의 키트 재생 데이터(web/src/data/isaac-runs.json).

키트 형식 한 줄: [t, km/h, c1_N, c2_N, ax_G, ay_G, shift_x_mm, shift_y_mm, on_plate(0/1), NW_g, NE_g, SW_g, SE_g]
shift_y 가 음수면 앞으로 밀린 것 (제동 때 앞으로 미끄러짐).
"""
import json, math, os, sys

REC = os.environ.get('ISAAC_REC', r'C:\Users\DANHA\DigitalTwinWorkspace\IsaacTwin\test_20261110_contest_demo\recordings')
OUT = os.path.join(os.path.dirname(__file__), '..', 'web', 'src', 'data', 'isaac-runs.json')
RUNS = [
    ('hold60', '20261112_024334', '바 60 N · 급제동 · 제자리'),
    ('slide40', '20261112_023401', '바 40 N · 급제동 · 짐 밀림'),
    ('lost15', '20261112_024135', '바 15 N · 급제동 · 짐 이탈'),
]

def r2(v, nd=2):
    return None if v is None else round(float(v), nd)

out = {'source': 'Isaac Sim 1톤 트럭 모델, 짐 14.26 kg, 마찰 0.45, 벨트 각도 86.6도, 시속 50 km 급제동 (2026-11-12 기록)', 'fields': ['t', 'kmh', 'c1', 'c2', 'ax', 'ay', 'sx', 'sy', 'on', 'NW', 'NE', 'SW', 'SE'], 'runs': []}
for key, folder, label in RUNS:
    rows = [json.loads(x) for x in open(os.path.join(REC, folder, 'twin_log.jsonl'), encoding='utf-8')]
    # 급제동으로 선 뒤 4초까지만 (시연이 길어지지 않게)
    top = max(range(len(rows)), key=lambda i: rows[i]['vehicle_kmh'])
    stop = next((i for i in range(top, len(rows)) if rows[i]['vehicle_kmh'] < 0.05), len(rows) - 1)
    t_end = rows[stop]['rec_time_s'] + 4.0
    rows = [r for r in rows if r['rec_time_s'] <= t_end]
    data = []
    for r in rows:
        pos = r.get('cargo_pos_mm') or [0, 0]
        data.append([r2(r['rec_time_s']), r2(r['vehicle_kmh'], 1), r2(r['c1_N'], 1), r2(r['c2_N'], 1), r2(r['imu1_ax_G'], 3), r2(r['imu1_ay_G'], 3),
                     r2(pos[0], 1), r2(pos[1], 1), 1 if r.get('cargo_on_plate', True) else 0,
                     r2(r.get('NW_g'), 0), r2(r.get('NE_g'), 0), r2(r.get('SW_g'), 0), r2(r.get('SE_g'), 0)])
    out['runs'].append({'key': key, 'folder': folder, 'label': label, 'preloadN': rows[0]['preload_c1_N'], 'massKg': rows[0]['cargo_mass_kg'],
                        'mu': rows[0]['friction'], 'angleDeg': rows[0]['en_angle_deg'], 'rows': data})
    last = data[-1]
    print(key, len(data), 'rows', 'end shift', last[6], last[7], 'on', last[8], 'c', last[2], last[3])
json.dump(out, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print('wrote', os.path.getsize(OUT), 'bytes')
