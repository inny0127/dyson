#!/bin/bash
# Turn the raw renders (scene-linear EXR or AgX PNG) into the page's photographs:
# lens glare for the HDR scenes, develop (exposure, daylight white balance, AgX), then camera
# effects (vignetting, lateral CA, sensor noise) and JPEG. Exposures are the metered values the
# render scripts print; the Earth pairs share one exposure per pair where the caption says so.
# Usage: scripts/finish-renders.sh RAW_DIR   (writes renders/*.jpg)
set -euo pipefail
RAW=${1:?raw render directory}
cd "$(dirname "$0")/.."
OUT=renders
dev() { blender -b --python render/develop.py -- "$1" "$2" --exposure "$3" > /dev/null 2>&1; }
exposure_of() { grep -o '"exposure": [-0-9.]*' "$RAW/$1.log" | tail -1 | awk '{print $2}'; }

# Earth: dusk pair at one exposure (metered on tonight's blue sky), night frames each metered.
# *_far038: the far-side cloud at Earth's limit (3.8 %); night_far20: 20 % in a ±60° cloud.
E_DUSK=$(exposure_of dusk_tonight)
dev "$RAW/dusk_tonight.exr" "$RAW/dusk_tonight.png" "$E_DUSK"
dev "$RAW/dusk_far038.exr" "$RAW/dusk_far038.png" "$E_DUSK"
for x in night_tonight night_far038 night_far20; do
  dev "$RAW/$x.exr" "$RAW/$x.png" "$(exposure_of $x)"
done
python3 render/post.py "$RAW/dusk_tonight.png" "$OUT/earth-dusk-tonight.jpg" --fov 104 --noise 0.8 --glare 0.02 --width 2400 --quality 86
python3 render/post.py "$RAW/dusk_far038.png" "$OUT/earth-dusk-far.jpg" --fov 104 --noise 0.8 --glare 0.02 --width 2400 --quality 86
python3 render/post.py "$RAW/night_tonight.png" "$OUT/earth-night-tonight.jpg" --fov 104 --noise 1.4 --glare 0.02 --width 2400 --quality 86
python3 render/post.py "$RAW/night_far038.png" "$OUT/earth-night-far.jpg" --fov 104 --noise 1.4 --glare 0.02 --width 2400 --quality 86
python3 render/post.py "$RAW/night_far20.png" "$OUT/earth-night-far20.jpg" --fov 104 --noise 1.4 --glare 0.02 --width 2400 --quality 86

# Pod: visible photograph, and the false-colour thermal frame (no optical effects)
python3 render/post.py "$RAW/pod_hero.png" "$OUT/pod-visible.jpg" --fov 84 --noise 0.6 --width 2400 --quality 88
python3 render/post.py "$RAW/pod_hero_lwir.png" "$OUT/pod-lwir.jpg" --fov 84 --noise 0 --ca 0 --glare 0 --width 2400 --quality 90

# Swarm from inside: HDR point sources need real lens glare
for x in swarm_wide swarm_tele; do
  python3 render/glare.py "$RAW/$x.exr" "$RAW/${x}_g.exr"
done
dev "$RAW/swarm_wide_g.exr" "$RAW/swarm_wide.png" "$(exposure_of swarm_wide)"
dev "$RAW/swarm_tele_g.exr" "$RAW/swarm_tele.png" "$(python3 -c "print($(exposure_of swarm_tele) - 5)")"   # 5 stops shorter: the halo
python3 render/post.py "$RAW/swarm_wide.png" "$OUT/swarm-inside-wide.jpg" --fov 54 --noise 0.8 --glare 0 --width 2400 --quality 88
python3 render/post.py "$RAW/swarm_tele.png" "$OUT/swarm-inside-tele.jpg" --fov 7 --noise 0.8 --glare 0 --width 2400 --quality 88

# Sail views (AgX PNGs metered in sunlight)
python3 render/post.py "$RAW/sail_corner.png" "$OUT/sail-corner.jpg" --fov 65 --noise 0.6 --width 2400 --quality 88
# The sail against the swarm's sky (scene-linear: the counter-sun needs glare)
python3 render/glare.py "$RAW/sail_counter_sun.exr" "$RAW/sail_counter_sun_g.exr"
dev "$RAW/sail_counter_sun_g.exr" "$RAW/sail_counter_sun.png" "$(grep -o 'exposure [-0-9.]*' "$RAW/sail_counter_sun.log" | tail -1 | awk '{print $2}')"
python3 render/post.py "$RAW/sail_counter_sun.png" "$OUT/sail-counter-sun.jpg" --fov 104 --noise 0.6 --width 2400 --quality 88

# The far-side cloud from low Earth orbit (render/leo_view.py), 22 September 2128 before dawn:
# 3.8 % wide and 170 mm, and 20 % (±60° cloud) wide. Each exposed for its band.
LEO_E=${LEO_E:-0.5}
LEO20_E=${LEO20_E:--1.9}
for x in leo_far038 leo_far038_tele leo_far20; do
  python3 render/glare.py "$RAW/$x.exr" "$RAW/${x}_g.exr"
done
dev "$RAW/leo_far038_g.exr" "$RAW/leo_far038.png" "$LEO_E"
dev "$RAW/leo_far038_tele_g.exr" "$RAW/leo_far038_tele.png" "$LEO_E"
dev "$RAW/leo_far20_g.exr" "$RAW/leo_far20.png" "$LEO20_E"
python3 render/post.py "$RAW/leo_far038.png" "$OUT/leo-far-wide.jpg" --fov 104 --noise 0.8 --width 2400 --quality 88
python3 render/post.py "$RAW/leo_far038_tele.png" "$OUT/leo-far-tele.jpg" --fov 12 --noise 0.8 --width 2400 --quality 88
python3 render/post.py "$RAW/leo_far20.png" "$OUT/leo-far20.jpg" --fov 104 --noise 0.8 --width 2400 --quality 88
ls -la $OUT
