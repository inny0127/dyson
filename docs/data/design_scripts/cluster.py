"""Pod clusters and sail-pod geometry.
1. beta mismatch: along-track drift of film vs pods on co-radial circular orbits.
2. Training island formation: N pods (1-12 MW) on a projected circular orbit (PCO) in Hill's frame
   (x radial = sun line, y along-track, z cross-track). Check min 3-D separation and min separation projected on the
   plane normal to the Sun (shadowing) over an orbit; umbra/penumbra.
3. Sail-pod handover links: rate vs range (FSO model of research3/interconnect: 10 cm, 9.6 Tbps near-field,
   1.6 Tbps at 1000 km, ~1/L^2 beyond), contact windows from the beta drift, pod lanes in the film shell."""
import math, numpy as np
from common import *

L_ = load('sail_layout.json'); P_ = load('pod.json')
OUT = {}
sigma_sail = L_['mass']['total_kg_m2']
p_per_S = srp_pressure(1.0, alpha=0.90, rho_spec=0.002, rho_diff=0.003)
beta_sail = beta_of(p_per_S * C, sigma_sail)
beta_pod = P_['beta']
r = R_FILM * AU
v_circ = math.sqrt(GM_SUN / r)
dv_track = v_circ * ((1 - beta_pod) ** 0.5 - (1 - beta_sail) ** 0.5)
da = (beta_sail - beta_pod) * GM_SUN / r ** 2
r_sync = R_FILM * ((1 - beta_pod) / (1 - beta_sail)) ** (1 / 3)
OUT['beta'] = dict(sail=beta_sail, pod=beta_pod, delta_accel_m_s2=da, delta_v_per_yr_m_s=da * YEAR, along_track_drift_m_s=dv_track,
                   drift_km_per_day=dv_track * DAY / 1e3, co_rotation_radius_AU=r_sync, co_rotation_offset_km=(r_sync - R_FILM) * AU / 1e3)
print('beta sail %.5f pod %.5f; da %.2e m/s2 (%.0f m/s/yr); co-radial drift %.1f m/s (%.0f km/day); co-rotation needs pods %.0f km further out' % (
    beta_sail, beta_pod, da, da * YEAR, dv_track, dv_track * DAY / 1e3, (r_sync - R_FILM) * AU / 1e3))

# ---------------- 2. PCO formation
R_POD = P_['power']['r_AU']
n = math.sqrt((1 - beta_pod) * GM_SUN / (R_POD * AU) ** 3)
half_x = P_['dims']['span_X_m'] / 2; half_y = P_['dims']['extent_Y_m'] / 2
R_fp = max(half_x, half_y)                       # bounding radius of the pod footprint normal to the Sun
form = []
for N, rho in ((3, 600.0), (6, 800.0), (12, 1000.0), (12, 700.0)):
    t = np.linspace(0, 2 * math.pi / n, 721)
    ph = 2 * math.pi * np.arange(N) / N
    pos = []
    for p in ph:
        x = rho / 2 * np.cos(n * t + p); y = -rho * np.sin(n * t + p); z = rho * math.sqrt(3) / 2 * np.cos(n * t + p)
        pos.append(np.stack([x, y, z], 1))
    pos.append(np.zeros((len(t), 3)))              # hub pod on the reference orbit (switch/gateway or the 13th MW)
    pos = np.array(pos)
    dmin = 1e18; pmin = 1e18
    for i in range(len(pos)):
        for j in range(i + 1, len(pos)):
            d = pos[i] - pos[j]
            dmin = min(dmin, np.linalg.norm(d, axis=1).min())
            pmin = min(pmin, np.hypot(d[:, 1], d[:, 2]).min())
    ok = pmin >= 2 * R_fp + 50
    form.append(dict(N_ring=N, hub_pod=True, rho_m=rho, min_3d_sep_m=dmin, min_projected_sep_m=pmin, required_projected_m=2 * R_fp + 50,
                     shadow_free=bool(ok), span_m=2 * rho, max_link_m=2 * rho))
    print('PCO N=%2d+1 rho %.0f m: min 3D %.0f m, min projected %.0f m (need %.0f) -> %s' % (N, rho, dmin, pmin, 2 * R_fp + 50, 'OK' if ok else 'SHADOW RISK'))
umbra_pod = 98.9 * 2 * R_fp
OUT['formation'] = dict(frame='Hill frame at the cluster reference orbit: x radial (sun line, +x anti-sunward), y along-track, z cross-track',
                        law='projected circular orbit: x = rho/2 cos(nt+phi), y = -rho sin(nt+phi), z = (sqrt3/2) rho cos(nt+phi); constant range rho; '
                            'projected (y,z) separation never below 0.866*rho*2 sin(pi/N)',
                        rows=form, pod_footprint_radius_m=R_fp, pod_umbra_km=umbra_pod / 1e3, orbit_period_days=2 * math.pi / n / DAY,
                        baseline=dict(N_ring=12, hub_pod=1, rho_m=1000.0, power_MW='1-13 (one pod per MW)', island_span_km=2.0,
                                      intra_island_link='DWDM 10 cm terminals, 0.5-2 km, near-field (>= 9.6 Tbps each), 6 neighbours per pod'),
                        island_spacing_km=max(50.0, 3 * umbra_pod / 1e3),
                        rules=['all pods sun-pointing, wings in the plane normal to the Sun; no pod within its neighbours\' sun-line cylinder (radius 2 x footprint + 50 m) inside 30 km',
                               'islands >= %.0f km apart along-track (> 3x pod umbra length of %.0f km)' % (max(50.0, 3 * umbra_pod / 1e3), umbra_pod / 1e3),
                               'training pods at 0.88 AU are always sunward of the film (0.919+ AU); at >= 6e6 km their penumbra on a sail is < 1e-9 of the disc'])

# penumbral dimming of a sail by a pod (or of a pod by a sail) at distance d behind it
def dimming(D_occ, d):
    shadow = sun_ang_diam(R_FILM) * d
    return min(1.0, (D_occ / max(shadow, 1e-9)) ** 2)
dim_rows = []
for d in (1e3, 1e4, 3e4, 1e5, 1e6, 6e9):
    dim_rows.append(dict(distance_m=d, pod_on_sail=dimming(2 * R_fp, d), sail_on_pod=dimming(L_['geometry']['side_m'] * 1.13, d)))
OUT['penumbral_dimming'] = dim_rows
print('dimming by a pod at 30 km: %.3f, 100 km: %.4f; by a sail on a pod 200 km behind: %.4f' % (dimming(2 * R_fp, 3e4), dimming(2 * R_fp, 1e5), dimming(L_['geometry']['side_m'] * 1.13, 2e5)))

# ---------------- 3. handover links
def rate_Tbps(L_m, D=0.10):
    near = 9.6 * (D / 0.10) ** 2
    far = 1.6 * (D / 0.10) ** 4 * (1e6 / L_m) ** 2
    return min(near, far)
link_rows = []
for Lkm in (100, 400, 1000, 2000, 3000, 4000, 1e4, 1e5, 0.04 * AU / 1e3):
    link_rows.append(dict(range_km=Lkm, rate_Tbps_10cm=rate_Tbps(Lkm * 1e3), rate_Tbps_30cm=rate_Tbps(Lkm * 1e3, 0.30)))
    print('link %10.0f km: 10 cm %.3g Tbps, 30 cm %.3g Tbps' % (Lkm, rate_Tbps(Lkm * 1e3), rate_Tbps(Lkm * 1e3, 0.30)))
L_max = 1e6 * math.sqrt(1.6 / 0.2) / 1e3     # km for 0.2 Tbps on 10 cm
lane_dr = 200.0
contact = 2 * math.sqrt(L_max ** 2 - lane_dr ** 2) * 1e3 / dv_track / 3600
OUT['handover'] = dict(rate_model='10 cm: min(9.6 Tbps, 1.6 Tbps*(1000 km/L)^2); x(D/0.1)^4 in the far field (research3 interconnect fso.py)',
                       rows=link_rows, range_for_0p2Tbps_km=L_max,
                       finding='Starlink-class sail-pod links close only within ~2000-4000 km. Pods at 0.86-0.90 AU are >= 3e6 km (0.02 AU) from the film: '
                               '~1e-4 Gbps on 10 cm. So pods that serve sails (CPU/DRAM sandboxes, storage, gateways) must fly IN the film shell, '
                               'in pod lanes; HBM training islands may sit at 0.86-0.90 AU and talk to the film only by relay chains.',
                       pod_lane=dict(radial_offset_km='+150 to +300 (anti-sunward of the local sail layer: links look >= 3 deg into the sails\' back hemisphere)',
                                     lateral_offset_km='>= 2 (outside every sail\'s penumbra cone: 0.0101 rad x 200 km / 2 + sail/2 + pod/2 ~ 1.2 km)',
                                     relative_speed_m_s=dv_track, contact_window_h_at_0p2Tbps=contact,
                                     lane_spacing_km='pods every <= %.0f km along a lane keep >= 1 pod in range of every sail' % (2 * math.sqrt(L_max ** 2 - lane_dr ** 2)),
                                     mass_cost='pods at 0.92 AU instead of 0.88 AU: wing +9 %% area (S 1611 vs 1767 W/m2); research3 r-scan g/W 7.19 (0.90) vs 7.25 (1.00): < 1 %% of pod mass'),
                       alternative='matching-beta vane on a pod: extra reflective area ~2.6x the wing (~1.3 % of pod mass at 5 g/m2) makes it co-orbit a sail; '
                                   'rejected for the baseline (huge glinting mirror, shades neighbours), kept as an option for dedicated sail gateways')
print('0.2 Tbps range %.0f km; contact window %.1f h at %.1f m/s' % (L_max, contact, dv_track))
dump(OUT, 'cluster.json')
