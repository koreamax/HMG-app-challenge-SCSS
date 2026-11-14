"""EN 12195-1:2010 top-over (frictional) lashing: the belt tension a load needs, per kg, from its friction, belt angle and size.

Every requirement is linear in the mass, so the result is one number (N/kg) for the sum of the belts' tension; the team code
(analysis/tension.py) already multiplies it by the mass each belt carries. n FT is replaced by the measured tension sum.
    sliding (Equ 10)              sum T >= m g (c - mu cz) fs / (2 mu sin a)
    tipping lengthways (Equ 15)   sum T >= m g (cx d - cz b) fs / (L sin a)
    tipping sideways (Equ 16)     sum T >= m g (cy d - cz b) fs / (B sin a)      one row, N = 1
d = H / 2 and b = L / 2 or B / 2: the standard's case of a symmetrical mass centre. c, cz: Table 2 (road). fs: 1.25 forward, else 1.1.
A negative result means no risk in that direction (the formula sheet's "m < 0"), and the standard still wants the load kept from
being displaced by vibration (4.1) without giving a number. The number is the IRU guideline's: one top-over lashing with
STF 400 daN per 4 t, which is 1 N/kg.

Sources: EN 12195-1:2010 preview (SIST EN 12195-1:2011) for Table 2, 4.1 and fs; University of Turku Cargo Calculator formula sheet
for the equations; IRU Guidelines (2014) for the 1 N/kg recommendation. The full paid text of 5.3 - 5.4 was not read; the examples
in test_en12195.py reproduce the IRU's worked results. EN 12195-1 itself excludes vehicles up to 3.5 t, so for the real cart this
borrows the method.
"""
import math

G = 9.80665             # m/s^2 (same as team/acquisition/config.py)
CZ = 1.0                # vertically down, road
FORWARD = (.8, 1.25)    # (c, fs)  road, Table 2
REARWARD = (.5, 1.1)
SIDEWAYS = (.5, 1.1)
UNSTABLE_CY = .6        # sideways tipping of a load that is not stable (5.1): cy 0.6 with FT = 0.5 LC, i.e. a belt rating check
MIN_N_PER_KG = 1.0      # IRU: STF 400 daN per 4 t

# Sandbox cargo and belts: belt_rope.CARGO_HALF, and the free leg from the cargo's top edge to its anchor (test_en12195.py checks them)
DEFAULTS = {'mu': .6, 'angle_deg': 86.6, 'height_m': .56, 'width_m': .38, 'length_m': .58, 'blocked_forward': False}


def sliding(c, fs, mu, angle_deg):
    """N/kg (belt tension sum) that holds a load against sliding at c (G). 0 when friction alone holds it."""
    return max(0., G * (c - mu * CZ) * fs / (2 * mu * math.sin(math.radians(angle_deg))))


def tipping(c, fs, height_m, base_m, angle_deg):
    """N/kg (belt tension sum) that holds a symmetrical load of this height on this base against tipping. 0 when it is stable."""
    return max(0., G * (c * height_m / 2 - CZ * base_m / 2) * fs / (base_m * math.sin(math.radians(angle_deg))))


def floor(mu, angle_deg, height_m, width_m, length_m, blocked_forward=False):
    """-> per_kg (largest requirement, at least MIN_N_PER_KG), basis (the requirement that set it, Korean, panel text),
    need {direction: N/kg}, unstable_side_per_kg (sideways tipping at UNSTABLE_CY, to compare with 0.5 LC)."""
    need = {'전방 미끄럼': 0. if blocked_forward else sliding(*FORWARD, mu, angle_deg),
            '후방 미끄럼': sliding(*REARWARD, mu, angle_deg),
            '측방 미끄럼': sliding(*SIDEWAYS, mu, angle_deg),
            '전방 전도': tipping(*FORWARD, height_m, length_m, angle_deg),
            '후방 전도': tipping(*REARWARD, height_m, length_m, angle_deg),
            '측방 전도': tipping(*SIDEWAYS, height_m, width_m, angle_deg)}
    basis = max(need, key=need.get)
    per_kg = need[basis]
    if per_kg < MIN_N_PER_KG:
        basis, per_kg = '최소 1 N/kg', MIN_N_PER_KG
    return {'per_kg': per_kg, 'basis': basis, 'need': need,
            'unstable_side_per_kg': tipping(UNSTABLE_CY, SIDEWAYS[1], height_m, width_m, angle_deg)}
