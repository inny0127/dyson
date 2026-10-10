"""Shared constants and physics for the compute-sail / pod design pass (research4/design).
SI units unless a name says otherwise. Thermal/PV parameters are the ones used by
research3/thermal_mass (common.py, film.py) so the numbers here reproduce the architecture basis."""
import json, math, os
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
DL = os.path.join(HERE, 'dl')

L_SUN = 3.828e26            # W, IAU 2015 nominal
R_SUN = 6.957e8             # m, IAU 2015 nominal
T_SUN = 5772.0              # K, IAU 2015 nominal effective temperature
AU = 1.495978707e11         # m
GM_SUN = 1.32712440018e20   # m^3/s^2
SIGMA = 5.670374419e-8
C = 2.99792458e8
YEAR = 3.15576e7
DAY = 86400.0
G0 = 9.80665
S0 = L_SUN / (4 * math.pi * AU ** 2)

def flux(r_au):
    return L_SUN / (4 * math.pi * (r_au * AU) ** 2)

def sun_ang_diam(r_au):
    return 2 * math.atan(R_SUN / (r_au * AU))

# ---------------- PV / film thermal (identical to research3/thermal_mass/scripts/common.py) ----------------
PV = dict(eta0=0.20, T0=301.0, beta=-0.0042, packing=0.90, alpha=0.90, eps_f=0.85, eps_b=0.90)

def pv_eta(T, p=PV):
    return max(0.0, p['eta0'] * (1 + p['beta'] * (T - p['T0'])))

def radiosity_k(f, eps_f, eps_b):
    g = min(1.0, max(0.0, f))
    return eps_b + eps_f * (1 - g) / (1 - g * (1 - eps_f))

def alpha_eff(f, alpha):
    g = min(1.0, max(0.0, f))
    return alpha / (1 - (1 - alpha) * g)

def film_rmin(T_sheet, f, p=PV):
    k = radiosity_k(f, p['eps_f'], p['eps_b'])
    a = alpha_eff(f, p['alpha'])
    S = SIGMA * k * T_sheet ** 4 / a
    return math.sqrt(L_SUN / (4 * math.pi * S)) / AU

def film_state(S, f, p=PV):
    k = radiosity_k(f, p['eps_f'], p['eps_b'])
    a = alpha_eff(f, p['alpha'])
    T = (a * S / (SIGMA * k)) ** 0.25
    eta = pv_eta(T, p) * p['packing']
    return dict(T=T, eta=eta, q_e=eta * S)

def wing_state(S, f, p=PV, eps_f=0.85, eps_b=0.85):
    """PV wing that exports its electricity (pod). Fixed point in T."""
    T = 380.0
    for _ in range(300):
        eta = pv_eta(T, p) * p['packing']
        k = radiosity_k(f, eps_f, eps_b)
        a = alpha_eff(f, p['alpha'])
        Tn = ((a - eta) * S / (SIGMA * k)) ** 0.25
        if abs(Tn - T) < 1e-9:
            break
        T = 0.5 * (T + Tn)
    eta = pv_eta(T, p) * p['packing']
    return dict(T=T, eta=eta, q_e=eta * S)

# Baseline placement used by the architecture: Tj 85 C, die-to-sheet 10 K -> sheet 348.15 K, f = 0.01
TJ_C = 85.0
T_SHEET = TJ_C + 273.15 - 10.0
F_REF = 0.01
R_FILM = film_rmin(T_SHEET, F_REF)          # ~0.919 AU
S_FILM = flux(R_FILM)
FILM = film_state(S_FILM, F_REF)            # q_e ~232.6 W/m2
ETA_CONV = 0.93                             # cell -> core (on-die switched-capacitor), research3 mid
E_FLOP = 1.3e-13 * 0.6                      # architecture energy basis, J per dense FP8 FLOP at 85 C

# ---------------- radiation pressure ----------------
SIGMA_STAR_ABS = L_SUN / (4 * math.pi * C * GM_SUN)   # kg/m2: areal density with beta = 1 for a perfect absorber

def srp_pressure(S, alpha=0.90, rho_spec=0.01, rho_diff=0.05, eps_f=0.85, eps_b=0.90, T=None):
    """Normal radiation pressure on a sun-facing plate [Pa]: absorbed + 2x specular + 2/3 diffuse (Lambert)
    reflection + net thermal-emission recoil (2/3)(eps_f - eps_b) sigma T^4 / c (front pushes back)."""
    p = S / C * (alpha + 2 * rho_spec + (2.0 / 3.0) * rho_diff)
    if T is not None:
        p += (2.0 / 3.0) * (eps_f - eps_b) * SIGMA * T ** 4 / C
    return p

def beta_of(Q, sigma_kg_m2):
    """beta = SRP accel / solar gravity (independent of r). Q = dimensionless pressure coefficient (alpha + 2 rho_s + 2/3 rho_d)."""
    return Q * (L_SUN / (4 * math.pi * C)) / (GM_SUN * sigma_kg_m2)

# ---------------- Grün 1985 meteoroid flux (SPENVIS form), r^-1.8 inside 1 AU ----------------
def grun_flux(m_g):
    m = np.asarray(m_g, dtype=float)
    F1 = (2.2e3 * m ** 0.306 + 15.0) ** -4.38
    F2 = 1.3e-9 * (m + 1e11 * m ** 2 + 1e27 * m ** 4) ** -0.36
    F3 = 1.3e-16 * (m + 1e6 * m ** 2) ** -0.85
    return 3.15576e7 * (F1 + F2 + F3)      # per m2 per year, m >= m_g, randomly tumbling plate (2 pi)

RHO_MET = 2.5   # g/cm3
def d_to_m_g(d_cm):
    return math.pi / 6 * d_cm ** 3 * RHO_MET

def met_scale(r_au):
    return (r_au ** -1.8, r_au ** -0.5) if r_au <= 1 else (r_au ** -2.0, r_au ** -0.5)

# ---------------- materials (density kg/m3, biaxial modulus E/(1-nu) Pa, CTE 1/K, k W/mK) ----------------
MATL = {
    'Si':       dict(rho=2330, E=130e9, nu=0.28, M=180.5e9, cte=2.9e-6, k=120.0),   # (100) biaxial modulus; CTE, k at ~350 K
    'Mg':       dict(rho=1740, E=45e9, nu=0.29, cte=26.5e-6, k=156.0),
    'Al':       dict(rho=2700, E=70e9, nu=0.35, cte=23.5e-6, k=237.0),
    'SiO2':     dict(rho=2200, E=73e9, nu=0.17, cte=0.55e-6, k=1.4),               # fused silica
    'MAS_glass':dict(rho=2500, E=78e9, nu=0.22, cte=3.2e-6, k=1.2),                # SiO2-rich Mg-aluminosilicate (Si-matched)
    'enamel':   dict(rho=2700, E=70e9, nu=0.22, cte=5.0e-6, k=1.2),                # Fe-bearing Ca-Mg silicate enamel (back emitter)
    'MgO':      dict(rho=3580, E=300e9, nu=0.18, cte=13.5e-6, k=40.0),
    'FeNi':     dict(rho=7900, E=200e9, nu=0.29, cte=12e-6, k=30.0),
    'glassfibre_cloth': dict(rho=2500, E=70e9, nu=0.22, cte=3e-6, k=1.0),
}
for v in MATL.values():
    v.setdefault('M', v['E'] / (1 - v['nu']))

def dump(obj, name):
    path = os.path.join(HERE, name)
    with open(path, 'w') as f:
        json.dump(obj, f, indent=1, default=lambda o: float(o) if isinstance(o, (np.floating, np.integer)) else str(o))
    return path

def load(name):
    with open(os.path.join(HERE, name)) as f:
        return json.load(f)

if __name__ == '__main__':
    print('R_FILM %.4f AU, S %.1f W/m2, T %.2f K, eta %.4f, q_e %.1f W/m2' % (R_FILM, S_FILM, FILM['T'], FILM['eta'], FILM['q_e']))
    print('sigma* (absorber, beta=1) = %.4f g/m2' % (SIGMA_STAR_ABS * 1e3))
    print('S/c at film = %.3e Pa; sun diam %.4f deg' % (S_FILM / C, math.degrees(sun_ang_diam(R_FILM))))
