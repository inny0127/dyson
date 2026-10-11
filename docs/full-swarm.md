# A near-uniform swarm from Mercury, and an Earth climate by design

The question: what stops us from taking Mercury apart and flying a near-uniform swarm round the
Sun, given that Earth's extra heat can be offset by blocking sunlight? This note ranks the real
limits and what each costs. The model (`src/model/hybrid.js`, placement `uniform`) uses its numbers.

## The limits, ranked

| Limit | Binds at | Lever |
|---|---|---|
| Room round the Sun | 85 % of the Sun's light | Geometry: 94 % of the sky is usable, filled to 0.9 |
| Mercury's silicon | 41 % with the design-spec film; 83 % with a film half as heavy | Film mass, launch efficiency, recycling |
| Heat on Mercury | Sets the pace (2143 heat wall), not the size | Launcher efficiency |
| Earth's heat | Never, with a shade | Costs sunlight and rain (below) |
| Energy | Never | Mercury's binding energy, 1.8×10³⁰ J, is 1.6 hours of an 83 % swarm's output |

### Room

- The sails fly at 0.95 AU, each facing the Sun, all round it.
- Two regions stay empty:
  - **23° round the Sun–Earth line**, i.e. acos(0.92) for sails between 0.92 and 0.98 AU. Inside that
    cone a sail would show Earth its hot back.
  - **15° round L3**, where near-infrared reflected by the sails would come back to Earth.
- That leaves 94.3 % of the sky round the Sun.
- Sails fill at most 0.9 of their patch without shading one another, so the room is 85 % of the
  Sun's light.
- **Orbits.** Sails that cover every latitude must not cross one another's paths.
  - Nested bands at different radii never intersect.
  - Radiation pressure on a 0.1 kg/m² sail (4.7×10⁻⁵ m/s² at 1 AU) can hold it up to ~10⁶ km out of
    its orbital plane.
  - So about 600 bands, each about ±200,000 km wide and about 150 km apart in radius, can tile the
    sphere in a layer about 10⁵ km thick. Holding a sail 200,000 km out of plane takes a tilt of ~10°,
    which costs 1.5 % of its power.

### Mercury's silicon, not Mercury's mass

- **The film is mostly silicon and glass.** In the design spec it carries 70 g/m² of crystalline
  silicon and 50 g/m² of cover glass, 207 g/m² in all.
- **Mercury's rock is 8.0×10²² kg.** That is its crust and mantle, 24 % of the planet, with about
  25 % silicon by mass.
- **With the design-spec film the rock runs out at 41 % of the Sun.**
  - The standing fleet at that size is 2.5×10²² kg.
  - Replacements eat the rest: sails are re-skinned every 15 years and 6 % of each is lost.
- **A film half as heavy takes it to 83 %, just short of the room.**
  - It uses 10 µm of light-trapped silicon instead of 30 µm, 8 µm of glass instead of 20 µm, and
    6 µm of back enamel instead of 15 µm.
  - It costs about 5 % of the cells' efficiency.
  - The thinner glass lets through more solar protons, so the cells must be annealed at each refresh.
  - In the model this is `filmThin` 0.52; the 2026 hardware keeps 1.
- **The core does not help much.**
  - It is 2.5×10²³ kg, 76 % of the planet.
  - It is iron with about 4–8 % silicon. Published estimates span under 1 % to 25 %; see
    [Chemical composition of Mercury](https://arxiv.org/pdf/1712.02187) and
    [Elusive origin of Mercury](https://arxiv.org/pdf/1712.08234).
  - Its silicon is about three quarters of the mantle's, but each kilogram of it comes with ~16 kg of
    iron.
  - Lifting that iron leaves about four times the heat on Mercury per kilogram of silicon that
    mantle rock does.
  - So the core is the swarm's reserve for replacements once the mantle is gone, not its main supply.
  - Its iron is useful for back enamel, structure and shielding, and as reaction mass.
- **Taking the whole planet apart is possible.**
  - The energy is negligible.
  - The core is molten at 1,800–2,000 K, so it is launched hot and its heat leaves with it.
  - At the heat wall below, digging out the whole planet takes about two centuries.

### Heat on Mercury

- **Why it is a wall.** Mercury can shed 5×10¹⁸ W with its surface paved with radiators heat-pumped to
  about 1,650 K. Every kilogram mined leaves heat behind, so the mining rate has a ceiling.
- **The heat per kilogram is mostly launcher losses.**
  - At 95 % efficiency, digging plus a 3 km/s launch leave 0.3 MJ/kg.
  - Superconducting linear launchers with SiC converters at 99 % bring that to about 0.1 MJ/kg.
  - That raises the export ceiling three times, to 5×10¹³ kg/s mined.
- **Timeline.** With the model's central industry the swarm reaches:
  - 10 % of the Sun in 2147;
  - half in 2174;
  - 83 % in 2198, when the rock runs out.
- **Could the rock carry the heat away?** Dumping waste heat into the outgoing rock does not work for
  the launcher. Its coils need to stay cold, so the rock would have to be heated through a heat pump,
  which costs more than it removes.
- **Other estimates are faster.** Armstrong and Sandberg (2013) estimate Mercury's disassembly in
  ~31 years. That figure comes from secondary summaries of their paper, not its text. It does not
  appear to include waste heat on Mercury, which here is what sets the pace
  ([Eternity in six hours](https://www.practicalethics.ox.ac.uk/node/174891)).

## Why a slit works only with infrared-dark fronts

- **Earth absorbs the infrared of every sail it can see.** A sail between Earth and the Sun shows
  Earth its hot back. A sail elsewhere shows its front.
- **A keep-out cone of acos(r) hides every back.** Earth then sees only fronts.
- **So the front decides the infrared Earth gets:**
  - An ordinary glass front (emissivity 0.85) radiates nearly as much as the back.
  - The Mercury-native aluminium/magnesium mesh front (0.15) pushes most of the heat out of the back.
- **Earth's infrared per 1 % of the Sun's light:**

| Layout | Fronts | W/m² per 1 % | Sunlight the sails themselves block |
|---|---|---|---|
| Even shell, 0.9 AU | glass | 5.4 | 1 % per 1 % |
| Even, minus the cone | glass | 2.2–2.7 | none |
| Far side of Earth's orbit, ±60° | mesh | 0.42 | none |
| **Near-uniform, minus the cone and L3** | **mesh** | **0.56** | **none** |

- **How the last row was computed.** It is the integral of cos θ / D² over the visible fronts,
  scaled to the far side's 0.42 W/m² per 1 % ([earth.md](earth.md)).
- **The mesh fronts cost compute.** At 1 AU a sail with them runs its chips at about 106 °C and
  computes 34 % less per watt; at 0.95 AU the film is ~10 K hotter, the chips ~115 °C, and the loss
  40 % (`darkFrontFactor`). The near-uniform swarm at 83 % still does 1.9×10⁴⁰ FLOP/s, 1.6 times the
  far-side-plus-spill layout at 39 %.

## Why 0.95 AU

- **Nearer the Sun** each square metre catches more, so the same rock catches more of the Sun (film
  per watt ∝ r²). But the film runs hotter (∝ r^−½), costing cells and logic, and the gap round the
  Sun–Earth line must widen (acos r), leaving less room.
- **The result** (`orbitChoice`, central case): from 0.95 to 1 AU the finished swarm computes the
  same, ~1.9×10⁴⁰ FLOP/s, because the cooler chips pay for the extra film. Inside 0.95 AU the room
  runs out before the rock and computing falls: 1.8×10⁴⁰ at 0.92 AU, 1.7×10⁴⁰ at 0.90 AU, with chips
  at 122–126 °C.
- **0.95 AU is the innermost orbit on the flat top.** It catches the most sunlight for the same
  computing, keeps the nearest sails 0.39 AU from Earth (0.24 AU at 1 AU), and holds the chips at
  ~115 °C, under the 125 °C ceiling for dense, efficient logic (`docs/data/future/hot_power.json`).

## Service life and replacement

- **Physical life:** 20–30 years. Cells keep ~92 % of their output after 10 years; film chiplets take
  140–470 krad a decade; micrometeoroids hole the film.
- **Economic life:** refresh when the new chips' gain beats the recycling loss,
  a* = ln(1/ρ) / ln(1 + g). With ρ = 0.94 and g of a few tenths of a per cent a year (mature logic near
  its floor), ~15 years (`docs/data/future/manufacturing.json`).
- **In the model:** exports retire L years later and ρ returns to production. During growth,
  replacement is 2^(−L/T_d) of output (0.36 % here); after the heat wall it passes half within one
  life; the unbounded fleet would level off at export × L / (1 − ρ) = 1.5×10²³ kg, so the rock runs out
  first, after which the fleet shrinks by (1 − ρ)/L = 0.4 % a year (half-life ~170 years).

## Asteroids and other sources after the rock

- **Need:** at the finished size refreshes lose ~1.2×10²⁰ kg of spacecraft a year, ~7×10¹⁹ kg of
  silicon.
- **The main belt** is 2.39×10²¹ kg (±20 %), 39 % of it Ceres
  ([Pitjeva and Pitjev 2018](https://arxiv.org/pdf/1811.05191)), mostly carbonaceous rock and ice at
  ~10–15 % silicon: ~3×10²⁰ kg of silicon, about four years of repairs. No gravity well and no heat
  wall, ~11 km/s to reach 0.95 AU, easy for a sail.
- **What asteroids are good for** is volatiles: Mercury has ~5×10¹³ kg of hydrogen; Ceres probably
  holds ~10²⁰ kg of water.
- **Bulk silicon after Mercury's rock:** Mercury's core (~1.5×10²² kg Si, ~200 years), the Moon
  (~1.5×10²², ~200 years, escape 2.4 km/s), Mars (~10²³, ~1,400 years, 5.0 km/s), Venus (~7×10²³,
  ~9,500 years, 10.4 km/s under 90 bar). Recycling at 99 % instead of 94 % cuts the need six-fold.

## Holding Earth's temperature

- **The heat to cancel.** At 83 % Earth absorbs 46.8 W/m² of extra infrared, 12 times a CO₂ doubling.
- **The shade.** A cloud of sails near L1 cuts 19.6 % of the sunlight Earth absorbs and Earth's mean
  temperature stays where it is.
  - Its area is about 6×10⁷ km²: Earth's cross-section × 0.196, × 2.5 because radiation pressure holds
    the shade sunward of L1. At 1 g/m² that is 6×10¹⁰ kg, 2×10⁻¹² of the swarm's mass.
  - The shade's sails can compute too.
- **The cost is not temperature but its pattern.**
  - **Rain.** Sunlight drives evaporation; infrared absorbed in the air mostly doesn't. Per W/m²
    swapped, global rainfall falls ~0.76 %. The loss saturates, giving about −30 % at 46.8 W/m². The
    linear rate comes from GeoMIP-type balanced experiments at a few W/m²; extrapolating it to 47 is
    the least certain number here.
  - **Pattern.** The infrared arrives from round the Sun, on the day side, much like sunlight. Even so,
    uniform dimming leaves the poles about 0.23 W/m² warmer and the tropics 0.16 cooler per W/m²
    cancelled: +11 W/m² at the poles at 83 %. A shaped shade can remove much of this (next section).
  - **Light for plants.** 20 % less sunlight costs light-limited crops a few to ten per cent of yield.
- **Blocking the infrared instead does not work.**
  - A filter round Earth that turns the swarm's 8 µm infrared away would also turn back Earth's own
    10 µm emission along the same paths (reciprocity).
  - The swarm fills most of the sunward sky, so it would trap a large share of Earth's heat.
  - The knobs are sunlight, and the emissivity of the sails' fronts at the source.
- **Fail-safe.**
  - If the shade failed, 47 W/m² would arrive unopposed: catastrophic within years.
  - But the swarm can switch its heat off: a sail turned edge-on to the Sun cools in minutes.
  - So any shade outage can be matched within the hour by feathering an equal share of the swarm, at
    the cost of its compute. Termination shock becomes a control problem, not a cliff.

## Shaping Earth's climate region by region

- **The energy is trivial.**
  - Adding 50 W/m² of daylight averaged over a million square kilometres takes 5×10¹³ W of reflected
    sunlight.
  - That is 2×10⁻¹³ of the swarm's output, and ~10¹⁰ kg of mirrors in Earth orbit (they are over
    their target about 1 % of the time).
- What limits regional control is how sharply light can be aimed, and how the atmosphere answers.

### How sharply sunlight can be placed

- **The blur.** The Sun is 0.53° across, so a shade or mirror at distance d blurs its shadow or spot
  over about 0.0093·d.

| Where | Blur | What it can control |
|---|---|---|
| L1, 1.5 million km | 14,000 km, more than Earth | Global level, the north–south split, seasons |
| 10,000 km orbit | 90 km | Regions, countries |
| 1,000 km orbit | 9 km | Valleys, cities, single farms |

- **What L1 shades can do.** They can only move their shadow's weight across Earth's disc. Two
  shades on tailored orbits near L1 kept nearly 40 % of the surface within 0.1 K of its original
  climate, against under 10 % for a single classical shade
  ([Sánchez and McInnes 2015](https://pmc.ncbi.nlm.nih.gov/articles/PMC4550401/)). That study used a
  simple energy-balance model with fixed circulation.
- **The closest studied analogue: solar reduction shaped by latitude and season.**
  - It cut the worst-off region's residual temperature and rainfall change by ~30 %
    ([MacMartin et al. 2013](https://ideas.repec.org/a/nat/natcli/v3y2013i4d10.1038_nclimate1722.html)).
  - Feedback control at four latitudes held three targets at once: global mean temperature, and the
    north–south and equator–pole gradients
    ([GLENS](https://cesm.ucar.edu/community-projects/glens)).
- **Regional control needs mirrors and shades in Earth orbit.**
  - They are steered toward a target and turned edge-on when not over it.
  - A first 18 m demonstrator with a ~5 km footprint was approved in July 2026
    ([Sky & Telescope](https://skyandtelescope.org/astronomy-news/observers-beware-reflect-orbitals-space-mirrors-approved-for-launch/)).

### What the atmosphere lets you do

- **Temperature: yes, locally.**
  - Surface temperature follows the local energy budget.
  - With tens of W/m² you can raise a region's winter or lower its summer by several kelvin, down to
    the scale of a valley.
  - Snow is the catch. It reflects most added light, so warming a snowy winter first means melting
    the snow.
- **Summer rain: you can take it away.**
  - Shading land in summer weakens the heating that drives convection and the monsoon's inflow from
    the sea. With even global dimming, models show monsoon rain falling 5–7 % over North America and
    East Asia ([NCAR](https://news.ucar.edu/10531/geoengineering-climate-could-reduce-vital-rains)).
  - Shading aimed at land in summer would dry summers further, which is the Mediterranean pattern.
  - But summer convective rain is what the American Midwest, the North China Plain and India farm on.
- **Winter rain: you can barely move it.**
  - It needs an ocean upwind and a storm track overhead. Storm tracks are planetary-scale.
  - Changing the equator–pole gradient by season can shift them, and the subtropical highs, by a few
    degrees of latitude.
  - It cannot bring ocean storms to an interior 1,000 km from the coast.
  - Moisture is conserved, so rain moved to one place is taken from another. Shading one hemisphere
    moves the tropical rain belt away from it: Sahel droughts in the models
    ([Haywood et al. 2013](https://centaur.reading.ac.uk/34613)).

### Can more land be made Mediterranean?

A Mediterranean (Köppen Cs) climate has three ingredients:

- mild winters, with the coldest month between 0 and 18 °C;
- a dry summer under the subtropical high's subsidence, often over a cold current;
- a wet winter, when the storm track swings toward the equator.

Natively it sits on west coasts between 30° and 45°.

- **West coasts 40–55°.** Yes, plausibly: France and Britain, the Pacific Northwest, southern Chile,
  Tasmania and New Zealand.
  - Seasonal shading can push the dry-summer belt poleward by a few degrees.
  - Its equatorward edge then dries toward steppe: Morocco, southern Spain, southern California and
    central Chile.
  - Unless that edge is compensated, this moves the belt rather than enlarging it. Northern-hemisphere
    land is wider at 45–55° than at 30–40°, so the land area in this climate could still grow.
- **Continental interiors** (the American plains, Central Asia, Siberia's south). Only half of it:
  - The temperatures can be made Mediterranean: winter light added, summers capped.
  - The summers can be dried by shading.
  - The winter rain cannot be supplied.
  - **Water is cheap with this much energy.** Desalinating and pumping 500 mm a year onto ten million
    km² is about 5×10¹⁵ kg a year: a few TW of reverse osmosis and lift. That is irrigated Mediterranean
    agriculture rather than a Mediterranean climate.
- **What is not known.** No climate model has run orbital shading controlled at country scale. The
  studies above are global and latitudinal. Regional outcomes depend on circulation responses that
  simple models fix and full models disagree on.
- **What would need governance.** One region's new Mediterranean summer is another's lost monsoon,
  and whoever steers the mirrors holds every country's weather.

## What the model and page take from this

- **Default placement `uniform`:**
  - mesh fronts on every sail, `filmThin` 0.52 and `heatPerKg` 0.1;
  - L1 shade free to cancel all the heat (`forcingLimit` 0);
  - result: 83 % of the Sun by 2198, Mercury's rock binding.
- **Alternatives on the page:**
  - the far side alone, 28 %;
  - the gentle 1 W/m² far side, 3.8 %;
  - the slit with ordinary glass fronts;
  - the full shell.
- **Not modelled:** regional control. It is described, with its limits.
