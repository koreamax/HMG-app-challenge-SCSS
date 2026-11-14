"""PV5 오픈베드 디지털 트윈 실사 렌더 (Omniverse RTX 경로 추적). 같은 PhysX 물리로 움직이고, 보이는 것만 실사로 바꾼다.

  python sim_real_truck/render_hero.py stills      # results/hero/*.png (1920x1080)
  python sim_real_truck/render_hero.py video       # results/hero/frames_brake/*.png + 자막 (1280x720, 30 fps)
  HERO_BED=1 HERO_VERT=1 python sim_real_truck/render_hero.py video    # 세로 9:16 (1080x1920), 고정 카메라: results/hero_bed/frames_brake_vert/
  HERO_BED=1 HERO_VERT=1 python sim_real_truck/render_hero.py stills   # results/hero_bed/vert_before.png, vert_after.png
  python sim_real_truck/render_hero.py lost        # 고무바 냉장고가 램프 회전에서 넘어지는 장면 (따로 돌린다: 렌더 뒤 조향이 안 먹는다)

짐 · 벨트 · 차의 움직임은 render_shots.py 와 같은 TruckSim (240 Hz). 상자 인쇄 · 운송장은 make_textures.py 가 만든 가짜 값이다.
"""
import math
import os
import sys
import time
from pathlib import Path

from isaacsim import SimulationApp

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
KIT = Path(sys.executable).parent / 'Lib/site-packages/isaacsim/apps/isaac_twin_light.kit'
MODE = sys.argv[1] if len(sys.argv) > 1 else 'stills'
VERT = os.environ.get('HERO_VERT') == '1'     # 세로 숏폼 (9:16). 가로 출력은 그대로 둔다
W, H = (1080, 1920) if VERT else (1280, 720) if MODE in ('video', 'lostvideo') else (1920, 1080)
app = SimulationApp({'headless': True, 'renderer': 'PathTracing', 'width': W, 'height': H}, experience=str(KIT))
import carb  # noqa: E402
import omni.kit.app  # noqa: E402

omni.kit.app.get_app().get_extension_manager().set_extension_enabled_immediate('omni.physx.vehicle', True)
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(ROOT / 'scripts'))
import numpy as np  # noqa: E402
import omni.replicator.core as rep  # noqa: E402
from PIL import Image, ImageDraw, ImageFont  # noqa: E402
from pxr import Gf, Sdf, Usd, UsdGeom, UsdLux, UsdShade, Vt  # noqa: E402

import materials_pbr as mp  # noqa: E402
import truck_geom as tg  # noqa: E402
from forest_scene import TREES, veg  # noqa: E402
from pv5sim import DT, Case, TruckSim  # noqa: E402
import look_base  # noqa: E402
from look_base import Look, look_at  # noqa: E402
look_base.set_size(W, H)
from spec import CARGO, PV5, STRAP  # noqa: E402

import os
BED = os.environ.get('HERO_BED') == '1'      # 적재함만 (차 몸통 없음), 검은 스튜디오
OUT = HERE / 'results' / ('hero_bed' if BED else 'hero')
OUT.mkdir(parents=True, exist_ok=True)
TEX = HERE / 'results' / 'tex'
SKY = ROOT / 'assets/nvidia/sky/kloofendal_48d_partly_cloudy_4k.hdr'
FONT = Path(r'C:\Users\DANHA\AppData\Local\Microsoft\Windows\Fonts')
A = Sdf.ValueTypeNames.Asset
C3, F, B, F2 = Sdf.ValueTypeNames.Color3f, Sdf.ValueTypeNames.Float, Sdf.ValueTypeNames.Bool, Sdf.ValueTypeNames.Float2

s = carb.settings.get_settings()
s.set('/rtx/rendermode', 'PathTracing')
s.set('/rtx/pathtracing/maxBounces', 6)
s.set('/rtx/pathtracing/maxSpecularAndTransmissionBounces', 6)
s.set('/rtx/pathtracing/optixDenoiser/enabled', True)
s.set('/rtx/pathtracing/spp', 16 if MODE in ('video', 'lostvideo') else 32)
s.set('/rtx/pathtracing/totalSpp', 0)
s.set('/rtx/post/aa/op', 3)
SUB = 4 if MODE in ('video', 'lostvideo') else 12


def tex_mat(stage, name, image, roughness=.7, scale=1., metallic=0., spec=.4):
    return mp.mdl(stage, name, 'OmniPBR.mdl', {
        'diffuse_texture': (A, Sdf.AssetPath(str(image).replace('\\', '/'))),
        'reflection_roughness_constant': (F, roughness), 'metallic_constant': (F, metallic), 'specular_level': (F, spec),
        'texture_scale': (F2, Gf.Vec2f(scale, scale))})


def bind(prim, mat):
    UsdShade.MaterialBindingAPI.Apply(prim).Bind(mat)


def quad(stage, path, corners, mat):
    """네 귀퉁이 (uv 0,0 -> 1,0 -> 1,1 -> 0,1 순서) 판 하나"""
    c = np.asarray(corners, float)
    n = np.cross(c[1] - c[0], c[3] - c[0])
    n /= np.linalg.norm(n)
    m = UsdGeom.Mesh.Define(stage, path)
    m.CreatePointsAttr(Vt.Vec3fArray([Gf.Vec3f(*map(float, p)) for p in c]))
    m.CreateFaceVertexCountsAttr(Vt.IntArray([4]))
    m.CreateFaceVertexIndicesAttr(Vt.IntArray([0, 1, 2, 3]))
    m.CreateNormalsAttr(Vt.Vec3fArray([Gf.Vec3f(*map(float, n))] * 4))
    m.SetNormalsInterpolation(UsdGeom.Tokens.vertex)
    m.CreateSubdivisionSchemeAttr('none')
    st = UsdGeom.PrimvarsAPI(m).CreatePrimvar('st', Sdf.ValueTypeNames.TexCoord2fArray, UsdGeom.Tokens.vertex)
    st.Set(Vt.Vec2fArray([Gf.Vec2f(0, 0), Gf.Vec2f(1, 0), Gf.Vec2f(1, 1), Gf.Vec2f(0, 1)]))
    bind(m.GetPrim(), mat)
    return m


def set_matrix(prim, R, P):
    xf = UsdGeom.Xformable(prim)
    xf.ClearXformOpOrder()
    m = Gf.Matrix4d(*(list(map(float, R[:, 0])) + [0.] + list(map(float, R[:, 1])) + [0.] + list(map(float, R[:, 2])) + [0.] + list(map(float, P)) + [1.]))
    xf.AddTransformOp().Set(m)


class HeroLook(Look):
    def build_world(self):
        st = self.stage
        car = self.sim._vehicle_origin_world()
        gz = car[2] - PV5['ground_to_origin'] + 0.002
        self.gz = gz
        asphalt = mp.base_material(st, 'AsphaltReal', 'Natural', 'Asphalt', tint=(.78, .78, .8), roughness=None)
        grass = mp.base_material(st, 'GrassReal', 'Natural', 'Grass_Countryside')
        gravel = mp.base_material(st, 'GravelReal', 'Stone', 'Gravel')
        cy = car[1]
        tg.rounded_box(st, '/World/Look/Road', (car[0] - 160, cy - 5.6, gz - .08), (car[0] + 460, cy + 5.6, gz), 0.0, asphalt, uv_scale=3.)
        for side, (a, b) in (('L', (5.6, 6.6)), ('R', (-6.6, -5.6))):
            tg.rounded_box(st, f'/World/Look/Shoulder{side}', (car[0] - 160, cy + a, gz - .1), (car[0] + 460, cy + b, gz - .015), 0.0, gravel, uv_scale=2.)
            y0, y1 = (6.6, 260.) if side == 'L' else (-260., -6.6)
            tg.rounded_box(st, f'/World/Look/Grass{side}', (car[0] - 160, cy + y0, gz - .12), (car[0] + 460, cy + y1, gz - .03), 0.0, grass, uv_scale=4.)
        paint = mp.pbr(st, 'LinePaint', (.9, .9, .86), .55, 0.)
        for i in range(-40, 120):
            x0 = car[0] + i * 8.
            tg.rounded_box(st, f'/World/Look/Dash_{i + 100}', (x0, cy + 1.75 - .07, gz), (x0 + 4.5, cy + 1.75 + .07, gz + .003), 0.0, paint)
        for k, y in enumerate((-1.75 - 1.9, 5.15)):
            tg.rounded_box(st, f'/World/Look/Edge{k}', (car[0] - 160, cy + y - .08, gz), (car[0] + 460, cy + y + .08, gz + .003), 0.0, paint)
        # 나무 (NVIDIA Vegetation, 단위 cm -> m)
        rng = np.random.default_rng(3)
        names = [n for n in TREES if veg('Trees', f'{n}.usd').exists()]
        k = 0
        for side in (1, -1):
            x = car[0] - 90.
            while x < car[0] + 260.:
                x += rng.uniform(7., 13.)
                for row in range(2):
                    y = cy + side * (rng.uniform(13., 20.) + row * rng.uniform(9., 14.))
                    name = names[int(rng.integers(len(names)))]
                    sc = rng.uniform(*TREES[name][1:]) * .01
                    tree = UsdGeom.Xform.Define(st, f'/World/Look/Trees/T{k}').GetPrim()
                    xf = UsdGeom.Xformable(tree)
                    xf.AddTranslateOp().Set(Gf.Vec3d(float(x + rng.uniform(-3, 3)), float(y), float(gz - .03)))
                    xf.AddRotateXYZOp().Set(Gf.Vec3f(0, 0, float(rng.uniform(0, 360))))
                    xf.AddScaleOp().Set(Gf.Vec3f(sc, sc, sc))
                    tree.GetReferences().AddReference(str(veg('Trees', f'{name}.usd')))
                    k += 1
        dome = UsdLux.DomeLight.Define(st, '/World/Look/Sky')
        dome.CreateIntensityAttr(560.)
        dome.CreateTextureFileAttr(str(SKY).replace('\\', '/'))
        UsdGeom.Xformable(dome).AddRotateXYZOp().Set(Gf.Vec3f(0, 0, 160))
        sun = UsdLux.DistantLight.Define(st, '/World/Look/Sun')
        sun.CreateIntensityAttr(1900.)
        sun.CreateAngleAttr(.8)
        sun.CreateColorAttr(Gf.Vec3f(1., .96, .9))
        UsdGeom.Xformable(sun).AddRotateXYZOp().Set(Gf.Vec3f(-42, 22, 205))

    def studio(self):
        """검은 스튜디오: 광택 있는 검은 바닥, 옅은 바닥 줄(움직임이 보이게), 적재함을 따라가는 키 · 림 조명"""
        st = self.stage
        for path in ('/World/Look/Road', '/World/Look/ShoulderL', '/World/Look/ShoulderR', '/World/Look/GrassL', '/World/Look/GrassR', '/World/Look/Trees', '/World/Look/Sky', '/World/Look/Sun', '/World/Look/Edge0', '/World/Look/Edge1'):
            if st.GetPrimAtPath(path):
                st.RemovePrim(path)
        for prim in list(st.GetPrimAtPath('/World/Look').GetChildren()):
            if prim.GetName().startswith('Dash_'):
                st.RemovePrim(prim.GetPath())
        car = self.sim._vehicle_origin_world()
        gz = self.gz
        floor = mp.pbr(st, 'StudioFloor', (.018, .019, .021), .32, 0., .55)
        tg.rounded_box(st, '/World/Look/Floor', (car[0] - 200, car[1] - 200, gz - .05), (car[0] + 400, car[1] + 200, gz), 0.0, floor)
        line = mp.pbr(st, 'StudioLine', (.075, .08, .09), .5, 0.)
        for i in range(-30, 80):
            x0 = car[0] + i * 1.5
            tg.rounded_box(st, f'/World/Look/GridX{i + 100}', (x0, car[1] - 12, gz), (x0 + .012, car[1] + 12, gz + .001), 0.0, line)
        for k in range(-8, 9):
            y0 = car[1] + k * 1.5
            tg.rounded_box(st, f'/World/Look/GridY{k + 20}', (car[0] - 45, y0, gz), (car[0] + 120, y0 + .012, gz + .001), 0.0, line)
        dome = UsdLux.DomeLight.Define(st, '/World/Look/Ambient')
        dome.CreateIntensityAttr(18.)
        dome.CreateColorAttr(Gf.Vec3f(.55, .62, .75))
        root = self.sim.vp + '/Look/Lights'
        UsdGeom.Xform.Define(st, root)
        def rect(name, pos, rot, w, h, inten, col=(1., .98, .95)):
            l = UsdLux.RectLight.Define(st, f'{root}/{name}')
            l.CreateWidthAttr(w); l.CreateHeightAttr(h); l.CreateIntensityAttr(inten); l.CreateColorAttr(Gf.Vec3f(*col))
            xf = UsdGeom.Xformable(l)
            xf.AddTranslateOp().Set(Gf.Vec3d(*pos)); xf.AddRotateXYZOp().Set(Gf.Vec3f(*rot))
        deck = self.sim.deck_top
        rect('Key', (-1.0, 1.2, deck + 3.2), (0, 0, 0), 3.2, 2.0, 2600.)                       # 위에서 부드럽게
        rect('RimBack', (-4.6, 0., deck + 1.4), (0, -70, 0), 3.0, .6, 5200., (.75, .85, 1.))      # 뒤쪽 테두리 빛 (차가운)
        rect('RimSide', (-1.2, -3.6, deck + 1.0), (70, 0, 0), 3.2, .5, 3600., (1., .9, .8))       # 오른쪽 따뜻한 테두리
        rect('Fill', (-2.5, 4.0, deck + 1.2), (-70, 0, 0), 2.5, 1.2, 900.)

    def bed_only(self):
        """차 몸통 · 바퀴 · 차대를 렌더에서 뺀다 (충돌 · 물리는 그대로)"""
        root = self.stage.GetPrimAtPath(self.sim.vp + '/Look')
        drop = ('Cab', 'Wind', 'Win', 'Mirror', 'Bumper', 'LampBar', 'Hood', 'Frame', 'Tyre', 'Rim', 'Arch')
        for prim in root.GetChildren():
            n = prim.GetName()
            if n.startswith(drop) and not n.startswith('Rib'):
                UsdGeom.Imageable(prim).CreatePurposeAttr('guide')

    def upgrade(self):
        """차 재질을 질감 있는 것으로 (적재함 알루미늄, 바닥 줄무늬 강판, 타이어 고무)"""
        st = self.stage
        root = self.sim.vp + '/Look'
        alu = mp.base_material(st, 'AluReal', 'Metals', 'Aluminum_Cast', roughness=.35)
        steel = mp.base_material(st, 'SteelReal', 'Metals', 'Steel_Carbon', tint=(.55, .57, .6))
        rubber = mp.base_material(st, 'RubberReal', 'Plastics', 'Rubber_Textured', tint=(.25, .25, .26))
        paint = mp.car_paint(st, 'PaintReal', (.86, .87, .88), roughness=.18, metallic=.35)
        for prim in Usd.PrimRange(st.GetPrimAtPath(root)):
            n = prim.GetName()
            if n.startswith(('Gate', 'Tail', 'FrontGate', 'Rib')):
                bind(prim, alu)
            elif n == 'Deck':
                bind(prim, steel)
            elif n.startswith('Tyre'):
                bind(prim, rubber)
            elif n.startswith(('CabLow', 'CabUp', 'Hood')):
                bind(prim, paint)
        self.webbing = tex_mat(st, 'Webbing', TEX / 'webbing.png', roughness=.62)
        self.buckle = mp.pbr(st, 'Buckle', (.62, .64, .67), .28, 1., .8)
        self.hook = mp.pbr(st, 'Hook', (.1, .1, .11), .4, .8)

    def cargo_vis(self, kind):
        st = self.stage
        cube = st.GetPrimAtPath('/World/Cargo')
        UsdGeom.Imageable(cube).CreatePurposeAttr('guide')
        l, w, h = self.sim.case.size
        root = '/World/CargoVis'
        UsdGeom.Xform.Define(st, root)
        if kind == 'appliance':
            body = mp.car_paint(st, 'FridgeBody', (.92, .93, .94), roughness=.2, metallic=.1)
            tg.rounded_box(st, root + '/Body', (-l / 2, -w / 2, -h / 2), (l / 2, w / 2, h / 2), .03, body)
            seam = mp.pbr(st, 'Seam', (.15, .15, .16), .5, 0.)
            tg.rounded_box(st, root + '/Seam', (-l / 2 - .002, -w / 2 + .02, h / 2 - .62), (-l / 2 + .004, w / 2 - .02, h / 2 - .61), .001, seam)
            for k, z in enumerate((h / 2 - .3, h / 2 - .95)):
                tg.rounded_box(st, root + f'/Handle{k}', (-l / 2 - .03, w / 2 - .1, z - .18), (-l / 2, w / 2 - .07, z + .18), .01, self.buckle)
            label = tex_mat(st, 'WaybillMat', TEX / 'waybill.png', .55)
            quad(st, root + '/Waybill', [(-.12, w / 2 + .002, -.2), (.12, w / 2 + .002, -.2), (.12, w / 2 + .002, .12), (-.12, w / 2 + .002, .12)], label)
        else:
            kraft = tex_mat(st, 'Kraft', TEX / 'kraft.png', .78, scale=1.)
            tg.rounded_box(st, root + '/Body', (-l / 2, -w / 2, -h / 2), (l / 2, w / 2, h / 2), .012, kraft, uv_scale=.9)
            side = tex_mat(st, 'SidePrint', TEX / 'side_print.png', .78)
            e = .0025
            quad(st, root + '/PrintL', [(l / 2 - .01, w / 2 + e, -h / 2 + .01), (-l / 2 + .01, w / 2 + e, -h / 2 + .01), (-l / 2 + .01, w / 2 + e, h / 2 - .01), (l / 2 - .01, w / 2 + e, h / 2 - .01)], side)
            quad(st, root + '/PrintR', [(-l / 2 + .01, -w / 2 - e, -h / 2 + .01), (l / 2 - .01, -w / 2 - e, -h / 2 + .01), (l / 2 - .01, -w / 2 - e, h / 2 - .01), (-l / 2 + .01, -w / 2 - e, h / 2 - .01)], side)
            label = tex_mat(st, 'WaybillMat', TEX / 'waybill.png', .5)
            # 뒷면 (-x) 오른쪽 아래 운송장
            quad(st, root + '/Waybill', [(-l / 2 - e, .02, -.3), (-l / 2 - e, -.26, -.3), (-l / 2 - e, -.26, .08), (-l / 2 - e, .02, .08)], label)
            tape = tex_mat(st, 'Tape', TEX / 'tape.png', .3, spec=.6)
            tg.rounded_box(st, root + '/TapeTop', (-l / 2 - .002, -.038, h / 2), (l / 2 + .002, .038, h / 2 + .0015), .0005, tape)
            tg.rounded_box(st, root + '/TapeBack', (-l / 2 - .0015, -.038, h / 2 - .16), (-l / 2, .038, h / 2), .0005, tape)
            tg.rounded_box(st, root + '/TapeFront', (l / 2, -.038, h / 2 - .16), (l / 2 + .0015, .038, h / 2), .0005, tape)
        self.sync_cargo()

    def sync_cargo(self, poses=None):
        P, R, CP, CR = poses or self.sim.poses()
        set_matrix(self.stage.GetPrimAtPath('/World/CargoVis'), CR, CP)

    def ghost_box(self):
        """출발 때 짐 자리: 하늘색 모서리 선 12개 (차체에 붙는다, 짐을 가리지 않는다)"""
        sim = self.sim
        l, w, h = sim.case.size
        c = sim.cargo_rest
        line = mp.emissive(self.stage, 'GhostLine', (.35, .7, 1.), 6., base=(.4, .7, 1.))[0]
        xs, ys, zs = (c[0] - l / 2, c[0] + l / 2), (c[1] - w / 2, c[1] + w / 2), (c[2] - h / 2 + .004, c[2] + h / 2)
        k = 0
        for y in ys:
            for z in zs:
                tg.cylinder_between(self.stage, sim.vp + f'/Look/Ghost/E{k}', (xs[0], y, z), (xs[1], y, z), .007, line); k += 1
        for x in xs:
            for z in zs:
                tg.cylinder_between(self.stage, sim.vp + f'/Look/Ghost/E{k}', (x, ys[0], z), (x, ys[1], z), .007, line); k += 1
        for x in xs:
            for y in ys:
                tg.cylinder_between(self.stage, sim.vp + f'/Look/Ghost/E{k}', (x, y, zs[0]), (x, y, zs[1]), .007, line); k += 1

    def hide_factory_ground(self):
        """PhysX 차량 예제가 만든 바닥 판(흰색)은 렌더에서만 감춘다 (충돌은 그대로)"""
        keep = ('/World/Look', '/World/CargoVis', '/World/Straps', '/World/Materials', '/World/HeroCam', self.sim.vp + '/Look')
        for prim in self.stage.Traverse():
            p = str(prim.GetPath())
            if prim.IsA(UsdGeom.Gprim) and not p.startswith(keep) and p != '/World/Cargo':
                UsdGeom.Imageable(prim).CreatePurposeAttr('guide')
                print('HIDE', p, prim.GetTypeName(), flush=True)

    def straps_mesh(self, poses=None):
        """벨트 띠 (웨빙 질감, 폭 50 mm) + 왼쪽 라쳇 버클 + 양쪽 고리. poses 를 주면 그 자세로 (기록 재생)"""
        sim, st = self.sim, self.stage
        P, R, CP, CR = poses or sim.poses()
        l, w, h = sim.case.size
        hook_y = PV5['bed']['w'] / 2 - STRAP['hook_inset']
        UsdGeom.Xform.Define(st, '/World/Straps')
        fwd = R @ np.array([1., 0, 0])
        for i, xs in enumerate(sim.strap_x):
            base = f'/World/Straps/S{i}'
            UsdGeom.Xform.Define(st, base)
            hl = P + R @ np.array([xs, hook_y, sim.deck_top + 0.012])
            hr = P + R @ np.array([xs, -hook_y, sim.deck_top + 0.012])
            xr = xs - sim.cargo_rest[0]
            el = CP + CR @ np.array([xr, w / 2 + .012, h / 2 + .006])
            er = CP + CR @ np.array([xr, -w / 2 - .012, h / 2 + .006])
            pts = [hl, el, er, hr]
            if i in sim.released:
                pts = [hl, hl + R @ np.array([0, -.15, .02]), hl + R @ np.array([0, -.3, .0])]
            along = fwd * 0.025
            verts, idx, uv = [], [], []
            acc = 0.
            for k, p in enumerate(pts):
                if k:
                    acc += float(np.linalg.norm(pts[k] - pts[k - 1]))
                verts += [p - along, p + along]
                uv += [(0., acc * 2.), (1., acc * 2.)]
                if k < len(pts) - 1:
                    a = 2 * k
                    idx += [a, a + 1, a + 3, a + 2]
            # 처음에만 만들고, 다음 프레임부터는 점 · 위치만 바꾼다 (새 프림을 만들면 프레임마다 느려진다)
            old = st.GetPrimAtPath(base + '/Web')
            if old and len(UsdGeom.Mesh(old).GetPointsAttr().Get() or []) == len(verts):
                mesh = UsdGeom.Mesh(old)
                mesh.GetPointsAttr().Set(Vt.Vec3fArray([Gf.Vec3f(*map(float, v)) for v in verts]))
                UsdGeom.PrimvarsAPI(mesh).GetPrimvar('st').Set(Vt.Vec2fArray([Gf.Vec2f(*u) for u in uv]))
            else:
                if old:
                    st.RemovePrim(base + '/Web')
                mesh = UsdGeom.Mesh.Define(st, base + '/Web')
                mesh.CreatePointsAttr(Vt.Vec3fArray([Gf.Vec3f(*map(float, v)) for v in verts]))
                mesh.CreateFaceVertexCountsAttr(Vt.IntArray([4] * (len(pts) - 1)))
                mesh.CreateFaceVertexIndicesAttr(Vt.IntArray(idx))
                mesh.CreateDoubleSidedAttr(True)
                mesh.CreateSubdivisionSchemeAttr('none')
                pv = UsdGeom.PrimvarsAPI(mesh).CreatePrimvar('st', Sdf.ValueTypeNames.TexCoord2fArray, UsdGeom.Tokens.vertex)
                pv.Set(Vt.Vec2fArray([Gf.Vec2f(*u) for u in uv]))
                bind(mesh.GetPrim(), self.webbing)
            for side, hp in (('L', hl), ('R', hr)):
                hk = st.GetPrimAtPath(base + '/Hook' + side)
                if not hk:
                    hk = st.DefinePrim(base + '/Hook' + side, 'Xform')
                    tg.rounded_box(st, base + f'/Hook{side}/G', (-.03, -.012, -.01), (.03, .012, .03), .006, self.hook)
                set_matrix(hk, R, hp)
            if i in sim.released and st.GetPrimAtPath(base + '/Buckle'):
                st.RemovePrim(base + '/Buckle')
            if i not in sim.released:
                d = el - hl
                d /= np.linalg.norm(d)
                y = np.cross(d, fwd)
                y /= np.linalg.norm(y)
                x = np.cross(y, d)
                Rb = np.stack([x, y, d], axis=1)
                pos = hl + (el - hl) * .34
                bk = st.GetPrimAtPath(base + '/Buckle')
                if not bk:
                    bk = st.DefinePrim(base + '/Buckle', 'Xform')
                    tg.rounded_box(st, base + '/Buckle/Frame', (-.042, -.004, -.075), (.042, .03, .075), .008, self.buckle)
                    tg.rounded_box(st, base + '/Buckle/Lever', (-.03, .03, -.02), (.03, .045, .11), .006, self.buckle)
                    tg.rounded_box(st, base + '/Buckle/Spool', (-.045, -.004, -.016), (.045, .028, .016), .012, self.buckle)
                set_matrix(bk, Rb, pos)


class Cam:
    def __init__(self):
        self.rp = None
        self.ann = None
        self.eye = None

    def shot(self, stage, eye, target, focal=35., fstop=0., smooth=0.):
        if smooth and self.eye is not None:
            eye = self.eye * smooth + np.asarray(eye) * (1 - smooth)
        self.eye = np.asarray(eye, float)
        cam = look_at('/World/HeroCam', stage, self.eye, target, focal)
        cam.GetVerticalApertureAttr().Set(36. * H / W)
        # 무대 단위가 m 라 렌즈 값(mm)이 10배 크게 먹는다: 얕은 심도는 fStop 을 크게 잡는다. 0 = 심도 없음
        cam.CreateFStopAttr(float(fstop))
        cam.CreateFocusDistanceAttr(float(np.linalg.norm(np.asarray(target) - self.eye)))
        if self.rp is None:
            self.rp = rep.create.render_product('/World/HeroCam', (W, H))
            self.ann = rep.AnnotatorRegistry.get_annotator('rgb')
            self.ann.attach([self.rp])

    def grab(self, steps=1):
        for _ in range(steps):
            rep.orchestrator.step(rt_subframes=SUB, pause_timeline=True)
        return np.asarray(self.ann.get_data())[:, :, :3].copy()


def scene(case, kind):
    sim = TruckSim(case)
    look = HeroLook(sim)
    look.upgrade()
    look.cargo_vis(kind)
    look.hide_factory_ground()
    if BED:
        look.studio()
        look.bed_only()
    sim.settle(1.0)
    look.sync_cargo()
    look.straps_mesh()
    return sim, look


def hero_views(sim):
    P, R, CP, CR = sim.poses()
    bed = P + R @ np.array([-1.15, 0., -0.12])
    return {
        'hero_bed': (P + R @ np.array([-4.5, 2.5, 2.35]), bed, 46., 70.) if not BED else (P + R @ np.array([-4.4, 2.9, 1.25]), P + R @ np.array([-1.05, 0., -0.02]), 40., 80.),
        'hero_wide': (P + R @ np.array([-10.5, 3.2, 3.6]), P + R @ np.array([-0.9, 0., 0.1]), 40., 0.) if not BED else (P + R @ np.array([-6.8, -4.3, 2.9]), P + R @ np.array([-1.1, 0., -0.2]), 36., 0.),
        'hero_top': (P + R @ np.array([-1.3, .01, 5.2]), P + R @ np.array([-1.3, 0, -0.1]), 26., 0.),
        'hero_side': (P + R @ np.array([-1.2, 4.6, .75]), P + R @ np.array([-1.2, 0, .05]), 34., 90.),
    }


def vert_cam(P, R):
    """세로 화면 카메라: 뒤 왼쪽 낮은 자리에서 적재함을 따라 앞을 본다. 차체 기준 (눈 x,y,z, 보는 곳 x,y,z, 초점거리)"""
    v = [float(x) for x in os.environ.get('HERO_VERT_CAM', VERT_CAM).split(',')]
    return P + R @ np.array(v[:3]), P + R @ np.array(v[3:6]), v[6]


VERT_CAM = '-4.27,0.69,1.55,-1.0,0.1,0.2,86'      # 상자 + 벨트가 화면 높이의 절반쯤. 더 당기면 9:16 폭에서 벨트 · 상자가 잘린다


def vert_stills():
    """세로 정지 사진 2장: 급제동 뒤(먼저, 렌더 전에 차를 움직인다) -> 새 장면에서 출발 전"""
    box = CARGO['box']
    case = Case('box', 300., box['size'], box['mu'], 2, 1250., 0.35)
    cam = Cam()
    sim, look = scene(case, 'box')
    sim.launch(50 / 3.6)
    for _ in range(int(1.0 / DT)):
        sim.step()
    brake_to_stop(sim)
    win = max(1, int(round(0.1 / DT)))
    ax = np.convolve(-np.array(sim.rec.ax), np.ones(win) / win, 'valid')
    print('BRAKE peak %.2f g (0.1 s mean) shift %.1f cm on_bed %s' % (ax.max(), sim.rec.dx[-1] * 100, sim.rec.on_bed[-1]), flush=True)
    look.sync_cargo()
    look.straps_mesh()
    look.ghost_box()
    P, R, CP, CR = sim.poses()
    eye, tgt, focal = vert_cam(P, R)
    cam.shot(sim.stage, eye, tgt, focal, 0.)
    t0 = time.time()
    Image.fromarray(cam.grab(6)).save(OUT / (os.environ.get('HERO_VERT_NAME', 'vert') + '_after.png'))
    print('HERO vert_after %.1f s' % (time.time() - t0), flush=True)
    if os.environ.get('HERO_VERT_ONLY') == 'after':
        return
    cam = Cam()
    sim, look = scene(case, 'box')
    look.ghost_box()
    P, R, CP, CR = sim.poses()
    eye, tgt, focal = vert_cam(P, R)
    cam.shot(sim.stage, eye, tgt, focal, 0.)
    t0 = time.time()
    Image.fromarray(cam.grab(6)).save(OUT / (os.environ.get('HERO_VERT_NAME', 'vert') + '_before.png'))
    print('HERO vert_before %.1f s' % (time.time() - t0), flush=True)


def stills():
    """급제동 장면을 먼저 (렌더 전에 차를 움직여야 한다), 그다음 새 장면에서 출발 전"""
    box = CARGO['box']
    case = Case('box', 300., box['size'], box['mu'], 2, 1250., 0.35)
    cam = Cam()
    sim, look = scene(case, 'box')
    sim.launch(50 / 3.6)
    for _ in range(int(1.0 / DT)):
        sim.step()
    brake_to_stop(sim)
    print('BRAKE peak %.2f g shift %.1f cm' % (max(-a for a in sim.rec.ax), sim.rec.dx[-1] * 100), flush=True)
    look.sync_cargo()
    look.straps_mesh()
    look.ghost_box()
    v = hero_views(sim)
    first = True
    for name in ('hero_bed', 'hero_top'):
        eye, tgt, focal, fs = v[name]
        cam.shot(sim.stage, eye, tgt, focal, fs)
        Image.fromarray(cam.grab(6 if first else 3)).save(OUT / f'{name}_after.png')
        first = False
        print('HERO', name + '_after', flush=True)
    cam = Cam()
    sim, look = scene(case, 'box')
    v = hero_views(sim)
    for name in ('hero_bed', 'hero_wide', 'hero_top', 'hero_side'):
        eye, tgt, focal, fs = v[name]
        cam.shot(sim.stage, eye, tgt, focal, fs)
        t0 = time.time()
        Image.fromarray(cam.grab(6 if name == 'hero_bed' else 3)).save(OUT / f'{name}.png')
        print('HERO', name, '%.1f s' % (time.time() - t0), flush=True)


def brake_to_stop(sim, target=0.75, hold=2.5, each=None):
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
        if each:
            each()
        if stopped is not None and sim.t - stopped > hold:
            break


def hud(img, rec, t, title, lines, status, tone):
    im = Image.fromarray(img).convert('RGBA')
    ov = Image.new('RGBA', im.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(ov)
    f_t = ImageFont.truetype(str(FONT / 'Pretendard-SemiBold.ttf'), 22)
    f_s = ImageFont.truetype(str(FONT / 'Pretendard-Medium.ttf'), 17)
    f_b = ImageFont.truetype(str(FONT / 'Pretendard-Bold.ttf'), 44)
    f_m = ImageFont.truetype(str(FONT / 'Pretendard-Medium.ttf'), 18)
    d.rounded_rectangle([28, 26, 28 + 470, 26 + 64], 16, fill=(16, 22, 30, 170))
    d.text((48, 36), title, font=f_t, fill=(255, 255, 255, 255))
    d.text((48, 64), 'Omniverse RTX · PhysX 240 Hz · 같은 물리 계산', font=f_s, fill=(190, 200, 212, 255))
    x0, y0 = 28, H - 28 - 150
    d.rounded_rectangle([x0, y0, x0 + 600, y0 + 150], 18, fill=(16, 22, 30, 178))
    for k, (lab, val) in enumerate(lines):
        x = x0 + 24 + k * 192
        d.text((x, y0 + 24), lab, font=f_m, fill=(190, 200, 212, 255))
        d.text((x, y0 + 54), val, font=f_b, fill=(255, 255, 255, 255))
    col = {'green': (63, 213, 154), 'orange': (255, 150, 64), 'red': (255, 90, 82), 'grey': (142, 152, 164)}[tone]
    d.rounded_rectangle([x0 + 24, y0 + 112, x0 + 24 + 14, y0 + 126], 4, fill=col + (255,))
    d.text((x0 + 48, y0 + 106), status, font=f_m, fill=(235, 240, 245, 255))
    return np.asarray(Image.alpha_composite(im, ov).convert('RGB'))


def video():
    """시속 50 km 정속 -> 0.75 g 급제동 -> 정차. 30 fps.
    1) 렌더 없이 물리만 돌려 프레임마다 자세를 기록 (렌더가 끼면 차 입력이 듣지 않는다)
    2) 물리를 멈추고 기록한 자세를 그대로 놓아 가며 렌더. 프레임 값은 values.json (자막은 make_film.py)"""
    import json
    box = CARGO['box']
    cam = Cam()
    sim, look = scene(Case('box', 300., box['size'], box['mu'], 2, 1250., 0.35), 'box')
    fdir = OUT / ('frames_brake_vert' if VERT else 'frames_brake')
    fdir.mkdir(exist_ok=True)
    for f in fdir.glob('*'):
        f.unlink()
    per = int(round((1 / 30) / DT))
    win = max(1, int(round(0.1 / DT)))
    k = [0]
    rec = []

    def keep():
        k[0] += 1
        if k[0] % per:
            return
        ax = np.array(sim.rec.ax[-win:], float)
        rec.append({'poses': tuple(np.array(x, float) for x in sim.poses()), 'released': set(sim.released),
                    'v': {'t': round(sim.t, 3), 'kmh': round(float(sim.rec.kmh[-1]), 2), 'decel': round(float(-ax.mean()), 3), 'dx_cm': round(float(sim.rec.dx[-1] * 100), 2)}})

    sim.launch(50 / 3.6)
    while sim.t < 2.0:
        sim.step()
        keep()
    brake_to_stop(sim, each=keep, hold=2.0)
    print('RECORDED', len(rec), 'peak %.2f g' % max(r['v']['decel'] for r in rec), 'shift %.1f cm' % rec[-1]['v']['dx_cm'], flush=True)
    sim.sim.stop()
    vp = sim.stage.GetPrimAtPath(sim.vp)
    vals = []
    if VERT:
        look.ghost_box()                 # 출발 때 자리 (하늘색 선): 짐이 앞으로 밀린 만큼이 보인다
    R0 = rec[0]['poses'][1]
    t_frame = time.time()
    for n, r in enumerate(rec):
        P, R, CP, CR = r['poses']
        set_matrix(vp, R, P)
        sim.released = r['released']
        look.sync_cargo(r['poses'])
        look.straps_mesh(r['poses'])
        orbit = min(1., r['v']['t'] / 7.)
        if VERT:  # 세로: 카메라는 차를 따라가되 흔들리지 않는다 (처음 차체 방향 그대로, 줌 · 회전 없음)
            eye, tgt, focal = vert_cam(P, R0)
            cam.shot(sim.stage, eye, tgt, focal, 0.)
        elif BED:   # 적재함만: 가까이서 천천히 돌아 들어가는 카메라 (차와 같이 움직인다)
            eye = P + R @ np.array([-5.6 + 1.2 * orbit, 3.6 - 1.4 * orbit, 1.9 - 0.35 * orbit])
            cam.shot(sim.stage, eye, P + R @ np.array([-1.1, 0., -0.05]), 36., 0.)
        else:
            eye = P + R @ np.array([-7.6 + 2.4 * orbit, 3.9 - 0.4 * orbit, 2.35 - 0.3 * orbit])
            cam.shot(sim.stage, eye, P + R @ np.array([-0.9, 0., -0.05]), 34., 0., smooth=.85)
        img = cam.grab(1 if n else 8)
        Image.fromarray(img).save(fdir / f'f{n:04d}.png')
        vals.append(r['v'])
        if n % 15 == 0:
            print('FRAME', n, 'kmh %.0f' % r['v']['kmh'], 'x %.1f' % P[0], '%.1f s/frame' % ((time.time() - t_frame) / (n + 1)), flush=True)
            (fdir / 'values.json').write_text(json.dumps(vals), encoding='utf-8')
    (fdir / 'values.json').write_text(json.dumps(vals), encoding='utf-8')
    print('VIDEO_FRAMES', len(vals), '%.1f s/frame' % ((time.time() - t_frame) / max(1, len(vals))), flush=True)


def lost():
    """고무바 2개 냉장고, 시속 40 km 나들목 램프 0.42 g: 넘어지는 순간 (앱 기록 'lost' 와 같은 조건)"""
    a = CARGO['appliance']
    cam = Cam()
    sim, look = scene(Case('appliance', 300., a['size'], a['mu'], 2, 0., 0.0, rubber=True), 'appliance')
    for _ in range(int(2.0 / DT)):
        sim.step(brake=1.0)
    fwd = 0.
    while True:
        fwd, _ = sim.step(accel=0.55)
        if fwd >= 40 / 3.6 or sim.t > 40:
            break
    t_c = sim.t
    while sim.t < t_c + 3.0:
        sim.step(accel=0.12)
    st = math.atan(PV5['wheelbase'] * .42 * 9.81 / (max(1., fwd) ** 2)) / PV5['max_steer']
    t = 0.
    while t < 5.5:
        ramp = min(1., t / 0.6)
        sim.step(accel=0.2, steer=st * ramp)
        t += DT
        if sim.rec.tilt[-1] >= 34.:
            break
    look.sync_cargo()
    look.straps_mesh()
    P, R, CP, CR = sim.poses()
    mid = (P + R @ np.array([-1.1, 0, -.1]) + CP) / 2
    cam.shot(sim.stage, mid + R @ np.array([-6.2, -5.4, 2.6]), mid, 32., 0.)
    Image.fromarray(cam.grab(6)).save(OUT / 'hero_lost.png')
    print('HERO hero_lost tilt %.1f on_bed %s' % (sim.rec.tilt[-1], sim.rec.on_bed[-1]), flush=True)


def case():
    """검증 그림용 (적재함만): CASE=slide_b2_T1250 | hold_b4_T1250 | tip_fridge_rubber. 사건 뒤를 먼저 (렌더 전에 차를 움직인다), 그다음 새 장면에서 출발 전"""
    key = os.environ.get('CASE', 'slide_b2_T1250')
    out = OUT / 'cases'
    out.mkdir(parents=True, exist_ok=True)
    box, a = CARGO['box'], CARGO['appliance']
    if key == 'tip_fridge_rubber':
        mk = lambda: Case('appliance', 300., a['size'], a['mu'], 2, 0., 0.0, rubber=True)
        kind = 'appliance'
    else:
        belts = 4 if key.startswith('hold') else 2
        mk = lambda: Case('box', 300., box['size'], box['mu'], belts, 1250., 0.35)
        kind = 'box'
    cam = Cam()
    sim, look = scene(mk(), kind)
    if kind == 'appliance':
        for _ in range(int(2.0 / DT)):
            sim.step(brake=1.0)
        fwd = 0.
        while True:
            fwd, _ = sim.step(accel=0.55)
            if fwd >= 40 / 3.6 or sim.t > 40:
                break
        t_c = sim.t
        while sim.t < t_c + 3.0:
            sim.step(accel=0.12)
        stv = math.atan(PV5['wheelbase'] * .42 * 9.81 / (max(1., fwd) ** 2)) / PV5['max_steer']
        t = 0.
        while t < 5.5:
            sim.step(accel=0.2, steer=stv * min(1., t / 0.6))
            t += DT
            if sim.rec.tilt[-1] >= 34.:
                break
    else:
        sim.launch(50 / 3.6)
        for _ in range(int(1.0 / DT)):
            sim.step()
        brake_to_stop(sim)
        look.ghost_box()
    look.sync_cargo()
    look.straps_mesh()
    P, R, CP, CR = sim.poses()
    if kind == 'appliance':
        mid = (P + R @ np.array([-1.1, 0, -.1]) + CP) / 2
        eye, tgt = mid + R @ np.array([-5.4, -4.6, 2.4]), mid
    else:
        eye, tgt = P + R @ np.array([-4.4, 2.9, 1.25]), P + R @ np.array([-1.05, 0., -0.02])
    cam.shot(sim.stage, eye, tgt, 36., 0.)
    Image.fromarray(cam.grab(6)).save(out / f'{key}_after.png')
    print('CASE', key, 'after shift %.1f cm tilt %.1f on_bed %s' % (sim.rec.dx[-1] * 100, sim.rec.tilt[-1], sim.rec.on_bed[-1]), flush=True)
    cam = Cam()
    sim, look = scene(mk(), kind)
    P, R, CP, CR = sim.poses()
    if kind == 'appliance':
        eye, tgt = P + R @ np.array([-5.6, -3.9, 2.0]), P + R @ np.array([-1.1, 0., .2])
    else:
        eye, tgt = P + R @ np.array([-4.4, 2.9, 1.25]), P + R @ np.array([-1.05, 0., -0.02])
    cam.shot(sim.stage, eye, tgt, 36., 0.)
    Image.fromarray(cam.grab(6)).save(out / f'{key}_before.png')
    print('CASE', key, 'before', flush=True)


if __name__ == '__main__':
    t0 = time.time()
    try:
        {'stills': vert_stills if VERT else stills, 'video': video, 'lost': lost, 'case': case}[MODE]()
    except Exception as error:  # noqa: BLE001
        import traceback
        traceback.print_exc()
        print('HERO_ERROR', error, flush=True)
    print('HERO_DONE %.0f s' % (time.time() - t0), flush=True)
    app.close()
