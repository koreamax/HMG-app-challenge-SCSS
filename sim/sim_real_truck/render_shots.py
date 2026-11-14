"""PV5 오픈베드 가상 트럭 RTX 사진 (기획서 · 앱용). 같은 물리 경우를 돌리고 정차 중(출발 전)과 급제동 뒤를 찍는다.

  python sim_real_truck/render_shots.py            # results/shots/<경우>_{before,after}.png
"""
import math
import sys
from pathlib import Path

from isaacsim import SimulationApp

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
KIT = Path(sys.executable).parent / 'Lib/site-packages/isaacsim/apps/isaac_twin_light.kit'
W, H = 1920, 1080
app = SimulationApp({'headless': True, 'renderer': 'RayTracedLighting', 'width': W, 'height': H}, experience=str(KIT))
import omni.kit.app  # noqa: E402

omni.kit.app.get_app().get_extension_manager().set_extension_enabled_immediate('omni.physx.vehicle', True)
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(ROOT / 'scripts'))
import numpy as np  # noqa: E402
import omni.replicator.core as rep  # noqa: E402
from PIL import Image  # noqa: E402
from pxr import Gf, Sdf, Usd, UsdGeom, UsdLux, UsdShade, Vt  # noqa: E402

import materials_pbr as mp  # noqa: E402
import truck_geom as tg  # noqa: E402
from pv5sim import DT, Case, TruckSim  # noqa: E402
from spec import CARGO, PV5, STRAP  # noqa: E402

OUT = HERE / 'results' / 'shots'
OUT.mkdir(parents=True, exist_ok=True)


def hide_colliders(stage, root):
    for prim in Usd.PrimRange(stage.GetPrimAtPath(root)):
        if prim.IsA(UsdGeom.Cube) and str(prim.GetPath()) != '/World/Cargo':
            UsdGeom.Imageable(prim).CreatePurposeAttr('guide')


class Look:
    """차 모양 (차체 원점 기준, 차체와 같이 움직인다) + 땅 · 하늘 · 해"""

    def __init__(self, sim: TruckSim):
        self.sim = sim
        st = self.stage = sim.stage
        UsdGeom.Xform.Define(st, '/World/Materials')
        self.paint = mp.car_paint(st, 'Paint', (.74, .76, .79), roughness=.3)
        self.dark = mp.pbr(st, 'Dark', (.05, .055, .06), .55, .2)
        self.trim = mp.pbr(st, 'Trim', (.12, .13, .15), .45, .3)
        self.alu = mp.pbr(st, 'Alu', (.72, .74, .76), .32, .9, .7)
        self.deck = mp.pbr(st, 'Deck', (.42, .44, .46), .55, .7)
        self.rubber = mp.pbr(st, 'Rubber', (.012, .012, .014), .9, 0.)
        self.rim = mp.pbr(st, 'Rim', (.55, .57, .6), .3, .9)
        self.glass = mp.glass(st, 'Glass', (.08, .11, .14), opacity=.55)
        self.lamp = mp.emissive(st, 'Lamp', (1., .97, .9), 8.)[0]
        self.road = mp.pbr(st, 'Road', (.035, .037, .04), .86, 0.)
        self.line = mp.pbr(st, 'Line', (.92, .92, .9), .6, 0.)
        self.kraft = mp.pbr(st, 'Kraft', (.42, .29, .16), .8, 0.)
        self.tape = mp.pbr(st, 'Tape', (.8, .68, .5), .5, 0.)
        self.white = mp.car_paint(st, 'Fridge', (.93, .94, .95), roughness=.22)
        self.strap = mp.pbr(st, 'Strap', (.85, .36, .03), .6, 0.)
        self.ghost = mp.translucent(st, 'Ghost', (.9, .95, 1.), .22)
        self.build_world()
        self.build_truck()
        hide_colliders(st, sim.vp)

    def build_world(self):
        st = self.stage
        car = self.sim._vehicle_origin_world()
        gz = car[2] - PV5['ground_to_origin'] + 0.002
        tg.rounded_box(st, '/World/Look/Road', (car[0] - 120, car[1] - 160, gz - .05), (car[0] + 400, car[1] + 160, gz), 0.0, self.road)
        for k, y in enumerate((-1.75, 1.75)):
            for i in range(-30, 40):
                x0 = car[0] + i * 6.
                tg.rounded_box(st, f'/World/Look/Lane{k}_{i + 100}', (x0, car[1] + y - .06, gz), (x0 + 3., car[1] + y + .06, gz + .004), 0.0, self.line)
        dome = UsdLux.DomeLight.Define(st, '/World/Look/Sky')
        dome.CreateIntensityAttr(520.)
        dome.CreateTextureFileAttr(str(ROOT / 'assets/nvidia/sky_clear/noon_grass_4k.hdr').replace('\\', '/'))
        sun = UsdLux.DistantLight.Define(st, '/World/Look/Sun')
        sun.CreateIntensityAttr(1700.)
        sun.CreateAngleAttr(1.2)
        UsdGeom.Xformable(sun).AddRotateXYZOp().Set(Gf.Vec3f(-38, 28, 30))

    def build_truck(self):
        s, st, sim = PV5, self.stage, self.sim
        root = sim.vp + '/Look'
        UsdGeom.Xform.Define(st, root)
        b = s['bed']
        g0 = s['ground_to_origin']
        deck = b['deck_h'] - g0
        x0, x1 = sim.bed_x0, sim.bed_x1
        Wb = b['w']
        front = s['wheelbase'] / 2 + 0.98
        cab0 = x1 + 0.10
        # 운전석
        tg.rounded_box(st, root + '/CabLow', (cab0, -s['body'][1] / 2, -0.60), (front, s['body'][1] / 2, 0.16), .16, self.paint)
        tg.rounded_box(st, root + '/CabUp', (cab0 + 0.04, -s['body'][1] / 2 + .04, 0.10), (front - 0.62, s['body'][1] / 2 - .04, 0.93), .22, self.paint)
        tg.rounded_box(st, root + '/Hood', (front - 0.75, -s['body'][1] / 2 + .02, 0.05), (front - 0.02, s['body'][1] / 2 - .02, 0.30), .16, self.paint)
        tg.rounded_box(st, root + '/Wind', (front - 0.70, -0.86, 0.30), (front - 0.58, 0.86, 0.88), .05, self.glass)
        for side, y in (('L', s['body'][1] / 2 - .02), ('R', -s['body'][1] / 2 + .02)):
            tg.rounded_box(st, root + '/Win' + side, (cab0 + 0.35, y - .03, 0.32), (front - 0.72, y + .03, 0.86), .05, self.glass)
            tg.rounded_box(st, root + '/Mirror' + side, (front - 0.78, y - .02 + (0.12 if y > 0 else -0.12), 0.40), (front - 0.66, y + .02 + (0.12 if y > 0 else -0.12), 0.58), .03, self.trim)
        tg.rounded_box(st, root + '/Bumper', (front - 0.14, -0.93, -0.60), (front + 0.02, 0.93, -0.28), .06, self.trim)
        tg.rounded_box(st, root + '/LampBar', (front - 0.05, -0.80, 0.16), (front + 0.005, 0.80, 0.21), .02, self.lamp)
        # 차대 · 적재함
        tg.rounded_box(st, root + '/Frame', (x0 + .1, -.55, -0.50), (cab0, .55, deck - .07), .03, self.dark)
        tg.rounded_box(st, root + '/Deck', (x0, -Wb / 2 - .04, deck - .07), (x1, Wb / 2 + .04, deck), .01, self.deck)
        sh = b['side_h']
        for side, y in (('L', Wb / 2), ('R', -Wb / 2 - .04)):
            tg.rounded_box(st, root + '/Gate' + side, (x0, y, deck), (x1, y + .04, deck + sh), .008, self.alu)
            for k in (1, 2):
                z = deck + sh * k / 3
                tg.rounded_box(st, root + f'/Rib{side}{k}', (x0 + .02, y - .004, z - .006), (x1 - .02, y + .044, z + .006), .003, self.trim)
        tg.rounded_box(st, root + '/Tail', (x0 - .04, -Wb / 2 - .04, deck), (x0, Wb / 2 + .04, deck + sh), .008, self.alu)
        tg.rounded_box(st, root + '/FrontGate', (x1, -Wb / 2 - .04, deck), (x1 + .05, Wb / 2 + .04, deck + sh), .008, self.alu)
        # 앞 보호대 (기둥 + 가로대)
        for k, y in enumerate((-Wb / 2 + .02, -0.3, 0.3, Wb / 2 - .02)):
            tg.cylinder_between(st, root + f'/Post{k}', (x1 + .03, y, deck + sh), (x1 + .03, y, deck + b['wall_h']), .022, self.alu)
        for k, z in enumerate((deck + 0.75, deck + b['wall_h'])):
            tg.cylinder_between(st, root + f'/Bar{k}', (x1 + .03, -Wb / 2 + .02, z), (x1 + .03, Wb / 2 - .02, z), .022, self.alu)
        # 바퀴 (사진용, 돌지 않는다)
        r = s['wheel_r']
        for k, (x, y) in enumerate(((s['wheelbase'] / 2, s['track'] / 2), (s['wheelbase'] / 2, -s['track'] / 2), (-s['wheelbase'] / 2, s['track'] / 2), (-s['wheelbase'] / 2, -s['track'] / 2))):
            zc = -g0 + r
            tg.cylinder_between(st, root + f'/Tyre{k}', (x, y - .108, zc), (x, y + .108, zc), r, self.rubber, segments=40)
            tg.cylinder_between(st, root + f'/Rim{k}', (x, y - .112 if y > 0 else y + .102, zc), (x, y - .10 if y > 0 else y + .114, zc), r * .62, self.rim, segments=32)
            tg.rounded_box(st, root + f'/Arch{k}', (x - r - .08, y - .14, zc + r - .02), (x + r + .08, y + .14, zc + r + .06), .03, self.dark)

    def dress_cargo(self, kind):
        prim = self.stage.GetPrimAtPath('/World/Cargo')
        UsdShade.MaterialBindingAPI.Apply(prim).Bind(self.white if kind == 'appliance' else self.kraft)

    def ghost_box(self):
        """출발 때 짐 자리 (반투명, 차체에 붙인다)"""
        sim = self.sim
        l, w, h = sim.case.size
        c = sim.cargo_rest
        tg.rounded_box(self.stage, sim.vp + '/Look/Ghost', (c[0] - l / 2, c[1] - w / 2, c[2] - h / 2), (c[0] + l / 2, c[1] + w / 2, c[2] + h / 2), .005, self.ghost)

    def straps_mesh(self):
        """지금 자세 그대로 벨트 띠를 그린다 (세계 좌표)"""
        sim = self.sim
        st = self.stage
        P, R, CP, CR = sim.poses()
        l, w, h = sim.case.size
        hook_y = PV5['bed']['w'] / 2 - STRAP['hook_inset']
        UsdGeom.Xform.Define(st, '/World/Straps')
        for i, xs in enumerate(sim.strap_x):
            path = f'/World/Straps/S{i}'
            if st.GetPrimAtPath(path):
                st.RemovePrim(path)
            if sim.case.rubber and sim.case.t0 <= 0 and False:
                continue
            hl = P + R @ np.array([xs, hook_y, sim.deck_top + 0.01])
            hr = P + R @ np.array([xs, -hook_y, sim.deck_top + 0.01])
            xr = xs - sim.cargo_rest[0]
            el = CP + CR @ np.array([xr, w / 2 + .012, h / 2 + .012])
            er = CP + CR @ np.array([xr, -w / 2 - .012, h / 2 + .012])
            pts = [hl, el, er, hr]
            if i in sim.released:
                pts = [hl, hl + R @ np.array([0, -.15, .02]), hl + R @ np.array([0, -.3, .0])]
            along = R @ np.array([1., 0, 0]) * 0.025
            verts, idx = [], []
            for k, p in enumerate(pts):
                verts += [p - along, p + along]
                if k < len(pts) - 1:
                    a = 2 * k
                    idx += [a, a + 1, a + 3, a + 2]
            mesh = UsdGeom.Mesh.Define(st, path)
            mesh.CreatePointsAttr(Vt.Vec3fArray([Gf.Vec3f(*map(float, v)) for v in verts]))
            mesh.CreateFaceVertexCountsAttr(Vt.IntArray([4] * (len(pts) - 1)))
            mesh.CreateFaceVertexIndicesAttr(Vt.IntArray(idx))
            mesh.CreateDoubleSidedAttr(True)
            UsdShade.MaterialBindingAPI.Apply(mesh.GetPrim()).Bind(self.strap)


def look_at(cam_path, stage, eye, target, focal=28.):
    cam = UsdGeom.Camera.Get(stage, cam_path) or UsdGeom.Camera.Define(stage, cam_path)
    cam.CreateFocalLengthAttr(focal)
    cam.CreateHorizontalApertureAttr(36.)
    cam.CreateVerticalApertureAttr(36. * H / W)
    cam.CreateClippingRangeAttr(Gf.Vec2f(.05, 500.))
    f = np.asarray(target, float) - np.asarray(eye, float)
    f /= np.linalg.norm(f)
    up = np.array([0, 0, 1.])
    r = np.cross(f, up)
    r /= np.linalg.norm(r)
    u = np.cross(r, f)
    m = Gf.Matrix4d(r[0], r[1], r[2], 0, u[0], u[1], u[2], 0, -f[0], -f[1], -f[2], 0, eye[0], eye[1], eye[2], 1)
    xf = UsdGeom.Xformable(cam)
    xf.ClearXformOpOrder()
    xf.AddTransformOp().Set(m)
    return cam


class Shooter:
    def __init__(self):
        self.rp = None
        self.ann = None

    def shoot(self, stage, eye, target, out, focal=30.):
        look_at('/World/ShotCam', stage, eye, target, focal)
        if self.rp is None:
            self.rp = rep.create.render_product('/World/ShotCam', (W, H))
            self.ann = rep.AnnotatorRegistry.get_annotator('rgb')
            self.ann.attach([self.rp])
        for _ in range(3):
            rep.orchestrator.step(rt_subframes=16, pause_timeline=True)
        data = self.ann.get_data()
        Image.fromarray(np.asarray(data)[:, :, :3]).save(out)
        print('SHOT', out.name, flush=True)


def views(sim, side=1., wide=False):
    """side +1 = 왼쪽 뒤에서, -1 = 오른쪽 뒤에서. wide = 적재함과 짐(떨어진 짐 포함)을 함께 담는다"""
    P, R, CP, CR = sim.poses()
    tgt = P + R @ np.array([-1.05, 0., -0.05])
    rear34 = P + R @ np.array([-5.3, 3.9 * side, 2.55])
    if wide:
        mid = (tgt + CP) / 2
        k = max(1.35, 1.0 + float(np.linalg.norm(CP - tgt)) / 6.0)
        rear34 = mid + R @ (np.array([-4.25, 3.9 * side, 2.6]) * k)
        tgt = mid
    top = P + R @ np.array([-2.2, 0.01, 6.5])
    return {'rear34': (rear34, tgt), 'top': (top, P + R @ np.array([-1.3, 0, -0.1]))}


def case_shots(shooter, name, case, kind='brake', v0=50, target=0.75, release=False, turn=0., turn_s=3.5, side=1., wide=False):
    sim = TruckSim(case)
    look = Look(sim)
    look.dress_cargo(case.cargo)
    sim.settle(1.0)
    look.straps_mesh()
    v = views(sim, side, wide)
    shooter.shoot(sim.stage, *v['rear34'], OUT / f'{name}_before.png')
    shooter.rp = None   # 장면이 바뀌면 새로 만든다 (카메라 경로는 같다)
    sim.launch(v0 / 3.6)
    for _ in range(int(1.0 / DT)):
        sim.step()
    if release:
        sim.released.add(case.belts - 1)
    if kind == 'turn' or turn:
        lat = turn or target
        s = math.atan(PV5['wheelbase'] * lat * 9.81 / ((v0 / 3.6) ** 2)) / PV5['max_steer']
        t = 0.
        while t < turn_s:
            sim.step(accel=0.25, steer=s * min(1., t / 0.5))
            t += DT
    if kind != 'turn':
        b = min(1., target / 2.1)
        t = 0.
        stopped = None
        a_prev = 0.
        while sim.t < 60:
            fwd, a = sim.step(brake=b * min(1., t / 0.25))
            t += DT
            if t > 0.3 and fwd > 1.0:
                a_prev = 0.95 * a_prev + 0.05 * (-float(a[0]))
                b = float(np.clip(b + 0.01 * (target - a_prev), 0., 1.))
            if fwd < 0.05 and stopped is None:
                stopped = sim.t
            if stopped is not None and sim.t - stopped > 3.0:     # 선 뒤 차체 흔들림이 잦아들 때까지
                break
    else:
        for _ in range(int(4.0 / DT)):
            sim.step(brake=0.5)
    look.straps_mesh()
    # 출발 때 자리(남색)는 짐이 2 cm 넘게 움직였을 때만 (제자리면 겹쳐서 헷갈린다)
    if kind != 'turn' and max(abs(sim.rec.dx[-1]), abs(sim.rec.dy[-1])) > 0.02:
        look.ghost_box()
    v = views(sim, side, wide)
    shooter.shoot(sim.stage, *v['rear34'], OUT / f'{name}_after.png')
    shooter.rp = None
    return sim



def trip_lost_shots(shooter, name, case, v0=40, target=0.42, turn_s=5.5, side=-1., wide=True, **_):
    """앱 기록 'lost' 와 같은 주행: 정차 2 s -> 출발 -> 정속 3 s -> 나들목 램프 회전 -> 제동"""
    sim = TruckSim(case)
    look = Look(sim)
    look.dress_cargo(case.cargo)
    sim.settle(1.0)
    for _ in range(int(2.0 / DT)):
        sim.step(brake=1.0)
    while True:
        fwd, a = sim.step(accel=0.55)
        if fwd >= v0 / 3.6 or sim.t > 40:
            break
    t_c = sim.t
    while sim.t < t_c + 3.0:
        sim.step(accel=0.12)
    v = max(1., fwd)
    st = math.atan(PV5['wheelbase'] * target * 9.81 / (v * v)) / PV5['max_steer']
    t = 0.
    while t < turn_s:
        ramp = min(1., t / 0.6) if t < turn_s - 0.8 else max(0., 1 - (t - (turn_s - 0.8)) / 0.6)
        sim.step(accel=0.2, steer=st * ramp)
        t += DT
        if sim.rec.tilt[-1] >= 38.:          # 넘어지는 순간을 찍는다 (곧 적재함 밖으로 떨어진다)
            break
    ay = np.abs(np.array(sim.rec.ay, float))
    k = max(1, int(round(0.1 / DT)))
    print('PEAK_LAT_G %.3f' % float(np.max(np.convolve(ay, np.ones(k) / k, mode='valid'))), 'ON_BED', bool(sim.rec.on_bed[-1]),
          'KMH %.1f' % max(sim.rec.kmh), 'TILT %.1f' % sim.rec.tilt[-1], 'T %.2f' % t, flush=True)
    look.straps_mesh()
    vv = views(sim, side, False)
    shooter.shoot(sim.stage, *vv['rear34'], OUT / f'{name}_after.png')
    shooter.rp = None
    # 출발 전: 새 장면
    sim2 = TruckSim(case)
    look2 = Look(sim2)
    look2.dress_cargo(case.cargo)
    sim2.settle(1.0)
    look2.straps_mesh()
    vv = views(sim2, side, False)
    shooter.shoot(sim2.stage, *vv['rear34'], OUT / f'{name}_before.png')
    shooter.rp = None
    return sim


if __name__ == '__main__':
    box = CARGO['box']
    app_ = CARGO['appliance']
    only = sys.argv[1] if len(sys.argv) > 1 else ''
    jobs = [
        ('slide_b2_T1250', Case('box', 300., box['size'], box['mu'], 2, 1250., 0.35), {'target': 0.75}),
        ('hold_b4_T1250', Case('box', 300., box['size'], box['mu'], 4, 1250., 0.35), {'target': 0.75}),
        ('wall_b2_T1250', Case('box', 300., box['size'], box['mu'], 2, 1250., 0.0), {'target': 0.9}),
        ('rubber_box', Case('box', 300., box['size'], box['mu'], 3, 0., 0.35, rubber=True), {'target': 0.45}),
        # 앱 기록 'lost' 와 같은 조건: 시속 40 km, 나들목 램프 회전 0.42 g. 짐은 오른쪽(바깥)으로 넘어진다 -> 오른쪽 뒤에서 넓게
        ('tip_fridge_rubber', Case('appliance', 300., app_['size'], app_['mu'], 2, 0., 0.0, rubber=True), {'kind': 'trip_lost', 'target': 0.42, 'v0': 40, 'turn_s': 5.5, 'side': -1., 'wide': True}),
    ]
    shooter = Shooter()
    for name, case, kw in jobs:
        if only and only not in name:
            continue
        try:
            if kw.get('kind') == 'trip_lost':
                trip_lost_shots(shooter, name, case, **{k: v for k, v in kw.items() if k != 'kind'})
            else:
                case_shots(shooter, name, case, **kw)
        except Exception as error:   # noqa: BLE001
            import traceback
            traceback.print_exc()
            print('SHOT_ERROR', name, error, flush=True)
    print('SHOTS_DONE', flush=True)
    app.close()
