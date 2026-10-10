"""Assemble result.json from the computed JSON files (no new physics here except material colour conversions)."""
import math, numpy as np
from common import *
import optics as O

OPT = load('optics.json'); ST = load('sail_structure.json'); LY = load('sail_layout.json'); POD = load('pod.json')
CL = load('cluster.json'); SC = load('scene.json'); SE = load('sensitivity.json')
G = LY['geometry']; M = LY['mass']; B = LY['booms']
LD = G['half_diagonal_LD_m']; SIDE = G['side_m']; PITCH = G['pitch_m']
hw = {p['name']: p for p in LY['hardware']}
A_V = hw['corner_vane']['area_m2']; V_SIDE = math.sqrt(A_V)

# ---- material colours from the optics model (linear sRGB under the 5772 K sun, white = 1)
fv = O.front_visible(d_ar=0.110, d_tio2=0.055)
R_cells_diffuse = (1 - fv['R_top']) * (0.95 * fv['R_tex'] + 0.05 * fv['R_flat'] * 0.92) * 0.92
rgb_cells, Y_cells = O.rgb_of(R_cells_diffuse)
rgb_cells = [max(0.0, c) for c in rgb_cells]
rgb_cells_render = [round(3.0 * c + 0.0004, 5) for c in rgb_cells]       # x3 for real-world texture/edge scatter (open question), floor
glint_tint = [round(v, 3) for v in OPT['front_visible_extra']['glint_top_surface_linear_sRGB_rel']]
F0 = OPT['front_visible']['R_top_specular_luminous']
coat_ior = (1 + math.sqrt(F0)) / (1 - math.sqrt(F0))

MATERIALS = {
    'sail_front_pv': dict(
        physical='vacuum | porous-SiO2 AR 110 nm (n 1.25) | 20 um SiO2-rich Mg-aluminosilicate cover glass | TiO2 ARC 55 nm | textured 30 um c-Si (IBC, no front metal)',
        principled=dict(base_color_linear=rgb_cells_render, base_color_ideal_model=[round(c, 5) for c in rgb_cells], roughness=0.35, metallic=0.0,
                        coat_weight=1.0, coat_ior=round(coat_ior, 4), coat_roughness=0.006, coat_tint=glint_tint,
                        note='coat IOR %.3f reproduces the AR-coated top-surface F0 = %.4f; glint tint is the AR residual (magenta-blue). Bare-glass '
                             'alternative: coat IOR 1.47 (F0 0.037). Texture scatter leaves ~%.0f deg off-normal; diffuse base is an approximation.'
                             % (coat_ior, F0, OPT['front_visible']['texture_exit_angle_deg_from_normal'])),
        luminous_albedo_diffuse=Y_cells, luminous_specular_F0=F0, solar_absorptance=0.90, eps_IR=0.85, eps_IR_conservative=0.76, T_K=T_SHEET),
    'sail_back_enamel': dict(
        physical='15 um Fe/Mg/Ca-silicate glass enamel, microtextured, over 13 um Mg spreader (patterned per tile) and 0.5 um SiO2',
        principled=dict(base_color_linear=[0.060, 0.054, 0.048], roughness=0.65, metallic=0.0, specular_ior_level=0.4),
        luminous_albedo=0.06, eps_IR=0.90, eps_IR_conservative=0.73, T_K=T_SHEET),
    'chiplet_die': dict(physical='Si die 2.45 x 2.45 x 0.05 mm, flip-chip on the rear pads, overcoated with the back enamel',
                        principled=dict(base_color_linear=[0.055, 0.052, 0.050], roughness=0.35, metallic=0.0), T_K=[T_SHEET + 7, T_SHEET + 10]),
    'hinge_strip': dict(physical='25.4 mm glass-fibre (Mg-aluminosilicate) cloth with Al jumper traces, dark enamel coat on both faces (alpha/eps matched to the film so it runs at film temperature)',
                        principled=dict(base_color_linear=[0.08, 0.078, 0.075], roughness=0.6, metallic=0.0, bump='plain-weave 0.5 mm, 0.05 mm depth'),
                        luminous_albedo=0.08, eps_IR=0.88, T_K=T_SHEET),
    'edge_hem_and_doubler': dict(physical='50 mm glass-cloth hem enclosing a 1.2 mm Fe-Ni edge cable; 2.5 m corner doubler triangles; dark enamel coat',
                                 principled=dict(base_color_linear=[0.08, 0.078, 0.075], roughness=0.6), T_K=T_SHEET - 3),
    'boom_mg_oxidised': dict(physical='Mg-alloy thin-wall tubes with thermal oxide (MgO) skin; Fe-Ni wire diagonals',
                             principled=dict(base_color_linear=[0.42, 0.42, 0.41], metallic=0.6, roughness=0.5), eps_IR=0.3, T_K=293),
    'vane_reflector_front': dict(physical='100 nm Al on glass-fibre cloth membrane (rho_s 0.85-0.9), slight wrinkles',
                                 principled=dict(base_color_linear=[0.91, 0.92, 0.92], metallic=1.0, roughness=0.02, bump='wrinkles 0.3-1 m wavelength, 2 mm'),
                                 note='Al optical constants: render/lib.py aluminium / Rakic 1995', eps_IR=0.05, T_K=237),
    'vane_back': dict(principled=dict(base_color_linear=[0.06, 0.055, 0.05], roughness=0.65), eps_IR=0.85),
    'hub_blanket': dict(physical='aluminised glass-cloth multilayer blanket (no polymers), as render/lib.py blanket_material',
                        principled=dict(base_color_linear=[0.83, 0.82, 0.78], metallic=1.0, roughness=0.32), eps_IR=0.6, T_K=[270, 300]),
    'terminal_body': dict(physical='white MgO/Ca-silicate coated Mg housing, black anodic-oxide sunshade interior, dark 10 cm aperture glass',
                          principled=dict(base_color_linear=[0.70, 0.70, 0.68], roughness=0.8), aperture=dict(base_color_linear=[0.01, 0.01, 0.015], roughness=0.05, coat_weight=1.0)),
    'pod_wing_front': 'same as sail_front_pv (wing film is the sail film without chiplets/Mg spreader)',
    'pod_wing_back': 'same as sail_back_enamel',
    'pod_radiator': dict(physical='Mg-alloy facesheets on SO2 heat pipes (0.10 m pitch along Z), white Mg/Ca-silicate coating alpha 0.15-0.2 eps 0.90',
                         principled=dict(base_color_linear=[0.80, 0.80, 0.78], roughness=0.85, bump='heat-pipe ridges every 0.10 m along Z, 3 mm high'),
                         eps_IR=0.90, T_K=[345, 355], visible_note='faces are never sunlit: ~%.0f stops below sunlit white' % SC['pod_radiators_visible']['stops_below_sunlit_white']),
    'pod_module_blanket': 'hub_blanket',
    'pod_truss': 'boom_mg_oxidised',
    'loop_line_sleeve': dict(physical='Whipple sleeve (Mg-alloy bumper) around SO2 vapour/liquid lines', principled=dict(base_color_linear=[0.55, 0.55, 0.54], metallic=0.7, roughness=0.45)),
}

# ---- render spec (flat). Frame for the sail: +Z to the Sun, film in XY at z=0, corners on the axes.
term_xy = LY['positions']['terminals']
R_VANE = LD + 2.0 + V_SIDE / 2
render_parts = [
    dict(name='sail_film', object='sail', count=1, shape='scalloped diamond (square side %.2f m rotated 45 deg)' % SIDE,
         dims_m=dict(corner_to_corner=2 * LD, thickness=80e-6, sag_at_mid_edge=G['catenary_sag_m']),
         position_rule='XY plane z=0; corners (+-%.3f,0),(0,+-%.3f); each edge bows inward by sag*(1-(2u/side)^2) (u along edge from mid)' % (LD, LD),
         material=dict(front='sail_front_pv', back='sail_back_enamel'), area_m2=G['film_area_m2']),
    dict(name='tile_grid_front', object='sail', count=G['tile_positions_in_film'], dims_m=dict(pitch=PITCH, scribe_width=50e-6, half_cell_scribe_pitch=PITCH / 2),
         position_rule='texture on the front: tile scribes every 25.4 mm in X and Y (centred on (i+0.5)p), half-cell scribe along X through each tile centre; visible only < ~3 m',
         material=dict(scribe=dict(base_color_linear=[0.03, 0.03, 0.035], roughness=0.4))),
    dict(name='chiplet', object='sail', count=G['chiplet_sites'], dims_m=[0.00245, 0.00245, 0.00005],
         position_rule='back face (z<0), at tile centres x=(i+0.5)*%.4f, y=(j+0.5)*%.4f, except hinge rows, corner doublers, terminal service plates; '
                       'instance only within ~5 m of the camera, else a bump/normal texture' % (PITCH, PITCH), material='chiplet_die'),
    dict(name='hinge_strip', object='sail', count=len(LY['positions']['hinge_line_y']), dims_m=dict(width=0.0254, length='2*(LD-|y|) minus scallop'),
         position_rule='lines parallel to X at y = (64k+63.5)*0.0254 m (every 1.6256 m); both faces', material='hinge_strip',
         y_positions_m=LY['positions']['hinge_line_y']),
    dict(name='edge_hem', object='sail', count=4, dims_m=dict(width=0.05, length=SIDE), position_rule='along the 4 scalloped edges', material='edge_hem_and_doubler'),
    dict(name='edge_cable', object='sail', count=4, dims_m=dict(diameter=0.0012, length=SIDE * 1.004), position_rule='inside the hem, catenary corner to corner', material='boom_mg_oxidised'),
    dict(name='corner_doubler', object='sail', count=4, dims_m=dict(leg=2.5, thickness=0.0003), position_rule='triangles at the 4 corners', material='edge_hem_and_doubler'),
    dict(name='corner_tether', object='sail', count=8, dims_m=dict(diameter=0.003, length=2.0), position_rule='2 per corner, from film corner to the boom-tip tensioner, along the boom axis', material='edge_hem_and_doubler'),
    dict(name='boom', object='sail', count=4, dims_m=dict(length=B['length_m'], triangle_side=B['triangle_side_m'], longeron_od=B['longeron_OD_mm'] / 1e3,
                                                          longeron_wall=B['longeron_wall_mm'] / 1e3, bay=B['bay_length_m'], batten_od=0.010, diagonal_wire=0.002),
         position_rule='triangular truss from the hub along +X,-X,+Y,-Y; two longerons in the plane z=-0.30 at +-side/2 from the axis, apex longeron at z=-0.30-0.866*side; '
                       'battens every bay, X-bracing wires in each face', material='boom_mg_oxidised', n_bays=B['n_bays']),
    dict(name='hub', object='sail', count=1, dims_m=dict(across_flats=3.4, depth=1.9), position_rule='octagonal prism centred on the axis, z from -0.30 to -2.20 (behind the film)', material='hub_blanket'),
    dict(name='hub_star_tracker', object='sail', count=3, dims_m=dict(diameter=0.10, length=0.25, baffle_diameter=0.18), position_rule='on the hub -Z face, canted 20 deg outward, 120 deg apart', material='terminal_body'),
    dict(name='tensioner', object='sail', count=4, dims_m=[0.30, 0.20, 0.20], position_rule='at each boom tip, (+-(LD+2.0),0,0)/(0,+-(LD+2.0),0)', material='terminal_body'),
    dict(name='vane', object='sail', count=4, dims_m=dict(side=V_SIDE, thickness=0.002, area=A_V),
         position_rule='square vane centred at R=%.2f m on each axis, z=0, diagonal TRAC booms; default face-on (normal +Z); control tilt 0-40 deg about 2 axes' % R_VANE,
         material=dict(front='vane_reflector_front', back='vane_back')),
    dict(name='vane_boom', object='sail', count=8, dims_m=dict(length=V_SIDE * math.sqrt(2), width=0.04), position_rule='2 per vane along its diagonals (TRAC, Fe-Ni)', material='boom_mg_oxidised'),
    dict(name='vane_gimbal', object='sail', count=4, dims_m=[0.4, 0.4, 0.4], position_rule='at R = LD + 2.0 + 0.2 on each axis, z=0', material='terminal_body'),
    dict(name='sun_sensor', object='sail', count=4, dims_m=[0.08, 0.08, 0.04], position_rule='on the tensioner, facing +Z', material='terminal_body'),
    dict(name='patch_terminal', object='sail', count=len(term_xy),
         dims_m=dict(service_plate=[1.0, 1.0, 0.02], mast=dict(diameter=0.08, length=0.60), yoke=0.30, telescope=dict(diameter=0.14, length=0.35, aperture=0.10), sunshade_length=0.20),
         position_rule='on the BACK face at the listed (x,y), plate at z=-0.02..0, mast to z=-0.62, gimbal + telescope pointing into the -Z hemisphere toward pod lanes (>=3 deg behind the film plane)',
         xy_m=term_xy, material='terminal_body'),
    dict(name='corner_relay_terminal', object='sail', count=4, dims_m=dict(telescope=dict(diameter=0.14, length=0.35, aperture=0.10)),
         position_rule='on each tensioner box, 0.4 m outboard; sees both hemispheres', material='terminal_body'),
    dict(name='service_pv_patch', object='sail', count=len(term_xy) + 4, dims_m=[1.0, 1.0], position_rule='film directly in front of each terminal plate and at (+-(LD-4),0),(0,+-(LD-4)); same look as sail_front_pv', material='sail_front_pv'),
]
PW = POD['wings']; PR = POD['radiators']; PM = POD['module']
pod_parts = [
    dict(name='pod_module', object='pod', count=1, dims_m=[PM['outer_box_side_m']] * 3, position_rule='centred at the origin (pod frame: +Z sunward, wings along X, blades along Y)', material='pod_module_blanket',
         contents='dense memory + logic stack core %.2f m cube (1.5 m3/MW), shell of converters/switches/accumulators, shield panels' % PM['core_cube_side_m']),
    dict(name='pod_wing', object='pod', count=2, dims_m=[PW['span_each_m'], PW['chord_m'], 0.0001], panels_per_wing=PW['panels_per_wing'], panel_m=PW['panel_m'],
         position_rule='XY plane z=0, x from +-%.1f to +-%.1f, y in [-%.2f, %.2f]; 0.10 m hinge gaps between panels' % (PW['root_x_m'], PW['root_x_m'] + PW['span_each_m'], PW['chord_m'] / 2, PW['chord_m'] / 2),
         material=dict(front='sail_front_pv', back='sail_back_enamel')),
    dict(name='pod_wing_frame', object='pod', count=2 * PW['panels_per_wing'], dims_m=dict(tube_od=0.04), position_rule='perimeter tubes of each wing panel, behind the film (z=-0.05)', material='pod_truss'),
    dict(name='pod_wing_yoke_and_spar', object='pod', count=2, dims_m=dict(truss_side=0.8, length=PW['root_x_m'] + PW['span_each_m']), position_rule='triangular truss along +-X at y=0, z=-0.5, from the module to the wing tip', material='pod_truss'),
    dict(name='pod_radiator_blade', object='pod', count=PR['count'], dims_m=[0.025, PR['blade_len_Y_m'], PR['blade_depth_Z_m']],
         position_rule='YZ plane at x=0 (faces +-X, edge-on to the Sun), z in [-3,3]; y in [20.0, %.1f] and [%.1f, %.1f] on each side (mirrored)' % (20 + PR['blade_len_Y_m'], 21 + PR['blade_len_Y_m'], 21 + 2 * PR['blade_len_Y_m']),
         material='pod_radiator', T_K=PR['T_K']),
    dict(name='pod_radiator_spine', object='pod', count=PR['count'], dims_m=dict(diameter=0.08, length=PR['blade_len_Y_m']), position_rule='condenser header along each blade at z=0', material='loop_line_sleeve'),
    dict(name='pod_heat_pipe', object='pod', count=int(POD['loops']['heat_pipes_per_blade'] * PR['count']), dims_m=dict(diameter=0.012, length=3.0, pitch=0.10),
         position_rule='inside each blade, +-Z from the spine every 0.10 m (render as bump ridges)', material='pod_radiator'),
    dict(name='pod_radiator_arm', object='pod', count=2, dims_m=dict(truss_side=0.8, length=20.0), position_rule='triangular truss along +-Y at x=0, z=-0.5, module to first blade; carries 2 loop trunks', material='pod_truss'),
    dict(name='pod_loop_trunk', object='pod', count=4, dims_m=dict(sleeve_diameter=0.15, vapour_id=POD['loops']['vapour_line_ID_mm'] / 1e3, liquid_id=POD['loops']['liquid_line_ID_mm'] / 1e3, length=POD['loops']['trunk_one_way_m']),
         position_rule='along the radiator arms and blade roots', material='loop_line_sleeve'),
    dict(name='pod_terminal_mast', object='pod', count=1, dims_m=dict(diameter=0.3, length=4.0), position_rule='from the module -Z face to z=-(%.2f/2+4)' % PM['outer_box_side_m'], material='pod_truss'),
    dict(name='pod_dwdm_terminal', object='pod', count=8, dims_m=dict(telescope_diameter=0.14, aperture=0.10, length=0.35), position_rule='ring of 8 on the mast at 2/3 height, 45 deg apart', material='terminal_body'),
    dict(name='pod_handover_terminal', object='pod', count=16, dims_m=dict(telescope_diameter=0.14, aperture=0.10, length=0.35), position_rule='two rings of 8 near the mast tip', material='terminal_body'),
    dict(name='pod_thruster', object='pod', count=4, dims_m=dict(diameter=0.25, length=0.4, boom=2.0), position_rule='on 2 canted booms below the module, plumes 20 deg below the wing plane, between wing and blade arms (azimuths 45,135,225,315 deg)', material='boom_mg_oxidised'),
    dict(name='pod_O2_tank', object='pod', count=2, dims_m=dict(diameter=0.45), position_rule='spheres on the module -Z face', material='boom_mg_oxidised'),
]

result = dict(
    summary=(
        'COMPUTE SAIL (baseline): a %.0f m square film flown as a diamond (%.0f m corner to corner), %.0f m2, tensioned at its 4 corners by '
        '4 diagonal %.0f m triangular-truss Mg booms behind the film (constant-force tensioners, N = 0.1 N/m, 4 %% catenary edges). Non-spinning: '
        'spin was rejected because the precession torque that 0.5 %% corner vanes can supply limits the spin period to >= ~45 min, giving '
        '0.6-10 mN/m of tension and a 1-3 m edge-bending length, so the 1.63 m fold panels would curl. %.3g chiplet sites (one 1e8-chip training replica + spares) '
        'at 25.4 mm pitch, %.1f MW to the cores, %.1f t (%.3f kg/m2, %.2f g/W; %.2f g/W with the 10 %% overbuild used in research3). The film stack is the '
        'architecture stack with the back enamel thickened from 5 to 15 um: the thin-film IR model gives eps_b ~0.61 for 5 um. Front face: no metal '
        '(IBC cells), AR-coated glass over textured c-Si, near-black navy (luminous albedo ~0.002-0.005), a magenta-blue AR glint 0.13 %% of the Sun. '
        'Dark 25 mm hinge strips every 1.63 m. Chiplets, %d patch laser terminals, hub and booms are all on the back; four %.0f m2 Al corner vanes are the brightest parts. '
        'POD (parametric, 1 MW): dense memory+logic stack (1.5 m3/MW, 0.8 t/MW) in a 5 g/cm2 Mg/MgO shield, %.0f m2 of wings, %.0f m2 of edge-on radiators '
        '(4 blades), 4 SO2 two-phase loops, about 4 g/W, %.0f x %.0f m. Pods that serve sails must fly in the film shell: Starlink-class links close only within '
        '~3,000 km, and 0.86-0.90 AU is >= 3e6 km away. Training islands: 12+1 pods on a 1 km projected circular orbit, shadow-free.'
        % (SIDE, 2 * LD, G['film_area_m2'], B['length_m'], G['chiplet_sites'], G['P_core_MW'], M['total_kg'] / 1e3, M['total_kg_m2'], M['g_per_W_core'],
           M['g_per_W_core_with_10pct_overbuild'], G['n_patch_terminals'], A_V, PW['area_total_m2'], PR['area_planform_m2'], POD['dims']['span_X_m'], POD['dims']['extent_Y_m'])),
    sail=dict(
        baseline_dims=dict(shape='square flown as a diamond, catenary (scalloped) edges', side_m=SIDE, corner_to_corner_m=2 * LD, half_diagonal_m=LD,
                           film_area_m2=G['film_area_m2'], edge_sag_m=G['catenary_sag_m'], thickness_um=ST['stacks']['rows']['A2_arch+thick_enamel (glass20/Si30/Mg13/enamel15)']['thickness_um'] + 2.0,
                           range_side_m=[87, 500], range_note='87 m holds a 1e7-chip replica (or 1e8 sites at 10x memory/site); 500 m if power/site rises to 0.5 W at the same replica'),
        sizing_rationale=dict(
            replica='the largest film training replica (1e8 chiplets) must be one contiguous mesh: 1.03e8 sites incl. 3 % spares -> 279 m side',
            fixed_mass='hub + vanes + tensioners ~0.34 t = 2.4 % of the sail; at a 1e7-chip sail (82 m) fixed mass would be ~19 %',
            fault_domain='%.1f MW per sail; booms SF 3 with 2 tethers per corner; a cut tether or edge cable slackens one edge, power loss is small (cos)' % G['P_core_MW'],
            launch_package='%.1f t, 2 film rolls R %.2f m x %.2f m + 3.4 m hub; fits one mass-driver package (100 g) with a separate EP kick stage' % (M['total_kg'] / 1e3, LY['stowage']['roll_outer_radius_m'], LY['stowage']['roll_length_m']),
            umbra='%.1f km behind each sail' % SC['shadows']['sail_umbra_km'],
            size_trade=ST['size_trade']),
        structure=dict(
            architecture='frame + 4 diagonal booms (non-spinning); constant-force corner tensioners; 4 % catenary edges; film attached at the 4 corners only (loose central tether)',
            tension_N_per_m=0.1, membrane_stress_kPa=0.1 / 80e-6 / 1e3, membrane_f1_Hz=ST['frame_baseline']['membrane_f1_Hz'],
            booms=B, corner_force_N=ST['frame_baseline']['corner_force_N'],
            loads=dict(radiation_pressure_Pa=ST['loads']['p_srp_Pa'], beta=CL['beta']['sail'], billow_slope_deg=ST['frame_baseline']['billow_slope_deg'],
                       through_thickness_dT_K=ST['loads']['dT_through_thickness_K'], thermal_gradient_curvature_per_m=ST['loads']['kappa_gradient_per_m'],
                       disturbance_torque_1pct_Nm=ST['frame_baseline']['disturbance_torque_1pct_Nm'], vane_torque_per_axis_Nm=ST['frame_baseline']['vane_torque_per_axis_Nm'],
                       gravity_gradient_Nm=ST['frame_baseline']['gravity_gradient_torque_Nm']),
            flatness=dict(driver='CTE mismatch of the 13 um Mg spreader (free curvature %.3f /m/K), acting only at free edges (hinge strips, rim) over ell = sqrt(D/N)' % ST['stacks']['rows']['A2_arch+thick_enamel (glass20/Si30/Mg13/enamel15)']['kappa_per_K'],
                          ell_m=[r for r in ST['frame_baseline']['curl_rows'] if r['stack'].startswith('A2') and r['N'] == 0.1][0]['ell_m'],
                          edge_rotation_deg_at_3K_residual=[r for r in ST['frame_baseline']['curl_rows'] if r['stack'].startswith('A2') and r['N'] == 0.1][0]['edge_rot_deg_3K'],
                          interior_slope_deg=ST['frame_baseline']['billow_slope_deg'], power_cost='edge zones (~22 % of area) tilted <= 3.7 deg: cos loss < 0.2 %',
                          requirement='laminate stress-free at 348 K (process at 340-355 K), residual moment <= 3 K-equivalent; fallback stack C (c-Si 46 um as spreader, kappa 3.3x lower, +0.02 kg/m2)'),
            rejected=dict(spin=dict(reason='precession torque H*n_orbit vs 0.5 % vanes caps spin at a period of >= ~45 min (x2 margin); tension then 0.6-10 mN/m, '
                                           'ell = 2.3 m > 0.81 m half-panel -> fold panels curl (48 deg at 3 K); billow 1.8 deg', rows=[r for r in ST['spin_trade_260m'] if r['stack'].startswith('A2')]),
                          hoop_ring='in-plane buckling ring mass is comparable, but a 1.2 km-circumference compression hoop has no packaging/deployment path from a 3 m package',
                          hex_tiles_cable_net='needs a compression member or spin anyway; a hex outline breaks the square chiplet mesh alignment (gores at 60 deg)',
                          frame_rigid='rigidly attached film would see dN = %.0f N/m from a 3e-4 film/boom strain mismatch: tensioners must be load-defined springs' % ST['tension_architectures']['tension_change_if_rigidly_attached_N_per_m']),
            meteoroids=ST['meteoroids'],
            rip_stop='not needed for tear arrest: at 1.2 kPa membrane stress the Griffith crack length is ~%.0e m. Hinge strips (every 1.63 m) and the hem bound damage during handling/deployment; '
                     'expected holes >= 3 mm: %.1f per sail per year; >= 10 mm: one per ~%.0f years' % ((0.75e6 / 1.2e3) ** 2 / math.pi, [h for h in ST['meteoroids']['holes'] if h['hole_mm'] == 3][0]['per_sail_yr'],
                                                                                                   1 / [h for h in ST['meteoroids']['holes'] if h['hole_mm'] == 10][0]['per_sail_yr'])),
        segmentation=dict(
            tile_m=PITCH, cell='2 half-cells 25.4 x 12.7 mm in series per tile (IBC, rear contacts)', fold_panel_width_m=G['panel_width_m'],
            hinge_strips=dict(count=len(LY['positions']['hinge_line_y']), width_m=0.0254, direction='parallel to X (boom A)', material='dark-enamelled glass cloth with Al jumpers'),
            stowage=LY['stowage'], seams='none: one continuous film (the mesh is unbroken); edges hemmed', electrical=LY['electrical']),
        chiplet_layout=dict(sites=G['chiplet_sites'], pitch_m=PITCH, side='back (anti-sun) face, one per tile at the tile centre', die_m=[0.00245, 0.00245, 5e-5],
                            die_area_range_mm2=[1.5, 6.0], P_site_W=G['P_site_W'], P_core_per_site_W=G['P_site_W'] * ETA_CONV,
                            mesh='4-neighbour 2D mesh in the rear metal layer, crossing hinge strips on flexible jumpers', frontier_patch_m=32.5, patches_per_sail=G['n_patch_terminals'],
                            replica='one 1e8-chip replica per sail, or ~60 frontier-inference patches of 32.5 m, or ~950 small-model patches of 8 m',
                            why_back='front placement would shade cells; the Mg spreader and emitter are on the back; front Si+glass (~12 mg/cm2) shields the die from the sunward side'),
        appearance_front=dict(material=MATERIALS['sail_front_pv'], luminous_albedo_total=SC['sail_brightness']['front_luminous_albedo_total'],
                              luminance_cd_m2=SC['sail_brightness']['front_luminance_cd_m2'], stops_below_grey_card=SC['sail_brightness']['front_vs_grey_card_stops'],
                              metal_grid_fraction=0.0, scribe_fraction=2 * 50e-6 / PITCH + 50e-6 / PITCH,
                              glint=dict(F0=F0, radiance_W_m2_sr=SC['sail_brightness']['glint_radiance_W_m2_sr'], tint=glint_tint, bare_glass_F0=OPT['front_visible']['R_top_specular_bare_glass_luminous'],
                                         where='only near the viewer\'s antisolar point (sun-facing mirror)'),
                              colour='very dark navy/indigo; computed texture scatter is violet-blue; AR residual reflection is magenta-blue',
                              visible_pattern='dark satin stripes (hinge strips) every 1.63 m parallel to X; tile scribes only at < 3 m',
                              spectra=dict(nm=OPT['front_visible']['spectrum_nm'], R_total=OPT['front_visible']['R_total_spectrum'], R_top=OPT['front_visible']['R_top_spectrum'])),
        appearance_back=dict(material=MATERIALS['sail_back_enamel'], chiplets=MATERIALS['chiplet_die'], relief='2.45 mm square bumps 50 um high at 25.4 mm pitch',
                             visible='dark warm grey; under the swarm glow it sits %.1f (f=0.01) to %.1f (f=0.5) stops below the sunlit front' % (SC['back_face_lighting']['rows'][0]['back_vs_front_stops'], SC['back_face_lighting']['rows'][2]['back_vs_front_stops']),
                             hardware='booms 0.3 m behind, hub at centre, %d terminals on 0.6 m masts, hinge strips, corner tensioners' % G['n_patch_terminals'],
                             emissivities=dict(front=0.85, back=0.90, front_conservative_fused_silica=0.76, back_conservative_15um=0.73, back_5um_fused_silica=0.61)),
        hardware=LY['hardware'],
        pointing='3-axis, non-spinning; 4 corner vanes (2-axis gimbals) give %.2f N m per axis vs %.2f N m from a 1 %% reflectance asymmetry; star trackers + IMU on the hub, sun sensors at the tips; '
                 'commands over the film mesh. No liquid-crystal RCDs (organic, need H; not Mercury-native); inorganic MEMS micro-shutter strips are an option.' % (
                     ST['frame_baseline']['vane_torque_per_axis_Nm'], ST['frame_baseline']['disturbance_torque_1pct_Nm']),
        mass_breakdown=M,
        temperatures=dict(film_K=T_SHEET, chiplet_die_K=[T_SHEET + 7, T_SHEET + 10], hinge_K=T_SHEET, booms_K=SC['lwir']['booms_in_film_shade_K'], hub_K=[270, 300],
                          terminals_K=[295, 315], vanes_K=[SC['lwir']['vane_45deg_K'], SC['lwir']['vane_face_on_K']], placement=dict(r_AU=R_FILM, S_W_m2=S_FILM, q_e_W_m2=FILM['q_e'], eta=FILM['eta'])),
        counts=LY['counts'],
        optics_findings=dict(ir=OPT['ir_emissivity'], emissivity_scan=OPT['front_visible_extra']['emissivity_vs_glass_thickness_fused_silica'],
                             placement_sensitivity=OPT['front_visible_extra']['placement_sensitivity'], solar_absorptance=OPT['front_visible_extra']['solar_absorptance']),
        sensitivity=SE),
    pod=dict(
        power=POD['power'], module=POD['module'], shield=dict(areal='>= 5 g/cm2 on every line of sight to the memory', composition=POD['module']['shield_material'],
                                                              dedicated_kg=POD['module']['dedicated_shield_kg'], table=POD['module']['shield_g_per_W_table']),
        wings=POD['wings'], radiators=POD['radiators'], loops=POD['loops'], lasers=POD['lasers'], propulsion=POD['propulsion'],
        mass_breakdown=POD['mass_breakdown_g_per_W'], dims=POD['dims'], beta=POD['beta'],
        placement='training/HBM-class islands at 0.86-0.90 AU; service pods (CPU/DRAM sandboxes, storage, gateways) in pod lanes inside the film shell (0.92 AU, '
                  '+150-300 km outward, >= 2 km lateral of any sail): Starlink-class links need <= ~3,000 km'),
    cluster=dict(formation=CL['formation'], beta=CL['beta'], handover=CL['handover'], penumbral_dimming=CL['penumbral_dimming']),
    scene_facts=dict(sun=SC['sun'], sail_brightness=SC['sail_brightness'], glint=SC['glint'], back_face=SC['back_face_lighting'], spacing=SC['spacing'],
                     pod_radiators_visible=SC['pod_radiators_visible'], lwir=SC['lwir'], shadows=SC['shadows'], energy_basis_check=SE['energy_basis_check']),
    render_spec=dict(
        units='metres, kelvin, W/m2; Cycles sun strength = irradiance', frame_sail='+Z toward the Sun (light travels -Z); film in XY at z=0; booms along X and Y behind the film',
        frame_pod='+Z toward the Sun; wings in XY along X; radiator blades in the YZ plane along Y',
        sun=dict(strength_W_m2=S_FILM, angle_deg=math.degrees(sun_ang_diam(R_FILM)), blackbody_K=T_SUN, colour_linear_sRGB=OPT['sun']['linear_sRGB_normalised']),
        exposure='meter an 18 %% grey card at %.0f W/m2 (render/lib.py meter); the sail front then sits ~%.1f stops below mid-grey' % (S_FILM, SC['sail_brightness']['front_vs_grey_card_stops']),
        world='black + star field (HYG/BSC); optional anti-sun dome of %.2e W/m2/sr x (f/0.01) for the swarm glow' % SC['back_face_lighting']['rows'][0]['anti_sun_sky_radiance_W_m2_sr'],
        neighbours='Poisson in a shell r_min(f)..1.1 AU; nearest neighbour %.0f km (f=0.01), %.0f km (f=0.1), %.0f km (f=0.5); all sails share the sun-facing attitude' % tuple(r['nearest_neighbour_km'] for r in SC['spacing']['rows']),
        lod='chiplets and scribes only < 5 m; hinge strips as texture stripes beyond ~50 m; booms as lines beyond ~5 km',
        materials=MATERIALS, parts=render_parts + pod_parts,
        cluster=dict(pods_on_ring=12, hub_pods=1, rho_m=1000.0, law='x = rho/2 cos(phi), y = -rho sin(phi), z = (sqrt3/2) rho cos(phi), phi = 2 pi k/12 + phase (x radial anti-sunward)',
                     attitude='all pods identical attitude, +Z to the Sun')),
    sources=[
        'JAXA IKAROS (14 m square, 7.5 um polyimide, spin deployment, LCD reflectivity control devices): https://www.isas.jaxa.jp/e/forefront/2011/tsuda/02.shtml ; https://eoportal.org/satellite-missions/ikaros',
        'NASA ACS3 (80 m2, 7 m composite booms 0.9 kg each, 2000 m2 scalability): https://planetary.org/space-missions/acs3',
        'NASA Solar Cruiser (1653 m2, 2.5 um CP1, 29.5 m booms, RCDs): https://science.nasa.gov/heliophysics/programs/solar-cruiser ; quadrant paper https://www.citytech.cuny.edu/isss2023/docs/proceedings/19 - Development of a Flight-Like Solar Sail Quadrant for NASA%27s Solar Cruiser - Maddox Kirk Maddox.pdf',
        'Solar Cruiser RCD optics (SPIE): https://opticalengineering.spiedigitallibrary.org/conference-proceedings-of-spie/PC12664/PC1266405/Optical-performance-of-reflectivity-control-devices-for-solar-sail-applications/10.1117/12.2676775.full',
        'NASA NEA Scout (86 m2 single sail, 4 x 6.8 m Elgiloy TRAC booms): https://ntrs.nasa.gov/api/citations/20160008143/downloads/20160008143.pdf',
        'Tesat SCOT80 (80 mm, up to 100 Gbps, 11.9 kg per channel, 260x190x240 mm, 60-80 W, 8000 km): https://satnow.com/products/laser-communication-terminals/tesat-spacecom-gmbh-co-kg/155-1423-scot80 ; https://event.dlr.de/en/hm2025/tesat-scot80/',
        'Mynaric CONDOR Mk3 (80 mm, optical head 372x282x257 mm): https://www.satnow.com/products/laser-communication-terminals/mynaric/155-1475-condor-mk3',
        'Starlink optical links (V2 mini 3 x up to 200 Gbps; V3 6 x 400 Gbps; mini laser 25 Gbps to 4000 km): https://newspaceeconomy.ca/2026/05/29/how-does-starlink-use-satellite-laser-communications/ ; https://www.gophotonics.com/news/details/8975-starcloud-signs-deal-with-spacex-starlink-to-integrate-mini-laser-terminals',
        'Google Suncatcher (81-satellite cluster, 1 km radius, 100-200 m spacing, 1.6 Tbps bench link): https://research.google/blog/exploring-a-space-based-scalable-ai-infrastructure-system-design/ ; arXiv:2511.19468',
        'Optical constants (refractiveindex.info database, CC0): https://github.com/polyanskiy/refractiveindex.info-database -- Si: Green 2008 doi:10.1016/j.solmat.2008.06.009 and Chandler-Horowitz & Amirtharaj 2005; SiO2: Malitson 1965, Franta et al.; TiO2: Devore 1951; Mg: Hagemann 1975; Al: Rakic 1995',
        'CIE 1931 analytic fit: Wyman, Sloan, Shirley 2013, JCGT 2(2): https://jcgt.org/published/0002/02/01/',
        'Fused silica reststrahlen limits emittance (and thin coatings to raise it): US patent 4783373 https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/4783373',
        'Grun 1985 meteoroid flux via SPENVIS: https://spenvis.oma.be/help/background/metdeb/metdeb.html',
        'IAU 2015 nominal solar values (L, R, Teff); CODATA 2018 sigma',
        'Project: /home/user/dyson/docs/architecture.md; research3 thermal_mass (film.py/json, conc.json, fluids.json, reliability.json), research3 skeptic checks.py/json, research3 interconnect_final.json (FSO link model), research2 research_ai1.json (lessons only)',
    ],
    open_questions=[
        'IR emissivity is the largest physics risk. With fused-silica optical constants (a floor), 20 um cover glass gives eps_f ~0.76 and 5 um enamel on Mg gives eps_b ~0.61, against 0.85/0.90 assumed; at 0.76/0.61 the film must sit at 1.04 AU with q_e -22 %. '
        'Baseline carries 15 um microtextured Fe/Mg/Ca-silicate enamel (+27 g/m2). Needs measured hemispherical eps of Mercury-composition enamels (5-20 um, textured) at 348 K.',
        'Residual laminate moment (intrinsic film stress of evaporated Mg and deposited glass) must stay <= ~3 K-equivalent, or the hinge-strip edges tilt > 4 deg; fallback stack C (Si spreader) costs +0.02 kg/m2.',
        'Boom deployment: 199 m triangular trusses from a 3.4 m hub have no heritage (largest deployed truss mast ~60 m, SRTM). Options: articulated truss canister or in-situ beam builder from Mg strip; judgement call.',
        'Sail-pod link geometry conflicts with the architecture text: pods at 0.86-0.90 AU are >= 3e6 km from the film, where 10 cm links give ~1e-4 Gbps. Service pods must share the film shell (pod lanes); confirm the split between in-shell service pods and inner training islands.',
        'Laser terminal mass assumed 5 kg (Mercury-built 10 cm); SCOT80 is 11.9 kg per channel. At 12 kg the terminals are 0.011 kg/m2 (+5 % sail mass).',
        'Front-face diffuse albedo: ideal ray optics gives ~0.0006 (cells) but real texture/edge scatter is likely 3-10x higher; render value uses 3x. Needs a measured BRDF of AR-glass/textured c-Si.',
        'Flexible mesh and power jumpers across ~240 hinge lines per sail: fatigue during fold/roll at 100 g launch and deployment.',
        'Thick-shell spacing assumes Poisson placement; a real orbit plan (distinct radii per ring to avoid crossings) changes the neighbour pattern (rings, not random).',
        'Pod shielding depends on stack density: 0.18 g/W at 1.5 m3/MW but 0.8 g/W at 4 m3/MW; with HBM-class parts obsolete by 2070-2300, revisit the 5 g/cm2 requirement against future memory radiation tolerance.',
        'SO2 compatibility with Mg-alloy loop hardware (sulfidation) and O2 ion-thruster lifetime are untested on Mercury-native materials.',
        '1e26 W read as intercepted sunlight (f = 0.26, 1.0e18 sails); 1e26 W of chip power exceeds eta*L_sun = 5.1e25 W and is unreachable.',
        'Porous-silica AR and TiO2 ARC durability under 0.92 AU proton/UV fluence; without AR the glint F0 rises to 3.7 % and q_e drops ~3 %.',
    ])

dump(result, 'result.json')
print('result.json written: %.1f kB' % (os.path.getsize(os.path.join(HERE, 'result.json')) / 1e3))
print('cells diffuse rgb (ideal)', [round(c, 5) for c in rgb_cells], 'Y', round(Y_cells, 5), 'render', rgb_cells_render, 'coat IOR', round(coat_ior, 4))
print(result['summary'])
