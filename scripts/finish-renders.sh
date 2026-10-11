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

# Earth: dusk pair at one exposure (metered on tonight's blue sky), night pair each metered
E_DUSK=$(exposure_of dusk_tonight)
dev "$RAW/dusk_tonight.exr" "$RAW/dusk_tonight.png" "$E_DUSK"
dev "$RAW/dusk_limit.exr" "$RAW/dusk_limit.png" "$E_DUSK"
dev "$RAW/night_tonight.exr" "$RAW/night_tonight.png" "$(exposure_of night_tonight)"
dev "$RAW/night_limit.exr" "$RAW/night_limit.png" "$(exposure_of night_limit)"
for x in dusk_tonight dusk_limit; do
  python3 render/post.py "$RAW/$x.png" "$OUT/earth-${x/_/-}.jpg" --fov 104 --noise 0.8 --glare 0.02 --width 2400 --quality 86
done
for x in night_tonight night_limit; do
  python3 render/post.py "$RAW/$x.png" "$OUT/earth-${x/_/-}.jpg" --fov 104 --noise 1.4 --glare 0.02 --width 2400 --quality 86
done

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

# Mercury surface scenes and the foundry (scene-linear EXR, metered in sunlight)
for x in mass_driver mercury_stripped foundry; do
  dev "$RAW/$x.exr" "$RAW/$x.png" "$(exposure_of $x)"
done
python3 render/post.py "$RAW/mass_driver.png" "$OUT/mass-driver.jpg" --fov 69 --noise 0.6 --width 2400 --quality 88
python3 render/post.py "$RAW/mercury_stripped.png" "$OUT/mercury-quarry.jpg" --fov 84 --noise 0.6 --width 2400 --quality 88
python3 render/post.py "$RAW/foundry.png" "$OUT/foundry-visible.jpg" --fov 74 --noise 0.6 --width 2400 --quality 88
python3 render/post.py "$RAW/foundry_lwir.png" "$OUT/foundry-lwir.jpg" --fov 74 --noise 0 --ca 0 --glare 0 --width 2400 --quality 90

# Sail views (AgX PNGs metered in sunlight)
python3 render/post.py "$RAW/sail_corner.png" "$OUT/sail-corner.jpg" --fov 65 --noise 0.6 --width 2400 --quality 88
python3 render/post.py "$RAW/sail_oblique.png" "$OUT/sail-oblique.jpg" --fov 62 --noise 0.6 --width 2400 --quality 88
ls -la $OUT
