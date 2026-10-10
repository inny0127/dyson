"""Process NASA Earth textures into render-friendly equirectangular maps.
Usage: python3 -I process_earth.py RAW_DIR OUT_DIR
All outputs: equirectangular (plate carree), lon -180 (left edge) .. +180 (right edge),
lat +90 (top row) .. -90 (bottom row), centred on the prime meridian.
"""
import sys, os, json
import numpy as np
from PIL import Image

Image.MAX_IMAGE_PIXELS = None
RAW, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)
info = {}


def save_jpg(im, name, q=90, sub=2):
    p = os.path.join(OUT, name)
    im.save(p, quality=q, subsampling=sub, optimize=True, progressive=False)
    info[name] = dict(size=im.size, mode=im.mode, bytes=os.path.getsize(p))
    print(name, im.size, im.mode, os.path.getsize(p) / 1e6, 'MB', flush=True)


# 1. Blue Marble Next Generation, July 2004 (no topography shading, no bathymetry)
im = Image.open(os.path.join(RAW, 'earth_bmng_july/world.200407.3x21600x10800.jpg'))
im.load()
day8 = im.resize((8192, 4096), Image.LANCZOS)
del im
save_jpg(day8, 'earth_day_8k.jpg', q=90)
day4 = day8.resize((4096, 2048), Image.LANCZOS)
save_jpg(day4, 'earth_day_4k.jpg', q=90)
del day8, day4

# 2. Black Marble 2016 lights only (grayscale), area-average downsample
im = Image.open(os.path.join(RAW, 'earth_blackmarble_gray/BlackMarble_2016_3km_gray.jpg'))
im.load()
n8 = im.resize((8192, 4096), Image.BOX)
save_jpg(n8, 'earth_night_lights_8k.jpg', q=92, sub=0)
del im, n8

# 3. Clouds (8192x4096 RGB tif, effectively grey) -> L
im = Image.open(os.path.join(RAW, 'earth_clouds/cloud_combined_8192.tif'))
a = np.asarray(im).astype(np.float32)
print('cloud channel diffs', np.abs(a[..., 0] - a[..., 1]).max(), np.abs(a[..., 0] - a[..., 2]).max())
g = Image.fromarray(np.clip(a.mean(-1) + 0.5, 0, 255).astype(np.uint8), 'L')
save_jpg(g, 'earth_clouds_8k.jpg', q=80, sub=0)
del a, g, im

# 4. Topography (8-bit relative elevation, 0 = sea level) and water mask from GEBCO bathymetry
im = Image.open(os.path.join(RAW, 'earth_topo/gebco_08_rev_elev_21600x10800.png'))
im.load()
t4 = im.resize((4096, 2048), Image.BOX)
p = os.path.join(OUT, 'earth_topo_4k.jpg'); t4.save(p, quality=90, optimize=True)
info['earth_topo_4k.jpg'] = dict(size=t4.size, mode=t4.mode, bytes=os.path.getsize(p))
print('topo', os.path.getsize(p) / 1e6)

im = Image.open(os.path.join(RAW, 'earth_bathy/gebco_08_rev_bath_21600x10800.png'))
im.load()
pal = im.getpalette()
idx = np.asarray(im)
lut = np.array(pal[0::3][:256]) if pal else np.arange(256)
grey = lut[idx]
print('bathy unique grey count', len(np.unique(grey[::50, ::50])), 'frac 255', (grey == 255).mean())
water = (grey < 255).astype(np.float32)
wm = Image.fromarray((water * 255).astype(np.uint8), 'L').resize((4096, 2048), Image.BOX)
p = os.path.join(OUT, 'earth_water_mask_4k.png'); wm.save(p, optimize=True)
info['earth_water_mask_4k.png'] = dict(size=wm.size, mode=wm.mode, bytes=os.path.getsize(p))
print('water frac', water.mean())
json.dump(info, open(os.path.join(OUT, '_earth_info.json'), 'w'), indent=1)
