#!/bin/bash
# Renders of the symmetric sphere at each stage (docs/renders.md, "The sphere, stage by stage").
# Usage: scripts/stage-renders.sh RAW_DIR   (then scripts/finish-renders.sh RAW_DIR)
cd "$(dirname "$0")/.."
O=${1:?output directory}; mkdir -p $O
log() { echo "$(date +%T) $*" >> $O/queue.log; }
# stage: f, film T (K), sunlight reaching Earth (window narrowed to hold its temperature)
STAGES="1e-6:381.9:1.0 1e-4:381.9:1.0 1e-2:382.4:0.9988 0.5:401.7:0.9641 0.99:418.5:0.9965 1:418.9:0.9981"
# 1) from 3 AU: thermal for every stage, visible through a coronagraph
for s in $STAGES; do IFS=: read f T k <<< "$s"
  python3 render/sphere_space.py $O/space_$f --f $f --T $T > $O/space_$f.log 2>&1; log space $f
done
# 2) from low Earth orbit before dawn, the closed frame's composition
for s in 1e-4:0:0.9999 1e-2:0:0.9988 0.5:0:0.9641 0.99:0:0.9965; do IFS=: read f T k <<< "$s"
  python3 render/leo_view.py $O/leo_$f.exr --date 2128-09-22 --utc 0.9 --aim-sun --az 0 --el 58 --lens 12 --glow sphere --f $f --r 0.92 --r-out 0.98 --sun-scale $k --steps 24 --disc-samples 12 --res 2400x1600 > $O/leo_$f.log 2>&1; log leo $f
done
# 3) inside, a quarter of the way round the Sun from Earth, looking up across the layer
for f in 0.01 0.5; do tau=$(python3 -c "import math;print(-math.log(1-$f))")
  blender -b --python render/farside_field.py -- $O/inside_$f.exr --mode sphere --tau $tau --r-layer 0.95 --cone 0 --psi 90 --yaw 180 --pitch -40 --lens 14 --samples 64 --seed 5 > $O/inside_$f.log 2>&1; log inside $f
done
# 4) Jenny Lake at the end of twilight (22 August, Sun 18.5 deg down)
for s in $STAGES; do IFS=: read f T k <<< "$s"
  [ "$f" = "1" ] && continue
  M=glow; [ "$f" = "1e-6" ] && M=night
  blender -b --python render/earth_sky.py -- $O/night_$f.exr --sun-alt -18.5 --glow sphere --f $f --r 0.92 --r-out 0.98 --sun-scale $k --meter $M --res 2400x1600 --samples 64 --sky-width 4096 --exr > $O/night_$f.log 2>&1; log night $f
done
log done
