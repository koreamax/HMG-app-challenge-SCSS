"""PhysX Vehicle smoke test (headless): one 4-wheeled vehicle from the omni.physx.vehicle factory, Z up, X forward.
Accelerate, then full brake; print speed and deceleration. Run:
  OMNI_KIT_ACCEPT_EULA=YES PYTHONUTF8=1 <env_isaacsim42>/python.exe sim_real_truck/smoke_vehicle.py
"""
import math
import sys
import time
from pathlib import Path

from isaacsim import SimulationApp

KIT = Path(sys.executable).parent / 'Lib/site-packages/isaacsim/apps/isaac_twin_light.kit'
app = SimulationApp({'headless': True}, experience=str(KIT))

import omni.kit.app  # noqa: E402

em = omni.kit.app.get_app().get_extension_manager()
em.set_extension_enabled_immediate('omni.physx.vehicle', True)

import omni.usd  # noqa: E402
from pxr import Gf, PhysxSchema, UsdGeom, UsdPhysics  # noqa: E402
from omni.physxvehicle.scripts.helpers import Factory  # noqa: E402
from omni.isaac.core import SimulationContext  # noqa: E402

ctx = omni.usd.get_context()
ctx.new_stage()
stage = ctx.get_stage()
UsdGeom.Xform.Define(stage, '/World')
stage.SetDefaultPrim(stage.GetPrimAtPath('/World'))
vehicle_paths = []
wheel_paths = []
Factory.create4WheeledCarsScenario(stage, 1.0, 1, createCollisionShapesForWheels=True, driveMode=Factory.DRIVE_BASIC,
                                   vehiclePathsOut=vehicle_paths, wheelAttachmentPathsOut=wheel_paths,
                                   axes=Factory.AxesIndices(2, 0, 1), timeStepsPerSecond=120)
vp = vehicle_paths[0]
print('VEHICLE', vp, wheel_paths, flush=True)
sim = SimulationContext(physics_dt=1 / 120, rendering_dt=1 / 60, stage_units_in_meters=1.0)
sim.initialize_physics()
sim.play()
prim = stage.GetPrimAtPath(vp)
ctrl = PhysxSchema.PhysxVehicleControllerAPI(prim)

from omni.isaac.core.prims import RigidPrimView  # noqa: E402

body = RigidPrimView(vp)
body.initialize()


def speed():
    v = body.get_velocities()[0][:3]
    return float(v[0]), float(v[1]), float(v[2])


t = 0.
dt = 1 / 120
log = []
ctrl.GetAcceleratorAttr().Set(1.)
phase = 'accel'
t_brake = None
prev = 0.
peak = 0.
while t < 30:
    sim.step(render=False)
    t += dt
    vx, vy, vz = speed()
    a = (vx - prev) / dt
    prev = vx
    if phase == 'accel' and vx > 50 / 3.6:
        phase = 'brake'
        t_brake = t
        ctrl.GetAcceleratorAttr().Set(0.)
        ctrl.GetBrake0Attr().Set(1.)
    if phase == 'brake':
        peak = max(peak, -a / 9.81)
        if vx < 0.05:
            print('STOPPED after', round(t - t_brake, 2), 's, peak decel', round(peak, 3), 'g', flush=True)
            break
    if int(t * 120) % 120 == 0:
        print(f't={t:5.2f} phase={phase} v={vx * 3.6:6.2f} km/h a={a / 9.81:+.3f} g', flush=True)
print('SMOKE_VEHICLE_DONE', flush=True)
app.close()
