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


if __name__ == '__main__':
    for a in (0, -6, -9, -12, -18, -20):
        e = evening(2026, 8, 22, 43.7535, -110.7195, a)
        hh = int(e['local_hour']); mm = round((e['local_hour'] - hh) * 60)
        print(f"sun {a:4d}: {hh:02d}:{mm:02d} MDT  az {e['sun_az']:.1f}  lst {e['lst_deg']:.1f}")
