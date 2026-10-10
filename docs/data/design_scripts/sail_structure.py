"""Compute sail: first-principles structure and sizing.
1. Film stack candidates: areal mass, lateral conductance -> die-to-sheet dT (finite-volume radiating fin, same model
   as research3/skeptic/checks.py), laminate neutral axis, bending stiffness, free thermal curvature per K.
2. Loads at 0.919 AU: radiation pressure, beta, through-thickness thermal gradient, differential billow load.
3. Tensioning architectures: (a) square frame with 4 diagonal booms (Euler-buckling sized), (b) compression hoop,
   (c) spin tension (load-defined). Mass per m2 and the frame/film thermal-strain mismatch.
4. Spin trade for a square sail: precession torque vs corner-vane authority, tension, billow slope, edge curl.
5. Size trade: replica size, fixed masses, package, umbra, fault domain, precession.
6. Meteoroid holes per sail per year and Griffith critical crack length (rip-stop need)."""
import math, numpy as np
from common import *

OUT = {}
q_e = FILM['q_e']
h_rad = 1.75 * 4 * SIGMA * T_SHEET ** 3          # linearised two-face radiative conductance (thermal_mass basis)

# ---------------------------------------------------------------- 1. stacks
STACKS = {
    # name: list of (material, thickness_um) from the sun side; 'grid' handled as areal mass only
    'A_architecture (glass20/Si30/Mg13/enamel5)': [('MAS_glass', 20), ('Si', 30), ('Mg', 13), ('enamel', 5)],
    'A2_arch+thick_enamel (glass20/Si30/Mg13/enamel15)': [('MAS_glass', 20), ('Si', 30), ('Mg', 13), ('enamel', 15)],
    'C_Si_spreader (glass20/Si46/Mg3/enamel15)': [('MAS_glass', 20), ('Si', 46), ('Mg', 3), ('enamel', 15)],
    'E_MgO_balance (glass16/MgO4/Si30/Mg13/enamel15)': [('MAS_glass', 16), ('MgO', 4), ('Si', 30), ('Mg', 13), ('enamel', 15)],
}
GRID_KG = 0.004          # cell interconnect (rear Al/Mg fingers, tile wiring), architecture budget
MESH_KG = 0.00036        # chiplet signal mesh wiring (interconnect_final)
CHIP_KG = 0.0004         # dies (research3 film.py mid)
STRUCT_KG = 0.012        # structure budget (architecture) - allocated in sail_layout.py

def fv_dT(P, K_sheet, R, r0, h, n=500, K_die=150 * 50e-6):
    faces = np.concatenate([[0.0], np.geomspace(r0 * 1e-3, R, n)])
    rc = 0.5 * (faces[1:] + faces[:-1]); A = np.pi * (faces[1:] ** 2 - faces[:-1] ** 2)
    m = len(rc)
    q_src = np.where(rc < r0, P / (np.pi * r0 ** 2), 0.0)
    q_rem = P / (np.pi * R ** 2)
    M = np.zeros((m, m)); b = (q_src - q_rem) * A
    for i in range(m):
        M[i, i] -= h * A[i]
        for f, nb in ((i, i - 1), (i + 1, i + 1)):
            if 0 <= nb < m:
                K = K_sheet + (K_die if faces[f] <= r0 else 0.0)
                g = K * 2 * np.pi * faces[f] / abs(rc[nb] - rc[i])
                M[i, i] -= g; M[i, nb] += g
    th = np.linalg.solve(M, -b)
    return float(th[0] - np.sum(th * A) / np.sum(A))

def laminate(layers):
    z = 0.0; rows = []
    for mat, t_um in layers:
        t = t_um * 1e-6; p = MATL[mat]
        rows.append((mat, t, z + t / 2, p)); z += t
    EA = sum(p['M'] * t for _, t, _, p in rows)
    zn = sum(p['M'] * t * zc for _, t, zc, p in rows) / EA
    Db = sum(p['M'] * (t ** 3 / 12 + t * (zc - zn) ** 2) for _, t, zc, p in rows)          # biaxial (spherical) stiffness
    Dp = sum(p['E'] / (1 - p['nu'] ** 2) * (t ** 3 / 12 + t * (zc - zn) ** 2) for _, t, zc, p in rows)  # plate stiffness
    MT = sum(p['M'] * p['cte'] * t * (zc - zn) for _, t, zc, p in rows)                   # thermal moment per K (N m/m/K)
    sigma = sum(p['rho'] * t for _, t, _, p in rows)
    K = sum(p['k'] * t for mat, t, _, p in rows if mat in ('Si', 'Mg', 'Al', 'MgO'))       # lateral conductance (W/K)
    return dict(thickness_um=z * 1e6, z_neutral_um=zn * 1e6, D_biax=Db, D_plate=Dp, MT_per_K=MT,
                kappa_per_K=MT / Db, sigma_layers=sigma, K_sheet=K)

P_SITE = 0.15
pitch = math.sqrt(P_SITE / q_e)
R_cell = math.sqrt(P_SITE / (math.pi * q_e))
stk = {}
for name, layers in STACKS.items():
    L = laminate(layers)
    sig = L['sigma_layers'] + GRID_KG + MESH_KG + CHIP_KG
    dT = {d: fv_dT(0.140, L['K_sheet'], R_cell, math.sqrt(d * 1e-6 / math.pi), h_rad) for d in (1.5, 6.0)}
    L.update(sigma_film_kg_m2=sig, sigma_with_structure=sig + STRUCT_KG, dT_die_1p5mm2=dT[1.5], dT_die_6mm2=dT[6.0])
    stk[name] = L
    print('%-52s t=%5.1f um sigma=%.4f(+struct %.4f) K=%.2e dT(1.5/6mm2)=%.1f/%.1f K  kappa=%.3f /m/K  D=%.2e' % (
        name, L['thickness_um'], sig, sig + STRUCT_KG, L['K_sheet'], dT[1.5], dT[6.0], L['kappa_per_K'], L['D_plate']))
OUT['stacks'] = dict(rows=stk, pitch_m=pitch, P_site_W=P_SITE, note='kappa = free (unrestrained) spherical curvature per K of departure from the '
                     'stress-free temperature. Interior of a tensioned membrane: uniform thermal moment gives no deflection; it acts only at '
                     'free edges (rim, hinge strips, holes), rotating them by theta = kappa*dT*sqrt(D/N).')

# ---------------------------------------------------------------- 2. loads
p_srp = srp_pressure(S_FILM, alpha=0.90, rho_spec=0.002, rho_diff=0.003, T=T_SHEET)
p_per_S = p_srp / S_FILM
dT_through = (0.5 * 0.90 * S_FILM) * (20e-6 / 1.2 + 30e-6 / 120)     # half the heat crosses the front glass + Si
kappa_grad = 2.9e-6 * dT_through / 70e-6
OUT['loads'] = dict(S_W_m2=S_FILM, p_srp_Pa=p_srp, S_over_c_Pa=S_FILM / C,
                    dT_through_thickness_K=dT_through, kappa_gradient_per_m=kappa_grad,
                    note='Two-face emission: through-thickness dT ~0.01 K, bowing curvature ~1e-3 /m (radius km): negligible. '
                         'CTE mismatch of the stack is the real flatness driver (see stacks).')
print('SRP %.3e Pa; through-thickness dT %.4f K -> kappa %.2e /m' % (p_srp, dT_through, kappa_grad))

# ---------------------------------------------------------------- 3. tensioning architectures (square sail, side s)
def boom_frame_mass(s, N=0.05, SF=3.0, E=45e9, rho=1740, depth_ratio=0.01):
    """4 diagonal cantilever booms (hub to corner), each carrying the corner load of two catenary edges.
    Edge tension ~ N*s/2 per edge; boom compression P ~ sqrt(2)*N*s/2*... take P = N*s (conservative).
    Triangular truss boom, 3 longerons of area A at circumradius rb: I = 1.5 A rb^2; Euler K=2 cantilever.
    Longerons + 60 % for battens/diagonals. rb chosen as depth_ratio * length (stiffness-efficient, 1 %)."""
    L = s / math.sqrt(2)
    P = N * s
    I = SF * P * (2 * L) ** 2 / (math.pi ** 2 * E)
    rb = depth_ratio * L
    A = I / (1.5 * rb ** 2)
    A = max(A, 3e-6)                        # 2 mm dia minimum gauge
    m_per_m = 1.6 * 3 * A * rho
    return 4 * L * m_per_m / s ** 2, m_per_m

def hoop_mass(s, N=0.05, SF=3.0, E=45e9, rho=1740, depth=1.0):
    """Circular compression ring around the square (radius s/sqrt2) loaded by membrane tension through
    cables: in-plane buckling q_cr = 3EI/R^3. Two-chord truss ring, chord area A, depth d: I = A d^2/2."""
    R = s / math.sqrt(2)
    q = N
    I = SF * q * R ** 3 / (3 * E)
    A = max(I / (depth ** 2 / 2), 3e-6)
    m_per_m = 1.6 * 2 * A * rho
    return 2 * math.pi * R * m_per_m / s ** 2, m_per_m

arch = []
for s in (80, 160, 260, 400, 1000):
    for N in (0.005, 0.05):
        bm, bmm = boom_frame_mass(s, N)
        hm, hmm = hoop_mass(s, N)
        arch.append(dict(side_m=s, N_N_per_m=N, boom_frame_kg_m2=bm, boom_kg_per_m=bmm, hoop_kg_m2=hm, hoop_kg_per_m=hmm))
        print('frame s=%4d N=%.3f: booms %.5f kg/m2 (%.3f kg/m), hoop %.5f kg/m2 (%.3f kg/m)' % (s, N, bm, bmm, hm, hmm))
# thermal-strain mismatch film vs a frame in the film's shade
T_frame = T_SHEET / 2 ** 0.25
mismatch = MATL['Si']['cte'] * (T_SHEET - 300) - MATL['Mg']['cte'] * (T_frame - 300)
Et_film = sum(MATL[m]['M'] * t * 1e-6 for m, t in STACKS['A2_arch+thick_enamel (glass20/Si30/Mg13/enamel15)'])
OUT['tension_architectures'] = dict(
    rows=arch, frame_shaded_T_K=T_frame, film_frame_strain_mismatch=mismatch, film_membrane_stiffness_N_per_m=Et_film,
    tension_change_if_rigidly_attached_N_per_m=Et_film * abs(mismatch),
    note='A frame/hoop fixes the film DISPLACEMENT, so any film-frame strain mismatch (temperature, CTE, creep) changes '
         'the tension by E*t*strain ~ 1e2-1e3 N/m against the 0.005-0.05 N/m needed: catenary edges + constant-force '
         'springs become mandatory and wrinkling/slack is likely. Spin fixes the LOAD (centrifugal), so tension is '
         'independent of strain mismatch, needs no compression members and deploys by centrifugal force (IKAROS, Znamya-2).')
print('frame at %.0f K: strain mismatch %.2e -> dN %.0f N/m if rigid' % (T_frame, mismatch, Et_film * abs(mismatch)))

# ---------------------------------------------------------------- 4. spin trade (square sail)
r_orb = R_FILM * AU
def sail_props(s, sigma, m_hub=250.0, m_corner=30.0, vane_frac=0.005, m_term=5.0, term_area=1056.0, rho_vane=0.85):
    A = s * s
    n_term = A / term_area
    A_v = vane_frac * A / 4
    m_vane = 4 * (A_v * 0.012 + 2 * math.sqrt(2 * A_v) * 0.12 + 12.0)      # membrane 12 g/m2, 2 diagonal FeNi TRAC booms 0.12 kg/m, gimbal 12 kg
    M = sigma * A + m_hub + 4 * m_corner + m_vane + n_term * m_term
    Rc = s / math.sqrt(2) + 0.5 * math.sqrt(A_v)
    Iz = sigma * A * s * s / 6 + 4 * (m_corner + m_vane / 4) * Rc ** 2 + n_term * m_term * s * s / 6
    beta = beta_of(p_per_S * C, M / A)
    n_orb = math.sqrt((1 - beta) * GM_SUN / r_orb ** 3)
    Fv = S_FILM / C * A_v * (1 + rho_vane)                 # face-on reflective vane
    tau_prec_avail = 4 * Fv * Rc / math.pi                  # bang-bang, spin-synchronous, 4 vanes
    tau_spin_avail = 4 * S_FILM / C * A_v * 2 * rho_vane * 0.385 * Rc   # collective pitch at 35 deg
    return dict(A=A, M=M, Iz=Iz, Rc=Rc, beta=beta, n_orb=n_orb, A_vane=A_v, m_vane_total=m_vane, n_term=n_term,
                tau_prec_avail=tau_prec_avail, tau_spin_avail=tau_spin_avail)

def tension(sigma, omega, R, r, N_edge, nu=0.25):
    Nr = sigma * omega ** 2 * (3 + nu) / 8 * (R ** 2 - r ** 2) + N_edge
    Nt = sigma * omega ** 2 / 8 * ((3 + nu) * R ** 2 - (1 + 3 * nu) * r ** 2) + N_edge
    return Nr, Nt

def spin_check(s, stack_name, period_min, dT_excursion=3.0, verbose=False):
    L = stk[stack_name]
    sigma = L['sigma_with_structure']
    sp = sail_props(s, sigma)
    w = 2 * math.pi / (period_min * 60)
    R_eq = s / math.sqrt(math.pi)
    # rim load: corner masses + vanes spread round the equivalent rim
    N_edge = (4 * 30.0 + sp['m_vane_total']) * w ** 2 * sp['Rc'] / (2 * math.pi * R_eq)
    H = sp['Iz'] * w
    tau_prec = H * sp['n_orb']
    p_eff = p_srp * (1 - sigma * sp['A'] / sp['M'])       # differential load: film runs ahead of the concentrated masses
    rr = np.linspace(0.05, 0.98, 50) * R_eq
    Nr, Nt = tension(sigma, w, R_eq, rr, N_edge)
    slope = p_eff * rr / (2 * Nr)
    N_min = float(min(Nr.min(), Nt.min()))
    ell = math.sqrt(L['D_plate'] / N_min)
    theta_edge = abs(L['kappa_per_K']) * dT_excursion * ell
    res = dict(side_m=s, stack=stack_name, period_min=period_min, omega=w, H=H, tau_prec_Nm=tau_prec,
               tau_prec_avail_Nm=sp['tau_prec_avail'], prec_margin=sp['tau_prec_avail'] / tau_prec,
               N_hub=float(Nr[0]), N_min=N_min, N_edge=N_edge, max_billow_slope_deg=math.degrees(float(slope.max())),
               ell_m=ell, edge_rotation_deg_per_dTexc=math.degrees(theta_edge), dT_excursion_K=dT_excursion,
               rim_speed=w * sp['Rc'], spinup_days_vanes=H / sp['tau_spin_avail'] / DAY,
               membrane_stress_hub_kPa=float(Nr[0]) / (L['thickness_um'] * 1e-6) / 1e3, **{k: sp[k] for k in ('M', 'Iz', 'beta', 'A_vane', 'n_term')})
    return res

BASE_STACK_CANDIDATES = list(STACKS)
spin_rows = []
for name in BASE_STACK_CANDIDATES:
    for per in (10, 20, 30, 45, 60, 90, 120):
        r = spin_check(260.1, name, per)
        spin_rows.append(r)
for r in spin_rows:
    if r['period_min'] in (20, 45, 60, 90):
        print('spin %s P=%3d min: tau_prec %.3f / avail %.3f (x%.1f) N_hub %.4f N_min %.5f slope %.2f deg ell %.2f m edge rot %.2f deg (dT %g K) spin-up %.1f d' % (
            r['stack'][:2], r['period_min'], r['tau_prec_Nm'], r['tau_prec_avail_Nm'], r['prec_margin'], r['N_hub'], r['N_min'],
            r['max_billow_slope_deg'], r['ell_m'], r['edge_rotation_deg_per_dTexc'], r['dT_excursion_K'], r['spinup_days_vanes']))
OUT['spin_trade_260m'] = spin_rows

# ---------------------------------------------------------------- 5. size trade
CHIP_AREA = pitch ** 2
UTIL = 0.955          # active fraction after hinge strips, seams, hub, terminal service patches (sail_layout.py)
size_rows = []
for chips in (1e7, 3e7, 1e8, 3e8, 1e9):
    A = chips * CHIP_AREA / UTIL
    s = math.sqrt(A)
    sig = stk['C_Si_spreader (glass20/Si46/Mg3/enamel15)']['sigma_with_structure']
    sp = sail_props(s, sig)
    # choose the fastest spin with precession margin >= 2
    w_max = sp['tau_prec_avail'] / 2 / (sp['Iz'] * sp['n_orb'])
    per = 2 * math.pi / w_max / 60
    chk = spin_check(s, 'C_Si_spreader (glass20/Si46/Mg3/enamel15)', per)
    P_e = chips * P_SITE
    fixed = 250.0 + 4 * 30.0
    pkg_vol = A * 150e-6
    size_rows.append(dict(chips=chips, side_m=s, area_m2=A, mass_t=sp['M'] / 1e3, P_elec_MW=P_e / 1e6, fixed_mass_frac=fixed / sp['M'],
                          spin_period_min_at_margin2=per, N_min=chk['N_min'], slope_deg=chk['max_billow_slope_deg'],
                          umbra_km=s * 98.9 / 1e3, package_m3=pkg_vol, package_diam_m_at_h1p63=2 * math.sqrt(pkg_vol / (math.pi * 1.63) + 0.25),
                          n_terminals=sp['n_term'], frontier_patches_32m=A * UTIL / 32.5 ** 2))
    print('size %.0e chips: side %.0f m, %.1f t, %.1f MW, fixed %.1f %%, spin period %.0f min, N_min %.4f, slope %.2f deg, umbra %.0f km, pkg %.1f m3' % (
        chips, s, sp['M'] / 1e3, P_e / 1e6, 100 * fixed / sp['M'], per, chk['N_min'], chk['max_billow_slope_deg'], s * 98.9 / 1e3, pkg_vol))
OUT['size_trade'] = size_rows

# ---------------------------------------------------------------- 6. meteoroids
fs, vs = met_scale(R_FILM)
v = 20.0 * vs
def ble_dcrit_cm(t_cm, v_kms, K1=0.57, rho_p=RHO_MET):
    return (t_cm / (K1 * rho_p ** 0.519 * v_kms ** 0.875)) ** (1 / 1.056)
t_lam = stk['C_Si_spreader (glass20/Si46/Mg3/enamel15)']['thickness_um'] * 1e-4
d_perf = ble_dcrit_cm(t_lam, v)
holes = []
A_sail = 260.1 ** 2
for d_hole_mm in (0.1, 0.3, 1, 3, 10, 30, 100):
    d_p_cm = d_hole_mm / 10 / 2.0             # thin-film hole ~2x projectile diameter at 20 km/s (brittle laminate: crater + spall)
    rate = float(grun_flux(d_to_m_g(d_p_cm))) * fs / 2   # one face exposed to the meteoroid stream on average (2pi -> per face)
    holes.append(dict(hole_mm=d_hole_mm, particle_um=d_p_cm * 1e4, per_m2_yr=rate, per_sail_yr=rate * A_sail))
    print('holes >= %5.1f mm: %.3e /m2/yr -> %.3g per 260 m sail per yr' % (d_hole_mm, rate, rate * A_sail))
area_frac_holed = sum(0.0 for _ in [0])
# area fraction lost per year (integrate hole area over the flux; dominated by small holes)
ds = np.geomspace(1e-4, 1.0, 400)           # particle diameter cm
F = np.array([float(grun_flux(d_to_m_g(d))) for d in ds]) * fs / 2
dn = -np.diff(F)
dmid = np.sqrt(ds[1:] * ds[:-1])
area_loss = float(np.sum(dn * np.pi / 4 * (2 * dmid / 100) ** 2))      # m2 per m2 per yr
# Griffith critical crack length at operating tension (spin, hub tension of the baseline)
base_spin = spin_check(260.1, 'C_Si_spreader (glass20/Si46/Mg3/enamel15)', 60)
stress = base_spin['N_hub'] / (stk['C_Si_spreader (glass20/Si46/Mg3/enamel15)']['thickness_um'] * 1e-6)
K_IC = 0.75e6     # glass/Si laminate, Pa sqrt(m) (fused silica 0.75, Si 0.8-0.9)
a_crit = (K_IC / stress) ** 2 / math.pi
OUT['meteoroids'] = dict(r_AU=R_FILM, impact_speed_kms=v, flux_scale=fs, perforation_particle_um=d_perf * 1e4, holes=holes,
                         area_fraction_holed_per_yr=area_loss, operating_stress_Pa=stress, K_IC=K_IC, griffith_critical_crack_m=a_crit,
                         note='Holes do not grow: at spin tension the laminate stress is ~%.0f Pa, and the Griffith crack length is %.1e m. '
                              'Rip-stops are needed only for handling/deployment loads; the 25 mm hinge strips (glass-cloth) every 1.63 m and the '
                              'diagonal tapes act as rip-stops. A hit kills at most its 25 mm tile (0.15 W).' % (stress, a_crit))
print('perforating particle %.1f um; holed area %.2e /yr; stress %.1f Pa; Griffith a_c %.2e m' % (d_perf * 1e4, area_loss, stress, a_crit))
dump(OUT, 'sail_structure.json')

# ---------------------------------------------------------------- 7. frame-tensioned (non-spinning) baseline checks
def boom_design(F_axial, L, E=45e9, rho=1740, SF=3.0, rb_list=(0.6, 0.9, 1.2, 1.5, 1.84), tube_t_frac=0.08):
    """Triangular truss cantilever (hub-clamped, tip load along the axis), 3 thin-wall Mg-alloy tube longerons at
    circumradius rb, bay length = triangle side. Global Euler (K=2) and longeron local buckling between battens,
    both with safety factor SF. Battens+diagonals = 60 % of longeron mass. Returns lightest design."""
    best = None
    for rb in rb_list:
        a_side = rb * math.sqrt(3)
        I_req = SF * F_axial * (2 * L) ** 2 / (math.pi ** 2 * E)
        A_glob = I_req / (1.5 * rb ** 2)
        # longeron tube diameter d with wall t = tube_t_frac*d: A = pi d t, I_l = pi d^3 t / 8
        P_l = SF * F_axial / 3
        # local: pi^2 E I_l / a_side^2 >= P_l  -> d^4 >= P_l a^2 8 /(pi^3 E tube_t_frac)
        d_loc = (P_l * a_side ** 2 * 8 / (math.pi ** 3 * E * tube_t_frac)) ** 0.25
        d_glob = math.sqrt(A_glob / (math.pi * tube_t_frac))
        d = max(d_loc, d_glob, 6e-3)
        A = math.pi * d * tube_t_frac * d
        m_per_m = 1.6 * 3 * A * rho
        row = dict(rb=rb, side=a_side, d_longeron_mm=d * 1e3, wall_mm=d * tube_t_frac * 1e3, kg_per_m=m_per_m, mass_kg=m_per_m * L)
        if best is None or row['mass_kg'] < best['mass_kg']:
            best = row
    return best

ST = 'A2_arch+thick_enamel (glass20/Si30/Mg13/enamel15)'
frame_rows = []
for name in STACKS:
    L_ = stk[name]
    for N in (0.03, 0.1, 0.3, 0.5, 1.0):
        ell = math.sqrt(L_['D_plate'] / N)
        frame_rows.append(dict(stack=name, N=N, ell_m=ell, edge_rot_deg_per_K=math.degrees(abs(L_['kappa_per_K']) * ell),
                               edge_rot_deg_3K=math.degrees(abs(L_['kappa_per_K']) * 3 * ell),
                               stress_kPa=N / (L_['thickness_um'] * 1e-6) / 1e3))
for r in frame_rows:
    if r['N'] in (0.1, 0.3, 1.0):
        print('frame %s N=%.2f: ell %.3f m edge rot %.2f deg/K (%.1f deg at 3 K)' % (r['stack'][:2], r['N'], r['ell_m'], r['edge_rot_deg_per_K'], r['edge_rot_deg_3K']))

# sag-ratio trade at N = 0.3 N/m for a ~1e8-site diamond (square side s): catenary edge cable tension, corner load,
# boom design, scallop area loss
N_base = 0.1
sag_rows = []
for sag in (0.02, 0.03, 0.04, 0.05, 0.06, 0.08):
    A_need = 1.03e8 * pitch ** 2 / 0.955
    # s^2 - 4*(2/3)*sag*s*s = A_need
    s = math.sqrt(A_need / (1 - 8.0 / 3.0 * sag))
    T_edge = N_base * s ** 2 / (8 * sag * s)
    F_corner = 2 * T_edge * math.cos(math.radians(45 - math.degrees(math.atan(4 * sag))))
    L_boom = s / math.sqrt(2) + 2.0
    b = boom_design(F_corner, L_boom)
    sag_rows.append(dict(sag_ratio=sag, side_m=s, T_edge_N=T_edge, F_corner_N=F_corner, boom=b, booms_kg=4 * b['mass_kg'],
                         booms_kg_m2=4 * b['mass_kg'] / A_need, scallop_area_frac=8.0 / 3.0 * sag))
    print('sag %.2f: s %.1f m, T_edge %.0f N, F_corner %.0f N, boom rb %.2f d %.1f mm %.3f kg/m -> 4 booms %.0f kg (%.4f kg/m2), scallop %.1f %%' % (
        sag, s, T_edge, F_corner, b['rb'], b['d_longeron_mm'], b['kg_per_m'], 4 * b['mass_kg'], 4 * b['mass_kg'] / A_need, 100 * 8 / 3 * sag))
# membrane fundamental frequency, corner stress fan, disturbance & vane torques (non-spinning)
s_b = [r for r in sag_rows if r['sag_ratio'] == 0.04][0]['side_m']
sig_b = stk[ST]['sigma_with_structure']
f1 = 1 / (2 * s_b / math.sqrt(2)) * math.sqrt(2 * N_base / sig_b)
F_c = [r for r in sag_rows if r['sag_ratio'] == 0.04][0]['F_corner_N']
corner_N_1m = F_c / (math.pi / 2 * 1.0)
A_sail = s_b ** 2 * (1 - 8 / 3 * 0.04)
tau_dist = 0.01 * p_srp * (A_sail / 2) * (s_b / 4)
A_v = 0.005 * A_sail / 4
Rc = s_b / math.sqrt(2) + 2.0 + 0.5 * math.sqrt(A_v)
F_v = S_FILM / C * A_v * (1 + 0.85)
tau_vane_axis = 2 * F_v * Rc
tau_gg = 3 * GM_SUN / (R_FILM * AU) ** 3 * (sig_b * A_sail * s_b ** 2 / 12) * 0.5
p_eff_frame = p_srp * 0.06
billow = p_eff_frame * (s_b / math.sqrt(2)) / (2 * N_base)
OUT['frame_baseline'] = dict(N_N_per_m=N_base, curl_rows=frame_rows, sag_trade=sag_rows, side_at_4pct_m=s_b,
                             membrane_f1_Hz=f1, corner_force_N=F_c, corner_tension_at_1m_N_per_m=corner_N_1m,
                             corner_stress_at_1m_MPa=corner_N_1m / (stk[ST]['thickness_um'] * 1e-6) / 1e6,
                             disturbance_torque_1pct_Nm=tau_dist, vane_area_each_m2=A_v, vane_arm_m=Rc, vane_torque_per_axis_Nm=tau_vane_axis,
                             gravity_gradient_torque_Nm=tau_gg, billow_slope_deg=math.degrees(billow),
                             boom_temperature_in_film_shade_K=T_frame)
print('frame baseline: s %.1f m, f1 %.4f Hz, corner %.0f N (%.0f N/m at 1 m = %.2f MPa), dist torque %.3f N m vs vanes %.3f N m/axis (A_v %.1f m2 at %.0f m), GG %.1e N m, billow %.3f deg' % (
    s_b, f1, F_c, corner_N_1m, corner_N_1m / (stk[ST]['thickness_um'] * 1e-6) / 1e6, tau_dist, tau_vane_axis, A_v, Rc, tau_gg, math.degrees(billow)))
dump(OUT, 'sail_structure.json')
