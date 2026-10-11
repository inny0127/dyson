"""Physically based sky radiance for twilight and night: Earth's atmosphere lit by distant sources.

Method: Hillaire 2020, "A Scalable and Production Ready Sky and Atmosphere Rendering Technique"
(EGSR). Rayleigh and Mie scattering, ozone absorption, Earth's shadow, and multiple scattering through
the isotropic second-order lookup table. Earth's atmosphere as in the paper, with the RGB channels at
sRGB-effective wavelengths (below). Blender's own Nishita sky is single scattering only: it renders civil twilight ~6x and
nautical twilight ~160x too dark and paints deep twilight orange, where the real sky is blue.

Any set of distant sources can light the atmosphere: the Sun below the horizon, the Moon, or each
patch of a swarm's glow (an extended source is a sum of point sources).

Units: radiance per unit source irradiance (1/sr) per sRGB channel; multiply by the source irradiance in
the repo's W/m^2 convention. Runs with system python (numpy + scipy).
"""
import math
import numpy as np
from scipy.ndimage import map_coordinates

RG = 6360e3                      # ground radius, m
RT = 6460e3                      # top of the atmosphere
# Coefficients at sRGB-effective wavelengths (615, 550, 465 nm) rather than the paper's spectral
# samples (680, 550, 440 nm), so an RGB render matches what a camera's sRGB output records. Rayleigh
# scales as lambda^-4 from the paper's 550 nm value; ozone follows the Chappuis band cross-sections
# (~5.0, 3.3, 0.45 x 1e-21 cm^2), which absorbs red more than green: deep twilight is blue, not
# the magenta the 680/550/440 set gives.
B_R = np.array([8.67, 13.558, 26.5]) * 1e-6     # Rayleigh scattering, 1/m
H_R = 8000.0
B_MS = 3.996e-6                  # Mie scattering
B_ME = 4.40e-6                   # Mie extinction
H_M = 1200.0
G_M = 0.8
B_O = np.array([2.85, 1.881, 0.256]) * 1e-6     # ozone absorption
ALBEDO = 0.15                    # ground, for multiple scattering
H_TOP = math.sqrt(RT ** 2 - RG ** 2)


def densities(h):
    h = np.maximum(h, 0.0)
    return np.exp(-h / H_R), np.exp(-h / H_M), np.maximum(0.0, 1 - np.abs(h - 25e3) / 15e3)


def extinction(h):
    r, m, o = densities(h)
    return B_R * r[..., None] + B_ME * m[..., None] + B_O * o[..., None]


def dist_top(r, mu):
    return -r * mu + np.sqrt(np.maximum(r * r * (mu * mu - 1) + RT * RT, 0.0))


def hits_ground(r, mu):
    return (mu < 0) & (r * r * (mu * mu - 1) + RG * RG >= 0)


class Atmosphere:
    def __init__(self, n_r=64, n_mu=256, ms=32):
        self._trans_lut(n_r, n_mu)
        self._ms_lut(ms)

    # --- transmittance to the top of the atmosphere (Bruneton parameterisation) -------------
    def _trans_lut(self, nr, nmu, steps=400):
        xr = (np.arange(nr) + 0.5) / nr
        xm = (np.arange(nmu) + 0.5) / nmu
        rho = H_TOP * xr[:, None]
        r = np.sqrt(rho ** 2 + RG ** 2)
        dmin, dmax = RT - r, rho + H_TOP
        d = dmin + xm[None, :] * (dmax - dmin)
        mu = np.where(d > 0, (H_TOP ** 2 - rho ** 2 - d ** 2) / (2 * r * d), 1.0)
        od = np.zeros((nr, nmu, 3))
        for k in range(steps):
            t = d * (k + 0.5) / steps
            h = np.sqrt(r * r + t * t + 2 * r * mu * t) - RG
            od += extinction(h) * (d / steps)[..., None]
        self.T = np.exp(-od)
        self.nr, self.nmu = nr, nmu

    def transmittance(self, r, mu):
        """Transmittance from radius r along cos-zenith mu to space; 0 if the ray hits the ground."""
        r = np.clip(r, RG + 1.0, RT)
        rho = np.sqrt(np.maximum(r * r - RG * RG, 0))
        d = dist_top(r, mu)
        dmin, dmax = RT - r, rho + H_TOP
        xm = np.clip((d - dmin) / np.maximum(dmax - dmin, 1e-9), 0, 1)
        xr = rho / H_TOP
        coords = np.stack([xr.ravel() * self.nr - 0.5, xm.ravel() * self.nmu - 0.5])
        out = np.stack([map_coordinates(self.T[..., c], coords, order=1, mode='nearest') for c in range(3)], -1)
        out = out.reshape(r.shape + (3,))
        return np.where(hits_ground(r, mu)[..., None], 0.0, out)

    # --- multiple scattering (Hillaire's isotropic 2nd-order LUT) ----------------------------
    def _ms_lut(self, n, n_dir=64, steps=40):
        mus = np.linspace(-1, 1, n)
        hs = np.linspace(0, RT - RG, n)
        # Fibonacci sphere of directions
        k = np.arange(n_dir) + 0.5
        z = 1 - 2 * k / n_dir
        phi = math.pi * (1 + 5 ** 0.5) * k
        dirs = np.stack([np.sqrt(1 - z * z) * np.cos(phi), np.sqrt(1 - z * z) * np.sin(phi), z], -1)
        psi = np.zeros((n, n, 3))
        pu = 1 / (4 * math.pi)
        for i, h in enumerate(hs):
            r0 = RG + h + 1.0
            P = np.array([0, 0, r0])
            mu_v = dirs[:, 2]
            ground = hits_ground(np.full(n_dir, r0), mu_v)
            tg = -r0 * mu_v - np.sqrt(np.maximum(r0 * r0 * (mu_v * mu_v - 1) + RG * RG, 0))
            tmax = np.where(ground, tg, dist_top(np.full(n_dir, r0), mu_v))
            for j, mu_s in enumerate(mus):
                s = np.array([math.sqrt(max(0.0, 1 - mu_s * mu_s)), 0, mu_s])
                L2 = np.zeros((n_dir, 3))
                F = np.zeros((n_dir, 3))
                Tv = np.ones((n_dir, 3))
                dt = tmax / steps
                for q in range(steps):
                    t = (q + 0.5) * dt
                    X = P + dirs * t[:, None]
                    rx = np.linalg.norm(X, axis=1)
                    up = X / rx[:, None]
                    hx = rx - RG
                    dr, dm, do = densities(hx)
                    ss = B_R * dr[:, None] + B_MS * dm[:, None]
                    ext = B_R * dr[:, None] + B_ME * dm[:, None] + B_O * do[:, None]
                    Ts = self.transmittance(rx, up @ s)
                    step_T = np.exp(-ext * dt[:, None])
                    integ = (1 - step_T) / np.maximum(ext, 1e-12)
                    L2 += Tv * ss * Ts * pu * integ
                    F += Tv * ss * integ
                    Tv *= step_T
                # ground bounce
                Xg = P + dirs * tmax[:, None]
                rg = np.linalg.norm(Xg, axis=1)
                ug = Xg / rg[:, None]
                Tg = self.transmittance(rg, ug @ s)
                L2 += np.where(ground[:, None], Tv * Tg * np.maximum(ug @ s, 0)[:, None] * ALBEDO / math.pi, 0)
                L2m = L2.mean(0)
                fms = F.mean(0)          # (4 pi / N) sum L_f p_u, with p_u = 1 / 4 pi
                psi[i, j] = L2m / (1 - fms)
        self.psi = psi
        self.ms_n = n

    def multiple(self, h, mu_s):
        n = self.ms_n
        coords = np.stack([np.clip(h / (RT - RG), 0, 1).ravel() * (n - 1), ((mu_s.ravel() + 1) / 2) * (n - 1)])
        out = np.stack([map_coordinates(self.psi[..., c], coords, order=1, mode='nearest') for c in range(3)], -1)
        return out.reshape(h.shape + (3,))

    # --- sky radiance ------------------------------------------------------------------------
    def sky(self, dirs, sources, h_cam=2070.0, steps=64, chunk=20000):
        """Radiance arriving at an observer h_cam above the ground from each direction in `dirs`
        (N x 3, +Z up), lit by `sources` = [(unit direction toward source, RGB irradiance W/m^2)].
        Returns (radiance N x 3, transmittance to space N x 3)."""
        out = np.zeros((len(dirs), 3))
        trans = np.zeros((len(dirs), 3))
        r0 = RG + h_cam
        P = np.array([0, 0, r0])
        src = [(np.asarray(s, float) / np.linalg.norm(s), np.asarray(E, float)) for s, E in sources]
        for a in range(0, len(dirs), chunk):
            D = dirs[a:a + chunk]
            n = len(D)
            mu_v = D[:, 2]
            ground = hits_ground(np.full(n, r0), mu_v)
            tg = -r0 * mu_v - np.sqrt(np.maximum(r0 * r0 * (mu_v * mu_v - 1) + RG * RG, 0))
            tmax = np.where(ground, tg, dist_top(np.full(n, r0), mu_v))
            L = np.zeros((n, 3))
            Tv = np.ones((n, 3))
            # quadratic spacing: dense near the observer, still reaching the upper atmosphere
            edges = (np.arange(steps + 1) / steps) ** 2
            for q in range(steps):
                t0, t1 = tmax * edges[q], tmax * edges[q + 1]
                dt = t1 - t0
                t = 0.5 * (t0 + t1)
                X = P + D * t[:, None]
                rx = np.linalg.norm(X, axis=1)
                up = X / rx[:, None]
                hx = rx - RG
                dr, dm, do = densities(hx)
                sR = B_R * dr[:, None]
                sM = B_MS * dm[:, None]
                ext = sR + B_ME * dm[:, None] + B_O * do[:, None]
                step_T = np.exp(-ext * dt[:, None])
                integ = (1 - step_T) / np.maximum(ext, 1e-12)
                S = np.zeros((n, 3))
                for s, E in src:
                    mu_s = up @ s
                    c = D @ s
                    pR = 3 / (16 * math.pi) * (1 + c * c)
                    pM = 3 / (8 * math.pi) * (1 - G_M ** 2) * (1 + c * c) / ((2 + G_M ** 2) * (1 + G_M ** 2 - 2 * G_M * c) ** 1.5)
                    Ts = self.transmittance(rx, mu_s)
                    S += E * (Ts * (sR * pR[:, None] + sM * pM[:, None]) + (sR + sM) * self.multiple(hx, mu_s))
                L += Tv * S * integ
                Tv *= step_T
            out[a:a + chunk] = L
            trans[a:a + chunk] = np.where(ground[:, None], 0.0, Tv)
        return out, trans


def equirect_dirs(w, h):
    """Directions for an equirectangular map in Blender's convention (u = 0.5 - atan2(y, x) / 2pi,
    v from the bottom = 0.5 + asin(z) / pi); row 0 is the bottom (Blender pixel order)."""
    u = (np.arange(w) + 0.5) / w
    v = (np.arange(h) + 0.5) / h
    lon = (0.5 - u) * 2 * math.pi
    lat = (v - 0.5) * math.pi
    LON, LAT = np.meshgrid(lon, lat)
    return np.stack([np.cos(LAT) * np.cos(LON), np.cos(LAT) * np.sin(LON), np.sin(LAT)], -1).reshape(-1, 3)


def horizontal_illuminance(L, w, h):
    """Irradiance on a level surface from an equirect radiance map (rows from the bottom)."""
    v = (np.arange(h) + 0.5) / h
    lat = (v - 0.5) * math.pi
    dO = (2 * math.pi / w) * (math.pi / h) * np.cos(lat)
    img = L.reshape(h, w, 3)
    wgt = (np.maximum(np.sin(lat), 0) * dO)[:, None, None]
    return (img * wgt).sum((0, 1))


SUN_RGB = np.array([1.0, 0.8791, 0.8211])        # 5772 K in linear sRGB (design_spec scene facts)
LUMA = np.array([0.2126, 0.7152, 0.0722])
LM_PER_W = 93.0


def sun_irradiance_rgb(E=1361.0, colour=SUN_RGB):
    """RGB irradiance whose luminance channel equals E (repo convention)."""
    return E * colour / (colour @ LUMA)


if __name__ == '__main__':
    import time
    t0 = time.time()
    atm = Atmosphere()
    print('LUTs %.1fs' % (time.time() - t0))
    w, h = 256, 128
    dirs = equirect_dirs(w, h)
    Esun = sun_irradiance_rgb()
    # measured clear-sky twilight illuminance (lux), e.g. Rozenberg 1966; Bond & Henderson 1963
    ref = {0: 400, -2: 120, -4: 20, -6: 3.0, -8: 0.4, -10: 0.06, -12: 0.008, -14: 0.002}
    for e in sorted(ref, reverse=True):
        s = np.array([0, math.cos(math.radians(e)), math.sin(math.radians(e))])
        L, _ = atm.sky(dirs, [(s, Esun)], steps=48)
        Eh = horizontal_illuminance(L, w, h)
        zen = L.reshape(h, w, 3)[-1].mean(0)
        print(f'sun {e:4d}: {Eh @ LUMA * LM_PER_W:9.4g} lux (measured ~{ref[e]})  zenith {zen @ LUMA * LM_PER_W:.3g} cd/m2  colour {np.round(zen / zen.max(), 3)}  {time.time() - t0:.0f}s')
