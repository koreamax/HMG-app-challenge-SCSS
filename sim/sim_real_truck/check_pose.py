"""렌더에서 차체가 기울어 보이는지 숫자로 확인: 정차 후 차체 롤 · 피치 · 높이, 바퀴 하중"""
import math
import sys

from pathlib import Path

from isaacsim import SimulationApp

KIT = Path(sys.executable).parent / 'Lib/site-packages/isaacsim/apps/isaac_twin_light.kit'
app = SimulationApp({'headless': True}, experience=str(KIT))
import omni.kit.app  # noqa: E402

omni.kit.app.get_app().get_extension_manager().set_extension_enabled_immediate('omni.physx.vehicle', True)
from pv5sim import DT, Case, TruckSim  # noqa: E402
from spec import CARGO  # noqa: E402


def rp(R):
    pitch = math.degrees(math.asin(-R[2, 0]))
    roll = math.degrees(math.atan2(R[2, 1], R[2, 2]))
    return roll, pitch


box = CARGO['box']
belts = int(sys.argv[1]) if len(sys.argv) > 1 else 4
case = Case('box', 300., box['size'], box['mu'], belts, 1250., 0.35)
sim = TruckSim(case)
sim.settle(1.0)
P, R, CP, CR = sim.poses()
print('SETTLED z %.3f roll %.2f pitch %.2f' % (P[2], *rp(R)), flush=True)
sim.launch(50 / 3.6)
for _ in range(int(1.0 / DT)):
    sim.step()
P, R, CP, CR = sim.poses()
print('CRUISE z %.3f roll %.2f pitch %.2f' % (P[2], *rp(R)), flush=True)
b = 0.75 / 2.1
t = 0.
stopped = None
mx = 0.
while sim.t < 60:
    fwd, a = sim.step(brake=b * min(1., t / 0.25))
    t += DT
    P, R, CP, CR = sim.poses()
    mx = max(mx, abs(rp(R)[1]))
    if fwd < 0.05 and stopped is None:
        stopped = sim.t
        print('STOP z %.3f roll %.2f pitch %.2f' % (P[2], *rp(R)), flush=True)
    if stopped is not None and sim.t - stopped > 3.0:
        break
P, R, CP, CR = sim.poses()
print('AFTER3S z %.3f roll %.2f pitch %.2f maxpitch %.2f' % (P[2], *rp(R), mx), flush=True)
for _ in range(int(3.0 / DT)):
    sim.step(brake=0.0)
P, R, CP, CR = sim.poses()
print('RELEASED z %.3f roll %.2f pitch %.2f' % (P[2], *rp(R)), flush=True)
print('POSE_DONE', flush=True)
app.close()
