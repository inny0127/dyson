"""Shared Blender (Cycles) setup for physically honest renders.

Radiometric units throughout: Cycles' Sun lamp strength is irradiance in W/m^2 and a white
Lambertian surface renders at E/pi W/(m^2 sr) (verified: 0.3169 vs 1/pi = 0.3183 for E = 1).
So we set the Sun to the real flux at the scene's distance and pick the camera exposure the way a
photographer meters a sunlit subject. Anything dim (stars, Earthshine, swarm glow) then comes out
exactly as dim as it really is.
"""
import bpy
import math
import json
import os
from mathutils import Vector

L_SUN = 3.828e26
AU = 1.495978707e11
R_SUN = 6.957e8
S0 = L_SUN / (4 * math.pi * AU ** 2)
T_SUN = 5772.0

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)


def flux(r_au):
    return L_SUN / (4 * math.pi * (r_au * AU) ** 2)


def sun_angle(r_au):
    return 2 * math.atan(R_SUN / (r_au * AU))


def load_numbers(path=None):
    """Numbers exported from the JS model (node scripts/export-numbers.mjs)."""
    path = path or os.path.join(REPO, 'render', 'numbers.json')
    with open(path) as f:
        return json.load(f)


def reset(samples=128, res=(1920, 1080), seed=0, transparent=False):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    cy = sc.cycles
    cy.device = 'CPU'
    cy.samples = samples
    cy.use_adaptive_sampling = True
    cy.adaptive_threshold = 0.01
    cy.use_denoising = True
    cy.denoiser = 'OPENIMAGEDENOISE'
    cy.seed = seed
    cy.max_bounces = 8
    cy.diffuse_bounces = 3
    cy.glossy_bounces = 4
    cy.transmission_bounces = 6
    cy.caustics_reflective = False
    cy.caustics_refractive = False
    cy.filter_width = 1.2
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.resolution_percentage = 100
    sc.render.film_transparent = transparent
    sc.render.threads_mode = 'AUTO'
    sc.view_settings.view_transform = 'AgX'
    sc.view_settings.look = 'AgX - Base Contrast'
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_depth = '16'
    world = bpy.data.worlds.new('Space')
    sc.world = world
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (0, 0, 0, 1)
    world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0
    return sc


def blackbody_node(nt, temp):
    n = nt.nodes.new('ShaderNodeBlackbody')
    n.inputs['Temperature'].default_value = temp
    return n


def add_sun(r_au, direction=(0, 0, -1), name='Sun'):
    """Sun lamp with the real irradiance and angular diameter at r_au. direction = travel of the light."""
    data = bpy.data.lights.new(name, 'SUN')
    data.energy = flux(r_au)
    data.angle = sun_angle(r_au)
    nt_ok = True
    data.use_nodes = True
    nt = data.node_tree
    emit = nt.nodes['Emission']
    bb = blackbody_node(nt, T_SUN)
    nt.links.new(bb.outputs['Color'], emit.inputs['Color'])
    obj = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(obj)
    d = Vector(direction).normalized()
    obj.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    return obj


def meter(sc, irradiance, card=0.18, target=0.18, ev_offset=0.0):
    """Expose like a camera metered on an 18% grey card lit by `irradiance` W/m^2 (Sunny-16 logic).

    Exposure is in stops; AgX maps scene-linear 0.18 to mid-grey.
    """
    radiance = card * irradiance / math.pi
    sc.view_settings.exposure = math.log2(target / radiance) + ev_offset
    return sc.view_settings.exposure


def camera(location, target, lens=50, name='Camera', dof=None, sensor=36):
    data = bpy.data.cameras.new(name)
    data.lens = lens
    data.sensor_width = sensor
    data.clip_start = 0.01
    data.clip_end = 1e7
    obj = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(obj)
    obj.location = Vector(location)
    direction = Vector(target) - Vector(location)
    obj.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
    if dof:
        data.dof.use_dof = True
        data.dof.focus_distance = direction.length
        data.dof.aperture_fstop = dof
    bpy.context.scene.camera = obj
    return obj


def look_at(obj, target, up='Y'):
    direction = Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat('-Z', up).to_euler()


# ---------------------------------------------------------------------------------------------
# Materials. Optical properties from the render guide and datasheets; all inorganic, makeable on
# Mercury (silicon, glass, Al/Mg/Fe-Si metals, oxide paints).
# ---------------------------------------------------------------------------------------------

def _mat(name):
    m = bpy.data.materials.get(name)
    if m:
        return m, None
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    return m, m.node_tree


def principled(name, color, rough=0.5, metal=0.0, ior=1.5, coat=0.0, coat_rough=0.03, spec=0.5, emission=None):
    m, nt = _mat(name)
    if nt is None:
        return m
    b = nt.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*color, 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    b.inputs['IOR'].default_value = ior
    b.inputs['Specular IOR Level'].default_value = spec
    if coat:
        b.inputs['Coat Weight'].default_value = coat
        b.inputs['Coat Roughness'].default_value = coat_rough
    if emission is not None:
        col, strength = emission
        b.inputs['Emission Color'].default_value = (*col, 1)
        b.inputs['Emission Strength'].default_value = strength
    return m


def pv_material(name='PV', cell=0.156, gap=0.003, busbar=0.0012, fingers=0.0025):
    """Crystalline-silicon cells under glass: near-black blue with AR coating, specular cover glass,
    silver busbars and fine grid fingers, white-grey gaps (back sheet) between cells. Object-space
    coordinates in metres so the pattern is true scale."""
    m, nt = _mat(name)
    if nt is None:
        return m
    N = nt.nodes
    L = nt.links
    b = N['Principled BSDF']
    tc = N.new('ShaderNodeTexCoord')
    sep = N.new('ShaderNodeSeparateXYZ')
    L.new(tc.outputs['Object'], sep.inputs[0])

    def periodic(axis_out, period, width):
        # 1 inside a line of `width` repeating every `period`
        div = N.new('ShaderNodeMath'); div.operation = 'DIVIDE'; div.inputs[1].default_value = period
        L.new(axis_out, div.inputs[0])
        fr = N.new('ShaderNodeMath'); fr.operation = 'FRACT'
        L.new(div.outputs[0], fr.inputs[0])
        sub = N.new('ShaderNodeMath'); sub.operation = 'SUBTRACT'; sub.inputs[1].default_value = 0.5
        L.new(fr.outputs[0], sub.inputs[0])
        ab = N.new('ShaderNodeMath'); ab.operation = 'ABSOLUTE'
        L.new(sub.outputs[0], ab.inputs[0])
        lt = N.new('ShaderNodeMath'); lt.operation = 'GREATER_THAN'; lt.inputs[1].default_value = 0.5 - width / period / 2
        L.new(ab.outputs[0], lt.inputs[0])
        return lt.outputs[0]

    gx = periodic(sep.outputs['X'], cell, gap)
    gy = periodic(sep.outputs['Y'], cell, gap)
    gapmask = N.new('ShaderNodeMath'); gapmask.operation = 'MAXIMUM'
    L.new(gx, gapmask.inputs[0]); L.new(gy, gapmask.inputs[1])
    bus = periodic(sep.outputs['X'], cell / 3, busbar)
    fing = periodic(sep.outputs['Y'], fingers, 0.00012)
    metal = N.new('ShaderNodeMath'); metal.operation = 'MAXIMUM'
    L.new(bus, metal.inputs[0]); L.new(fing, metal.inputs[1])
    nomet = N.new('ShaderNodeMath'); nomet.operation = 'SUBTRACT'
    nomet.inputs[0].default_value = 1
    L.new(gapmask.outputs[0], nomet.inputs[1])
    metal_in_cell = N.new('ShaderNodeMath'); metal_in_cell.operation = 'MULTIPLY'
    L.new(metal.outputs[0], metal_in_cell.inputs[0]); L.new(nomet.outputs[0], metal_in_cell.inputs[1])

    # subtle cell-to-cell colour variation (real arrays are never uniform)
    noise = N.new('ShaderNodeTexNoise'); noise.inputs['Scale'].default_value = 0.35
    L.new(tc.outputs['Object'], noise.inputs['Vector'])
    ramp = N.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].color = (0.012, 0.016, 0.040, 1)
    ramp.color_ramp.elements[1].color = (0.020, 0.028, 0.065, 1)
    L.new(noise.outputs['Fac'], ramp.inputs['Fac'])
    mix1 = N.new('ShaderNodeMix'); mix1.data_type = 'RGBA'
    L.new(gapmask.outputs[0], mix1.inputs['Factor'])
    L.new(ramp.outputs['Color'], mix1.inputs[6])
    mix1.inputs[7].default_value = (0.55, 0.56, 0.58, 1)   # back sheet seen between cells
    mix2 = N.new('ShaderNodeMix'); mix2.data_type = 'RGBA'
    L.new(metal_in_cell.outputs[0], mix2.inputs['Factor'])
    L.new(mix1.outputs[2], mix2.inputs[6])
    mix2.inputs[7].default_value = (0.75, 0.75, 0.76, 1)   # silver/aluminium metallization
    L.new(mix2.outputs[2], b.inputs['Base Color'])
    L.new(metal_in_cell.outputs[0], b.inputs['Metallic'])
    b.inputs['Roughness'].default_value = 0.25
    # cover glass: a clear coat with the IOR of glass
    b.inputs['Coat Weight'].default_value = 1.0
    b.inputs['Coat Roughness'].default_value = 0.015
    b.inputs['Coat IOR'].default_value = 1.52
    return m


def radiator_material(name='Radiator', tube_pitch=0.15):
    """White silicate/oxide thermal-control paint (solar absorptance ~0.15, IR emittance ~0.9):
    diffuse off-white with faint ridges over the embedded coolant tubes."""
    m, nt = _mat(name)
    if nt is None:
        return m
    N = nt.nodes
    L = nt.links
    b = N['Principled BSDF']
    b.inputs['Base Color'].default_value = (0.80, 0.80, 0.78, 1)
    b.inputs['Roughness'].default_value = 0.85
    tc = N.new('ShaderNodeTexCoord')
    wave = N.new('ShaderNodeTexWave')
    wave.wave_type = 'BANDS'
    wave.bands_direction = 'X'
    wave.inputs['Scale'].default_value = 1.0 / tube_pitch
    wave.inputs['Distortion'].default_value = 0.0
    L.new(tc.outputs['Object'], wave.inputs['Vector'])
    bump = N.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = 0.15; bump.inputs['Distance'].default_value = 0.003
    L.new(wave.outputs['Fac'], bump.inputs['Height'])
    L.new(bump.outputs['Normal'], b.inputs['Normal'])
    grime = N.new('ShaderNodeTexNoise'); grime.inputs['Scale'].default_value = 0.6; grime.inputs['Detail'].default_value = 6
    L.new(tc.outputs['Object'], grime.inputs['Vector'])
    ramp = N.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].color = (0.74, 0.74, 0.72, 1)
    ramp.color_ramp.elements[1].color = (0.84, 0.84, 0.82, 1)
    L.new(grime.outputs['Fac'], ramp.inputs['Fac'])
    L.new(ramp.outputs['Color'], b.inputs['Base Color'])
    return m


def metal(name, color=(0.91, 0.92, 0.92), rough=0.3):
    return principled(name, color, rough=rough, metal=1.0)


def mat_library():
    return {
        'pv': pv_material(),
        'radiator': radiator_material(),
        'aluminium': metal('Aluminium', (0.91, 0.92, 0.92), 0.28),
        'steel': metal('FeSiNi', (0.56, 0.57, 0.58), 0.38),
        'truss': principled('TrussOxide', (0.18, 0.18, 0.19), rough=0.55, metal=0.6),
        'blanket': metal('AluminisedGlassCloth', (0.86, 0.86, 0.84), 0.45),
        'glass': principled('Glass', (0.9, 0.95, 1.0), rough=0.02, ior=1.52),
        'mirror': metal('Mirror', (0.95, 0.95, 0.95), 0.02),
        'black': principled('BlackAnodised', (0.02, 0.02, 0.022), rough=0.4),
    }


def save(sc, path, samples=None):
    if samples:
        sc.cycles.samples = samples
    os.makedirs(os.path.dirname(path), exist_ok=True)
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    return path
