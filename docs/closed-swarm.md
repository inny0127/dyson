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
- **Mirror sails fill the part Earth can see,** at 0.98 AU, keeping pace with Earth (the "cap").
  - Its areal mass is fixed by its orbit. To go round in a year at 0.98 AU, sunlight must carry
    β = 1 − 0.98³ = 0.059 of its weight: 26 g/m² for a mirror. Each element flies its own orbit,
    inclined so that it drifts north and south through the cap once a year, and the elements are
    phased so the cap stays filled. Its edge is soft over about a degree.
  - 2.8×10²⁰ kg, under 1 % of the swarm.
  - Its inner face (aluminium under a dielectric stack, 96 % reflective) returns sunlight into the
    swarm and radiates what it absorbs back inward. Behind it, 40 layers of 0.65 g/m² aluminium
    foil (0.24 µm) insulate the cold back. Silver would reflect better, but silvering 10²² m² of foil
    takes far more silver than Mercury holds (about 10¹⁶ kg); aluminium is 5–7 % of its crust.
- **Windows are mirror elements turned edge-on.** Earth's is 20,300 km in radius: Earth's own
  radius plus the 0.27° spread of the Sun's disc over the 3.0 million km to Earth, so every point
  on Earth sees the whole Sun. The Moon gets its own, 15,700 km, which crosses the cap once a month
  as the elements in its path turn and turn back. Any other window is made the same way.
- **The mass:** 3.61×10²² kg finished, against 3.38×10²² kg from Mercury's crust and mantle. The
  last 7 % comes from the core (below).

## Built symmetric, stage by stage

The sphere is built up evenly: at every stage it is the same in every direction, only fuller. Its
coverage f is the share of the Sun's light that hits a sail.

- **From Earth**, just outside the sphere, every line of sight within ~72° of the Sun crosses the
  near side, which shows Earth its sails' backs, and then the far side, which shows their sunlit
  fronts.
  - The night glow is the far side's lit share seen through the near side's gaps:
    **L = f (1 − f) ρ S / π**, with ρ = 0.004 (all hardware) and S at 0.95 AU. It peaks at
    f = ½ (45 cd/m², ~24 lux on the ground at the end of twilight) and is the same at f and 1 − f.
  - Starlight from behind the sphere dims as (1 − f)²; the zodiacal dust and the planets outside
    it are lit by what escapes, 1 − f.
  - Earth's own sunlight is untouched: sails on the line from the Sun to Earth turn edge-on as they
    cross it, at every stage.
- **Earth's heat:** the part of the sphere Earth can see (23° round the Sun–Earth line) is flown
  by mirror sails with cold backs from the start, at the same coverage as everywhere else.
  - Through their gaps Earth sees the far side's fronts. The fronts are kept dark in the infrared
    (switchable emittance, ε 0.1, as on spacecraft radiators today) while the sphere is open.
  - Heat on Earth: f · 0.45 + f (1 − f) · 0.1 σ T(f)⁴ · 0.226 W/m², where 0.226 = sin²(72°) / 4
    is a wall filling the 72° disc, averaged over Earth.
  - It peaks at **8.6 W/m² at half closed** (2173). Earth's window is narrowed 3.6 % to cancel it,
    which costs ~6 % of the world's rain unless the swarm supplies it (below).
  - With identical compute sails everywhere, Earth would see the hot backs between it and the Sun:
    f · 0.9 σ T⁴ · 0.344, over 500 W/m² once closed.
- **The cost of dark fronts:** a lone sail with a dark front radiates only from its back, at
  382 K instead of 332 K. That costs about a third of the computing while the sphere is sparse;
  once it is closed the fronts face each other and the difference vanishes.
- **The stages** (central assumptions):

| Coverage | Year | Night glow (cd/m²) | Heat on Earth (W/m²) | Window narrowed |
|---|---|---|---|---|
| 10⁻⁶ | 2116 | 0.0002 (the dark sky's own) | 0.00003 | — |
| 10⁻⁴ | 2129 | 0.018 | 0.003 | — |
| 1 % | 2141 | 1.8 | 0.28 | 0.12 % |
| 50 % | 2173 | 45 | 8.6 | 3.6 % |
| 99 % | 2213 | 1.8 | 0.83 | 0.35 % |
| closed | 2216 | 0 | 0.56 | 0.24 % |

## How complete the enclosure is

- **Everything is caught except what leaks out on purpose.**
  - Earth's window passes π (20,300 km)² of a sphere 0.98 AU in radius: **4.8×10⁻⁹** of the Sun's
    light. The Moon's adds 2.8×10⁻⁹.
  - The cap's cold back sheds 1.4 W/m² over its 1.1×10²² m²: 4×10⁻⁵ of the Sun's output, as
    170 K infrared. The model's `closedRoom` is 0.99996.
- **The cap is part of the enclosure, not a gap in it.** From 1 AU, Earth can see the outside of a
  0.95 AU sphere only within acos 0.95 = 18.2° of the Sun–Earth line. Anything in that region shows
  Earth its outer face.
  - Compute sails there would send Earth about 540 W/m² from their 419 K backs, more than twice the
    sunlight it absorbs.
  - Compute sails with insulated backs, radiating only into the cavity, would run at about 489 K.
    That is wasted on chips that hot.
  - Mirrors that hand their sunlight to the 419 K sails behind them lose nothing. So the cap is
    made of mirrors.
- **Why 23° and not 18°:** the sails' bands spread down to 0.92 AU, and acos 0.92 = 23°.

## Windows in real time

- **A window is mirrors turned edge-on while they cross a line of sight.**
  - The cap's mirrors drift north and south through it once a year, on orbits inclined up to 23°.
  - A mirror crossing the Sun–Earth line moves at up to 0.4° a day (12 km/s), so it spends about
    an hour in Earth's 40,600 km-wide window, then turns back.
  - Mirrors with smaller inclinations cross more slowly; the few within 0.008° of the line stay
    edge-on.
  - The window can take any size or shape at any moment. It follows Earth, and the Moon's window
    crosses the cap once a month.
- **Earth's orbit is not a circle.** It runs from 0.983 to 1.017 AU. The cap's mirrors share
  Earth's eccentricity, so the cap stays about 3 million km sunward of Earth all year.
- **Windows elsewhere:** compute sails on the line to a target turn edge-on as they pass through it.
  - Mars, 0.57 AU beyond the swarm, needs a window 260,000 km in radius to see the whole Sun:
    8×10⁻⁷ of the swarm's light (`Other worlds` below).
  - A spacecraft or telescope needs a pinhole.

## Steering climate

- **The global dial:** Earth's window. Narrowed or part-turned, it dims all of Earth. Mirrors round it
  tilted toward Earth add light.
- **Placing light region by region:** no optical system can focus sunlight into a spot narrower than
  its distance times the Sun's angular size, 0.53°. That is conservation of étendue (radiance): the
  Sun is not a point.
  - From the cap, 3 million km out, the smallest spot is 28,000 km across.
  - Relay mirrors in Earth orbit, fed through a window widened to cover their orbits, do better:
    90 km spots from 10,000 km up, 9 km from 1,000 km (`docs/full-swarm.md`).
  - Laser light is not bound by the Sun's size. Sunlight converted to laser light at ~10 % and
    beamed from a 1 km aperture 3 million km away makes a spot 2.44 λ d / D ≈ 7 m at 1 µm.
  - The laser stations sit in the cap. Only the cap can see Earth: from 1 AU the outside of the
    0.95 AU sphere is visible only within 18° of the Sun–Earth line. The compute sails beam power
    to the stations over the same laser links they already use.
  - 50 W/m² on a million km² is 5×10¹³ W of light, 5×10¹⁴ W of sunlight: about 10⁻¹² of the
    Sun. Land and sea absorb laser lines as well as sunlight, and plants grow under red and blue.
- **Water:** rain can be supplied as well as moved.
  - Evaporating 1 m of sea water a year over 10⁷ km² is 10¹⁶ kg × 2.45 MJ/kg per year =
    8×10¹⁴ W (2×10⁻¹² of the Sun). Heating the right ocean upwind puts the moisture where the
    winds carry it.
  - To make it fall, a beam at a wavelength the air absorbs (a water-vapour band in the infrared)
    heats a column of air rather than the ground. Warmed a few kelvin, it rises, cools adiabatically
    and rains out its water: the trigger of an afternoon thunderstorm, placed where it is wanted.
- **Chaos cuts both ways.** Weather cannot be forecast beyond about two weeks. For the same reason,
  small, well-timed inputs can steer a chaotic system, if it is observed completely and the inputs
  can be placed fast; that is the basis of chaos control (Ott, Grebogi and Yorke 1990). Nobody has
  steered weather this way. Physics allows it; climate models have not tested it.
- **What stays hard:**
  - Knowing what you will get.
  - Monsoons, which shading land weakens.
  - Storm tracks, which light shifts only a few degrees.
  - Water conservation: rain moved to one place is taken from another unless more is evaporated.

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
- **The cap's back is the only part of the swarm Earth sees.** Every line of sight from Earth that
  meets the outer shell (0.98 AU) meets it inside the cap, so the cap fills the sky out to the
  shell's limb, asin(0.98 / d) from the Sun with Earth d AU out: **78.5°** at 1 AU, 74.6° in early
  July and 85.3° in early January, when Earth passes 0.003 AU outside the shell.
  - Its inner face absorbs 4 % of the sunlight and runs at ~500 K; ε 0.03 per foil face lets
    1.4 W/m² through to the outer layer, at about 170 K. Earth, averaging over its globe, receives
    0.40 of that: **0.56 W/m²**.
  - A shade of 0.24 % of the sunlight, or a window a hair smaller, cancels it.
- **Night:** the sky within that limb is black.
  - At mid-latitudes on a summer evening, at the end of twilight, the black reaches some 57° up the
    western sky. At midnight at 44° N it is still 52° up the northern sky in June and 16° up in
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
  swarm 30 % of the world's rain is down to 0.56 W/m², about 0.4 % of rain. Shading is now a
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
    hidden out to the sphere's edge, asin(0.98 / d) from the Sun for Earth d AU out);
  - Jenny Lake at the end of twilight, with the same exposure as tonight;
  - `render/leo_view.py --glow closed`: Earth's night side from 400 km before dawn, the black dome
    and its rim against the Milky Way;
  - `render/closed_inside.py`: inside the enclosure, 800 m sunward of the innermost sails;
  - the Mediterranean frames at full sunlight.
