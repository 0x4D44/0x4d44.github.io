"""Shared Blender (bpy) helpers for the La Ladera people builder (A4). Trimmed from glasgow-subway/tools/assets_lib.py.
Blender frame: X east/right, Y forward, Z up. glTF export (+Y up) maps Blender Y -> glTF -Z (a person faces glTF -Z... see people_build.py header).
Units: metres.  Run:  blender --background --factory-startup --python tools/blender/people_build.py -- [ids...] [--lod]
"""
import bpy, bmesh, math, os, sys
from mathutils import Vector, Matrix

# Blender's bundled Python has numpy but not PIL. The system Python 3.13 (same ABI) has PIL in its user site: borrow it.
for _p in (os.environ.get('PEOPLE_PYSITE'), os.path.join(os.environ.get('APPDATA', ''), 'Python', 'Python313', 'site-packages')):
    if _p and os.path.isdir(_p) and _p not in sys.path: sys.path.append(_p)

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))                     # la-ladera/
OUT = os.path.join(ROOT, 'assets', 'models', 'people')
SCRATCH = os.environ.get('PEOPLE_SCRATCH') or os.path.abspath(os.path.join(ROOT, '..', '.scratch', 'a4', 'work'))
os.makedirs(OUT, exist_ok=True); os.makedirs(SCRATCH, exist_ok=True)


def argv_after_dashes():
    """Arguments after the `--` that separates Blender's own arguments from the script's."""
    a = sys.argv
    return a[a.index('--') + 1:] if '--' in a else a[1:]


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def empty(name, loc=(0, 0, 0), parent=None, rot=(0, 0, 0), kind='PLAIN_AXES', size=0.1):
    e = bpy.data.objects.new(name, None); e.empty_display_type = kind; e.empty_display_size = size
    bpy.context.scene.collection.objects.link(e)
    e.location = loc; e.rotation_euler = rot
    if parent: e.parent = parent
    return e


def group(name, loc=(0, 0, 0), parent=None):
    return empty(name, loc, parent, kind='ARROWS', size=0.3)
