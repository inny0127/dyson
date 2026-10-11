# Mercury Swarm Ledger

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
- **Today's hardware never flies.** Industry needs most of a century to reach Mercury's heat wall, and
  sails are refreshed every 10–20 years, so almost everything is built with post-2095 hardware.
  HBM is gone, chiplets carry non-volatile memory, optical lanes make each sail one machine, and
  silicon stays the only solar cell Mercury can supply. Energy per operation falls ~50×
  (`docs/future-tech.md`).
- **Heat per kilogram, not Mercury's size, sets the pace.** Mercury can shed at most ~5×10¹⁸ W,
  and only paved with radiators heat-pumped to ~1,650 K; at 2,000 K it is still under 10¹⁹. So
  almost nothing happens on the surface: rock is dug and thrown unrefined into low orbit at 3 km/s,
  and catapults, refineries and fabs work in orbit, leaving ~0.3 MJ/kg on the planet instead of
  ~2 for a full surface launch. Left alone, industry in the central case would then dig out all of
  Mercury's rock by ~2285, peaking near 38 % of sunlight.
- **Earth's climate is the binding constraint.** Sails spread evenly inside Earth's orbit add
  about 1.9 W/m² of heat to Earth for every 1 % of sunlight they capture, so a 1 W/m² budget
  allows 0.53 %. Moved to the far side of the Sun on Earth's own orbit, with infrared-dark front
  faces and a small L1 shade, they allow 3.8 %: 1.0×10³⁹ FLOP/s, reached around 2133
  (`docs/earth.md`). The night sky is a consequence, not a limit: the cloud is a band of even
  light along the ecliptic, up to seven full Moons on the ground after twilight when the ecliptic
  stands upright. 20 % would need a cloud twice as tall and a planet run 3.4 W/m² hotter.

## Layout

| Path | What it is |
|---|---|
| `index.html`, `src/app.js` | the page: a photo essay with live numbers, charts and the assumptions drawer |
| `src/model/` | `hybrid.js` (model v4: sails, pods, eras, build-out), `model.js` (radiosity, logistics, Mercury, Earth), `sat2.js`, `constants.js` |
| `src/ui/` | SVG charts and the assumptions drawer |
| `test/` | `node --test` suites pinning the model |
| `render/` | Blender scenes, each lit only by what the model says is there: `sail.py` + `sail_shot.py` (compute sail, visible and LWIR), `pod.py` (1 MW pod, visible and LWIR), `swarm_field.py` (the sky from inside the swarm: sails as stars, the counter-sun and its glint halo), `mercury.py` (globe), `earth_sky.py` (Jenny Lake at dusk and night, tonight vs with the far-side cloud), `leo_view.py` (the swarm from low Earth orbit: Earth's night side, the Moon, the planets). Support: `atmosphere.py` (multiple-scattering sky, Hillaire 2020) and `sky_map.py` (twilight, swarm glow, Milky Way, airglow, stars), `teton_prep.py` (lake bed, cobble beach), `ephem.py` (Sun and sidereal time), `lib.py` (physical sun, metering, materials), `develop.py` (EXR to photo: exposure, white balance, AgX), `glare.py` (lens glare), `post.py` (camera effects) |
| `renders/` | finished photographs used by the page |
| `docs/` | `architecture.md`, `future-tech.md`, `earth.md`, and `data/` with every study's numbers and sources |
| `assets/` | MESSENGER, Blue Marble, USGS terrain, star catalogue and Milky Way data with credits |
| `scripts/` | report, numbers export, screenshot, artifact staging |

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
