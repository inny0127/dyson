# Earth: how big the swarm may get

**Answer.** Industry can build the swarm to about 14 % of the Sun's light (central case). Earth
allows about **0.4–0.6 %**: roughly 1.7×10³⁸ FLOP/s, reached around 2128. Two limits arrive
together, and the night sky comes first:

- **The night sky.** Sails beyond the Sun show Earth their sunlit faces, so a glow rises where the
  Sun went down. Once the Sun is 18° below the horizon it should light the ground no more than a
  full Moon (0.25 lux).
  - A shell inside Earth's orbit glows as a uniform disc out to asin(r) from the Sun, about 60°.
    It reaches full-Moon light at 0.41 % of the Sun (0.61 lux per 1 % at reflectance 0.004).
  - The far-side cloud's glow is a cone along the ecliptic within 45° of the Sun. It reaches
    full-Moon light at 0.60 % (0.31 lux per 1 % at reflectance 0.003).
  - Both scale inversely with the sail's total visible reflectance, 0.0024–0.0056 (film, hinge
    strips, scribes, hems, vanes).
- **The climate.** Sails spread evenly inside Earth's orbit add about 1.5–1.9 W/m² of heat to Earth
  for every 1 % of sunlight they capture, after subtracting the sunlight they block. A 1 W/m²
  budget therefore allows about 0.5–0.7 %.

The far-side placement lets more sails fly under the same night sky, but its infrared-dark fronts
cost a third of the computing per watt, so both placements allow about the same computing. It buys
more only if a brighter night sky is accepted.

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
ecliptic (±60° doubles the room for 6 % more infrared).

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

- **At night.** After dusk in the west and before dawn in the east, a glow rises along the
  ecliptic out to ~45° from the Sun, brightest near the Sun. It is near-white with a faint
  violet-blue cast, because the hardware, not the navy film, dominates the reflection.
  - Surface brightness is ~1,700 × reflectance cd/m² per 1 % of coverage, a thousand to ten
    thousand times the zodiacal light.
  - For the shell at its 0.41 % limit the disc glows at 0.9 cd/m², 5,000 times the natural night
    sky. The ground gets 0.43 lux at the end of civil twilight, 0.25 lux (a full Moon) when the Sun
    is 18° down, 0.12 lux at 30° and nothing once the Sun is 60° down.
  - North of ~45° in summer the glow never sets.
- **By day.** Nothing to the eye. No shadows, transits or flicker for the far-side cloud. For the
  shell, transits last ~1.4 h with flicker near 2×10⁻⁷.
- **In the infrared.** The glow is ~1.5 W/m²/sr per 1 % with low-e fronts, or 7.5 with glass
  fronts. It is invisible to the eye.

## Policy choices the page exposes

| Setting | Default | Why |
|---|---|---|
| Brightest night sky allowed | 0.25 lux (full Moon) | Natural night sky is ~0.001 lux; any swarm above ~0.01 % changes it. |
| Sail visible reflectance | 0.004 | Design-spec floor 0.0024–0.0056 |
| Extra heat allowed on Earth | 1 W/m² | Comparable to recent decades of human forcing growth; 0.1 and 4 W/m² are shown for contrast |
| Placement | shell | Debris-safe; the far side wins only if the sky limit is relaxed |
| L1 shade credit | 1.5× the budget | Precipitation and polar residuals cap it near 1.5–2× |

## Open questions

- A general-circulation-model ensemble (GeoMIP-style) for infrared added at night with sunlight
  removed by day.
- Measured emissivity of the hot mesh front and the 15 µm back enamel.
- Collision-free lattice design and derelict capture for a dense co-orbital cloud.
- Directional emitters (angle-selective back coatings) could give ~1.75× more compute per W/m² than
  mesh fronts, without hot chips or PV loss.
