"""PV5 오픈베드 크기의 가상 화물차 + 실제 무게의 짐 + 위로 넘겨 묶은 라쳇 벨트 (Isaac Sim 4.2, PhysX Vehicle).

- 차: omni.physx.vehicle 의 바퀴 · 타이어 · 서스펜션 · 제동 모델 (제동은 타이어 마찰로 끝난다, 차체가 앞으로 숙는다)
- 적재함: 바닥 · 문짝 · 뒷문 · 앞판을 차체(강체)의 충돌 모양으로 붙인다. 짐은 따로 움직이는 강체 (PhysX 마찰)
- 벨트: 줄 모델. 길이 = 고리 -> 짐 위 모서리 -> 반대 모서리 -> 고리, 장력 = 처음 장력 + 강성 x 늘어남 (당기기만, LC 에서 미끄러짐),
  짐의 두 모서리와 차체의 두 고리에 같은 크기 반대 방향 힘 (작용 반작용)
- 키트 센서 흉내: 벨트 장력, 적재함 가속(바닥 가운데), 짐 태그(적재함 기준 짐 위치)
- 앱 신호 흉내: 차 속도(10 Hz), 앞바퀴 조향각, 브레이크

한 번 만들고(build) 여러 번 돌리지 않는다: 경우마다 새 장면을 만든다 (짐 · 벨트가 다르므로).
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field

import numpy as np

from spec import G, PV5, STRAP

# ── Isaac 쪽 모듈은 SimulationApp 을 띄운 뒤 import 한다 (run_cases.py 가 띄운다) ──
import omni.usd
from pxr import Gf, PhysxSchema, Sdf, Usd, UsdGeom, UsdPhysics, UsdShade
from omni.physxvehicle.scripts.helpers import Factory
from omni.isaac.core import SimulationContext
from omni.isaac.core.prims import RigidPrimView
from omni.physx import get_physx_interface

DT = 1 / 240


def quat_to_R(q):
    """(w, x, y, z) -> 3x3"""
    w, x, y, z = q
    return np.array([
        [1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y)],
        [2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x)],
        [2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)],
    ])


def unit(v):
    n = float(np.linalg.norm(v))
    return v / n if n > 1e-9 else np.zeros(3)


@dataclass
class Case:
    cargo: str = 'box'
    mass: float = 300.
    size: tuple = (1.0, 0.8, 0.8)
    mu: float = 0.30
    belts: int = 2
    t0: float = 1250.          # 벨트 처음 장력 (N)
    front_gap: float = 0.35    # 앞판과 짐 사이 (m). 0 이면 앞벽에 붙임
    rubber: bool = False       # 고무바 · 로프 (장력 거의 없음)
    label: str = ''


@dataclass
class Rec:
    t: list = field(default_factory=list)
    kmh: list = field(default_factory=list)
    ax: list = field(default_factory=list)      # 적재함 앞뒤 가속 (g, + 가속 - 제동)
    ay: list = field(default_factory=list)      # 옆 가속 (g, + 왼쪽)
    az: list = field(default_factory=list)
    steer: list = field(default_factory=list)   # 앞바퀴 각 (도)
    brake: list = field(default_factory=list)
    dx: list = field(default_factory=list)      # 짐 위치 (적재함 기준, 처음 자리에서, m)
    dy: list = field(default_factory=list)
    dz: list = field(default_factory=list)
    tilt: list = field(default_factory=list)    # 짐 기울기 (도)
    T: list = field(default_factory=list)       # 벨트별 장력 (N)
    on_bed: list = field(default_factory=list)


class TruckSim:
    def __init__(self, case: Case, spec=PV5):
        self.case = case
        self.spec = spec
        ctx = omni.usd.get_context()
        ctx.new_stage()
        self.stage = stage = ctx.get_stage()
        UsdGeom.Xform.Define(stage, '/World')
        stage.SetDefaultPrim(stage.GetPrimAtPath('/World'))
        vp, wp = [], []
        Factory.create4WheeledCarsScenario(stage, 1.0, 1, createCollisionShapesForWheels=False, driveMode=Factory.DRIVE_BASIC,
                                           vehiclePathsOut=vp, wheelAttachmentPathsOut=wp, axes=Factory.AxesIndices(2, 0, 1),
                                           timeStepsPerSecond=int(round(1 / DT)), addChassisRenderMesh=False,
                                           addChassisCollisionBox=False)
        self.vp = vp[0]
        self.wheels = wp[0]
        self._tune_vehicle()
        self._build_bed()
        self._build_cargo()
        self.sim = SimulationContext(physics_dt=DT, rendering_dt=DT, stage_units_in_meters=1.0)
        self.sim.initialize_physics()
        self.sim.play()
        self.body = RigidPrimView(self.vp)
        self.body.initialize()
        self.cbody = RigidPrimView('/World/Cargo')
        self.cbody.initialize()
        self.ctrl = PhysxSchema.PhysxVehicleControllerAPI(stage.GetPrimAtPath(self.vp))
        self.physx = get_physx_interface()
        self.t = 0.
        self.released = set()          # 풀린 벨트 (라쳇이 풀리거나 고리가 빠짐)
        self.L0 = [None] * case.belts
        self.Lprev = [None] * case.belts
        self.T = [0.] * case.belts
        self.tight = False
        self.v_deck_prev = None
        self.rest_rel = None
        self.rec = Rec()

    # ── 차 ──
    def _tune_vehicle(self):
        s, st = self.spec, self.stage
        scene = st.GetPrimAtPath('/World/PhysicsScene')
        UsdPhysics.Scene(scene).GetGravityMagnitudeAttr().Set(G)
        car = st.GetPrimAtPath(self.vp)
        mass = s['curb_kg']
        L, W, H = s['body']
        m = UsdPhysics.MassAPI(car)
        m.GetMassAttr().Set(mass)
        m.GetCenterOfMassAttr().Set(Gf.Vec3f(s['com_x'], 0., s['com_h'] - s['ground_to_origin']))
        m.GetDiagonalInertiaAttr().Set(Gf.Vec3f((W * W + H * H) * mass / 12, (L * L + H * H) * mass / 12, (L * L + W * W) * mass / 12))
        wb, tr = s['wheelbase'] / 2, s['track'] / 2
        pos = {'FrontLeftWheel': (wb, tr), 'FrontRightWheel': (wb, -tr), 'RearLeftWheel': (-wb, tr), 'RearRightWheel': (-wb, -tr)}
        for path in self.wheels:
            name = path.split('/')[-1]
            att = PhysxSchema.PhysxVehicleWheelAttachmentAPI(st.GetPrimAtPath(path))
            z = att.GetSuspensionFramePositionAttr().Get()[2]
            att.GetSuspensionFramePositionAttr().Set(Gf.Vec3f(pos[name][0], pos[name][1], z))
        for w in ('/World/FrontWheel', '/World/RearWheel'):
            PhysxSchema.PhysxVehicleWheelAPI(st.GetPrimAtPath(w)).GetRadiusAttr().Set(s['wheel_r'])
        # 짐을 싣는 뒤쪽 서스펜션은 조금 단단하게 (소형 화물차)
        PhysxSchema.PhysxVehicleSuspensionAPI(st.GetPrimAtPath('/World/RearSuspension')).GetSpringStrengthAttr().Set(60000.)
        PhysxSchema.PhysxVehicleSuspensionAPI(st.GetPrimAtPath('/World/RearSuspension')).GetSpringDamperRateAttr().Set(5500.)
        for tbl in ('/World/WinterTireFrictionTable', '/World/SummerTireFrictionTable'):
            PhysxSchema.PhysxVehicleTireFrictionTable(st.GetPrimAtPath(tbl)).GetFrictionValuesAttr().Set([s['tire_mu'], 0.6])
        PhysxSchema.PhysxVehicleDriveBasicAPI(st.GetPrimAtPath('/World/DriveBasic')).GetPeakTorqueAttr().Set(1200.)
        # 타이어: 기본값(종방향 강성 5,000)으로는 급제동이 0.7 g 에서 끝난다. 승용 · 소형 화물 타이어 쪽으로 올린다
        for tp in ('/World/FrontTire', '/World/RearTire'):
            tire = PhysxSchema.PhysxVehicleTireAPI(st.GetPrimAtPath(tp))
            tire.GetLongitudinalStiffnessAttr().Set(s.get('tire_long_k', 5000.))
        PhysxSchema.PhysxVehicleSteeringAPI(car).GetMaxSteerAngleAttr().Set(s['max_steer'])
        va = PhysxSchema.PhysxVehicleAPI(car)
        va.GetHighForwardSpeedSubStepCountAttr().Set(4)      # 타이어 계산을 잘게 (급제동 때 떨림 방지)
        va.GetLowForwardSpeedSubStepCountAttr().Set(6)
        PhysxSchema.PhysxVehicleBrakesAPI(car, 'brakes0').GetMaxBrakeTorqueAttr().Set(4000.)

    def _collider(self, path, center, size, group=True, material=None):
        cube = UsdGeom.Cube.Define(self.stage, path)
        cube.CreateSizeAttr(1.0)
        x = UsdGeom.Xformable(cube)
        x.AddTranslateOp().Set(Gf.Vec3d(*center))
        x.AddScaleOp().Set(Gf.Vec3f(*size))
        UsdPhysics.CollisionAPI.Apply(cube.GetPrim())
        pc = PhysxSchema.PhysxCollisionAPI.Apply(cube.GetPrim())
        pc.CreateContactOffsetAttr(0.01)
        pc.CreateRestOffsetAttr(0.0)
        if group:
            grp = self.stage.GetPrimAtPath('/World/VehicleChassisCollisionGroup')
            if grp:
                Usd.CollectionAPI(grp, 'colliders').GetIncludesRel().AddTarget(cube.GetPrim().GetPath())
        if material is not None:
            UsdShade.MaterialBindingAPI.Apply(cube.GetPrim()).Bind(material, UsdShade.Tokens.weakerThanDescendants, 'physics')
        return cube

    def _material(self, path, mu):
        mat = UsdShade.Material.Define(self.stage, path)
        api = UsdPhysics.MaterialAPI.Apply(mat.GetPrim())
        api.CreateStaticFrictionAttr(mu)
        api.CreateDynamicFrictionAttr(0.8 * mu)      # 미끄러지는 중의 마찰 = 정지 마찰 x 0.8 (팀 계산식과 같은 가정)
        api.CreateRestitutionAttr(0.)
        px = PhysxSchema.PhysxMaterialAPI.Apply(mat.GetPrim())
        px.CreateFrictionCombineModeAttr('min')
        px.CreateRestitutionCombineModeAttr('min')
        return mat

    def _build_bed(self):
        s = self.spec
        b = s['bed']
        g0 = s['ground_to_origin']
        self.deck_top = b['deck_h'] - g0                     # 차체 원점 기준
        rear = -s['wheelbase'] / 2 - b['rear_overhang']
        self.bed_x0 = rear                                   # 적재함 뒤끝
        self.bed_x1 = rear + b['l']                          # 적재함 앞끝 (앞판 안쪽 면)
        W = b['w']
        self.deck_mat = self._material('/World/DeckMaterial', self.case.mu)
        root = self.vp + '/Bed'
        UsdGeom.Xform.Define(self.stage, root)
        t = 0.05
        self._collider(root + '/Deck', ((self.bed_x0 + self.bed_x1) / 2, 0, self.deck_top - t / 2), (b['l'], W, t), material=self.deck_mat)
        for side, y in (('L', W / 2 + 0.02), ('R', -W / 2 - 0.02)):
            self._collider(root + '/Gate' + side, ((self.bed_x0 + self.bed_x1) / 2, y, self.deck_top + b['side_h'] / 2), (b['l'], 0.04, b['side_h']))
        self._collider(root + '/Tail', (self.bed_x0 - 0.02, 0, self.deck_top + b['side_h'] / 2), (0.04, W + 0.08, b['side_h']))
        self._collider(root + '/Headboard', (self.bed_x1 + 0.025, 0, self.deck_top + b['wall_h'] / 2), (0.05, W + 0.08, b['wall_h']))
        # 운전석 (충돌만, 앞판 앞)
        cab_l = s['body'][0] / 2 + s['com_x'] * 0 + (s['wheelbase'] / 2 + 0.95) - (self.bed_x1 + 0.08)
        self._collider(self.vp + '/Cab', (self.bed_x1 + 0.08 + cab_l / 2, 0, self.deck_top - 0.1 + 0.95), (cab_l, s['body'][1], 1.9))

    # ── 짐 ──
    def _build_cargo(self):
        c = self.case
        l, w, h = c.size
        x = self.bed_x1 - c.front_gap - l / 2
        self.cargo_rest = np.array([x, 0., self.deck_top + h / 2])   # 차체 기준
        car_origin = self._vehicle_origin_world()
        cube = UsdGeom.Cube.Define(self.stage, '/World/Cargo')
        cube.CreateSizeAttr(1.0)
        xf = UsdGeom.Xformable(cube)
        xf.AddTranslateOp().Set(Gf.Vec3d(*(car_origin + self.cargo_rest + np.array([0, 0, 0.003]))))
        xf.AddOrientOp().Set(Gf.Quatf(1, 0, 0, 0))
        xf.AddScaleOp().Set(Gf.Vec3f(l, w, h))
        prim = cube.GetPrim()
        UsdPhysics.RigidBodyAPI.Apply(prim)
        UsdPhysics.MassAPI.Apply(prim).CreateMassAttr(c.mass)
        UsdPhysics.CollisionAPI.Apply(prim)
        pc = PhysxSchema.PhysxCollisionAPI.Apply(prim)
        pc.CreateContactOffsetAttr(0.01)
        pc.CreateRestOffsetAttr(0.0)
        prb = PhysxSchema.PhysxRigidBodyAPI.Apply(prim)
        prb.CreateSleepThresholdAttr(0.)
        prb.CreateStabilizationThresholdAttr(0.)
        prb.CreateSolverPositionIterationCountAttr(16)
        prb.CreateSolverVelocityIterationCountAttr(4)
        mat = self._material('/World/CargoMaterial', c.mu)
        UsdShade.MaterialBindingAPI.Apply(prim).Bind(mat, UsdShade.Tokens.weakerThanDescendants, 'physics')
        # 벨트: 짐 길이를 n 등분한 가운데에 하나씩
        self.strap_x = [x - l / 2 + l * (i + 0.5) / c.belts for i in range(c.belts)]

    def add_bump(self, ahead_m=20.0, height=0.08, length=0.5):
        """과속방지턱 (도로 폭 전체, 원호에 가까운 낮은 둔덕). 차체 앞 ahead_m 지점"""
        car = self._vehicle_origin_world()
        ground_z = car[2] - self.spec['ground_to_origin']
        path = '/World/Bump'
        cyl = UsdGeom.Cylinder.Define(self.stage, path)
        cyl.CreateAxisAttr('Y')
        r = (length * length / 4 + height * height) / (2 * height)       # 현의 길이 length, 높이 height 인 원호의 반지름
        cyl.CreateRadiusAttr(r)
        cyl.CreateHeightAttr(6.0)
        x = UsdGeom.Xformable(cyl)
        x.AddTranslateOp().Set(Gf.Vec3d(car[0] + ahead_m, car[1], ground_z - (r - height)))
        UsdPhysics.CollisionAPI.Apply(cyl.GetPrim())
        grp = self.stage.GetPrimAtPath('/World/GroundSurfaceCollisionGroup')
        if grp:
            Usd.CollectionAPI(grp, 'colliders').GetIncludesRel().AddTarget(cyl.GetPrim().GetPath())
        mat = self.stage.GetPrimAtPath('/World/TarmacMaterial')
        if mat:
            UsdShade.MaterialBindingAPI.Apply(cyl.GetPrim()).Bind(UsdShade.Material(mat), UsdShade.Tokens.weakerThanDescendants, 'physics')
        return r

    def _vehicle_origin_world(self):
        prim = self.stage.GetPrimAtPath(self.vp)
        m = UsdGeom.Xformable(prim).ComputeLocalToWorldTransform(Usd.TimeCode.Default())
        return np.array(m.ExtractTranslation())

    # ── 상태 ──
    def poses(self):
        p, q = self.body.get_world_poses()
        cp, cq = self.cbody.get_world_poses()
        return np.array(p[0], float), quat_to_R(np.array(q[0], float)), np.array(cp[0], float), quat_to_R(np.array(cq[0], float))

    def vel(self):
        v = self.body.get_velocities()[0]
        return np.array(v[:3], float), np.array(v[3:], float)

    # ── 벨트 ──
    def straps(self, P, R, CP, CR, settle):
        c = self.case
        l, w, h = c.size
        hook_y = self.spec['bed']['w'] / 2 - STRAP['hook_inset']
        fc = np.zeros(3)
        tc = np.zeros(3)
        fb = np.zeros(3)
        tb = np.zeros(3)
        com_b = P + R @ np.array([self.spec['com_x'], 0., self.spec['com_h'] - self.spec['ground_to_origin']])
        rel0 = CR.T @ (CP - CP)  # noqa: F841
        for i, xs in enumerate(self.strap_x):
            hl = P + R @ np.array([xs, hook_y, self.deck_top + 0.01])
            hr = P + R @ np.array([xs, -hook_y, self.deck_top + 0.01])
            xr = xs - self.cargo_rest[0]          # 짐 안에서 벨트 자리 (앞뒤)
            el = CP + CR @ np.array([xr, w / 2, h / 2])
            er = CP + CR @ np.array([xr, -w / 2, h / 2])
            L = np.linalg.norm(hl - el) + np.linalg.norm(el - er) + np.linalg.norm(er - hr)
            off = abs(float((R.T @ (CP - P))[1])) > self.spec['bed']['w'] / 2 or float((R.T @ (CP - P))[2]) < self.deck_top - 0.3
            if settle or self.L0[i] is None:
                self.L0[i] = L
                T = 0. if c.rubber else c.t0
            elif off or i in self.released:
                T = 0.
            else:
                rate = (L - self.Lprev[i]) / DT if self.Lprev[i] is not None else 0.
                T = 0. if c.rubber else c.t0 + STRAP['stiffness_n_per_m'] * (L - self.L0[i]) + STRAP['damping'] * rate
                T = float(np.clip(T, 0., STRAP['lc_n']))
            self.Lprev[i] = L
            self.T[i] = T
            if T <= 0:
                continue
            for e, hk, other in ((el, hl, er), (er, hr, el)):
                f = T * (unit(hk - e) + unit(other - e))
                fc += f
                tc += np.cross(e - CP, f)
                fh = T * unit(e - hk)
                fb += fh
                tb += np.cross(hk - com_b, fh)
        if np.any(fc) or np.any(fb):
            self.cbody.apply_forces_and_torques_at_pos(forces=np.array([fc]), torques=np.array([tc]), is_global=True)
            self.body.apply_forces_and_torques_at_pos(forces=np.array([fb]), torques=np.array([tb]), is_global=True)

    # ── 한 걸음 ──
    def step(self, accel=0., brake=0., steer=0., settle=False, record=True):
        self.ctrl.GetAcceleratorAttr().Set(float(accel))
        self.ctrl.GetBrake0Attr().Set(float(brake))
        self.ctrl.GetSteerAttr().Set(float(steer))
        P, R, CP, CR = self.poses()
        self.straps(P, R, CP, CR, settle)
        self.sim.step(render=False)
        self.t += DT
        P, R, CP, CR = self.poses()
        v, w = self.vel()
        deck_pt = P + R @ np.array([(self.bed_x0 + self.bed_x1) / 2, 0., self.deck_top])
        com_b = P + R @ np.array([self.spec['com_x'], 0., self.spec['com_h'] - self.spec['ground_to_origin']])
        v_deck = v + np.cross(w, deck_pt - com_b)
        a_world = (v_deck - self.v_deck_prev) / DT if self.v_deck_prev is not None else np.zeros(3)
        self.v_deck_prev = v_deck
        a_loc = R.T @ a_world / G                             # 적재함 가속 (중력 빼고, 차체 기준, g)
        rel = R.T @ (CP - P)
        if self.rest_rel is None or settle:
            self.rest_rel = rel.copy()
        d = rel - self.rest_rel
        up = CR @ np.array([0, 0, 1.])
        tilt = math.degrees(math.acos(max(-1., min(1., float(up @ (R @ np.array([0, 0, 1.])))))))
        fwd = float((R.T @ v)[0])
        on = abs(rel[1]) <= self.spec['bed']['w'] / 2 + 0.05 and rel[2] > self.deck_top - 0.05 and self.bed_x0 - 0.1 < rel[0] < self.bed_x1 + 0.05
        if record and not settle:
            r = self.rec
            r.t.append(self.t)
            r.kmh.append(fwd * 3.6)
            r.ax.append(float(a_loc[0]))
            r.ay.append(float(a_loc[1]))
            r.az.append(float(a_loc[2]))
            r.steer.append(float(steer) * math.degrees(self.spec['max_steer']))
            r.brake.append(float(brake))
            r.dx.append(float(d[0]))
            r.dy.append(float(d[1]))
            r.dz.append(float(d[2]))
            r.tilt.append(tilt)
            r.T.append(list(self.T))
            r.on_bed.append(bool(on))
        return fwd, a_loc

    def settle(self, seconds=0.8):
        for _ in range(int(seconds / DT)):
            self.step(brake=1.0, settle=True)

    def launch(self, v0):
        """주행 속도로 바로 시작 (차 · 짐 같은 속도, 바퀴 회전 맞춤)"""
        P, R, CP, CR = self.poses()
        fwd = R @ np.array([1., 0, 0])
        vel = np.zeros((1, 6))
        vel[0, :3] = fwd * v0
        self.body.set_velocities(vel)
        self.cbody.set_velocities(vel)
        for wpath in self.wheels:
            self.physx.set_wheel_rotation_speed(wpath, v0 / self.spec['wheel_r'])
        self.v_deck_prev = None
