"""숏폼용 실사 장면: 화물차 기사가 앱을 쓰고 적재물 사고를 막는 이야기 (Omniverse RTX 경로 추적, 1920x1080, 24 fps, 글자 없음).

  python sim_real_truck/render_drive.py S3            # 장면 하나를 통째로 (results/hero_drive/S3/fNNNN.png + values.json)
  python sim_real_truck/render_drive.py S2 preview    # 처음 · 가운데 · 끝 3장만 (results/hero_drive/_preview/)
  APP_SCREEN_PNG=<앱 화면.png> python sim_real_truck/render_drive.py S2     # 앱 화면만 바꿔 S2 다시 렌더
  python sim_real_truck/finish_drive.py               # mp4 · sheet.jpg · notes.json (Isaac 없이)

  S1 출발 전: 쉼터에 선 차, 적재함 옆에서 벨트를 잡은 기사, 눈높이 3/4, 느린 이동
  S2 차 안: 대시보드 화면 (APP_SCREEN_PNG 를 빛나는 판에 입힌다), 앞에 기사 팔
  S3 급제동: 시속 50 km, 벨트 4개, 짐이 그대로 (물리 먼저 기록 -> 멈춤 -> 기록한 자세로 렌더)
  S4 쉼터에서 다시 조이기: 기사 어깨 너머로 짐
  S5 반례: 벨트 2개, 같은 제동 · 같은 카메라, 짐이 밀린다

차 · 길 · 숲 · 벨트는 render_hero.py (HeroLook), 물리는 pv5sim.TruckSim (PhysX 240 Hz), 사람은 NVIDIA Isaac People 의
male_adult_construction_03 (assets/nvidia/people 에 받아 둔 것, scripts/forest_scene.SkinnedOperator 로 자세를 잡는다).
운전석 안은 겉모양(흰 상자)에 없어서 S2 에서만 대시보드 · 운전대 · 좌석 · 화면을 따로 만든다.
"""
import json
import math
import os
import sys
import time
from pathlib import Path

os.environ.setdefault('OMNI_KIT_ACCEPT_EULA', 'YES')
os.environ.pop('HERO_BED', None)
os.environ.pop('HERO_VERT', None)
import isaacsim
from isaacsim import SimulationApp

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
SHOT = sys.argv[1] if len(sys.argv) > 1 else 'S3'
PREVIEW = len(sys.argv) > 2 and sys.argv[2] == 'preview'
W, H, FPS = 1920, 1080, 24
KIT = Path(sys.executable).parent / 'Lib/site-packages/isaacsim/apps/isaac_twin_light.kit'
app = SimulationApp({'headless': True, 'renderer': 'PathTracing', 'width': W, 'height': H}, experience=str(KIT))
isaacsim.SimulationApp = lambda *a, **k: app          # render_hero 가 두 번째 앱을 띄우지 못하게
_argv = sys.argv[:]
sys.argv = [_argv[0], 'video']
sys.path.insert(0, str(HERE))
import render_hero as rh  # noqa: E402
sys.argv = _argv
rh.W, rh.H = W, H
rh.look_base.set_size(W, H)
rh.SUB = int(os.environ.get('DRIVE_SUB', '4'))

import carb  # noqa: E402
import numpy as np  # noqa: E402
from PIL import Image  # noqa: E402
from pxr import Gf, Sdf, UsdGeom  # noqa: E402

import forest_scene as fs  # noqa: E402
from forest_scene import axis_rotation, two_bone_joint  # noqa: E402
from pv5sim import DT, Case  # noqa: E402
from spec import CARGO, PV5, STRAP  # noqa: E402

mp, tg = rh.mp, rh.tg
S = carb.settings.get_settings()
S.set('/rtx/pathtracing/spp', int(os.environ.get('DRIVE_SPP', '16')))
OUT = HERE / 'results' / 'hero_drive'
APP_SCREEN = Path(os.environ.get('APP_SCREEN_PNG', r'C:\Users\DANHA\DigitalTwinWorkspace\jaejeok-app\tools\e2e\shots\nav\05_park_green_1080_night.png'))
CHARACTER = 'NVIDIA Isaac Sim 4.2 People: Characters/male_adult_construction_03 (local copy in assets/nvidia/people), posed by IK, navy delivery outfit'


# ── 사람 ──
class Driver(fs.SkinnedOperator):
    """서 있거나 앉은 자세를 손 · 발 목표로 잡는다. 뼈대 좌표: X 왼쪽, Y 뒤(-앞), Z 위, 원점 = 발 밑 (m)"""

    def ik(self, hands, hip=(0., 0., -.03), spine_deg=8., feet=None, knees=None, foot_deg=0., head=(0., 0.), elbow=None):
        R = self.rest_R.copy()
        t = self.rest_t.copy()
        Rg = np.empty_like(self.rest_Rg)
        tg_ = np.empty_like(self.rest_tg)
        hipj = self.j['Hip']
        thighs = (self.legs[1][0], self.legs[-1][0])
        calves = (self.legs[1][1], self.legs[-1][1])
        footj = (self.legs[1][2], self.legs[-1][2])
        uppers = (self.arms[1][0], self.arms[-1][0])
        fores = (self.arms[1][1], self.arms[-1][1])
        targets = {}
        for j, p in enumerate(self.parents):
            if j in self.curl:
                R[j] = R[j] @ self.curl[j]
            if p < 0:
                Rg[j], tg_[j] = R[j], t[j]
            else:
                Rg[j] = Rg[p] @ R[j]
                tg_[j] = Rg[p] @ t[j] + tg_[p]
            if j == hipj:
                tg_[j] = tg_[j] + np.asarray(hip, float)
                self._set(j, p, Rg[j], R, Rg, t, tg_)
            elif j in self.spine:
                self._set(j, p, axis_rotation((1, 0, 0), math.radians(spine_deg) / 3) @ Rg[j], R, Rg, t, tg_)
            elif j in thighs:
                side = 1 if j == thighs[0] else -1
                calf, foot = self.legs[side][1], self.legs[side][2]
                goal = np.asarray(feet[side], float) if feet else self.rest_tg[foot]
                pole = (np.asarray(knees[side], float) - tg_[j]) if knees else np.array([side * .15, -1., 0.])
                knee, reach = two_bone_joint(tg_[j], goal, np.linalg.norm(self.rest_t[calf]), np.linalg.norm(self.rest_t[foot]), pole)
                targets[calf] = reach
                self._aim(j, p, calf, knee, R, Rg, t, tg_)
            elif j in calves:
                self._aim(j, p, self.legs[1 if j == calves[0] else -1][2], targets[j], R, Rg, t, tg_)
            elif j in footj:
                self._set(j, p, axis_rotation((1, 0, 0), math.radians(foot_deg)) @ self.rest_Rg[j], R, Rg, t, tg_)
            elif j in uppers:
                side = 1 if j == uppers[0] else -1
                fore, hand = self.arms[side][1], self.arms[side][2]
                goal = np.asarray(hands[side], float)
                wrist = goal + .07 * (tg_[j] - goal) / np.linalg.norm(tg_[j] - goal)
                pole = np.asarray((elbow or {}).get(side, (side * .6, .3, -1.)), float)
                mid, reach = two_bone_joint(tg_[j], wrist, np.linalg.norm(self.rest_t[fore]), np.linalg.norm(self.rest_t[hand]), pole)
                targets[fore] = reach
                self._aim(j, p, fore, mid, R, Rg, t, tg_)
            elif j in fores:
                self._aim(j, p, self.arms[1 if j == fores[0] else -1][2], targets[j], R, Rg, t, tg_)
            elif j == self.head:
                turn = axis_rotation((0, 0, 1), math.radians(head[0])) @ axis_rotation((1, 0, 0), math.radians(head[1]))
                self._set(j, p, turn @ Rg[j], R, Rg, t, tg_)
        from pxr import Vt
        self.rotations.Set(Vt.QuatfArray([Gf.Quatf(*fs.mat_to_quat(r)) for r in R]))
        self.translations.Set(Vt.Vec3fArray.FromNumpy(t.astype(np.float32)))
        delta = Rg[self.head] @ self.rest_Rg[self.head].T
        quat = Gf.Quatf(*fs.mat_to_quat(delta))
        for ops, offset in self.cap:
            ops[0].Set(Gf.Vec3d(*map(float, tg_[self.head] + delta @ offset)))
            ops[1].Set(quat)


class Placed:
    """세계 좌표에 놓은 기사. 차체 기준 점을 뼈대 좌표로 바꿔 준다"""

    def __init__(self, sim, look, at_vehicle, face_deg, ground=True):
        self.sim = sim
        P, R, CP, CR = sim.poses()
        self.P, self.R = P, R
        yaw = math.atan2(R[1, 0], R[0, 0]) + math.radians(face_deg)       # face_deg: 차 앞 방향에서 왼쪽으로
        pos = P + R @ np.asarray(at_vehicle, float)
        if ground:
            pos[2] = look.gz - .002
        self.pos, self.yaw = pos, yaw
        self.d = Driver(sim.stage, '/World/Driver', outfit='delivery')
        # 모자 몸통을 뒤 · 위로 조금 (뒤에서 보면 정수리가 드러났다)
        ops, off = self.d.cap[0]
        self.d.cap[0] = (ops, off + np.array([0., .05, .02]))
        ops[2].Set(Gf.Vec3f(.108, .124, .09))
        fs.pose(self.d.prim, pos, (0, 0, math.degrees(yaw)))

    def skel(self, p_vehicle):
        w = self.P + self.R @ np.asarray(p_vehicle, float) - self.pos
        c, s = math.cos(-self.yaw), math.sin(-self.yaw)
        lx, ly = c * w[0] - s * w[1], s * w[0] + c * w[1]
        return np.array([ly, -lx, w[2]])


# ── 장면 손질 ──
def park(sim, look, along=0.):
    """차를 길가 쉼터(포장한 터)에 세운 것처럼: 길 · 숲을 옆으로 8.7 m 옮기고 그 자리에 포장을 깐다 (차 · 물리는 그대로)"""
    st = sim.stage
    car = sim._vehicle_origin_world()
    side = 8.7
    asphalt = st.GetPrimAtPath('/World/Materials/AsphaltReal')
    from pxr import UsdShade
    x0, y0 = car[0] - along, car[1] - side
    tg.rounded_box(st, '/World/Look/Pad', (x0 - 30, y0 - 3.4, look.gz - .06), (x0 + 38, car[1] - 5.55, look.gz + .001), 0.0, UsdShade.Material(asphalt), uv_scale=3.)
    paint = UsdShade.Material(st.GetPrimAtPath('/World/Materials/LinePaint'))
    for k, x in enumerate(np.arange(x0 - 27, x0 + 36, 9.)):
        tg.rounded_box(st, f'/World/Look/Bay{k}', (x, y0 - 2.2, look.gz + .001), (x + .12, y0 + 2.2, look.gz + .004), 0.0, paint)
    tg.rounded_box(st, '/World/Look/BayEdge', (x0 - 30, y0 + 2.6, look.gz + .001), (x0 + 38, y0 + 2.72, look.gz + .004), 0.0, paint)
    root = st.DefinePrim('/World/Look', 'Xform')
    UsdGeom.Xformable(root).AddTranslateOp().Set(Gf.Vec3d(float(along), float(side), 0.))


def belt_points(sim, i):
    """i 번째 벨트의 왼쪽 고리, 버클 자리, 짐 위 모서리 (차체 기준)"""
    l, w, h = sim.case.size
    xs = sim.strap_x[i]
    hook = np.array([xs, PV5['bed']['w'] / 2 - STRAP['hook_inset'], sim.deck_top + .012])
    edge = np.array([xs, w / 2 + .012, sim.deck_top + h + .006])
    return hook, hook + (edge - hook) * .34, edge


def screen_material(st):
    A, C3, F, B = Sdf.ValueTypeNames.Asset, Sdf.ValueTypeNames.Color3f, Sdf.ValueTypeNames.Float, Sdf.ValueTypeNames.Bool
    return mp.mdl(st, 'AppScreen', 'OmniPBR.mdl', {
        'diffuse_color_constant': (C3, Gf.Vec3f(0, 0, 0)), 'reflection_roughness_constant': (F, .25), 'specular_level': (F, .3),
        'enable_emission': (B, True), 'emissive_color': (C3, Gf.Vec3f(1, 1, 1)),
        'emissive_color_texture': (A, Sdf.AssetPath(str(APP_SCREEN).replace('\\', '/'))),
        'emissive_intensity': (F, float(os.environ.get('APP_SCREEN_NITS', '2500')))})


SEAT = {'root': (0.70, 0.42, -0.55), 'hip_z': .50, 'knee': (.40, .50), 'pedal': (.70, .10)}
WHEEL = {'c': (1.10, 0.42, 0.13), 'r': .185, 'tilt': 24.}
SCREEN = {'c': (1.30, 0.0, 0.425), 'w': .36, 'h': .2025, 'tilt': 12., 'yaw': 8.}


def cabin(sim, look):
    """운전석 안 (S2 만): 겉 상자를 감추고 대시보드 · 운전대 · 좌석 · 기둥 · 지붕 · 화면을 놓는다. 차체 기준"""
    st = sim.stage
    lk = sim.vp + '/Look'
    for n in ('CabLow', 'CabUp', 'Wind', 'WinL', 'WinR', 'MirrorL', 'MirrorR'):
        prim = st.GetPrimAtPath(f'{lk}/{n}')
        if prim:
            UsdGeom.Imageable(prim).CreatePurposeAttr('guide')
    c = lk + '/Cabin'
    soft = mp.pbr(st, 'CabinSoft', (.045, .047, .052), .7, 0.)
    seat = mp.pbr(st, 'CabinSeat', (.10, .105, .115), .85, 0.)
    trim = mp.pbr(st, 'CabinTrim', (.16, .165, .175), .5, 0.)
    paint = st.GetPrimAtPath('/World/Materials/PaintReal')
    from pxr import UsdShade
    paint = UsdShade.Material(paint)
    Wc = PV5['body'][1] / 2
    tg.rounded_box(st, c + '/Floor', (-.05, -Wc, -.60), (1.90, Wc, -.55), .0, soft)
    tg.rounded_box(st, c + '/Dash', (1.26, -Wc + .03, -.10), (1.88, Wc - .03, .30), .05, soft)
    tg.rounded_box(st, c + '/DashLower', (1.40, -Wc + .03, -.55), (1.88, Wc - .03, -.08), .03, soft)
    tg.rounded_box(st, c + '/Binnacle', (1.36, .24, .28), (1.62, .60, .40), .04, soft)
    tg.rounded_box(st, c + '/Console', (.55, -.12, -.55), (1.30, .12, -.18), .04, trim)
    tg.rounded_box(st, c + '/Roof', (-.07, -Wc, .93), (1.55, Wc, .99), .02, paint)
    tg.rounded_box(st, c + '/Back', (-.07, -Wc, -.60), (-.02, Wc, .93), .01, soft)
    for side in (1, -1):
        y = side * Wc
        tg.rounded_box(st, c + f'/Door{side + 1}', (-.05, min(y, y - side * .05), -.60), (1.90, max(y, y - side * .05), .30), .01, soft)
        tg.cylinder_between(st, c + f'/PillarA{side + 1}', (1.90, y - side * .03, .30), (1.52, y - side * .08, .96), .05, paint)
        tg.cylinder_between(st, c + f'/PillarB{side + 1}', (.02, y - side * .03, .30), (.02, y - side * .06, .95), .05, paint)
        ys = side * SEAT['root'][1]
        x = SEAT['root'][0]
        tg.rounded_box(st, c + f'/SeatCushion{side + 1}', (x - .16, ys - .26, -.24), (x + .36, ys + .26, -.13), .04, seat)
        tg.rounded_box(st, c + f'/SeatBack{side + 1}', (x - .30, ys - .25, -.16), (x - .17, ys + .25, .52), .05, seat)
        tg.rounded_box(st, c + f'/Headrest{side + 1}', (x - .30, ys - .12, .55), (x - .19, ys + .12, .74), .04, seat)
    # 운전대 (왼쪽 자리): 테는 Z 축 둘레로 돌려 만든 뒤 기울여 놓는다. 위쪽이 운전자에게서 멀다
    s_, c_ = math.sin(math.radians(WHEEL['tilt'])), math.cos(math.radians(WHEEL['tilt']))
    Rw = np.stack([np.array([0., 1., 0.]), np.array([s_, 0., c_]), np.array([c_, 0., -s_])], axis=1)
    wh = st.DefinePrim(c + '/Wheel', 'Xform')
    rr = WHEEL['r']
    tg.lathe(st, c + '/Wheel/Rim', [(rr - .017, -.017), (rr + .017, -.017), (rr + .017, .017), (rr - .017, .017)], soft, 48)
    tg.lathe(st, c + '/Wheel/Hub', [(0., -.03), (.075, -.03), (.075, .03), (0., .03)], soft, 24)
    tg.rounded_box(st, c + '/Wheel/Spoke', (-rr + .01, -.018, -.012), (rr - .01, .018, .012), .008, trim)
    tg.rounded_box(st, c + '/Wheel/Spoke2', (-.018, -rr + .01, -.012), (.018, 0., .012), .008, trim)
    rh.set_matrix(wh, Rw, np.array(WHEEL['c']))
    wc = np.array(WHEEL['c'])
    tg.cylinder_between(st, c + '/Column', wc, wc + Rw[:, 2] * .34, .03, soft)
    # 화면: 대시보드 가운데에 선 가로 화면 (빛나는 판 + 검은 테)
    sc = SCREEN
    Rz = axis_rotation((0, 0, 1), math.radians(-sc['yaw']))
    u = Rz @ np.array([0., -1., 0.])                                     # 보는 사람의 오른쪽
    t_ = math.radians(sc['tilt'])
    v = Rz @ np.array([math.sin(t_), 0., math.cos(t_)])                  # 화면의 위 (위쪽이 뒤로 눕는다)
    n = np.cross(u, v)                                                   # 보는 사람 쪽 (판의 앞면 = u x v)
    C = np.array(sc['c'])

    def quad(path, hw, hh, off, mat):
        cs = [C + n * off - u * hw - v * hh, C + n * off + u * hw - v * hh, C + n * off + u * hw + v * hh, C + n * off - u * hw + v * hh]
        return rh.quad(st, path, cs, mat)

    bezel = mp.pbr(st, 'ScreenBezel', (.008, .008, .01), .2, 0., .6)
    quad(c + '/ScreenBezel', sc['w'] / 2 + .012, sc['h'] / 2 + .012, 0., bezel).CreateDoubleSidedAttr(True)
    quad(c + '/Screen', sc['w'] / 2, sc['h'] / 2, .002, screen_material(st))
    tg.cylinder_between(st, c + '/ScreenStand', C - n * .012 - v * (sc['h'] / 2), C - n * .012 - v * (sc['h'] / 2 + .12), .03, soft)
    return C, u, v, n


def lerp(a, b, k):
    return np.asarray(a, float) * (1 - k) + np.asarray(b, float) * k


def ease(k):
    return k * k * (3 - 2 * k)


def render(name, n, frame_fn, values=None, notes=None):
    """frame_fn(i, k) 가 장면을 그 프레임 상태로 놓고 (눈, 보는 곳, 초점거리) 를 돌려준다"""
    cam = rh.Cam()
    out = (OUT / '_preview') if PREVIEW else (OUT / name)
    out.mkdir(parents=True, exist_ok=True)
    idx = sorted({0, n // 2, n - 1}) if PREVIEW else list(range(n))
    if not PREVIEW:
        for f in out.glob('f*.png'):
            f.unlink()
    t0 = time.time()
    first = True
    for i in idx:
        eye, tgt, focal = frame_fn(i, i / max(1, n - 1))
        cam.shot(SIM[0].stage, eye, tgt, focal, 0.)
        img = cam.grab(8 if first else 1)
        first = False
        Image.fromarray(img).save(out / (f'{name}_{i:04d}.png' if PREVIEW else f'f{i:04d}.png'))
        if i % 12 == 0:
            print('FRAME', name, i, '%.1f s/frame' % ((time.time() - t0) / (idx.index(i) + 1)), flush=True)
    spf = (time.time() - t0) / len(idx)
    info = dict(notes or {}, shot=name, frames=n, fps=FPS, seconds=round(n / FPS, 2), s_per_frame=round(spf, 1), size=[W, H],
                renderer='RTX Path Tracing %d spp x %d subframes, OptiX denoiser' % (S.get('/rtx/pathtracing/spp'), rh.SUB), physics_hz=round(1 / DT))
    if values is not None:
        info['frame_values'] = values
    if not PREVIEW:
        (out / 'values.json').write_text(json.dumps(info, ensure_ascii=False, indent=1), encoding='utf-8')
    print('SHOT_DONE', name, len(idx), 'frames %.1f s/frame' % spf, flush=True)


SIM = [None]


def box_scene(belts):
    box = CARGO['box']
    sim, look = rh.scene(Case('box', 300., box['size'], box['mu'], belts, 1250., 0.35), 'box')
    SIM[0] = sim
    return sim, look


CARGO_NOTE = 'box 300 kg 1.0x0.8x0.8 m, friction 0.30, ratchet belts at 1250 N'


# ── 장면 ──
def at_bed(shot):
    """S1 · S4: 쉼터에 선 차, 적재함 왼쪽에 선 기사"""
    sim, look = box_scene(4)
    park(sim, look, along=0. if shot == 'S1' else -70.)
    P, R, CP, CR = sim.poses()
    man = Placed(sim, look, (-1.02, 1.23, 0.), -90.)                    # 차 왼쪽에서 차를 본다
    hook_r, buckle_r, edge_r = belt_points(sim, 1)                       # 기사의 오른손 쪽 벨트 (차 뒤쪽)
    hook_l, buckle_l, edge_l = belt_points(sim, 2)
    gate_top = sim.deck_top + PV5['bed']['side_h']
    if shot == 'S1':
        n = 66
        right = hook_r + (edge_r - hook_r) * .62                         # 벨트 위쪽을 잡는다
        left = np.array([hook_l[0] + .05, PV5['bed']['w'] / 2 + .02, gate_top + .03])   # 문짝 위에 얹은 손
        man.d.ik({1: man.skel(left), -1: man.skel(right)}, spine_deg=13., head=(-8., 14.))

        def frame(i, k):
            e = ease(k)
            return P + R @ lerp((-5.3, 3.9, .45), (-4.6, 4.3, .50), e), P + R @ np.array([-.95, .65, -.05]), 33.

        notes = {'shows': 'Before departure: truck parked in a lay-by, driver standing at the left side of the bed with the right hand on a ratchet belt and the left hand on the gate; eye-level three-quarter, slow dolly',
                 'belts': 4}
    else:
        n = 60

        def frame(i, k):
            pump = .035 * math.sin(2 * math.pi * 1.2 * i / FPS)          # 라쳇 손잡이를 젓는 손
            along = (edge_r - hook_r) / np.linalg.norm(edge_r - hook_r)
            right = buckle_r + along * .10 + np.array([0., .02, .05 + pump])
            left = hook_l + (edge_l - hook_l) * .66
            man.d.ik({1: man.skel(left), -1: man.skel(right)}, spine_deg=17., head=(6., 8.))
            e = ease(k)
            return P + R @ lerp((-2.45, 2.75, .82), (-2.2, 2.45, .78), e), P + R @ np.array([-1.0, .45, .12]), 32.

        notes = {'shows': 'Rest stop: truck parked in a lay-by, driver at the bed again working the ratchet of a belt; camera behind the driver toward the cargo, slow push-in. The right hand moves 3.5 cm up and down (the only animation)',
                 'belts': 4}
    notes.update(character=True, character_asset=CHARACTER, cargo=CARGO_NOTE, speed_kmh=0, decel_g=0, cargo_shift_cm=0.)
    render(shot, n, frame, notes=notes)


def in_cab():
    """S2: 차 안, 대시보드 화면"""
    sim, look = box_scene(4)
    park(sim, look, along=-30.)
    P, R, CP, CR = sim.poses()
    C, u, v, nrm = cabin(sim, look)
    root = np.array(SEAT['root'])
    man = Placed(sim, look, root, 0., ground=False)
    hipz = SEAT['hip_z'] - man.d.rest_tg[man.d.j['Hip']][2]
    s_, c_ = math.sin(math.radians(WHEEL['tilt'])), math.cos(math.radians(WHEEL['tilt']))
    a = math.radians(55.)
    rim = np.array(WHEEL['c']) + np.array([0., 1., 0.]) * WHEEL['r'] * math.sin(a) + np.array([s_, 0., c_]) * WHEEL['r'] * math.cos(a)
    touch = C - u * (SCREEN['w'] * .30) - v * (SCREEN['h'] * .34) + nrm * .035       # 화면 왼쪽 아래 (기사 쪽)에 뻗은 오른손
    feet = {side: np.array([side * .14, -SEAT['pedal'][0], SEAT['pedal'][1]]) for side in (1, -1)}
    knees = {side: np.array([side * .14, -SEAT['knee'][0], SEAT['knee'][1]]) for side in (1, -1)}
    man.d.ik({1: man.skel(rim), -1: man.skel(touch)}, hip=(0., 0., hipz), spine_deg=14., feet=feet, knees=knees, foot_deg=-25., head=(-18., 10.),
             elbow={-1: (-.5, .2, -1.)})
    n = 60

    def frame(i, k):
        e = ease(k)
        return P + R @ lerp((.40, -.10, .66), (.62, -.07, .60), e), P + R @ lerp(C + np.array([0., .06, -.03]), C + np.array([0., .02, -.01]), e), 30.

    render('S2', n, frame, notes={'shows': 'In the cab: the dashboard display showing the app screen (emissive plane textured from APP_SCREEN_PNG), driver seated on the left with the right arm reaching to the screen and the left hand on the wheel; slow push-in. Cab interior (dash, wheel, seats, pillars, roof) is a set built for this shot only',
                                  'app_screen_png': str(APP_SCREEN), 'app_screen_nits': float(os.environ.get('APP_SCREEN_NITS', '2500')), 'belts': 4,
                                  'character': True, 'character_asset': CHARACTER, 'cargo': CARGO_NOTE, 'speed_kmh': 0, 'decel_g': 0, 'cargo_shift_cm': 0.})


def braking(shot):
    """S3 (벨트 4개) · S5 (벨트 2개): 시속 50 km 급제동. 물리 먼저, 그다음 기록한 자세로 렌더"""
    belts = 4 if shot == 'S3' else 2
    sim, look = box_scene(belts)
    per = int(round((1 / FPS) / DT))
    win = max(1, int(round(0.1 / DT)))
    k = [0]
    rec = []

    def keep():
        k[0] += 1
        if k[0] % per:
            return
        ax = np.array(sim.rec.ax[-win:], float)
        rec.append({'poses': tuple(np.array(x, float) for x in sim.poses()),
                    'v': {'t': round(sim.t, 3), 'kmh': round(float(sim.rec.kmh[-1]), 2), 'decel_g': round(float(-ax.mean()), 3),
                          'shift_cm': round(float(sim.rec.dx[-1] * 100), 2), 'belt_N': [round(float(x)) for x in sim.rec.T[-1]]}})

    sim.launch(50 / 3.6)
    while sim.t < 2.0:
        sim.step()
        keep()
    n_cruise = len(rec)
    rh.brake_to_stop(sim, each=keep, hold=2.0)
    stop = next(i for i, r in enumerate(rec) if i > n_cruise and r['v']['kmh'] < 0.2)
    peak = max(r['v']['decel_g'] for r in rec)
    print('RECORDED', shot, len(rec), 'brake at frame', n_cruise, 'stopped at', stop, 'peak %.2f g' % peak, 'shift %.1f cm' % rec[-1]['v']['shift_cm'],
          'on_bed', sim.rec.on_bed[-1], 'tilt %.1f' % sim.rec.tilt[-1], flush=True)
    if shot == 'S3':
        i0, i1 = n_cruise - 10, stop + 16                                # 제동 0.4 s 전부터 정차 0.7 s 뒤까지 (약 3 s)
    else:
        i0, i1 = n_cruise - 4, n_cruise + 32                             # 밀리는 순간만 1.5 s
    i0, i1 = max(0, i0), min(len(rec), i1)
    use = rec[i0:i1]
    sim.sim.stop()
    vp = sim.stage.GetPrimAtPath(sim.vp)
    R0 = rec[0]['poses'][1]
    v0 = 50.

    def frame(i, kk):
        r = use[i]
        P, R = r['poses'][0], r['poses'][1]
        rh.set_matrix(vp, R, P)
        look.sync_cargo(r['poses'])
        look.straps_mesh(r['poses'])
        slow = ease(float(np.clip(1 - r['v']['kmh'] / v0, 0., 1.)))      # 차가 설수록 카메라가 조금 앞으로 나간다 (따라가던 카메라처럼)
        eye = P + R0 @ (np.array([-5.4, 3.5, .95]) + np.array([1.3, .25, .1]) * slow)
        return eye, P + R0 @ np.array([-.75, 0., .05]), 35.

    notes = {'shows': ('Hard braking from 50 km/h with 4 belts: the box stays in place' if shot == 'S3' else 'Counter-example: the same braking with 2 belts, same camera: the box slides forward')
             + '. Tracking camera at the rear-left three-quarter, drifting forward as the truck stops. Real PhysX run recorded at 24 fps, then replayed for rendering',
             'belts': belts, 'character': False, 'character_asset': None, 'cargo': CARGO_NOTE, 'speed_kmh_start': 50, 'peak_decel_g': round(peak, 3),
             'peak_decel_note': '0.1 s mean of bed acceleration', 'cargo_shift_cm_end_of_run': rec[-1]['v']['shift_cm'], 'cargo_shift_cm_last_frame': use[-1]['v']['shift_cm'],
             'belt_N_max': max(max(r['v']['belt_N']) for r in rec), 'run_time_window_s': [use[0]['v']['t'], use[-1]['v']['t']], 'cargo_on_bed': bool(sim.rec.on_bed[-1])}
    render(shot, len(use), frame, values=[r['v'] for r in use], notes=notes)


if __name__ == '__main__':
    t0 = time.time()
    try:
        {'S1': lambda: at_bed('S1'), 'S4': lambda: at_bed('S4'), 'S2': in_cab, 'S3': lambda: braking('S3'), 'S5': lambda: braking('S5')}[SHOT]()
    except Exception as error:  # noqa: BLE001
        import traceback
        traceback.print_exc()
        print('DRIVE_ERROR', error, flush=True)
    print('DRIVE_DONE %.0f s' % (time.time() - t0), flush=True)
    app.close()
