# The photographs: what each one shows and where its numbers come from

Every image on the page is path traced in Blender Cycles from the model's numbers and the design
spec (`docs/data/design_spec.json`). Light sources are given their physical radiance. Cameras are
metered as a photographer would meter them, with a daylight white balance (sunlight renders
neutral). Nothing is painted in. Scripts are in `render/`. Each render writes a scene-linear EXR, and
`render/develop.py` turns it into a photograph (exposure, white balance, AgX), so changing the
exposure never changes the physics.

## Jenny Lake: tonight and at Earth's limit (`earth_sky.py`)

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
- **The swarm (`sky_map.py`):** the model's Earth-limited shell, 0.41 % of the Sun at 0.86 AU with
  visible reflectance 0.004.
  - Its glow is a disc of radius asin(0.86) = 59° around the Sun, at
    L = (1 − f) f ρ S / π = 0.0096 W/m²/sr (0.89 cd/m²), seen through the atmosphere's
    transmittance.
  - The same atmosphere model scatters it (the disc split into 36 point sources).
  - Colour: sunlight off near-neutral hardware plus the film's violet anti-reflection residual
    (9 % of the reflectance).
- **Night sky:**
  - the Milky Way (NASA SVS Deep Star Maps, calibrated);
  - airglow (110 S10 at the zenith, van Rhijn brightening);
  - zodiacal light (Leinert et al. 1998);
  - 20,000 catalogue stars to V = 8.
- **Air between camera and terrain:** transmittance over each ray's length (Rayleigh plus a summer
  aerosol load at ~2.3 km). In-scattered light is the air's single-scattering source, integrated
  over the whole sky. In twilight the near-ground air is in Earth's shadow and lit only by the sky.
- **Result:**
  - Dusk: the disc is ~10× brighter than the blue-hour sky beside it, and lights the ground with
    0.33 lux of the 0.48 total.
  - Night: it lights the ground at 0.25 lux, a full Moon, which is exactly the limit the model
    enforces, and drowns the Milky Way.

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

## The planet as quarry (`mercury_stripped.py`)

- **When:** the swarm at Earth's limit, about 2128 in the central case.
  - Industry has dug out 0.145 % of Mercury, a 2.1 km layer if it came evenly off the planet.
  - At the heat wall it digs 2.3 × 10¹² kg/s, 0.93 m a day planet-wide. Of that,
    9.7 × 10¹¹ kg/s is exported (2.38 kg dug per kg in orbit).
- **Pit:** 28 km across and 3.6 km deep, with walls at 33° overall.
  - 3.6 km on Mercury loads rock like 1.4 km on Earth: about Bingham Canyon's depth and overall
    slope.
  - Catch berms every 200 m. Cohesion-limited wall height scales as 1/g, so Earth's 150–200 m
    between ramps becomes 400–500 m.
  - Each 200 m face is four 50 m benches, the face height a bucket-wheel excavator cuts.
  - Bench crests wander, as blasting leaves them.
- **Machines:**
  - Bucket-wheel excavators of Bagger 288's class: 220 m long, 96 m tall, 21.6 m wheel with 18
    buckets, 240,000 m³ a day (~7.5 t/s).
  - The dig rate needs ~3.1 × 10⁸ of them, one per 0.24 km² of the planet. One every 500 m along
    berms 308 m apart is one per 0.15 km² of wall, or one per 0.24 km² of this pit.
  - Painted white (solar absorptance ~0.15), as anything working in sunlight at 0.39 AU would be.
  - Belt conveyors run along every berm.
- **Floor:**
  - Coilgun tracks in bundles of 40, 1 km apart, 31.3 km long and straight. That is the model's
    10 t/s per track at one per 0.77 km². Each track rises d²/2R = 200 m off the curved floor at
    its muzzle.
  - Half of each row between bundles is radiator lying flat at 1,500 K, the top of the model's
    1,000–1,500 K. It emits 258 kW/m², so the model's 4.6 × 10¹⁸ W covers a quarter of the planet.
  - Glow: 7,000 cd/m² (CIE-weighted blackbody, ε 0.9). That is three times the sunlit floor beside
    it, and a third of the walls that face the Sun.
  - Coolant enters each 300 m panel at a manifold and leaves 50 K cooler, which halves its glow.
  - Heat-pump stations, and ore stockpiles at their angle of repose.
- **Surface:**
  - The old ground keeps its craters at equilibrium density, N(>D) = 0.08 D⁻² per m², drawn down
    to the size the camera resolves.
  - Weathered regolith has a Lambert albedo of ~0.08, from MESSENGER's 0.071 radiance factor at
    30° incidence.
  - Cut rock is brighter, in strata. The deep crust's low-reflectance material is darker and less
    red.
- **Light:** the Sun 7° up at 0.387 AU, from the front right; black sky. Metered on a grey card in
  full sunlight, −0.5 EV.

## The mass driver (`mass_driver.py`)

- **Track:** the model's launch speed, 7.8 km/s (escape plus the Hohmann v∞ from perihelion), and
  acceleration, 100 g, make a track v²/2a = 31.3 km long. Built straight on a 2,440 km planet, its
  far end stands d²/2R = 206 m above the ground. Pylons grow from 7 m at the breech to 206 m at
  the muzzle.
- **Machine:** a coilgun, not a railgun: drive coils every 0.5 m, flywheel stations every 400 m,
  busbars along the girder. Nothing slides, so nothing erodes at 10 t/s.
- **Light:** launch at perihelion (0.307 AU, 14.4 kW/m², Sun 1.74° across). The site where
  launching tangentially along the orbit is possible has the Sun on its horizon at that moment,
  side-on to the track.
- **Payload:** a canister 160 m down the track moves at √(2·a·d) = 560 m/s, blurred by a
  1/2000 s shutter.

## The chip foundry (`foundry.py`)

- **Design:** a speculative space-native wafer fab from `docs/data/future/manufacturing.json`:
  - dry vacuum tool modules under glass-cloth blankets along a maglev spine;
  - a shared free-electron-laser EUV source (superconducting linac plus undulator) with
    beamlines to the scanner modules;
  - a chlorine-loop refinery (SiCl₄ distillation, Zn/Mg reduction) with radiators at 1,000 K;
  - cryo-panels at 40–80 K under stacked multilayer shades, recapturing Cl₂, SiCl₄, O₂ and S;
  - fab radiators at 320 K, edge-on to the Sun.
- **Sizing:** 10⁵ m²/yr of die.
  - Tools at 40 kg per m²/yr: 4,000 t.
  - 0.0251 m² of die per kg of sail: 4 × 10⁶ kg/yr, ~280 sails.
  - 1,150 MJ/kg: 146 MW.
  - PV at 0.387 AU tilted 80° from the Sun (1.6 kW/m², cells at ~335 K instead of ~540 K face-on)
    at 20 %: 0.46 km².
  - Radiators at 320 K, two-sided, ε 0.9: 0.14 km².
- **Thermal frame:** 8–14 µm brightness temperatures. The PV is 323 K, the fab radiators 312 K
  with warmer roots, the modules ~270 K and the refinery radiators 947 K. The visible frame
  is exposed for sunlight, so the 1,000 K glow does not register.
- **Setting:** Mercury is 7,500 km away, lit from the same overhead Sun.

## The sails (`sail.py`, `sail_shot.py`)

The film's anti-reflection coating is a physical thin film (110 nm porous silica on glass). The
fold-panel curl is an analytic per-sample normal, so its glints survive at any distance.
Brightness-temperature thermal frames share one 320–350 K scale.
