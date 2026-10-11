"""Develop a scene-linear EXR render like a camera raw file: exposure (stops), daylight white balance,
AgX view transform. The physics stays in the EXR; only the photographic choice changes here.

Usage: blender -b --python render/develop.py -- in.exr out.png --exposure 7.0 [--wb 5772]
       [--look 'AgX - Base Contrast']
"""
import argparse
import sys

import bpy


def main(argv):
    ap = argparse.ArgumentParser()
    ap.add_argument('src')
    ap.add_argument('dst')
    ap.add_argument('--exposure', type=float, required=True)
    ap.add_argument('--wb', type=float, default=5772.0, help='white balance temperature, K (0 = off)')
    ap.add_argument('--look', default='AgX - Base Contrast')
    a = ap.parse_args(argv)
    sc = bpy.context.scene
    vs = sc.view_settings
    vs.view_transform = 'AgX'
    vs.look = a.look
    vs.exposure = a.exposure
    vs.gamma = 1.0
    if a.wb:
        vs.use_white_balance = True
        vs.white_balance_temperature = a.wb
        vs.white_balance_tint = 0.0
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_depth = '16'
    sc.render.image_settings.color_management = 'FOLLOW_SCENE'
    img = bpy.data.images.load(a.src)
    img.save_render(a.dst, scene=sc)
    print('DEVELOPED', a.dst, 'exposure', a.exposure)


if __name__ == '__main__':
    main(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
