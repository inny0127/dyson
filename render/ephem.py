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


if __name__ == '__main__':
    for a in (0, -6, -9, -12, -18, -20):
        e = evening(2026, 8, 22, 43.7535, -110.7195, a)
        hh = int(e['local_hour']); mm = round((e['local_hour'] - hh) * 60)
        print(f"sun {a:4d}: {hh:02d}:{mm:02d} MDT  az {e['sun_az']:.1f}  lst {e['lst_deg']:.1f}")
