"""Low-precision Sun and sidereal time (Astronomical Almanac, ~0.01 deg), enough to place the Sun,
the stars and the Milky Way for a landscape photograph. Pure python; used inside Blender too."""
import math


def julian_day(y, mo, d, h=0.0):
    if mo <= 2:
        y, mo = y - 1, mo + 12
    a = y // 100
    b = 2 - a + a // 4
    return int(365.25 * (y + 4716)) + int(30.6001 * (mo + 1)) + d + b - 1524.5 + h / 24


def sun_radec(jd):
    n = jd - 2451545.0
    L = (280.460 + 0.9856474 * n) % 360
    g = math.radians((357.528 + 0.9856003 * n) % 360)
    lam = math.radians(L + 1.915 * math.sin(g) + 0.020 * math.sin(2 * g))
    eps = math.radians(23.439 - 4e-7 * n)
    ra = math.degrees(math.atan2(math.cos(eps) * math.sin(lam), math.cos(lam))) % 360
    dec = math.degrees(math.asin(math.sin(eps) * math.sin(lam)))
    return ra, dec


def sun_distance(jd):
    """Earth-Sun distance, AU."""
    g = math.radians((357.528 + 0.9856003 * (jd - 2451545.0)) % 360)
    return 1.00014 - 0.01671 * math.cos(g) - 0.00014 * math.cos(2 * g)


def lst(jd, lon_east):
    n = jd - 2451545.0
    return (280.46061837 + 360.98564736629 * n + lon_east) % 360


def altaz(ra, dec, lat, lst_deg):
    """Altitude and azimuth (from north through east), degrees."""
    H = math.radians(lst_deg - ra)
    d, p = math.radians(dec), math.radians(lat)
    alt = math.asin(math.sin(d) * math.sin(p) + math.cos(d) * math.cos(p) * math.cos(H))
    az = math.atan2(-math.cos(d) * math.sin(H), math.sin(d) * math.cos(p) - math.cos(d) * math.sin(p) * math.cos(H))
    return math.degrees(alt), math.degrees(az) % 360


def evening(y, mo, d, lat, lon, sun_alt, utc_offset=-6):
    """Local evening time when the Sun sinks to sun_alt (deg). Returns dict with jd, local hour,
    sun alt/az and local sidereal time."""
    best = None
    for k in range(12 * 60, 24 * 60 + 180):        # local 12:00 to 03:00
        h_local = k / 60
        jd = julian_day(y, mo, d, h_local - utc_offset)
        ra, dec = sun_radec(jd)
        s = lst(jd, lon)
        alt, az = altaz(ra, dec, lat, s)
        if best is not None and best[1] >= sun_alt > alt:
            return {'jd': jd, 'local_hour': h_local, 'sun_alt': alt, 'sun_az': az, 'lst_deg': s}
        best = (k, alt)
    jd = julian_day(y, mo, d, 24 - utc_offset)
    ra, dec = sun_radec(jd)
    s = lst(jd, lon)
    alt, az = altaz(ra, dec, lat, s)
    return {'jd': jd, 'local_hour': 24.0, 'sun_alt': alt, 'sun_az': az, 'lst_deg': s}


def moon_eq(jd):
    """Geocentric Moon, equatorial J2000-ish unit vector and distance (km). Astronomical Almanac
    low-precision series (~0.3 deg, ~0.2 % in distance)."""
    T = (jd - 2451545.0) / 36525
    d = math.radians
    lam = (218.32 + 481267.881 * T + 6.29 * math.sin(d(134.9 + 477198.85 * T))
           - 1.27 * math.sin(d(259.2 - 413335.38 * T)) + 0.66 * math.sin(d(235.7 + 890534.23 * T))
           + 0.21 * math.sin(d(269.9 + 954397.70 * T)) - 0.19 * math.sin(d(357.5 + 35999.05 * T))
           - 0.11 * math.sin(d(186.6 + 966404.05 * T)))
    bet = (5.13 * math.sin(d(93.3 + 483202.03 * T)) + 0.28 * math.sin(d(228.2 + 960400.87 * T))
           - 0.28 * math.sin(d(318.3 + 6003.18 * T)) - 0.17 * math.sin(d(217.6 - 407332.20 * T)))
    par = (0.9508 + 0.0518 * math.cos(d(134.9 + 477198.85 * T)) + 0.0095 * math.cos(d(259.2 - 413335.38 * T))
           + 0.0078 * math.cos(d(235.7 + 890534.23 * T)) + 0.0028 * math.cos(d(269.9 + 954397.70 * T)))
    dist = 6378.14 / math.sin(d(par))
    l, b = d(lam), d(bet)
    x, y, z = math.cos(b) * math.cos(l), math.cos(b) * math.sin(l), math.sin(b)
    eps = d(23.4393 - 0.0130 * T)
    return (x, y * math.cos(eps) - z * math.sin(eps), y * math.sin(eps) + z * math.cos(eps)), dist


# JPL "Approximate Positions of the Planets" (E. M. Standish), Table 1: J2000 elements and rates
# per century, a (AU), e, I, L, long. peri, long. node (deg). Within ~1 deg for Jupiter and Saturn
# a century outside 1800-2050; better for the inner planets.
ELEMENTS = {
    'Mercury': ((0.38709927, 0.20563593, 7.00497902, 252.25032350, 77.45779628, 48.33076593),
                (0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081)),
    'Venus': ((0.72333566, 0.00677672, 3.39467605, 181.97909950, 131.60246718, 76.67984255),
              (0.00000390, -0.00004107, -0.00078890, 58517.81538729, 0.00268329, -0.27769418)),
    'EM': ((1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0.0),
           (0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0.0)),
    'Mars': ((1.52371034, 0.09339410, 1.84969142, -4.55343205, -23.94362959, 49.55953891),
             (0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343)),
    'Jupiter': ((5.20288700, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909),
                (-0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106)),
    'Saturn': ((9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448),
               (-0.00125060, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794)),
}


def _helio(name, T):
    (a, e, I, L, wb, Om), (da, de, dI, dL, dwb, dOm) = ELEMENTS[name]
    a, e, I, L, wb, Om = a + da * T, e + de * T, I + dI * T, L + dL * T, wb + dwb * T, Om + dOm * T
    w = wb - Om
    M = math.radians((L - wb + 180) % 360 - 180)
    E = M + e * math.sin(M)
    for _ in range(8):
        E -= (E - e * math.sin(E) - M) / (1 - e * math.cos(E))
    xp, yp = a * (math.cos(E) - e), a * math.sqrt(1 - e * e) * math.sin(E)
    w, Om, I = math.radians(w), math.radians(Om), math.radians(I)
    x = (math.cos(w) * math.cos(Om) - math.sin(w) * math.sin(Om) * math.cos(I)) * xp + (-math.sin(w) * math.cos(Om) - math.cos(w) * math.sin(Om) * math.cos(I)) * yp
    y = (math.cos(w) * math.sin(Om) + math.sin(w) * math.cos(Om) * math.cos(I)) * xp + (-math.sin(w) * math.sin(Om) + math.cos(w) * math.cos(Om) * math.cos(I)) * yp
    z = math.sin(w) * math.sin(I) * xp + math.cos(w) * math.sin(I) * yp
    return x, y, z                                          # ecliptic J2000, AU


def planets(jd):
    """Geocentric planets: list of (name, equatorial unit vector, V magnitude, phase angle deg).
    Magnitudes: Mallama & Hilton 2018 phase laws (Saturn without its rings' tilt term)."""
    T = (jd - 2451545.0) / 36525
    ex, ey, ez = _helio('EM', T)
    eps = math.radians(23.4393)
    out = []
    for name in ('Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn'):
        px, py, pz = _helio(name, T)
        gx, gy, gz = px - ex, py - ey, pz - ez
        D = math.sqrt(gx * gx + gy * gy + gz * gz)
        r = math.sqrt(px * px + py * py + pz * pz)
        R = math.sqrt(ex * ex + ey * ey + ez * ez)
        alpha = math.degrees(math.acos(max(-1, min(1, (r * r + D * D - R * R) / (2 * r * D)))))
        k = 5 * math.log10(r * D)
        V = {'Mercury': -0.613 + 6.328e-2 * alpha - 1.6336e-3 * alpha ** 2 + 3.3644e-5 * alpha ** 3
                        - 3.4265e-7 * alpha ** 4 + 1.6893e-9 * alpha ** 5 - 3.0334e-12 * alpha ** 6,
             'Venus': -4.384 - 1.044e-3 * alpha + 3.687e-4 * alpha ** 2 - 2.814e-6 * alpha ** 3 + 8.938e-9 * alpha ** 4,
             'Mars': -1.601 + 2.267e-2 * alpha - 1.302e-4 * alpha ** 2,
             'Jupiter': -9.395 - 3.7e-4 * alpha + 6.16e-4 * alpha ** 2,
             'Saturn': -8.95 - 3.7e-4 * alpha + 6.16e-4 * alpha ** 2}[name] + k
        ux, uy, uz = gx / D, gy / D, gz / D
        out.append((name, (ux, uy * math.cos(eps) - uz * math.sin(eps), uy * math.sin(eps) + uz * math.cos(eps)), V, alpha))
    return out


# colour temperature standing in for each planet's reflected-sunlight colour (B-V 0.5-1.4)
PLANET_K = {'Mercury': 4700.0, 'Venus': 5400.0, 'Mars': 3600.0, 'Jupiter': 5000.0, 'Saturn': 4500.0}


if __name__ == '__main__':
    for a in (0, -6, -9, -12, -18, -20):
        e = evening(2026, 8, 22, 43.7535, -110.7195, a)
        hh = int(e['local_hour']); mm = round((e['local_hour'] - hh) * 60)
        print(f"sun {a:4d}: {hh:02d}:{mm:02d} MDT  az {e['sun_az']:.1f}  lst {e['lst_deg']:.1f}")
