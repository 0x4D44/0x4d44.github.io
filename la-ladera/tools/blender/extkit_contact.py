"""Render actual exterior-kit GLBs and decoded shipped PBR maps, offline only.

The contact images use individually framed orthographic cameras. The two
illustrative facade/roof views use perspective cameras exactly1.60m above their
respective walking surfaces. No game module or asset registry is imported.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

import bpy
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
sys.path.insert(0, str(HERE))
import furn_lib as F
from substation2_contact import descendants, visible, flat, figure, look, clone, setup


def bind_pbr(name, paths, vertex_colour=False, flip_v=False, normal_strength=1):
    matches = [m for m in bpy.data.materials if m.name == name or m.name.startswith(name + ".")]
    if not matches:
        matches = [bpy.data.materials.new(name)]
    for mat in matches:
        mat.use_nodes = True
        nodes, links = mat.node_tree.nodes, mat.node_tree.links
        nodes.clear()
        output = nodes.new("ShaderNodeOutputMaterial")
        shader = nodes.new("ShaderNodeBsdfPrincipled")
        links.new(shader.outputs["BSDF"], output.inputs["Surface"])
        uv = nodes.new("ShaderNodeTexCoord").outputs["UV"]
        if flip_v:
            flip = nodes.new("ShaderNodeVectorMath")
            flip.operation = "MULTIPLY_ADD"
            flip.inputs[1].default_value = (1, -1, 1)
            flip.inputs[2].default_value = (0, 1, 0)
            links.new(uv, flip.inputs[0])
            uv = flip.outputs["Vector"]
        tex = {}
        for channel, path in paths.items():
            node = tex[channel] = nodes.new("ShaderNodeTexImage")
            node.image = bpy.data.images.load(str(path), check_existing=True)
            node.extension = "EXTEND" if flip_v else "REPEAT"
            if channel != "map":
                node.image.colorspace_settings.name = "Non-Color"
            links.new(uv, node.inputs["Vector"])
        colour = tex["map"].outputs["Color"]
        if vertex_colour:
            attr = nodes.new("ShaderNodeVertexColor")
            attr.layer_name = "Col"
            multiply = nodes.new("ShaderNodeMixRGB")
            multiply.blend_type = "MULTIPLY"
            multiply.inputs[0].default_value = 1
            links.new(colour, multiply.inputs[1])
            links.new(attr.outputs["Color"], multiply.inputs[2])
            colour = multiply.outputs[0]
        channels = nodes.new("ShaderNodeSeparateColor")
        links.new(tex["orm"].outputs["Color"], channels.inputs["Color"])
        # Blender has no separate AO socket: multiply ambient occlusion into
        # the colour for this offline preview, as the binding notes disclose.
        ao = nodes.new("ShaderNodeMixRGB")
        ao.blend_type = "MULTIPLY"
        ao.inputs[0].default_value = 1
        links.new(colour, ao.inputs[1])
        links.new(channels.outputs["Red"], ao.inputs[2])
        links.new(ao.outputs[0], shader.inputs["Base Color"])
        links.new(channels.outputs["Green"], shader.inputs["Roughness"])
        links.new(channels.outputs["Blue"], shader.inputs["Metallic"])
        normal = nodes.new("ShaderNodeNormalMap")
        normal.inputs["Strength"].default_value = normal_strength
        links.new(tex["normal"].outputs["Color"], normal.inputs["Color"])
        links.new(normal.outputs["Normal"], shader.inputs["Normal"])
    return matches[0]


def load_materials(models, decoded, decode_python):
    lib = models / "extkit"
    data = json.loads((lib / "materials.json").read_text())
    # Blender's bundled Python intentionally does not need Pillow. Decode the
    # shipped BC blocks through the normal system-Python image environment.
    code = """import json,sys
from pathlib import Path
sys.path.insert(0, sys.argv[3])
from extkit_texture_codec import decode_ktx2
lib,out=Path(sys.argv[1]),Path(sys.argv[2])
for wall in json.loads((lib/'materials.json').read_text())['walls']:
 for channel in ('map','normal','orm'):
  source=(lib/wall[channel]).resolve()
  decode_ktx2(source).save(out/(source.stem+'.png'))
print('Decoded36 shipped KTX2 wall maps for Blender review.')
"""
    subprocess.run([decode_python, "-c", code, str(lib), str(decoded), str(HERE)],
                   check=True, stdin=subprocess.DEVNULL, timeout=180,
                   creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    atlas = {k: (lib / data["atlas"][k]).resolve() for k in ("map", "normal", "orm")}
    for name in data["materials"]:
        bind_pbr(name, atlas, vertex_colour=True, flip_v=True, normal_strength=.5)
    for mesh in bpy.data.meshes:
        if mesh.color_attributes and mesh.color_attributes.active_color:
            mesh.color_attributes.active_color.name = "Col"
        else:
            # glTF treats an absent COLOR_0 as white. Blender's Vertex Color
            # node instead returns black for a missing attribute, so supply
            # the standard white multiplier on the imported preview copy.
            colour = mesh.color_attributes.new(name="Col", type="FLOAT_COLOR", domain="CORNER")
            mesh.color_attributes.active_color = colour
            colour.data.foreach_set("color", [1.0, 1.0, 1.0, 1.0] * len(mesh.loops))
    walls = {}
    for wall in data["walls"]:
        paths = {}
        for channel in ("map", "normal", "orm"):
            source = (lib / wall[channel]).resolve()
            path = decoded / (source.stem + ".png")
            paths[channel] = path
        walls[wall["id"]] = bind_pbr(wall["id"], paths)
    return walls


def mesh_bounds(root):
    points = [o.matrix_world @ Vector(corner) for o in descendants(root)
              if o.type == "MESH" for corner in o.bound_box]
    if not points:
        raise RuntimeError("No mesh geometry in " + root.name)
    return points


def contact_shots(args, scene, camera, roots, catalogue, manifest):
    scene.render.resolution_x = 480
    scene.render.resolution_y = 400
    scene.cycles.samples = args.samples
    camera.data.type = "ORTHO"
    records = []
    selected = set(args.only.split(",")) if args.only else None
    for item in catalogue["assets"]:
        if selected and item["id"] not in selected:
            continue
        for lod in (False, True):
            key = item["id"] + ("_lod1" if lod else "")
            root = roots[key]
            visible(root, True)
            bpy.context.view_layer.update()
            points = mesh_bounds(root)
            lo = Vector([min(p[k] for p in points) for k in range(3)])
            hi = Vector([max(p[k] for p in points) for k in range(3)])
            centre = (lo + hi) / 2
            diameter = max(hi - lo)
            camera.location = centre + Vector((.65, -1.2, .72)) * max(2, diameter * 2)
            look(camera, centre)
            camera.data.ortho_scale = max(.15, diameter * 1.45)
            for _ in range(60):
                bpy.context.view_layer.update()
                projected = [world_to_camera_view(scene, camera, p) for p in points]
                if all(.075 <= p.x <= .925 and .075 <= p.y <= .925 for p in projected):
                    break
                camera.data.ortho_scale *= 1.06
            else:
                raise RuntimeError("Contact framing failed for " + key)
            path = args.out / (key + ".png")
            scene.render.filepath = str(path)
            bpy.ops.render.render(write_still=True)
            metadata = next(f["assets"][key] for f in manifest["files"] if key in f["assets"])
            records.append({"id": key, "baseId": item["id"], "label": item.get("label", item["id"]),
                            "file": path.name, "size": item["size"], "lod": lod,
                            "triangles": metadata["triangles"], "camera": "orthographic; independently framed",
                            "cameraGame": [camera.location.x, camera.location.z, -camera.location.y]})
            visible(root, False)
            print("RENDERED " + key, flush=True)
    (args.out / "contact-report.json").write_text(json.dumps(records, ensure_ascii=False, indent=2) + "\n")


def facade_box(collection, name, position, size, material):
    """Unshipped review-only architecture with metre-scaled planar UVs."""
    x, y, z = position
    w, h, d = size
    bpy.ops.mesh.primitive_cube_add(size=1, location=F.to_blender((x, y + h / 2, z)))
    obj = bpy.context.object
    obj.name = "review_" + name
    obj.dimensions = (w, d, h)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    for old in list(obj.users_collection):
        old.objects.unlink(obj)
    collection.objects.link(obj)
    obj.data.materials.append(material)
    uv = obj.data.uv_layers.active or obj.data.uv_layers.new(name="UVMap")
    for polygon in obj.data.polygons:
        axis = max(range(3), key=lambda k: abs(polygon.normal[k]))
        for loop_id in polygon.loop_indices:
            p = obj.data.vertices[obj.data.loops[loop_id].vertex_index].co
            value = (p.y / 2, p.z / 2) if axis == 0 else (p.x / 2, p.z / 2) if axis == 1 else (p.x / 2, p.y / 2)
            uv.data[loop_id].uv = value
    return obj


def review_views(args, scene, camera, roots, walls, floor):
    collection = bpy.data.collections.new("extkit_offline_review")
    scene.collection.children.link(collection)
    placements = []
    backdrop = flat("review_window_shadow", (.025, .034, .035), .94)
    concrete = walls["extkit_wall_panete"]
    teal = walls["extkit_wall_turquesa"]
    rose = walls["extkit_wall_rosado"]
    brick = walls["extkit_wall_tolete"]
    white = walls["extkit_wall_cal"]
    catalogue = {a["id"]: a for a in json.loads((HERE / "extkit.catalog.json").read_text())["assets"]}

    def place(key, position, yaw=0, name=None):
        if key not in roots:
            raise ValueError("Unknown exported review asset " + key)
        obj = clone(roots[key], collection, name or "review_" + str(len(placements)))
        obj.location = F.to_blender(position)
        obj.rotation_mode = "XYZ"
        obj.rotation_euler = (0, 0, yaw)
        placements.append({"asset": key, "position": list(position), "rotationY": yaw})
        return obj

    def mount(key, x, y, wall_z, clearance=None):
        item = catalogue[key]
        rear = item["anchors"]["position"][2]
        if item["family"] == "plant":
            # The catalogue gives a foliage-inclusive clearance plane. This
            # illustrative fitting uses the actual solid ledge rear instead,
            # with foliage allowed to touch the supporting wall.
            solid = []
            for obj in descendants(roots[key]):
                if obj.type != "MESH":
                    continue
                if any(s.material and s.material.name.split(".")[0] in ("extkit_steel", "extkit_concrete")
                       for s in obj.material_slots):
                    solid.extend(-(obj.matrix_world @ vertex.co).y for vertex in obj.data.vertices)
            rear = min(solid)
        gap = item["anchors"]["wallClearance"] if clearance is None else clearance
        return place(key, (x, y, wall_z + gap - rear))

    facade_box(collection, "rear_wall", (0, 0, -1.65), (6, 3.2, .2), teal)
    facade_box(collection, "side_wall", (-3.1, 0, -3), (.2, 3.2, 2.9), brick)
    facade_box(collection, "roof_slab", (0, 3.2, -3), (6.4, .16, 3.2), concrete)
    facade_box(collection, "neighbor", (4.65, 0, -2.6), (3.1, 2.8, .22), rose)
    facade_box(collection, "neighbor_roof", (4.65, 2.8, -3.3), (3.3, .15, 1.6), concrete)
    for x, grille in [(-.8, "extkit_grille_3"), (1.15, "extkit_grille_7")]:
        facade_box(collection, "window", (x, 1.18, -1.53), (1.13, 1.12, .025), backdrop)
        mount(grille, x, 1.13, -1.55)
    facade_box(collection, "door_shadow", (3.95, .02, -2.47), (1.0, 2.3, .035), backdrop)
    mount("extkit_shutter_100", 3.95, 2.3, -2.49)
    mount("extkit_chalkboard", .18, .9, -1.55)
    mount("extkit_meter_1", -2.35, 1.1, -1.55)
    place("extkit_gas_cage_2", (-2.15, .02, -.89))
    for y in (.15, 1.15, 2.15):
        mount("extkit_drain_straight", 2.68, y, -1.55)
    for y in (.55, 2.30):
        mount("extkit_drain_bracket", 2.68, y, -1.55)
    mount("extkit_drain_elbow", 2.57, .03, -1.55)
    mount("extkit_plant_geranium", -.8, 1.05, -1.55, .005)
    mount("extkit_plant_pothos", 1.15, 1.05, -1.55, .005)
    mount("extkit_plant_sansevieria", 5.78, .65, -2.49, .005)
    place("extkit_tank_1000_blue_steel", (-1.6, 3.36, -3.25))
    place("extkit_tank_500_black_block", (1.6, 3.36, -3.65))
    mount("extkit_laundry_balcony", .6, 2.5, -1.55)
    facade_box(collection, "dish_support", (2.2, 3.36, -2.7), (.32, .42, .4), concrete)
    mount("extkit_dish_68", 2.2, 3.49, -2.5)
    place("extkit_aerial_yagi", (-2.5, 3.36, -2.8))
    for x, z in [(-2.9, -1.9), (2.9, -1.9), (-2.9, -4.1)]:
        place("extkit_rebar_110_heavy", (x, 3.36, z))
    facade_box(collection, "neighbor_lattice_shadow", (5.45, 1.35, -2.45), (1.12, 1.1, .02), backdrop)
    mount("extkit_lattice_diamond", 5.45, 1.3, -2.49)
    for i in range(8):
        facade_box(collection, "stair", (-4.0, 0, -.7 - i * .4), (1.4, .14 * (i + 1), .4), concrete)
    # Cables are real references to the short exported segment, oriented and
    # scaled along this illustrative sag. No long cable mesh is authored.
    mount("extkit_pipe_bracket", 2.85, 2.87, -1.55)
    mount("extkit_pipe_bracket", 5.7, 2.47, -2.49)
    # Keep the sag in front of both walls and through their open gap.
    start, end = Vector((2.85, 2.94, -1.33)), Vector((5.7, 2.54, -2.27))
    segments = 10
    for i in range(segments):
        pts = []
        for t in (i / segments, (i + 1) / segments):
            p = start.lerp(end, t)
            p.y -= .52 * 4 * t * (1 - t)
            pts.append(p)
        delta = pts[1] - pts[0]
        obj = place("extkit_cable_bundle", (pts[0] + pts[1]) / 2)
        direction = Vector(F.to_blender(delta))
        obj.rotation_mode = "QUATERNION"
        obj.rotation_quaternion = Vector((1, 0, 0)).rotation_difference(direction.normalized())
        obj.scale.x = delta.length / .5
    person = figure()
    person.location = F.to_blender((3.0, 0, .2))
    scene.render.resolution_x = 1600
    scene.render.resolution_y = 1100
    scene.cycles.samples = max(24, args.samples)
    scene.world.node_tree.nodes.get("Background").inputs["Strength"].default_value = .8
    scene.view_settings.exposure = .35
    camera.data.type = "PERSP"
    camera.data.lens = 33
    camera.location = F.to_blender((8.4, 1.6, 8.0))
    look(camera, F.to_blender((.9, 2.15, -2.0)))
    scene.render.filepath = str(args.out / "facade-eye-1_6m.png")
    bpy.ops.render.render(write_still=True)
    first = {"file": "facade-eye-1_6m.png", "cameraGame": [8.4, 1.6, 8.0],
             "walkingSurfaceY": 0, "eyeHeightMetres": 1.6, "placedAssets": list(placements)}
    visible(person, False)
    for obj in list(collection.objects):
        obj.hide_render = True

    # A separate roof-level test assembly: eye height is relative to its slab.
    placements.clear()
    # Keep the studio ground below the slab, not coincident with its top face.
    floor.location.z = -.19
    # The walking slab includes the camera's foot point, so the reported
    # 1.60m eye height is measured above a real review surface.
    facade_box(collection, "roof_test", (0, -.18, 0), (12, .18, 14), concrete)
    facade_box(collection, "parapet_back", (0, 0, -3.4), (8, .65, .16), brick)
    facade_box(collection, "parapet_left", (-3.95, 0, 0), (.16, .65, 7), white)
    facade_box(collection, "roof_service_wall", (-1.7, 0, -2.6), (3.3, 2.25, .16), walls["extkit_wall_amarillo_ocre"])
    place("extkit_tank_2000_black_block", (-2.1, 0, -1.2))
    place("extkit_tank_1000_blue_raised", (.6, 0, -1.8))
    place("extkit_laundry_pole", (1.4, 0, .65), -.22)
    place("extkit_laundry_roof", (1.6, 0, -2.7))
    mount("extkit_dish_92", -3.25, .25, -3.32)
    place("extkit_aerial_bowtie", (2.7, .66, -3.35))
    for x, z, key in [(-3.5, 2.5, "extkit_rebar_55_light"), (-3.5, -2.6, "extkit_rebar_180_heavy"),
                      (3.5, -2.7, "extkit_rebar_110_light")]:
        place(key, (x, 0, z))
    mount("extkit_plant_aloe", -2.4, .62, -2.52, .005)
    mount("extkit_plant_fern", -1.1, .62, -2.52, .005)
    mount("extkit_lattice_flower", -1.8, .9, -2.52)
    camera.data.lens = 30
    camera.location = F.to_blender((5.0, 1.6, 6.1))
    look(camera, F.to_blender((-.2, 1.25, -.8)))
    scene.render.filepath = str(args.out / "roof-eye-1_6m.png")
    bpy.ops.render.render(write_still=True)
    second = {"file": "roof-eye-1_6m.png", "cameraGame": [5.0, 1.6, 6.1],
              "walkingSurfaceY": 0, "eyeHeightMetres": 1.6, "placedAssets": list(placements)}
    report = {"source": "Actual exported GLB roots and decoded shipped atlas/KTX2 textures",
              "runtimeIntegrationTested": False,
              "notes": ["Review-only architecture is procedural and not shipped in the library.",
                        "Wall BC5 normal Z is reconstructed from compressed XY.",
                        "AO multiplies preview albedo because Blender has no separate AO input.",
                        "Plant review placement uses solid ledge backs; catalogue anchors include rear foliage.",
                        "Cables reuse short GLB segment geometry; instances use a quadratic illustrative sag."],
              "views": [first, second]}
    (args.out / "eye-view-report.json").write_text(json.dumps(report, indent=2) + "\n")


def main():
    if not bpy.app.background or bpy.app.version[0] != 5:
        raise RuntimeError("Use Blender5.x --background --threads2")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--models", type=Path, default=ROOT / "assets/models")
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--samples", type=int, default=8)
    parser.add_argument("--decode-python", default=shutil.which("python3") or "python3")
    parser.add_argument("--only")
    parser.add_argument("--views-only", action="store_true")
    parser.add_argument("--contacts-only", action="store_true")
    args = parser.parse_args(F.argv_after_dashes())
    args.out = args.out.resolve()
    args.out.mkdir(parents=True, exist_ok=True)
    F.reset()
    manifest = json.loads((args.models / "manifest.extkit.json").read_text())
    catalogue = json.loads((HERE / "extkit.catalog.json").read_text())
    sources = [args.models / "manifest.extkit.json", args.models / "extkit/materials.json", HERE / "extkit.catalog.json"]
    sources.extend(args.models / f["glb"] for f in manifest["files"])
    sources.extend(p for p in (ROOT / "assets/textures/extkit").rglob("*") if p.is_file())
    pins = {str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest() for p in sources}
    for f in manifest["files"]:
        bpy.ops.import_scene.gltf(filepath=str(args.models / f["glb"]))
    roots = {o.name: o for o in bpy.context.scene.objects if o.parent is None}
    for root in roots.values():
        visible(root, False)
    with tempfile.TemporaryDirectory(prefix="extkit-review-decoded-") as temp:
        walls = load_materials(args.models, Path(temp), args.decode_python)
        scene, camera, floor = setup(args.samples)
        scene.world.node_tree.nodes.get("Background").inputs["Strength"].default_value = .5
        if not args.views_only:
            contact_shots(args, scene, camera, roots, catalogue, manifest)
        if not args.contacts_only:
            review_views(args, scene, camera, roots, walls, floor)
    after = {str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest() for p in sources}
    if after != pins:
        raise RuntimeError("Asset bytes changed while rendering; regenerate the review evidence")
    suffix = "views" if args.views_only else "contacts" if args.contacts_only else "all"
    (args.out / ("source-pins-" + suffix + ".json")).write_text(json.dumps(pins, indent=2) + "\n")
    print("Actual-file review renders complete; source hashes unchanged.", flush=True)


if __name__ == "__main__":
    main()
