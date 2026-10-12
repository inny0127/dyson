# The closed swarm: the Sun enclosed

The near-uniform swarm (`docs/full-swarm.md`) leaves the sky round the Sun–Earth line empty and dims
Earth by a fifth to cancel the heat it sends. This note asks what it takes to close the gap: wrap the
Sun completely and let sunlight out only where the swarm chooses. Physics is the only constraint.
It is the page's default (`earthPlacement: 'closed'`).

## The layout

- **Compute sails tile the whole sphere at 0.95 AU**, except a cap 23.07° in radius round the
  Sun–Earth line (acos 0.92, the same cut as the near-uniform swarm): 4.0 % of the sphere.
  - They fly in nested bands spread over 0.92–0.98 AU, so gaps in one band are covered by the next.
  - Every sail faces the Sun with an ordinary glass front. No infrared-dark mesh is needed: the
    fronts radiate into the cavity, and other fronts absorb it.
- **A mirror cap fills the gap,** at 0.98 AU, keeping pace with Earth.
  - Its areal mass is fixed by its orbit. To go round in a year at 0.98 AU, sunlight must carry
    β = 1 − 0.98³ = 0.059 of its weight: 26 g/m² for a mirror. Each element flies its own orbit,
    inclined so that it drifts north and south through the cap once a year, and the elements are
    phased so the cap stays filled. Its edge is soft over about a degree.
  - 2.8×10²⁰ kg, under 1 % of the swarm.
  - Its inner face (silver under a dielectric stack, 99.5 % reflective) returns sunlight into the
    swarm. Behind it, 20 layers of 1.3 g/m² silvered foil insulate the cold back.
- **Windows are mirror elements turned edge-on.** Earth's is 20,300 km in radius: Earth's own
  radius plus the 0.27° spread of the Sun's disc over the 3.0 million km to Earth, so every point
  on Earth sees the whole Sun. The Moon gets its own, 15,700 km, which crosses the cap once a month
  as the elements in its path turn and turn back. Any other window is made the same way.
- **The mass:** 3.61×10²² kg finished, against 3.38×10²² kg from Mercury's crust and mantle. The
  last 7 % comes from the core (below).

## Why it runs hot, and why 0.95 AU

- **A closed surface sheds heat only from its outside.** All of the Sun's 3.8×10²⁶ W has to leave
  through the sails' backs: L = 4π r² (1 − cap) ε σ T⁴. At 0.95 AU with ε = 0.9 that is **419 K**.
  A perfect black back (ε = 1) still runs at 408 K. A sparse swarm at the same distance runs at
  332 K, because each sail also radiates from its front.
- **In between,** the model interpolates T⁴ linearly in coverage (`closedFilmT`): a cavity whose
  gaps close.
- **Farther out is cooler** (T ∝ r^−½), but the shell cannot reach Earth's orbit. Enclosing Earth
  would put it inside a ~330 K cavity, and the shell must leave room for the cap and the layer's own
  thickness. 0.95 AU is as far out as it can go.
- **What it costs in computing:** the chips run at about **155 °C** (film plus 9 K), against 115 °C
  in the near-uniform swarm, and hot cells convert less.
  - Each watt of sunlight computes 19 % less than in the near-uniform swarm.
  - Closure catches 18 % more light (all of it, against 85 %).
  - Net: **1.88×10⁴⁰ FLOP/s**, 5 % less than the near-uniform swarm's 1.98×10⁴⁰.
  - The last half of the sky adds only 36 % (half-closed: 1.39×10⁴⁰).
- **So closure is not for computing. It is for control:** every photon that leaves the inner solar
  system leaves through a window the swarm chooses to open.
- **A colder outer layer** (a Matrioshka shell catching the inner one's heat at 100 K from 15.6 AU,
  or 50 K from 62 AU) is a different machine, with far more mass. It is not in the model.

## What Earth sees

- **Daylight is unchanged.** Earth gets its full sunlight through its window. The near-uniform swarm
  had to dim it by 19.6 %.
- **The cap's back is the only part of the swarm Earth sees.** From Earth the cap fills the sky
  within **75.6°** of the Sun.
  - Its outer layer is at about 176 K. It leaks 1.1 W/m², and Earth, averaging over its globe,
    receives 0.40 of that: **0.45 W/m²**.
  - A shade of 0.19 % of the sunlight, or a window a hair smaller, cancels it.
- **Night:** the sky within 75.6° of the Sun is black.
  - At mid-latitudes on a summer evening, at the end of twilight, the black reaches some 57° up the
    western sky. At midnight at 44° N it is still 53° up the northern sky in June and 6° up in
    December; near the equator at the equinox it is below the horizon.
  - Elsewhere the stars and the Milky Way are as they are today.
  - The zodiacal light and the gegenschein are gone everywhere: the dust outside the shell is unlit.
  - The planets go out. Mercury and Venus are inside the shell. Mars and everything beyond get the
    shell's infrared instead of sunlight, and reflect nothing visible.
  - The Moon shines only while its window is open.
  - Airglow is unchanged: it is powered by daytime ultraviolet.
- **The solar wind stops.**
  - The shell absorbs it everywhere except the windows. The column through Earth's window spreads,
    at the wind's ~50 km/s thermal speed, over about 375,000 km by the time it reaches Earth: about
    0.3 % of today's flux.
  - Geomagnetic storms and most aurorae end.
  - With no wind beyond 0.95 AU, the heliosphere is gone, and galactic cosmic rays arrive at 1 AU
    with the spectrum Voyager measured outside it. Earth's field and air still stop most of them.
  - The change should be largest near the poles and on polar flights, and small at the equator. We
    have not modelled it.

## The window as a climate dial

- **Dimming:** narrowing Earth's window, or part-turning the elements in it, dims all of Earth
  evenly from full sunlight to none.
- **Brightening:** a cap mirror tilted slightly sends its light at Earth. From 3 million km its spot
  is 28,000 km across, so about 40 % lands on Earth's disc. The cap can add sunlight to the whole
  planet, but it cannot aim at a region.
- **Placing light region by region** still needs shades and mirrors in Earth orbit
  (`docs/full-swarm.md`, "Shaping Earth's climate region by region"). Closure gives the global dial;
  the orbiting mirrors give the regional one.
- **The swarm barely warms Earth,** so the sunlight-for-infrared swap that cost the near-uniform
  swarm 30 % of the world's rain is down to 0.45 W/m², about 0.3 % of rain. Shading is now a
  choice, not a cost.

## Other worlds

- **Venus** sits inside the cavity. It can no longer cool to space: it radiates into a sky at about
  419 K. Its effective temperature rises from about 230 K to about 428 K, and its surface, already
  737 K, heats further. Venus needs a window of its own, or a sunshade, to stay as it is.
- **Mars** gets the shell's infrared, 586 W/m², the same energy as its sunlight today. Its dust
  absorbs infrared better than sunlight, so it warms from about 213 K to 225 K (equilibrium values).
  - A window toward Mars adds sunlight on top: about 261 K, twice today's energy.
  - The window is about 260,000 km in radius at 0.95 AU, a few millionths of the shell.
- **Icy moons** absorb infrared far better than sunlight: Europa's equilibrium rises from about
  93 K to about 122 K.

## Mercury's core

- **The crust and mantle deliver 3.38×10²² kg of spacecraft** at 0.42 kg per kg of rock. Closure
  needs 3.61×10²² kg.
- **The core is about 6 % silicon** (published estimates 1–25 %), against about 25 % in the rock.
  - The model counts it as rock-equivalent: M_core × 0.06 / 0.25 × 0.42 = 2.52×10²² kg of
    spacecraft.
  - It is dug and launched at the same heat wall, but each kilogram of spacecraft means lifting 4.2
    times as much. The core is lifted whole, at 1,800–2,000 K, and refined in orbit. Its iron is
    kept for shielding and reaction mass.
- **Timeline (central hardware):**
  - heat wall 2145;
  - half the Sun 2173;
  - crust and mantle dug out 2200;
  - closed (99 %) in **2214**.
  - By then 31 % of Mercury has been taken apart. With the mantle alone the swarm stops at 93 %.

## How long a sail lasts: centuries

The question is not what today's designs give (10–30 years, `docs/full-swarm.md`). It is what
physics allows, with repair in place.

| Wear | Rate in the closed swarm (film 419 K, chips ~155 °C) | What stops it |
|---|---|---|
| Solar-wind sputtering of the cover glass | ~0.02 nm a year: 2×10¹² ions/m²/s at 0.95 AU × yield ~0.02 | nothing needs to; 8 µm of glass lasts ~400,000 years |
| Proton damage in the cells | 7.5 % of output a decade behind 20 µm of glass; more behind 8 µm | the film's 146 °C anneals phosphorus–vacancy centres continuously; divacancies and oxygen–vacancy centres anneal at 250–350 °C, which a patch reaches for an hour when the rest of the sail drives ~12 kW/m² through it |
| Electromigration in chip wiring | at 155 °C 25× faster than at 105 °C: a chip built as today's would last ~1.6 years at the sail's 60 % clock | wiring cut into segments shorter than the Blech length (current density × length under ~3,000 A/cm for copper), where back-stress stops migration altogether; it costs routing density, not lifetime |
| Radiation dose in memory | 133–437 krad a decade, unshielded | resistive RAM survives 10–20 Mrad (centuries); data is scrubbed, so retention at 155 °C is not the limit |
| Meteoroid holes | 0.007–1.2 % of the area a year, depending on crack arrest | crack-stopped film keeps the low end, ~2 % in 300 years, patched in place |
| Obsolescence | refresh pays when the chips' yearly gain g exceeds ln(1/ρ) / L | by 2214 chips have long sat at their practical floor; g → 0 |

- **So the model takes a rebuild every 300 years**, with 99 % of each sail recycled in orbit
  (sliders: 0–1,000 years, up to 99.9 %).
  - Between rebuilds, depot craft anneal, patch and swap chiplets.
  - The rebuild exists for slow damage that repair cannot reach: displacement clusters, grain growth,
    accumulated patches.
- **What it buys:** the finished swarm loses 1.2×10¹⁸ kg a year. The core's remaining silicon
  covers that for about 19,000 years. With today's 15-year life and 94 % recycling, the core's
  silicon would go on replacements and the swarm would never close.
- **Eras:** pessimistic hardware gets 50 years and 95 %, optimistic 1,000 years and 99.5 %. The
  2026 bundle keeps 10 years and 90 %.

## What the model and page take from this

- `src/model/hybrid.js`:
  - `earthPlacement: 'closed'` with `closedFilmT`, `closedFactor` and `FIXED.capFrac`, `capR`,
    `capIR`, `capKgM2`, `closedRoom`;
  - `rockSource: 'whole'` with `FIXED.coreSi`, `rockSi`;
  - `minedFor`;
  - `serviceLife` 300 and `recycleFrac` 0.99.
- Tests: `test/hybrid.test.js`, the closed-swarm section.
- Renders:
  - `render/sky_map.py` kind `closed` (no glow, no zodiacal light, no planets; stars and Milky Way
    hidden within 75.6° of the Sun);
  - Jenny Lake at the end of twilight, with the same exposure as tonight;
  - the Mediterranean frames at full sunlight.
