# The photographs: what each one shows and where its numbers come from

Every image on the page is path traced in Blender Cycles from the model's numbers and the design
spec (`docs/data/design_spec.json`). Light sources are given their physical radiance. Cameras are
metered as a photographer would meter them, with a daylight white balance (sunlight renders
neutral). Nothing is painted in. Scripts are in `render/`. Each render writes a scene-linear EXR, and
`render/develop.py` turns it into a photograph (exposure, white balance, AgX), so changing the
exposure never changes the physics.

## Jenny Lake: tonight and with the far-side cloud (`earth_sky.py`)

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
- **The swarm (`sky_map.py`):** the far-side cloud at Earth's limit, 3.79 % of the Sun, visible
  reflectance 0.004; and at 20 % in a cloud stretched to ±60°.
  - The sails are a thin layer of sun-facing fronts on Earth's orbit, 90–165° and 195–270° of
    heliocentric longitude from Earth, within ±30° of the ecliptic, covering a fraction
    tau = f / (150/360 · sin 30°) of that patch (0.18 at 3.79 %).
  - A line of sight from Earth meets the 1 AU sphere once more, at P = −ŝ + 2 cos(θ) d̂. If P is in
    the patch, it sees a Lambertian sail front in full sunlight over a fraction tau of the way:
    L = tau ρ S / π = 0.315 W/m²/sr (29 cd/m²) at 3.79 %, the same everywhere in the band. The
    band's edges are the orbits' limits, softened over 3° for orbital scatter.
  - This reproduces the Earth-safe study's sky numbers exactly (0.368 lux per 1 % on the ground
    with the Sun 18° down and the ecliptic upright, for the patch without its L3 gap at 1.2 %).
    The previous version of the renderer used the study's ring-averaged profile and multiplied it
    by a latitude window, which counted the band's narrowing twice.
  - On 22 August at Jenny Lake the evening ecliptic leans about 30° from the horizon, so most of
    the band is below it.
  - It is 82 % transparent at 3.79 %: stars behind it lose 18 % of their light. Its brightness
    hides them long before that matters, as twilight does, so the renderer leaves the dimming out.
  - The same atmosphere model scatters it (the band split into point sources).
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

## The swarm from low Earth orbit (`leo_view.py`)

A numpy renderer: the scene is a sphere, its air and the sky, so it is ray-cast and integrated
directly rather than path-traced.

- **Where and when:** 400 km over the Nile Delta, 01:54 UTC on 22 September 2128.
  - The Sun is 6° below Earth's limb. Near the September equinox the morning ecliptic stands
    almost upright over the eastern horizon at 31° N, so the band rises straight up from the dawn.
  - The Moon is a waning crescent 29° from the Sun (`ephem.moon_eq`, ~0.3°), inside the band.
    Mercury (V 0.4) and Mars (V 1.8) are about 10° below it.
- **The swarm:** the far-side cloud as on the Jenny Lake frames (`sky_map.glow_radiance`):
  3.79 % at 29 cd/m², and 20 % in a ±60° cloud at 92 cd/m².
  - From orbit nothing stands in front of it, except where the line of sight grazes the air.
  - It is smooth. About 10¹⁷ sails make it, each near magnitude 25–26 from Earth, so millions share
    every pixel even through the 170 mm lens.
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
    out about a hundredth as bright as the band behind it, so it shows black.
- **Stars and planets:** the V ≤ 8 catalogue and the planets, as points through the air's
  transmittance. Then `glare.py` and `develop.py`, exposed for the band.

## The sail and the counter-sun (`sail_shot.py --view corner_counter_sun --swarm-sky`)

- **Camera:** 30 m sunward of a corner and 17 m beyond its tip, looking away from the Sun at
  0.92 AU.
- **Sky:** `swarm_field.build_sky`, the same sky as the view from inside the swarm.
  - Sails within 40,000 km are points.
  - The rest is integrated glow, and the counter-sun: magnitude −15.1, from an outward
    coverage of 0.40 %.
- **Film:** near-black navy, so it is exposed 2 stops over a grey card in sunlight. The hinge
  strips show as bright lines because their curled edges glint within 7.7° of the antisolar
  point.

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

## The sky from inside the swarm (`swarm_field.py`)

- **Sails:** the Earth-limited swarm, 0.41 % coverage in a shell 0.86–0.92 AU, gives
  n = −ln(1 − f) / (A ΔR) = 5.9 × 10⁻⁹ sails per km³.
  - Every sail within 40,000 km in the frame is a point source: diffuse from film and hardware
    (reflectance 0.0021), plus glints.
  - Sails further out are integrated into the sky's glow (reflectance 0.004 including the vanes'
    average).
- **Glints (design spec scene facts):**
  - The film reflects the Sun straight back (0.52° half-angle, glint radiance 26,400 W/m²/sr at
    0.919 AU).
  - The curled edges of the fold panels (21.6 % of the area) reflect within 7.7°. Their slope
    decays exponentially away from each hinge, so the halo falls as 1/α².
  - Vanes are energy-conserving mirrors: 87 m² at R = 0.9, tilted 0–40°, beam broadened by
    wrinkles to 1.3°.
- **The counter-sun:**
  - Seen from inside the shell, the sails beyond the camera within 0.52° of the antisolar point
    all glint at once.
  - With an outward column coverage of 0.27 % this is a disc of 62 W/m²/sr, magnitude −14.7,
    inside a halo reaching 7.7°.
  - Nobody designed it. It follows from flat sails facing the Sun.
- **Earth and the Moon:** 0.12 AU away near the antisolar point, lit by the Sun at 1 AU.
- **Lens glare:** `glare.py` adds a measured-like point-spread function (bloom plus power-law
  wings) that conserves energy.

## The sails (`sail.py`, `sail_shot.py`)

The film's anti-reflection coating is a physical thin film (110 nm porous silica on glass). The
fold-panel curl is an analytic per-sample normal, so its glints survive at any distance.
Brightness-temperature thermal frames share one 320–350 K scale.
