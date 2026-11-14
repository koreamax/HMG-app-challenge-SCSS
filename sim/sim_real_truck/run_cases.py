"""PV5 오픈베드 가상 트럭으로 짐 고정 검증 실행 (Isaac Sim 4.2, 화면 없이).

  python sim_real_truck/run_cases.py --set smoke            # 한 경우만 (빠른 확인)
  python sim_real_truck/run_cases.py --set brake            # 제동 행렬
  python sim_real_truck/run_cases.py --set all

결과: sim_real_truck/results/<set>.jsonl (경우마다 한 줄: 입력, 예측 한계, 받은 세기, 짐 이동, 넘어짐 ...),
      sim_real_truck/results/series/<id>.json (시간에 따른 값, 앱 재생 · 그림용)
"""
import argparse
import json
import math
import sys
import time
from pathlib import Path

from isaacsim import SimulationApp

HERE = Path(__file__).resolve().parent
KIT = Path(sys.executable).parent / 'Lib/site-packages/isaacsim/apps/isaac_twin_light.kit'
ap = argparse.ArgumentParser()
ap.add_argument('--set', default='smoke')
ap.add_argument('--only', default='')
args, _ = ap.parse_known_args()
app = SimulationApp({'headless': True}, experience=str(KIT))
import omni.kit.app  # noqa: E402

omni.kit.app.get_app().get_extension_manager().set_extension_enabled_immediate('omni.physx.vehicle', True)
sys.path.insert(0, str(HERE))
import numpy as np  # noqa: E402

from spec import CARGO, G, PV5, STRAP  # noqa: E402
from pv5sim import DT, Case, TruckSim  # noqa: E402

OUT = HERE / 'results'
(OUT / 'series').mkdir(parents=True, exist_ok=True)


def limit_low(case: Case, angle_deg):
    sumT = 0. if case.rubber else case.belts * case.t0
    return 0.8 * case.mu * (1 + 2 * sumT * math.sin(math.radians(angle_deg)) / (case.mass * G))


def strap_angle(case: Case):
    """실제 벨트 각도 (짐 위 모서리 -> 적재함 옆 고리, 수평면과)"""
    l, w, h = case.size
    hook_y = PV5['bed']['w'] / 2 - STRAP['hook_inset']
    return math.degrees(math.atan2(h, hook_y - w / 2))


def speed_decel_est(t, kmh, window=0.6, factor=1.25):
    """앱(키트 없음)과 같은 방법: 10 Hz 속도 표본의 최근 0.6 s 기울기 x 1.25 의 최대값 (g)"""
    ts = np.array(t)
    vs = np.array(kmh) / 3.6
    keep = np.arange(0, len(ts), max(1, int(round(0.1 / DT))))      # 10 Hz
    ts, vs = ts[keep], vs[keep]
    best = 0.
    for i in range(len(ts)):
        m = (ts >= ts[i] - window) & (ts <= ts[i])
        if m.sum() < 3:
            continue
        a = np.polyfit(ts[m], vs[m], 1)[0]
        best = max(best, -a / G * factor)
    return best


def smooth(x, n):
    x = np.asarray(x, float)
    if len(x) < n:
        return x
    k = np.ones(n) / n
    return np.convolve(x, k, mode='same')


def kit_filter(x):
    """키트 가속 센서처럼: 한 걸음짜리 수치 튐을 중앙값(5)으로 걷어 내고 0.1 s 이동평균 (약 10 Hz 저역)"""
    x = np.asarray(x, float)
    if len(x) < 5:
        return x
    pad = np.pad(x, 2, mode='edge')
    med = np.median(np.stack([pad[i:i + len(x)] for i in range(5)]), axis=0)
    return smooth(med, max(1, int(round(0.1 / DT))))


def summarize(cid, sim: TruckSim, case: Case, extra):
    r = sim.rec
    ax = np.array(r.ax)
    ay = np.array(r.ay)
    # 키트 가속 센서: 수치 튐을 걷어 내고 10 Hz 아래로 거른 값 (적재함 순간 최대)
    ax_f = kit_filter(ax)
    ay_f = kit_filter(ay)
    dx, dy, dz = np.array(r.dx), np.array(r.dy), np.array(r.dz)
    disp = np.sqrt(dx ** 2 + dy ** 2)
    ang = strap_angle(case)
    out = {
        'id': cid, 'cargo': case.cargo, 'mass': case.mass, 'size': case.size, 'mu': case.mu, 'belts': case.belts, 't0': case.t0,
        'rubber': case.rubber, 'front_gap': case.front_gap, 'label': case.label,
        'angle_deg': round(ang, 1),
        'limit_low_actual_angle': round(limit_low(case, ang), 3),     # 실제 각도로 계산한 한계
        'limit_low_app_default': round(limit_low(case, 45.), 3),       # 앱의 키트 없는 기본 (45도)
        'peak_decel_g': round(float(max(0., -ax_f.min())), 3),
        'peak_accel_g': round(float(max(0., ax_f.max())), 3),
        'peak_lat_g': round(float(np.abs(ay_f).max()), 3),
        'speed_est_decel_g': round(speed_decel_est(r.t, r.kmh), 3),
        'max_shift_mm': round(float(disp.max() * 1000), 1),
        'final_shift_mm': round(float(disp[-1] * 1000), 1),
        'max_fwd_mm': round(float(dx.max() * 1000), 1),    # 앞으로 (+X = 앞)
        'max_tilt_deg': round(float(max(r.tilt)), 1),
        'fell_off': bool(not all(r.on_bed[-30:])),
        'max_T': [round(float(max(T[i] for T in r.T)), 0) for i in range(case.belts)],
        'min_T': [round(float(min(T[i] for T in r.T)), 0) for i in range(case.belts)],
        'duration_s': round(r.t[-1] - r.t[0], 2) if r.t else 0,
    }
    out.update(extra)
    out['moved'] = out['max_shift_mm'] >= 30.
    out['tipped'] = out['max_tilt_deg'] >= 10.
    return out


def save_series(cid, sim: TruckSim):
    r = sim.rec
    step = max(1, int(round(0.05 / DT)))           # 20 Hz 로 줄여 저장
    idx = list(range(0, len(r.t), step))
    data = {k: [round(float(getattr(r, k)[i]), 4) for i in idx] for k in ('t', 'kmh', 'steer', 'brake', 'dx', 'dy', 'dz', 'tilt')}
    for k in ('ax', 'ay', 'az'):
        f = kit_filter(getattr(r, k))
        data[k] = [round(float(f[i]), 4) for i in idx]
    data['T'] = [[round(float(v), 1) for v in r.T[i]] for i in idx]
    data['on_bed'] = [bool(r.on_bed[i]) for i in idx]
    (OUT / 'series' / f'{cid}.json').write_text(json.dumps(data), encoding='utf-8')


def run_brake(case: Case, v0_kmh, target_g, cid):
    """주행 속도 v0 로 1 s 달린 뒤 브레이크를 0.25 s 동안 밟아 목표 감속(닫힌 고리)으로 선다. 선 뒤 2 s 더."""
    sim = TruckSim(case)
    sim.settle(1.0)
    sim.launch(v0_kmh / 3.6)
    for _ in range(int(1.0 / DT)):
        sim.step()
    b = min(1., target_g / 2.1)       # 제동력 지도: b = 1 이면 약 2 g 어치 (타이어 마찰에서 먼저 끝난다)
    t_b = 0.
    stopped_at = None
    a_prev = 0.
    while sim.t < 40:
        ramp = min(1., t_b / 0.25)
        fwd, a = sim.step(brake=b * ramp)
        t_b += DT
        # 닫힌 고리: 측정 감속을 목표에 맞춘다 (사람이 브레이크를 조절하듯)
        if t_b > 0.3 and fwd > 1.0:
            meas = -float(a[0])
            a_prev = 0.95 * a_prev + 0.05 * meas
            b = float(np.clip(b + 0.01 * (target_g - a_prev), 0., 1.))
        if fwd < 0.05 and stopped_at is None:
            stopped_at = sim.t
        if stopped_at is not None and sim.t - stopped_at > 2.0:
            break
    out = summarize(cid, sim, case, {'kind': 'brake', 'v0_kmh': v0_kmh, 'target_g': target_g})
    save_series(cid, sim)
    return out


def run_turn(case: Case, v0_kmh, target_lat_g, cid):
    """v0 로 달리다 0.5 s 동안 핸들을 돌려 목표 옆 가속을 3 s 유지한 뒤 편다."""
    sim = TruckSim(case)
    sim.settle(1.0)
    sim.launch(v0_kmh / 3.6)
    for _ in range(int(1.0 / DT)):
        sim.step(accel=0.15)
    v = v0_kmh / 3.6
    delta = math.atan(PV5['wheelbase'] * target_lat_g * G / max(1., v * v))
    s = delta / PV5['max_steer']
    t_s = 0.
    lat_f = 0.
    while t_s < 5.0:
        ramp = min(1., t_s / 0.5) if t_s < 3.5 else max(0., 1 - (t_s - 3.5) / 0.5)
        fwd, a = sim.step(accel=0.25, steer=s * ramp)
        t_s += DT
        if 0.6 < t_s < 3.5:
            lat_f = 0.9 * lat_f + 0.1 * abs(float(a[1]))
            s = float(np.clip(s + 0.01 * (target_lat_g - lat_f) * np.sign(s or 1), -1., 1.))
    for _ in range(int(1.5 / DT)):
        sim.step(brake=0.2)
    out = summarize(cid, sim, case, {'kind': 'turn', 'v0_kmh': v0_kmh, 'target_lat_g': target_lat_g})
    save_series(cid, sim)
    return out


def run_trip(case: Case, v0_kmh, target_g, cid, release_at=None, turn_lat=0., turn_s=4.0):
    """앱 시연용 전체 주행: 정차 2 s -> 0.18 g 로 출발해 v0 까지 -> 정속 3 s -> (벨트 풀림) -> (회전) -> 제동 -> 선 뒤 4 s"""
    sim = TruckSim(case)
    sim.settle(1.0)
    for _ in range(int(2.0 / DT)):
        sim.step(brake=1.0)
    while True:
        fwd, a = sim.step(accel=0.55)
        if fwd >= v0_kmh / 3.6 or sim.t > 40:
            break
    t_c = sim.t
    while sim.t < t_c + 3.0:
        fwd, a = sim.step(accel=0.12)
        if release_at is not None and sim.t >= t_c + release_at and case.belts - 1 not in sim.released:
            sim.released.add(case.belts - 1)          # 뒤 끝 벨트(c2)가 풀린다
    if turn_lat > 0:
        v = v0_kmh / 3.6
        s = math.atan(PV5['wheelbase'] * turn_lat * G / (v * v)) / PV5['max_steer']
        t_s = 0.
        while t_s < turn_s:
            ramp = min(1., t_s / 0.6) if t_s < turn_s - 0.8 else max(0., 1 - (t_s - (turn_s - 0.8)) / 0.6)
            sim.step(accel=0.2, steer=s * ramp)
            t_s += DT
    b = min(1., target_g / 2.1)
    t_b = 0.
    stopped = None
    a_prev = 0.
    while sim.t < 90:
        fwd, a = sim.step(brake=b * min(1., t_b / 0.25))
        t_b += DT
        if t_b > 0.3 and fwd > 1.0:
            a_prev = 0.95 * a_prev + 0.05 * (-float(a[0]))
            b = float(np.clip(b + 0.01 * (target_g - a_prev), 0., 1.))
        if fwd < 0.05 and stopped is None:
            stopped = sim.t
        if stopped is not None and sim.t - stopped > 4.0:
            break
    out = summarize(cid, sim, case, {'kind': 'trip', 'v0_kmh': v0_kmh, 'target_g': target_g, 'release_at': release_at, 'turn_lat': turn_lat})
    save_series(cid, sim)
    return out


def run_bump(case: Case, v0_kmh, height_m, cid):
    """v0 로 과속방지턱(높이 height_m)을 넘는다. 넘은 뒤 2 s 더 달린 다음 천천히 선다."""
    sim = TruckSim(case)
    sim.add_bump(ahead_m=14.0, height=height_m)
    sim.settle(1.0)
    sim.launch(v0_kmh / 3.6)
    t_end = sim.t + 14.0 / (v0_kmh / 3.6) + 3.5
    while sim.t < t_end:
        sim.step(accel=0.08)
    for _ in range(int(2.0 / DT)):
        sim.step(brake=0.12)
    out = summarize(cid, sim, case, {'kind': 'bump', 'v0_kmh': v0_kmh, 'bump_m': height_m})
    r = sim.rec
    out['peak_up_g'] = round(float(max(kit_filter(r.az))), 3)
    out['min_vert_g'] = round(float(1 + min(kit_filter(r.az))), 3)
    save_series(cid, sim)
    return out


def cases(name):
    box = CARGO['box']
    if name == 'smoke':
        yield 'smoke_b2_1250_g070', 'brake', Case('box', 300., box['size'], box['mu'], 2, 1250., 0.35), 50, 0.70
        return
    if name in ('brake', 'all'):
        for belts in (1, 2, 3, 4):
            for t0 in (600., 1250., 2500.):
                for g in (0.30, 0.45, 0.60, 0.75, 0.90):
                    yield f'brk_box300_b{belts}_T{int(t0)}_g{int(g * 100):03d}', 'brake', Case('box', 300., box['size'], box['mu'], belts, t0, 0.35), 50, g
    if name in ('wall', 'all'):
        for g in (0.45, 0.75, 0.90):
            yield f'wall_box300_b2_T1250_g{int(g * 100):03d}', 'brake', Case('box', 300., box['size'], box['mu'], 2, 1250., 0.0), 50, g
    if name in ('turn', 'all'):
        for lat in (0.25, 0.40, 0.55):
            yield f'turn_box300_b2_T1250_lat{int(lat * 100):03d}', 'turn', Case('box', 300., box['size'], box['mu'], 2, 1250., 0.0), 50, lat
    if name in ('tall', 'all'):
        app_ = CARGO['appliance']
        for g in (0.45, 0.75, 0.90):
            yield f'tall_app300_b2_T1250_g{int(g * 100):03d}', 'brake', Case('appliance', 300., app_['size'], app_['mu'], 2, 1250., 0.35), 50, g
        for lat in (0.30, 0.45):
            yield f'tallturn_app300_b2_T1250_lat{int(lat * 100):03d}', 'turn', Case('appliance', 300., app_['size'], app_['mu'], 2, 1250., 0.0), 40, lat
    if name in ('rubber', 'all'):
        for g in (0.30, 0.60):
            yield f'rub_box300_g{int(g * 100):03d}', 'brake', Case('box', 300., box['size'], box['mu'], 3, 0., 0.35, rubber=True), 50, g
    if name in ('bump', 'all'):
        for v in (20, 35):
            yield f'bump_box300_b2_T1250_v{v}', 'bump', Case('box', 300., box['size'], box['mu'], 2, 1250., 0.35), v, 0.08
            yield f'bump_box300_b1_T600_v{v}', 'bump', Case('box', 300., box['size'], box['mu'], 1, 600., 0.35), v, 0.08
    if name in ('extra', 'all'):
        app_ = CARGO['appliance']
        # 키 큰 짐: 벨트가 약하면 회전에서 넘어지나
        for lat in (0.35, 0.50):
            yield f'tip_app300_b1_T300_lat{int(lat * 100):03d}', 'turn', Case('appliance', 300., app_['size'], app_['mu'], 1, 300., 0.0), 40, lat
            yield f'tip_app300_rub_lat{int(lat * 100):03d}', 'turn', Case('appliance', 300., app_['size'], app_['mu'], 2, 0., 0.0, rubber=True), 40, lat
    if name in ('trip', 'all'):
        # 앱 시연 (키트 형식 재생): 같은 급제동 0.75 g, 벨트 2개 600 N(밀림) / 2개 1,250 N(밀림) / 4개 1,250 N(제자리) / 고무바(앞판까지)
        yield 'trip_box300_b2_T1250_g075', 'trip', Case('box', 300., box['size'], box['mu'], 2, 1250., 0.35), 50, 0.75
        yield 'trip_box300_b4_T1250_g075', 'trip', Case('box', 300., box['size'], box['mu'], 4, 1250., 0.35), 50, 0.75
        yield 'trip_box300_b2_T600_g045', 'trip', Case('box', 300., box['size'], box['mu'], 2, 600., 0.35), 50, 0.45
        yield 'trip_box300_rub_g045', 'trip', Case('box', 300., box['size'], box['mu'], 3, 0., 0.35, rubber=True), 50, 0.45
        # 주행 중 앞 끝 벨트가 풀린 뒤 회전 + 제동
        yield 'trip_box300_b2_T1250_release_g060', 'trip', Case('box', 300., box['size'], box['mu'], 2, 1250., 0.35), 50, 0.60
        # 고무바로 묶은 냉장고: 나들목 램프 회전(약 0.4 g, 시속 40 km, 반지름 약 30 m)에서 넘어져 떨어진다
        app_ = CARGO['appliance']
        yield 'trip_app300_rub_turnlost', 'trip', Case('appliance', 300., app_['size'], app_['mu'], 2, 0., 0.0, rubber=True), 40, 0.30
    if name in ('heavy', 'all'):
        pal = CARGO['pallet']
        for g in (0.45, 0.75):
            yield f'pal500_b2_T1250_g{int(g * 100):03d}', 'brake', Case('pallet', 500., pal['size'], pal['mu'], 2, 1250., 0.35), 50, g
            yield f'pal500_b4_T2500_g{int(g * 100):03d}', 'brake', Case('pallet', 500., pal['size'], pal['mu'], 4, 2500., 0.35), 50, g


if __name__ == '__main__':
    out_path = OUT / f'{args.set}.jsonl'
    done = set()
    if out_path.exists():
        done = {json.loads(l)['id'] for l in out_path.read_text(encoding='utf-8').splitlines() if l.strip()}
    t0 = time.time()
    n = 0
    with out_path.open('a', encoding='utf-8') as f:
        for cid, kind, case, v0, target in cases(args.set):
            if cid in done or (args.only and args.only not in cid):
                continue
            ts = time.time()
            try:
                if kind == 'trip':
                    res = run_trip(case, v0, target, cid, release_at=1.0 if 'release' in cid else None, turn_lat=0.35 if 'release' in cid else 0.42 if 'turnlost' in cid else 0., turn_s=5.5 if 'turnlost' in cid else 4.0)
                else:
                    res = run_brake(case, v0, target, cid) if kind == 'brake' else run_turn(case, v0, target, cid) if kind == 'turn' else run_bump(case, v0, target, cid)
            except Exception as error:      # noqa: BLE001
                import traceback
                traceback.print_exc()
                print('CASE_ERROR', cid, error, flush=True)
                continue
            res['wall_s'] = round(time.time() - ts, 1)
            f.write(json.dumps(res, ensure_ascii=False) + '\n')
            f.flush()
            n += 1
            print('CASE', cid, 'decel', res['peak_decel_g'], 'lat', res['peak_lat_g'], 'limit', res['limit_low_actual_angle'],
                  'shift', res['max_shift_mm'], 'tilt', res['max_tilt_deg'], 'T', res['max_T'], 'est', res['speed_est_decel_g'],
                  f"({res['wall_s']} s)", flush=True)
    print('RUN_DONE', n, 'cases', round(time.time() - t0, 1), 's', flush=True)
    app.close()
