"""HYG v4.4 -> stars.csv (ra_deg,dec_deg,vmag,bv), V <= 8.0, Sun excluded, sorted brightest first.
Usage: python3 -I make_stars.py hyg_v44.csv.gz OUT.csv
Missing B-V (about 0.3% of rows) is estimated from the spectral type (main-sequence intrinsic colours);
if no usable spectral type either, 0.65 is used. Counts are printed.
"""
import csv, gzip, sys, re

# approximate intrinsic B-V at subclass 0 for each class, and slope to the next class
BV0 = {'O': -0.32, 'B': -0.30, 'A': 0.00, 'F': 0.30, 'G': 0.58, 'K': 0.81, 'M': 1.40}
ORDER = 'OBAFGKM'
SPECIAL = {'C': 2.5, 'R': 1.7, 'N': 2.8, 'S': 1.7, 'W': -0.25, 'D': 0.0}


def bv_from_spect(sp):
    sp = (sp or '').strip()
    if not sp:
        return None
    m = re.match(r'([OBAFGKMCRNSWD])\s*(\d+(?:\.\d+)?)?', sp)
    if not m:
        return None
    c, sub = m.group(1), m.group(2)
    if c in SPECIAL:
        return SPECIAL[c]
    sub = float(sub) if sub else 5.0
    i = ORDER.index(c)
    lo = BV0[c]
    hi = BV0[ORDER[i + 1]] if i + 1 < len(ORDER) else 1.9
    return lo + (hi - lo) * min(sub, 9.9) / 10.0


rows = csv.DictReader(gzip.open(sys.argv[1], 'rt', encoding='utf-8'))
out = []
n_est = n_def = 0
for r in rows:
    if r['id'] == '0' or not r['mag']:
        continue
    v = float(r['mag'])
    if v > 8.0:
        continue
    ra = float(r['ra']) * 15.0  # hours -> degrees
    dec = float(r['dec'])
    ci = r['ci'].strip()
    if ci:
        bv = float(ci)
    else:
        bv = bv_from_spect(r['spect'])
        if bv is None:
            bv = 0.65; n_def += 1
        else:
            n_est += 1
    out.append((v, ra % 360.0, dec, bv))
out.sort()
with open(sys.argv[2], 'w', newline='') as f:
    w = csv.writer(f, lineterminator='\n')
    w.writerow(['ra_deg', 'dec_deg', 'vmag', 'bv'])
    for v, ra, dec, bv in out:
        w.writerow(['%.5f' % ra, '%.5f' % dec, '%.2f' % v, '%.3f' % bv])
print('stars', len(out), 'bv estimated from spectral type', n_est, 'bv defaulted', n_def,
      'vmag range', out[0][0], out[-1][0])
