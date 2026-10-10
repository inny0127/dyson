"""Scene facts for an honest render: Sun, sail brightness and glint, back-face lighting, neighbour spacing vs coverage,
pod radiator appearance, LWIR temperatures. Radiometric units match render/lib.py (Cycles sun strength = W/m2,
Lambertian albedo a renders at a*E/pi W/m2/sr)."""
import math, numpy as np
from common import *
import optics as O

L_ = load('sail_layout.json'); OPT = load('optics.json'); P_ = load('pod.json'); ST = load('sail_structure.json'); CL = load('cluster.json')
OUT = {}

# ---------------- Sun
lv = O.LV
B = O.planck_l(lv / 1000, T_SUN)
x, y, z = O.cmf(lv)
K_lm_W = 683 * np.trapezoid(B * y, lv) / (SIGMA * T_SUN ** 4 / math.pi * 1e-3)   # lm per W of total blackbody power (lv in nm -> /1e-3 per um... see below)
# exact: luminous efficacy = 683 * int(B ybar dl) / int(B dl) over all wavelengths
lam_all = np.geomspace(0.1, 200, 20000)
Ball = O.planck_l(lam_all, T_SUN)
K_eff = 683 * np.trapezoid(B * y, lv / 1000) / np.trapezoid(Ball, lam_all)
sun = {}
for r in (R_FILM, 0.92, 0.88, 1.0):
    S = flux(r); th = sun_ang_diam(r); Om = math.pi * (th / 2) ** 2
    sun['%.3f_AU' % r] = dict(irradiance_W_m2=S, illuminance_lx=S * K_eff, angular_diameter_deg=math.degrees(th), angular_diameter_arcmin=math.degrees(th) * 60,
                              disc_solid_angle_sr=Om, disc_radiance_W_m2_sr=S / Om, disc_luminance_cd_m2=S * K_eff / Om,
                              apparent_mag_V=-26.74 + 5 * math.log10(r))
OUT['sun'] = dict(by_distance=sun, T_eff_K=T_SUN, luminous_efficacy_lm_W=K_eff, colour_linear_sRGB=OPT['sun']['linear_sRGB_normalised'],
                  colour_srgb8=OPT['sun']['srgb_8bit'], CIE_xy=OPT['sun']['CIE_xy'],
                  blender='Sun lamp strength = irradiance (W/m2), angle = angular diameter, colour = Blackbody 5772 K (render/lib.py add_sun)')
s0 = sun['%.3f_AU' % R_FILM]
print('Sun at %.3f AU: %.1f W/m2, %.0f lx, %.4f deg, L %.3e W/m2/sr, %.3e cd/m2; K %.1f lm/W' % (R_FILM, s0['irradiance_W_m2'], s0['illuminance_lx'],
      s0['angular_diameter_deg'], s0['disc_radiance_W_m2_sr'], s0['disc_luminance_cd_m2'], K_eff))
S = s0['irradiance_W_m2']; E_v = s0['illuminance_lx']; L_sun = s0['disc_radiance_W_m2_sr']

# ---------------- sail front albedos (luminous), area-weighted
fe = OPT['front_visible_extra']
a_cells = fe['flat_fraction_0.05']['R_luminous']             # cells incl. 5 % imperfect texture + top surface (non-specular part)
a_spec = OPT['front_visible']['R_top_specular_luminous']
geom = L_['geometry']
f_hinge = geom['excluded']['hinge_rows'] / geom['tile_positions_in_film']
a_hinge = 0.08                                               # dark enamel-coated glass cloth (alpha/eps matched to film)
a_front = (1 - f_hinge) * (a_cells - a_spec) + f_hinge * a_hinge
A_sail = geom['film_area_m2']
L_front = a_front * S / math.pi
Lv_front = a_front * E_v / math.pi
grey = 0.18 * E_v / math.pi
m_sun = s0['apparent_mag_V']
def mag(F):
    return m_sun - 2.5 * math.log10(F / S)
bright = []
for d in (1e3, 1e4, 1e5, 1e6, 1e7):
    ang = 2 * math.degrees(math.atan(geom['half_diagonal_LD_m'] / d))
    F_diff = L_front * A_sail / d ** 2 if ang < 30 else L_front * A_sail / d ** 2
    F_glint = a_spec * L_sun * A_sail / d ** 2
    th_sun = math.radians(s0['angular_diameter_deg'])
    # when the sail subtends more than the Sun, only a Sun-sized spot glints
    A_glint = min(A_sail, math.pi * (th_sun / 2 * d) ** 2)
    F_glint = a_spec * L_sun * A_glint / d ** 2
    A_v = ST['frame_baseline']['vane_area_each_m2']
    A_vg = min(A_v, math.pi * (th_sun / 2 * d) ** 2)
    F_vane = 0.85 * L_sun * A_vg / d ** 2
    bright.append(dict(distance_km=d / 1e3, corner_to_corner_deg=ang, diffuse_flux_W_m2=F_diff, diffuse_mag=mag(F_diff),
                       glint_flux_W_m2=F_glint, glint_mag=mag(F_glint), one_vane_glint_mag=mag(F_vane)))
    print('sail at %8.0f km: %.3f deg across; diffuse mag %.1f; front glint mag %.1f; one-vane glint mag %.1f' % (d / 1e3, ang, mag(F_diff), mag(F_glint), mag(F_vane)))
OUT['sail_brightness'] = dict(front_luminous_albedo_total=a_front, cells_albedo=a_cells - a_spec, hinge_strip_area_fraction=f_hinge, hinge_strip_albedo=a_hinge,
                              front_radiance_W_m2_sr=L_front, front_luminance_cd_m2=Lv_front, grey_card_luminance_cd_m2=grey,
                              front_vs_grey_card_stops=math.log2(grey / Lv_front),
                              glint_radiance_W_m2_sr=a_spec * L_sun, glint_luminance_cd_m2=a_spec * L_sun * K_eff,
                              glint_colour_linear_sRGB_rel=fe['glint_top_surface_linear_sRGB_rel'],
                              vane_glint_radiance_W_m2_sr=0.85 * L_sun, rows=bright,
                              note='Front face is near-black navy: ~%.1f stops below an 18%% grey card in the same sun. The 4 Al corner vanes are by far the '
                                   'brightest parts (each specular glint ~%.0fx the whole film glint).' % (math.log2(grey / Lv_front), 0.85 * ST['frame_baseline']['vane_area_each_m2'] / (a_spec * A_sail)))
print('front albedo %.4f -> %.1f cd/m2 (grey card %.0f cd/m2, %.1f stops darker); glint L %.0f W/m2/sr' % (a_front, Lv_front, grey, math.log2(grey / Lv_front), a_spec * L_sun))

# ---------------- glint geometry and probability
th_s = math.radians(s0['angular_diameter_deg']) / 2
slope_interior = math.radians(ST['frame_baseline']['billow_slope_deg']) + math.radians(0.1)    # billow + manufacturing ripple allowance
edge_rot = [r for r in ST['frame_baseline']['curl_rows'] if r['stack'].startswith('A2') and r['N'] == 0.1][0]
slope_edge = math.radians(edge_rot['edge_rot_deg_3K'])
def p_cone(th):
    return (1 - math.cos(th)) / 2
glint = dict(geometry='A sun-facing sail reflects the Sun straight back sunward. A viewer sees the glint only near its own ANTISOLAR point: '
                      'it must be sunward of the sail and look away from the Sun. All sails share (nearly) the same normal, so in a view toward '
                      'the antisolar point every sail within the glint half-angle of it glints at once: a "glint halo" around the camera\'s antisolar point.',
             half_angle_interior_deg=math.degrees(th_s + 2 * slope_interior), half_angle_hinge_edges_deg=math.degrees(th_s + 2 * slope_edge),
             hinge_edge_area_fraction=2 * edge_rot['ell_m'] / L_['geometry']['panel_width_m'],
             p_random_direction_interior=p_cone(th_s + 2 * slope_interior), p_random_direction_edges=p_cone(th_s + 2 * slope_edge),
             p_random_direction_per_vane=p_cone(th_s + math.radians(1.0)),
             vane_note='vanes tilt 0-40 deg for control, so their glints point anywhere within ~80 deg of the Sun direction; each vane glints for a '
                       'random viewer with p ~ %.1e' % p_cone(th_s + math.radians(1.0)))
OUT['glint'] = glint
print('glint half-angle interior %.2f deg (p %.1e), hinge edges %.2f deg (p %.1e)' % (glint['half_angle_interior_deg'], glint['p_random_direction_interior'],
      glint['half_angle_hinge_edges_deg'], glint['p_random_direction_edges']))

# ---------------- neighbour spacing vs coverage (thick shell to 1.1 AU)
spacing = []
for f in (0.01, 0.1, 0.5):
    r_in = film_rmin(T_SHEET, f); r_out = 1.10
    dR = (r_out - r_in) * AU
    tau = -math.log(1 - f)                      # optical depth of the shell along a radial line
    n = tau / (A_sail * dR)                     # sails per m3 (A_sail ~ cross-section facing the Sun)
    d_nn = 0.554 * n ** (-1 / 3)
    d_2d = math.sqrt(A_sail / f)                # if all sails sat in one thin layer
    within = {('%g_km' % d): 4 / 3 * math.pi * (d * 1e3) ** 3 * n for d in (10, 100, 1000, 10000)}
    d_resolve = 279.0 / (math.radians(60) / 3840)  # distance at which a sail spans 1 px in a 60-deg, 3840-px frame
    n_res = 4 / 3 * math.pi * d_resolve ** 3 * n / 6   # roughly 1/6 of the sphere inside a 60-deg cone
    back_g = f / 2
    spacing.append(dict(f=f, r_inner_AU=r_in, shell_thickness_AU=r_out - r_in, number_density_per_km3=n * 1e9, nearest_neighbour_km=d_nn / 1e3,
                        thin_layer_spacing_km=d_2d / 1e3, sails_within=within, distance_for_1px_km=d_resolve / 1e3,
                        resolved_sails_in_60deg_frame=n_res, n_sails_total=f * 4 * math.pi * (r_in * AU) ** 2 / A_sail))
    print('f=%.2f: shell %.3f-%.2f AU, n %.3e /km3, nearest %.0f km (thin layer %.1f km); within 1000 km %.1f; resolved in 60 deg frame %.1f' % (
        f, r_in, r_out, n * 1e9, d_nn / 1e3, d_2d / 1e3, within['1000_km'], n_res))
OUT['spacing'] = dict(rows=spacing, model='Poisson in a shell from r_min(f) (sheet 348 K) to 1.1 AU; n = -ln(1-f)/(A_sail * dR); nearest neighbour 0.554 n^-1/3. '
                      'A thin single layer (all sails at r_min) would give sqrt(A/f) instead; real swarms need ~1e7+ distinct orbit radii to avoid crossings, '
                      'so the thick-shell numbers are the ones to use for wide shots.')

# ---------------- back-face lighting
back = []
for f in (0.01, 0.1, 0.5):
    g = f / 2
    L_sky_vis = g * L_front                      # anti-sun hemisphere: sunlit fronts of farther sails
    E_back = math.pi * L_sky_vis
    E_star = 2.5e-4 / K_eff * 1.0                # starlight + zodiacal ~2.5e-4 lx -> W/m2 (sun-weighted)
    a_back = 0.06
    Lv_back = a_back * (E_back + E_star) * K_eff / math.pi
    q_ir = g * 0.85 * SIGMA * T_SHEET ** 4
    back.append(dict(f=f, anti_sun_sky_radiance_W_m2_sr=L_sky_vis, anti_sun_sky_luminance_cd_m2=L_sky_vis * K_eff,
                     back_illuminance_lx=(E_back + E_star) * K_eff, back_luminance_cd_m2=Lv_back,
                     back_vs_front_stops=math.log2(Lv_front / Lv_back), ir_irradiance_on_back_W_m2=q_ir))
    print('back face f=%.2f: sky %.2e cd/m2, E %.3f lx, back L %.2e cd/m2 (%.1f stops below front), IR %.1f W/m2' % (
        f, L_sky_vis * K_eff, (E_back + E_star) * K_eff, Lv_back, math.log2(Lv_front / Lv_back), q_ir))
OUT['back_face_lighting'] = dict(rows=back, starlight_zodiacal_lx=2.5e-4,
    note='The back looks anti-sunward, at the sunlit FRONTS of sails farther out (they face the Sun, hence the viewer). Their summed glow '
         '(sky coverage g ~ f/2) outshines starlight by ~1e3-1e5x. The back emits ~%.0f W/m2 at 348 K (LWIR) and has no visible thermal glow '
         '(348 K blackbody luminance ~1e-20 cd/m2). Model it as a dark (albedo 0.06) surface under a dim, uniform anti-sun dome plus the Sun-side '
         'black sky; it is a silhouette against stars when exposed for sunlit parts.' % (0.85 * SIGMA * T_SHEET ** 4))

# ---------------- pod radiators in visible light
F_bw = P_['radiators']['view_factor_to_wings']
w = P_['wings']
L_wingfront = a_front * flux(P_['power']['r_AU']) / math.pi
E_rad_face = F_bw * math.pi * L_wingfront * 4 + 0.5 * math.pi * back[0]['anti_sun_sky_radiance_W_m2_sr']
a_rad = 0.80
Lv_rad = a_rad * E_rad_face * K_eff / math.pi
Lv_white_sunlit = a_rad * flux(P_['power']['r_AU']) * K_eff / math.pi
OUT['pod_radiators_visible'] = dict(face_illuminance_lx=E_rad_face * K_eff, face_luminance_cd_m2=Lv_rad, sunlit_white_luminance_cd_m2=Lv_white_sunlit,
                                    stops_below_sunlit_white=math.log2(Lv_white_sunlit / Lv_rad), leading_edge_thickness_m=0.025,
                                    note='Blades are edge-on: no direct sunlight on the faces. They see the wings only at grazing angles (view factor %.4f) and the swarm glow. '
                                         'In a frame exposed for sunlit parts the faces are black; only the 25 mm sunward leading edges and the sunward header lips are lit '
                                         '(thin bright white lines). Wings look as dark as sail fronts; the module and booms are the bright, sunlit parts.' % F_bw)
print('pod radiator face: %.2e lx, %.2e cd/m2 (%.1f stops below sunlit white %.0f cd/m2)' % (E_rad_face * K_eff, Lv_rad, math.log2(Lv_white_sunlit / Lv_rad), Lv_white_sunlit))

# ---------------- LWIR temperatures
def plate_T(alpha, eps_f, eps_b, S_, q_in_back=0.0):
    return ((alpha * S_ + q_in_back) / (SIGMA * (eps_f + eps_b))) ** 0.25
T_vane_on = plate_T(0.10, 0.05, 0.85, S)
T_vane_45 = plate_T(0.10, 0.05, 0.85, S * math.cos(math.radians(45)))
T_boom = T_SHEET * (0.5 * 0.85 / 0.85) ** 0.25
temps = dict(film_mean_K=T_SHEET, chiplet_die_K=[T_SHEET + 7.0, T_SHEET + 10.0], tile_pattern='die hot spots +7-10 K at 25.4 mm pitch, ~1 cm wide',
             hinge_strip_K=T_SHEET, edge_tape_K=T_SHEET - 3, corner_doubler_K=T_SHEET - 2,
             booms_in_film_shade_K=T_boom, hub_K=[270.0, 300.0], laser_terminals_K=[295.0, 315.0],
             vane_face_on_K=T_vane_on, vane_45deg_K=T_vane_45,
             pod=dict(wing_K=P_['wings']['T_K'], radiator_root_K=355.0, radiator_tip_K=345.0, radiator_mean_K=P_['radiators']['T_K'],
                      module_exterior_K=300.0, stack_junction_K=P_['module']['temperatures_K']['stack_junction'], thrusters_K=[300, 420]),
             peak_wavelength_um={'348K': 2898 / 348.15, '353K': 2898 / 353, '293K': 2898 / 293},
             emissivities=dict(film_front=0.85, film_back=0.90, film_front_conservative=0.76, film_back_conservative_15um=0.73,
                               radiator=0.90, vane_front_Al=0.05, vane_back=0.85, booms_oxidised_Mg=0.3, hub_glass_cloth_blanket=0.6))
OUT['lwir'] = temps
print('vane %.0f K face-on, %.0f K at 45 deg; booms %.0f K' % (T_vane_on, T_vane_45, T_boom))

# ---------------- umbra / keep-outs for wide shots
OUT['shadows'] = dict(sail_umbra_km=98.9 * L_['geometry']['side_m'] / 1e3, pod_umbra_km=CL['formation']['pod_umbra_km'],
                      rule='nothing within 100x its size downstream of any sail; pods sunward of a sail must be >= 300 km away (<0.5 % dimming) '
                           'or laterally clear of its sun-line cylinder')
dump(OUT, 'scene.json')
