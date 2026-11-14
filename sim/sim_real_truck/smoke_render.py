"""헤드리스 RTX 렌더 시험: 상자 하나와 하늘, 카메라 -> PNG"""
import sys
from pathlib import Path

from isaacsim import SimulationApp

KIT = Path(sys.executable).parent / 'Lib/site-packages/isaacsim/apps/isaac_twin_light.kit'
app = SimulationApp({'headless': True, 'renderer': 'RayTracedLighting', 'width': 1600, 'height': 900}, experience=str(KIT))
import omni.usd  # noqa: E402
from pxr import Gf, UsdGeom, UsdLux  # noqa: E402

ctx = omni.usd.get_context()
ctx.new_stage()
stage = ctx.get_stage()
UsdGeom.SetStageUpAxis(stage, UsdGeom.Tokens.z)
UsdGeom.Xform.Define(stage, '/World')
cube = UsdGeom.Cube.Define(stage, '/World/Box')
cube.AddTranslateOp().Set(Gf.Vec3d(0, 0, 0.5))
dome = UsdLux.DomeLight.Define(stage, '/World/Sky')
dome.CreateIntensityAttr(1000)
hdr = Path(__file__).resolve().parents[1] / 'assets/nvidia/sky_clear/noon_grass_4k.hdr'
dome.CreateTextureFileAttr(str(hdr).replace('\\', '/'))
cam = UsdGeom.Camera.Define(stage, '/World/Cam')
cam.AddTranslateOp().Set(Gf.Vec3d(4, -4, 2.5))
cam.AddRotateXYZOp().Set(Gf.Vec3f(70, 0, 45))
for _ in range(20):
    app.update()
out = Path(__file__).with_name('results') / 'smoke_render.png'
out.parent.mkdir(exist_ok=True)
ok = False
try:
    import omni.replicator.core as rep
    rp = rep.create.render_product('/World/Cam', (1600, 900))
    ann = rep.AnnotatorRegistry.get_annotator('rgb')
    ann.attach([rp])
    for _ in range(30):
        rep.orchestrator.step(rt_subframes=4)
    data = ann.get_data()
    from PIL import Image
    Image.fromarray(data[:, :, :3]).save(out)
    ok = True
    print('RENDER_OK replicator', data.shape, flush=True)
except Exception as error:   # noqa: BLE001
    import traceback
    traceback.print_exc()
    print('REPLICATOR_FAIL', error, flush=True)
print('SMOKE_RENDER_DONE', ok, flush=True)
app.close()
