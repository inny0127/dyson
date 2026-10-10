"""Pod: parametric envelope per MW of module power (scope: technology-agnostic 'dense memory + logic stack').
Baseline 1 MW. Wings (same c-Si film without chiplets), knife-edge double-sided radiator blades, 4 SO2 pumped
two-phase loops, conversion chain, shielding geometry, lasers, O2 electric propulsion, mass per W (best-credible
pod of research3/skeptic: 3.9 g/W), beta. Radiator layout checked with a Monte-Carlo view factor to the wings."""
import math, numpy as np
from common import *

OUT = {}
P_MOD = 1.0e6                         # W delivered to the module (memory + logic + on-module switching)
R_POD = 0.88                          # AU, training/HBM-class pods (mass optimum 0.86-0.90); service pods: 0.92 (film shell)
S_P = flux(R_POD)
w = wing_state(S_P, F_REF)
# conversion chain: 48 V panel strings -> panel DC-DC to 800 V bus -> module 800->48 V -> 48 V -> ~0.7 V point of load
CHAIN = dict(panel_dcdc=0.985, bus_cable=0.99, ibc_800_48=0.98, pol=0.92)
eta_chain = np.prod(list(CHAIN.values()))
P_aux = 0.012 * P_MOD + 24 * 80 + 4 * 300 + 2000     # pumps ~1.2 %, 24 lasers, 4 loop controllers, avionics/EP idle
P_wing = (P_MOD + P_aux) / eta_chain
A_wing = P_wing / w['q_e']
heat_module = P_MOD + P_MOD * (1 / (CHAIN['ibc_800_48'] * CHAIN['pol']) - 1) + 4 * 300
T_RAD = 353.0
q_rad = 2 * 0.9 * SIGMA * T_RAD ** 4 * 0.96 * 0.75   # best-credible pod (skeptic checks.py, mid): 2 faces, eps 0.9, view 0.96, fin 0.75
A_rad = heat_module / q_rad
print('wing at %.2f AU: T %.1f K eta %.4f q_e %.1f W/m2; chain %.3f; P_wing %.3f MW -> %.0f m2; heat %.3f MW at q %.0f W/m2 -> radiator %.0f m2' % (
    R_POD, w['T'], w['eta'], w['q_e'], eta_chain, P_wing / 1e6, A_wing, heat_module / 1e6, q_rad, A_rad))

# ---------------- geometry (pod frame: +Z sunward; wings in XY spanning +-X; radiator blades in the YZ plane on +-Y)
N_BLADE = 4
BLADE_DEPTH = 6.0                                     # along Z (sun line), centred on the wing plane z = 0
BLADE_LEN = A_rad / N_BLADE / BLADE_DEPTH             # along Y
WING_CHORD = 32.5
WING_SPAN = A_wing / 2 / WING_CHORD
X_ROOT = 18.0                                         # wing root standoff (yoke truss) from the pod axis
Y_BLADE0 = 20.0                                       # first blade starts beyond the wing chord edge (16.25 m)
GAP = 1.0
blades = []
for sgn in (1, -1):
    for k in range(N_BLADE // 2):
        y0 = Y_BLADE0 + k * (BLADE_LEN + GAP)
        blades.append((sgn, y0, y0 + BLADE_LEN))

def view_factor_to_wings(nray=400000, seed=1):
    """Fraction of the radiated power of all blade faces that hits a wing (either face). Cosine-weighted rays."""
    rng = np.random.default_rng(seed)
    hits = 0; tot = 0
    for sgn, y0, y1 in blades:
        for face in (1, -1):        # normal +X / -X
            n = nray // (2 * len(blades))
            y = sgn * rng.uniform(y0, y1, n); z = rng.uniform(-BLADE_DEPTH / 2, BLADE_DEPTH / 2, n)
            u1, u2 = rng.random(n), rng.random(n)
            r = np.sqrt(u1); phi = 2 * np.pi * u2
            dx = face * np.sqrt(1 - u1); dy = r * np.cos(phi); dz = r * np.sin(phi)
            ok = np.abs(dz) > 1e-9
            t = np.where(ok, -z / np.where(ok, dz, 1), -1)          # intersection with the wing plane z = 0
            xi = 0 + t * dx; yi = y + t * dy
            hit = (t > 0) & (np.abs(xi) >= X_ROOT) & (np.abs(xi) <= X_ROOT + WING_SPAN) & (np.abs(yi) <= WING_CHORD / 2)
            hits += int(hit.sum()); tot += n
    return hits / tot

F_bw = view_factor_to_wings()
# wing back face at its temperature radiates eps*sigma*T^4; absorbed by the blade fraction ~ eps_rad * F (reciprocity)
q_back = 0.9 * F_bw * 0.85 * SIGMA * w['T'] ** 4
print('blades: %d x %.1f m (Y) x %.1f m (Z); wing %.1f m span x %.1f m chord each, root at %.0f m; view factor blade->wings %.4f (%.1f W/m2 back-load, %.2f %% of emission)' % (
    N_BLADE, BLADE_LEN, BLADE_DEPTH, WING_SPAN, WING_CHORD, X_ROOT, F_bw, q_back, 100 * q_back / (0.9 * SIGMA * T_RAD ** 4)))

# ---------------- SO2 pumped two-phase loops (fluids.json: SO2 at 356 K: P 1.92 MPa, rho_l 1182, hfg 285 kJ/kg)
Q_loop = heat_module / 4
hfg = 285.2e3; rho_l = 1182.0; P_sat = 1.92e6
rho_v = P_sat * 0.064066 / (0.85 * 8.314 * 356.0)
x_out = 0.8                                           # evaporator exit quality
mdot = Q_loop / (hfg * x_out)
v_v, v_l = 15.0, 1.5
D_v = math.sqrt(4 * mdot / (rho_v * v_v * math.pi))
D_l = math.sqrt(4 * mdot / (rho_l * v_l * math.pi))
L_trunk = Y_BLADE0 + 2 * BLADE_LEN                    # module to far end, one way
dp = 0.15e6                                           # loop pressure drop budget
P_pump = mdot / rho_l * dp / 0.35
cond_tubes = BLADE_LEN / 0.10                          # heat pipes per face-pair at 0.1 m pitch, along Z
inv_l = rho_l * (math.pi / 4 * D_l ** 2 * L_trunk * 1.1 + 0.3 * math.pi / 4 * (0.012) ** 2 * BLADE_DEPTH * cond_tubes)
acc_vol = 0.35 * inv_l / rho_l
loops = dict(count=4, fluid='SO2 (Mercury-native S + O; no H)', Q_per_loop_W=Q_loop, T_sat_K=356.0, P_sat_MPa=P_sat / 1e6,
             mdot_kg_s=mdot, vapour_line_ID_mm=D_v * 1e3, liquid_line_ID_mm=D_l * 1e3, trunk_one_way_m=L_trunk,
             pump_power_W=P_pump, pump='canned-motor centrifugal pump, Fe-Ni, A/B redundant per loop',
             liquid_inventory_kg=inv_l, accumulator_volume_m3=acc_vol, accumulator='Fe-Ni bellows accumulator, 1 per loop, in the module shield shell',
             evaporators='two-phase cold plates (Si microchannel) on the memory+logic stack; Tj 105-120 C; stack drop ~25 K',
             condensers='header ("spine") along each blade at z = 0 with SO2 heat pipes every 0.10 m running +-3 m in Z (fishbone)',
             heat_pipes_per_blade=2 * cond_tubes, isolation='each loop isolatable; a trunk hit loses 25 %, a heat-pipe hit 0.3 m2')
OUT['loops'] = loops
print('loop: mdot %.2f kg/s, vapour %.0f mm, liquid %.0f mm, trunk %.0f m, pump %.0f W, inventory %.0f kg, accumulator %.3f m3' % (
    mdot, D_v * 1e3, D_l * 1e3, L_trunk, P_pump, inv_l, acc_vol))

# ---------------- module: dense memory + logic stack, parametric
VOL_PER_MW = dict(low=0.5, mid=1.5, high=4.0)         # m3 per MW for the stack (0.25-2 MW/m3; NVL72 rack ~0.1 MW/m3 incl. air paths)
M_MOD_PER_MW = dict(low=400.0, mid=800.0, high=1500.0)  # kg per MW (research3 skeptic best-credible pod: 0.4/0.8/1.5 kg/kW)
core_V = VOL_PER_MW['mid'] * P_MOD / 1e6
core_a = core_V ** (1 / 3)
shell_t = 0.35                                         # m, outer equipment shell (conversion, NICs/switches, accumulators, avionics)
outer_a = core_a + 2 * shell_t
A_core = 6 * core_a ** 2
shell_equipment_kg = 200.0 + 4 * acc_vol * 1182 * 0.5 + 4 * 25.0 + 120.0      # conversion (0.2 g/W), half-full accumulators, pumps, NICs/switch
areal_shell = shell_equipment_kg / (6 * (core_a + shell_t) ** 2)              # kg/m2 spread over the mid-shell surface
need = 50.0                                                                   # 5 g/cm2
dedicated = max(0.0, need - areal_shell)
shield_kg = dedicated * 6 * outer_a ** 2
module = dict(description='dense memory + logic stack (technology-agnostic): memory-heavy core with logic, two-phase cold plates, '
                          'power-delivery planes; outer shell of converters, switches/NICs, loop accumulators and pumps; dedicated '
                          'Mg-alloy + MgO-SiO2 cast-ceramic shield panels bring every line of sight to the memory to >= 5 g/cm2',
              volume_m3_per_MW=VOL_PER_MW, mass_kg_per_MW=M_MOD_PER_MW, core_cube_side_m=core_a, outer_box_side_m=outer_a,
              shell_equipment_kg=shell_equipment_kg, shell_areal_kg_m2=areal_shell, dedicated_shield_kg_m2=dedicated, dedicated_shield_kg=shield_kg,
              shield_scaling='dedicated shield mass ~ 50 kg/m2 x 6 (V/P)^(2/3) P^(2/3): per W it falls as P^-1/3, favouring larger pods',
              shield_material='Mg alloy + MgO-SiO2 ceramic (low Z, H-free, Mercury-native). Not sulfur (sublimes ~kg/m2/day at 350 K in vacuum); '
                              'not Fe as bulk shield (more secondaries per g/cm2, no lower Z/A benefit).',
              temperatures_K=dict(stack_junction=383.0, cold_plate=358.0, shell_exterior=300.0))
# shield mass per W vs stack volume density and pod power (self-shielding credit from the same shell equipment per W)
shield_tab = []
for vpm in (0.5, 1.0, 1.5, 2.5, 4.0, 10.0):
    for Pm in (0.3e6, 1e6, 3e6):
        a = (vpm * Pm / 1e6) ** (1 / 3)
        sh_eq = shell_equipment_kg * Pm / 1e6
        ar = sh_eq / (6 * (a + shell_t) ** 2)
        ded = max(0.0, need - ar)
        shield_tab.append(dict(m3_per_MW=vpm, P_MW=Pm / 1e6, core_side_m=a, shell_areal_kg_m2=ar, shield_g_per_W=ded * 6 * (a + 2 * shell_t) ** 2 / Pm * 1e3))
module['shield_g_per_W_table'] = shield_tab
for r in shield_tab:
    if r['P_MW'] == 1.0:
        print('shield: %.1f m3/MW -> core %.2f m, shell %.1f kg/m2, dedicated %.3f g/W' % (r['m3_per_MW'], r['core_side_m'], r['shell_areal_kg_m2'], r['shield_g_per_W']))
OUT['module'] = module
print('module core %.2f m cube (%.1f m3), outer %.2f m; shell equipment %.0f kg -> %.1f kg/m2; dedicated shield %.1f kg/m2 = %.0f kg' % (
    core_a, core_V, outer_a, shell_equipment_kg, areal_shell, dedicated, shield_kg))

# sulfur sublimation check (Hertz-Knudsen), vapour pressure of S8 at 350 K ~ 0.03-0.3 Pa (Antoine-type extrapolation)
for Pv in (0.03, 0.3):
    rate = Pv * math.sqrt(0.2565 / (2 * math.pi * 8.314 * 350))
    print('sulfur sublimation at %.2f Pa: %.2e kg/m2/s = %.1f kg/m2/day' % (Pv, rate, rate * DAY))
OUT['sulfur_sublimation_kg_m2_day'] = [Pv * math.sqrt(0.2565 / (2 * math.pi * 8.314 * 350)) * DAY for Pv in (0.03, 0.3)]

# ---------------- mass breakdown (per W, best-credible mid) and bottom-up cross-check
gW = dict(wing=0.617, radiator=1.139, loops=0.6, module=0.8, conversion=0.2, shielding=0.2, misc=0.3)
bottom = dict(wing=A_wing * 0.149 * 1.05 / 0.95 / P_MOD * 1e3, radiator=A_rad * 1.3 / P_MOD * 1e3, module=0.8,
              shielding=shield_kg / P_MOD * 1e3)
lasers = dict(DWDM_pod_pod=dict(count=8, aperture_m=0.10, rate='~9.6 Tbps each at <= 400 km (Suncatcher-class), near-field at 0.5-2 km', mass_kg=6.0, power_W=80),
              handover_to_sails=dict(count=16, aperture_m=0.10, rate='0.1-0.4 Tbps at <= 3000 km', mass_kg=5.0, power_W=70),
              placement='on a 4 m terminal mast below the module (anti-sun side, z = -4 to -6 m): clear horizon in the wing plane under the wings and blades')
laser_kg = 8 * 6.0 + 16 * 5.0
# propulsion: O2-fed RF/ECR (electrodeless) ion thrusters
dv_yr = None
beta_pod = beta_of(1.0 * 0.9 + 0.1, (sum(gW.values()) * 1e-3 * P_MOD) / A_wing)
g_sun = GM_SUN / (R_POD * AU) ** 2
dv_beta = 0.05 * beta_pod * g_sun * YEAR                 # 5 % beta dispersion between pods
dv_yr = dv_beta + 5.0                                     # + reconfiguration / collision avoidance
life = 15.0
isp = 3000.0
m_pod = sum(gW.values()) * 1e-3 * P_MOD
prop = m_pod * (1 - math.exp(-dv_yr * life / (isp * G0)))
tank = prop * 1.8                                          # 20 MPa gaseous O2 in Fe-Ni-Si tanks: ~1.8 kg tank per kg O2
propulsion = dict(type='4 electrodeless RF/ECR ion thrusters on O2 (Mercury-native; no Xe, no H; non-condensable plume)', isp_s=isp,
                  thrust_each_mN=40.0, power_each_kW=1.5, dv_per_yr_m_s=dv_yr, dv_beta_dispersion_m_s_yr=dv_beta, life_yr=life,
                  propellant_kg=prop, tank_kg=tank, storage='gaseous O2 at 20 MPa', alternatives='SO2 (shares coolant logistics; S deposition risk); '
                  'Mg/Na metal Hall thrusters rejected: condensable plume coats radiators and PV',
                  placement='on 2 short canted booms below the module, plumes 20 deg off the wing plane, away from blades and wings',
                  needed='yes: beta dispersion between pods (~5 %%) gives ~%.1f m/s/yr of differential drift' % dv_beta)
OUT['propulsion'] = propulsion
print('pod beta %.2e; dv beta %.1f m/s/yr; propellant %.0f kg + tank %.0f kg over %d yr' % (beta_pod, dv_beta, prop, tank, life))
misc_bottom = (laser_kg + prop + tank + 4 * 15 + 40 + 60) / P_MOD * 1e3     # lasers, prop+tanks, thrusters, avionics, booms/mast
bottom.update(misc=misc_bottom)
OUT['mass_breakdown_g_per_W'] = dict(best_credible_mid=gW, total=sum(gW.values()), bottom_up_checks=bottom,
                                     range_total=[2.2, 6.6], note='per W of module power; best-credible pod (research3 skeptic checks.py)')
print('mass g/W:', {k: round(v, 3) for k, v in gW.items()}, 'total %.2f; bottom-up %s' % (sum(gW.values()), {k: round(v, 3) for k, v in bottom.items()}))

dims = dict(span_X_m=2 * (X_ROOT + WING_SPAN), extent_Y_m=2 * (Y_BLADE0 + 2 * BLADE_LEN + GAP), depth_Z_m=BLADE_DEPTH + 6.0,
            projected_footprint_note='cross: wings along X, blades along Y')
OUT.update(power=dict(module_W=P_MOD, wing_W=P_wing, aux_W=P_aux, conversion_chain=CHAIN, eta_chain=eta_chain, bus='800 V DC (glass-insulated Al), 48 V panel strings (< 80 V arc threshold)',
                      r_AU=R_POD, S_W_m2=S_P, justification='g/W is flat over 0.3-1 MW (research3 size scan 7.65 -> 7.63); shield mass per W falls as P^-1/3; '
                      '4 loops cap a trunk hit at 250 kW; a 1-12 MW training island = 1-12 pods; above ~1 MW bus mass and loop length grow (3 MW: +8 %)'),
           wings=dict(count=2, area_total_m2=A_wing, span_each_m=WING_SPAN, chord_m=WING_CHORD, root_x_m=X_ROOT, T_K=w['T'], eta=w['eta'], q_e_W_m2=w['q_e'],
                      panels_per_wing=int(round(WING_SPAN / 6.5)), panel_m=[WING_SPAN / round(WING_SPAN / 6.5), WING_CHORD],
                      film='same c-Si film as the sail without chiplets/Mg spreader: glass 20 um / Si 30 um / rear contacts / enamel 15 um, ~0.15 kg/m2 incl. frame',
                      layout='2 wings in the XY plane (facing +Z), on yoke trusses from x = +-%.0f m; hinged panels' % X_ROOT),
           radiators=dict(count=N_BLADE, area_planform_m2=A_rad, blade_len_Y_m=BLADE_LEN, blade_depth_Z_m=BLADE_DEPTH, T_K=T_RAD, q_W_m2_planform=q_rad,
                          layout='YZ plane (faces +-X), knife-edge to the Sun, on +-Y arms, 2 blades in line per arm from y = %.0f m, coplanar so they never see each other' % Y_BLADE0,
                          view_factor_to_wings=F_bw, areal_kg_m2=1.3,
                          construction='Mg-alloy facesheets 0.15 mm on SO2 heat pipes (Mg tubes 12 mm, 0.10 m pitch, Whipple-bumpered) along Z from a central condenser spine; '
                                       'white Mg/Ca-silicate coating (alpha 0.15-0.2, eps 0.90)'),
           lasers=lasers, dims=dims, beta=beta_pod)
print('pod dims: %.0f m (X) x %.0f m (Y) x %.0f m (Z)' % (dims['span_X_m'], dims['extent_Y_m'], dims['depth_Z_m']))
dump(OUT, 'pod.json')
