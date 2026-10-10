"""Compute sail baseline: exact geometry, segmentation, chiplet grid, hardware, counts and mass breakdown.
Frame: +Z = toward the Sun (light travels -Z). Film in the XY plane, front (PV) face +Z. The sail is a square
rotated 45 deg ('diamond'): corners on the +-X and +-Y axes, booms along the two diagonals (X and Y axes) behind
the film. The chiplet grid, fold/hinge lines and patches are aligned with X/Y (the boom axes)."""
import math, numpy as np
from common import *

S_ = load('sail_structure.json')
OPT = load('optics.json')

# ------------------------------------------------ grid and geometry
PITCH = 0.0254                                  # m, chiplet / tile pitch (1 inch)
P_SITE = FILM['q_e'] * PITCH ** 2               # W per tile at MPP (PV output)
HINGE_EVERY = 64                                # tiles per fold panel
PANEL_W = HINGE_EVERY * PITCH                   # 1.6256 m fold pitch
HINGE_W = PITCH                                 # one tile row given up to each hinge strip (25.4 mm)
SAG = 0.04                                      # catenary sag / edge span
N_TENS = 0.1                                    # N/m design membrane tension (constant-force corner tensioners)
SITES_TARGET = 1.03e8                           # 1e8-chiplet training replica + 3 % spares
frame_rows = S_['frame_baseline']['sag_trade']
row = [r for r in frame_rows if abs(r['sag_ratio'] - SAG) < 1e-9][0]
SIDE = row['side_m']                            # square side (corner to corner along an edge), from sail_structure.py
LD = SIDE / math.sqrt(2)                        # centre-to-corner (half diagonal)
SAG_M = SAG * SIDE

def inside(x, y, margin=0.0):
    """Point inside the scalloped diamond (parabolic catenary approx), with optional inset margin."""
    ax, ay = abs(x), abs(y)
    # coordinate along/normal to the edge from (LD,0) to (0,LD)
    u = (ax - ay) / math.sqrt(2)                # along-edge coordinate, 0 at mid-edge, +-SIDE/2 at corners
    n = (LD - ax - ay) / math.sqrt(2)           # inward distance from the straight chord
    sag = SAG_M * (1 - (2 * u / SIDE) ** 2)
    return n >= sag + margin

# film area by Monte-Carlo-free exact integration: diamond area minus 4 parabolic segments (2/3 * sag * span)
A_DIAMOND = SIDE ** 2
A_FILM = A_DIAMOND - 4 * (2.0 / 3.0) * SAG_M * SIDE

# count tile sites: tile centres on the grid, inside the film, not on a hinge row, not on a boom-shade? (booms are
# behind the film and do not shade it), not in hub/corner/service zones
nmax = int(LD / PITCH) + 2
ix = np.arange(-nmax, nmax + 1)
X = (ix + 0.5) * PITCH
EDGE_BAND = 0.05                                # 50 mm glass-cloth edge tape: no tiles
PATCH = 1280 * PITCH                            # 32.512 m frontier inference patch
pc = (np.arange(-8, 8) + 0.5) * PATCH
terms = []
for px in pc:
    for py in pc:
        j = round(py / PITCH - 0.5)
        jpanel = (j // HINGE_EVERY) * HINGE_EVERY + HINGE_EVERY // 2
        py2 = (jpanel + 0.5) * PITCH
        if inside(px, py2, margin=8.0):
            terms.append((px, py2))
svc_centres = list(terms) + [(LD - 4, 0), (-LD + 4, 0), (0, LD - 4), (0, -LD + 4)]
corners = [(LD, 0), (-LD, 0), (0, LD), (0, -LD)]
N_SITES = 0; N_TILE_POS = 0
excl = dict(hinge_rows=0, corner_doublers=0, service_patches=0, hub=0)
CH = 400
for c0 in range(0, len(X), CH):
    yy, xx = np.meshgrid(X[c0:c0 + CH], X, indexing='ij')
    ax_, ay_ = np.abs(xx), np.abs(yy)
    u = (ax_ - ay_) / math.sqrt(2)
    nrm = (LD - ax_ - ay_) / math.sqrt(2)
    sagf = SAG_M * (1 - (2 * u / SIDE) ** 2)
    in_film = nrm >= sagf + EDGE_BAND
    jrow = np.round(yy / PITCH - 0.5).astype(int)
    hinge = (np.mod(jrow, HINGE_EVERY) == HINGE_EVERY - 1)
    corner_zone = np.zeros_like(in_film)
    for cx, cy in corners:
        corner_zone |= np.hypot(xx - cx, yy - cy) < 2.5
    service = np.zeros_like(in_film)
    for tx, ty in svc_centres:
        if abs(ty - yy[0, 0]) < 0.6 + CH * PITCH + 1:
            service |= (np.abs(xx - tx) <= 0.5) & (np.abs(yy - ty) <= 0.5)
    hub_zone = np.hypot(xx, yy) < 0.6
    sites = in_film & ~hinge & ~corner_zone & ~service & ~hub_zone
    N_SITES += int(sites.sum()); N_TILE_POS += int(in_film.sum())
    excl['hinge_rows'] += int((in_film & hinge).sum())
    excl['corner_doublers'] += int((in_film & corner_zone & ~hinge).sum())
    excl['service_patches'] += int((in_film & service & ~hinge & ~corner_zone).sum())
    excl['hub'] += int((in_film & hub_zone & ~hinge).sum())
area_sites = N_SITES * PITCH ** 2
P_PV = N_SITES * P_SITE
P_CORE = P_PV * ETA_CONV
sun_power = A_FILM * S_FILM
OUT = {}
geom = dict(frame='+Z toward Sun; film in XY plane (front +Z); diamond: corners at (+-LD,0,0),(0,+-LD,0); booms along X and Y behind film',
            side_m=SIDE, half_diagonal_LD_m=LD, corner_to_corner_m=2 * LD, catenary_sag_m=SAG_M, sag_ratio=SAG,
            film_area_m2=A_FILM, diamond_area_m2=A_DIAMOND, pitch_m=PITCH, P_site_W=P_SITE, panel_width_m=PANEL_W,
            n_hinge_lines=int(2 * LD / PANEL_W), tile_positions_in_film=N_TILE_POS, chiplet_sites=N_SITES,
            active_fraction_of_film=area_sites / A_FILM, P_PV_MW=P_PV / 1e6, P_core_MW=P_CORE / 1e6, sunlight_intercepted_MW=sun_power / 1e6,
            n_patch_terminals=len(terms), patch_side_m=PATCH,
            excluded=excl)
OUT['geometry'] = geom
print('side %.1f m, LD %.1f m, film %.0f m2, sites %d (%.1f %% of film), P_PV %.2f MW, core %.2f MW, sun %.1f MW, terminals %d' % (
    SIDE, LD, A_FILM, N_SITES, 100 * area_sites / A_FILM, P_PV / 1e6, P_CORE / 1e6, sun_power / 1e6, len(terms)))

# ------------------------------------------------ booms (from sail_structure boom design at the 4 % sag row)
b = row['boom']
L_BOOM = LD + 2.0
boom = dict(count=4, type='triangular truss, 3 thin-wall Mg-alloy (AZ-type) tube longerons, Mg-alloy battens + Fe-Ni wire diagonals',
            length_m=L_BOOM, circumradius_m=b['rb'], triangle_side_m=b['side'], longeron_OD_mm=b['d_longeron_mm'], longeron_wall_mm=b['wall_mm'],
            bay_length_m=b['side'], n_bays=int(L_BOOM / b['side']), kg_per_m=b['kg_per_m'], mass_each_kg=b['kg_per_m'] * L_BOOM,
            axial_load_N=row['F_corner_N'], safety_factor=3.0,
            position='root at hub; along +X,-X,+Y,-Y; flat face (2 longerons) 0.30 m behind the film, apex longeron at z = -0.30 - 0.866*side',
            temperature_K=S_['frame_baseline']['boom_temperature_in_film_shade_K'])
OUT['booms'] = boom

# ------------------------------------------------ hardware list
A_V = S_['frame_baseline']['vane_area_each_m2']
V_SIDE = math.sqrt(A_V)
hub_mass = 250.0
term_mass = 5.0
parts = []
def part(name, count, mass_each, **kw):
    parts.append(dict(name=name, count=count, mass_each_kg=mass_each, mass_total_kg=count * mass_each, **kw))
part('patch_handover_laser_terminal', len(terms), term_mass, aperture_m=0.10, dims_m=[0.30, 0.30, 0.75],
     note='Starlink-class, 0.1-0.4 Tbps to <=3000 km; on the BACK face on a 1x1 m stiff service plate, 0.6 m mast, 2-axis gimbal, '
          '10 cm telescope with 0.2 m sunshade; 60-80 W from a 24 V service string on its own 1 m2 of film. One per 32.5 m patch.')
part('corner_relay_laser_terminal', 4, term_mass, aperture_m=0.10, dims_m=[0.30, 0.30, 0.75],
     note='at each boom tip, sees both hemispheres past the film edge: sail-sail and relay links')
part('corner_vane', 4, A_V * 0.012 + 2 * V_SIDE * math.sqrt(2) * 0.12 + 12.0, area_m2=A_V, dims_m=[V_SIDE, V_SIDE, 0.002],
     note='reflective vane (Al-coated glass cloth, rho_s 0.85) on 2 diagonal Fe-Ni TRAC booms; 2-axis gimbal at the boom tip; '
          'centre %.1f m beyond the film corner; 0.5 %% of sail area in total' % (2.0 + V_SIDE / 2))
part('corner_tensioner', 4, 6.0, note='constant-force Fe-Ni spring reel + 2 redundant glass-fibre tethers, sets N = %.2f N/m (adjustable 0.05-0.3)' % N_TENS)
part('corner_doubler', 4, 0.4, note='2.5 m glass-cloth reinforcement triangle with Fe-Ni grommet ring')
part('hub', 1, hub_mass, dims_m=[3.4, 3.4, 1.9],
     note='octagonal prism behind the film centre: 4 boom deployers (articulated-truss canisters or beam builders), avionics, '
          '3 star trackers (anti-sun face), IMU, S-band beacon, roll cradles (empty after deployment); film tethered loosely at centre')
part('sun_sensor', 4, 0.3, note='on boom-tip fittings, looking +Z past the film edge')
part('boom', 4, boom['mass_each_kg'], dims_m=[L_BOOM, b['side'], b['side'] * math.sqrt(3) / 2])
edge_len = 4 * SIDE * (1 + 8 / 3 * SAG ** 2)
part('edge_cable_and_tape', 1, edge_len * (0.0089 + 0.0025), note='Fe-Ni 1.2 mm wire (8.9 g/m) in a 50 mm glass-cloth hem (2.5 g/m); catenary, sag %.1f m' % SAG_M)
n_hinge_m = 0.0
for k in range(-int(LD / PANEL_W) - 1, int(LD / PANEL_W) + 2):
    yh = (k * HINGE_EVERY + HINGE_EVERY - 0.5) * PITCH
    if abs(yh) < LD:
        # length of hinge line inside film approx 2*(LD-|y|) minus scallop
        n_hinge_m += max(0.0, 2 * (LD - abs(yh)) - 2 * SAG_M * 0.7)
part('hinge_strips', 1, n_hinge_m * HINGE_W * 0.060, length_total_m=n_hinge_m,
     note='25.4 mm glass-fibre cloth (60 g/m2) carrying Al mesh/power jumpers; no Si; fold lines parallel to X every %.4f m' % PANEL_W)
OUT['hardware'] = parts

# ------------------------------------------------ film stack and mass breakdown
ST = 'A2_arch+thick_enamel (glass20/Si30/Mg13/enamel15)'
stack_items = {   # kg/m2
    'cover glass 20 um SiO2-rich Mg-aluminosilicate + porous-silica AR': 20e-6 * 2500 + 0.11e-6 * 1100,
    'TiO2 front ARC 55-68 nm': 0.065e-6 * 4200,
    'c-Si absorber 30 um (IBC, textured)': 30e-6 * 2330,
    'rear Al contacts / tile wiring (grid)': 0.004,
    'rear dielectric 0.5 um SiO2': 0.5e-6 * 2200,
    'Mg spreader 13 um (patterned per tile)': 13e-6 * 1740,
    'back emitter enamel 15 um (Fe/Mg/Ca silicate, microtextured)': 15e-6 * 2700,
    'chiplets (dies, 6 mm2 x 50 um x1.5)': 6e-6 * 50e-6 * 2330 * 1.5 / PITCH ** 2,
    'chiplet mesh wiring': 0.00036,
}
sig_film = sum(stack_items.values())
m_film = sig_film * A_FILM
hw = {p['name']: p['mass_total_kg'] for p in parts}
structure_names = ['boom', 'hub', 'corner_vane', 'corner_tensioner', 'corner_doubler', 'sun_sensor', 'edge_cable_and_tape', 'hinge_strips']
m_struct = sum(hw[n] for n in structure_names)
m_term = hw['patch_handover_laser_terminal'] + hw['corner_relay_laser_terminal']
M_TOTAL = m_film + m_struct + m_term
mass = dict(film_stack_kg_m2=stack_items, film_sigma_kg_m2=sig_film, film_kg=m_film,
            structure_kg={n: hw[n] for n in structure_names}, structure_total_kg=m_struct, structure_kg_m2=m_struct / A_FILM,
            terminals_kg=m_term, terminals_kg_m2=m_term / A_FILM, total_kg=M_TOTAL, total_kg_m2=M_TOTAL / A_FILM,
            g_per_W_core=M_TOTAL / P_CORE * 1e3, g_per_W_PV=M_TOTAL / P_PV * 1e3,
            g_per_W_core_with_10pct_overbuild=M_TOTAL * 1.10 / P_CORE * 1e3,
            architecture_reference=dict(film_sigma_kg_m2=0.1716, g_per_W=0.89, note='architecture: 5 um back enamel (eps_b 0.90 assumed). '
                                        'optics.py finds 5 um silicate on Mg gives eps_b ~0.61 (fused-silica floor), so the baseline carries 15 um '
                                        'microtextured enamel (+0.027 kg/m2). If a 5 um enamel reaches eps 0.9, subtract 27 g/m2.'))
OUT['mass'] = mass
print('film sigma %.4f kg/m2 -> %.1f t; structure %.0f kg (%.4f kg/m2); terminals %.0f kg; total %.2f t = %.4f kg/m2; %.3f g/W core (%.3f with 10 %% overbuild)' % (
    sig_film, m_film / 1e3, m_struct, m_struct / A_FILM, m_term, M_TOTAL / 1e3, M_TOTAL / A_FILM, M_TOTAL / P_CORE * 1e3, M_TOTAL * 1.1 / P_CORE * 1e3))
for k, v in stack_items.items():
    print('   %-70s %.5f kg/m2' % (k, v))
for n in structure_names:
    print('   %-30s %.1f kg' % (n, hw[n]))

# ------------------------------------------------ cell/tile electrical layout
Vmp_half = 0.50   # V per half-cell at 348 K (Voc ~0.585 V at 348 K for Voc(298) 0.68 V, -1.9 mV/K; FF ~0.80)
Voc_298 = 0.68
Voc_348 = Voc_298 - 1.9e-3 * (T_SHEET - 298.15)
J_mp = P_SITE / (2 * Vmp_half) / (PITCH * PITCH / 2) / 10      # mA/cm2 per half-cell
electrical = dict(tile_m=[PITCH, PITCH], half_cells_per_tile=2, half_cell_m=[PITCH, PITCH / 2], series='2 half-cells in series per tile',
                  Vmp_tile_V=2 * Vmp_half, Voc_tile_V=2 * Voc_348, I_mp_A=P_SITE / (2 * Vmp_half), J_mp_mA_cm2=J_mp,
                  conversion='on-die 2:1 switched-capacitor converter + MPPT -> ~0.5 V core, eta 0.93 (research3 mid)',
                  max_voltage_on_production_film_V=2 * Voc_348,
                  service_strings='1 m2 patches wired 48 half-cells in series (~24 V, Voc ~28 V) for terminals and vane gimbals; '
                                  'below the 80 V sustained-arc threshold (JAXA / NASA Glenn)',
                  contacts='interdigitated back contacts (IBC): no metal on the front face',
                  isolation='50 um laser scribes between half-cells and tiles, glass-filled')
OUT['electrical'] = electrical
print('tile: Vmp %.2f V, Voc %.2f V, Imp %.3f A, Jmp %.1f mA/cm2' % (2 * Vmp_half, 2 * Voc_348, P_SITE / (2 * Vmp_half), J_mp))

# ------------------------------------------------ stowage / deployment / launch package
layer_pitch = 80e-6 + 50e-6 + 30e-6        # laminate (~80 um incl. contacts) + die relief + interleaf/air
V_film = A_FILM * layer_pitch
n_layers_centre = int(2 * LD / PANEL_W)
strip_len = 2 * LD
# two rolls (one per +-X half), each holds half the z-folded strip, roll axis along Y, roll length = PANEL_W
V_roll = V_film / 2
r_core = 0.30
R_roll = math.sqrt(V_roll / (math.pi * PANEL_W) + r_core ** 2)
pkg = dict(fold='z-fold (accordion) along hinge lines parallel to X -> strip %.3f m wide x %.0f m long, %d layers at the centre; '
                'then rolled from both X-tips toward the hub into 2 rolls (axis along Y)' % (PANEL_W, strip_len, n_layers_centre),
           film_volume_m3=V_film, roll_outer_radius_m=R_roll, roll_length_m=PANEL_W,
           package_envelope_m=[2 * (2 * R_roll) + 3.4, 3.4, 2.1],
           package_mass_t=M_TOTAL / 1e3, launch_accel_g=100,
           deployment=['kick stage (EP, O2) circularises at 0.92 AU, separates',
                       '+-X booms extend (articulated-truss canisters or in-situ beam builders), carrying the rolls outward; rolls pay out under brake',
                       '+-Y booms extend; their tips pull the outermost accordion panels out to the Y corners; panels unfold',
                       'constant-force tensioners take up slack to N = 0.1 N/m; corner vanes unfurl (TRAC booms); terminals unstow (masts)',
                       'sun-pointing by vanes; chiplets self-test; film mesh boots region by region'],
           min_bend_radius_laminate_m=0.034, note='laminate may be ROLLED (strain <= 0.1 % at r >= 34 mm) but never creased: all folds are in the 25 mm glass-cloth hinge strips')
OUT['stowage'] = pkg
print('package: film %.1f m3, 2 rolls R %.2f m x %.2f m, mass %.1f t' % (V_film, R_roll, PANEL_W, M_TOTAL / 1e3))

# ------------------------------------------------ counts for 1 TW and 1e26 W
counts = {}
sail_P_core = P_CORE
counts['per_sail'] = dict(P_core_W=sail_P_core, P_PV_W=P_PV, chiplets=N_SITES, FLOP_s=sail_P_core / E_FLOP)
counts['1TW_total_compute_85pct_on_sails'] = dict(n_sails=0.85e12 / sail_P_core, film_area_km2=0.85e12 / sail_P_core * A_FILM / 1e6, coverage_f=0.85e12 / sail_P_core * A_FILM / (4 * math.pi * (R_FILM * AU) ** 2))
counts['1TW_all_on_sails'] = dict(n_sails=1e12 / sail_P_core)
# 1e26 W: interpret as intercepted sunlight (chip power cannot reach 1e26 W)
P_chip_max = L_SUN * FILM['eta'] * ETA_CONV
rows = []
for f in (0.01, 0.1, 0.2612, 0.5, 1.0):
    r = film_rmin(T_SHEET, f)
    st = film_state(flux(r), f)
    q_core = st['q_e'] * ETA_CONV * area_sites / A_FILM
    n = f * 4 * math.pi * (r * AU) ** 2 / A_FILM
    rows.append(dict(f=f, r_AU=r, S=flux(r), q_e=st['q_e'], n_sails=n, P_sunlight_W=f * L_SUN, P_core_total_W=n * A_FILM * q_core,
                     P_core_per_sail_W=A_FILM * q_core, mass_kg=n * M_TOTAL))
    print('f=%.4f r=%.3f AU: %.3e sails, P_core %.3e W, mass %.2e kg' % (f, r, n, n * A_FILM * q_core, n * M_TOTAL))
counts['vs_coverage'] = rows
counts['1e26W'] = dict(note='1e26 W of CHIP power is unreachable: all film at f=1 gives at most eta_PV*eta_conv*L_sun = %.2e W. '
                            'Read as 1e26 W of intercepted sunlight: f = %.3f.' % (P_chip_max, 1e26 / L_SUN),
                       row=[r for r in rows if abs(r['f'] - 0.2612) < 1e-3][0], max_chip_power_W=P_chip_max)
OUT['counts'] = counts
print('1 TW (85 %% sails): %.0f sails; 1e26 W sunlight: %.3e sails' % (counts['1TW_total_compute_85pct_on_sails']['n_sails'], counts['1e26W']['row']['n_sails']))

# ------------------------------------------------ positions for the render spec
OUT['positions'] = dict(terminals=[[round(x, 3), round(y, 3)] for x, y in terms],
                        corners=[[LD, 0], [-LD, 0], [0, LD], [0, -LD]],
                        hinge_line_y=[round((k * HINGE_EVERY + HINGE_EVERY - 0.5) * PITCH, 4) for k in range(-int(LD / PANEL_W) - 1, int(LD / PANEL_W) + 1)
                                      if abs((k * HINGE_EVERY + HINGE_EVERY - 0.5) * PITCH) < LD])
dump(OUT, 'sail_layout.json')
