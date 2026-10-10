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
```

## What the numbers say

See [NUMBERS.md](NUMBERS.md) for the tables and `docs/` for the research. The short version:

- **The satellite is a sheet, not a box.** Each sail is a 279 m square of photovoltaic film, 80 µm
  thick, carrying ~10⁸ chiplets of 0.15 W. A thin film cannot carry heat sideways, so chips are
  spread through it and the film is its own radiator. That beats concentrating chips in
  radiator-cooled modules by about 5× per kilogram, in every hardware era
  (`docs/architecture.md`). A few percent of chip power still goes to shielded pods.
- **Today's hardware never flies.** Industry needs half a century to reach Mercury's heat wall, and
  sails are refreshed every 10–20 years, so almost everything is built with post-2095 hardware.
  HBM is gone, chiplets carry non-volatile memory, optical lanes make each sail one machine, and
  silicon stays the only solar cell Mercury can supply. Energy per operation falls ~50×
  (`docs/future-tech.md`).
- **Fabs and recycling, not Mercury's mass, set the size.** Chip fabs slow the industrial doubling.
  The standing fleet levels off where exports plus in-orbit recycling balance retirements. In the
  central case that is about 14 % of sunlight and 6×10³⁹ FLOP/s, reached in the 2400s.
- **Earth is the binding constraint.** Sails spread evenly inside Earth's orbit add about 1.9 W/m²
  of heat to Earth for every 1 % of sunlight they capture. A geometry study moves them to the far
  side of the Sun on Earth's own orbit, with infrared-dark front faces and a small L1 shade.
  Under a 1 W/m² budget that allows roughly ten times more compute (`docs/data/earth_safe.json`).
  The cloud's glow in Earth's night sky may limit it sooner.

## Layout

| Path | What it is |
|---|---|
| `index.html`, `src/app.js` | the page: a photo essay with live numbers, charts and the assumptions drawer |
| `src/model/` | `hybrid.js` (model v4: sails, pods, eras, build-out), `model.js` (radiosity, logistics, Mercury, Earth), `sat2.js`, `constants.js` |
| `src/ui/` | SVG charts and the assumptions drawer |
| `test/` | `node --test` suites pinning the model |
| `render/` | Blender scenes: `sail.py` + `sail_shot.py` (compute sail, visible and LWIR), `mercury.py`, `earth_sky.py`, `lib.py` (physical sun, metering, materials), `post.py` (camera effects) |
| `renders/` | finished photographs used by the page |
| `docs/` | `architecture.md`, `future-tech.md`, and `data/` with every study's numbers and sources |
| `assets/` | MESSENGER, Blue Marble, star catalogue and Milky Way data with credits |
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
