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

## Mercury's night side at the heat wall (`mercury_surface.py`)

- **Heat:** the model's 5 × 10¹⁸ W of mining heat. Shed by the night side alone, that is
  134 kW/m², a surface at about 1,270 K. Shed over the whole planet, about 1,100 K.
- **Radiators:** panels at 1,200 ± 50 K, falling 140 K from inlet to outlet, with some blocks idle
  at ~1,000 K.
  - Their luminance is the CIE-weighted Planck integral: 23 / 141 / 655 cd/m² at
    1,100 / 1,200 / 1,300 K, deep orange.
  - They light the ground and the mass driver by themselves.
- **Ground:** Mercury's curvature (horizon 3 km from eye height) and cratered regolith (albedo
  0.06–0.12), graded under the field. The mass driver is 3 km long (7.6 km/s at ~1,000 g).
- **Sky:**
  - Every sail shows Mercury its sunlit front: a uniform glow of 0.0096 W/m²/sr (0.9 cd/m²).
  - The counter-sun is magnified by the geometry: the 0.52° glint cone, seen from 0.39 AU at
    sails 0.86 AU from the Sun, spans 0.52° × 0.86/0.39 = 1.16° in radius.
  - Its radiance is coverage × glint radiance, 103 W/m²/sr: magnitude −17, about 16 lux on the
    ground. The halo reaches 17°.
- **Exposure:** metered for the panels, so the sky's glow does not register.

## The sails (`sail.py`, `sail_shot.py`)

The film's anti-reflection coating is a physical thin film (110 nm porous silica on glass). The
fold-panel curl is an analytic per-sample normal, so its glints survive at any distance.
Brightness-temperature thermal frames share one 320–350 K scale.
