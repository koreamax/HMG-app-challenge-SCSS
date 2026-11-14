"""PV5 가상 트럭 주행 기록 -> 앱의 키트 재생 데이터 (jaejeok-app/web/src/data/isaac-runs.json)

앱 형식 한 줄: [t, km/h, c1_N, c2_N, ax_G, ay_G, shift_x_mm, shift_y_mm, on(0/1), steer_deg, brake(0~1), lift_mm, tilt_deg]
  c1 = 앞 끝 벨트, c2 = 뒤 끝 벨트 (키트 센서 두 개). 10 Hz.
  ax: 앞(+) / 뒤(-, 제동). ay, shift_x: 오른쪽(+). shift_y: 뒤(+) / 앞(-). steer: 앞바퀴 각, 왼쪽(+).
  lift: 짐이 들린 높이, tilt: 짐이 기운 각 (넘어짐 · 3D 용).
"""
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
SERIES = HERE / 'results' / 'series'
OUT = Path(r'C:\Users\DANHA\DigitalTwinWorkspace\jaejeok-app\web\src\data\isaac-runs.json')
rows_all = {json.loads(l)['id']: json.loads(l) for l in (HERE / 'results' / 'all.jsonl').read_text(encoding='utf-8').splitlines() if l.strip()}

RUNS = [
    ('hold4', 'trip_box300_b4_T1250_g075', '라쳇 4개 · 급제동 0.88 g · 제자리'),
    ('slide2', 'trip_box300_b2_T1250_g075', '라쳇 2개 · 급제동 0.89 g · 짐 11 cm 밀림'),
    ('loose2', 'trip_box300_b2_T1250_release_g060', '주행 중 앞 바 풀림 · 회전 · 제동 0.78 g'),
    ('rubber', 'trip_box300_rub_g045', '고무바 · 제동 0.62 g · 짐 35 cm 밀림'),
    ('lost', 'trip_app300_rub_turnlost', '고무바 · 키 큰 짐 1.8 m · 램프 회전 0.46 g · 넘어져 떨어짐'),
]


def r2(v, nd=2):
    return round(float(v), nd)


out = {'source': 'Isaac Sim 4.2 PhysX Vehicle · Kia PV5 오픈베드 제원 (축간거리 2,995 mm, 적재함 2,420 x 1,785 mm) · 짐 300 kg (상자 1.0 x 0.8 x 0.8 m, 키 큰 짐 0.75 x 0.7 x 1.8 m) · 마찰 0.30 · 라쳇 벨트 1,250 N',
       'fields': ['t', 'kmh', 'c1', 'c2', 'ax', 'ay', 'sx', 'sy', 'on', 'steer', 'brake', 'lift', 'tilt'], 'runs': []}
for key, cid, label in RUNS:
    d = json.loads((SERIES / f'{cid}.json').read_text(encoding='utf-8'))
    meta = rows_all[cid]
    t0 = d['t'][0]
    rows = []
    for i in range(0, len(d['t']), 2):          # 20 Hz -> 10 Hz
        T = d['T'][i]
        c1 = T[-1] if T else 0.
        c2 = T[0] if T else 0.
        rows.append([r2(d['t'][i] - t0), r2(d['kmh'][i], 1), r2(c1, 1), r2(c2, 1), r2(d['ax'][i], 3), r2(-d['ay'][i], 3),
                     r2(-d['dy'][i] * 1000, 1), r2(-d['dx'][i] * 1000, 1), 1 if d['on_bed'][i] else 0,
                     r2(d['steer'][i], 2), r2(d['brake'][i], 2), r2(d['dz'][i] * 1000, 1), r2(d['tilt'][i], 1)])
    out['runs'].append({'key': key, 'folder': cid, 'label': label, 'preloadN': meta['t0'], 'massKg': meta['mass'], 'mu': meta['mu'],
                        'angleDeg': meta['angle_deg'], 'belts': meta['belts'], 'cargo': meta['cargo'], 'rubber': meta['rubber'], 'rows': rows})
    print(key, len(rows), 'rows', 'end', rows[-1][:9])
OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
print('wrote', OUT, OUT.stat().st_size)
