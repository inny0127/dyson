# Earth: how big the swarm may get

> **Superseded as the default.** The page now holds Earth's temperature with an L1 shade that
> cancels all of the swarm's heat, puts infrared-dark fronts on every sail, and spreads them all
> round the Sun except a 23° cone round the Sun–Earth line and 15° round L3. The swarm then stops
> where Mercury's rock runs out, at 83 % of the Sun; see `docs/full-swarm.md`. This note remains
> the source for the infrared and night-sky physics and the far-side cloud, and describes the
> earlier 1 W/m² budget.

**Answer.** Left alone, industry would build the swarm to about 38 % of the Sun's light (central
case) before it runs out of Mercury's rock. Earth's climate allows **3.8 %**: 1.0×10³⁹ FLOP/s,
reached around 2133, with the sails on Earth's own orbit beyond the Sun and a small shade at L1.
Spread evenly inside Earth's orbit, the same 1 W/m² heat budget allows only 0.53 %.

- **The climate is the limit.** Every watt a sail intercepts leaves it as infrared, and Earth
  absorbs its share. The budget used here is 1 W/m² of extra heat, about a quarter of a CO₂
  doubling.
- **The night sky is not a limit,** only a consequence. At 3.8 % the far-side cloud is a band of
  even light along the ecliptic out to 45° from the Sun, 29 cd/m². When the ecliptic stands upright
  after sunset it lights the ground at 1.9 lux once twilight is over, seven full Moons; when it
  lies along the horizon, almost nothing. (Earlier versions capped the swarm at a full-Moon sky,
  0.25 lux, which held it to 0.41 %.)

This answer comes from a geometry study, `docs/data/earth_safe.json`, and an adversarial review of
it, `docs/data/earth_safe_skeptic.json`. Both ran their own radiative-transfer, orbital-dynamics
and sky-brightness scripts. The review cited climate literature from memory rather than retrieving
it, so its policy numbers (the shade credit below) carry that caveat.

## Why sails heat Earth wherever they are

Every watt a sail intercepts leaves it, as infrared from both faces or as reflected light. Earth
absorbs the share that reaches it.

- **Sail temperature cancels out.** A sail's infrared radiance scales with the sunlight it gets, so
  its distance from the Sun drops out. Only its distance from Earth and which face it shows Earth
  matter.
- **Uniform shell inside Earth's orbit.** The shell sends 3.7–4.2 W/m² of infrared per 1 % of
  coverage. About 40–48 % of that comes from far-side sails whose sunlit, warm fronts Earth sees
  through the gaps. The shell's own shadow removes 2.4 W/m² per 1 %, leaving +1.5–1.9 W/m² net.
- **Fixes that don't help:**
  - A keep-out zone around Earth halves the infrared but also loses the shade.
  - A polar ring cuts the infrared by only 17 %.
  - Shells outside Earth's orbit cut infrared as 1/r², but need r² more film. The fleet Mercury can
    supply then covers only 2 % at 3 AU, 0.8 % at 5 AU or 0.2 % at 10 AU, and lights the whole
    night sky.
- **At the industry's 14 % ceiling** the shell would add about 29 W/m², more than seven CO₂ doublings. The
  22 % ceiling of an earlier parameter set reaches the 282 W/m² runaway-greenhouse threshold.

## The placement that helps: Earth's own orbit, beyond the Sun

Sails can share Earth's orbit at 90–165° and 195–270° of longitude from Earth, ±30° out of the
ecliptic (±60° doubles the room for 6 % more infrared). Filled to 90 %, the ±30° patch holds
18.75 % of the Sun's light; ±60° holds 32 %.

- **Fixed geometry.** They co-orbit with Earth, keep a fixed geometry, never pass in front of the
  Sun, and never come closer than 1.41 AU.
- **Infrared-dark fronts.** Each far-side sail always has both the Sun and Earth in its front
  hemisphere. So the front can be made dark in the infrared and the heat pushed out of the back,
  away from Earth.
  - The only Mercury-native way to do that is a fine Al/Mg mesh (≥ 0.6 µm pitch) in the cover
    glass: emissivity ~0.15, at a cost of 21 % of the cell's current.
  - Indium, tin, zinc and niobium coatings need thousands of times more of those elements than
    Mercury has.
  - The film then runs at ~370 K and the chiplets at 106–112 °C (up to 135 °C if the back
    emissivity is only 0.73).
  - The cost is ~34 % less compute per watt of sunlight.
- **L1 shade.** A small cloud of ordinary sails at the L1 point, 1.6 million km sunward of Earth,
  can offset part of the remaining heat by removing 0.42 % of sunlight per W/m².
  - Trading sunlight for infrared is not neutral. Each W/m² swapped cuts global rainfall ~0.76 %
    and leaves +0.23 W/m² of extra polar heating.
  - So the shade should cancel at most 1.5–2× the heat budget, not all of it.

| Heat budget | Far side, mesh fronts, L1 shade | Shell inside Earth's orbit, no shade |
|---|---|---|
| 0.1 W/m² | 0.38–0.51 % | 0.065 % |
| 1 W/m² | 3.7–4.9 % (1.0–1.3×10³⁹ FLOP/s, ~2200–2250) | 0.5–0.65 % |
| 4 W/m² | ~9.6 % (fleet mass and overlap shading) | 2.5 % |

The model uses the low end: 0.396 W/m² of infrared per 1 % and a shade credit of 1.5×, so 3.8 % at
1 W/m². 20 % would need the ±60° cloud and 8.4 W/m² of infrared; even a shade cancelling 60 % of
it leaves 3.4 W/m², close to a CO₂ doubling, and costs ~3.8 % of global rainfall.

The far-side cloud has costs the shell does not:

- **Collisions.** All its sails share one orbit size. A random cloud at the densities above would
  see 3–56 collisions per sail per year. It needs a collision-free lattice of orbits with
  metre-level navigation.
- **Debris toward Earth.** Each lost sail sheds ~69 dense parts, and lost parts drift within
  0.035 AU of Earth. Keeping their impacts below 10 % of the natural flux needs an uncontrolled-loss
  probability of 10⁻¹⁴–10⁻¹² per sail, so derelicts must be captured within weeks. The shell sends
  nothing toward Earth.
- **Stray near-infrared.** Near-infrared reflected by sails within 15° of L3 comes back toward
  Earth, so that region must stay empty.
- **Earth links.** Earth links need relay craft, because sail terminals face away from Earth.

## What it looks like from Earth

- **At night.** The far-side cloud is a thin layer of sun-facing sails, so from Earth each line of
  sight that meets it sees a Lambertian sail front at full sunlight over a fraction tau of its
  area: a band of even light, tau·rho·S/π, along the ecliptic from 7.5° to 45° either side of the
  Sun, 14–22° above and below it. Its edges are as sharp as the orbits that bound it, softened only
  by a few degrees of orbital scatter (`render/sky_map.py`).
  - At 3.8 % and reflectance 0.004: 29 cd/m², ~170,000 times the natural night sky.
  - Ground illuminance with the ecliptic upright: 3.8 lux with the Sun 6° down, 1.9 lux at 18°,
    0.6 lux at 30°, nothing past 45°. With the ecliptic at 25° to the horizon (autumn evenings at
    mid-northern latitudes), a fifth of that at 18°.
  - The study's own figure, 0.31 lux per 1 % at 18°, is the same model without the empty gap
    around L3; with it, 0.368.
  - The shell glows instead as a uniform disc out to asin(r) from the Sun, about 60°: 0.9 cd/m² at
    0.41 %, 0.61 lux per 1 % on the ground at 18°.
- **By day.** Nothing to the eye. No shadows, transits or flicker for the far-side cloud. For the
  shell, transits last ~1.4 h with flicker near 2×10⁻⁷.
- **In the infrared.** The glow is ~1.5 W/m²/sr per 1 % with low-e fronts, or 7.5 with glass
  fronts. It is invisible to the eye.

## Policy choices the page exposes

| Setting | Default | Why |
|---|---|---|
| Sail visible reflectance | 0.004 | Design-spec floor 0.0024–0.0056 |
| Extra heat allowed on Earth | 1 W/m² | Comparable to recent decades of human forcing growth; 0.1 and 4 W/m² are shown for contrast |
| Placement | far side | 7× the shell's coverage within the same heat budget; costs a shade, a collision-free lattice and derelict capture |
| L1 shade credit | 1.5× the budget | Precipitation and polar residuals cap it near 1.5–2× |

## Open questions

- A general-circulation-model ensemble (GeoMIP-style) for infrared added at night with sunlight
  removed by day.
- Measured emissivity of the hot mesh front and the 15 µm back enamel.
- Where the mesh sends visible light. About 21 % of the front is aluminium lines. Their coherent
  mirror reflection, ~4 %, goes straight back to the Sun (it makes the counter-sun inside the cloud
  magnitude −20.5). The rest of what they reflect goes into diffraction orders if the mesh is
  periodic, or scatters if it is random. Scattered diffusely it would raise the sails' visible
  reflectance from 0.004 toward ~0.1 and the night glow with it; a periodic pitch ≤ 0.6 µm keeps
  the first orders beyond ~42°, out of Earth's view.
- Collision-free lattice design and derelict capture for a dense co-orbital cloud.
- Directional emitters (angle-selective back coatings) could give ~1.75× more compute per W/m² than
  mesh fronts, without hot chips or PV loss.
