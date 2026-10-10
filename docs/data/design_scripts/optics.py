"""Optical properties of the compute-sail faces, from tabulated n,k (refractiveindex.info database, CC0):
  Si: Green 2008 (0.25-1.45 um) + Chandler-Horowitz & Amirtharaj 2005 (2.5-22 um)
  SiO2 (fused silica): Malitson 1965 (visible), Franta et al. 25 C (0.03-125 um, IR reststrahlen)
  TiO2: Devore 1951 rutile (o), scaled x0.93 in (n-1) for an amorphous sputtered film
  Mg: Hagemann 1975; Al: Rakic 1995
1. Visible: front face = porous-silica AR / 20 um cover glass (incoherent) / TiO2 ARC / textured c-Si.
   Upright-pyramid texture -> two bounces at 54.74 and 15.79 deg incidence (glass-side). Output R(lambda),
   sRGB linear albedo under a 5772 K sun, specular glint reflectance of the top surface.
2. IR: hemispherical total emissivity at 348 K of candidate stacks (incoherent multilayer, s+p, angle-resolved),
   to check the eps_f = 0.85 / eps_b = 0.90 assumed by the architecture and size the emitter glass."""
import math, numpy as np, yaml
from common import *

def _tab(fname):
    d = yaml.safe_load(open(os.path.join(DL, fname)))
    for blk in d['DATA']:
        if blk['type'] == 'tabulated nk':
            a = np.array([[float(x) for x in l.split()] for l in blk['data'].strip().split('\n')])
            return a[:, 0], a[:, 1], a[:, 2]
    raise ValueError(fname)

# ---------------- optical constants (wavelength in um) ----------------
_si_l, _si_n, _si_k = _tab('main_Si_nk_Green-2008.yml')
def _si_ch_n(l):   # Chandler-Horowitz formula 4: n^2 = 11.67316 + 1/l^2 + 0.004482633/(l^2 - 1.108205^2)
    return np.sqrt(11.67316 + 1 / l ** 2 + 0.004482633 / (l ** 2 - 1.108205 ** 2))
_d = yaml.safe_load(open(os.path.join(DL, 'main_Si_nk_Chandler-Horowitz.yml')))
_kt = [b for b in _d['DATA'] if b['type'] == 'tabulated k'][0]
_a = np.array([[float(x) for x in l.split()] for l in _kt['data'].strip().split('\n')])
_sik_l, _sik_k = _a[:, 0], _a[:, 1]

def nk_Si(l, N_fc=0.0):
    """Intrinsic c-Si + optional free-carrier absorption (alpha_fc ~ 1e-18 N lambda^2 cm^-1, lambda in um)."""
    l = np.asarray(l, float)
    n = np.where(l <= 1.45, np.interp(l, _si_l, _si_n), np.where(l < 2.5, np.interp(l, [1.45, 2.5], [np.interp(1.45, _si_l, _si_n), _si_ch_n(2.5)]), _si_ch_n(np.maximum(l, 2.5))))
    k = np.where(l <= 1.45, np.interp(l, _si_l, _si_k), np.interp(l, _sik_l, _sik_k, left=0.0, right=_sik_k[-1]))
    if N_fc:
        a_cm = 1e-18 * N_fc * l ** 2
        k = k + a_cm * (l * 1e-4) / (4 * math.pi)
    return n + 1j * k

_fs_l, _fs_n, _fs_k = _tab('main_SiO2_nk_Franta-25C.yml')
def nk_SiO2(l):
    l = np.asarray(l, float)
    return np.interp(l, _fs_l, _fs_n) + 1j * np.interp(l, _fs_l, _fs_k)

def nk_TiO2(l):
    l = np.asarray(l, float)
    n_r = np.sqrt(5.913 + 0.2441 / (np.maximum(l, 0.43) ** 2 - 0.0803))
    return 1 + 0.93 * (n_r - 1) + 0j

_mg_l, _mg_n, _mg_k = _tab('main_Mg_nk_Hagemann.yml')
def nk_Mg(l):
    l = np.asarray(l, float)
    return np.interp(l, _mg_l, _mg_n) + 1j * np.interp(l, _mg_l, _mg_k)

_al_l, _al_n, _al_k = _tab('main_Al_nk_Rakic.yml')
def nk_Al(l):
    l = np.asarray(l, float)
    return np.interp(l, _al_l, _al_n) + 1j * np.interp(l, _al_l, _al_k)

# ---------------- coherent thin-film TMM (for AR coatings) ----------------
def tmm_R(n_list, d_list, l, theta0=0.0):
    """Reflectance (s,p averaged) of a coherent stack. n_list: [n_in, n1..., n_sub] (complex arrays over l),
    d_list: thicknesses (um) of the inner layers. Incident medium real."""
    l = np.asarray(l, float)
    n0 = np.real(n_list[0])
    s0 = n0 * np.sin(theta0)
    Rs_p = []
    for pol in ('s', 'p'):
        cos = [np.sqrt(1 - (s0 / n) ** 2 + 0j) for n in n_list]
        def eta(n, c):
            return n * c if pol == 's' else n / c
        M11 = np.ones_like(l, complex); M12 = np.zeros_like(l, complex); M21 = np.zeros_like(l, complex); M22 = np.ones_like(l, complex)
        for j, dj in enumerate(d_list, start=1):
            nj, cj = n_list[j], cos[j]
            dl = 2 * np.pi * nj * cj * dj / l
            ej = eta(nj, cj)
            a11, a12, a21, a22 = np.cos(dl), 1j * np.sin(dl) / ej, 1j * ej * np.sin(dl), np.cos(dl)
            M11, M12, M21, M22 = M11 * a11 + M12 * a21, M11 * a12 + M12 * a22, M21 * a11 + M22 * a21, M21 * a12 + M22 * a22
        e0, es = eta(n_list[0], cos[0]), eta(n_list[-1], cos[-1])
        B = M11 + M12 * es; Cc = M21 + M22 * es
        r = (e0 * B - Cc) / (e0 * B + Cc)
        Rs_p.append(np.abs(r) ** 2)
    return 0.5 * (Rs_p[0] + Rs_p[1]), Rs_p

# ---------------- colour ----------------
def _g(x, mu, s1, s2):
    s = np.where(x < mu, s1, s2)
    return np.exp(-0.5 * ((x - mu) / s) ** 2)

def cmf(lnm):   # Wyman, Sloan & Shirley 2013 multi-lobe fit to CIE 1931 2-deg
    x = 1.056 * _g(lnm, 599.8, 37.9, 31.0) + 0.362 * _g(lnm, 442.0, 16.0, 26.7) - 0.065 * _g(lnm, 501.1, 20.4, 26.2)
    y = 0.821 * _g(lnm, 568.8, 46.9, 40.5) + 0.286 * _g(lnm, 530.9, 16.3, 31.1)
    z = 1.217 * _g(lnm, 437.0, 11.8, 36.0) + 0.681 * _g(lnm, 459.0, 26.0, 13.8)
    return x, y, z

M_XYZ2RGB = np.array([[3.2406, -1.5372, -0.4986], [-0.9689, 1.8758, 0.0415], [0.0557, -0.2040, 1.0570]])

def planck_l(l_um, T):
    l = l_um * 1e-6
    return 2 * 6.62607015e-34 * C ** 2 / l ** 5 / np.expm1(6.62607015e-34 * C / (l * 1.380649e-23 * T))

LV = np.arange(380.0, 781.0, 2.0)

def rgb_of(R_lambda, T_illum=T_SUN):
    """Linear-sRGB albedo of reflectance spectrum R (on LV grid) under a blackbody illuminant, normalised so a
    perfect white reflector -> (1,1,1) (Blender's Sun lamp already carries the blackbody colour)."""
    E = planck_l(LV / 1000, T_illum)
    x, y, z = cmf(LV)
    def xyz(s):
        return np.array([np.trapezoid(s * E * x, LV), np.trapezoid(s * E * y, LV), np.trapezoid(s * E * z, LV)])
    w = M_XYZ2RGB @ xyz(np.ones_like(LV))
    c = M_XYZ2RGB @ xyz(R_lambda)
    Y = xyz(R_lambda)[1] / xyz(np.ones_like(LV))[1]
    return (c / w).tolist(), float(Y)

def srgb_encode(c):
    c = np.clip(np.asarray(c), 0, 1)
    return np.where(c <= 0.0031308, 12.92 * c, 1.055 * c ** (1 / 2.4) - 0.055).tolist()

def sun_rgb(T=T_SUN):
    E = planck_l(LV / 1000, T)
    x, y, z = cmf(LV)
    XYZ = np.array([np.trapezoid(E * x, LV), np.trapezoid(E * y, LV), np.trapezoid(E * z, LV)])
    rgb = M_XYZ2RGB @ XYZ
    rgb = rgb / rgb.max()
    xy = XYZ[:2] / XYZ.sum()
    return rgb.tolist(), xy.tolist()

# ---------------- visible front-face model ----------------
def front_visible(d_ar=0.110, n_ar=1.25, d_tio2=0.068, glass='SiO2'):
    l = LV / 1000.0
    n_air = np.ones_like(l) + 0j
    n_g = nk_SiO2(l)
    # (a) top surface: air / porous-silica AR / glass (thick)
    R_top, _ = tmm_R([n_air, n_air * 0 + n_ar, n_g], [d_ar], l)
    R_top_bare, _ = tmm_R([n_air, n_g], [], l)
    # (b) glass / TiO2 / Si at the two pyramid incidences (angles in glass)
    nT, nS = nk_TiO2(l), nk_Si(l)
    R1, _ = tmm_R([n_g, nT, nS], [d_tio2], l, math.radians(54.74))
    R2, _ = tmm_R([n_g, nT, nS], [d_tio2], l, math.radians(15.79))
    R_flat, _ = tmm_R([n_g, nT, nS], [d_tio2], l, 0.0)
    R_tex = R1 * R2                       # double bounce (ray-optics estimate; ~11 % triple bounce ignored -> upper bound)
    # light leaving the texture travels at ~38.9 deg in glass; Fresnel at the glass/AR/air top surface from inside
    R_top_in, _ = tmm_R([np.real(n_g) + 0j, n_air * 0 + n_ar, n_air], [d_ar], l, math.radians(38.9))
    T_top = 1 - R_top
    T_out = 1 - R_top_in
    # incoherent sum, one internal re-bounce
    R_scat = T_top * R_tex * T_out / (1 - R_top_in * R_tex)
    exit_angle_air = math.degrees(math.asin(min(1.0, float(np.real(nk_SiO2(0.55))) * math.sin(math.radians(38.9)))))
    return dict(l=l, R_top=R_top, R_top_bare=R_top_bare, R_flat=R_flat, R_tex=R_tex, R_scat=R_scat,
                R_total=R_top + R_scat, exit_angle_air_deg=exit_angle_air)

# ---------------- incoherent multilayer, IR ----------------
def fresnel(n1, n2, c1):
    """Power reflectance s,p at interface n1->n2 for cos(theta1)=c1 (complex-safe)."""
    s1 = np.sqrt(1 - c1 ** 2 + 0j)
    s2 = n1 * s1 / n2
    c2 = np.sqrt(1 - s2 ** 2 + 0j)
    rs = (n1 * c1 - n2 * c2) / (n1 * c1 + n2 * c2)
    rp = (n2 * c1 - n1 * c2) / (n2 * c1 + n1 * c2)
    return np.abs(rs) ** 2, np.abs(rp) ** 2, c2

def incoh_stack_A(layers, l_um, theta, n_out=1.0):
    """layers: list of (nk_function, thickness_um) from the illuminated side inward; last layer may be
    thickness None = opaque substrate. Exit medium (if not opaque): vacuum. Returns absorptance (= directional
    emissivity) averaged over s,p, and R, T. Incoherent: intensities only (layers >> coherence length or rough)."""
    out = []
    for pol in (0, 1):
        n_prev = np.ones_like(l_um) + 0j
        c_prev = np.cos(theta) * np.ones_like(l_um) + 0j
        Rs, Ts, taus, Rbs = [], [], [], []
        ns = [f(l_um) for f, _ in layers]
        ds = [d for _, d in layers]
        if ds[-1] is not None:
            ns.append(np.ones_like(l_um) * n_out + 0j); ds.append(None)
        # interfaces
        for j, n in enumerate(ns):
            rs, rp, c2 = fresnel(n_prev, n, c_prev)
            R = rs if pol == 0 else rp
            Rs.append(R)
            if ds[j] is not None:
                a = 4 * np.pi * np.imag(n) / l_um             # per um
                cr = np.real(c2) if np.all(np.real(c2) > 0.05) else np.maximum(np.real(c2), 0.05)
                taus.append(np.exp(-a * ds[j] / cr))
            n_prev, c_prev = n, c2
        # recursion from the bottom: effective reflectance seen from inside layer j looking down
        R_eff = Rs[-1]                       # last interface (into opaque substrate or vacuum)
        T_eff = 1 - Rs[-1] if ds[-1] is None and len(ns) > len(layers) else None
        transmit_vac = (len(ns) > len(layers))
        T_below = (1 - Rs[-1]) if transmit_vac else np.zeros_like(l_um)
        for j in range(len(taus) - 1, -1, -1):
            Rj = Rs[j]
            tau = taus[j]
            denom = 1 - Rj * tau ** 2 * R_eff        # Rj from below ~ Rj (reciprocity, small k)
            R_new = Rj + (1 - Rj) ** 2 * tau ** 2 * R_eff / denom
            T_below = (1 - Rj) * tau * T_below / denom
            R_eff = R_new
        A = 1 - R_eff - T_below
        out.append((A, R_eff, T_below))
    A = 0.5 * (out[0][0] + out[1][0]); R = 0.5 * (out[0][1] + out[1][1]); T = 0.5 * (out[0][2] + out[1][2])
    return A, R, T

L_IR = np.geomspace(1.5, 60.0, 500)

def hemi_total_eps(layers, T=348.15, nth=24):
    th = np.linspace(0, math.radians(89), nth)
    eps_th = []
    for t in th:
        A, R, Tr = incoh_stack_A(layers, L_IR, t)
        eps_th.append(A)
    eps_th = np.array(eps_th)
    w = np.cos(th) * np.sin(th)
    eps_h = np.trapezoid(eps_th * w[:, None], th, axis=0) / np.trapezoid(w, th)
    B = planck_l(L_IR, T)
    tot = np.trapezoid(eps_h * B, L_IR) / np.trapezoid(B, L_IR)
    # fraction of blackbody power beyond 60 um at 348 K (assumed emitted with eps at 60 um)
    return float(tot), eps_h, float(np.trapezoid(eps_th[0] * B, L_IR) / np.trapezoid(B, L_IR))

if __name__ == '__main__':
    OUT = {}
    # ---- sun colour
    rgb, xy = sun_rgb()
    OUT['sun'] = dict(T_K=T_SUN, linear_sRGB_normalised=rgb, srgb_8bit=[round(255 * v) for v in srgb_encode(rgb)], CIE_xy=xy,
                      note='5772 K blackbody in linear sRGB (D65 white), max channel = 1. Use Blender Blackbody 5772 K on the Sun lamp.')
    print('sun rgb', np.round(rgb, 3), 'xy', np.round(xy, 4))

    # ---- front face, visible
    best = None
    for d_ar in (0.0, 0.100, 0.110, 0.120):
        for d_t in (0.055, 0.060, 0.065, 0.068, 0.072, 0.080):
            fv = front_visible(d_ar=d_ar if d_ar else 1e-6, d_tio2=d_t)
            E = planck_l(fv['l'], T_SUN)
            Rw = float(np.trapezoid(fv['R_total'] * E, fv['l']) / np.trapezoid(E, fv['l']))
            if d_ar and (best is None or Rw < best[0]):
                best = (Rw, d_ar, d_t)
    Rw, d_ar, d_t = best
    fv = front_visible(d_ar=d_ar, d_tio2=d_t)
    fv0 = front_visible(d_ar=1e-6, d_tio2=d_t)
    rgb_scat, Y_scat = rgb_of(fv['R_scat'])
    rgb_top, Y_top = rgb_of(fv['R_top'])
    rgb_tot, Y_tot = rgb_of(fv['R_total'])
    rgb_bare_top, Y_bare_top = rgb_of(fv0['R_top'])
    # AM0-weighted solar reflectance 0.3-1.2 um (absorptance check vs alpha = 0.90 assumed)
    l2 = np.linspace(0.30, 1.20, 451)
    def Rfull(l2, d_ar, d_t):
        n_air = np.ones_like(l2) + 0j; n_g = nk_SiO2(l2)
        Rt, _ = tmm_R([n_air, n_air * 0 + 1.25, n_g], [d_ar], l2)
        R1, _ = tmm_R([n_g, nk_TiO2(l2), nk_Si(l2)], [d_t], l2, math.radians(54.74))
        R2, _ = tmm_R([n_g, nk_TiO2(l2), nk_Si(l2)], [d_t], l2, math.radians(15.79))
        Rin, _ = tmm_R([np.real(n_g) + 0j, n_air * 0 + 1.25, n_air], [d_ar], l2, math.radians(38.9))
        return Rt + (1 - Rt) * R1 * R2 * (1 - Rin) / (1 - Rin * R1 * R2)
    E2 = planck_l(l2, T_SUN)
    R_solar_03_12 = float(np.trapezoid(Rfull(l2, d_ar, d_t) * E2, l2) / np.trapezoid(E2, l2))
    frac_beyond_12 = float(1 - np.trapezoid(E2, l2) / (SIGMA * T_SUN ** 4 / np.pi * 1e-6) )  # approx check only
    OUT['front_visible'] = dict(
        stack='vacuum | porous-SiO2 AR n=1.25, %.0f nm | fused-silica-like cover glass 20 um | TiO2 ARC %.0f nm | textured c-Si (upright pyramids)' % (d_ar * 1e3, d_t * 1e3),
        weighted_R_visible_total=Rw,
        R_top_specular_luminous=Y_top, R_top_specular_bare_glass_luminous=Y_bare_top,
        R_texture_scattered_luminous=Y_scat, R_total_luminous=Y_tot,
        linear_sRGB_scattered=rgb_scat, linear_sRGB_top_specular=rgb_top, linear_sRGB_total=rgb_tot,
        srgb8_scattered_x10=[round(255 * v) for v in srgb_encode(np.array(rgb_scat) * 10)],
        texture_exit_angle_deg_from_normal=fv['exit_angle_air_deg'],
        solar_R_0p3_1p2um=R_solar_03_12,
        spectrum_nm=LV.tolist()[::10], R_total_spectrum=fv['R_total'][::10].tolist(), R_scat_spectrum=fv['R_scat'][::10].tolist(),
        R_top_spectrum=fv['R_top'][::10].tolist(),
        note='Specular glint comes only from the flat top surface (mirror image of the Sun). Light reflected by the '
             'pyramids leaves in 4 lobes ~%.0f deg off the normal (upright-pyramid double bounce), i.e. it is NOT seen '
             'from the Sun direction; to a renderer it acts as a weak, dark-blue, strongly forward/side-scattering '
             'lobe. Using a diffuse base of the scattered albedo is an acceptable approximation beyond ~10 m.' % fv['exit_angle_air_deg'])
    print('front: AR %.0f nm, TiO2 %.0f nm, weighted R %.4f; top spec Y %.4f (bare %.4f); scattered Y %.4f rgb %s; solar R(0.3-1.2) %.3f; exit %.1f deg' % (
        d_ar * 1e3, d_t * 1e3, Rw, Y_top, Y_bare_top, Y_scat, np.round(rgb_scat, 4), R_solar_03_12, fv['exit_angle_air_deg']))

    # ---- IR emissivity of candidate stacks (hemispherical, total at 348 K)
    Mg = (nk_Mg, None)
    def glass(d):
        return (nk_SiO2, d)
    si = lambda d: (lambda l: nk_Si(l, 1e15), d)
    si_doped = lambda d: (lambda l: nk_Si(l, 5e19), d)
    cases = {
        'A_front: glass20 | Si30 | Mg (opaque)': [glass(20), si(30), Mg],
        'A_back: enamel5 | Mg': [glass(5), Mg],
        'A_back: enamel10 | Mg': [glass(10), Mg],
        'A_back: enamel20 | Mg': [glass(20), Mg],
        'A_back: enamel40 | Mg': [glass(40), Mg],
        'C_front: glass20 | Si45 | doped1 | Mg contact(opaque)': [glass(20), si(45), si_doped(1), Mg],
        'C_front: glass20 | Si45 | doped1 | enamel5 (no metal, 30 % of back)': [glass(20), si(45), si_doped(1), glass(5)],
        'C_back: enamel5 | doped1 | Si45 | glass20 (no metal, 30 % of back)': [glass(5), si_doped(1), si(45), glass(20)],
        'glass10 front over Si30|Mg': [glass(10), si(30), Mg],
        'glass40 front over Si30|Mg': [glass(40), si(30), Mg],
    }
    ir = {}
    for name, layers in cases.items():
        tot, eps_h, eps_n = hemi_total_eps(layers)
        ir[name] = dict(eps_hemi_total_348K=tot, eps_normal_total_348K=eps_n)
        print('IR %-70s eps_h %.3f  eps_n %.3f' % (name, tot, eps_n))
    OUT['ir_emissivity'] = dict(cases=ir, model='incoherent multilayer, Fresnel s/p, hemispherical, Planck-weighted 1.5-60 um at 348 K; '
                                'fused silica (Franta 25C) used for every glass: pure SiO2 has the deepest reststrahlen gap, so real '
                                'Mg/Ca/Fe-silicate enamels with broader bands give HIGHER emissivity (this is a conservative floor).',
                                assumed_by_architecture=dict(eps_f=0.85, eps_b=0.90))
    dump(OUT, 'optics.json')

    # ---- realistic texture imperfection, glint colour, solar absorptance, emitter thickness scan
    OUT2 = {}
    for f_flat in (0.0, 0.05, 0.10):
        Rimp = fv['R_top'] + (1 - fv['R_top']) * ((1 - f_flat) * fv['R_tex'] + f_flat * fv['R_flat']) * 0.92
        rgbi, Yi = rgb_of(Rimp)
        OUT2['flat_fraction_%.2f' % f_flat] = dict(R_luminous=Yi, linear_sRGB=rgbi)
        print('front with %.0f %% flat texture: Y %.4f rgb %s' % (100 * f_flat, Yi, np.round(rgbi, 4)))
    rgb_flat, Y_flat = rgb_of(fv['R_flat'] * 0.92)
    OUT2['R_flat_under_glass_luminous'] = Y_flat
    OUT2['glint_top_surface_linear_sRGB_rel'] = (np.array(rgb_top) / max(rgb_top)).tolist()
    OUT2['glint_top_surface_luminous'] = Y_top
    print('glint colour (top AR surface) rgb rel', np.round(np.array(rgb_top) / max(rgb_top), 3), 'Y', round(Y_top, 4))
    # solar absorptance: <1.1 um: 1 - R_front (all transmitted light absorbed in textured Si);
    # >1.1 um: flat incoherent stack (lower bound: texture light-trapping raises free-carrier absorption)
    lA = np.linspace(0.30, 1.10, 401)
    EA = planck_l(lA, T_SUN)
    A_vis = 1 - Rfull(lA, d_ar, d_t)
    lB = np.geomspace(1.10, 20.0, 300)
    EB = planck_l(lB, T_SUN)
    AB_list = []
    for name, layers in (('A Si30|Mg', [glass(20), si(30), si_doped(1), Mg]), ('C Si45|Mg', [glass(20), si(45), si_doped(1), Mg])):
        AB, RB, TB = incoh_stack_A(layers, lB, 0.0)
        tot = (np.trapezoid(A_vis * EA, lA) + np.trapezoid(AB * EB, lB)) / (np.trapezoid(EA, lA) + np.trapezoid(EB, lB))
        frac_sub = np.trapezoid(EB, lB) / (np.trapezoid(EA, lA) + np.trapezoid(EB, lB))
        sub = np.trapezoid(AB * EB, lB) / np.trapezoid(EB, lB)
        AB_list.append(dict(stack=name, alpha_solar_flat_rear=float(tot), sub_bandgap_energy_fraction=float(frac_sub), sub_bandgap_absorptance_flat=float(sub)))
        print('solar absorptance %s: %.3f (sub-gap fraction %.3f absorbed %.3f)' % (name, tot, frac_sub, sub))
    OUT2['solar_absorptance'] = dict(cases=AB_list, note='flat-rear lower bound; textured c-Si cells with metal rear typically absorb 30-70 % of sub-gap light '
                                     '(free carriers + rear metal with light trapping), giving alpha 0.85-0.92. Architecture value 0.90 kept.')
    scan = {}
    for d in (5, 10, 20, 40, 80, 150):
        scan['enamel_%dum_on_Mg' % d] = hemi_total_eps([glass(d), Mg])[0]
        scan['cover_%dum_on_Si30_Mg' % d] = hemi_total_eps([glass(d), si(30), Mg])[0]
    OUT2['emissivity_vs_glass_thickness_fused_silica'] = scan
    print('scan', {k: round(v, 3) for k, v in scan.items()})
    # placement consequence if the faces only reach the conservative values
    def placement(eps_f, eps_b, alpha):
        p = dict(PV, eps_f=eps_f, eps_b=eps_b, alpha=alpha)
        r = film_rmin(T_SHEET, F_REF, p)
        st = film_state(flux(r), F_REF, p)
        return dict(eps_f=eps_f, eps_b=eps_b, alpha=alpha, r_AU=r, q_e=st['q_e'])
    OUT2['placement_sensitivity'] = [placement(0.85, 0.90, 0.90), placement(0.76, 0.61, 0.90), placement(0.76, 0.61, AB_list[0]['alpha_solar_flat_rear']),
                                     placement(0.80, 0.85, 0.90), placement(0.76, 0.79, 0.90)]
    for row in OUT2['placement_sensitivity']:
        print('placement', {k: round(v, 4) for k, v in row.items()})
    OUT['front_visible_extra'] = OUT2
    dump(OUT, 'optics.json')
