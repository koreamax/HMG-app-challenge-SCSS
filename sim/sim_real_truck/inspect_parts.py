"""Dump the attributes the omni.physx.vehicle factory writes on the vehicle and wheel prims (to know what to override)."""
import sys
from pathlib import Path

from isaacsim import SimulationApp

KIT = Path(sys.executable).parent / 'Lib/site-packages/isaacsim/apps/isaac_twin_light.kit'
app = SimulationApp({'headless': True}, experience=str(KIT))
import omni.kit.app  # noqa: E402

omni.kit.app.get_app().get_extension_manager().set_extension_enabled_immediate('omni.physx.vehicle', True)
import omni.usd  # noqa: E402
from pxr import UsdGeom  # noqa: E402
from omni.physxvehicle.scripts.helpers import Factory  # noqa: E402

ctx = omni.usd.get_context()
ctx.new_stage()
stage = ctx.get_stage()
UsdGeom.Xform.Define(stage, '/World')
stage.SetDefaultPrim(stage.GetPrimAtPath('/World'))
vp, wp = [], []
Factory.create4WheeledCarsScenario(stage, 1.0, 1, createCollisionShapesForWheels=False, driveMode=Factory.DRIVE_BASIC,
                                   vehiclePathsOut=vp, wheelAttachmentPathsOut=wp, axes=Factory.AxesIndices(2, 0, 1),
                                   timeStepsPerSecond=120)
out = []
for prim in stage.Traverse():
    p = str(prim.GetPath())
    if not any(k in p for k in ('Wheel', 'Tire', 'Suspension')) or p.startswith(vp[0]):
        continue
    out.append(f'== {p} [{prim.GetTypeName()}] apis={prim.GetAppliedSchemas()}')
    for a in prim.GetAttributes():
        if a.HasAuthoredValue():
            out.append(f'   {a.GetName()} = {a.Get()}')
    for r in prim.GetRelationships():
        if r.GetTargets():
            out.append(f'   rel {r.GetName()} -> {[str(t) for t in r.GetTargets()]}')
Path(__file__).with_name('vehicle_parts.txt').write_text('\n'.join(out), encoding='utf-8')
print('INSPECT_DONE', len(out), flush=True)
app.close()
