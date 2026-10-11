# Architecture decision: where the chips go

**Question.** Should each satellite concentrate its chips in one module (one synchronous computer
fed by PV wings and cooled by pumped loops to radiators), or should the chips be spread through the
PV film itself as sub-watt chiplets, so the panel is the radiator?

> **Update (future technology).** This decision was made with 2026 hardware. The swarm is built
> mostly after 2095 and refreshed every 10–20 years, so `docs/future-tech.md` re-examines it. The
> split survives and tilts further toward sails. HBM never flies: pods become memory-on-logic
> modules for the work the film cannot host, at 1–6 % of chip power (15 % only if chiplets cannot
> run agent sandboxes). Each sail becomes one tightly coupled machine through optical lanes in the
> film.

**Decision.** Use both, sized by what each can physically do. About **85 % of the power** goes into
**compute sails**: thin c-Si film with 0.15 W chiplets every 2.5 cm. About **15 %** goes into
**concentrated pods**: shielded HBM/DRAM/flash modules with pumped two-phase loops feeding knife-edge
radiators. The split can range from 80/20 to 90/10. Pods are kept as small as demand allows,
because every 1 % of power moved into pods adds about 3 % (best-credible pods) to 7 % (the pods
as first studied) to the mass of an all-sail swarm.

The research ran in four passes, each with its own scripts: interconnect physics, workloads,
thermal/mass/reliability, and an adversarial review of the first three. The review overturned
several claims from the earlier passes. The numbers below are the corrected ones.

## Why the film wins most of the power

| per watt of compute, f = 0.01 | compute sail (film) | pod, as studied | pod, best credible |
|---|---|---|---|
| mass, g/W (low–high) | **0.89** (0.47–1.98) | 7.2 (4.4–15.1) | 3.9 (2.2–6.6) |
| mass-optimal distance | 0.92 AU | 0.86 AU | 0.86–0.90 AU |
| PV temperature | 348 K | 347 K | ≈ 347 K |
| what one failure takes out | 0.15 W chiplet + its cell | 0.5–1 MW (a loop or the module) | same |

Peak FLOP/s per kg of satellite comes out about **4.8× higher for the film** than for the
best-credible pod (range 2.9–8.9×). The earlier "10×" was wrong: it compared the film with a pod
that was not the best concentrated design.

- **Concentration pays a heat-transport tax.** The film is its own radiator, and its 13 µm Mg
  spreader costs 0.11 g/W. A pod must carry heat metres to tens of metres. Coolant inventory scales
  with path length ÷ (c_p·ΔT·v). Manifolds have to be armoured against meteoroids, whose flux grows
  as about r^-1.8 inward. Radiator blades need heat pipes. Together that is ~3.7 g/W in the studied
  pod and ~2 g/W in the best one. A better pod narrows the gap but cannot close it.
- **Concentration buys no PV advantage.** At its mass optimum, a concentrated satellite's PV wing
  sits at 0.86 AU and 347 K, the same as the film. Running the wings hot at 0.6 AU (where c-Si gives
  the most W/m²) costs 9 % more mass and wastes 40 % of the light.
- **Clustering chips inside the film does not work.** Lateral conduction in a thin sheet makes
  spreader mass grow as P²: 0.09 g/W at 0.1 W per chip, 0.94 g/W at 1 W, 9.4 g/W at 10 W. Chiplets
  of 0.15 W at 2.5 cm pitch keep the die within 7–10 K of the sheet (checked twice; the c-Si
  absorber carries about ⅔ of the heat).
- **Mercury's elements.** NaK-78 coolant is capped by Mercury's potassium (~3.5×10¹⁹ kg) at
  ~1.4×10²³ W of chips. That is below even an Earth-safe swarm. Pods therefore use SO2 two-phase
  loops (sulfur and oxygen are abundant; ammonia and water are not, because Mercury has no
  hydrogen) or Na-rich loops. The film needs no K and little Al. It is limited by silicon instead:
  rock Si alone builds film for coverage f ≈ 0.56.
- **Small failures.** Film loses about 0.13 %/yr of chiplets (range 0.02–1.2 %) and has no fluid
  loops and no high-voltage strings. One meteoroid hit on a pod's loop trunk throttles half a
  megawatt. HV strings see ~6×10⁵ cell perforations per MW per year, and each one can trigger an arc.

## Why pods still exist

The film is a 2D mesh of small chips. Neighbour bandwidth is cheap (≈0.46 pJ/bit per hop). Global
bandwidth per chip falls as 1/n, and worst-case latency grows from 0.28 µs at 1 m to 29 µs at 100 m.
Some work does not fit that shape:

- **DRAM-capacity CPU work.** Agent tool sandboxes and RL environments need 1–16 GB of DRAM each;
  4 GB is 312 film chiplets. Datasets, checkpoints and weight stores need non-volatile bulk storage.
  Global shuffles and optical switching need a switched fabric. These set a pod floor of about
  5–10 % of power.
- **Training islands and a hedge.** A 10²⁶–10²⁸ FLOP MoE replica carries 115–1154 TB of state.
  That needs HBM/DRAM, not wafer-scale SRAM: wafer SRAM holds ~1.8 MB/W against ~115 MB/W for HBM.
  HBM is the most radiation-sensitive part (Suncatcher saw irregularities near 2 krad), so pods are
  shielded at about 5 g/cm². That adds another 5–10 %.
- **What pods are not for.** Tensor parallelism. With a 2D (SUMMA-style) weight-stationary layout,
  TP on film costs only 1.4–3.5 % of energy for inference and 3.6–13 % for training. Layer-local
  expert all-to-all costs 15–31 %. The film can train dense models, and MoE models at a cost.

## What the film can serve, honestly

- **Patch sizes.** Models of 0.5 T parameters or less fit in 3–10 m patches. 0.67–1 T models need
  8–18 m. Frontier 4–10 T models need 17–30 m at ≤2k concurrent sequences, and 30–100 m at 8k–32k.
  Sides grow 1.4–2× if leakage limits a chiplet to 4–8 MB of SRAM.
- **Inference per kg vs an HBM pod.** At low-to-medium concurrency the film serves 6–90× more
  tokens/s per kg. At batch concurrency (synthetic data, RL rollouts) it is 1.8–6×, and 0.8–2× if
  stages cannot overlap. Against the best-credible pod, divide by ~1.9. The film's edge is largest
  for latency-bound decode. That only helps agents inside the swarm, since Earth is 200–1200 s away.
- **Utilisation.** Weight-stationary SRAM runs a routed expert only on the chips that hold it.
  Striping fixes that but spends 20–30 % of chip power on the mesh. Film utilisation is 1–44 %.
  Filling the layer pipeline needs 61–128 or more concurrent sequences.

## Design rules this forces

1. **Chiplet**: 0.15 W, about 1.5–6 mm², at 2.5 cm pitch, Tj ≈ 85 °C. SRAM leakage at 85 °C is
   10–59 % of chip power. So keep 4–8 MB of SRAM for KV cache and activations, and hold weights in
   non-volatile MRAM/RRAM, which has no standby power, is SEU-immune and survives brownouts. The
   alternative, SRAM-only at Tj 60–70 °C, pushes the film to ~1.0–1.07 AU.
2. **Film stack** (0.17 kg/m²): 30 µm c-Si 0.070, glass cover and emitter 0.0625 (SiO₂-rich
   Mg-aluminosilicate or fused silica to match Si expansion; soda-lime cracks), 13 µm Mg spreader
   0.0225, structure 0.012, grid 0.004. AM0 efficiency is 20 % nominal, probably 5–10 % optimistic
   at 30 µm.
3. **Reliability**: SECDED (+12.5 % bits) with 1–100 Hz scrubbing, ABFT/residue checks on logic
   (2–5 %), and a pause during large solar particle events. Spare chiplets and detour routing are
   needed: a 30 m frontier patch (1.4 M chips) loses about 5 chips a day. A weight backing store and
   a reload path are needed because any brownout wipes the SRAM.
4. **Film and pods fly apart.** Radiation pressure pushes the film (β ≈ 0.005) ten times harder than
   pods (β ≈ 0.0005). The difference is ~3×10⁻⁵ m/s² at 0.92 AU, about 1 km/s per year. Pods
   co-orbit with other pods (Suncatcher-class formations, DWDM links at ~10 Tbps within ~400 km).
   Sails talk to pods over long-range handover links (Starlink-class, 0.1–0.4 Tbps; about one
   terminal per frontier patch).
5. **Shadows.** At 0.92 AU the umbra of an object extends about 99 times its size. A 100 m pod
   shades ~10 km of space downstream, so formation rules keep pods off the sail's sun-lines.
6. **Fabs, not Mercury mass, may set the build rate.** A 16 MB SRAM chiplet is about 6 mm². That
   is ~40 mm²/W of leading-edge logic, or roughly 640 wafers of 300 mm per MW. An HBM GPU needs
   ~5 mm²/W.

## What remains open

- **Low-communication training at swarm scale is unproven.** The largest public run is
  Covenant-72B (SparseLoCo, ~4.7×10²³ FLOP). Frontier runs are 3×10²⁶–10²⁷ FLOP. At swarm scale a
  10²⁹ FLOP run is about 30 ns of the whole swarm. The swarm can host very many models, but no
  method yet couples millions of islands into one. Throughput per model is capped by algorithms,
  not by the pod fraction.
- **Whether inference dominates future demand** is plausible but not established. Epoch AI puts
  OpenAI's 2024 compute at roughly 5:2 R&D to inference, and about even in 2025. The architecture
  does not hinge on it, because the film can also train.
- **Energy basis.** The research files differ by up to 3.5× in J/FLOP. This decision used one
  basis: 1.3×10⁻¹³ J per dense FP8 FLOP, system level at 85 °C and full clock, ×0.6 for
  under-clocking (7.8×10⁻¹⁴ J), +0.9 %/K above 85 °C. That is now the model's '2026 hardware'
  preset; the default mature era uses 1.4×10⁻¹⁵ J and +0.56 %/K (`docs/future-tech.md`).

## Sources

Physics and hardware:
- Miller, "Attojoule optoelectronics", J. Lightwave Tech. 35(3) 2017, arXiv:1609.05510 (2 pF/cm, ¼CV²).
- Horowitz, "Computing's energy problem", ISSCC 2014. "Limits to the energy efficiency of CMOS
  microprocessors", arXiv:2312.08595.
- UCIe Consortium metrics (HOTI 2025). NVLink-C2C 1.3 pJ/bit (Hot Chips 2022). HBM3E 3.44 pJ/bit
  (arXiv:2602.18568). NVIDIA Vera Rubin NVL72 specifications.
- Google, "Towards a future space-based, highly scalable AI infrastructure system design"
  (Suncatcher), arXiv:2511.19468. HBM radiation sensitivity, formation-flying optical links.
- Cerebras CS-3 (44 GB on-chip SRAM, ~25–27 kW). 3 nm dual-rail SRAM, 27.5 µW/Mb low-leakage mode
  (ISSCC-class).
- SPENVIS meteoroid background (Grün 1985 flux, ballistic limit equations). Helios dust radial
  dependence. HST retrieved arrays.
- JAXA and NASA Glenn impact-induced arcing on solar arrays (sustained arcs ≥ 80–183 V).
- NASA FSP annular linear induction pump efficiency (4–5.4 %). NIST WebBook SO₂/NH₃/H₂O saturation
  properties.
- Low-energy proton SEU in 65–16 nm SRAM (IEEE TNS 2024). SEP fluences (Aug 1972).
- Thin c-Si efficiency vs thickness, arXiv:1505.03985.

ML systems:
- DiLoCo scaling laws (Charles et al., NeurIPS 2025), arXiv:2503.09799. Covenant-72B / SparseLoCo,
  arXiv:2603.08163.
- Meta Llama 3: 419 unexpected interruptions in 54 days on 16,384 H100s (HBM3 17 %).
- Epoch AI compute estimates (training-run sizes, R&D vs inference split).

The project's own models are in `src/model/` (thermal radiosity, PV temperature, Mercury layers,
growth). This document's numbers come from research scripts run for this decision. Ranges are
low–high over each assumption's credible span. The midpoint is what the visualizer shows.
