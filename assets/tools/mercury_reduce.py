"""Area-average reduce the big Mercury rasters to 8192x4096 float32 .npy (nodata-aware).
Usage: python3 -I mercury_reduce.py RAW_DIR WORK_DIR
Outputs (WORK_DIR): loi_8k.npy (DN float, NaN = no data), md3_8k.npy (3,H,W) DN float NaN=no data,
                    dem_8k.npy (metres, float32)
All rasters are simple cylindrical, lon -180..180 left->right (centre 0), lat +90 top.
"""
import sys, os, numpy as np, tifffile
from PIL import Image

RAW, WORK = sys.argv[1], sys.argv[2]
OW, OH = 8192, 4096


def reduce_plane(arr, nodata, strip_in, strip_out, name):
    """arr: 2-D (H, W) array-like (memmap ok). Returns (OH, OW) float32 area mean ignoring nodata."""
    H, W = arr.shape
    out = np.full((OH, OW), np.nan, np.float32)
    for s in range(0, H, strip_in):
        blk = np.asarray(arr[s:s + strip_in], dtype=np.float32)
        valid = (blk != nodata).astype(np.float32) if nodata is not None else np.ones_like(blk)
        blk = blk * valid
        oh = strip_out
        sm = np.asarray(Image.fromarray(blk, 'F').resize((OW, oh), Image.BOX))
        cn = np.asarray(Image.fromarray(valid, 'F').resize((OW, oh), Image.BOX))
        o = s // strip_in * strip_out
        with np.errstate(invalid='ignore', divide='ignore'):
            out[o:o + oh] = np.where(cn > 0.25, sm / np.maximum(cn, 1e-6), np.nan)
        if (s // strip_in) % 8 == 0:
            print(name, s, '/', H, flush=True)
    return out


# LOI 166 m (92160 x 46080, uint8, 0 = no data). 11.25 src px per output px; 720 rows -> 64 rows
p = os.path.join(RAW, 'mercury_loi/Mercury_MESSENGER_MDIS_Basemap_LOI_Mosaic_Global_166m.tif')
if not os.path.exists(os.path.join(WORK, 'loi_8k.npy')):
    loi = tifffile.memmap(p)
    print('loi', loi.shape, loi.dtype)
    np.save(os.path.join(WORK, 'loi_8k.npy'), reduce_plane(loi, 0, 720, 64, 'loi'))
    del loi

# MD3 colour 665 m (3, 11520, 23040) uint8 planar, 0 = no data. 2.8125 ratio; 180 rows -> 64 rows
p = os.path.join(RAW, 'mercury_md3/Mercury_MESSENGER_MDIS_Basemap_MD3Color_Mosaic_Global_665m.tif')
if not os.path.exists(os.path.join(WORK, 'md3_8k.npy')):
    md3 = tifffile.memmap(p)
    print('md3', md3.shape, md3.dtype)
    np.save(os.path.join(WORK, 'md3_8k.npy'),
            np.stack([reduce_plane(md3[b], 0, 180, 64, 'md3-%d' % b) for b in range(3)]))
    del md3

# DEM 665 m int16 metres (clon0 version), nodata -32768
if not os.path.exists(os.path.join(WORK, 'dem_8k.npy')):
    # int16 metres (despite '32bit' in the name), LZW tiled; nodata -32768
    dem = tifffile.imread(os.path.join(RAW, 'mercury_dem/Mercury_Messenger_USGS_DEM_Global_665m_v2_32bit_clon0.tif'))
    np.save(os.path.join(WORK, 'dem_8k.npy'), reduce_plane(dem, -32768, 180, 64, 'dem'))
print('done')
