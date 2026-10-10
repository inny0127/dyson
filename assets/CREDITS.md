# Asset credits and licences

Every file in this directory is derived from the public sources below. Conventions, scale factors
and Blender node recipes are in `manifest.json`. Scripts that rebuild every file from the raw
downloads are in `tools/` (`tools/fetch.sh` lists the exact download URLs).

**Attribution to show with renders that use these assets** (one line is enough):

> Mercury: NASA/JHU APL/Carnegie Institution of Washington (MESSENGER MDIS), USGS Astrogeology.
> Earth: NASA Earth Observatory (Blue Marble NG, R. Stöckli; Black Marble 2016, J. Stevens/M. Román), GEBCO.
> Sky: NASA/Goddard Space Flight Center Scientific Visualization Studio; Gaia DR2: ESA/Gaia/DPAC.
> Star catalogue: HYG Database v4.4 (David Nash, astronexus.com), CC BY-SA 4.0.

---

## Mercury

### `mercury_albedo_8k.jpg`, `mercury_albedo_4k.jpg`
- **Sources:**
  1. *Mercury MESSENGER MDIS Basemap LOI (low incidence angle) Global Mosaic 166 m*, PDS dataset
     MESS-H-MDIS-5-RDR-LOI-V1.0 (8-bit, 92160 x 46080, photometrically normalised).
     https://planetarymaps.usgs.gov/mosaic/Mercury_MESSENGER_MDIS_Basemap_LOI_Mosaic_Global_166m.tif
  2. *Mercury MESSENGER MDIS Basemap MD3 Color Global Mosaic 665 m*, PDS dataset
     MESS-H-MDIS-5-RDR-MD3-V1.0 (1000 / 750 / 430 nm bands).
     https://planetarymaps.usgs.gov/mosaic/Mercury_MESSENGER_MDIS_Basemap_MD3Color_Mosaic_Global_665m.tif
- **Creator:** NASA / Johns Hopkins University Applied Physics Laboratory / Carnegie Institution of
  Washington (MESSENGER mission). Mosaics were produced by Applied Coherent Technology Corp. and are
  distributed by the USGS Astrogeology Science Center / NASA PDS.
- **Licence:** public domain (US Government / NASA mission data). No conditions; credit requested.
- **Attribution:** "NASA/Johns Hopkins University Applied Physics Laboratory/Carnegie Institution of
  Washington; USGS Astrogeology Science Center."
- **Processing:**
  - Brightness comes from the LOI mosaic, area-averaged to 8192 x 4096 while ignoring no-data pixels.
    DN = 0 pixels (mostly polar shadows) were in-painted from their neighbours, so the renderer casts
    its own shadows.
  - The 8-bit display stretch was partly undone: relative reflectance = 0.3 + 0.7 * DN / median.
    That gives a 2nd-98th percentile range of 0.66-1.53 x the median.
  - Colour comes from the band ratios ln(430/750) and ln(1000/750) of the MD3 mosaic. These are
    attenuated to 35 % because the three MD3 bands were stretched independently. They are applied
    to Mercury's mean red-sloped spectrum (R430/R750 = 0.70, R1000/R750 = 1.12), and the spectrum is
    sampled at 610 / 545 / 465 nm to get linear R / G / B. Colour variation fades to neutral above
    65-75 deg latitude, where MD3 coverage is poor.
  - Absolute level: the area-weighted mean linear albedo is **0.080**. This is the Lambert albedo
    that reproduces Mercury's disc-integrated brightness at a phase angle of 30-60 deg. It uses
    Mallama et al. (2002, Icarus 155, 253), with geometric albedo 0.142 and the V(1, alpha) phase
    curve. The Lambert-equivalent albedo is 0.088 at 30 deg, 0.060 at 60 deg and 0.048 at 90 deg.
    Multiply in the shader if a scene needs a different value.
  - Known residuals: north of about 80 N and south of about 75 S the mosaic still contains some
    baked-in shading, plus seams between image strips. Some mosaic tile boundaries are faintly
    visible at mid-latitudes.

### `mercury_height_8k.jp2`, `mercury_height_4k.png`
- **Source:** *Mercury MESSENGER Global DEM 665 m v2* (USGS Astrogeology; Becker, K. J. et al. 2016,
  "First global digital elevation model of Mercury", LPSC 47, abstract 2959). File used:
  https://planetarymaps.usgs.gov/mosaic/Mercury_Messenger_USGS_DEM_Global_665m_v2_32bit_clon0.tif
  (int16, centre longitude 0). The file is int16 metres despite "32bit" in its name. This was
  cross-checked against the clon180 `..._v2.tif`, whose raw values are exactly 2x with
  SCALE = 0.5 in its GDAL metadata.
- **Creator:** USGS Astrogeology Science Center, from MESSENGER MDIS stereo and MLA data (NASA/JHU APL).
- **Licence:** public domain (US Government).
- **Attribution:** "USGS Astrogeology Science Center; NASA/JHU APL/Carnegie Institution of Washington."
- **Encoding:** `height_m = -6000 + stored_uint16` (1 m steps), relative to a 2,439,400 m sphere.
  The data range is -5380 to +4485 m. The 8k file is lossless JPEG 2000 to save space (20 MB, against
  34 MB as a PNG). It was verified bit-exact, and Blender 4.5 reads it exactly. The 4k file is a
  standard 16-bit PNG.

## Earth

### `earth_day_8k.jpg`, `earth_day_4k.jpg`
- **Source:** NASA Visible Earth / Earth Observatory, *Blue Marble: Next Generation*, July 2004
  (base version: no topography shading, no bathymetry), image record 74092.
  https://eoimages.gsfc.nasa.gov/images/imagerecords/74000/74092/world.200407.3x21600x10800.jpg
- **Creator:** Reto Stöckli, NASA Earth Observatory (NASA Goddard Space Flight Center), from MODIS data.
- **Licence:** public domain (NASA imagery is not copyrighted; NASA media guidelines). Credit requested.
- **Attribution:** "NASA Earth Observatory / Reto Stöckli (Blue Marble Next Generation)."
- **Processing:** Lanczos downsample from 21600 x 10800. The image is display-referred true colour,
  not calibrated albedo.

### `earth_night_lights_8k.jpg`
- **Source:** NASA Earth Observatory, *Earth at Night (Black Marble) 2016*, greyscale lights-only
  version, image record 144897.
  https://eoimages.gsfc.nasa.gov/images/imagerecords/144000/144897/BlackMarble_2016_3km_gray.jpg
- **Creator:** NASA Earth Observatory images by Joshua Stevens, using Suomi NPP VIIRS data from
  Miguel Román, NASA Goddard Space Flight Center.
- **Licence:** public domain (NASA).
- **Attribution:** "NASA Earth Observatory images by Joshua Stevens, using Suomi NPP VIIRS data from
  Miguel Román, NASA's Goddard Space Flight Center."
- **Processing:** area-average (box) downsample from 13500 x 6750, so the total light is preserved.

### `earth_clouds_8k.jpg`
- **Source:** NASA Visible Earth, *Blue Marble* cloud composite, image record 57747.
  https://eoimages.gsfc.nasa.gov/images/imagerecords/57000/57747/cloud_combined_8192.tif
- **Creator:** NASA Goddard Space Flight Center; image by Reto Stöckli, from MODIS data.
- **Licence:** public domain (NASA).
- **Attribution:** "NASA Goddard Space Flight Center Image by Reto Stöckli."
- **Processing:** the identical RGB channels were collapsed to one grey channel (JPEG q80).

### `earth_water_mask_4k.png`, `earth_topo_4k.jpg`
- **Sources:** NASA Earth Observatory images of the GEBCO_08 grid. Topography is record 73934 and
  bathymetry is record 73963.
  https://eoimages.gsfc.nasa.gov/images/imagerecords/73000/73934/gebco_08_rev_elev_21600x10800.png
  https://eoimages.gsfc.nasa.gov/images/imagerecords/73000/73963/gebco_08_rev_bath_21600x10800.png
- **Creator:** imagery by Jesse Allen, NASA Earth Observatory, based on data from the General
  Bathymetric Chart of the Oceans (GEBCO), British Oceanographic Data Centre.
- **Licence:** public domain (NASA imagery). The GEBCO grid itself is "placed in the public domain
  and may be used free of charge" (GEBCO terms of use).
- **Attribution:** "NASA Earth Observatory (Jesse Allen), GEBCO_08 Grid, www.gebco.net."
- **Processing:** the mask is 255 wherever the bathymetry image has depth data (ocean and connected
  seas), area-averaged to 4096 x 2048. The topography is box-downsampled.

## Sky

### `stars.csv`
- **Source:** HYG Database v4.4 (Hipparcos, Yale Bright Star and Gliese catalogues combined).
  https://codeberg.org/astronexus/hyg (file `data/hyg/CURRENT/hyg_v44.csv.gz`).
- **Creator:** David Nash (astronexus.com).
- **Licence:** **Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0)**,
  https://creativecommons.org/licenses/by-sa/4.0/. `stars.csv` is an adaptation and is therefore
  also licensed CC BY-SA 4.0. Any redistributed modification of it must keep that licence.
  Rendered images are not adaptations of the database, but crediting it is still good practice.
- **Attribution:** "Star data: HYG Database v4.4 by David Nash (astronexus.com), CC BY-SA 4.0.
  Changes: filtered to V <= 8.0, RA converted to degrees, columns reduced."
- **Processing:** contains all 41,486 stars with V <= 8.00, excluding the Sun, sorted brightest
  first. 93 missing B-V values were estimated from spectral type, and 19 were set to 0.65.

### `milkyway_8k.jpg`
- **Source:** NASA Scientific Visualization Studio, *Deep Star Maps 2020* (ID 4851, Ernie Wright),
  layers `milkyway_2020_8k.exr` (Gaia DR2 background) and `hiptyc_2020_8k.exr` (Hipparcos/Tycho stars).
  https://svs.gsfc.nasa.gov/4851/
  https://svs.gsfc.nasa.gov/vis/a000000/a004800/a004851/milkyway_2020_8k.exr
  https://svs.gsfc.nasa.gov/vis/a000000/a004800/a004851/hiptyc_2020_8k.exr
- **Creator:** NASA/Goddard Space Flight Center Scientific Visualization Studio, using
  Hipparcos-2, Tycho-2, Gaia DR2 (ESA/Gaia/DPAC), UCAC3 and Yale BSC data.
- **Licence:** NASA-produced visualisation, not copyrighted in the US (NASA media guidelines). The
  SVS asks for the credit line below. The underlying Gaia DR2 data are ESA's and free to use with
  acknowledgement of ESA/Gaia/DPAC. Treat the credit as required.
- **Attribution (SVS-requested):** "NASA/Goddard Space Flight Center Scientific Visualization Studio.
  Gaia DR2: ESA/Gaia/DPAC." (The SVS constellation-figure credit does not apply because the figure
  layers are not used.)
- **Processing:** the image is milkyway + hiptyc, with every `stars.csv` star masked out of the
  hiptyc layer using magnitude-dependent elliptical windows. This removed 67 % of the Hipparcos/Tycho
  flux and 4.3 % of the pixels. The result is scaled linearly so that the 99.95th luminance
  percentile maps to 1.0, then sRGB-encoded with no tone curve. To recover the original values, use
  `p = srgb_to_linear(pixel) * 0.126568`. The absolute calibration is in `manifest.json`.
- **Alternatives considered:** ESO/S. Brunier *Milky Way panorama* (eso0932a, CC BY 4.0). It is
  downloadable only at 6000 x 3000 and has no HDR source, so it was not used.
