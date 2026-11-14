"""render_shots.py 의 차 모양(Look) · 카메라(look_at)만 떼어 낸 것. render_shots.py 를 import 하면 SimulationApp 이 두 번 떠서 따로 둔다.
W, H 는 쓰는 쪽에서 set_size 로 정한다."""
from __future__ import annotations

import numpy as np
from pxr import Gf, Usd, UsdGeom, UsdLux, UsdShade, Vt

import materials_pbr as mp
import truck_geom as tg
from spec import PV5, STRAP
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
W, H = 1920, 1080


def set_size(w, h):
    global W, H
    W, H = w, h


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


