"""people.glb from MPFB2 (MakeHuman Plugin For Blender, GPL code; MakeHuman targets / assets CC0 or CC-BY, see models/CREDITS.md).
Headless bpy 5.2: creates parametric MakeHuman bodies with the MPFB API, fits eyes / brows / lashes / hair / clothes from the MakeHuman asset packs, adds our own tartan kilts and
Highland garments, converts to a straight-arm rest pose, re-authors the shared animation clips (names from assets_people.clip_defs) on the MPFB `game_engine` skeleton and exports glTF.

Run:  HOME=<scratch>/mpfb/home python tools/assets_people_mpfb.py [--lod] [--out DIR] [id ...]
The MPFB extension + asset packs live OUTSIDE the repo (MPFB_DATA / HOME below).  This file contains only our own code."""
import bpy, sys, os, math, json, random, zlib
import addon_utils
from mathutils import Vector, Matrix, Quaternion
sys.path.insert(0, os.path.dirname(__file__))

SCRATCH = os.environ.get('MPFB_SCRATCH') or '/tmp/claude-0/-home-user/52020da6-bb97-5dd3-88b8-ef2e78784739/scratchpad/mpfb'   # textures, --blend output
DATA = os.environ.get('MPFB_DATA') or os.path.join(SCRATCH, 'home/.config/blender/5.2/extensions/.user/user_default/mpfb/data')
HERE = os.path.dirname(os.path.abspath(__file__))
OUTDIR = os.path.join(os.path.dirname(HERE), 'models')
LOD = '--lod' in sys.argv
if '--out' in sys.argv: OUTDIR = sys.argv[sys.argv.index('--out') + 1]
ARGS = [a for i, a in enumerate(sys.argv[1:], 1) if not a.startswith('--') and sys.argv[i - 1] != '--out']

def P(*a): return os.path.join(DATA, *a)

def mpfb_setup():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    addon_utils.modules_refresh()
    addon_utils.enable('bl_ext.user_default.mpfb', default_set=True, persistent=True)

# ------------------------------------------------------------------ people (same ids / kinds as the previous procedural set so the sim's outfit mix keeps working)
# macro: gender 0 female .. 1 male; age (0.1875 = 11 y, 0.5 = 25 y, 1 = 90 y); race weights; skin = MakeHuman skin folder; H = target standing height (m, <= 1.80)
PEOPLE = [
    dict(id='man_commuter', kind='man', outfit='trousers', H=1.78, gender=1, age=0.55, weight=0.5, muscle=0.5, race=(0.05, 0.9, 0.05), skin='middleage_caucasian_male', eye='brown', brows='eyebrow004', lashes=None, hair='short02', hair_col='#17120e',
         clothes=['elvs_male_shirt_tie_tucked1', 'elvs_male_trouser', 'mindfront_shoes_oxford_male']),
    dict(id='man_hoodie', kind='man', outfit='trousers', H=1.74, gender=1, age=0.40, weight=0.45, muscle=0.45, race=(0.1, 0.5, 0.4), skin='young_caucasian_male2', eye='brown', brows='eyebrow002', lashes=None, hair='short03', hair_col='#3a281c',
         clothes=['elvs_hooded_sweat_jacket1', 'punkduck_male_classic_jeans', 'culturalibre_sneakers']),
    dict(id='man_longcoat', kind='man', outfit='trousers', H=1.79, gender=1, age=0.50, weight=0.5, muscle=0.5, race=(0.0, 1.0, 0.0), skin='middleage_caucasian_male', eye='bluegreen', brows='eyebrow006', lashes=None, hair='short01', hair_col='#8c8c8c',
         clothes=['male_elegantsuit01', 'mindfront_shoes_monk_strap_male']),
    dict(id='man_elder', kind='elder', outfit='trousers', H=1.68, gender=1, age=0.88, weight=0.55, muscle=0.35, race=(0.0, 1.0, 0.0), skin='old_caucasian_male', eye='grey', brows='eyebrow008', lashes=None, hair='short04', hair_col='#d0d0d0', hair_lift=True,
         clothes=['mindfront_knitted_sweater_01', 'mindfront_male_trousers_1', 'mindfront_shoes_oxford_male']),
    dict(id='man_puffer', kind='man', outfit='trousers', H=1.76, gender=1, age=0.42, weight=0.5, muscle=0.55, race=(0.05, 0.05, 0.9), skin='young_african_male', eye='brown', brows='eyebrow003', lashes=None, hair='short02', hair_col='#17120e',
         clothes=['male_casualsuit04', 'culturalibre_sneakers']),
    dict(id='man_beard', kind='man', outfit='trousers', H=1.75, gender=1, age=0.52, weight=0.6, muscle=0.55, race=(0.1, 0.3, 0.6), skin='middleage_african_male', eye='brown', brows='eyebrow005', lashes=None, hair='short03', hair_col='#241812',
         clothes=['mindfront_knitted_sweater_02', 'punkduck_male_classic_jeans', 'toigo_ankle_boots_male']),
    dict(id='staff_hivis', kind='staff', outfit='trousers', H=1.78, gender=1, age=0.45, weight=0.5, muscle=0.5, race=(0.0, 1.0, 0.0), skin='young_caucasian_male', eye='blue', brows='eyebrow002', lashes=None, hair='short01', hair_col='#3a281c',
         clothes=['male_worksuit01', 'toigo_ankle_boots_male'], tint=(1.0, 0.95, 0.12)),
    dict(id='man_student', kind='man', outfit='trousers', H=1.80, gender=1, age=0.34, weight=0.4, muscle=0.4, race=(0.6, 0.3, 0.1), skin='young_asian_male', eye='brown', brows='eyebrow001', lashes=None, hair='short02', hair_col='#241812',
         clothes=['elvs_male_boho_top1', 'punkduck_male_classic_jeans', 'elvs_zombie_killer_sneakers']),
    dict(id='woman_coat', kind='woman', outfit='skirt_pencil', H=1.67, gender=0, age=0.52, weight=0.45, muscle=0.4, race=(0.0, 1.0, 0.0), skin='middleage_caucasian_female', eye='brown', brows='eyebrow007', lashes='eyelashes02', hair='long01', hair_col='#6d4a2c',
         clothes=['female_elegantsuit01', 'toigo_ankle_boots_female']),
    dict(id='woman_puffer', kind='woman', outfit='trousers', H=1.62, gender=0, age=0.40, weight=0.45, muscle=0.4, race=(0.1, 0.85, 0.05), skin='young_caucasian_female', eye='blue', brows='eyebrow009', lashes='eyelashes01', hair='ponytail01', hair_col='#d8b86c',
         clothes=['female_casualsuit02', 'culturalibre_sneakers']),
    dict(id='woman_dress', kind='woman', outfit='dress', H=1.69, gender=0, age=0.50, weight=0.5, muscle=0.4, race=(0.05, 0.05, 0.9), skin='young_african_female', eye='brown', brows='eyebrow010', lashes='eyelashes03', hair='bob01', hair_col='#17120e',
         clothes=['toigo_shift_dress', 'mindfront_shoes_monk_strap_female']),
    dict(id='woman_elder', kind='elder', outfit='trousers', H=1.56, gender=0, age=0.90, weight=0.55, muscle=0.3, race=(0.0, 1.0, 0.0), skin='old_caucasian_female', eye='lightblue', brows='eyebrow011', lashes='eyelashes04', hair='bob02', hair_col='#d0d0d0',
         clothes=['janexx_old_female_sweater', 'mindfront_female_trousers_1', 'mindfront_shoes_monk_strap_female']),
    dict(id='woman_student', kind='woman', outfit='trousers', H=1.65, gender=0, age=0.33, weight=0.4, muscle=0.35, race=(0.3, 0.6, 0.1), skin='young_asian_female', eye='brown', brows='eyebrow001', lashes='eyelashes01', hair='long01', hair_col='#241812',
         clothes=['elvs_hooded_sweat_jacket1', 'punkduck_female_tight_jeans', 'punkduck_comfortable_sneakers']),
    dict(id='woman_scarf', kind='woman', outfit='trousers', H=1.63, gender=0, age=0.47, weight=0.5, muscle=0.35, race=(0.0, 0.1, 0.9), skin='middleage_african_female', eye='brown', brows='eyebrow012', lashes='eyelashes02', hair='afro01', hair_col='#17120e',
         clothes=['female_casualsuit01', 'toigo_ankle_boots_female']),
    dict(id='woman_bob', kind='woman', outfit='leggings', H=1.60, gender=0, age=0.44, weight=0.55, muscle=0.35, race=(0.0, 1.0, 0.0), skin='young_caucasian_female', eye='bluegreen', brows='eyebrow006', lashes='eyelashes03', hair='bob01', hair_col='#7a2f1a',
         clothes=['mindfront_knitted_sweater_01', 'elvs_disco_pants_skinny', 'toigo_ankle_boots_female']),
    dict(id='teen_boy', kind='teen', outfit='trousers', H=1.68, gender=1, age=0.26, weight=0.4, muscle=0.4, race=(0.1, 0.8, 0.1), skin='young_caucasian_male2', eye='blue', brows='eyebrow002', lashes=None, hair='short03', hair_col='#a87a43',
         clothes=['toigo_basic_tucked_t-shirt', 'mindfront_male_trousers_2', 'culturalibre_sneakers']),
    dict(id='teen_girl', kind='teen', outfit='trousers', H=1.58, gender=0, age=0.25, weight=0.4, muscle=0.35, race=(0.2, 0.7, 0.1), skin='young_caucasian_female2', eye='brown', brows='eyebrow007', lashes='eyelashes01', hair='ponytail01', hair_col='#6d4a2c',
         clothes=['elvs_hooded_sweat_jacket1', 'punkduck_female_tight_jeans', 'punkduck_comfortable_sneakers']),
    dict(id='boy', kind='boy', outfit='trousers', H=1.38, gender=1, age=0.14, weight=0.45, muscle=0.4, race=(0.1, 0.8, 0.1), skin='young_caucasian_male', eye='brown', brows='eyebrow002', lashes=None, hair='short02', hair_col='#6d4a2c',
         clothes=['male_casualsuit03', 'culturalibre_sneakers']),
    dict(id='boy_small', kind='boy', outfit='trousers', H=1.20, gender=1, age=0.09, weight=0.5, muscle=0.4, race=(0.05, 0.05, 0.9), skin='young_african_male', eye='brown', brows='eyebrow003', lashes=None, hair='afro01', hair_col='#17120e',
         clothes=['mindfront_knitted_sweater_02', 'punkduck_male_classic_jeans', 'culturalibre_sneakers']),
    dict(id='girl', kind='girl', outfit='trousers', H=1.30, gender=0, age=0.12, weight=0.45, muscle=0.35, race=(0.1, 0.8, 0.1), skin='young_caucasian_female', eye='brown', brows='eyebrow009', lashes='eyelashes01', hair='ponytail01', hair_col='#7a2f1a',
         clothes=['female_casualsuit02', 'culturalibre_sneakers']),
    dict(id='girl_small', kind='girl', outfit='dress', H=1.12, gender=0, age=0.07, weight=0.5, muscle=0.35, race=(0.0, 1.0, 0.0), skin='young_caucasian_female', eye='lightblue', brows='eyebrow009', lashes='eyelashes01', hair='bob01', hair_col='#d8b86c',
         clothes=['toigo_shift_dress', 'mindfront_shoes_monk_strap_female']),
    # --- Highland dress / skirts (our own tartan garments are fitted over the MPFB body)
    dict(id='man_highland', kind='man', outfit='highland', H=1.77, gender=1, age=0.50, weight=0.5, muscle=0.5, race=(0.0, 1.0, 0.0), skin='young_caucasian_male', eye='bluegreen', brows='eyebrow004', lashes=None, hair='short01', hair_col='#6d4a2c',
         clothes=['toigo_male_suit_tie_and_jacket'], cut=('suit', 0.15), kilt=dict(kind='kilt', tart=0, sporran=True, belt=True, hose=('#ddd6bf', '#b5161e')), shoes='mindfront_shoes_oxford_male', hat=None, nolegs=True),
    dict(id='man_kilt_casual', kind='man', outfit='kilt', H=1.72, gender=1, age=0.45, weight=0.55, muscle=0.5, race=(0.0, 1.0, 0.0), skin='middleage_caucasian_male', eye='brown', brows='eyebrow005', lashes=None, hair='short03', hair_col='#3a281c',
         clothes=['mindfront_knitted_sweater_02'], cut=('sweater', 0.15), kilt=dict(kind='kilt', tart=3, sporran=True, belt=True, hose=('#2c2d30', '#2c2d30')), shoes='toigo_ankle_boots_male', nolegs=True),
    dict(id='man_trews', kind='man', outfit='highland_trews', H=1.75, gender=1, age=0.48, weight=0.5, muscle=0.5, race=(0.0, 1.0, 0.0), skin='young_caucasian_male2', eye='brown', brows='eyebrow002', lashes=None, hair='short02', hair_col='#a87a43',
         clothes=['elvs_male_shirt_tie_tucked1', 'elvs_male_trouser'], trews=2, shoes='mindfront_shoes_oxford_male', nolegs=True),
    dict(id='woman_sash', kind='woman', outfit='highland_dress', H=1.68, gender=0, age=0.46, weight=0.45, muscle=0.35, race=(0.0, 1.0, 0.0), skin='young_caucasian_female', eye='bluegreen', brows='eyebrow007', lashes='eyelashes02', hair='bob02', hair_col='#7a2f1a',
         clothes=['toigo_halter_dress_midi'], sash=1, shoes='mindfront_shoes_monk_strap_female'),
    dict(id='girl_school_kilt', kind='girl', outfit='school_kilt', H=1.34, gender=0, age=0.14, weight=0.45, muscle=0.35, race=(0.0, 1.0, 0.0), skin='young_caucasian_female', eye='lightblue', brows='eyebrow009', lashes='eyelashes01', hair='ponytail01', hair_col='#d8b86c',
         clothes=['mindfront_knitted_sweater_01'], cut=('sweater', 0.12), kilt=dict(kind='pleated', tart=2, hem=0.10, hose=('#d9d9d9', '#d9d9d9')), shoes='mindfront_shoes_monk_strap_female', nolegs=True),
    dict(id='boy_kilt', kind='boy', outfit='kilt', H=1.28, gender=1, age=0.12, weight=0.45, muscle=0.4, race=(0.1, 0.8, 0.1), skin='young_caucasian_male', eye='brown', brows='eyebrow002', lashes=None, hair='short03', hair_col='#6d4a2c',
         clothes=['mindfront_knitted_sweater_02'], cut=('sweater', 0.12), kilt=dict(kind='kilt', tart=0, sporran=True, belt=False, hose=('#e0e0e0', '#b5161e')), shoes='mindfront_shoes_oxford_male', nolegs=True),
    dict(id='woman_mini', kind='woman', outfit='skirt_short', H=1.64, gender=0, age=0.40, weight=0.45, muscle=0.35, race=(0.0, 0.1, 0.9), skin='young_african_female', eye='brown', brows='eyebrow010', lashes='eyelashes03', hair='long01', hair_col='#17120e',
         clothes=['toigo_camisole_top', 'mtknife_pleated_mini_skirt', 'toigo_ankle_boots_female']),
    dict(id='woman_midi', kind='woman', outfit='skirt_midi', H=1.66, gender=0, age=0.48, weight=0.5, muscle=0.35, race=(0.5, 0.4, 0.1), skin='middleage_asian_female', eye='brown', brows='eyebrow011', lashes='eyelashes02', hair='bob01', hair_col='#3a281c',
         clothes=['toigo_fisherman_sweater', 'elvs_pencil_skirt', 'toigo_ankle_boots_female']),
    dict(id='teen_skirt', kind='teen', outfit='skirt_pleated', H=1.60, gender=0, age=0.27, weight=0.4, muscle=0.35, race=(0.1, 0.8, 0.1), skin='young_caucasian_female2', eye='brown', brows='eyebrow007', lashes='eyelashes01', hair='long01', hair_col='#6d4a2c',
         clothes=['toigo_camisole_top', 'mtknife_pleated_mini_skirt', 'mindfront_shoes_monk_strap_female']),
    # --- batch 1 (2026-11-07): teens and young adults. face=True: each gets seeded face targets of their own (face_targets). Ids must not
    #     contain boy/girl/kid/child unless they start with teen_ (people.js reads those as children). elvs_disco_pants_skinny rides high and
    #     comes through a T-shirt's hem: only under jumpers, hoodies and cardigans. Tried and dropped (renders, 2026-11-07): the o4saken hairs
    #     (draw as black shards), joepal_crude_t-shirt_female and namuhekam_male_polo_shirt (the jeans' waistband comes through), toigo_fisherman_sweater over
    #     elvs_disco_pants_skinny (the same), and
    #     mindfront_cardigan_long_open_front (a lab coat, with the top under it showing through). Batch 2 dropped: toigo_halter_dress_knee_length
    #     (skin through the skirt), fedora_cocked (draws as grey shards), elvs_male_trouser_short_1 (most of the seat missing). Batch 3 dropped (people_holes 30-96 cm2/view, skin at
    #     the edges): punkduck_retro_top, punkduck_retro_polka_dot_skirt, toigo_turtleneck_halter_top, mindfront_tank_top_01, punkduck_v_neck_top (skin at the neck),
    #     toigo_tiered_mini_skirt (165 under a tee), punkduck_female_short_jeans and Lycra shorts under toigo_keyhole_tank_top (31 LOD),
    #     the tube top + pleated mini of teen_tube on an adult body (55: skin through the skirt's waistband), and
    #     toigo_flats with Lycra (rest-pose skin count ~3400 whatever the top, hair or body; 559 in ankle boots; skin showed through the tee and sleeves too).
    dict(id='teen_skater', kind='teen', outfit='trousers', H=1.72, gender=1, age=0.29, weight=0.4, muscle=0.45, race=(0.05, 0.1, 0.85), skin='young_african_male', eye='brown', brows='eyebrow003', lashes=None, hair='afro01', hair_col='#17120e', face=True,
         clothes=['toigo_basic_tucked_t-shirt', 'elvs_jeans_straight_leg', 'punkduck_tennis_shoes']),
    dict(id='teen_runner', kind='teen', outfit='trousers', H=1.62, gender=1, age=0.25, weight=0.35, muscle=0.4, race=(0.0, 1.0, 0.0), skin='young_caucasian_male', eye='blue', brows='eyebrow002', lashes=None, hair='culturalibre_hair_05', hair_col='#8a3b1a', face=True,
         clothes=['elvs_crude_t-shirt_male', 'punkduck_male_classic_jeans', 'punkduck_running_shoes_01']),
    dict(id='teen_tube', kind='teen', outfit='skirt_short', H=1.64, gender=0, age=0.32, weight=0.4, muscle=0.35, race=(0.05, 0.05, 0.9), skin='young_african_female', eye='brown', brows='eyebrow010', lashes='eyelashes01', hair='toigo_blunt_bob_with_bangs', hair_col='#17120e', face=True,
         clothes=['punkduck_tube_top', 'mtknife_pleated_mini_skirt', 'toigo_flats']),
    dict(id='teen_tee', kind='teen', outfit='trousers', H=1.57, gender=0, age=0.27, weight=0.4, muscle=0.35, race=(0.85, 0.1, 0.05), skin='young_asian_female', eye='brown', brows='eyebrow001', lashes='eyelashes01', hair='toigo_inverted_bob_with_bangs', hair_col='#17120e', face=True,
         clothes=['toigo_basic_tucked_t-shirt', 'punkduck_female_tight_jeans', 'punkduck_tennis_shoes']),
    dict(id='teen_hippy', kind='teen', outfit='leggings', H=1.63, gender=0, age=0.29, weight=0.4, muscle=0.35, race=(0.0, 1.0, 0.0), skin='young_caucasian_female2', eye='bluegreen', brows='eyebrow007', lashes='eyelashes02', hair='elvs_lady_hippy_hair', hair_col='#c9a25e', face=True,
         clothes=['elvs_hooded_sweat_jacket1', 'elvs_disco_pants_skinny', 'punkduck_comfortable_sneakers']),
    dict(id='teen_hood', kind='teen', outfit='trousers', H=1.75, gender=1, age=0.34, weight=0.45, muscle=0.45, race=(0.9, 0.1, 0.0), skin='young_asian_male', eye='brown', brows='eyebrow001', lashes=None, hair='short04', hair_col='#17120e', face=True,
         clothes=['elvs_hooded_sweat_jacket1', 'elvs_jeans_straight_leg', 'culturalibre_sneakers']),
    dict(id='ya_tee_jeans', kind='man', outfit='trousers', H=1.79, gender=1, age=0.43, weight=0.45, muscle=0.55, race=(0.0, 0.15, 0.85), skin='young_african_male', eye='brown', brows='eyebrow005', lashes=None, hair='short01', hair_col='#17120e', face=True,
         clothes=['toigo_basic_tucked_t-shirt', 'elvs_jeans_straight_leg', 'punkduck_running_shoes_01']),
    dict(id='ya_shorts', kind='woman', outfit='shorts', H=1.66, gender=0, age=0.41, weight=0.45, muscle=0.4, race=(0.0, 1.0, 0.0), skin='young_caucasian_female', eye='blue', brows='eyebrow009', lashes='eyelashes03', hair='elvs_daisy_hair', hair_col='#7a2f1a', face=True,
         clothes=['toigo_basic_tucked_t-shirt', 'punkduck_female_short_jeans', 'toigo_ballet_flats']),
    dict(id='ya_fedora', kind='man', outfit='trousers', H=1.77, gender=1, age=0.51, weight=0.5, muscle=0.5, race=(0.1, 0.85, 0.05), skin='young_caucasian_male2', eye='brown', brows='eyebrow004', lashes=None, hair='short04', hair_col='#3a281c', face=True,
         clothes=['elvs_crude_t-shirt_male', 'punkduck_male_classic_jeans', 'toigo_ankle_boots_male', 'fedora01']),
    dict(id='ya_tube_heels', kind='woman', outfit='trousers', H=1.68, gender=0, age=0.48, weight=0.4, muscle=0.35, race=(0.85, 0.1, 0.05), skin='young_asian_female', eye='brown', brows='eyebrow011', lashes='eyelashes02', hair='elvs_katherine_hair', hair_col='#17120e', face=True,
         clothes=['punkduck_tube_top', 'punkduck_female_tight_jeans', 'toigo_stiletto_booties']),
    dict(id='ya_knit', kind='woman', outfit='leggings', H=1.65, gender=0, age=0.52, weight=0.5, muscle=0.35, race=(0.05, 0.05, 0.9), skin='young_african_female', eye='brown', brows='eyebrow012', lashes='eyelashes03', hair='elvs_wavy_bob', hair_col='#241812', face=True,
         clothes=['mindfront_knitted_sweater_01', 'elvs_disco_pants_skinny', 'toigo_flats']),
    dict(id='ya_bootcut', kind='woman', outfit='trousers', H=1.70, gender=0, age=0.46, weight=0.45, muscle=0.4, race=(0.2, 0.75, 0.05), skin='young_caucasian_female2', eye='brown', brows='eyebrow006', lashes='eyelashes01', hair='elvs_short_daisy_hair', hair_col='#4a3020', face=True,
         clothes=['toigo_basic_tucked_t-shirt', 'elvs_jeans_bootcut', 'punkduck_tennis_shoes']),
    dict(id='ya_spiky', kind='man', outfit='trousers', H=1.80, gender=1, age=0.39, weight=0.35, muscle=0.4, race=(0.0, 1.0, 0.0), skin='young_caucasian_male', eye='bluegreen', brows='eyebrow002', lashes=None, hair='elvs_maxwell_hair', hair_col='#2a1d14', face=True,
         clothes=['elvs_crude_t-shirt_male', 'elvs_jeans_straight_leg', 'punkduck_tennis_shoes']),
    dict(id='ya_winter', kind='woman', outfit='trousers', H=1.63, gender=0, age=0.50, weight=0.45, muscle=0.35, race=(0.0, 1.0, 0.0), skin='young_caucasian_female', eye='lightblue', brows='eyebrow009', lashes='eyelashes02', hair='toigo_curled_under_bob', hair_col='#a8452a', face=True,
         clothes=['punkduck_winter_coat', 'punkduck_female_tight_jeans', 'toigo_ballet_flats']),
    # --- batch 2 (2026-11-07): adults, and the garments made here (add_garments): lycra=(leggings|shorts, colour) paints the body's own skin;
    #     baggy=f widens the jeans' legs by f at the hem; tuck=(bottom, top) pulls the bottom's waistband in under the top; hat=(cap|tophat|beret, colour). rare=f: the crowd takes this person only f of the times they come up.
    dict(id='adult_cap_baggy', kind='man', outfit='trousers', H=1.77, gender=1, age=0.52, weight=0.45, muscle=0.5, race=(0.05, 0.2, 0.75), skin='young_african_male', eye='brown', brows='eyebrow003', lashes=None, hair='short02', hair_col='#17120e', face=True,
         clothes=['elvs_male_logo_tshirt1', 'elvs_jeans_straight_leg', 'punkduck_running_shoes_01'], baggy=0.55, tuck=('jeans', 'tshirt'), hat=('cap', '#1d2a4a')),
    dict(id='adult_runner', kind='woman', outfit='leggings', H=1.67, gender=0, age=0.55, weight=0.4, muscle=0.45, race=(0.0, 1.0, 0.0), skin='middleage_caucasian_female', eye='blue', brows='eyebrow009', lashes='eyelashes02', hair='ponytail01', hair_col='#b5854b', face=True,
         clothes=['punkduck_sleeveless_crop_top', 'punkduck_running_shoes_01'], lycra=('leggings', '#1a1a1e')),
    dict(id='adult_cyclist', kind='man', outfit='shorts', H=1.79, gender=1, age=0.60, weight=0.4, muscle=0.55, race=(0.0, 1.0, 0.0), skin='middleage_caucasian_male', eye='bluegreen', brows='eyebrow006', lashes=None, hair='short01', hair_col='#5a4a3a', face=True,
         clothes=['toigo_basic_tucked_t-shirt', 'punkduck_cycling_shoes'], lycra=('shorts', '#121214')),
    dict(id='adult_tophat', kind='man', outfit='trousers', H=1.70, gender=1, age=0.66, weight=0.5, muscle=0.5, race=(0.0, 1.0, 0.0), skin='young_caucasian_male2', eye='grey', brows='eyebrow004', lashes=None, hair='short04', hair_col='#8c8c8c', face=True,
         clothes=['toigo_suit_with_dinner_jacket', 'mindfront_shoes_oxford_male'], hat=('tophat', '#141414'), rare=0.12),
    dict(id='adult_baggy_knit', kind='woman', outfit='trousers', H=1.64, gender=0, age=0.50, weight=0.4, muscle=0.35, race=(0.9, 0.1, 0.0), skin='young_asian_female', eye='brown', brows='eyebrow001', lashes='eyelashes01', hair='toigo_inverted_bob', hair_col='#3a281c', face=True,
         clothes=['mindfront_lusekofta', 'elvs_jeans_straight_leg', 'punkduck_comfortable_sneakers'], baggy=0.5, tuck=('jeans', 'lusekofta')),
    dict(id='adult_leggings_knit', kind='woman', outfit='leggings', H=1.62, gender=0, age=0.68, weight=0.55, muscle=0.35, race=(0.9, 0.1, 0.0), skin='middleage_asian_female', eye='brown', brows='eyebrow011', lashes='eyelashes02', hair='toigo_curled_under_bob_with_bangs', hair_col='#2a1d14', face=True,
         clothes=['mindfront_knitted_sweater_02', 'toigo_ankle_boots_female'], lycra=('leggings', '#3b2140')),
    dict(id='adult_cap_shorts', kind='woman', outfit='shorts', H=1.66, gender=0, age=0.53, weight=0.45, muscle=0.4, race=(0.1, 0.85, 0.05), skin='young_caucasian_female2', eye='bluegreen', brows='eyebrow007', lashes='eyelashes01', hair='toigo_inverted_bob', hair_col='#b5854b', face=True,
         clothes=['toigo_basic_tucked_t-shirt', 'punkduck_female_short_jeans', 'punkduck_tennis_shoes'], hat=('cap', '#2e5e3a')),
    dict(id='adult_oxford_shirt', kind='man', outfit='trousers', H=1.74, gender=1, age=0.62, weight=0.55, muscle=0.45, race=(0.9, 0.1, 0.0), skin='middleage_asian_male', eye='brown', brows='eyebrow001', lashes=None, hair='short03', hair_col='#241812', face=True,
         clothes=['elvs_male_shirt_untucked_bd1', 'toigo_wool_pants', 'mindfront_shoes_oxford_male']),
    dict(id='adult_vneck', kind='woman', outfit='trousers', H=1.68, gender=0, age=0.58, weight=0.5, muscle=0.4, race=(0.0, 1.0, 0.0), skin='middleage_caucasian_female', eye='lightblue', brows='eyebrow006', lashes='eyelashes03', hair='elvs_50s_updo', hair_col='#c9a25e', face=True,
         clothes=['punkduck_v_neck_top', 'punkduck_female_tight_jeans', 'mindfront_shoes_oxford_female']),
    dict(id='adult_camo_cap', kind='man', outfit='trousers', H=1.78, gender=1, age=0.50, weight=0.5, muscle=0.55, race=(0.0, 1.0, 0.0), skin='young_caucasian_male', eye='blue', brows='eyebrow002', lashes=None, hair='short02', hair_col='#a87a43', face=True,
         clothes=['drednicolson_short-tail_camo_tee', 'mindfront_male_trousers_2', 'culturalibre_sneakers'], hat=('cap', '#111111')),
    dict(id='adult_harem', kind='woman', outfit='trousers', H=1.65, gender=0, age=0.56, weight=0.45, muscle=0.35, race=(0.05, 0.05, 0.9), skin='young_african_female', eye='brown', brows='eyebrow012', lashes='eyelashes01', hair='elvs_island_princess_hair', hair_col='#17120e', face=True,
         clothes=['toigo_keyhole_tank_top', 'toigo_harem_pants', 'toigo_ballet_flats']),
    dict(id='adult_lusekofta', kind='man', outfit='trousers', H=1.79, gender=1, age=0.64, weight=0.55, muscle=0.5, race=(0.05, 0.1, 0.85), skin='middleage_african_male', eye='brown', brows='eyebrow005', lashes=None, hair='short01', hair_col='#241812', face=True,
         clothes=['mindfront_lusekofta', 'elvs_jeans_straight_leg', 'punkduck_winter_boots'], baggy=0.4, tuck=('jeans', 'lusekofta')),
    dict(id='adult_tie_suit', kind='man', outfit='trousers', H=1.72, gender=1, age=0.72, weight=0.6, muscle=0.4, race=(0.0, 1.0, 0.0), skin='middleage_caucasian_male', eye='blue', brows='eyebrow008', lashes=None, hair='short03', hair_col='#9a9a9a', face=True,
         clothes=['toigo_male_suit_tie_and_jacket', 'mindfront_shoes_monk_strap_male']),
    dict(id='adult_suit_bun', kind='woman', outfit='trousers', H=1.66, gender=0, age=0.60, weight=0.45, muscle=0.35, race=(0.85, 0.1, 0.05), skin='middleage_asian_female', eye='brown', brows='eyebrow001', lashes='eyelashes02', hair='elvs_reverse_french_braid_bun', hair_col='#17120e', face=True,
         clothes=['toigo_female_suit_2', 'mindfront_shoes_oxford_female']),
    # --- batch 3 (2026-11-07): two children (ids boy_* / girl_*: people.js reads those as children), four elders (elder_*), one member of staff (staff_*),
    #     seven adults; heels, a coat, a beret (hat=('beret', colour)).
    dict(id='boy_cap', kind='boy', outfit='trousers', H=1.42, gender=1, age=0.16, weight=0.45, muscle=0.4, race=(0.85, 0.1, 0.05), skin='young_asian_male', eye='brown', brows='eyebrow001', lashes=None, hair='short03', hair_col='#17120e', face=True,
         clothes=['male_casualsuit01', 'culturalibre_sneakers'], hat=('cap', '#c8102e')),
    dict(id='girl_leggings', kind='girl', outfit='leggings', H=1.32, gender=0, age=0.13, weight=0.45, muscle=0.35, race=(0.05, 0.05, 0.9), skin='young_african_female', eye='brown', brows='eyebrow010', lashes='eyelashes01', hair='toigo_curled_under_bob', hair_col='#17120e', face=True,
         clothes=['mindfront_knitted_sweater_01', 'toigo_ballet_flats'], lycra=('leggings', '#2b4a8a')),
    dict(id='elder_man_cap', kind='elder', outfit='trousers', H=1.70, gender=1, age=0.86, weight=0.55, muscle=0.35, race=(0.05, 0.1, 0.85), skin='old_african_male', eye='brown', brows='eyebrow005', lashes=None, hair='short04', hair_col='#bfbfbf', face=True, hair_lift=True,
         clothes=['male_casualsuit06', 'mindfront_shoes_oxford_male'], hat=('cap', '#5a4a3a')),
    dict(id='elder_woman_coat', kind='elder', outfit='trousers', H=1.55, gender=0, age=0.88, weight=0.5, muscle=0.3, race=(0.9, 0.1, 0.0), skin='old_asian_female', eye='brown', brows='eyebrow001', lashes='eyelashes04', hair='bob02', hair_col='#cfcfcf', face=True,
         clothes=['punkduck_winter_coat', 'mindfront_female_trousers_1', 'toigo_ankle_boots_female']),
    dict(id='elder_man_suit', kind='elder', outfit='trousers', H=1.70, gender=1, age=0.92, weight=0.5, muscle=0.3, race=(0.0, 1.0, 0.0), skin='old_caucasian_male', eye='blue', brows='eyebrow008', lashes=None, hair='short04', hair_col='#e0e0e0', face=True, hair_lift=True,
         clothes=['toigo_male_suit_3', 'mindfront_shoes_monk_strap_male']),
    dict(id='elder_woman_dress', kind='elder', outfit='dress', H=1.58, gender=0, age=0.86, weight=0.6, muscle=0.3, race=(0.0, 0.1, 0.9), skin='old_african_female', eye='brown', brows='eyebrow012', lashes='eyelashes04', hair='bob02', hair_col='#cfcfcf', face=True,
         clothes=['elvs_simple_60s_dress', 'mindfront_shoes_monk_strap_female']),
    dict(id='staff_woman', kind='staff', outfit='trousers', H=1.66, gender=0, age=0.48, weight=0.5, muscle=0.4, race=(0.0, 1.0, 0.0), skin='middleage_caucasian_female', eye='blue', brows='eyebrow007', lashes='eyelashes02', hair='ponytail01', hair_col='#6d4a2c', face=True,
         clothes=['male_worksuit01', 'toigo_ankle_boots_female'], tint=(1.0, 0.95, 0.12)),
    dict(id='adult_heel_boots', kind='woman', outfit='trousers', H=1.69, gender=0, age=0.54, weight=0.4, muscle=0.35, race=(0.0, 1.0, 0.0), skin='young_caucasian_female', eye='bluegreen', brows='eyebrow009', lashes='eyelashes03', hair='elvs_ashley_may_hair', hair_col='#d8b86c', face=True,
         clothes=['elvs_hooded_sweat_jacket1', 'punkduck_female_tight_jeans', 'elvs_knee_high_heel_boots1']),
    dict(id='adult_camisole', kind='woman', outfit='trousers', H=1.64, gender=0, age=0.58, weight=0.5, muscle=0.35, race=(0.05, 0.05, 0.9), skin='middleage_african_female', eye='brown', brows='eyebrow010', lashes='eyelashes02', hair='elvs_50s_updo', hair_col='#17120e', face=True,
         clothes=['toigo_camisole_top', 'punkduck_female_tight_jeans', 'toigo_stiletto_booties']),
    dict(id='adult_beret', kind='woman', outfit='skirt_pencil', H=1.67, gender=0, age=0.62, weight=0.45, muscle=0.35, race=(0.0, 1.0, 0.0), skin='middleage_caucasian_female', eye='lightblue', brows='eyebrow006', lashes='eyelashes03', hair='toigo_blunt_bob', hair_col='#a8452a', face=True,
         clothes=['toigo_female_suit', 'punkduck_riding_boots'], hat=('beret', '#7a1f2b')),
    dict(id='adult_casual5', kind='man', outfit='trousers', H=1.73, gender=1, age=0.58, weight=0.55, muscle=0.5, race=(0.9, 0.1, 0.0), skin='middleage_asian_male', eye='brown', brows='eyebrow001', lashes=None, hair='short04', hair_col='#241812', face=True,
         clothes=['male_casualsuit05', 'culturalibre_sneakers']),
    dict(id='adult_casual2', kind='man', outfit='trousers', H=1.78, gender=1, age=0.47, weight=0.5, muscle=0.55, race=(0.05, 0.05, 0.9), skin='young_african_male', eye='brown', brows='eyebrow003', lashes=None, hair='short03', hair_col='#17120e', face=True,
         clothes=['male_casualsuit02', 'toigo_ankle_boots_male']),
    dict(id='adult_fisherman_leggings', kind='woman', outfit='leggings', H=1.63, gender=0, age=0.50, weight=0.45, muscle=0.4, race=(0.2, 0.75, 0.05), skin='young_caucasian_female2', eye='brown', brows='eyebrow007', lashes='eyelashes01', hair='elvs_island_princess_hair', hair_col='#4a3020', face=True,
         clothes=['toigo_fisherman_sweater', 'toigo_ankle_boots_female'], lycra=('leggings', '#5a2a6a')),
    dict(id='adult_sport_cap', kind='woman', outfit='trousers', H=1.70, gender=0, age=0.52, weight=0.4, muscle=0.45, race=(0.05, 0.1, 0.85), skin='young_african_female', eye='brown', brows='eyebrow012', lashes='eyelashes02', hair='toigo_inverted_bob', hair_col='#17120e', face=True,
         clothes=['female_sportsuit01', 'punkduck_running_shoes_01'], hat=('cap', '#e8e8e8')),
]

# ------------------------------------------------------------------ helpers: mhmat / images / materials
def parse_mhmat(path):
    d = {}
    if not path or not os.path.exists(path): return d
    for ln in open(path, errors='ignore'):
        ln = ln.strip()
        if not ln or ln.startswith('#') or ln.startswith('//'): continue
        k, _, v = ln.partition(' ')
        d.setdefault(k, v.strip())
    d['_dir'] = os.path.dirname(path)
    return d

def mhclo_material(mhclo_path):
    for ln in open(mhclo_path, errors='ignore'):
        if ln.startswith('material '):
            return os.path.normpath(os.path.join(os.path.dirname(mhclo_path), ln[9:].strip()))
    return None

IMG_CACHE = {}
TEXDIR = os.path.join(SCRATCH, 'out', 'tex_lod' if LOD else 'tex')
os.makedirs(TEXDIR, exist_ok=True)
def load_image(path, maxpx, alpha=False, quality=80, srgb=True, lift=False):
    """resized copy (PIL) -> bpy image; opaque maps become JPEG, alpha maps PNG; cached so shared textures are embedded once"""
    from PIL import Image
    key = (path, maxpx, alpha, lift)
    if key in IMG_CACHE: return IMG_CACHE[key]
    if not os.path.exists(path): return None
    try:
        im = Image.open(path); im.load()
    except Exception as e:
        # A few community textures (elvs_katherine_hair/erbehairtex1.png) carry a metadata chunk (iCCP) with a bad checksum; the pixels are intact.
        # PIL refuses the file outright. Its lenient mode skips checksum errors in optional chunks, but would also accept a cut-off file, so it is
        # only used on a PNG that ends in its IEND marker (the file is complete).
        from PIL import ImageFile
        with open(path, 'rb') as fh: fh.seek(-12, 2); tail = fh.read()
        if not tail[4:8] == b'IEND': raise
        print('image: %s (%s) - reading with optional-chunk checksums ignored' % (os.path.basename(path), e))
        ImageFile.LOAD_TRUNCATED_IMAGES = True
        try: im = Image.open(path); im.load()
        finally: ImageFile.LOAD_TRUNCATED_IMAGES = False
    if max(im.size) > maxpx:
        s = maxpx / max(im.size); im = im.resize((max(8, int(im.size[0] * s)), max(8, int(im.size[1] * s))), Image.LANCZOS)
    base = os.path.splitext(os.path.relpath(path, DATA).replace(os.sep, '_'))[0] + f'_{maxpx}' + ('_lift' if lift else '')
    if lift:
        # grey hair: the material tint multiplies the texture, and the short MakeHuman hairs are near black, so a grey tint stayed black (man_elder
        # had black hair at 88). Keep the strand shading but make it grey and light: luma over its own mean, to a mean of 0.8. The tint is done in
        # the image because glTF clamps a colour factor at 1.
        import numpy as _np
        rgba = _np.asarray(im.convert('RGBA')).astype(_np.float32); msk = rgba[..., 3] > 128
        lum = rgba[..., :3] @ _np.array([0.299, 0.587, 0.114], _np.float32)
        mean = max(1.0, float(lum[msk].mean()) if msk.any() else 128.0)
        g = _np.clip(lum / mean * 0.8 * 255, 0, 255)
        rgba[..., 0] = rgba[..., 1] = rgba[..., 2] = g
        im = Image.fromarray(rgba.astype(_np.uint8), 'RGBA')
    if alpha:
        out = os.path.join(TEXDIR, base + '.png'); im.convert('RGBA').quantize(colors=48, method=Image.FASTOCTREE).save(out, optimize=True)
    else:
        out = os.path.join(TEXDIR, base + '.jpg')
        if im.mode in ('RGBA', 'LA', 'P'):
            import numpy as _np
            rgba = _np.asarray(im.convert('RGBA')).astype(_np.float32); msk = rgba[..., 3] > 200
            if msk.any() and (~msk).mean() > 0.002:
                avg = rgba[..., :3][msk].mean(0); rgba[..., :3][~msk] = avg      # transparent texels (unused UV space) -> average cloth colour instead of black
            im = Image.fromarray(rgba[..., :3].astype(_np.uint8))
        im.convert('RGB').save(out, quality=quality)
    img = bpy.data.images.load(out); img.pack(); img.name = base
    if not srgb: img.colorspace_settings.name = 'Non-Color'
    IMG_CACHE[key] = img
    return img

MAT_CACHE = {}
def make_material(name, diffuse=None, normal=None, alpha=False, rough=0.6, tint=None, color=(0.8, 0.8, 0.8), spec=0.3, maxpx=1024, nmaxpx=512, metal=0.0, cull=False, lift=False):
    key = (name, diffuse, normal, alpha, rough, tint, color, maxpx, lift)
    if key in MAT_CACHE: return MAT_CACHE[key]
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; bs = nt.nodes['Principled BSDF']
    bs.inputs['Roughness'].default_value = rough; bs.inputs['Metallic'].default_value = metal
    for nm in ('Specular IOR Level', 'Specular'):
        if nm in bs.inputs: bs.inputs[nm].default_value = spec
    m.use_backface_culling = False
    img = load_image(diffuse, maxpx, alpha=alpha, lift=lift) if diffuse else None
    if img:
        t = nt.nodes.new('ShaderNodeTexImage'); t.image = img
        if tint:
            mx = nt.nodes.new('ShaderNodeMix'); mx.data_type = 'RGBA'; mx.blend_type = 'MULTIPLY'; mx.inputs[0].default_value = 1.0
            nt.links.new(t.outputs['Color'], mx.inputs[6]); mx.inputs[7].default_value = tint + (1.0,)
            nt.links.new(mx.outputs[2], bs.inputs['Base Color'])
        else:
            nt.links.new(t.outputs['Color'], bs.inputs['Base Color'])
        if alpha: nt.links.new(t.outputs['Alpha'], bs.inputs['Alpha'])
    else:
        bs.inputs['Base Color'].default_value = tuple(color) + (1.0,)
    if normal:
        nimg = load_image(normal, nmaxpx, alpha=False, srgb=False)
        if nimg:
            tn = nt.nodes.new('ShaderNodeTexImage'); tn.image = nimg
            nm_ = nt.nodes.new('ShaderNodeNormalMap'); nt.links.new(tn.outputs['Color'], nm_.inputs['Color']); nt.links.new(nm_.outputs['Normal'], bs.inputs['Normal'])
    MAT_CACHE[key] = m
    return m

def hex_rgb(h): return tuple(int(h[i:i + 2], 16) / 255.0 for i in (1, 3, 5))
def lin(c): return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

# ------------------------------------------------------------------ building a person
SEAT_TOP = 0.445; SEAT_HIP = 0.53
SKINMAT_CACHE = {}

def _services():
    from bl_ext.user_default.mpfb.services.humanservice import HumanService
    from bl_ext.user_default.mpfb.services.targetservice import TargetService
    return HumanService, TargetService

def macro_dict(spec):
    HumanService, TargetService = _services()
    md = TargetService.get_default_macro_info_dict()
    md.update(gender=float(spec['gender']), age=float(spec['age']), weight=float(spec['weight']), muscle=float(spec['muscle']), height=0.5, proportions=0.5)
    a, c, f = spec['race']
    md['race'] = dict(asian=a, caucasian=c, african=f)
    return md

FACE_REGIONS = dict(nose=0.5, mouth=0.45, chin=0.5, cheek=0.5, eyebrows=0.4, forehead=0.45, ears=0.5, eyes=0.35)   # region -> the largest weight used there

def face_targets(human, seed):
    """A face of its own: MakeHuman's face targets, a third of each region's paired controls pushed one way by up to the region's limit, seeded
    by the person's id (the same build gives the same face). Left and right get the same value: faces stay symmetric. Only people whose spec
    sets face=True get them, so the people built before this keep their faces exactly."""
    import random, zlib
    _, TargetService = _services()
    import bl_ext.user_default.mpfb as mpfb_pkg
    root = os.path.join(os.path.dirname(mpfb_pkg.__file__), 'data', 'targets')
    rng = random.Random(zlib.crc32(seed.encode())); n = 0
    for region, lim in FACE_REGIONS.items():
        groups = {}
        for f in sorted(os.listdir(os.path.join(root, region))):
            if not f.endswith('.target.gz'): continue
            name = f[:-len('.target.gz')]; side = name[:2] if name[:2] in ('l-', 'r-') else ''
            core = name[len(side):]; key, _, way = core.rpartition('-')
            groups.setdefault(key, {}).setdefault(way, []).append(os.path.join(root, region, f))
        for key in sorted(groups):
            if rng.random() >= 0.33: continue
            ways = sorted(groups[key]); way = ways[rng.randrange(len(ways))]; w = round(rng.uniform(0.1, lim), 3)
            for path in groups[key][way]: TargetService.load_target(human, path, weight=w); n += 1
    print('face: %s %d targets' % (seed, n))

def body_height(h):
    dg = bpy.context.evaluated_depsgraph_get(); ev = h.evaluated_get(dg); me = ev.to_mesh()
    zs = [v.co.z for v in me.vertices]; ev.to_mesh_clear()
    return max(zs) - min(zs)

def add_asset(human, mhclo, kind):
    HumanService, _ = _services()
    return HumanService.add_mhclo_asset(mhclo, human, asset_type=kind, subdiv_levels=0, material_type='NONE', set_up_rigging=True, interpolate_weights=True, import_subrig=False, import_weights=True)

def select_only(objs):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    if objs: bpy.context.view_layer.objects.active = objs[0]

def build_person(spec):
    HumanService, TargetService = _services()
    md = macro_dict(spec)
    h0 = HumanService.create_human(macro_detail_dict=md, scale=0.1)
    if spec.get('face'): face_targets(h0, spec['id'])
    hb = body_height(h0)
    me = h0.data; bpy.data.objects.remove(h0); bpy.data.meshes.remove(me)
    k = (spec['H'] - 0.02) / hb
    human = HumanService.create_human(macro_detail_dict=md, scale=0.1 * k)
    if spec.get('face'): face_targets(human, spec['id'])   # before the rig and every asset, so the rig, eyes and hair fit the face
    rig = HumanService.add_builtin_rig(human, 'game_engine')
    pid = spec['id']
    parts = []            # (object, role, material kwargs)
    def put(rel, kind, role, subdir):
        path = P(subdir, rel, rel + '.mhclo')
        o = add_asset(human, path, kind)
        parts.append((o, role, mhclo_material(path)))
        return o
    eyes_mhclo = P('eyes', 'high-poly', 'high-poly.mhclo')
    o = add_asset(human, eyes_mhclo, 'Eyes'); parts.append((o, 'eyes', P('eyes', 'materials', spec['eye'] + '.mhmat')))
    put(spec['brows'], 'Eyebrows', 'brows', 'eyebrows')
    if spec.get('lashes'): put(spec['lashes'], 'Eyelashes', 'lashes', 'eyelashes')
    if spec.get('hair'): put(spec['hair'], 'Hair', 'hair', 'hair')
    for c in spec['clothes'] + ([spec['shoes']] if spec.get('shoes') else []):
        put(c, 'Clothes', 'cloth', 'clothes')
    replace_eyes_later = True
    # --- bake macro shape keys + apply body masks (clothes delete groups)
    select_only([human]); bpy.context.view_layer.objects.active = human
    arm_mod = human.modifiers.get('Armature'); arm_obj = arm_mod.object if arm_mod else rig
    if arm_mod: human.modifiers.remove(arm_mod)
    if human.data.shape_keys: bpy.ops.object.shape_key_remove(all=True, apply_mix=True)
    for m in list(human.modifiers):
        if m.type == 'MASK':
            if any(w in m.name.lower() for w in ('dress', 'skirt', 'kimono', 'tunic', 'sash', 'halter')): human.modifiers.remove(m); continue
            bpy.ops.object.modifier_apply(modifier=m.name)
    am = human.modifiers.new('Armature', 'ARMATURE'); am.object = arm_obj
    # strip helper / joint vertex groups that are not bones (keeps the glTF clean)
    bones = set(b.name for b in rig.data.bones)
    for o in [human] + [p[0] for p in parts]:
        for vg in list(o.vertex_groups):
            if vg.name not in bones: o.vertex_groups.remove(vg)
    human['_body'] = 1
    person = dict(spec=spec, human=human, rig=rig, parts=parts, scale=k)
    replace_eyes(person)
    return person

def replace_eyes(person):
    """MPFB's png eyes only texture a front dome (the rest maps to a transparent texel): rebuild two plain eyeballs at the same positions / size and map the iris + sclera crop of the MakeHuman eye texture onto them."""
    import bmesh
    from PIL import Image
    eyes = [o for o, r, _ in person['parts'] if r == 'eyes'][0]; spec = person['spec']
    vs = [v.co.copy() for v in eyes.data.vertices]
    balls = []
    for side in (-1, 1):
        sv = [c for c in vs if c.x * side > 0]
        mn = Vector((min(c.x for c in sv), min(c.y for c in sv), min(c.z for c in sv))); mx = Vector((max(c.x for c in sv), max(c.y for c in sv), max(c.z for c in sv)))
        ctr = (mn + mx) / 2; r = max(mx.x - mn.x, mx.z - mn.z) / 2 * 0.86
        ctr.y += 0.30 * r                      # sit a little deeper so the lids overlap the ball
        balls.append((ctr, r))
    bm = bmesh.new(); uvl = bm.loops.layers.uv.new('UVMap')
    for ctr, r in balls:
        bmesh.ops.create_uvsphere(bm, u_segments=14, v_segments=9, radius=r, matrix=Matrix.Translation(ctr), calc_uvs=False)
    bm.faces.ensure_lookup_table()
    # planar UV from the front (-y): u from x, v from z, per eyeball
    for f in bm.faces:
        cx = sum(v.co.x for v in f.verts) / len(f.verts)
        ctr, r = balls[0] if cx < 0 else balls[1]
        for l in f.loops:
            l[uvl].uv = (0.5 + (l.vert.co.x - ctr.x) / (2 * r), 0.5 + (l.vert.co.z - ctr.z) / (2 * r))
    me = bpy.data.meshes.new('eyes_new'); bm.to_mesh(me); bm.free()
    for p_ in me.polygons: p_.use_smooth = True
    ne = bpy.data.objects.new('eyes_new', me); bpy.context.scene.collection.objects.link(ne)
    vg = ne.vertex_groups.new(name='head'); vg.add(list(range(len(me.vertices))), 1.0, 'REPLACE')
    rig = person['rig']; ne.parent = rig; am = ne.modifiers.new('Armature', 'ARMATURE'); am.object = rig
    # texture: crop of the left-eye picture of the MakeHuman eye png (iris centre ~ (0.288, 0.710) in top-left coords, sclera diameter ~ 0.57)
    src = P('eyes', 'materials', spec['eye'] + '_eye.png')
    im = Image.open(src).convert('RGB'); W = im.size[0]
    cxp, cyp, half = 0.288 * W, 0.710 * W, 0.292 * W
    crop = im.crop((int(cxp - half), int(cyp - half), int(cxp + half), int(cyp + half))).resize((256, 256), Image.LANCZOS)
    out = os.path.join(TEXDIR, f'eye_{spec["eye"]}_crop.jpg'); crop.save(out, quality=88)
    person['eye_crop'] = out
    old = eyes; person['parts'] = [(ne if o is old else o, r, m) for o, r, m in person['parts']]
    bpy.data.objects.remove(old)
    return ne

def assign_materials(person, maxpx=1024):
    spec = person['spec']; human = person['human']
    sk = spec['skin']; mh = parse_mhmat(P('skins', sk, sk + '.mhmat'))
    human.data.materials.clear()
    human.data.materials.append(make_material('skin_' + sk, os.path.join(mh['_dir'], mh['diffuseTexture']), None, rough=0.55, spec=0.35, maxpx=maxpx * 2))
    for o, role, mpath in person['parts']:
        mh = parse_mhmat(mpath); tex = mh.get('diffuseTexture'); nor = mh.get('normalmapTexture')
        o.data.materials.clear()
        if role == 'eyes':
            o.data.materials.append(make_material('eye_' + spec['eye'], person['eye_crop'], None, rough=0.18, spec=0.5, maxpx=256))
        elif role in ('brows', 'lashes'):
            o.data.materials.append(make_material('alpha_' + role + '_' + os.path.basename(tex), os.path.join(mh['_dir'], tex), None, alpha=True, rough=0.8, spec=0.0, maxpx=256, tint=None))
        elif role == 'hair':
            o.data.materials.append(make_material('alpha_hair_' + os.path.basename(tex) + spec['hair_col'] + ('_lift' if spec.get('hair_lift') else ''), os.path.join(mh['_dir'], tex), None, alpha=True, rough=0.55, spec=0.3, maxpx=512,
                                                  tint=tuple(lin(c) for c in hex_rgb(spec['hair_col'])), lift=bool(spec.get('hair_lift'))))
        else:
            tr = mh.get('transparent', 'False') == 'True' and False
            tn = spec.get('tint') if 'suit' in o.name.lower() else None
            if tn is None and any(w in o.name.lower() for w in ('boots_female', 'monk_strap_female')): tn = (0.22, 0.14, 0.11)
            o.data.materials.append(make_material('cloth_' + os.path.basename(tex or o.name) + ('_t' if tn else ''), os.path.join(mh['_dir'], tex) if tex else None,
                                                  os.path.join(mh['_dir'], nor) if nor else None, rough=0.78, spec=0.15, maxpx=maxpx if role != 'shoe' else 512, nmaxpx=512, tint=tuple(lin(c) for c in tn) if tn else None))

def person_objects(person): return [person['human']] + [p[0] for p in person['parts']] + person.get('extra', [])

def orient_and_apose(person):
    rig = person['rig']; objs = person_objects(person)
    Rz = Matrix.Rotation(math.pi, 4, 'Z')
    for o in objs:
        o.data.transform(Rz); o.data.update()
    bpy.context.view_layer.objects.active = rig; select_only([rig])
    bpy.ops.object.mode_set(mode='EDIT')
    for eb in rig.data.edit_bones: eb.transform(Rz, scale=True, roll=True)
    bpy.ops.object.mode_set(mode='POSE')
    for pb in rig.pose.bones: pb.rotation_mode = 'QUATERNION'; pb.rotation_quaternion = (1, 0, 0, 0)
    bpy.context.view_layer.update()
    def aim(name, target):
        pb = rig.pose.bones.get(name)
        if pb is None: return
        head = pb.head.copy(); d = (pb.tail - pb.head).normalized(); t = Vector(target).normalized()
        q = d.rotation_difference(t)
        M = Matrix.Translation(head) @ q.to_matrix().to_4x4() @ Matrix.Translation(-head)
        pb.matrix = M @ pb.matrix
        bpy.context.view_layer.update()
    for s in ('l', 'r'):
        out = 1.0 if rig.data.bones['upperarm_' + s].head_local.x > 0 else -1.0
        for nm, tg in (('upperarm_', (out * 0.07, 0.0, -1)), ('lowerarm_', (out * 0.05, 0.03, -1)), ('hand_', (out * 0.04, 0.06, -1))):
            aim(nm + s, tg)
        for f in ('index', 'middle', 'ring', 'pinky'):
            for i in (1, 2, 3): aim(f'{f}_0{i}_{s}', (out * 0.02, 0.10, -1))
        for i in (1, 2, 3): aim(f'thumb_0{i}_{s}', (-out * 0.20, 0.55, -0.8))
    bpy.ops.object.mode_set(mode='OBJECT')
    # bake the posed mesh, then make the pose the rest pose
    for o in objs:
        select_only([o])
        for m in list(o.modifiers):
            if m.type == 'ARMATURE': bpy.ops.object.modifier_apply(modifier=m.name)
    select_only([rig]); bpy.ops.object.mode_set(mode='POSE'); bpy.ops.pose.armature_apply(selected=False); bpy.ops.object.mode_set(mode='OBJECT')
    for o in objs:
        am = o.modifiers.new('Armature', 'ARMATURE'); am.object = rig
        o.parent = rig

# ------------------------------------------------------------------ our own garments (tartan kilts / pleated skirts / hose / sporran / trews / sash) fitted to the MPFB body
TARTAN_TEX = {}
def tartan_image(tid):
    if tid in TARTAN_TEX: return TARTAN_TEX[tid]
    import assets_people_tex as TX
    from PIL import Image
    alb, nrm, orm = TX.f_tartan(tid)
    out = os.path.join(TEXDIR, f'tartan{tid}.jpg'); Image.fromarray(alb).save(out, quality=88)
    img = bpy.data.images.load(out); img.pack(); img.name = f'tartan{tid}'
    TARTAN_TEX[tid] = (img, out)
    return TARTAN_TEX[tid]

def tartan_material(tid):
    key = ('tartan', tid)
    if key in MAT_CACHE: return MAT_CACHE[key]
    img, path = tartan_image(tid)
    m = bpy.data.materials.new(f'cloth_tartan{tid}'); m.use_nodes = True; nt = m.node_tree; bs = nt.nodes['Principled BSDF']
    bs.inputs['Roughness'].default_value = 0.9
    t = nt.nodes.new('ShaderNodeTexImage'); t.image = img; t.extension = 'REPEAT'
    nt.links.new(t.outputs['Color'], bs.inputs['Base Color'])
    MAT_CACHE[key] = m
    return m

def solid_material(name, rgb, rough=0.7, metal=0.0):
    key = ('solid', name)
    if key in MAT_CACHE: return MAT_CACHE[key]
    m = bpy.data.materials.new(name); m.use_nodes = True; bs = m.node_tree.nodes['Principled BSDF']
    bs.inputs['Base Color'].default_value = tuple(lin(c) for c in rgb) + (1.0,); bs.inputs['Roughness'].default_value = rough; bs.inputs['Metallic'].default_value = metal
    MAT_CACHE[key] = m
    return m

ARM_BONES = ('upperarm', 'lowerarm', 'hand', 'thumb', 'index', 'middle', 'ring', 'pinky')

def slab(human, z, band=0.012, side=0, over=(), need=0, into=None, hips=False):
    """extents of the body surface around height z: (xmin, xmax, ymin, ymax); side=-1/+1 restricts to one leg.
    over: garments worn there too (their torso part is measured as well, sleeves are not), so what is built goes over them.
    The clothes' delete groups have already removed the skin they cover - at a sweater's waist there is NO body left to measure, and the old
    silent fallback (an adult-sized 30 x 20 cm oval) gave the children's kilts a waistband standing several cm off the body. need > 0: return
    None when fewer points than that were found, so the caller can decide; need = 0 keeps the fallback (with a warning). into: a list that gets the (x, y)
    of every point measured (the kilt's rings follow the body's outline, not just its extents)."""
    xs = []; ys = []
    lim = abs(human.get('_thx', 0.1)) + 0.085
    harm = [vg.index for vg in human.vertex_groups if vg.name.startswith(ARM_BONES)] if hips else []   # hips: what a kilt goes round, so not the hands
    for v in human.data.vertices:
        c = v.co
        if abs(c.z - z) >= band or abs(c.x) >= lim or (side and c.x * side <= 0): continue
        if harm and sum(g.weight for g in v.groups if g.group in harm) > 0.3: continue   # a hand hanging beside the hips is not the hips (the kilt's outline-following rings would bulge out to it)
        xs.append(c.x); ys.append(c.y)
    for o in over:
        arm = [vg.index for vg in o.vertex_groups if vg.name.startswith(ARM_BONES)]
        for v in o.data.vertices:
            c = v.co
            if abs(c.z - z) >= band or abs(c.x) >= lim or (side and c.x * side <= 0): continue
            if arm and sum(g.weight for g in v.groups if g.group in arm) > 0.3: continue   # a sleeve hanging beside the hips
            xs.append(c.x); ys.append(c.y)
    if len(xs) < max(1, need):
        if band < 0.05: return slab(human, z, band * 2, side, over, need, into, hips)   # a coarse garment (a suit's trouser legs) can have no vertex row this close: look wider
        if need: return None
        print('slab: nothing measured at z=%.3f (side %d) - fallback oval' % (z, side)); return (-0.15, 0.15, -0.1, 0.1)
    if into is not None: into.extend(zip(xs, ys))
    return (min(xs), max(xs), min(ys), max(ys))

def new_part(person, name, bm, mat, groups_fn, role='kilt'):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    for p_ in me.polygons: p_.use_smooth = True
    ob = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(ob)
    me.materials.append(mat)
    rig = person['rig']
    for b in rig.data.bones: ob.vertex_groups.new(name=b.name)
    for v in me.vertices:
        for bn, w in groups_fn(v.co):
            if w > 1e-4: ob.vertex_groups[bn].add([v.index], w, 'REPLACE')
    ob.parent = rig; am = ob.modifiers.new('Armature', 'ARMATURE'); am.object = rig
    person.setdefault('extra', []).append(ob); person.setdefault('extra_roles', {})[id(ob)] = role
    return ob

def kilt_weights(zt, zh, wmax, sl, back_factor=0.7):
    def fn(co):
        t = max(0.0, min(1.0, (zt - co.z) / max(1e-6, zt - zh)))
        wt = wmax * t ** 1.15 * (back_factor if co.y < 0.0 else 1.0)       # -y = back
        wr = max(0.0, min(1.0, 0.5 + sl * co.x / 0.30))
        return [('pelvis', (1 - wt) * 0.75), ('spine_01', (1 - wt) * 0.25), ('thigh_l', wt * wr), ('thigh_r', wt * (1 - wr))]
    return fn

HEM_DROP = 0.13   # = AnimCrowd._extendHem(drop) in js/sim/people.js: a cut top's hem is extruded this far straight down at load, to tuck inside the kilt

def waist_slab(person, z, into=None):
    """what a kilt (or its belt) must go round at height z: the body there, and - within HEM_DROP below a cut top's hem - that hem's loop, which the game extrudes
    straight down. Not the top's own cloth at z: below the cut it is gone, and above the cut the loose bottom of a sweater flares out (measuring it there
    stood the children's waistbands off their backs)."""
    human = person['human']; spec = person['spec']
    b = slab(human, z, need=1, into=into, hips=True)
    if spec.get('cut'):
        zc = person['rig'].data.bones['pelvis'].head_local.z + spec['cut'][1]
        if z >= zc - HEM_DROP:
            for o in worn_over(person):
                t = hem_loop(o, into) if spec['cut'][0] in o.name else None
                if t: b = t if not b else (min(b[0], t[0]), max(b[1], t[1]), min(b[2], t[2]), max(b[3], t[3]))
    if not b:   # no body left here at all (a suit's leg mask): what is worn there stands in for it
        b = slab(human, z, over=worn_over(person), need=1, into=into, hips=True)
    return b or slab(human, z, hips=True)   # (the last: the warned fallback)

def hem_loop(o, into=None):
    """extents (xmin, xmax, ymin, ymax) of a cut top's torso hem: the open boundary loop that encloses the body's centre line, the lowest such - the same
    loop js/sim/people.js _extendHem picks and extrudes straight down. (Measuring the top's cloth near the cut height instead caught its loose sides.)"""
    import bmesh
    bm = bmesh.new(); bm.from_mesh(o.data)
    bd = [e for e in bm.edges if e.is_boundary]; adj = {}
    for e in bd:
        a, b = e.verts; adj.setdefault(a, []).append(b); adj.setdefault(b, []).append(a)
    seen, best, by = set(), None, 1e9
    for v in adj:
        if v in seen: continue
        comp, st = [], [v]; seen.add(v)
        while st:
            u = st.pop(); comp.append(u)
            for w in adj[u]:
                if w not in seen: seen.add(w); st.append(w)
        xs = [u.co.x for u in comp]; z = sum(u.co.z for u in comp) / len(comp)
        if len(comp) > 8 and min(xs) < -0.05 and max(xs) > 0.05 and z < by: by, best = z, comp
    r = (min(u.co.x for u in best), max(u.co.x for u in best), min(u.co.y for u in best), max(u.co.y for u in best)) if best else None
    if best and into is not None: into.extend((u.co.x, u.co.y) for u in best)
    bm.free(); return r

def worn_over(person):
    """the clothes a kilt / belt goes over (not footwear): measured with the body, see slab()"""
    return [o for o, r, _ in person['parts'] if r == 'cloth' and not any(w in o.name.lower() for w in ('shoe', 'boot', 'sneaker'))]

def convex_hull_2d(pts):
    """the convex hull of 2-D points, counter-clockwise (Andrew's monotone chain)"""
    P = sorted(set(pts))
    if len(P) < 3: return P
    cross = lambda o, a, b: (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    lo = []; hi = []
    for p in P:
        while len(lo) >= 2 and cross(lo[-2], lo[-1], p) <= 0: lo.pop()
        lo.append(p)
    for p in reversed(P):
        while len(hi) >= 2 and cross(hi[-2], hi[-1], p) <= 0: hi.pop()
        hi.append(p)
    return lo[:-1] + hi[:-1]

def ray_to_hull(hull, th):
    """distance from the origin along direction th to a convex polygon around the origin"""
    dx, dy = math.cos(th), math.sin(th); best = 0.0
    for i in range(len(hull)):
        (ax, ay), (bx, by) = hull[i], hull[(i + 1) % len(hull)]
        ex, ey = bx - ax, by - ay; den = dx * ey - dy * ex
        if abs(den) < 1e-12: continue
        t = (ax * ey - ay * ex) / den; u = (ax * dy - ay * dx) / den
        if t > 0 and -1e-9 <= u <= 1 + 1e-9: best = max(best, t)
    return best

def build_skirt(person, kd):
    import bmesh
    human = person['human']; rig = person['rig']; H = person['spec']['H'] / 1.0
    bn = rig.data.bones
    zt = bn['pelvis'].head_local.z + 0.105 * H / 1.75
    knee = bn['calf_l'].head_local.z
    kind = kd['kind']
    if kind == 'kilt': zh = knee + 0.01
    else: zh = knee + kd.get('hem', 0.12) * H / 1.75
    prm = dict(kilt=dict(flare=0.045, apron=0.80, npl=7, amp=0.020, thick=0.007, wmax=0.50), pleated=dict(flare=0.065, apron=0.0, npl=9, amp=0.016, thick=0.006, wmax=0.50))[kind]
    k = H / 1.75; prm = dict(prm, amp=prm['amp'] * k)   # pleat depth scales with the child; the flare does not - it is the room a swinging thigh needs
    # (measured 2026-11-07, tools/people_holes.mjs, stand + walk + gait: a flare scaled down with height showed 2-3x the skin through the children's kilts)
    n = 72; NR = 7
    cen = lambda z, into=None: waist_slab(person, z, into)   # round the body AND the top's tucked-in hem (the skin under a sweater is gone: see slab)
    rings = []
    def ring_at(z, t, inner=0.0, zup=None, zdn=None):
        # the cloth between two rings is straight: a ring must clear the body over the spans on both sides of it, up to the ring above and down to the one
        # below, or the belly's curve between two rings pokes through the chord (the children's tummies under the waistband, 2026-11-07: 7 mm clear at rest
        # and through in the idle sway). So measure at the ring and at thirds of the way to each neighbour.
        zs = [z] + ([z + (zup - z) / 3, z + 2 * (zup - z) / 3] if zup is not None else []) + ([z + (zdn - z) / 3, z + 2 * (zdn - z) / 3] if zdn is not None else [])
        pts = []; ex = [cen(zz, pts) for zz in zs]
        xmn = min(e[0] for e in ex); xmx = max(e[1] for e in ex); ymn = min(e[2] for e in ex); ymx = max(e[3] for e in ex)
        # LOD: the decimated kilt is a few big flat faces that cut into the hips as they swing; 8 mm more room below the waistband keeps them inside
        # (the near, full-detail kilt keeps the snug fit; the simplified one is only drawn beyond ~11 m)
        lx = (0.008 * min(1.0, t * 4)) if LOD else 0.0
        rx = max(abs(xmn), abs(xmx)) + 0.016 + lx + prm['flare'] * t ** 1.3; ry = (ymx - ymn) / 2 + 0.014 + lx + prm['flare'] * 0.8 * t ** 1.3; cy = (ymx + ymn) / 2
        # an oval through the extents is not enough: a hip is a rounded box, and on the diagonals (front of the hip bones, the seat) it reaches outside an
        # oval of its own width and depth - the skin came out there. So along each direction the ring is also held off the body's own outline.
        pa = [(math.atan2(py - cy, px), math.hypot(px, py - cy)) for px, py in pts]
        def scale(th):
            el = rx * ry / math.hypot(ry * math.cos(th), rx * math.sin(th))
            near = [d for a, d in pa if abs((a - th + math.pi) % (2 * math.pi) - math.pi) < 2.5 * math.pi / n]
            return max(1.0, (max(near) + 0.016 + lx + prm['flare'] * t ** 1.3) / el) if near else 1.0
        fade = min(1.0, max(0.0, (t - 0.04) / 0.35)); fade = fade * fade * (3 - 2 * fade)
        # the front needs room for the thighs to flex forward at the hip (a child shifting its weight, a step): the capsules that js/sim/bodyfit.js fitLegs
        # holds the cloth off start at the hip joint, and the top of a flexed thigh came through the front a hand's width under the waistband (2026-11-07)
        fe = 0.015 * min(1.0, t / 0.25)
        def front(th): c = math.sin(th); return fe * c * c if c > 0 else 0.0   # sin(th) > 0: the front half (+y)
        base = [(rx * scale(2 * math.pi * i / n) + front(2 * math.pi * i / n), ry * scale(2 * math.pi * i / n) + front(2 * math.pi * i / n)) for i in range(n)]
        # cloth spans a hollow, it does not follow it in: following the outline, the ring dipped into the gap between the thighs at the front centre
        # (1 cm, every ring below the waistband) and the thighs came through there as the person moved (2026-11-07). So each ring is pushed out to its
        # own convex hull before the pleats go on.
        bp = [(ax * math.cos(2 * math.pi * i / n), ay * math.sin(2 * math.pi * i / n)) for i, (ax, ay) in enumerate(base)]
        hull = convex_hull_2d(bp)
        out = []
        for i in range(n):
            th = 2 * math.pi * i / n
            phi = ((th - math.pi / 2 + math.pi) % (2 * math.pi)) - math.pi          # 0 = front (+y after orient)
            off = 0.0
            if abs(phi) > prm['apron'] and prm['amp'] > 0:
                pp = (abs(phi) - prm['apron']) / (math.pi - prm['apron'] + 1e-9) * prm['npl']; fr = pp - math.floor(pp)
                off = prm['amp'] * (fr / 0.78 if fr < 0.78 else (1 - fr) / 0.22) * fade
            h = ray_to_hull(hull, th) / math.hypot(*bp[i])   # >= 1: how far out the hull is along this direction
            out.append(Vector(((base[i][0] * h + off - inner) * math.cos(th), cy + (base[i][1] * h + off - inner) * math.sin(th), z)))
        return out
    zr = lambda i: zt + (zh - zt) * i / (NR - 1)
    for i in range(NR): rings.append(ring_at(zr(i), i / (NR - 1), zup=None if i == 0 else zr(i - 1), zdn=None if i in (0, NR - 1) else zr(i + 1)))   # (the waistband stays snug)
    # cloth hangs from its widest point: below the seat a ring that follows the thighs' outline would tuck back in, and the kilt bulged at the seat and
    # narrowed again to the hem (seen from behind, 2026-11-07). So no ring is smaller than the one above it, direction by direction.
    ctr = lambda rg: (sum(p.x for p in rg) / len(rg), sum(p.y for p in rg) / len(rg))
    for r in range(1, NR):
        (ax, ay), (bx, by) = ctr(rings[r - 1]), ctr(rings[r])
        for i, p in enumerate(rings[r]):
            q = rings[r - 1][i]; d0 = math.hypot(q.x - ax, q.y - ay); d = math.hypot(p.x - bx, p.y - by)
            if d < d0: rings[r][i] = Vector((bx + (p.x - bx) * d0 / d, by + (p.y - by) * d0 / d, p.z))
    def shrink(rg, by_):   # the inside face of the hem / waistband: the outer ring, the cloth's thickness in
        cx, cy_ = ctr(rg); out = []
        for p in rg:
            d = math.hypot(p.x - cx, p.y - cy_); out.append(Vector((cx + (p.x - cx) * (d - by_) / d, cy_ + (p.y - cy_) * (d - by_) / d, p.z)))
        return out
    rings.append(shrink(rings[NR - 1], prm['thick'])); rings.append(shrink(rings[0], prm['thick']))
    bm = bmesh.new(); uvl = bm.loops.layers.uv.new('UVMap')
    vr = [[bm.verts.new(p) for p in rg] for rg in rings]
    tm = 0.96
    for r in range(len(vr) - 1):
        for i in range(n):
            j = (i + 1) % n
            f = bm.faces.new((vr[r][i], vr[r][j], vr[r + 1][j], vr[r + 1][i]))
            for l in f.loops:
                th = math.atan2(l.vert.co.y, l.vert.co.x)
                # unwrap across the seam relative to this face's first vertex
                th0 = math.atan2(f.verts[0].co.y, f.verts[0].co.x)
                while th - th0 > math.pi: th -= 2 * math.pi
                while th - th0 < -math.pi: th += 2 * math.pi
                l[uvl].uv = (th * 0.17 / tm, l.vert.co.z / tm)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    mat = tartan_material(kd['tart']) if 'tart' in kd else solid_material('skirt_' + kd.get('col', '#303030'), hex_rgb(kd.get('col', '#303030')))
    new_part(person, 'kilt', bm, mat, kilt_weights(zt, zh, prm['wmax'], person['sl']))
    person['kilt_zt'] = zt; person['kilt_zh'] = zh; person['kilt_wmax'] = prm['wmax']
    return zt, zh

def build_belt_sporran(person, kd, zt):
    import bmesh
    human = person['human']; H = person['spec']['H']; k = H / 1.75
    xmn, xmx, ymn, ymx = waist_slab(person, zt)   # the same measure as the kilt's waistband, which the belt sits on
    if kd.get('belt', True):
        bm = bmesh.new(); rings = []
        for z, ex in ((zt + 0.032 * k, 0.012), (zt - 0.006 * k, 0.012)):
            rx = max(abs(xmn), abs(xmx)) + 0.026 + ex - 0.012; ry = (ymx - ymn) / 2 + 0.024; cy = (ymx + ymn) / 2
            rings.append([bm.verts.new((rx * math.cos(2 * math.pi * i / 36), cy + ry * math.sin(2 * math.pi * i / 36), z)) for i in range(36)])
        for i in range(36): bm.faces.new((rings[0][i], rings[0][(i + 1) % 36], rings[1][(i + 1) % 36], rings[1][i]))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
        new_part(person, 'belt', bm, solid_material('belt', hex_rgb('#2a1a12'), 0.55), lambda co: [('pelvis', 0.6), ('spine_01', 0.4)])
    if kd.get('sporran'):
        bm = bmesh.new()
        zc = zt - 0.21 * k
        # hung on the kilt's own front, its back 6 mm clear of the cloth: the kilt is held off the body by a measured, eased amount (build_skirt), so a fixed
        # distance off the body put the sporran inside it (the boy's, 2026-11-07)
        kilt = next(o for o in person.get('extra', []) if o.name.startswith('kilt'))
        fr = {}   # the kilt's front profile: per ring height, its front-most point near the centre line (an adult's rings are ~8 cm apart: interpolate)
        for v in kilt.data.vertices:
            if abs(v.co.x) < 0.03 and v.co.y > 0: zk = round(v.co.z, 4); fr[zk] = max(fr.get(zk, 0.0), v.co.y)
        zk = sorted(fr); lo = max([z_ for z_ in zk if z_ <= zc], default=zk[0]); hi = min([z_ for z_ in zk if z_ >= zc], default=zk[-1])
        yk = fr[lo] if hi == lo else fr[lo] + (fr[hi] - fr[lo]) * (zc - lo) / (hi - lo)
        yfront = yk + 0.024 * k + 0.006
        for (cx, cy, cz, rx, ry, rz, col) in ((0, yfront, zc, 0.055 * k, 0.024 * k, 0.078 * k, '#5b4a3a'), (0, yfront + 0.010, zc + 0.043 * k, 0.044 * k, 0.018 * k, 0.030 * k, '#b8bcc4')):
            bmesh.ops.create_uvsphere(bm, u_segments=12, v_segments=8, radius=1.0, matrix=Matrix.Translation((cx, cy, cz)) @ Matrix.Diagonal((rx, ry, rz, 1.0)))
        bm.faces.ensure_lookup_table()
        for tx in (-0.03, -0.015, 0.0, 0.015, 0.03):
            for z_ in (zc - 0.06 * k, zc - 0.11 * k):
                bm.verts.new((tx * k, yfront + 0.006, z_))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
        # it moves with the cloth it hangs on: the kilt's own weights at the sporran's centre, the same for every vertex (rigid). With weights of its own
        # (mostly pelvis) the kilt swung forward over a flexed thigh and the sporran was left behind inside it (2026-11-07)
        ws = kilt_weights(zt, person['kilt_zh'], person['kilt_wmax'], person['sl'])(Vector((0.0, yfront, zc)))
        new_part(person, 'sporran', bm, solid_material('sporran', hex_rgb('#5b4a3a'), 0.9), lambda co: ws)

def build_hose(person, kd, zh):
    import bmesh
    human = person['human']; rig = person['rig']; H = person['spec']['H']; k = H / 1.75
    colr, cuff = kd['hose']; bn = rig.data.bones
    bm = bmesh.new(); cb = bmesh.new(); seg = 18
    knee_z = bn['calf_l'].head_local.z; ankle_z = bn['foot_l'].head_local.z
    ztop = zh + 0.03; zbot = ankle_z + 0.06 * k
    for sn in ('l', 'r'):
        kh = bn['calf_' + sn].head_local; ah = bn['foot_' + sn].head_local; side = 1 if (kh.x > 0) else -1
        def ctr(z):
            # centred on the leg itself, not on the bone: the calf muscle sits behind the calf bone and the kneecap in front of it, so a ring round
            # the bone let the knee and calf out through the back and front of the cuff (7-11 mm off centre on the children). Where the clothes
            # left no skin to measure (a suit's leg mask), the bone axis and an average leg radius.
            t = max(0.0, min(1.0, (kh.z - z) / max(1e-6, kh.z - ah.z)))
            bx, by, br = kh.x + (ah.x - kh.x) * t, kh.y + (ah.y - kh.y) * t, 0.066 * k - 0.024 * k * t
            s = slab(human, z, 0.012, side, need=6)
            if not s: return bx, by, br
            return (s[0] + s[1]) / 2, (s[2] + s[3]) / 2, max(br * 0.85, (s[1] - s[0]) / 2, (s[3] - s[2]) / 2 / 1.05)
        rings = []; crings = []
        NZ = 8
        for i in range(NZ):
            z = ztop + (zbot - ztop) * i / (NZ - 1); cx, cy, r = ctr(z)
            rings.append([bm.verts.new((cx + (r + 0.004) * math.cos(2 * math.pi * j / seg), cy + (r + 0.004) * 1.05 * math.sin(2 * math.pi * j / seg), z)) for j in range(seg)])
        for i, z in enumerate((knee_z - 0.012 * k, knee_z - 0.060 * k)):
            cx, cy, r = ctr(z)
            crings.append([cb.verts.new((cx + (r + 0.010) * math.cos(2 * math.pi * j / seg), cy + (r + 0.010) * 1.05 * math.sin(2 * math.pi * j / seg), z)) for j in range(seg)])
        for r_ in range(NZ - 1):
            for j in range(seg): bm.faces.new((rings[r_][j], rings[r_][(j + 1) % seg], rings[r_ + 1][(j + 1) % seg], rings[r_ + 1][j]))
        for j in range(seg): cb.faces.new((crings[0][j], crings[0][(j + 1) % seg], crings[1][(j + 1) % seg], crings[1][j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:]); bmesh.ops.recalc_face_normals(cb, faces=cb.faces[:])
    sl = person['sl']
    def lw(co):
        s_ = 'l' if co.x * sl > 0 else 'r'
        t = max(0.0, min(1.0, (co.z - knee_z) / 0.12))
        return [('calf_' + s_, 1.0 - 0.5 * t), ('thigh_' + s_, 0.5 * t)] if co.z > ankle_z + 0.12 else [('calf_' + s_, 0.75), ('foot_' + s_, 0.25)]
    new_part(person, 'hose', bm, solid_material('hose_' + colr, hex_rgb(colr), 0.95), lw)
    new_part(person, 'hose_cuff', cb, solid_material('hose_cuff_' + cuff, hex_rgb(cuff), 0.9), lw)
    # The leg skin inside the hose is never meant to be seen, but the hose is a closed tube across the knee: when the knee bends the kneecap and calf came out
    # through it (and the rest-pose tuck in tools/people_skinfit.py cannot follow a bend). Delete it, as the MakeHuman clothes' own masks do under every
    # garment: 1.5 cm inside each open end, legs only (an arm or a hand passing at that height is left alone).
    leg = [vg.index for vg in human.vertex_groups if vg.name.startswith(('thigh_', 'calf_', 'foot_'))]
    lim = abs(human.get('_thx', 0.1)) + 0.085
    bmh = bmesh.new(); bmh.from_mesh(human.data); dl = bmh.verts.layers.deform.verify()
    kill = [v for v in bmh.verts if zbot + 0.015 < v.co.z < ztop - 0.015 and abs(v.co.x) < lim and sum(w for g, w in v[dl].items() if g in leg) > 0.5]
    bmesh.ops.delete(bmh, geom=kill, context='VERTS'); bmh.to_mesh(human.data); bmh.free()
    print('hose: removed %d leg skin vertices under the hose' % len(kill))

def build_sash(person, tid):
    import bmesh
    human = person['human']; rig = person['rig']; H = person['spec']['H']; k = H / 1.75
    bn = rig.data.bones
    zsh = bn['clavicle_l'].head_local.z; zhip = bn['pelvis'].head_local.z + 0.02
    pts = []
    for fz, side_x, fy in ((0.0, 0.55, 0.0), (0.10, 0.30, 1.0), (0.28, 0.0, 1.0), (0.48, -0.55, 0.9), (0.70, -1.0, 0.3)):
        z = zsh + 0.035 - (zsh - zhip) * (fz / 0.7) * 1.0
        xmn, xmx, ymn, ymx = slab(human, z, 0.02)
        cx = (xmn + xmx) / 2; rx = (xmx - xmn) / 2; cy = (ymx + ymn) / 2; ry = (ymx - ymn) / 2
        pts.append(Vector((cx + side_x * rx * 0.75, cy + ry * fy + 0.016 * fy if fy > 0 else cy, z)))
    bm = bmesh.new(); uvl = bm.loops.layers.uv.new('UVMap'); w = 0.036 * k
    L = []; R = []; thick = 0.006
    for i, p in enumerate(pts):
        t = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
        out = Vector((p.x, p.y - cy, 0)).normalized()
        side = t.cross(out).normalized() if t.cross(out).length > 1e-6 else Vector((1, 0, 0))
        L.append(bm.verts.new(p - side * w)); R.append(bm.verts.new(p + side * w))
    for i in range(len(pts) - 1):
        f = bm.faces.new((L[i], R[i], R[i + 1], L[i + 1]))
        for l in f.loops: l[uvl].uv = (l.vert.co.x / 0.6, l.vert.co.z / 0.6)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    zs = [p.z for p in pts]
    def sw(co):
        t = max(0.0, min(1.0, (co.z - zhip) / max(1e-3, zsh - zhip)))
        return [('spine_03', t), ('spine_01', 1 - t)]
    new_part(person, 'sash', bm, tartan_material(tid), sw)

# ------------------------------------------------------------------ batch 2 (2026-11-07): Lycra, baggy jeans, caps and the top hat. No CC0/CC-BY MakeHuman asset fits
# these, so they are made here, fitted to the person as the kilt is.
def paint_lycra(person, kind, colr):
    """Lycra leggings or bike shorts: the body's own skin from the waist down to the ankle (leggings) or to mid-thigh (shorts) gets a cloth material.
    Skin-tight by construction, so nothing can come through it, and nothing is drawn over it to fit. The arms are left as skin: a hand hangs beside the thigh."""
    human = person['human']; bn = person['rig'].data.bones; k = person['spec']['H'] / 1.75
    hip = bn['thigh_l'].head_local.z; knee = bn['calf_l'].head_local.z
    z_hi = bn['pelvis'].head_local.z + 0.11 * k
    z_lo = bn['foot_l'].head_local.z + 0.035 * k if kind == 'leggings' else hip - 0.42 * (hip - knee)
    # cut the skin along the two edges first, so they are straight rather than the stair-step of whole faces (the new vertices' weights and UVs interpolate)
    import bmesh
    bm = bmesh.new(); bm.from_mesh(human.data)
    for z in (z_lo, z_hi):
        bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], dist=1e-5, plane_co=(0, 0, z), plane_no=(0, 0, 1))
    bm.to_mesh(human.data); bm.free(); human.data.update()
    arm = {vg.index for vg in human.vertex_groups if vg.name.startswith(ARM_BONES)}
    inside = [z_lo - 1e-4 < v.co.z < z_hi + 1e-4 and sum(g.weight for g in v.groups if g.group in arm) < 0.3 for v in human.data.vertices]
    mat = solid_material('cloth_lycra_' + colr.lstrip('#'), hex_rgb(colr), 0.42)
    human.data.materials.append(mat); slot = len(human.data.materials) - 1
    n = 0
    for p_ in human.data.polygons:
        if all(inside[i] for i in p_.vertices): p_.material_index = slot; n += 1
    # the decimation (budget_and_join) collapsed edges across the new hem and left it a zigzag again: weight 0 = kept (Blender adds
    # length * (2 - w1 - w2) * factor to an edge's collapse cost), so the vertices on the hem are 0 and every other vertex 1
    mats = {}
    for p_ in human.data.polygons:
        for i in p_.vertices: mats.setdefault(i, set()).add(p_.material_index == slot)
    vg = human.vertex_groups.new(name='keepW')
    vg.add([i for i, m in mats.items() if len(m) == 1], 1.0, 'REPLACE')
    print('lycra %s: %d body faces, %d hem vertices kept' % (kind, n, sum(1 for m in mats.values() if len(m) == 2)))

def widen_jeans(person, amt):
    """baggy jeans: elvs_jeans_straight_leg with each leg pushed out from its own axis, nothing at the crotch and amt (a fraction of the leg's radius)
    at the hem. The skin under the jeans is already deleted by the jeans' own mask, so a wider leg cannot let anything through."""
    bn = person['rig'].data.bones; sl = person['sl']
    crotch = bn['thigh_l'].head_local.z - 0.06 * person['spec']['H'] / 1.75; ankle = bn['foot_l'].head_local.z
    def axis(s, z):   # the leg bone axis at height z: hip -> knee -> ankle
        a, b, c = bn['thigh_' + s].head_local, bn['calf_' + s].head_local, bn['foot_' + s].head_local
        p, q = (a, b) if z > b.z else (b, c)
        t = max(0.0, min(1.0, (p.z - z) / max(1e-6, p.z - q.z)))
        return p.x + (q.x - p.x) * t, p.y + (q.y - p.y) * t
    for o, role, _ in person['parts']:
        if role != 'cloth' or 'jeans' not in o.name.lower(): continue
        for v in o.data.vertices:
            c = v.co
            if c.z >= crotch: continue
            t = min(1.0, (crotch - c.z) / max(1e-6, crotch - ankle)) ** 0.7
            cx, cy = axis('l' if c.x * sl > 0 else 'r', c.z)
            f = 1.0 + amt * t
            c.x = cx + (c.x - cx) * f; c.y = cy + (c.y - cy) * f
        o.data.update()
        print('baggy: widened', o.name)

def tuck_waist(person, bottom, top):
    """the jeans' waistband (belt loops, a light label) stood out through a sweater or loose tee worn over it: pull the bottom garment in towards the body's
    axis wherever the top hangs over it, 1.5 cm at most, ramped in over the 2.5 cm above the top's hem. The skin there is deleted by both garments' masks."""
    bo = [o for o, r, _ in person['parts'] if r == 'cloth' and bottom in o.name]
    to = [o for o, r, _ in person['parts'] if r == 'cloth' and top in o.name]
    if not bo or not to: print('tuck: missing', bottom, top); return
    arm = [vg.index for vg in to[0].vertex_groups if vg.name.startswith(ARM_BONES)]
    lim = abs(person['human'].get('_thx', 0.1)) + 0.085
    hem = min(v.co.z for v in to[0].data.vertices if abs(v.co.x) < lim and sum(g.weight for g in v.groups if g.group in arm) < 0.3)
    bn = person['rig'].data.bones; cx = 0.0; cy = (bn['pelvis'].head_local.y + bn['spine_01'].head_local.y) / 2
    n = 0
    for v in bo[0].data.vertices:
        c = v.co
        if c.z <= hem: continue
        dx, dy = c.x - cx, c.y - cy; r = math.hypot(dx, dy)
        if r < 1e-6: continue
        pull = min(0.015, 0.4 * r) * min(1.0, (c.z - hem) / 0.025)
        c.x -= dx / r * pull; c.y -= dy / r * pull; n += 1
    bo[0].data.update()
    print('tuck: %s under %s, %d vertices above the hem at %.3f' % (bottom, top, n, hem))

def head_fit(person):
    """band height (just above the brows), crown height and the measured outline of head + hair between them, for a hat to go over"""
    human = person['human']; k = person['spec']['H'] / 1.75
    brows = [o for o, r, _ in person['parts'] if r == 'brows'][0]
    hair = [o for o, r, _ in person['parts'] if r == 'hair']
    zb = max(v.co.z for v in brows.data.vertices) + 0.018 * k
    ztop = max(v.co.z for o in [human] + hair for v in o.data.vertices)
    def ring(z, half):
        s = slab(human, z, half, over=hair, need=6)
        if not s: return None
        return (s[0] + s[1]) / 2, (s[2] + s[3]) / 2, (s[1] - s[0]) / 2, (s[3] - s[2]) / 2
    return zb, ztop, ring, k

def _ellipse(bm, cx, cy, rx, ry, z, seg):
    return [bm.verts.new((cx + rx * math.cos(2 * math.pi * j / seg), cy + ry * math.sin(2 * math.pi * j / seg), z)) for j in range(seg)]

def _wall(bm, lo, hi):   # quads between two rings of equal length, wound to face outward (rings run anticlockwise seen from above)
    n = len(lo)
    for j in range(n): bm.faces.new((lo[j], lo[(j + 1) % n], hi[(j + 1) % n], hi[j]))

def _closed_strip(bm, sections):
    """a closed loop of 4-vertex cross-sections (a brim, a peak's edge): quads between consecutive sections, normals made consistent afterwards"""
    fs = []
    n = len(sections)
    for i in range(n):
        a, b = sections[i], sections[(i + 1) % n]
        for e in range(4): fs.append(bm.faces.new((a[e], a[(e + 1) % 4], b[(e + 1) % 4], b[e])))
    return fs

def head_weights(co): return [('head', 1.0)]

def build_cap(person, colr, beret=False):
    """a baseball cap: a crown that follows the head + hair outline up from the band, and a peak at the front (+y). beret: no peak; the top ring
    is let out 25 % and the crown raised, so the soft top overhangs the band"""
    import bmesh
    zb, ztop, ring, k = head_fit(person)
    # Rings packed towards the top (sine spacing), the last one level with the top of the hair. Each is as wide as everything above the ring
    # below it, so the wall between two rings clears all the hair at those heights; a crown narrowing to a point above the last measured ring let
    # the top of the hair through.
    seg = 20; NZ = 6; zc = ztop + 0.006
    bm = bmesh.new(); rings = []
    zs = [zb + (zc - zb) * math.sin(math.pi / 2 * i / (NZ - 1)) for i in range(NZ)]
    base = ring((zb + zs[1]) / 2, (zs[1] - zb) / 2 + 0.004)
    for i in range(NZ):
        a_ = zs[max(0, i - 1)]
        r = ring((a_ + zc) / 2, (zc - a_) / 2 + 0.004) or base
        cx, cy, rx, ry = r
        g = 1.0 + (0.25 * (i / (NZ - 1)) ** 2 if beret else 0.0)
        rings.append(_ellipse(bm, cx, cy, (rx * 1.03 + 0.006) * g, (ry * 1.03 + 0.006) * g, zs[i], seg))
    for i in range(NZ - 1): _wall(bm, rings[i], rings[i + 1])
    cx, cy = base[0], base[1]
    top = bm.verts.new((cx, cy, zc + (0.022 * k if beret else 0.006))); last = rings[-1]
    for j in range(seg): bm.faces.new((last[j], last[(j + 1) % seg], top))
    if beret:
        new_part(person, 'beret', bm, solid_material('cloth_beret_' + colr.lstrip('#'), hex_rgb(colr), 0.95), head_weights); return
    # peak: the front half of the band, reaching 7 cm forward, slightly down; 5 mm thick
    _, _, rx, ry = base; rx = rx * 1.03 + 0.006; ry = ry * 1.03 + 0.006; L = 0.072 * k
    secs = []; pts = []
    for i in range(13):
        th = math.radians(15 + 150 * i / 12)          # 15 .. 165 degrees: the front, +y
        ix, iy = cx + rx * math.cos(th), cy + ry * math.sin(th)
        reach = L * max(0.0, math.sin(th)) ** 1.5
        pts.append(((ix, iy, zb + 0.004), (ix + 0.25 * reach * math.cos(th), iy + reach, zb - 0.010 * k)))
    for (ix, iy, iz), (ox, oy, oz) in pts:
        secs.append([bm.verts.new((ix, iy, iz)), bm.verts.new((ox, oy, oz)), bm.verts.new((ox, oy, oz - 0.005)), bm.verts.new((ix, iy, iz - 0.005))])
    fs = []
    for i in range(len(secs) - 1):
        a, b = secs[i], secs[i + 1]
        for e in range(4): fs.append(bm.faces.new((a[e], a[(e + 1) % 4], b[(e + 1) % 4], b[e])))
    fs.append(bm.faces.new(secs[0][::-1])); fs.append(bm.faces.new(secs[-1]))
    bmesh.ops.recalc_face_normals(bm, faces=fs)
    new_part(person, 'cap', bm, solid_material('cloth_cap_' + colr.lstrip('#'), hex_rgb(colr), 0.85), head_weights)

def build_tophat(person, colr):
    """the one top hat: a slightly flared crown over the head + hair outline, a ribbon band, and a brim curled up at the sides"""
    import bmesh
    zb, ztop, ring, k = head_fit(person)
    # the crown is a cylinder, so it must clear the widest the head + hair gets anywhere above the band
    cx, cy, rx, ry = ring((zb + ztop) / 2, (ztop - zb) / 2 + 0.004)
    rx = rx * 1.03 + 0.008; ry = ry * 1.03 + 0.008
    seg = 24; Hc = 0.165 * k; z0 = zb - 0.004
    bm = bmesh.new()
    lo = _ellipse(bm, cx, cy, rx, ry, z0, seg); hi = _ellipse(bm, cx, cy, rx * 1.07, ry * 1.07, z0 + Hc, seg)
    _wall(bm, lo, hi)
    top = bm.verts.new((cx, cy, z0 + Hc))
    for j in range(seg): bm.faces.new((hi[j], hi[(j + 1) % seg], top))
    secs = []
    for j in range(seg):
        th = 2 * math.pi * j / seg; c_, s_ = math.cos(th), math.sin(th)
        curl = 0.022 * k * abs(c_) ** 2                  # up at the sides
        wx, wy = rx + 0.050 * k, ry + 0.058 * k
        secs.append([bm.verts.new((cx + (rx - 0.002) * c_, cy + (ry - 0.002) * s_, z0 + 0.004)), bm.verts.new((cx + wx * c_, cy + wy * s_, z0 + curl + 0.002)),
                     bm.verts.new((cx + wx * c_, cy + wy * s_, z0 + curl - 0.002)), bm.verts.new((cx + (rx - 0.002) * c_, cy + (ry - 0.002) * s_, z0 - 0.002))])
    fs = _closed_strip(bm, secs)
    bmesh.ops.recalc_face_normals(bm, faces=fs)
    new_part(person, 'tophat', bm, solid_material('cloth_tophat_' + colr.lstrip('#'), hex_rgb(colr), 0.5), head_weights)
    bb = bmesh.new()
    blo = _ellipse(bb, cx, cy, rx * 1.004 + 0.0015, ry * 1.004 + 0.0015, z0 + 0.004, seg); bhi = _ellipse(bb, cx, cy, rx * 1.012 + 0.0015, ry * 1.012 + 0.0015, z0 + 0.032 * k, seg)
    _wall(bb, blo, bhi)
    new_part(person, 'tophat_band', bb, solid_material('cloth_tophat_band', hex_rgb('#4a1420'), 0.6), head_weights)

def cut_below(obj, z):
    import bmesh
    bm = bmesh.new(); bm.from_mesh(obj.data)
    lim = abs(obj.get('_thx', 0.10)) + 0.075
    kill = [v for v in bm.verts if v.co.z < z and abs(v.co.x) < lim]
    bmesh.ops.delete(bm, geom=kill, context='VERTS')
    bm.to_mesh(obj.data); bm.free()

def retexture_trews(person, tid):
    """tartan trews: give the fitted trousers a cylindrical UV projection per leg and the tartan material"""
    import bmesh
    for o, role, _ in person['parts']:
        if role == 'cloth' and 'trouser' in o.name.lower():
            bm = bmesh.new(); bm.from_mesh(o.data); uvl = bm.loops.layers.uv.verify()
            for f in bm.faces:
                sx = 1 if sum(v.co.x for v in f.verts) > 0 else -1
                cx = sx * 0.09
                th0 = math.atan2(f.verts[0].co.y, f.verts[0].co.x - cx)
                for l in f.loops:
                    th = math.atan2(l.vert.co.y, l.vert.co.x - cx)
                    while th - th0 > math.pi: th -= 2 * math.pi
                    while th - th0 < -math.pi: th += 2 * math.pi
                    l[uvl].uv = (th * 0.07 / 0.96, l.vert.co.z / 0.96)
            bm.to_mesh(o.data); bm.free()
            o.data.materials.clear(); o.data.materials.append(tartan_material(tid))
            person.setdefault('keepmat', set()).add(id(o))

def add_garments(person):
    spec = person['spec']
    th = person['rig'].data.bones['thigh_l'].head_local
    person['human']['_thx'] = th.x; person['sl'] = 1.0 if th.x > 0 else -1.0
    if spec.get('trews') is not None: retexture_trews(person, spec['trews'])
    for o, role, _ in person['parts']:   # first: the kilt is fitted round the cut top's hem (waist_slab)
        if spec.get('cut') and role == 'cloth' and spec['cut'][0] in o.name:
            o['_thx'] = person['human']['_thx']; cut_below(o, person['rig'].data.bones['pelvis'].head_local.z + spec['cut'][1])
    kd = spec.get('kilt')
    if kd:
        zt, zh = build_skirt(person, kd)
        build_belt_sporran(person, kd, zt)
        if kd.get('hose'): build_hose(person, kd, zh)
    if spec.get('sash') is not None: build_sash(person, spec['sash'])
    if spec.get('lycra'): paint_lycra(person, *spec['lycra'])
    if spec.get('baggy'): widen_jeans(person, spec['baggy'])
    if spec.get('tuck'): tuck_waist(person, *spec['tuck'])
    # the height the person is scaled to (fit_height) is to the top of the head or hair, not of a hat made here
    hat = spec.get('hat')
    if hat: person['crown'] = max(v.co.z for o in person_objects(person) for v in o.data.vertices)
    if hat: {'cap': build_cap, 'tophat': build_tophat, 'beret': lambda p, c: build_cap(p, c, beret=True)}[hat[0]](person, hat[1])

# ------------------------------------------------------------------ decimation budget + join
def tri_count(o): return sum(max(1, len(p.vertices) - 2) for p in o.data.polygons)

def decimate(o, ratio, weight_group=None):
    if ratio >= 0.97: return
    select_only([o])
    am = [m for m in o.modifiers if m.type == 'ARMATURE']; rig = am[0].object if am else None
    for m in am: o.modifiers.remove(m)
    if LOD:
        import bmesh
        bm = bmesh.new(); bm.from_mesh(o.data)
        bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=0.0006)
        bmesh.ops.triangulate(bm, faces=bm.faces[:])
        bm.to_mesh(o.data); bm.free()
    dm = o.modifiers.new('dec', 'DECIMATE'); dm.decimate_type = 'COLLAPSE'; dm.ratio = max(0.02, ratio); dm.use_collapse_triangulate = True; dm.delimit = set() if LOD else {'UV'}
    if weight_group: dm.vertex_group = weight_group; dm.vertex_group_factor = float(os.environ.get('DECF', '2.0')); dm.invert_vertex_group = False
    bpy.ops.object.modifier_apply(modifier='dec')
    if LOD and o.type == 'MESH' and not o.get('_body') and 'eyes_new' not in o.name:
        o.data.update(); nrm = {v.index: v.normal.copy() for v in o.data.vertices}
        for v in o.data.vertices: v.co += nrm[v.index] * 0.015
    if rig:
        n = o.modifiers.new('Armature', 'ARMATURE'); n.object = rig

def budget_and_join(person, total):
    parts = [(person['human'], 'body')] + [(o, r) for o, r, _ in person['parts']] + [(o, 'kilt') for o in person.get('extra', [])]
    cnt = {id(o): tri_count(o) for o, _ in parts}
    fixed = {'eyes': 600 if not LOD else 140, 'brows': 192 if not LOD else 70, 'lashes': 260 if not LOD else 0}
    tgt = {}
    left = total - sum(min(fixed[r], cnt[id(o)]) for o, r in parts if r in fixed)
    share = {'body': 0.50, 'hair': 0.12, 'cloth': 0.38}
    ctot = sum(cnt[id(o)] for o, r in parts if r in ('cloth', 'shoe'))
    left -= sum(cnt[id(o)] for o, r in parts if r == 'kilt')
    for o, r in parts:
        if r in fixed: tgt[id(o)] = fixed[r]
        elif r == 'kilt': tgt[id(o)] = cnt[id(o)]
        elif r == 'body': tgt[id(o)] = left * share['body']
        elif r == 'hair': tgt[id(o)] = left * share['hair']
        else: tgt[id(o)] = left * share['cloth'] * cnt[id(o)] / max(1, ctot)
    keep = []
    for o, r in parts:
        if r == 'lashes' and LOD:
            bpy.data.objects.remove(o); continue
        wg = 'keepW' if 'keepW' in o.vertex_groups else None   # paint_lycra: a hem the decimation must keep straight
        if r == 'cloth' and any(w in o.name.lower() for w in ('shoe', 'sneaker', 'boot')): tgt[id(o)] = max(tgt[id(o)], min(cnt[id(o)], 520))
        decimate(o, tgt[id(o)] / max(1, cnt[id(o)]), wg)
        if wg:
            o.vertex_groups.remove(o.vertex_groups[wg])
        keep.append(o)
    # shoes get a floor so they do not turn into blobs
    select_only(keep); bpy.context.view_layer.objects.active = person['human']
    for o in keep: o.select_set(True)
    bpy.ops.object.join()
    me = person['human']; me.name = f"person_{person['spec']['id']}_mesh"; me.data.name = me.name
    rig = person['rig']; rig.name = f"person_{person['spec']['id']}"; rig.data.name = rig.name + '_arm'
    me.parent = rig
    person['mesh'] = me
    return me

def fit_height(person, H):
    me = person['mesh']; rig = person['rig']
    zs = [v.co.z for v in me.data.vertices]; cur = person.get('crown', max(zs)) - min(zs); s = H / cur
    if abs(s - 1) < 0.002: return 1.0
    me.data.transform(Matrix.Scale(s, 4)); me.data.update()
    select_only([rig]); bpy.ops.object.mode_set(mode='EDIT')
    for eb in rig.data.edit_bones: eb.transform(Matrix.Scale(s, 4), scale=True, roll=False)
    bpy.ops.object.mode_set(mode='OBJECT')
    return s

def shift_soles(person):
    me = person['mesh']; rig = person['rig']
    zmin = min(v.co.z for v in me.data.vertices)
    if abs(zmin) > 1e-4:
        for v in me.data.vertices: v.co.z -= zmin
        if 'crown' in person: person['crown'] -= zmin
        select_only([rig]); bpy.ops.object.mode_set(mode='EDIT')
        for eb in rig.data.edit_bones: eb.head.z -= zmin; eb.tail.z -= zmin
        bpy.ops.object.mode_set(mode='OBJECT')
    return zmin

# ------------------------------------------------------------------ clips: our shared clip definitions re-authored on the MPFB game_engine skeleton
FINGERS = ('index', 'middle', 'ring', 'pinky')
def mpfb_angles(angs):
    """angs: {our_bone: [(axis, angle)]} -> {mpfb_bone: [(axis, angle)]}"""
    out = {}
    def put(b, lst, f=1.0):
        out.setdefault(b, []).extend((ax, a * f) for ax, a in lst)
    for bn, lst in angs.items():
        if bn == 'hips': put('pelvis', lst)
        elif bn == 'spine': put('spine_01', lst, 0.55); put('spine_02', lst, 0.45)
        elif bn == 'chest': put('spine_03', lst)
        elif bn == 'neck': put('neck_01', lst)
        elif bn == 'head': put('head', lst)
        elif bn.startswith('clavicle_'): put(bn, lst)
        elif bn.startswith('upperarm_'): put(bn, lst)
        elif bn.startswith('forearm_'): put('lowerarm_' + bn[-1], lst)
        elif bn.startswith('hand_'): put(bn, lst)
        elif bn.startswith('fingers_'):
            s = bn[-1]; cur = [(ax, a) for ax, a in lst if ax == 'x']
            for f in FINGERS:
                for i, sh in ((1, 0.40), (2, 0.35), (3, 0.25)): put(f'{f}_0{i}_{s}', cur, sh * 1.1)
            for i, sh in ((1, 0.35), (2, 0.35), (3, 0.30)): put(f'thumb_0{i}_{s}', cur, sh * 0.6)
        elif bn.startswith('thigh_'): put(bn, lst)
        elif bn.startswith('shin_'): put('calf_' + bn[-1], lst)
        elif bn.startswith('foot_'): put(bn, lst)
    return out

def rot_local(ao, bname, axis, ang):
    bone = ao.data.bones[bname]; R = bone.matrix_local.to_3x3()
    ax = {'x': (1, 0, 0), 'y': (0, 1, 0), 'z': (0, 0, 1)}[axis]
    return (R.inverted() @ Quaternion(ax, ang).to_matrix() @ R).to_quaternion()

def author_clips(ao, clips):
    ad = ao.animation_data_create()
    bones = [b.name for b in ao.data.bones]
    for bn in bones: ao.pose.bones[bn].rotation_mode = 'QUATERNION'
    for name, (frames, fn) in clips.items():
        act = bpy.data.actions.new(name); ad.action = act
        for f in range(frames + 1):
            angs = mpfb_angles(fn(f / frames))
            for bn in bones:
                q = Quaternion((1, 0, 0, 0))
                for axis, a in angs.get(bn, []): q = q @ rot_local(ao, bn, axis, a)
                pb = ao.pose.bones[bn]; pb.rotation_quaternion = q; pb.keyframe_insert('rotation_quaternion', frame=1 + f)
        tr = ad.nla_tracks.new(); tr.name = name; tr.strips.new(name, 1, act); ad.action = None
        for bn in bones: ao.pose.bones[bn].rotation_quaternion = (1, 0, 0, 0)

def unify_rest_orientation(rigs):
    """edit-mode only: give every person's bones the SAME rest orientation (and roll) as person 0 while keeping each bone's own head position and length, so one set of
    rotation-only clips plays identically on everybody.  The mesh is untouched (rest pose = identity pose)."""
    ref = rigs[0]; refm = {b.name: b.matrix_local.to_3x3().copy() for b in ref.data.bones}
    for r in rigs[1:]:
        select_only([r]); bpy.ops.object.mode_set(mode='EDIT')
        for eb in r.data.edit_bones: eb.use_connect = False
        for eb in r.data.edit_bones:
            L = eb.length; head = eb.head.copy(); m = refm[eb.name].to_4x4(); m.translation = head
            eb.matrix = m; eb.length = L; eb.head = head
        bpy.ops.object.mode_set(mode='OBJECT')

def rest_orientation_spread(rigs):
    """max angle (deg) between the same bone's rest orientation in different people (clips are authored once on the first rig)"""
    base = rigs[0]; worst = 0.0; wb = ''
    for r in rigs[1:]:
        for b in base.data.bones:
            if b.name.startswith(('ball', 'Root')): continue
            q = (base.data.bones[b.name].matrix_local.to_3x3().inverted() @ r.data.bones[b.name].matrix_local.to_3x3()).to_quaternion()
            a = math.degrees(q.angle)
            if a > worst: worst, wb = a, b.name
    return worst, wb

# ------------------------------------------------------------------ export + meta
def export_all(path):
    bpy.ops.object.select_all(action='DESELECT')
    kw = dict(filepath=path, export_format='GLB', export_yup=True, export_apply=False, export_materials='EXPORT', export_image_format='AUTO', export_vertex_color='NONE',
              export_cameras=False, export_lights=False, export_skins=True, export_animations=True, export_animation_mode='NLA_TRACKS', export_frame_range=False,
              export_optimize_animation_size=True, export_force_sampling=True)
    try: bpy.ops.export_scene.gltf(**kw)
    except TypeError as e:
        print('TypeError', e)
        for k_ in ('export_optimize_animation_size', 'export_force_sampling', 'export_frame_range'): kw.pop(k_, None)
        bpy.ops.export_scene.gltf(**kw)
    print('EXPORTED', path, round(os.path.getsize(path) / 1e6, 2), 'MB')

def person_meta(person, eye_z):
    spec = person['spec']; me = person['mesh']; rig = person['rig']
    zs = [v.co.z for v in me.data.vertices]; H = max(zs) - min(zs)
    bn = rig.data.bones
    hip = bn['thigh_l'].head_local.z
    shw = abs(bn['upperarm_l'].head_local.x)
    drop = hip - SEAT_HIP
    extra = {'rare': spec['rare']} if spec.get('rare') else {}   # rare: the crowd picker takes this person only that fraction of the times they come up
    return dict(**extra, id=spec['id'], kind=spec['kind'], outfit=spec['outfit'], source='mpfb2', heightM=round(H, 3), shoulderWidthM=round(2 * shw + 0.09, 3), eyeHeightM=round(eye_z, 3),
                seatRootDropM=round(drop, 3), seatedEyeHeightM=round(eye_z - drop, 3), seatedHeadTopM=round(H - drop, 3), hipHeightM=round(hip, 3), legLengthM=round(hip, 3),
                walkSpeedMps=round(4 * hip * math.sin(0.40) / 1.0, 2), walkFastSpeedMps=round(4 * hip * math.sin(0.52) / (19 / 24), 2), tris=tri_count(me))

def main():
    import assets_people as AP
    mpfb_setup()
    specs = [p for p in PEOPLE if not ARGS or p['id'] in ARGS]
    people = []; metas = {}
    total = 2600 if LOD else 9500
    maxpx = 256 if LOD else 512
    for spec in specs:
        pr = build_person(spec)
        assign_materials(pr, maxpx=maxpx)
        orient_and_apose(pr)
        add_garments(pr)
        eyes = [o for o, r, _ in pr['parts'] if r == 'eyes'][0]
        eye_z = sum(v.co.z for v in eyes.data.vertices) / len(eyes.data.vertices)
        budget_and_join(pr, total)
        zmin = shift_soles(pr)
        sc = fit_height(pr, spec['H'])
        pr['eye_z'] = (eye_z - zmin) * sc
        people.append(pr)
        metas[spec['id']] = person_meta(pr, pr['eye_z'])
        print(spec['id'], metas[spec['id']]['heightM'], 'tris', metas[spec['id']]['tris'])
    clips = AP.clip_defs()
    names = list(clips.keys())
    unify_rest_orientation([p['rig'] for p in people])
    author_clips(people[0]['rig'], clips)
    worst, wb = rest_orientation_spread([p['rig'] for p in people])
    print('rest orientation spread (deg)', round(worst, 2), wb)
    path = os.path.join(OUTDIR, 'people_lod.glb' if LOD else 'people.glb')
    os.makedirs(OUTDIR, exist_ok=True)
    export_all(path)
    AP.quantize_glb(path, strip_trs=True)
    if not LOD:
        for m in metas.values(): m['clips'] = names
        out = dict(note='Source: MPFB2 (MakeHuman) bodies, CC0 targets/assets plus CC-BY clothes (see models/CREDITS.md). Heights are total standing heights (soles = 0), all <= 1.80 m. Headroom: train centre-line headroom 1.88 m, 1.68 m above the bench fronts. Seated: root.y = seatFloorY - seatRootDropM (clips sit_* are rotation-only).',
                   source='mpfb2', rig='game_engine', seatTopM=SEAT_TOP, seatHipM=SEAT_HIP, loopClips=[c for c in names if c not in AP.ONE_SHOT], oneShotClips=sorted(AP.ONE_SHOT), fps=24,
                   clipFrames={n: clips[n][0] for n in names}, restOrientationSpreadDeg=round(worst, 2),
                   lod=dict(file='people_lod.glb', trisPerPerson=2600, textures='512 px', note='same node names, rig and clips; use beyond ~12 m'),
                   people=list(metas.values()))
        json.dump(out, open(os.path.join(OUTDIR, 'people_meta.json'), 'w'), indent=1)
    if '--blend' in sys.argv: bpy.ops.wm.save_as_mainfile(filepath=os.path.join(SCRATCH, 'out', 'people_all.blend'))

if __name__ == '__main__':
    main()
