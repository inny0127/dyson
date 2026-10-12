# The photographs: what each one shows and where its numbers come from

Every image on the page is path traced in Blender Cycles from the model's numbers and the design
spec (`docs/data/design_spec.json`). Light sources are given their physical radiance. Cameras are
metered as a photographer would meter them, with a daylight white balance (sunlight renders
neutral). Nothing is painted in. Scripts are in `render/`. Each render writes a scene-linear EXR, and
`render/develop.py` turns it into a photograph (exposure, white balance, AgX), so changing the
exposure never changes the physics.

## Jenny Lake: tonight and with the finished swarm (`earth_sky.py`)

- **Place:** Jenny Lake, Grand Teton National Park.
  - Terrain is USGS 3DEP elevation at 8 m (`assets/teton_dem.png`).
  - The lake bed is carved below the DEM's water surface, and a cobble beach is generated at 5 cm
    (`teton_prep.py`).
  - Conifers are modelled to the twig and instanced below the 2,900 m treeline. Snowfields sit on
    high north- and east-facing slopes.
- **Time:** 22 August, Sun 9° below the horizon (21:04 MDT) and 18.5° below (22:06), from
  `ephem.py`. Stars and the Milky Way are placed for that sidereal time.
- **Sky:** `atmosphere.py` solves Rayleigh and Mie scattering, ozone and multiple scattering
  (Hillaire 2020).
  - Blender's own sky is single-scattering. It renders civil twilight 6× and nautical twilight 160×
    too dark, and turns deep twilight orange where the real sky is blue.
  - The clean-air model is itself 2–4× too bright in deep twilight, so the Sun's sky is scaled to
    measured clear-sky twilight illuminance (3.4 lux at −6°, 0.0083 lux at −12°).
- **The swarm (`sky_map.py`, kind `uniform`):** the finished near-uniform swarm, 83 % of the Sun,
  visible reflectance 0.004 (`docs/full-swarm.md`).
  - Sun-facing sails between 0.92 and 0.98 AU all round the Sun, filled to tau = 0.88, empty within
    23° of the Sun–Earth line (acos 0.92) and 15° of L3.
  - From Earth every line of sight toward the Sun within asin(r) ≈ 72° of it misses the near side
    of the swarm (that is what the 23° gap is for) and meets the far side, where every sail shows
    its sunlit front: L = tau ρ S(r) / π = 1.70 W/m²/sr (158 cd/m²). The disc's edge is soft over
    66–80° because the sails span 0.92–0.98 AU.
  - The L3 gap shows from Earth as a dark hole 7.3° in radius round the Sun.
  - The L1 shade takes 19.6 % of the sunlight: the twilight sky is scaled by 0.804 (`--sun-scale`).
  - The same atmosphere model scatters the disc (split into point sources).
  - Colour: sunlight off near-neutral hardware plus the film's violet anti-reflection residual
    (9 % of the reflectance).
- **Night sky:**
  - the Milky Way (NASA SVS Deep Star Maps, calibrated);
  - airglow (110 S10 at the zenith, van Rhijn brightening);
  - zodiacal light (Leinert et al. 1998);
  - 20,000 catalogue stars to V = 8;
  - the planets for the date (`ephem.planets`, JPL approximate elements and Mallama & Hilton
    magnitudes). Venus, at −4.5, is 6° up in the west-southwest at dusk, behind the Teton range.
- **Air between camera and terrain:** transmittance over each ray's length (Rayleigh plus a summer
  aerosol load at ~2.3 km). In-scattered light is the air's single-scattering source, integrated
  over the whole sky. In twilight the near-ground air is in Earth's shadow and lit only by the sky.
- **Result:** see the captions on the page; the ground illuminance each frame receives is in its
  render log.

## Jenny Lake with the Sun enclosed (`earth_sky.py --glow closed`)

- **Same place, moment and exposure as tonight's night frame** (22 August, 22:06 MDT, Sun 18.5° below
  the horizon at azimuth 308°; exposure 13.87).
- **The closed swarm (`sky_map.py`, kind `closed`, `docs/closed-swarm.md`):** Earth sees only the mirror
  cap's back, which covers the sky within 75.6° of the Sun: the cap's edge at 0.98 AU and 23.07°
  from the Sun–Earth line, seen from 1 AU.
  - The back is at ~176 K and reflects nothing visible, so it is drawn as black: stars and Milky Way
    are removed within 75.6° of the Sun, with a 1° soft edge for the mirrors' yearly drift.
  - There is no swarm glow, the zodiacal light is gone everywhere (the dust outside the shell is
    unlit), and there are no planets.
  - Airglow, twilight and the atmosphere's scattering are as tonight: they happen in front of the cap.
- **Not shown:** the dusk and low-orbit views of the near-uniform swarm below are kept for that
  layout; the page shows only this frame for the closed swarm, because by day and at dusk nothing
  changes.

## The swarm from low Earth orbit (`leo_view.py`)

A numpy renderer: the scene is a sphere, its air and the sky, so it is ray-cast and integrated
directly rather than path-traced.

- **Where and when:** 400 km over the Nile Delta, 01:54 UTC on 22 September 2128.
  - The Sun is 6° below Earth's limb, so the dark hole round it is just below the limb and the disc
    rises from the dawn. The wide frame (12 mm) is aimed 35° above the Sun to take in the disc's
    upper edge.
  - The Moon is a waning crescent 29° from the Sun (`ephem.moon_eq`, ~0.3°), inside the disc.
    Mercury (V 0.4) and Mars (V 1.8) are about 10° below it.
- **The swarm:** as on the Jenny Lake frames (`sky_map.glow_radiance`, kind `uniform`), a disc of
  sunlit fronts 72° in radius round the Sun at 158 cd/m², with the L1 shade dimming the Sun 19.6 %.
  - From orbit nothing stands in front of it, except where the line of sight grazes the air.
  - It is smooth: each sail is near magnitude 25 from Earth, and millions share every pixel.
- **Earth:**
  - City lights: NASA Black Marble 2016. Global at 5 km, with 1 km and 500 m crops of the
    region in view rescaled to the global map. A map value of 1 is taken as 3.8 × 10⁻³ W/m²/sr
    (a bright urban core near 100 nW/cm²/sr in the VIIRS day/night band); this is uncertain to
    about 3×. Colour 3,500 K.
  - Clouds: the Blue Marble composite, albedo 0.65. Land: Blue Marble colour.
  - Ocean: albedo 0.03 plus a rough mirror of the sky (Fresnel, wave slopes σ = 0.2).
  - Night-side lighting: the part of the band above each point's horizon, through the air, plus
    12 % skylight.
- **Air:** the multiple-scattering model of `atmosphere.py`, integrated along each ray from
  orbit and lit by the disc (as point sources) and the Sun.
  - Airglow layers: O 557.7 nm at 97 km (250 R), Na 589 nm at 92 km (50 R), O 630 nm at 250 km
    (80 R). They are thousands of times fainter than the band, so they do not register.
- **The Moon:**
  - LRO albedo scaled to a mean normal albedo of 0.12.
  - Sunlight with lunar-Lambert photometry (McEwen 1991, Lambert beyond 100° phase).
  - Earthshine: Earth at ~30° phase, Bond albedo 0.30, gives 0.063 W/m². Its night side comes
    out a few hundredths as bright as the disc behind it, so it shows black.
- **Stars and planets:** the V ≤ 8 catalogue and the planets, as points through the air's
  transmittance. Then `glare.py` and `develop.py`, exposed for the disc.

## The sail and the counter-sun (`sail_shot.py --view corner_counter_sun --far-sky --layout uniform`)

- **Camera:** 30 m sunward of a corner and 17 m beyond its tip, looking away from the Sun, on a
  sail in the near-uniform swarm at 0.95 AU, 90° round the Sun from Earth.
- **Sky:** `farside_field.build_far_sky` in `uniform` mode, the same sky as the view from inside the
  swarm. The Sun's disc is left out of the world (the scene's Sun lamp lights the sail), and the
  lamp is dimmed by exp(−τ/2) for the sails sunward of this one.
- **The counter-sun:** magnitude −21.6. The fronts carry the aluminium mesh that makes them dark in
  the infrared; its coherent mirror reflection is about (0.21 · 0.95)² = 0.04, on top of the film's
  0.0013, and the column of plates straight out beyond the camera covers 19 % of the view.
- **Film:** near-black navy, exposed 2 stops over a grey card in sunlight.

## Inside the near-uniform swarm (`farside_field.py --mode uniform`, `farside_sky.py`)

- **The swarm:** sun-facing sails in a layer at 0.95 ± 0.002 AU, all round the Sun except 23° round
  the Sun–Earth line and 15° round L3, filled to τ = 0.88 (83 % of the Sun). That is
  1.9 × 10⁻⁵ sails per km³, one every 38 km. The camera sits mid-layer, 90° round from Earth.
- **The sky beyond 3,000 km (`farside_sky.far_glow`):** each ray is marched through the layer as a
  medium of plates. Coverage per unit radial depth is τ/Δr; a plate is seen at |d · r̂|.
  - Plates outward of the camera show their sunlit fronts (ρ S / π, dimmed by the plates sunward of
    them); plates inward show their backs, which only block. Away from the Sun the sky is 33 cd/m².
  - Rays toward the Sun cross the inner half of the layer, the empty inside, and meet the swarm's
    far side from inside, where every plate faces them: 48 cd/m².
  - Where those rays meet one of the two gaps, space is black: the Sun–Earth gap as a window about
    23° across with Earth in it, and the L3 gap, smaller, on the other side.
- **Sails within 3,000 km:** squares 279 m across facing the Sun when they span more than 1.5
  pixels, points otherwise; fronts at ρ S / π with glints, backs black.
- **Earth and the Moon:** points at their true direction, 46° from the Sun and 1.38 AU away:
  Earth at magnitude −2.5, the Moon at +2.0, both in the middle of the dark window.
- **Not modelled:** the bands of the orbit lattice (`docs/full-swarm.md`) would give the layer
  texture; it is uniform here.

## Europe in July, today and Mediterranean (`med_earth.py`, `leo_view.py`)

- **Camera:** 4,000 km above 43° N, 6° E, looking straight down with a 24 mm lens, 15 July at 11:00
  UTC, Sun about 70° high over the Mediterranean.
- **Today:** the July 2004 Blue Marble (`assets/earth_day_8k.jpg`) and the Blue Marble cloud
  composite, through the same multiple-scattering atmosphere as the low-orbit views.
- **Mediterranean (`render/med_earth.py`):** the dry-summer belt moved about five degrees north,
  the far end of what shading by latitude and season might do (`docs/full-swarm.md`).
  - The new belt (44–51° N, fading over 41–44 and 51–56° N, and from 12° E to nothing by 25° E as
    Atlantic winter rain gives out) takes the colour distribution of today's Mediterranean lands
    (Iberia, the south of Italy and Greece, 37–42° N) by per-channel histogram matching. Every field,
    forest and city stays where it is; only the season's palette changes.
  - The old southern edge (33–37.5° N) takes the palette of the steppe south of the Atlas
    (29–32.5° N).
  - Land above ~1,500 m (from the GEBCO relief, tied to Mont Blanc and the Paris basin) keeps its
    colours. Summer cloud over the new belt and its seas is cut by 75 %, over the drier edge by 40 %.
  - About 1.8 million km² changes to the Mediterranean palette and 1.2 million km² to steppe.
- **Sunlight:** full in both frames (the closed swarm's window lets Earth's sunlight through), one
  exposure for both. An earlier version rendered the second frame under the near-uniform swarm's L1
  shade, 19.6 % darker.
- **Not a climate-model result:** no model has run shading aimed this way; the picture shows one
  plausible outcome of the mechanism.

## North America's Pacific coast, today and Mediterranean (`med_earth.py`, `leo_view.py`)

- **Camera:** 4,000 km above 43.5° N, 120° W, looking down with a 35 mm lens, 15 July at 20:00 UTC
  (local noon). Cloud-free in both frames (the cloud composite is not a July map, and it put a storm
  over exactly the coast that changes).
- **Mediterranean:** the coast's dry-summer belt already reaches Seattle, so instead of one palette
  each 1° band of the coastal strip (within ~4° of the westernmost land, fading out by 7°, east of the
  Cascades and the Sierra) takes the July colour distribution of the strip 5° further south, from
  32 to 58° N, blended between bands. Land above ~1,500 m keeps its colours. About 0.7 million km²
  changes.
- **Sunlight:** full in both frames; one exposure for both.

## Mercury today and at the heat wall (`mercury.py`)

- **Globe:** MESSENGER MDIS albedo (mean 0.080) and the USGS 665 m DEM as true displacement, lit by
  the Sun at 0.387 AU, phase 100°. Both frames share one exposure, metered on sunlit regolith.
- **At the heat wall:** the model sheds 5×10¹⁸ W. Bare ground at 500 K would shed only
  2.4×10¹⁷ W, so the whole planet is paved with radiator fields (corridors between them) that heat
  pumps at half of Carnot hold at 1,650 K (`docs/future-tech.md`). They radiate 2.8×10¹⁹ W, 170
  times the sunlight Mercury receives; most of it is the pumps' work, powered from the swarm.
  - Glow: the CIE photopic integral of a 1,650 K grey body (ε 0.9), 30,700 cd/m², in the repo's
    sunlight-radiance units (93 lm/W). Sunlit regolith at normal incidence is 21,500 cd/m².
  - At 1,650 K sunlight is 2.4 % of what a radiator emits, so the fields cover the day side too,
    where they also reflect sunlight at a visible albedo of 0.10.
  - An earlier version drew 1,300 K fields on the night side only, which cannot shed the model's
    heat, and scaled their glow by the visible share of the Planck spectrum, which overstates a
    cool source's luminance.

## The pod, visible and thermal (`pod.py`)

- **Geometry:** the design spec's 1 MW pod (render_spec parts `pod_*`):
  - 1.84 m module under a glass-cloth blanket;
  - two 68 × 32.5 m PV wings in 10 panels;
  - four radiator blades, 40.5 × 6 m and 25 mm thick, in the plane of the Sun's rays;
  - trusses, loop trunks, a terminal mast with 24 laser terminals, thrusters and tanks.
- **Visible:** sunlight at 0.88 AU (1,758 W/m², 0.61°), metered on a grey card in full sun. The
  blades get no direct sunlight on their faces.
- **Thermal (8–14 µm brightness temperature):**
  - blades 355 K at the root to 345 K at the tip, with fin-efficiency fall-off toward their edges;
  - wings 343 K;
  - module exterior 300 K, trusses 293 K;
  - emissivities from the spec.

## The sails (`sail.py`, `sail_shot.py`)

The film's anti-reflection coating is a physical thin film (110 nm porous silica on glass). The
fold-panel curl is an analytic per-sample normal, so its glints survive at any distance.
Brightness-temperature thermal frames share one 320–350 K scale.
