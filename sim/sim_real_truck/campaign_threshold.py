"""Threshold validation campaign (Isaac Sim 4.2, PhysX, headless, physics only - no rendering).

For every cell (cargo mass x belt count x belt tension) find, by bisection over the brake command, the braking
deceleration at which the lashed cargo first slides more than 10 mm on the PV5 bed, and compare it with the app's
predicted limit   0.8 x mu x (1 + 2 x sumT x sin(angle) / (m g))   (jaejeok-app/web/src/engine/limit.ts, limitG).

  python sim_real_truck/campaign_threshold.py --phase all          # grid + repeats + lateral, then analysis
  python sim_real_truck/campaign_threshold.py --phase grid|repeat|lateral
  python sim_real_truck/campaign_threshold.py --phase analyze      # no Isaac: rebuild runs.csv + summary.json from runs.jsonl
  python sim_real_truck/campaign_threshold.py --phase smoke        # one cell, separate folder

Runs are appended to <out>/runs.jsonl (a finished run id is never run again, so the script can be resumed).
The truck / bed / cargo / belt model is pv5sim.TruckSim, unchanged. Sensors are not simulated: decelerations and
displacements are read from the simulation's true state.
"""
import argparse
import csv
import datetime
import json
import math
import platform
import sys
import time
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from spec import CARGO, G, PV5, STRAP  # noqa: E402

ap = argparse.ArgumentParser()
ap.add_argument('--phase', default='all')
ap.add_argument('--ramp', type=float, default=0.25)
ap.add_argument('--ff', type=float, default=2.85)
ap.add_argument('--out', default=str(HERE / 'results' / 'campaign_20261115'))
args, _ = ap.parse_known_args()
OUT = Path(args.out) if args.phase != 'smoke' else Path(args.out + '_smoke')
OUT.mkdir(parents=True, exist_ok=True)
JSONL = OUT / 'runs.jsonl'

# ── campaign definition ──
DT = 1 / 240
MASSES = (100., 300., 500.)
BELTS = (1, 2, 3, 4)
TENSIONS = (1250., 500.)          # default (STF 2,500 N / 2) and a loose belt
BOX = CARGO['box']                # 1.0 x 0.8 x 0.8 m, mu 0.30 (deck friction as configured in spec.py)
FRONT_GAP = 0.35                  # m between cargo and headboard
V0_KMH = 50.
SLIDE_MM = 10.
TIP_DEG = 10.
BRAKE_RAMP_S = args.ramp
BRAKE_G_PER_CMD = args.ff          # feed-forward: deceleration (g) per unit brake command
T_LO, T_HI, T_MAX = 0.15, 1.00, 1.20     # brake target (g): lowest tried, upper bisection end, "full braking" command
N_BISECT = 6
REPEAT_CELL = (300., 2, 1250.)
REPEAT_V0 = (40., 45., 50., 55., 60.)
LAT_CELLS = ((300., 1, 500.), (300., 2, 500.), (300., 2, 1250.))
LAT_LO, LAT_HI, LAT_N = 0.15, 0.85, 5


def strap_angle_deg(size):
    l, w, h = size
    hook_y = PV5['bed']['w'] / 2 - STRAP['hook_inset']
    return math.degrees(math.atan2(h, hook_y - w / 2))


def limit_g(mu, sum_t, angle_deg, mass, factor=0.8):
    return factor * mu * (1 + 2 * sum_t * math.sin(math.radians(angle_deg)) / (mass * G))


def smooth(x, n):
    x = np.asarray(x, float)
    if len(x) < n:
        return x
    return np.convolve(x, np.ones(n) / n, mode='same')


def med5(x):
    x = np.asarray(x, float)
    if len(x) < 5:
        return x
    pad = np.pad(x, 2, mode='edge')
    return np.median(np.stack([pad[i:i + len(x)] for i in range(5)]), axis=0)


def mean01(x):
    """one-step numeric spikes removed (median of 5), then 0.1 s moving mean"""
    return smooth(med5(x), max(1, int(round(0.1 / DT))))


# ───────────────────────── simulation part (needs Isaac) ─────────────────────────
def start_isaac():
    from isaacsim import SimulationApp
    kit = Path(sys.executable).parent / 'Lib/site-packages/isaacsim/apps/isaac_twin_light.kit'
    app = SimulationApp({'headless': True}, experience=str(kit))
    import omni.kit.app
    kapp = omni.kit.app.get_app()
    em = kapp.get_extension_manager()
    em.set_extension_enabled_immediate('omni.physx.vehicle', True)
    ver = {'kit': kapp.get_kit_version(), 'python': platform.python_version(), 'numpy': np.__version__, 'os': platform.platform()}
    try:
        from importlib.metadata import version
        ver['isaacsim'] = version('isaacsim')
    except Exception as error:  # noqa: BLE001
        ver['isaacsim'] = 'unknown (%s)' % error
    for e in em.get_extensions():
        if e.get('enabled') and e.get('name') in ('omni.physx', 'omni.physx.vehicle', 'omni.isaac.core'):
            ver[e['name']] = e.get('version')
    try:
        import carb
        s = carb.settings.get_settings()
        ver['physx_settings'] = {'numThreads': s.get('/physics/numThreads'), 'suppressReadback': s.get('/physics/suppressReadback')}
    except Exception:  # noqa: BLE001
        pass
    (OUT / 'versions.json').write_text(json.dumps(ver, indent=1), encoding='utf-8')
    return app


class Aux:
    def __init__(self):
        self.gx, self.gy = [], []     # gravity direction seen in the deck frame: R[2,0] (nose up +), R[2,1] (left side up +)


def make_step(sim, aux):
    def st(**kw):
        fwd, a = sim.step(**kw)
        _, R, _, _ = sim.poses()
        aux.gx.append(float(R[2, 0]))
        aux.gy.append(float(R[2, 1]))
        return fwd, a
    return st


def measure(sim, aux, case, i0, i1, t_wall, n_steps, meta):
    """i0 = first step of the manoeuvre (displacement baseline just before it), i1 = last step looked at (None = end)"""
    r = sim.rec
    n = len(r.t) if i1 is None else i1
    ax, ay, az = np.array(r.ax[:n]), np.array(r.ay[:n]), np.array(r.az[:n])
    gx, gy = np.array(aux.gx[:n]), np.array(aux.gy[:n])
    fx, fy = ax + gx, ay + gy                       # what an accelerometer fixed to the deck reads along the deck (g)
    k = max(1, int(round(0.1 / DT)))
    b0 = max(0, i0 - k)
    dx, dy, dz = np.array(r.dx[:n]), np.array(r.dy[:n]), np.array(r.dz[:n])
    base = np.array([dx[b0:i0].mean(), dy[b0:i0].mean(), dz[b0:i0].mean()])
    ddx, ddy, ddz = dx[i0:] - base[0], dy[i0:] - base[1], dz[i0:] - base[2]
    disp = np.sqrt(ddx ** 2 + ddy ** 2)
    sl = slice(i0, n)
    ax_m, ax_01, fx_01 = med5(ax)[sl], mean01(ax)[sl], mean01(fx)[sl]
    ay_01, fy_01 = mean01(ay)[sl], mean01(fy)[sl]
    horiz_01 = np.sqrt(mean01(fx) ** 2 + mean01(fy) ** 2)[sl]
    kmh = np.array(r.kmh[:n])
    T = np.array(r.T[:n])
    onset = np.argmax(disp > 1e-3) if (disp > 1e-3).any() else None
    tilt = np.array(r.tilt[:n])[sl]
    on_bed = np.array(r.on_bed[:n])[sl]
    gap_mm = case.front_gap * 1000
    out = dict(meta)
    out.update({
        'mass_kg': case.mass, 'belts': case.belts, 't0_N': case.t0, 'sumT_nominal_N': case.belts * case.t0,
        'mu_static': case.mu, 'mu_dynamic': round(0.8 * case.mu, 4), 'size_m': list(case.size), 'front_gap_m': case.front_gap,
        'strap_angle_deg': round(strap_angle_deg(case.size), 2),
        'pred_limit_g': round(limit_g(case.mu, case.belts * case.t0, strap_angle_deg(case.size), case.mass), 4),
        'pred_limit_app45_g': round(limit_g(case.mu, case.belts * case.t0, 45., case.mass), 4),
        'pred_static_mu_g': round(limit_g(case.mu, case.belts * case.t0, strap_angle_deg(case.size), case.mass, 1.0), 4),
        'T_pre_mean_N': round(float(T[b0:i0].mean()), 1),
        'peak_decel_g': round(float(max(0., -ax_m.min())), 4),
        'peak_decel_01s_g': round(float(max(0., -ax_01.min())), 4),
        'peak_decel_deck_01s_g': round(float(max(0., -fx_01.min())), 4),
        'peak_lat_01s_g': round(float(np.abs(ay_01).max()), 4),
        'peak_lat_deck_01s_g': round(float(np.abs(fy_01).max()), 4),
        'peak_horiz_deck_01s_g': round(float(horiz_01.max()), 4),
        'peak_pitch_deg': round(float(np.degrees(np.arcsin(np.clip(-gx[sl], -1, 1))).max()), 2),
        'peak_roll_deg': round(float(np.abs(np.degrees(np.arcsin(np.clip(gy[sl], -1, 1)))).max()), 2),
        'min_vertical_g': round(float(1 + mean01(az)[sl].min()), 3),
        'max_disp_mm': round(float(disp.max() * 1000), 2),
        'final_disp_mm': round(float(disp[-1] * 1000), 2),
        'max_fwd_mm': round(float(ddx.max() * 1000), 2),
        'max_lat_mm': round(float(np.abs(ddy).max() * 1000), 2),
        'min_dz_mm': round(float(ddz.min() * 1000), 2),
        'pre_drift_mm': round(float(math.hypot(base[0], base[1]) * 1000), 2),
        'onset_horiz_deck_01s_g': None if onset is None else round(float(horiz_01[onset]), 4),
        'onset_t_s': None if onset is None else round(float(onset * DT), 3),
        'max_tilt_deg': round(float(tilt.max()), 2),
        'max_T_N': [round(float(v), 0) for v in T[sl].max(axis=0)],
        'min_T_N': [round(float(v), 0) for v in T[sl].min(axis=0)],
        'v_start_kmh': round(float(kmh[i0]), 2), 'v_end_kmh': round(float(kmh[-1]), 2),
        'window_s': round(float((n - i0) * DT), 3),
        'physics_hz': int(round(1 / DT)), 'n_steps': int(n_steps), 'wall_s': round(t_wall, 2),
        'steps_per_s': round(n_steps / t_wall, 1), 'realtime_factor': round(n_steps * DT / t_wall, 2),
    })
    out['tipped'] = bool(out['max_tilt_deg'] >= TIP_DEG)
    out['left_bed'] = bool(not on_bed.all())
    out['hit_headboard'] = bool(out['max_fwd_mm'] >= gap_mm - 2.)
    out['penetrated'] = bool(out['max_fwd_mm'] > gap_mm + 15. or out['min_dz_mm'] < -10.)
    out['slid'] = bool(out['max_disp_mm'] > SLIDE_MM)
    return out


def new_sim(mass, belts, t0):
    from pv5sim import Case, TruckSim
    case = Case('box', mass, BOX['size'], BOX['mu'], belts, t0, FRONT_GAP)
    return TruckSim(case), case


def run_brake(mass, belts, t0, v0_kmh, target_g, meta):
    """1 s at v0, brake ramped in 0.25 s to the target deceleration, closed loop on the deck deceleration, 2 s after the stop.
    Differs from run_cases.run_brake only in the feed-forward (2.85 g per unit brake command instead of 2.1): with 2.1 the first
    0.5 s overshoots the target by about 0.2 g, with 2.85 the peak stays within about 0.02 g of the sustained value (probed 2026-11-15)."""
    tw = time.time()
    sim, case = new_sim(mass, belts, t0)
    aux = Aux()
    st = make_step(sim, aux)
    sim.settle(1.0)
    n_steps = int(1.0 / DT)
    sim.launch(v0_kmh / 3.6)
    for _ in range(int(1.0 / DT)):
        st()
    i0 = len(sim.rec.t)
    b = min(1., target_g / BRAKE_G_PER_CMD)
    t_b, stopped_at, a_prev = 0., None, target_g
    plateau = []
    while sim.t < 40:
        fwd, a = st(brake=b * min(1., t_b / BRAKE_RAMP_S))
        t_b += DT
        if t_b > BRAKE_RAMP_S + 0.05 and fwd > 1.0:
            a_prev = 0.95 * a_prev + 0.05 * (-float(a[0]))
            b = float(np.clip(b + 0.01 * (target_g - a_prev), 0., 1.))
        if t_b > BRAKE_RAMP_S + 0.35 and fwd > 2.0:
            plateau.append((sim.t, fwd, -float(a[0])))
        if fwd < 0.05 and stopped_at is None:
            stopped_at = sim.t
        if stopped_at is not None and sim.t - stopped_at > 2.0:
            break
    n_steps += len(sim.rec.t)
    meta = dict(meta, kind='brake', v0_kmh=v0_kmh, target_g=target_g, brake_ramp_s=BRAKE_RAMP_S,
                stop_time_s=None if stopped_at is None else round(stopped_at - sim.rec.t[i0], 3),
                plateau_mean_decel_g=round(float(np.mean([p[2] for p in plateau])), 4) if len(plateau) > 5 else None,
                speed_slope_decel_g=round((plateau[0][1] - plateau[-1][1]) / (plateau[-1][0] - plateau[0][0]) / G, 4) if len(plateau) > 5 else None,
                final_brake_cmd=round(b, 3), plateau_mean_lat_g=None)
    return measure(sim, aux, case, i0, None, time.time() - tw, n_steps, meta)


def run_turn(mass, belts, t0, v0_kmh, target_lat_g, meta):
    """1 s at v0, steering ramped in 0.5 s to the target sideways acceleration (closed loop), held to 3.5 s, straightened by 4 s,
    then 1 s rolling straight. No braking in the measured window."""
    tw = time.time()
    sim, case = new_sim(mass, belts, t0)
    aux = Aux()
    st = make_step(sim, aux)
    sim.settle(1.0)
    n_steps = int(1.0 / DT)
    sim.launch(v0_kmh / 3.6)
    for _ in range(int(1.0 / DT)):
        st(accel=0.15)
    i0 = len(sim.rec.t)
    v = v0_kmh / 3.6
    s = math.atan(PV5['wheelbase'] * target_lat_g * G / max(1., v * v)) / PV5['max_steer']
    t_s, lat_f = 0., 0.
    plateau = []
    while t_s < 5.0:
        ramp = min(1., t_s / 0.5) if t_s < 3.5 else max(0., 1 - (t_s - 3.5) / 0.5)
        fwd, a = st(accel=0.25, steer=s * ramp)
        t_s += DT
        if 0.6 < t_s < 3.5:
            lat_f = 0.9 * lat_f + 0.1 * abs(float(a[1]))
            if t_s > 1.5:
                plateau.append(abs(float(a[1])))
            s = float(np.clip(s + 0.01 * (target_lat_g - lat_f) * np.sign(s or 1), -1., 1.))
    n_steps += len(sim.rec.t)
    meta = dict(meta, kind='turn', v0_kmh=v0_kmh, target_g=target_lat_g, brake_ramp_s=None, stop_time_s=None,
                plateau_mean_decel_g=None, speed_slope_decel_g=None, final_brake_cmd=None,
                plateau_mean_lat_g=round(float(np.mean(plateau)), 4) if plateau else None)
    return measure(sim, aux, case, i0, None, time.time() - tw, n_steps, meta)


def load_runs():
    if not JSONL.exists():
        return []
    return [json.loads(l) for l in JSONL.read_text(encoding='utf-8').splitlines() if l.strip()]


class Runner:
    def __init__(self):
        self.done = {r['run_id']: r for r in load_runs()}
        self.f = JSONL.open('a', encoding='utf-8')
        self.n = 0

    def run(self, fn, mass, belts, t0, v0, target, phase, cell_id, seq, role):
        rid = f'{cell_id}_{seq:02d}'
        if rid in self.done:
            return self.done[rid]
        meta = {'run_id': rid, 'phase': phase, 'cell_id': cell_id, 'seq': seq, 'role': role}
        res = fn(mass, belts, t0, v0, target, meta)
        res['utc'] = datetime.datetime.utcnow().isoformat(timespec='seconds') + 'Z'
        self.f.write(json.dumps(res, ensure_ascii=False) + '\n')
        self.f.flush()
        self.done[rid] = res
        self.n += 1
        dem = res['peak_horiz_deck_01s_g']
        print('RUN', rid, role, 'target', round(target, 4), 'demand', dem, 'pred', res['pred_limit_g'], 'disp_mm', res['max_disp_mm'],
              'SLID' if res['slid'] else 'held', 'tip' if res['tipped'] else '', 'OFF' if res['left_bed'] else '',
              'PEN' if res['penetrated'] else '', f"{res['wall_s']} s {res['steps_per_s']} steps/s", flush=True)
        return res

    def bisect(self, fn, mass, belts, t0, v0, phase, cell_id, lo, hi, tmax, n):
        """full command first; if the cargo holds even then, a 3-step ladder (the threshold is above what the truck can do).
        Otherwise the lowest command, then n bisection steps between them."""
        seq = 0
        top = self.run(fn, mass, belts, t0, v0, tmax, phase, cell_id, seq, 'max')
        if not top['slid']:
            for tg in (0.4, 0.6, 0.8):
                seq += 1
                self.run(fn, mass, belts, t0, v0, tg, phase, cell_id, seq, 'ladder')
            return
        seq += 1
        low = self.run(fn, mass, belts, t0, v0, lo, phase, cell_id, seq, 'min')
        if low['slid']:
            return
        for _ in range(n):
            seq += 1
            mid = round((lo + hi) / 2, 5)
            res = self.run(fn, mass, belts, t0, v0, mid, phase, cell_id, seq, 'bisect')
            if res['slid']:
                hi = mid
            else:
                lo = mid


def cell_name(prefix, mass, belts, t0, extra=''):
    return f'{prefix}_m{int(mass)}_b{belts}_T{int(t0)}{extra}'


def simulate(phase):
    app = start_isaac()
    rn = Runner()
    t_start = time.time()
    try:
        if phase == 'smoke':
            rn.bisect(run_brake, 300., 2, 1250., V0_KMH, 'smoke', cell_name('brk', 300., 2, 1250.), T_LO, T_HI, T_MAX, 2)
            rn.run(run_turn, 300., 2, 500., V0_KMH, 0.5, 'smoke', cell_name('lat', 300., 2, 500.), 0, 'bisect')
        if phase in ('grid', 'all'):
            for t0 in TENSIONS:
                for mass in MASSES:
                    for belts in BELTS:
                        rn.bisect(run_brake, mass, belts, t0, V0_KMH, 'grid', cell_name('brk', mass, belts, t0), T_LO, T_HI, T_MAX, N_BISECT)
        if phase in ('repeat', 'all'):
            m, b, t0 = REPEAT_CELL
            for i in range(5):       # identical input five times
                rn.bisect(run_brake, m, b, t0, V0_KMH, 'repeat_same', cell_name('rep', m, b, t0, f'_same{i + 1}'), T_LO, T_HI, T_MAX, N_BISECT)
            for v0 in REPEAT_V0:     # same cell, start speed changed
                rn.bisect(run_brake, m, b, t0, v0, 'repeat_v0', cell_name('rep', m, b, t0, f'_v{int(v0)}'), T_LO, T_HI, T_MAX, N_BISECT)
        if phase in ('lateral', 'all'):
            for m, b, t0 in LAT_CELLS:
                rn.bisect(run_turn, m, b, t0, V0_KMH, 'lateral', cell_name('lat', m, b, t0), LAT_LO, LAT_HI, LAT_HI, LAT_N)
    finally:
        rn.f.close()
        print('SIM_DONE', rn.n, 'new runs', round(time.time() - t_start, 1), 's', flush=True)
        try:
            analyze()
        except Exception:  # noqa: BLE001
            import traceback
            traceback.print_exc()
        app.close()


# ───────────────────────── analysis part (no Isaac) ─────────────────────────
DEMAND = {'brake': 'peak_decel_deck_01s_g', 'turn': 'peak_horiz_deck_01s_g'}


def demand(r):
    return r[DEMAND[r['kind']]]


def threshold(runs, key=demand):
    """-> dict: bracket of the slide threshold in measured g. held = highest held run below the lowest slid run."""
    valid = [r for r in runs if not r['penetrated']]
    slid = sorted(key(r) for r in valid if r['slid'])
    held = sorted(key(r) for r in valid if not r['slid'])
    out = {'n_runs': len(runs), 'n_slid': len(slid), 'n_held': len(held), 'max_tested_g': round(max(key(r) for r in runs), 4)}
    if not slid:
        out.update(status='no slide up to full braking', lower_g=held[-1], upper_g=None, threshold_g=None, bracket_g=None, inversions=0)
        return out
    lo_slid = slid[0]
    below = [h for h in held if h < lo_slid]
    out['inversions'] = len([h for h in held if h >= lo_slid])
    if not below:
        out.update(status='slid at the lowest command', lower_g=None, upper_g=lo_slid, threshold_g=None, bracket_g=None)
        return out
    out.update(status='bracketed', lower_g=below[-1], upper_g=lo_slid, threshold_g=round((below[-1] + lo_slid) / 2, 4),
               bracket_g=round(lo_slid - below[-1], 4))
    return out


def stats(xs):
    xs = [float(x) for x in xs]
    if not xs:
        return None
    a = np.array(xs)
    return {'n': len(xs), 'mean': round(float(a.mean()), 4), 'median': round(float(np.median(a)), 4), 'min': round(float(a.min()), 4),
            'max': round(float(a.max()), 4), 'sd': round(float(a.std(ddof=1)), 4) if len(xs) > 1 else 0., 'mean_abs': round(float(np.abs(a).mean()), 4)}


def confusion(runs, pred_key='pred_limit_g', key=demand):
    c = {'n': 0, 'app_slides_sim_slid': 0, 'app_holds_sim_slid_MISS': 0, 'app_slides_sim_held_false_alarm': 0, 'app_holds_sim_held': 0, 'miss_run_ids': []}
    for r in runs:
        if r['penetrated']:
            continue
        says = key(r) > r[pred_key]
        c['n'] += 1
        if r['slid'] and says:
            c['app_slides_sim_slid'] += 1
        elif r['slid']:
            c['app_holds_sim_slid_MISS'] += 1
            c['miss_run_ids'].append(r['run_id'])
        elif says:
            c['app_slides_sim_held_false_alarm'] += 1
        else:
            c['app_holds_sim_held'] += 1
    return c


def cell_row(runs):
    r0 = runs[0]
    th = threshold(runs)
    row = {'cell_id': r0['cell_id'], 'kind': r0['kind'], 'mass_kg': r0['mass_kg'], 'belts': r0['belts'], 't0_N': r0['t0_N'], 'v0_kmh': r0['v0_kmh'],
           'pred_limit_g': r0['pred_limit_g'], 'pred_limit_app45_g': r0['pred_limit_app45_g'], 'pred_static_mu_g': r0['pred_static_mu_g']}
    row.update(th)
    if th['threshold_g'] is not None:
        row['err_g'] = round(th['threshold_g'] - r0['pred_limit_g'], 4)
        row['err_pct'] = round(100 * row['err_g'] / r0['pred_limit_g'], 1)
        row['err_app45_g'] = round(th['threshold_g'] - r0['pred_limit_app45_g'], 4)
        row['err_app45_pct'] = round(100 * row['err_app45_g'] / r0['pred_limit_app45_g'], 1)
        row['err_static_mu_g'] = round(th['threshold_g'] - r0['pred_static_mu_g'], 4)
        row['err_static_mu_pct'] = round(100 * row['err_static_mu_g'] / r0['pred_static_mu_g'], 1)
        # same threshold in the other deceleration measures (for reference)
        if r0['kind'] == 'brake':
            for name, k in (('threshold_kinematic_01s_g', 'peak_decel_01s_g'), ('threshold_plateau_mean_g', 'plateau_mean_decel_g')):
                t2 = threshold([r for r in runs if r.get(k) is not None], key=lambda r, k=k: r[k])
                row[name] = t2['threshold_g']
        on = [r['onset_horiz_deck_01s_g'] for r in runs if r['slid'] and r['onset_horiz_deck_01s_g'] is not None]
        row['onset_g_min'] = min(on) if on else None
    row['tipped_runs'] = sum(r['tipped'] for r in runs)
    row['left_bed_runs'] = sum(r['left_bed'] for r in runs)
    row['hit_headboard_runs'] = sum(r['hit_headboard'] for r in runs)
    row['penetrated_runs'] = sum(r['penetrated'] for r in runs)
    row['max_held_disp_mm'] = max([r['max_disp_mm'] for r in runs if not r['slid']], default=None)
    return row


def is_num(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def analyze():
    runs = load_runs()
    if not runs:
        print('no runs')
        return
    # runs.csv
    keys = []
    for r in runs:
        for k in r:
            if k not in keys:
                keys.append(k)
    for r in runs:
        r['app_says_slides'] = bool(demand(r) > r['pred_limit_g'])
        r['demand_g'] = demand(r)
        r['outcome'] = ('hit' if r['app_says_slides'] else 'MISS') if r['slid'] else ('false_alarm' if r['app_says_slides'] else 'correct_hold')
    keys += ['demand_g', 'app_says_slides', 'outcome']
    with (OUT / 'runs.csv').open('w', newline='', encoding='utf-8-sig') as f:
        w = csv.writer(f)
        w.writerow(keys)
        for r in runs:
            w.writerow([json.dumps(r.get(k)) if isinstance(r.get(k), (list, dict)) else ('' if r.get(k) is None else r.get(k)) for k in keys])

    by_cell = {}
    for r in runs:
        by_cell.setdefault(r['cell_id'], []).append(r)
    cells = {p: [cell_row(v) for v in by_cell.values() if v[0]['phase'] == p] for p in ('grid', 'repeat_same', 'repeat_v0', 'lateral', 'smoke')}
    grid = cells['grid']
    br = [c for c in grid if c['threshold_g'] is not None]

    # sanity checks
    nan_fields = [(r['run_id'], k) for r in runs for k, v in r.items() if is_num(v) and not math.isfinite(v)]
    gt = {(c['mass_kg'], c['belts'], c['t0_N']): c for c in grid}

    def bound(c):   # a comparable number: the threshold, or "at least" the largest held deceleration for cells that never slid
        return (c['threshold_g'], False) if c['threshold_g'] is not None else (c['lower_g'], True)

    mono = {'belts_violations': [], 'tension_violations': [], 'mass_violations': [], 'pairs_checked': 0}
    for (m, b, t), c in gt.items():
        for other, name in ((gt.get((m, b + 1, t)), 'belts_violations'), (gt.get((m, b, 1250.)) if t == 500. else None, 'tension_violations'),
                            (gt.get(({500.: 300., 300.: 100.}.get(m), b, t)), 'mass_violations')):
            if other is None or c['threshold_g'] is None:
                continue
            mono['pairs_checked'] += 1
            v, at_least = bound(other)
            if v is None or (v <= c['threshold_g'] and not at_least) or (at_least and v < c['threshold_g'] - 0.05):
                if not at_least or v is None or v < c['threshold_g'] - 0.05:
                    mono[name].append([c['cell_id'], c['threshold_g'], other['cell_id'], v, 'at least' if at_least else ''])
    main_runs = [r for r in runs if r['phase'] == 'grid']
    brake_runs = [r for r in runs if r['kind'] == 'brake' and r['phase'] != 'smoke']
    turn_runs = [r for r in runs if r['kind'] == 'turn' and r['phase'] != 'smoke']

    rep = {}
    for p in ('repeat_same', 'repeat_v0'):
        rows = cells[p]
        ths = [c['threshold_g'] for c in rows if c['threshold_g'] is not None]
        rep[p] = {'cells': [{k: c.get(k) for k in ('cell_id', 'v0_kmh', 'threshold_g', 'lower_g', 'upper_g', 'bracket_g', 'n_runs', 'err_g', 'err_pct')} for c in rows],
                  'threshold_stats': stats(ths), 'range_g': round(max(ths) - min(ths), 4) if ths else None}
        # identical commands: spread of the measured values run to run
        if p == 'repeat_same' and rows:
            by_t = {}
            for r in runs:
                if r['phase'] == p:
                    by_t.setdefault(r['target_g'], []).append(r)
            rep[p]['same_command_spread'] = [{'target_g': t, 'n': len(v), 'demand_min': min(demand(r) for r in v), 'demand_max': max(demand(r) for r in v),
                                              'disp_mm_min': min(r['max_disp_mm'] for r in v), 'disp_mm_max': max(r['max_disp_mm'] for r in v),
                                              'slid': sum(r['slid'] for r in v)} for t, v in sorted(by_t.items()) if len(v) > 1]
    ver = json.loads((OUT / 'versions.json').read_text(encoding='utf-8')) if (OUT / 'versions.json').exists() else {}
    py = r'C:\Users\DANHA\anaconda3\envs\env_isaacsim42\python.exe'
    summary = {
        'title': 'Slide-threshold validation of the app limit formula in Isaac Sim (simulation only, no real truck)',
        'date': '2026-11-15',
        'generated_utc': datetime.datetime.utcnow().isoformat(timespec='seconds') + 'Z',
        'software': ver,
        'physics': {'engine': 'PhysX (omni.physx + omni.physx.vehicle), CPU, headless, no rendering', 'physics_hz': int(round(1 / DT)),
                    'vehicle_substeps': 'high speed 4, low speed 6', 'cargo_solver_iterations': 'position 16, velocity 4',
                    'steps_per_wall_second': stats([r['steps_per_s'] for r in runs]), 'realtime_factor': stats([r['realtime_factor'] for r in runs])},
        'commands': ['set OMNI_KIT_ACCEPT_EULA=YES, PYTHONUTF8=1',
                     py + r' C:\Users\DANHA\DigitalTwinWorkspace\IsaacTwin\sim_real_truck\campaign_threshold.py --phase all',
                     py + r' C:\Users\DANHA\DigitalTwinWorkspace\IsaacTwin\sim_real_truck\campaign_threshold.py --phase analyze'],
        'model': {'truck': PV5['name'], 'cargo': 'box %s m' % (BOX['size'],), 'deck_friction_static': BOX['mu'], 'deck_friction_sliding': round(0.8 * BOX['mu'], 3),
                  'strap_angle_deg': round(strap_angle_deg(BOX['size']), 2), 'front_gap_m': FRONT_GAP, 'belt_stiffness_n_per_m': STRAP['stiffness_n_per_m'],
                  'v0_kmh': V0_KMH, 'brake_ramp_s': BRAKE_RAMP_S, 'brake_feed_forward_g_per_cmd': BRAKE_G_PER_CMD},
        'grid': {'masses_kg': MASSES, 'belts': BELTS, 'tensions_N': TENSIONS, 'cells': len(grid), 'method':
                 'full-braking run, lowest run (target %.2f g), then %d bisection steps on the brake target; cells that hold at full braking get a 0.4/0.6/0.8 g ladder instead' % (T_LO, N_BISECT)},
        'definitions': {'slid': 'cargo moved more than %.0f mm relative to the bed (from its place just before the manoeuvre)' % SLIDE_MM,
                        'tipped': 'cargo tilt %.0f deg or more' % TIP_DEG, 'left_bed': 'cargo centre outside the bed outline at any time',
                        'penetrated': 'cargo more than 15 mm past the headboard face or 10 mm into the deck (such runs are excluded)',
                        'demand_g (brake)': 'peak of the 0.1 s mean deck deceleration as a deck-fixed accelerometer reads it (includes the pitch tilt of the deck): peak_decel_deck_01s_g',
                        'demand_g (turn)': 'peak of the 0.1 s mean horizontal acceleration in the deck plane (deck-fixed accelerometer): peak_horiz_deck_01s_g',
                        'threshold_g': 'midpoint between the highest demand that held and the lowest demand that slid in that cell',
                        'pred_limit_g': '0.8 x mu x (1 + 2 x belts x T0 x sin(angle) / (m g)), angle = real strap angle of the model (%.1f deg)' % strap_angle_deg(BOX['size']),
                        'pred_limit_app45_g': 'same with the app kit-less default angle 45 deg',
                        'pred_static_mu_g': 'same with the factor 0.8 left out (reference only: the simulated deck has static friction mu and sliding friction 0.8 mu)',
                        'app_says_slides': 'demand_g > pred_limit_g'},
        'counts': {'runs_total': len(runs), 'by_phase': {p: sum(r['phase'] == p for r in runs) for p in sorted({r['phase'] for r in runs})},
                   'slid': sum(r['slid'] for r in runs), 'tipped': sum(r['tipped'] for r in runs), 'left_bed': sum(r['left_bed'] for r in runs),
                   'hit_headboard': sum(r['hit_headboard'] for r in runs), 'penetrated_excluded': sum(r['penetrated'] for r in runs)},
        'threshold_table_brake': grid,
        'error_stats_brake': {
            'cells_with_threshold': len(br), 'cells_no_slide_up_to_full_braking': [c['cell_id'] for c in grid if c['status'].startswith('no slide')],
            'cells_other': [[c['cell_id'], c['status']] for c in grid if c['status'] not in ('bracketed', 'no slide up to full braking')],
            'sim_minus_pred_g': stats([c['err_g'] for c in br]), 'sim_minus_pred_pct': stats([c['err_pct'] for c in br]),
            'sim_minus_pred_app45_g': stats([c['err_app45_g'] for c in br]), 'sim_minus_pred_app45_pct': stats([c['err_app45_pct'] for c in br]),
            'sim_minus_static_mu_g': stats([c['err_static_mu_g'] for c in br]), 'sim_minus_static_mu_pct': stats([c['err_static_mu_pct'] for c in br]),
            'bracket_width_g': stats([c['bracket_g'] for c in br]),
            'kinematic_threshold_minus_pred_g': stats([c['threshold_kinematic_01s_g'] - c['pred_limit_g'] for c in br if c.get('threshold_kinematic_01s_g') is not None]),
            'kinematic_threshold_minus_pred_pct': stats([100 * (c['threshold_kinematic_01s_g'] - c['pred_limit_g']) / c['pred_limit_g'] for c in br if c.get('threshold_kinematic_01s_g') is not None]),
            'plateau_mean_threshold_minus_pred_pct': stats([100 * (c['threshold_plateau_mean_g'] - c['pred_limit_g']) / c['pred_limit_g'] for c in br if c.get('threshold_plateau_mean_g') is not None]),
            'note_kinematic': 'the same thresholds expressed as the plain change of speed (no deck tilt). The deck pitches nose-down about 1 to 2 deg while braking, which adds about 0.02 to 0.03 g to what the cargo and a deck-fixed accelerometer feel',
            'cells_where_sim_threshold_below_prediction': [c['cell_id'] for c in br if c['err_g'] < 0]},
        'confusion_matrix': {
            'grid_brake_runs': confusion(main_runs), 'all_brake_runs': confusion(brake_runs), 'all_runs_incl_lateral': confusion(brake_runs + turn_runs),
            'lateral_runs': confusion(turn_runs),
            'all_brake_runs_app45_angle': confusion(brake_runs, 'pred_limit_app45_g'),
            'all_brake_runs_kinematic_decel': confusion(brake_runs, 'pred_limit_g', key=lambda r: r['peak_decel_01s_g'])},
        'repeatability': rep,
        'lateral': {'cells': cells['lateral'], 'note': 'steady turn at %.0f km/h, no braking in the measured window; same limit formula' % V0_KMH},
        'sanity': {'nan_or_inf_fields': nan_fields, 'monotonic': mono,
                   'threshold_inversions_cells': [[c['cell_id'], c['inversions']] for p in cells.values() for c in p if c['inversions']],
                   'penetrated_runs': [r['run_id'] for r in runs if r['penetrated']],
                   'max_displacement_of_held_runs_mm': max([r['max_disp_mm'] for r in runs if not r['slid']], default=None),
                   'min_displacement_of_slid_runs_mm': min([r['max_disp_mm'] for r in runs if r['slid']], default=None),
                   'pre_brake_tension_over_nominal': stats([r['T_pre_mean_N'] / r['t0_N'] for r in runs]),
                   'pre_manoeuvre_drift_mm_max': max(r['pre_drift_mm'] for r in runs)},
        'limits': ['simulation only, no real truck was driven', 'sensors are not simulated: values are read from the true simulated state, so this checks the judgement logic and the physics model, not sensor accuracy',
                   'one cargo shape (box 1.0 x 0.8 x 0.8 m), one deck friction (0.30 static / 0.24 sliding), strap angle fixed by that geometry',
                   'vehicle parameters partly assumed (see spec.py); maximum braking of the model is about 0.95 g'],
    }
    held_d = sorted(r['max_disp_mm'] for r in runs if not r['slid'])
    summary['sanity']['held_runs_displacement_mm'] = {'n': len(held_d), 'median': held_d[len(held_d) // 2], 'p90': held_d[int(len(held_d) * 0.9)], 'max': held_d[-1],
                                                      'count_5_to_10_mm': sum(d >= 5 for d in held_d)}
    summary['sanity']['slid_runs_max_displacement_mm'] = max(r['max_disp_mm'] for r in runs if r['slid'])
    summary['sanity']['peak_pitch_deg_range_brake'] = [min(r['peak_pitch_deg'] for r in brake_runs), max(r['peak_pitch_deg'] for r in brake_runs)]
    summary['sanity']['max_demand_reached_g'] = max(demand(r) for r in brake_runs)
    (OUT / 'summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=1), encoding='utf-8')
    print('ANALYZE_DONE runs', len(runs), 'cells', len(grid), 'bracketed', len(br))
    for c in grid + cells['lateral']:
        print(' ', c['cell_id'], 'pred', c['pred_limit_g'], 'thr', c['threshold_g'], '[', c['lower_g'], c['upper_g'], ']', c.get('err_g'), c.get('err_pct'), c['status'])
    print(json.dumps({k: summary[k] for k in ('counts', 'error_stats_brake', 'confusion_matrix', 'sanity')}, ensure_ascii=False, indent=1))
    print(json.dumps(rep, ensure_ascii=False))


if __name__ == '__main__':
    if args.phase == 'analyze':
        analyze()
    else:
        simulate(args.phase)
