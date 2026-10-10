#!/usr/bin/env bash
# Re-download every raw source used to build ../ (about 6.3 GB). Each file goes into its own
# subdirectory of RAW, matching the paths the tools/*.py scripts expect.
# Usage: tools/fetch.sh RAW_DIR
# Then (needs python3 with numpy, pillow, scipy, tifffile, imagecodecs, OpenEXR):
#   python3 -I tools/process_earth.py   RAW OUT
#   python3 -I tools/make_stars.py      RAW/hyg/hyg_v44.csv.gz OUT/stars.csv
#   python3 -I tools/process_milkyway.py RAW/svs_milkyway/milkyway_2020_8k.exr RAW/svs_hiptyc/hiptyc_2020_8k.exr OUT/stars.csv OUT
#   python3 -I tools/mercury_reduce.py  RAW WORK   # area-averages the 4.2 GB LOI mosaic, MD3 colour and DEM to 8k
#   python3 -I tools/mercury_final.py   WORK OUT
set -euo pipefail
RAW=${1:?usage: fetch.sh RAW_DIR}
get() { mkdir -p "$RAW/$1"; (cd "$RAW/$1" && curl -fSL -O "$2"); }

USGS=https://planetarymaps.usgs.gov/mosaic   # redirects to asc-pds-services.s3.us-west-2.amazonaws.com/mosaic
get mercury_loi  $USGS/Mercury_MESSENGER_MDIS_Basemap_LOI_Mosaic_Global_166m.tif
get mercury_md3  $USGS/Mercury_MESSENGER_MDIS_Basemap_MD3Color_Mosaic_Global_665m.tif
get mercury_dem  $USGS/Mercury_Messenger_USGS_DEM_Global_665m_v2_32bit_clon0.tif

EO=https://eoimages.gsfc.nasa.gov/images/imagerecords
get earth_bmng_july        $EO/74000/74092/world.200407.3x21600x10800.jpg
get earth_blackmarble_gray $EO/144000/144897/BlackMarble_2016_3km_gray.jpg
get earth_clouds           $EO/57000/57747/cloud_combined_8192.tif
get earth_topo             $EO/73000/73934/gebco_08_rev_elev_21600x10800.png
get earth_bathy            $EO/73000/73963/gebco_08_rev_bath_21600x10800.png

get hyg https://codeberg.org/astronexus/hyg/media/branch/main/data/hyg/CURRENT/hyg_v44.csv.gz

SVS=https://svs.gsfc.nasa.gov/vis/a000000/a004800/a004851
get svs_milkyway $SVS/milkyway_2020_8k.exr
get svs_hiptyc   $SVS/hiptyc_2020_8k.exr
