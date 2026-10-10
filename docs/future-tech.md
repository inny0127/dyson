# Future technology: what the swarm is actually built with

**Question.** The swarm is built over centuries, and every spacecraft is refreshed about every 10 to
15 years. Today's hardware (HBM, SRAM-heavy chiplets, 1.3×10⁻¹³ J per operation, 20 % solar cells,
today's fabs) will be long obsolete by the time most of it flies. Which conclusions survive, which
flip, and what is the swarm really made of?

**Short answer.** The architecture survives and gets simpler.

- **What stays:** mostly compute sails. Each sail becomes one tightly coupled machine. Silicon stays
  the only solar cell, and chips stay near 85 °C.
- **What flips:** HBM never flies. Pods shrink from 15 % of chip power to a few percent.
- **What sets the size of the swarm:** chip fabs and the recycling of retired sails, not Mercury's
  mass.
- **The hard limit:** Earth's climate, not the Sun or Mercury.

This answer comes from eight sequential studies: logic, memory, interconnect, hot electronics and
solar cells, AI workloads, manufacturing and refresh, a scenario model, and an adversarial review.
Their full results are in `docs/data/future/*.json`. The review corrected several numbers; the
corrected ones are used here. The model (`src/model/hybrid.js`, v4) and its tests are built on them.

## When the swarm is built, and with what

With a first launch in 2050 (central case), industry doubles until Mercury's surface cannot shed
the waste heat of mining (the heat wall). After that, export is capped.

| | pessimistic | central | optimistic |
|---|---|---|---|
| heat wall | 2148 | 2109 | 2098 |
| 1 % of sunlight captured | 2173 | 2123 | 2107 |
| 10 % captured | never | 2382 | 2211 |
| ceiling (coverage where refresh balances export) | 3.9 % | 14 % | 40 % |
| compute at the ceiling | 6×10³⁷ FLOP/s | 6×10³⁹ FLOP/s | 2×10⁴¹ FLOP/s |

Refresh keeps the fleet 0–15 years old, so almost all of it carries hardware from after 2095. The
visualizer therefore shows this **mature era** by default, with today's hardware as a comparison.
Hardware is not animated over time: it changes only while the swarm is still too small to see.

## What holds in every era

- **Sails beat pods.** Per kg, sails beat concentrated pods by 4.5–7.7×. Pods carry heat metres to
  radiators and the film does not. Falling energy per operation scales both alike.
- **Chips stay near 85 °C.**
  - Every transistor that switches by thermal emission pays an energy cost growing with temperature
    (E ∝ T²). Hot logic loses 17–43 % of FLOP per joule of sunlight.
  - It gains only 5–12 % FLOP/s per kg (at 105–150 °C), and only when Mercury's mass rather than
    sunlight is the limit.
  - Wide-bandgap logic (SiC, GaN, diamond) still costs about 5× more energy per op even after 2100.
  - The film's temperature does not depend on PV efficiency, because the chips burn all the
    electricity in the same sheet.
- **Silicon is the only solar cell Mercury can supply at swarm scale.** Perovskites need iodine,
  enough for coverage ≤ 10⁻⁵. III-V cells need indium and germanium, ≤ 3×10⁻⁶. A
  silicon cell made without hydrogen reaches about 21–22 % at AM0 (the limit is 30 %). The useful
  trick is to reflect the 25 % of sunlight below silicon's band gap (absorptance 0.90 → 0.80),
  which moves sails inward from 0.92 to 0.86 AU.
- **The sail is the synchronous unit.** Neighbouring sails are 0.15–1 ms apart by light, and laser
  bandwidth, not latency, rules out tensor parallelism across sails. So:
  - One sail (15–24 MW) is one machine.
  - 10²–10⁵ sails can cooperate through low-communication training. That is unproven beyond
    ~5×10²³ FLOP today.
  - 97–99 % of the swarm syncs only on hour scales.
- **Mercury's heat caps the export rate.** About 4×10¹⁹ kg/yr of spacecraft at 5×10¹⁸ W of surface
  heat and 2 MJ/kg.

## What flips

| | 2026 hardware | mature era (central) | when it flips |
|---|---|---|---|
| system energy per op (×0.6 under-clocking) | 7.8×10⁻¹⁴ J | 1.4×10⁻¹⁵ J | ~10⁻¹⁴ by 2040 |
| memory per 0.15 W chiplet | 16 MB SRAM | 1–2 GB non-volatile (32 GB possible) | 2035–2045 |
| what replaces HBM in pods | HBM, 115 MB/W | memory bonded on logic (3D DRAM), ~10 GB/W | HBM is gone before the first launch |
| share of chip power in pods | 15 % | 1–6 % (15 % if chiplets cannot run sandboxes) | 2045–2070 |
| links across one sail | electrical mesh, 220–1,465 pJ per sail-wide bit | optical lanes in the film, 0.03–2 pJ | 2045–2070 |
| laser terminals per sail | 64 × 10 cm | ~12 (8 × 10 cm + 4 × 30 cm), 50–400 Tbps each | ~2040 |
| PV (AM0), temperature coefficient | 20 %, −0.42 %/K | 21.5 %, −0.34 %/K | now |
| mass per watt of chips (swarm) | 1.37 g/W | 0.90 g/W | |
| FLOP per joule of sunlight | 1.6×10¹² | 1.1×10¹⁴ | |

- **Memory.** Weights and working state move into radiation-tolerant non-volatile memory stacked on
  each chiplet: MRAM, resistive RAM and ferroelectric RAM. These survive a film's unshielded dose
  of 142–466 krad over 10 years. That ends the SRAM leakage that capped the 2026 design.
  - DRAM, 3D NAND and oxide DRAM stay in shielded pods (0.4–3.3 krad behind 5 g/cm²).
  - At swarm scale, scarce elements rule out indium, platinum-group metals and, eventually,
    hafnium. Memory must use SiOx/TiOx resistive cells, ZrO2-based ferroelectrics, Fe/MgO
    magnetic junctions and indium-free oxides. The zirconium supply caps 32 GB chiplets at 12–25 %
    coverage.
- **Sail size.** It stays 150–300 m. Denser memory would let a single training replica fit on a
  62 m sail. But structure, fixed hardware and launch packaging keep the optimum near 279 m, so each
  sail holds many replicas.
- **Pods.** They remain for dies above ~4 W, radiation-soft DRAM and storage, archives, and agent
  sandboxes the film cannot host. Putting a sandbox-capable core with an MMU and non-volatile main
  memory on every chiplet is worth 10–30 % of swarm mass. That single design choice decides whether
  pods are ~1 % or ~15 %.

## What actually limits the swarm

1. **Chip fabs come before the heat wall.**
   - The build needs about 10¹⁸ m² of chip die per year, ~10¹¹ times today's wafer output.
   - Today's fab equipment weighs ~250 kg per m²/yr of die it makes. Carried along, that turns a
     1-year industrial doubling into 5–18 years.
   - The central case assumes a vacuum wafer fab built in space (~40 kg per m²/yr), which gives a
     1.3-year doubling. Only speculative large-panel imprint with inorganic self-assembly (9–15 nm)
     approaches 1 year.
   - Hydrogen is the one hard chemical wall: Mercury has ~5×10¹³ kg, against 10²² kg/yr for
     water-based processing. So the fab runs dry: molten-oxide or metallothermic silicon, a
     chlorine loop for chip-grade silicon, chlorine and oxygen plasmas, and no organic resists. Free
     vacuum cuts fab electricity by ~60 %. Making a kilogram takes ~1,150 MJ, still only 3–5 % of
     swarm output.
2. **Refresh sets the ceiling.** Sails retire every 10–20 years. The standing fleet levels off
   where export plus recycling balances retirement: B = export × life ÷ (1 − recycled fraction).
   - Without recycling, a 10-year fleet stalls near 1 % coverage.
   - The central case (15-year life, 94 % recycled in orbit) levels off near 14 %.
   - This ceiling is an assumption ratio, not a law of physics, and the model shows it that way.
   - By 2300, ~98 % of industrial output only replaces retired sails.
3. **Mercury's rock runs out** around 3125–3330 if the build continues, after which the fleet
   decays. Mercury's core may hold 1–4×10²² kg of silicon, so this is conservative.

## Earth decides how big the swarm may be

At the ceiling, the sails sit inside Earth's orbit (0.86–0.91 AU).

- **The infrared problem.** Every watt they intercept leaves as infrared, and Earth absorbs its
  share. A uniform shell adds about **1.9 W/m² for every 1 % of coverage**, almost independent of
  radius. At the central ceiling Earth would absorb more than the 282 W/m² runaway-greenhouse limit.
- **The safe limit.** Keeping the added forcing under 1 W/m² allows only ~0.5 % coverage in a
  uniform shell. That is about 2×10³⁸ FLOP/s, reached around 2115.
- **Fixes that don't work.** A shadow-free corridor for Earth or a shell outside Earth's orbit
  both make it worse.
- **Next.** A dedicated study is designing an Earth-safe geometry: keeping sails far from Earth,
  co-orbital placement on the far side of the Sun, and an L1 sunshade as a thermostat. Its result
  sets the visualizer's Earth-safe coverage.

## What the swarm computes

At 1 % coverage with mature hardware, the swarm runs about 4×10³⁸ FLOP/s.

| Quantity | Value |
|---|---|
| Human-brain equivalents at 10¹⁵ FLOP/s each (Carlsmith) | ~4×10²³ (two orders of magnitude either way) |
| Each sail serves | ~10⁷ agents at ~7×10⁸ tokens/s |
| Each sail trains, per year | a model of ~10¹³ active parameters |

- **Text runs out.** One 2070 sail-year of training needs 1.6–7 times all human-written text.
- **A population, not one mind.** The largest coherent training effort is at most ~10⁻⁹ of the
  swarm. The swarm is a population of machines, not one giant computer.

## Open questions

- Measured back-face emissivity of a 15 µm enamel. This sets whether the film is 0.19 or 0.17 kg/m².
- Whether hydrogen-free c-Si can exceed 22 %. Above ~2100 the swarm intercepts ~3×10¹⁴ kg/yr of
  solar-wind hydrogen, which could lift the hydrogen wall.
- Moderate adiabatic logic after the heat wall: ×1.7–2.4 per kg if fab output allows.
- Fab productivity and in-orbit recycling fraction. These two set the ceiling.
- The Earth-safe architecture (next study).

## Sources

Every number above comes from a script in the study folders; the result files list 40–80 sources
each. The main ones:

- **Logic and energy limits:**
  - IRDS 2024 More Moore (supply voltage stuck at ~0.6 V, no steep-slope devices).
  - Ho, Erdil and Besiroglu, "Limits to the energy efficiency of CMOS microprocessors", arXiv:2312.08595.
  - Epoch AI, ML hardware energy-efficiency trend.
  - NIST/Tolpygo, superconducting logic.
- **Memory:**
  - JEDEC HBM4.
  - SK hynix and KAIST HBM roadmaps (HBM8 ~2038).
  - Monolithic 3D DRAM programmes.
  - Radiation data for MRAM, resistive and ferroelectric memory.
- **Interconnect:**
  - Miller, "Attojoule optoelectronics", arXiv:1609.05510.
  - Nozaki et al. 2019, Nature Photonics (femtofarad optoelectronics).
  - Timurdogan et al. 2014 (0.9 fJ/bit modulator).
  - Ultra-low-loss SiN waveguides.
  - Google Suncatcher, arXiv:2511.19468.
- **Solar cells:**
  - AM0 E-490 spectrum and detailed-balance limits.
  - LONGi 27.81 % silicon cell (2025).
  - NASA Glenn 500 °C SiC JFET ICs.
- **Workloads:**
  - Epoch AI compute and inference-share estimates.
  - DiLoCo scaling laws, arXiv:2503.09799.
  - Covenant-72B / SparseLoCo, arXiv:2603.08163.
  - Carlsmith, brain FLOP/s.
- **Manufacturing:**
  - SEMI World Fab Forecast 2025.
  - ASML NXE:3800E and EXE:5200B throughput.
  - TechInsights fab energy.
  - Evans et al. 2015, chlorine on Mercury.
  - IEA PVPS Task 12.
