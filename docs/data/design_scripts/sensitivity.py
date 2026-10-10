"""Sensitivity of the sail geometry to chip technology (2070-2300 refresh cycles) and the energy-basis sanity check.
What is technology-invariant: sunlight, sheet temperature, PV efficiency -> q_e (W/m2 of electricity) -> the film,
its structure, optics, tension, deployment. What is technology-dependent: power per site (pitch), memory per site
(patch and replica area -> sail side), energy per op (FLOP/s per sail -> I/O per patch -> terminal aperture/count)."""
import math
from common import *

L_ = load('sail_layout.json'); ST = load('sail_structure.json')
OUT = {}
q_e = FILM['q_e']
A_film = L_['geometry']['film_area_m2']
sites = L_['geometry']['chiplet_sites']
f_active = L_['geometry']['active_fraction_of_film']
P_site0 = L_['geometry']['P_site_W']
side0 = L_['geometry']['side_m']
M_total = L_['mass']['total_kg']

# 1. power per site -> pitch, spreader
rows = []
for P in (0.03, 0.05, 0.10, 0.15, 0.25, 0.5, 1.0):
    pitch = math.sqrt(P / q_e)
    # Mg uniform spreader thickness for dT=10 K from research3 film.json clustering table (interpolated, 0 below 0.1 W)
    tab = [(0.03, 0.0), (0.1, 0.0), (0.25, 40.0), (0.5, 108.9), (1.0, 248.2)]
    if P <= 0.1:
        mg = 0.0
    else:
        for (p0, t0), (p1, t1) in zip(tab, tab[1:]):
            if p0 <= P <= p1:
                mg = t0 + (t1 - t0) * (P - p0) / (p1 - p0)
    mg = max(mg, 13.0 if abs(P - 0.15) < 1e-9 else mg)
    rows.append(dict(P_site_W=P, pitch_mm=pitch * 1e3, sites_per_m2=1 / pitch ** 2, Mg_um_for_10K=mg, spreader_kg_m2=mg * 1e-6 * 1740,
                     note='above ~0.2 W/site the spreader grows ~P (sheet conduction); below ~0.1 W the c-Si alone spreads'))
OUT['power_per_site'] = rows

# 2. memory per site and energy per op -> patch / replica / sail side / terminals
def sail_for(mem_mult=1.0, jop_div=1.0, P_site=P_site0, replica_sites_ref=1.03e8):
    sites_needed = replica_sites_ref / mem_mult                # same model state, k x more bytes per site
    pitch = math.sqrt(P_site / q_e)
    A = sites_needed * pitch ** 2 / f_active / (1 - 8 / 3 * 0.04)
    side = math.sqrt(A)
    P_core = sites_needed * P_site * ETA_CONV
    flops = P_core / (E_FLOP / jop_div)
    io_mult = jop_div                                           # I/O per FLOP held constant
    # terminal options: same 10 cm count x io_mult, or 30 cm apertures (far-field rate x81 at the same range)
    n_term_10cm = 64 * A / A_film * io_mult
    n_term_30cm = max(4, math.ceil(n_term_10cm / 81))
    frontier_patch_side = 32.5 / math.sqrt(mem_mult)
    return dict(mem_mult=mem_mult, jop_div=jop_div, P_site_W=P_site, pitch_mm=pitch * 1e3, sail_side_m=side, sail_area_m2=A,
                P_core_MW=P_core / 1e6, FLOP_s=flops, frontier_patch_side_m=frontier_patch_side,
                terminals_10cm=n_term_10cm, terminals_10cm_kg_m2=n_term_10cm * 5 / A, terminals_30cm=n_term_30cm, terminals_30cm_kg_m2=n_term_30cm * 15 / A)
cases = []
for mm in (1, 3, 10, 100):
    for jd in (1, 10, 100):
        cases.append(sail_for(mm, jd))
for P in (0.05, 0.5):
    cases.append(sail_for(1, 1, P))
OUT['memory_and_energy_per_op'] = dict(rows=cases, rules=[
    'Energy per op (J/FLOP) does NOT change sail geometry: area, pitch (at fixed W/site), film, structure and optics are set by sunlight, '
    'sheet temperature and PV efficiency. A 10x better J/op gives 10x FLOP/s per sail and, at constant bytes/FLOP of external I/O, 10x link '
    'capacity: 10 cm terminals x10 (0.046 kg/m2, +22 % sail mass) or the same count of 30 cm terminals (rate x81 in the far field; ~0.0007 kg/m2).',
    'Memory per site (bytes per W) sets patch and replica AREA: patch side ~ k^-1/2, replica sites ~ k^-1. If the sail is sized to hold the largest '
    'replica, its side ~ k^-1/2: k = 10 -> ~%.0f m, k = 100 -> ~%.0f m (then the fixed hub/vane mass, ~2.5 %% at 279 m, rises to ~%.0f %% and %.0f %%).'
    % (side0 / math.sqrt(10), side0 / 10, 2.5 * 10, 2.5 * 100),
    'Power per site sets pitch = sqrt(P/q_e): 0.05 W -> 14.7 mm, 0.15 W -> 25.4 mm, 0.5 W -> 46 mm; above ~0.2 W the spreader mass climbs (P^1-2).'])
for c in cases:
    if c['jop_div'] in (1, 10) and c['mem_mult'] in (1, 10):
        print('mem x%-3g J/op /%-3g P_site %.2f: pitch %.1f mm, side %.0f m, %.1f MW, %.2e FLOP/s, patch %.1f m, 10cm terminals %.0f (%.4f kg/m2) or 30cm %d' % (
            c['mem_mult'], c['jop_div'], c['P_site_W'], c['pitch_mm'], c['sail_side_m'], c['P_core_MW'], c['FLOP_s'], c['frontier_patch_side_m'],
            c['terminals_10cm'], c['terminals_10cm_kg_m2'], c['terminals_30cm']))

# 3. junction temperature limit and PV efficiency -> placement and q_e
tj_rows = []
for Tj in (60, 85, 105, 125, 150):
    Ts = Tj + 273.15 - 10
    for f in (0.01, 0.1):
        r = film_rmin(Ts, f)
        st = film_state(flux(r), f)
        tj_rows.append(dict(Tj_C=Tj, f=f, T_sheet_K=Ts, r_AU=r, q_e_W_m2=st['q_e'], pitch_mm_at_0p15W=math.sqrt(0.15 / st['q_e']) * 1e3,
                            sail_P_core_MW_same_film=A_film * f_active * st['q_e'] * ETA_CONV / 1e6))
for eta0 in (0.18, 0.20, 0.23, 0.26):
    p = dict(PV, eta0=eta0)
    st = film_state(S_FILM, F_REF, p)
    tj_rows.append(dict(eta0_AM0=eta0, q_e_W_m2=st['q_e'], pitch_mm_at_0p15W=math.sqrt(0.15 / st['q_e']) * 1e3))
OUT['tj_and_pv'] = tj_rows
for r in tj_rows:
    print({k: (round(v, 3) if isinstance(v, float) else v) for k, v in r.items()})

# 4. energy-basis sanity check (architecture: 1.3e-13 x 0.6 = 7.8e-14 J/FLOP at 85 C)
P_core = L_['geometry']['P_core_MW'] * 1e6
chk = dict(E_FLOP_J=E_FLOP, sail_P_core_W=P_core, sail_FLOP_s=P_core / E_FLOP, FLOP_s_per_m2=P_core / E_FLOP / A_film,
           FLOP_s_per_chiplet=P_site0 * ETA_CONV / E_FLOP, FLOP_s_per_kg=P_core / E_FLOP / M_total,
           architecture_film_FLOP_s_per_kg=1 / (0.89e-3 * E_FLOP), ratio_vs_architecture=(P_core / E_FLOP / M_total) / (1 / (0.89e-3 * E_FLOP)),
           FLOP_per_J_sunlight=FILM['eta'] * ETA_CONV / E_FLOP,
           swarm_f0p01_P_core_W=[r for r in L_['counts']['vs_coverage'] if r['f'] == 0.01][0]['P_core_total_W'],
           swarm_f0p01_FLOP_s=[r for r in L_['counts']['vs_coverage'] if r['f'] == 0.01][0]['P_core_total_W'] / E_FLOP,
           wafers_300mm_per_sail_at_6mm2=sites * 6e-6 / (math.pi * 0.15 ** 2 * 0.9),
           wafers_per_MW=sites * 6e-6 / (math.pi * 0.15 ** 2 * 0.9) / (P_core / 1e6),
           architecture_wafers_per_MW=640,
           pod_J_FLOP_at_Tj110=E_FLOP * math.exp(0.0089 * 25),
           note='Per-sail FLOP/s uses the architecture basis; the sail geometry does not depend on it (section 2).')
OUT['energy_basis_check'] = chk
print('sail %.2f MW core -> %.3e FLOP/s; per kg %.3e (architecture film %.3e, ratio %.2f); wafers/MW %.0f (arch 640)' % (
    P_core / 1e6, chk['sail_FLOP_s'], chk['FLOP_s_per_kg'], chk['architecture_film_FLOP_s_per_kg'], chk['ratio_vs_architecture'], chk['wafers_per_MW']))
dump(OUT, 'sensitivity.json')
