"""people.glb from MPFB2 (MakeHuman Plugin For Blender, GPL code; MakeHuman targets / assets CC0 or CC-BY, see models/CREDITS.md).
Headless bpy 5.2: creates parametric MakeHuman bodies with the MPFB API, fits eyes / brows / lashes / hair / clothes from the MakeHuman asset packs, adds our own tartan kilts and
Highland garments, converts to a straight-arm rest pose, re-authors the shared animation clips (names from assets_people.clip_defs) on the MPFB `game_engine` skeleton and exports glTF.

Run:  HOME=<scratch>/mpfb/home python tools/assets_people_mpfb.py [--lod] [--out DIR] [id ...]
The MPFB extension + asset packs live OUTSIDE the repo (MPFB_DATA / HOME below).  This file contains only our own code."""
import bpy, sys, os, math, json, random, zlib
import addon_utils
from mathutils import Vector, Matrix, Quaternion
sys.path.insert(0, os.path.dirname(__file__))

SCRATCH = '/tmp/claude-0/-home-user/52020da6-bb97-5dd3-88b8-ef2e78784739/scratchpad/mpfb'
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
    dict(id='man_elder', kind='elder', outfit='trousers', H=1.68, gender=1, age=0.88, weight=0.55, muscle=0.35, race=(0.0, 1.0, 0.0), skin='old_caucasian_male', eye='grey', brows='eyebrow008', lashes=None, hair='short04', hair_col='#d0d0d0',
         clothes=['mindfront_knitted_sweater_01', 'mindfront_male_trousers_1', 'mindfront_shoes_oxford_male']),
    dict(id='man_puffer', kind='man', outfit='trousers', H=1.76, gender=1, age=0.42, weight=0.5, muscle=0.55, race=(0.05, 0.05, 0.9), skin='young_african_male', eye='brown', brows='eyebrow003', lashes=None, hair='short02', hair_col='#17120e',
         clothes=['male_casualsuit04', 'culturalibre_sneakers']),
    dict(id='man_beard', kind='man', outfit='trousers', H=1.75, gender=1, age=0.52, weight=0.6, muscle=0.55, race=(0.1, 0.3, 0.6), skin='middleage_african_male', eye='brown', brows='eyebrow005', lashes=None, hair='short03', hair_col='#241812',
         clothes=['mindfront_knitted_sweater_02', 'punkduck_male_classic_jeans', 'toigo_ankle_boots_male']),
    dict(id='staff_hivis', kind='staff', outfit='trousers', H=1.78, gender=1, age=0.45, weight=0.5, muscle=0.5, race=(0.0, 1.0, 0.0), skin='young_caucasian_male', eye='blue', brows='eyebrow002', lashes=None, hair='short01', hair_col='#3a281c',
         clothes=['male_worksuit01', 'toigo_ankle_boots_male'], tint=(1.0, 0.95, 0.12)),
    dict(id='man_student', kind='man', outfit='trousers', H=1.80, gender=1, age=0.34, weight=0.4, muscle=0.4, race=(0.6, 0.3, 0.1), skin='young_asian_male', eye='brown', brows='eyebrow001', lashes=None, hair='short02', hair_col='#241812',
         clothes=['elvs_male_boho_top1', 'punkduck_male_classic_jeans', 'elvs_zombie_killer_sneakers']),
    dict(id='woman_coat', kind='woman', outfit='trousers', H=1.67, gender=0, age=0.52, weight=0.45, muscle=0.4, race=(0.0, 1.0, 0.0), skin='middleage_caucasian_female', eye='brown', brows='eyebrow007', lashes='eyelashes02', hair='long01', hair_col='#6d4a2c',
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
def load_image(path, maxpx, alpha=False, quality=80, srgb=True):
    """resized copy (PIL) -> bpy image; opaque maps become JPEG, alpha maps PNG; cached so shared textures are embedded once"""
    from PIL import Image
    key = (path, maxpx, alpha)
    if key in IMG_CACHE: return IMG_CACHE[key]
    if not os.path.exists(path): return None
    im = Image.open(path)
    if max(im.size) > maxpx:
        s = maxpx / max(im.size); im = im.resize((max(8, int(im.size[0] * s)), max(8, int(im.size[1] * s))), Image.LANCZOS)
    base = os.path.splitext(os.path.relpath(path, DATA).replace(os.sep, '_'))[0] + f'_{maxpx}'
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
def make_material(name, diffuse=None, normal=None, alpha=False, rough=0.6, tint=None, color=(0.8, 0.8, 0.8), spec=0.3, maxpx=1024, nmaxpx=512, metal=0.0, cull=False):
    key = (name, diffuse, normal, alpha, rough, tint, color, maxpx)
    if key in MAT_CACHE: return MAT_CACHE[key]
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; bs = nt.nodes['Principled BSDF']
    bs.inputs['Roughness'].default_value = rough; bs.inputs['Metallic'].default_value = metal
    for nm in ('Specular IOR Level', 'Specular'):
        if nm in bs.inputs: bs.inputs[nm].default_value = spec
    m.use_backface_culling = False
    img = load_image(diffuse, maxpx, alpha=alpha) if diffuse else None
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
    hb = body_height(h0)
    me = h0.data; bpy.data.objects.remove(h0); bpy.data.meshes.remove(me)
    k = (spec['H'] - 0.02) / hb
    human = HumanService.create_human(macro_detail_dict=md, scale=0.1 * k)
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
            o.data.materials.append(make_material('alpha_hair_' + os.path.basename(tex) + spec['hair_col'], os.path.join(mh['_dir'], tex), None, alpha=True, rough=0.55, spec=0.3, maxpx=512,
                                                  tint=tuple(lin(c) for c in hex_rgb(spec['hair_col']))))
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

def slab(human, z, band=0.012, side=0):
    """extents of the body surface around height z: (xmin, xmax, ymin, ymax); side=-1/+1 restricts to one leg"""
    xs = []; ys = []
    lim = abs(human.get('_thx', 0.1)) + 0.085
    for v in human.data.vertices:
        c = v.co
        if abs(c.z - z) < band and abs(c.x) < lim and (side == 0 or c.x * side > 0): xs.append(c.x); ys.append(c.y)
    if not xs: return (-0.15, 0.15, -0.1, 0.1)
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
    n = 72; NR = 7
    cen = lambda z: slab(human, z)
    rings = []
    def ring_at(z, t, inner=0.0):
        xmn, xmx, ymn, ymx = cen(z)
        rx = max(abs(xmn), abs(xmx)) + 0.016 + prm['flare'] * t ** 1.3; ry = (ymx - ymn) / 2 + 0.014 + prm['flare'] * 0.8 * t ** 1.3; cy = (ymx + ymn) / 2
        fade = min(1.0, max(0.0, (t - 0.04) / 0.35)); fade = fade * fade * (3 - 2 * fade)
        out = []
        for i in range(n):
            th = 2 * math.pi * i / n
            phi = ((th - math.pi / 2 + math.pi) % (2 * math.pi)) - math.pi          # 0 = front (+y after orient)
            off = 0.0
            if abs(phi) > prm['apron'] and prm['amp'] > 0:
                pp = (abs(phi) - prm['apron']) / (math.pi - prm['apron'] + 1e-9) * prm['npl']; fr = pp - math.floor(pp)
                off = prm['amp'] * (fr / 0.78 if fr < 0.78 else (1 - fr) / 0.22) * fade
            out.append(Vector(((rx + off - inner) * math.cos(th), cy + (ry + off - inner) * math.sin(th), z)))
        return out
    for i in range(NR): rings.append(ring_at(zt + (zh - zt) * i / (NR - 1), i / (NR - 1)))
    rings.append(ring_at(zh, 1.0, prm['thick'])); rings.append(ring_at(zt, 0.0, prm['thick']))
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
    person['kilt_zt'] = zt; person['kilt_zh'] = zh
    return zt, zh

def build_belt_sporran(person, kd, zt):
    import bmesh
    human = person['human']; H = person['spec']['H']; k = H / 1.75
    xmn, xmx, ymn, ymx = slab(human, zt)
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
        zc = zt - 0.21 * k; yfront = slab(human, zc)[3] + 0.040
        for (cx, cy, cz, rx, ry, rz, col) in ((0, yfront, zc, 0.055 * k, 0.024 * k, 0.078 * k, '#5b4a3a'), (0, yfront + 0.010, zc + 0.043 * k, 0.044 * k, 0.018 * k, 0.030 * k, '#b8bcc4')):
            bmesh.ops.create_uvsphere(bm, u_segments=12, v_segments=8, radius=1.0, matrix=Matrix.Translation((cx, cy, cz)) @ Matrix.Diagonal((rx, ry, rz, 1.0)))
        bm.faces.ensure_lookup_table()
        for tx in (-0.03, -0.015, 0.0, 0.015, 0.03):
            for z_ in (zc - 0.06 * k, zc - 0.11 * k):
                bm.verts.new((tx * k, yfront + 0.006, z_))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
        def sw(co):
            t = max(0.0, min(1.0, (zt - co.z) / 0.4)); wr = max(0.0, min(1.0, 0.5 + person['sl'] * co.x / 0.09))
            return [('pelvis', 0.6), ('spine_01', 0.2), ('thigh_l', 0.2 * wr * t), ('thigh_r', 0.2 * (1 - wr) * t)]
        new_part(person, 'sporran', bm, solid_material('sporran', hex_rgb('#5b4a3a'), 0.9), sw)

def build_hose(person, kd, zh):
    import bmesh
    rig = person['rig']; H = person['spec']['H']; k = H / 1.75
    colr, cuff = kd['hose']; bn = rig.data.bones
    bm = bmesh.new(); cb = bmesh.new(); seg = 18
    knee_z = bn['calf_l'].head_local.z; ankle_z = bn['foot_l'].head_local.z
    ztop = zh + 0.03; zbot = ankle_z + 0.06 * k
    for sn in ('l', 'r'):
        kh = bn['calf_' + sn].head_local; ah = bn['foot_' + sn].head_local
        def ctr(z):
            t = max(0.0, min(1.0, (kh.z - z) / max(1e-6, kh.z - ah.z)))
            return kh.x + (ah.x - kh.x) * t, kh.y + (ah.y - kh.y) * t - 0.0, 0.066 * k - 0.024 * k * t
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
    kd = spec.get('kilt')
    if kd:
        zt, zh = build_skirt(person, kd)
        build_belt_sporran(person, kd, zt)
        if kd.get('hose'): build_hose(person, kd, zh)
    if spec.get('sash') is not None: build_sash(person, spec['sash'])
    for o, role, _ in person['parts']:
        if spec.get('cut') and role == 'cloth' and spec['cut'][0] in o.name:
            o['_thx'] = person['human']['_thx']; cut_below(o, person['rig'].data.bones['pelvis'].head_local.z + spec['cut'][1])

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
        wg = None
        if r == 'cloth' and any(w in o.name.lower() for w in ('shoe', 'sneaker', 'boot')): tgt[id(o)] = max(tgt[id(o)], min(cnt[id(o)], 520))
        decimate(o, tgt[id(o)] / max(1, cnt[id(o)]), wg)
        if wg:
            o.vertex_groups.remove(o.vertex_groups['faceW'])
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
    zs = [v.co.z for v in me.data.vertices]; cur = max(zs) - min(zs); s = H / cur
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
    return dict(id=spec['id'], kind=spec['kind'], outfit=spec['outfit'], source='mpfb2', heightM=round(H, 3), shoulderWidthM=round(2 * shw + 0.09, 3), eyeHeightM=round(eye_z, 3),
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
