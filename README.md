# A Dyson Swarm, Made Real

A Dyson swarm built the way the numbers say it has to be built. Solar sails that are also computers
are made from Mercury's rock and flown around the Sun. Every photograph, temperature, date and
FLOP/s on the page comes from one physics model (`src/model/hybrid.js`), and every photograph is
path traced in Blender at the Sun's true brightness for the orbit.

## Run it

No build step. Serve the folder and open it in a browser:

```sh
npx serve .            # or: python3 -m http.server
```

```sh
node --test                              # pins the model to the research values
node scripts/report.mjs NUMBERS.md       # regenerate the written numbers
node scripts/export-numbers.mjs          # model numbers for the Blender scenes (render/numbers.json)
node scripts/shot.mjs buildout out.png   # headless screenshot of a page section
blender -b --python render/sail_shot.py -- out.png --era mid --view overhead_glint
blender -b --python render/earth_sky.py -- dusk.exr --sun-alt -9 --glow shell --exposure 7 --exr
blender -b --python render/develop.py -- dusk.exr dusk.png --exposure 7
```

## What the numbers say

See [NUMBERS.md](NUMBERS.md) for the tables and `docs/` for the research. The short version:

- **The satellite is a sheet, not a box.** Each sail is a 279 m square of photovoltaic film, 80 µm
  thick, carrying ~10⁸ chiplets of 0.15 W. A thin film cannot carry heat sideways, so chips are
  spread through it and the film is its own radiator. That beats concentrating chips in
  radiator-cooled modules by 3–5× per kilogram, in every hardware era
  (`docs/architecture.md`). A few percent of chip power still goes to shielded pods.
- **Today's hardware never flies.** Industry needs most of a century to reach Mercury's heat wall
  and another seventy years to close the Sun, so almost everything is built with post-2095 hardware.
  HBM is gone, chiplets carry non-volatile memory, optical lanes make each sail one machine, and
  silicon stays the only solar cell Mercury can supply. Energy per operation falls ~50×
  (`docs/future-tech.md`).
- **Heat per kilogram, not Mercury's size, sets the pace.** Mercury can shed at most ~5×10¹⁸ W,
  and only paved with radiators heat-pumped to ~1,650 K; at 2,000 K it is still under 10¹⁹. So
  almost nothing happens on the surface: rock is dug and thrown unrefined into low orbit at 3 km/s,
  and catapults, refineries and fabs work in orbit. With superconducting launchers at 99 % that
  leaves ~0.1 MJ/kg on the planet (0.3 at 95 %, ~2 for a full surface launch).
- **The page is the swarm's progression.** The sphere is built up evenly, the same in every direction
  at every stage. Its renders show it at a millionth, a ten-thousandth, 1 %, 50 % and 99 % of the
  Sun's light and closed (2116–2361): from Jenny Lake at night, from low orbit, from inside and from
  3 AU in visible light and thermal infrared.
  - From Earth the night glow goes as f (1 − f), the far side's lit fronts seen through the near
    side's gaps. It peaks at 45 cd/m² at half closed and is the same at 1 % and 99 %.
  - Starlight from behind dims as (1 − f)².
  - Earth's extra heat peaks at 8.6 W/m² at half closed (fronts kept dark in the infrared while
    open, mirror sails in the part Earth sees). Earth's window is narrowed 3.6 % to cancel it.
- **Closing it costs π/2 in sails.** Every sail orbits on a great circle and any two cross, so a
  closed sphere of orbiting sails must overlap: bands covering a sphere have widths adding up to at
  least π (proved in 2017). Flown as ~6,400 formation bands a kilometre apart in radius (a shell
  ~7,000 km thick), 36 % of the sails sit edge-on behind others at any moment. 5.2×10¹⁸ sails,
  5.7×10²² kg.
- **The finished swarm encloses the Sun** (`docs/closed-swarm.md`). Compute sails cover the whole
  sphere at 0.95 AU except a cap 23° round the Sun–Earth line, where co-orbiting mirrors at 0.98 AU
  (26 g/m², the mass their orbit allows) return the sunlight to the swarm and hide its hot backs from
  Earth. Windows are mirrors turned edge-on: Earth's lets its sunlight through in full.
  - Closed in **2361**, at 1.9×10⁴⁰ FLOP/s.
  - All the heat leaves through the backs, so the film runs at 419 K and the chips near 155 °C. Each
    watt computes 19 % less than in a swarm left open toward Earth; catching all the light, it
    computes about the same in total. Closure buys control, not computing.
- **It takes nearly all of Mercury.** The crust and mantle (3.4×10²² kg of spacecraft) run out at
  75 %, in 2200. The core's ~6 % silicon, lifted at four times the heat per kilogram, closes the
  rest by 2361: 93 % of the planet in all.
- **Sails last centuries.** Every wear mechanism but solar-wind sputtering (0.02 nm a year) can be
  repaired in place: cells annealed, wiring cut below the Blech length, resistive memory, crack-stopped
  film. The model rebuilds each sail every 300 years, recycling 99 %. The finished swarm then loses
  1.9×10¹⁸ kg a year, which what is left of Mercury covers for ~1,200 years.
- **Earth keeps its sunlight; the night loses its stars round the Sun.** Earth sees only the cap's cold
  back: 0.56 W/m², cancelled by narrowing the window 0.24 %, at a cost of 0.4 % of rain.
  - At night the sky within 75–85° of the Sun (by season) is black.
  - The zodiacal light and the planets are gone.
  - The solar wind stops.
  - The window is a whole-Earth climate dial.
  - The near-uniform swarm, left open toward Earth, remains a choice: 85 % of the Sun, with an L1
    shade taking 20 % of Earth's sunlight and about 30 % of its rain (`docs/full-swarm.md`).
- **Regional climate control** is physically cheap but limited by aim and by the atmosphere: L1
  shades blur over 14,000 km, orbital mirrors at 1,000–10,000 km over 9–90 km. Temperature follows
  placed sunlight; winter rain does not (`docs/full-swarm.md`).

## Layout

| Path | What it is |
|---|---|
| `index.html`, `src/app.js` | the page: a photo essay told in time, with a year dashboard that follows the story, deep-dive boxes, a choice of swarms, live charts and the assumptions drawer |
| `src/model/` | `hybrid.js` (model v4: sails, pods, eras, build-out), `model.js` (radiosity, logistics, Mercury, Earth), `sat2.js`, `constants.js` |
| `src/ui/` | SVG charts and the assumptions drawer |
| `test/` | `node --test` suites pinning the model |
| `render/` | Blender scenes, each lit only by what the model says is there: `sail.py` + `sail_shot.py` (compute sail, visible and LWIR), `pod.py` (1 MW pod, visible and LWIR), `swarm_field.py` (the sky inside the layout within Earth's orbit: sails as stars, the counter-sun and its glint halo), `farside_field.py` + `farside_sky.py` (the sky inside the far-side cloud: the layer's glow, the rest of the cloud seen through the inside of Earth's orbit, near sails as squares), `mercury.py` (globe), `earth_sky.py` (Jenny Lake at dusk and night, tonight vs with the swarm, and with the Sun enclosed), `leo_view.py` (the swarm from low Earth orbit: Earth's night side, the Moon, the planets), `closed_inside.py` (inside the enclosure), `sphere_space.py` (the sphere from 3 AU, visible and thermal). Support: `atmosphere.py` (multiple-scattering sky, Hillaire 2020) and `sky_map.py` (twilight, swarm glow, Milky Way, airglow, stars), `teton_prep.py` (lake bed, cobble beach), `ephem.py` (Sun and sidereal time), `lib.py` (physical sun, metering, materials), `develop.py` (EXR to photo: exposure, white balance, AgX), `glare.py` (lens glare), `post.py` (camera effects) |
| `renders/` | finished photographs used by the page |
| `docs/` | `architecture.md`, `future-tech.md`, `earth.md`, `full-swarm.md`, `closed-swarm.md`, and `data/` with every study's numbers and sources |
| `assets/` | MESSENGER, Blue Marble, USGS terrain, star catalogue and Milky Way data with credits |
| `scripts/` | report, numbers export, screenshot, artifact staging (content-stamped filenames), `stage-renders.sh` and `finish-renders.sh` |

## How the numbers were checked

Each question was answered by a research pass that ran its own scripts and cited sources, then
attacked by an adversarial pass that recomputed the key numbers. The questions were:

- thermal placement;
- Mercury and logistics;
- concentrated vs distributed compute;
- the sail design;
- eight studies of future hardware;
- Earth-safe orbits.

Corrections from those reviews are applied in the model, and the tests pin the results.
