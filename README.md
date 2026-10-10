# Mercury Swarm Ledger

A 3D visualizer of a Dyson swarm built the way the numbers say it has to be built: every satellite is a
thin-film silicon PV panel with AI chips woven into it, computing locally, made from Mercury.
Every size, temperature, brightness, count and date on screen comes from one physics model
(`src/model/model.js`), so moving a slider moves the whole picture.

## Run it

No build step. Serve the folder and open it in a browser:

```sh
npx serve .            # or: python3 -m http.server
```

Then open the printed URL. Chapters: `#mercury`, `#satellite`, `#swarm`, `#earth`.

```sh
node --test                          # pins the model to independently computed values
node scripts/report.mjs NUMBERS.md   # regenerate the written numbers
node scripts/shot.mjs swarm out.png  # headless screenshot (Playwright + Chromium)
```

## What the numbers say

See [NUMBERS.md](NUMBERS.md) for the full tables. The short version, with default assumptions:

- **A compute swarm cannot hug the Sun.** Silicon chips cap the film near 350 K. A lone panel at
  Mercury's orbit runs at about 536 K. A nearly closed shell can only shed heat outward and runs 21%
  hotter than a lone panel, so the finished swarm sits at about **1.35 AU**: outside Earth's orbit,
  just inside Mars's.
- **The chip temperature, not the orbit, sets the mass.** Rejecting the Sun's 3.8×10²⁶ W at 350 K
  needs at least ~5×10²³ m² of radiator wherever you put it. Mass scales as T⁻⁴.
- **Mercury is mostly iron.** Its rocky crust and mantle are only 24% of its mass. At 0.1 kg/m² the
  swarm uses about 22% of Mercury, nearly all of its rock; at 0.2 kg/m² you are into the iron core.
- **The panel is the computer.** A thin film conducts heat sideways so poorly that compute has to be
  spread out as sub-watt chiplets a few centimetres apart, not GPUs in boxes.
- **Earth does not survive a finished swarm unchanged.** Outside Earth's orbit, Earth sits inside a
  shell whose inner face glows at ~350 K and scatters sunlight back. At 1% coverage that is already
  about one CO₂-doubling of extra heat; past ~25% coverage Earth crosses the runaway-greenhouse limit.
- **It is invisible for 85% of the build.** With a one-year doubling time it takes ~50 years to reach
  1% coverage and only ~7 more to finish.

## Layout

| Path | What it is |
|---|---|
| `index.html` | page shell, styles, import map (three.js 0.160 from jsDelivr) |
| `src/model/` | constants with sources, and the model: thermal balance, placement, mass, logistics, growth, Earth impact |
| `src/scenes/` | the four chapters: `mercury`, `satellite`, `swarm`, `earth` |
| `src/ui/` | the ledger (live numbers, spectrum chart) and the assumptions drawer |
| `src/util/` | blackbody colour (CIE 1931), number formatting, labels, camera tweening |
| `test/` | `node --test` suite pinning the model to research values |
| `scripts/` | report generator and headless screenshot tool |

## How the numbers were checked

Each physics area (thermal placement, Mercury and logistics, satellite design, orbital architecture
and Earth impact, optics) was computed independently in Python with sourced constants, then
recomputed by a second, adversarial pass that tried to refute each result. The model reproduces those
values; `test/model.test.js` pins them.
