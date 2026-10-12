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

# Earth: tonight and with the finished near-uniform swarm (*_U, 83 %, L1 shade). Tonight's frames
# are metered on tonight's sky; the swarm frames on the swarm's glow (the captions give the gap).
for x in dusk_tonight dusk_U night_tonight night_U; do
  dev "$RAW/$x.exr" "$RAW/$x.png" "$(exposure_of $x)"
done
python3 render/post.py "$RAW/dusk_tonight.png" "$OUT/earth-dusk-tonight.jpg" --fov 104 --noise 0.8 --glare 0.02 --width 2400 --quality 86
python3 render/post.py "$RAW/dusk_U.png" "$OUT/earth-dusk-swarm.jpg" --fov 104 --noise 0.8 --glare 0.02 --width 2400 --quality 86
python3 render/post.py "$RAW/night_tonight.png" "$OUT/earth-night-tonight.jpg" --fov 104 --noise 1.4 --glare 0.02 --width 2400 --quality 86
python3 render/post.py "$RAW/night_U.png" "$OUT/earth-night-swarm.jpg" --fov 104 --noise 1.4 --glare 0.02 --width 2400 --quality 86

# Jenny Lake with the Sun enclosed (earth_sky --glow closed), at tonight's night exposure
dev "$RAW/night_C.exr" "$RAW/night_C.png" "$(exposure_of night_tonight)"
python3 render/post.py "$RAW/night_C.png" "$OUT/earth-night-closed.jpg" --fov 104 --noise 1.4 --glare 0.02 --width 2400 --quality 86

# The Sun enclosed from low Earth orbit (leo_view --glow closed), wide and 35 mm, exposed for the stars
for x in leo_C leo_C_tele; do
  python3 render/glare.py "$RAW/$x.exr" "$RAW/${x}_g.exr"
  dev "$RAW/${x}_g.exr" "$RAW/$x.png" 13
done
python3 render/post.py "$RAW/leo_C.png" "$OUT/leo-closed-wide.jpg" --fov 113 --noise 0.8 --width 2400 --quality 88
python3 render/post.py "$RAW/leo_C_tele.png" "$OUT/leo-closed-tele.jpg" --fov 54 --noise 0.8 --width 2400 --quality 88
# Inside the enclosure (render/closed_inside.py), exposed for the sky
dev "$RAW/inside_C.exr" "$RAW/inside_C.png" -3.3
python3 render/post.py "$RAW/inside_C.png" "$OUT/inside-closed.jpg" --fov 104 --noise 0.6 --width 2400 --quality 88

# Pod: visible photograph, and the false-colour thermal frame (no optical effects)
python3 render/post.py "$RAW/pod_hero.png" "$OUT/pod-visible.jpg" --fov 84 --noise 0.6 --width 2400 --quality 88
python3 render/post.py "$RAW/pod_hero_lwir.png" "$OUT/pod-lwir.jpg" --fov 84 --noise 0 --ca 0 --glare 0 --width 2400 --quality 90

# Sail views (AgX PNGs metered in sunlight)
python3 render/post.py "$RAW/sail_corner.png" "$OUT/sail-corner.jpg" --fov 65 --noise 0.6 --width 2400 --quality 88
# The sail against the near-uniform swarm's sky (sail_shot --far-sky --layout uniform; scene-linear:
# the counter-sun needs glare)
python3 render/glare.py "$RAW/sail_U.exr" "$RAW/sail_U_g.exr"
dev "$RAW/sail_U_g.exr" "$RAW/sail_U.png" "$(grep -o 'exposure [-0-9.]*' "$RAW/sail_U.log" | tail -1 | awk '{print $2}')"
python3 render/post.py "$RAW/sail_U.png" "$OUT/sail-swarm-counter-sun.jpg" --fov 104 --noise 0.6 --width 2400 --quality 88

# Inside the near-uniform swarm, looking toward Earth (farside_field.py --mode uniform), metered on the glow
python3 render/glare.py "$RAW/inside_U.exr" "$RAW/inside_U_g.exr"
dev "$RAW/inside_U_g.exr" "$RAW/inside_U.png" "$(exposure_of inside_U)"
python3 render/post.py "$RAW/inside_U.png" "$OUT/inside-swarm.jpg" --fov 104 --noise 0.8 --width 2400 --quality 88

# The swarm from low Earth orbit (render/leo_view.py), 22 September 2128 before dawn, wide and
# 170 mm, both exposed for the swarm's disc (leo_view's exposure_for_disc)
LEO_E=${LEO_E:--2.5}
for x in leo_U leo_U_tele; do
  python3 render/glare.py "$RAW/$x.exr" "$RAW/${x}_g.exr"
  dev "$RAW/${x}_g.exr" "$RAW/$x.png" "$LEO_E"
done
python3 render/post.py "$RAW/leo_U.png" "$OUT/leo-swarm-wide.jpg" --fov 113 --noise 0.8 --width 2400 --quality 88
python3 render/post.py "$RAW/leo_U_tele.png" "$OUT/leo-swarm-tele.jpg" --fov 12 --noise 0.8 --width 2400 --quality 88
# Europe from 4,000 km in July, today and with the dry-summer belt moved north (render/med_earth.py
# makes the textures; leo_view --day-map/--cloud-map, --tau 0, full sunlight), one exposure for both
for x in europe_today europe_med_c; do dev "$RAW/$x.exr" "$RAW/$x.png" -7.1; done
python3 render/post.py "$RAW/europe_today.png" "$OUT/europe-today.jpg" --fov 74 --noise 0.6 --width 2400 --quality 88
python3 render/post.py "$RAW/europe_med_c.png" "$OUT/europe-mediterranean.jpg" --fov 74 --noise 0.6 --width 2400 --quality 88
# North America's Pacific coast, cloud-free, today and Mediterranean, one exposure
for x in na_today na_med_c; do dev "$RAW/$x.exr" "$RAW/$x.png" -7.1; done
python3 render/post.py "$RAW/na_today.png" "$OUT/pacific-today.jpg" --fov 54 --noise 0.6 --width 2400 --quality 88
python3 render/post.py "$RAW/na_med_c.png" "$OUT/pacific-mediterranean.jpg" --fov 54 --noise 0.6 --width 2400 --quality 88
# Mercury at the heat wall (render/mercury.py writes an AgX PNG at the pristine globe's exposure)
python3 -c "import sys; from PIL import Image; Image.open(sys.argv[1]).convert('RGB').save(sys.argv[2], quality=88)" \
  "$RAW/mercury_heatwall.png" "$OUT/mercury-heatwall.jpg"
ls -la $OUT
