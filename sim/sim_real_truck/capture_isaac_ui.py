"""Isaac Sim 4.2 화면을 Kit 안에서 그대로 찍는다 (기획서용). 바탕화면 캡처가 아니라 Kit 의 스왑체인 · 뷰포트 캡처를 쓴다.

  python sim_real_truck/capture_isaac_ui.py app       # isaac_app.png      Isaac Sim 창 전체 (뷰포트 + Stage + Property)
  python sim_real_truck/capture_isaac_ui.py physics   # isaac_physics.png  PhysX 디버그 표시 (충돌 모양 · 서스펜션 · 질량)
  python sim_real_truck/capture_isaac_ui.py brake     # isaac_brake_seq.png 급제동 한 번을 세 장으로 (전 · 최대 감속 · 정차 뒤)

장면 · 차 모양 · 제동은 render_hero.py 것을 그대로 쓴다 (render_hero 는 import 하면 SimulationApp 을 띄우므로, 여기서 먼저 띄운 앱을 돌려주게 바꿔 끼운다).
물리는 pv5sim.TruckSim (PhysX 240 Hz). 렌더는 RTX 실시간 (RaytracedLighting).
급제동: 물리만 돌려 자세를 기록 -> 물리를 멈춤 -> 기록한 자세를 놓고 뷰포트를 찍는다 (렌더가 끼면 차 입력이 안 듣는 문제를 피한다).
"""
import json
import os
import sys
import time
from pathlib import Path

os.environ.setdefault('OMNI_KIT_ACCEPT_EULA', 'YES')
import isaacsim
from isaacsim import SimulationApp

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
MODE = sys.argv[1] if len(sys.argv) > 1 else 'app'
OUT = Path(os.environ.get('ISAAC_OUT', str(ROOT / '공모전/기획서_작업/review/v7/photos/isaac')))
OUT.mkdir(parents=True, exist_ok=True)
TMP = HERE / 'results' / 'isaac_ui'            # Kit 캡처는 한글 경로에 못 쓴다: 여기에 찍고 OUT 으로 복사한다
TMP.mkdir(parents=True, exist_ok=True)
APPS = Path(sys.executable).parent / 'Lib/site-packages/isaacsim/apps'
KIT = APPS / os.environ.get('ISAAC_KIT', 'isaac_twin_light.kit')
WW, WH = 1920, 1080
app = SimulationApp({'headless': False, 'renderer': 'RayTracedLighting', 'width': WW, 'height': WH,
                     'window_width': WW, 'window_height': WH}, experience=str(KIT))
isaacsim.SimulationApp = lambda *a, **k: app          # render_hero 가 두 번째 앱을 띄우지 못하게
_argv = sys.argv[:]
sys.argv = [_argv[0], 'stills']
sys.path.insert(0, str(HERE))
import render_hero as rh  # noqa: E402
sys.argv = _argv

import carb  # noqa: E402
import numpy as np  # noqa: E402
import omni.kit.app  # noqa: E402
import omni.renderer_capture  # noqa: E402
import omni.usd  # noqa: E402
from omni.kit.viewport.utility import capture_viewport_to_file, get_active_viewport  # noqa: E402
from PIL import Image, ImageDraw, ImageFont  # noqa: E402
from pxr import UsdGeom  # noqa: E402

from pv5sim import DT, Case  # noqa: E402
from spec import CARGO  # noqa: E402

S = carb.settings.get_settings()
_VIS = ['/persistent/physics/visualizationDisplay' + k for k in ('Colliders', 'MassProperties', 'Joints')]
print('PHYS_VIS_AT_START', [S.get(k) for k in _VIS], flush=True)
S.set_int(_VIS[0], 0)
S.set_int(_VIS[1], 0)
S.set('/rtx/rendermode', 'RaytracedLighting')      # render_hero 가 경로 추적으로 바꿔 둔 것을 실시간으로 되돌린다
S.set('/rtx/post/aa/op', 3)
S.set('/app/viewport/grid/enabled', False)


def pump(n=30, wait=0.):
    for _ in range(n):
        app.update()
        if wait:
            time.sleep(wait)


def camera(stage, eye, target, focal, w, h):
    cam = rh.look_at('/World/HeroCam', stage, eye, target, focal)
    cam.GetVerticalApertureAttr().Set(36. * h / w)
    cam.CreateFStopAttr(0.)
    vp = get_active_viewport()
    vp.camera_path = '/World/HeroCam'
    return vp


def deliver(tmp, path):
    import shutil
    if Path(path) != tmp:
        shutil.copyfile(tmp, path)
    return Path(path)


def shot_viewport(vp, path, settle=60):
    final, path = Path(path), TMP / Path(path).name
    if path.exists():
        path.unlink()
    pump(settle)
    capture_viewport_to_file(vp, str(path))
    for _ in range(200):
        app.update()
        if path.exists() and path.stat().st_size > 0:
            break
    pump(5)
    return deliver(path, final)


def shot_window(path, settle=60):
    """Kit 창(스왑체인) 그대로: UI 까지 찍힌다"""
    final, path = Path(path), TMP / Path(path).name
    if path.exists():
        path.unlink()
    pump(settle)
    cap = omni.renderer_capture.acquire_renderer_capture_interface()
    cap.capture_next_frame_swapchain(str(path))
    pump(6)
    cap.wait_async_capture()
    pump(3)
    return deliver(path, final)


def box_case():
    box = CARGO['box']
    return Case('box', 300., box['size'], box['mu'], 2, 1250., 0.35)


def app_shot():
    sim, look = rh.scene(box_case(), 'box')
    P, R, CP, CR = sim.poses()
    vp = camera(sim.stage, P + R @ np.array([-6.6, 4.4, 2.5]), P + R @ np.array([0.1, 0., -0.15]), 30., 16, 9)
    pump(240, .01)                                   # 나무 · 질감이 다 올라올 때까지
    sel = omni.usd.get_context().get_selection()
    sel.set_selected_prim_paths([os.environ.get('ISAAC_SELECT', '/World/Cargo')], True)
    pump(120, .01)
    p = shot_window(OUT / 'isaac_app.png', 90)
    print('APP_SHOT', p, Image.open(p).size, flush=True)
    shot_viewport(vp, OUT / '_app_viewport_only.png', 10)


def physics_shot():
    from omni.physx.bindings import _physx as px
    from omni.physxui import get_physxui_interface
    sim, look = rh.scene(box_case(), 'box')
    P, R, CP, CR = sim.poses()
    w, h = 1920, 1080
    vp = camera(sim.stage, P + R @ np.array([-5.6, 5.0, 1.9]), P + R @ np.array([0.5, 0., -0.2]), 30., w, h)
    flags = os.environ.get('PHYS_FLAGS', 'colliders,mass,susp').split(',')
    ui = get_physxui_interface()
    ui.set_visualization_distance(1.0e6)
    if 'colliders' in flags:
        S.set(px.SETTING_DISPLAY_COLLIDERS, 2)       # 0 없음 / 1 고른 것 / 2 전부
    if 'mass' in flags:
        S.set(px.SETTING_DISPLAY_MASS_PROPERTIES, 2)
    if 'joints' in flags:
        S.set(px.SETTING_DISPLAY_JOINTS, True)
    if 'debug' in flags:
        ui.enable_debug_visualization(True)
    if 'susp' in flags:
        ui.set_vehicle_visualization('Suspension', True)
    print('VEHICLE_VIS', ui.get_vehicle_visualization('Suspension'), flags, flush=True)
    hide = tuple(x for x in os.environ.get('PHYS_HIDE', '').split(',') if x)   # 겉모양 일부를 감춰 속의 물리 표시가 보이게
    ghost = tuple(x for x in os.environ.get('PHYS_GHOST', 'Tyre,Rim,Arch').split(',') if x)
    for prim in sim.stage.GetPrimAtPath(sim.vp + '/Look').GetChildren():
        if hide and prim.GetName().startswith(hide):
            UsdGeom.Imageable(prim).CreatePurposeAttr('guide')
        elif ghost and prim.GetName().startswith(ghost):
            rh.bind(prim, look.ghost)
    pump(300, .01)
    p = shot_viewport(vp, OUT / os.environ.get('PHYS_NAME', 'isaac_physics.png'), 120)     # 디버그 선은 뷰포트 캡처에도 찍힌다
    print('PHYSICS_SHOT', p, Image.open(p).size, flush=True)
    sel = omni.usd.get_context().get_selection()
    sel.set_selected_prim_paths([sim.vp], True)
    pump(60, .01)
    shot_window(OUT / 'isaac_physics_ui.png', 60)    # 같은 장면을 Isaac Sim 창째로 (차량 프림 선택)


def caption(img, lines, w, bar=96):
    im = Image.new('RGB', (w, img.shape[0] + bar), (14, 16, 20))
    im.paste(Image.fromarray(img), (0, 0))
    d = ImageDraw.Draw(im)
    f1 = ImageFont.truetype(str(rh.FONT / 'Pretendard-SemiBold.ttf'), 30)
    f2 = ImageFont.truetype(str(rh.FONT / 'Pretendard-Medium.ttf'), 24)
    d.text((28, img.shape[0] + 12), lines[0], font=f1, fill=(255, 255, 255))
    d.text((28, img.shape[0] + 54), lines[1], font=f2, fill=(180, 190, 204))
    return im


def brake_seq():
    sim, look = rh.scene(box_case(), 'box')
    per = int(round((1 / 30) / DT))
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
                          'shift_cm': round(float(sim.rec.dx[-1] * 100), 2), 'brake': round(float(sim.rec.brake[-1]), 3)}})

    sim.launch(50 / 3.6)
    while sim.t < 2.0:
        sim.step()
        keep()
    n_cruise = len(rec)
    rh.brake_to_stop(sim, each=keep, hold=2.0)
    peak = max(range(len(rec)), key=lambda i: rec[i]['v']['decel_g'])
    picks = [('before', n_cruise - 1), ('peak', peak), ('after', len(rec) - 1)]
    print('RECORDED', len(rec), 'peak %.2f g' % rec[peak]['v']['decel_g'], 'shift %.1f cm' % rec[-1]['v']['shift_cm'],
          'on_bed', sim.rec.on_bed[-1], 'tilt %.1f' % sim.rec.tilt[-1], flush=True)
    look.ghost_box()
    sim.sim.stop()
    vp_prim = sim.stage.GetPrimAtPath(sim.vp)
    w, h = 1280, 960
    names = {'before': '① 제동 전', 'peak': '② 최대 감속', 'after': '③ 정차 뒤'}
    frames, clean, vals = [], [], {}
    for name, i in picks:
        r = rec[i]
        P, R, CP, CR = r['poses']
        rh.set_matrix(vp_prim, R, P)
        look.sync_cargo(r['poses'])
        look.straps_mesh(r['poses'])
        # 적재함 옆 (왼쪽), 차와 같이 움직이는 카메라. 차 전체가 들어온다
        vp = camera(sim.stage, P + R @ np.array([-1.6, 6.1, 1.5]), P + R @ np.array([0.1, 0., -0.1]), 30., w, h)
        vp.resolution = (w, h)
        p = shot_viewport(vp, OUT / f'_brake_{name}.png', 150 if name == 'before' else 70)
        img = np.asarray(Image.open(p).convert('RGB'))
        v = r['v']
        vals[name] = v
        print('FRAME', name, img.shape, v, flush=True)
        clean.append(img)
        frames.append(caption(img, [names[name] + '   t = %.2f s' % v['t'],
                                    '속도 %.0f km/h · 감속 %.2f g · 짐 이동 %.1f cm' % (max(0., v['kmh']), max(0., v['decel_g']), v['shift_cm'])], img.shape[1]))
    gap = 12
    W = sum(f.size[0] for f in frames) + gap * 2
    seq = Image.new('RGB', (W, frames[0].size[1]), (14, 16, 20))
    x = 0
    for f in frames:
        seq.paste(f, (x, 0))
        x += f.size[0] + gap
    seq.save(OUT / 'isaac_brake_seq.png')
    Wc = sum(c.shape[1] for c in clean) + gap * 2
    cl = Image.new('RGB', (Wc, clean[0].shape[0]), (14, 16, 20))
    x = 0
    for c in clean:
        cl.paste(Image.fromarray(c), (x, 0))
        x += c.shape[1] + gap
    cl.save(OUT / 'isaac_brake_seq_clean.png')
    (OUT / '_brake_values.json').write_text(json.dumps({'frames': vals, 'recorded': len(rec), 'fps': 30, 'physics_hz': round(1 / DT),
                                                         'peak_decel_g_0p1s_mean': rec[peak]['v']['decel_g'], 'final_shift_cm': rec[-1]['v']['shift_cm']},
                                                        ensure_ascii=False, indent=1), encoding='utf-8')
    print('BRAKE_SEQ', seq.size, flush=True)


if __name__ == '__main__':
    t0 = time.time()
    try:
        {'app': app_shot, 'physics': physics_shot, 'brake': brake_seq}[MODE]()
    except Exception as error:  # noqa: BLE001
        import traceback
        traceback.print_exc()
        print('CAPTURE_ERROR', error, flush=True)
    # PhysX 표시 설정은 /persistent 라 사용자 설정 파일에 남는다: 기본값으로 되돌려 놓는다 (다른 트윈에 초록 선이 뜨지 않게)
    S.set_int(_VIS[0], 0)
    S.set_int(_VIS[1], 0)
    S.set_bool(_VIS[2], True)
    S.set('/app/window/hideUi', False)
    try:
        from omni.physxui import get_physxui_interface as _ui
        _ui().set_vehicle_visualization('Suspension', False)
    except Exception:  # noqa: BLE001
        pass
    pump(5)
    print('RESTORED', [S.get(k) for k in _VIS], flush=True)
    print('CAPTURE_DONE %.0f s' % (time.time() - t0), flush=True)
    app.close()
