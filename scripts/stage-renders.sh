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
# 2) from low Earth orbit before dawn, the closed frame's composition (Earth 1.004 AU out that night)
for s in 1e-4:0:0.9999 1e-2:0:0.9988 0.5:0:0.9641 0.99:0:0.9965; do IFS=: read f T k <<< "$s"
  python3 render/leo_view.py $O/leo_$f.exr --date 2128-09-22 --utc 0.9 --aim-sun --az 0 --el 58 --lens 12 --glow sphere --f $f --r 0.92 --r-out 0.98 --sun-scale $k --steps 24 --disc-samples 12 --res 2400x1600 > $O/leo_$f.log 2>&1; log leo $f
done
# 3) Jenny Lake at the end of twilight (22 August, Sun 18.5 deg down)
for s in $STAGES; do IFS=: read f T k <<< "$s"
  [ "$f" = "1" ] && continue
  M=glow; [ "$f" = "1e-6" ] && M=night
  blender -b --python render/earth_sky.py -- $O/night_$f.exr --sun-alt -18.5 --glow sphere --f $f --r 0.92 --r-out 0.98 --sun-scale $k --meter $M --res 2400x1600 --samples 64 --sky-width 4096 --exr > $O/night_$f.log 2>&1; log night $f
done
# 4) the Sun enclosed: Jenny Lake, and low orbit wide and at 35 mm along the sphere's limb
blender -b --python render/earth_sky.py -- $O/night_C.exr --sun-alt -18.5 --glow closed --meter night --res 2400x1600 --samples 64 --sky-width 4096 --exr > $O/night_C.log 2>&1; log night C
python3 render/leo_view.py $O/leo_C.exr --date 2128-09-22 --utc 0.9 --aim-sun --az 0 --el 58 --lens 12 --glow closed --steps 24 --disc-samples 4 --res 2400x1600 > $O/leo_C.log 2>&1; log leo C
python3 render/leo_view.py $O/leo_C_tele.exr --date 2128-09-22 --utc 0.9 --aim-sun --az 35 --el 76 --lens 35 --glow closed --steps 24 --disc-samples 4 --res 2400x1600 > $O/leo_C_tele.log 2>&1; log leo C tele
log done
