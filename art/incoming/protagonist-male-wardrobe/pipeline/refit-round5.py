"""Refit PR 77 panels on the frozen Round 5 rest body, then export each slot asset."""
import json
import os
from pathlib import Path
import sys

import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.geometry import barycentric_transform
from mathutils.kdtree import KDTree

HERE = Path(__file__).resolve().parent
SKILLS = Path(os.environ["BLENDER_SKILLS"])
for skill in ("clothing", "pbr-materials", "asset-qa", "character-rigging",
              "game-optimization", "export-pipelines", "geometry-nodes"):
    sys.path.insert(0, str(SKILLS / f"blender-{skill}/scripts"))
sys.path.insert(0, str(HERE))
import build
import masks
import mesh_stats
import qa_check
import rig_check
from catalog_config import BOTTOMS, FOOTWEAR, TOPS

BODY = build.BODY
RIG = build.RIG
ROUGHNESS = {
    "tee": .86, "tank": .88, "flannel": .85, "hoodie": .88,
    "puffer": .58, "windbreaker": .54, "standard": .84,
    "skinny": .86, "baggy": .87, "cargo": .86, "sweats": .9,
    "shorts": .78, "court": .69, "slide": .79, "flip-flop": .81,
}


def smooth(start, end, value):
    t = max(0., min(1., (value - start) / (end - start)))
    return t * t * (3 - 2 * t)


def reference_body(path):
    with bpy.data.libraries.load(str(path)) as (source, target):
        target.meshes = [BODY.data.name]
    old, = target.meshes
    topology = [tuple(face.vertices) for face in old.polygons]
    assert topology == [tuple(face.vertices) for face in BODY.data.polygons]
    reference = [vertex.co.copy() for vertex in old.vertices]
    bpy.data.meshes.remove(old)
    return reference, topology


def migrate_baseline(old_vertices, new_vertices, old_runtime, new_runtime, original_masks):
    # Changes in the export's vertex splitting can also reorder triangles.
    # Compare geometric triangles through the common source mesh identity.
    def keys(source_vertices, runtime):
        tree = KDTree(len(source_vertices))
        for i, point in enumerate(source_vertices):
            tree.insert(point, i)
        tree.balance()
        source_keys = [tuple(round(value, 5) for value in v) for v in old_vertices]
        matches = [tree.find(Vector(v)) for v in runtime["vertices"]]
        assert max(distance for _, _, distance in matches) < .002
        vertices = [source_keys[i] for _, i, _ in matches]
        indices = runtime["indices"]
        return [tuple(sorted(vertices[indices[i + j]] for j in range(3)))
                for i in range(0, len(indices), 3)]

    old_keys = keys(old_vertices, old_runtime)
    new_keys = keys(new_vertices, new_runtime)
    migrated = dict(original_masks, bodySha256=new_runtime["sha256"],
                    indexCount=len(new_runtime["indices"]))
    counts = {}
    for name, record in migrated["wearables"].items():
        hidden = {old_keys[i] for start, count in record["ranges"] for i in range(start, start + count)}
        indices = [i for i, key in enumerate(new_keys) if key in hidden]
        counts[name] = [record["triangles"], len(indices)]
        record.update(triangles=len(indices), ranges=masks.ranges(indices))
    return migrated, counts


def refit(obj, shape, surface, old_vertices, new_vertices, topology):
    old_coords = [v.co.copy() for v in obj.data.vertices]
    displacement = []
    for co in old_coords:
        nearest, _, triangle, _ = surface.find_nearest(co)
        ids = topology[triangle]
        target = barycentric_transform(nearest, *(old_vertices[i] for i in ids),
                                       *(new_vertices[i] for i in ids))
        displacement.append(target - nearest)
    # Soften the field over pattern edges to protect narrow bindings and seams.
    adjacent = [[] for _ in old_coords]
    for a, b in (edge.vertices for edge in obj.data.edges):
        adjacent[a].append(b)
        adjacent[b].append(a)
    for _ in range(2):
        displacement = [
            delta.lerp(sum((displacement[j] for j in neighbors), Vector()) / len(neighbors), .22)
            if neighbors else delta
            for delta, neighbors in zip(displacement, adjacent, strict=True)
        ]

    trim = set()
    boxes = {"flannel": (.834, .976, .549, .641), "slide": (.529, .971, .399, .831)}
    if shape in boxes:
        u_min, u_max, v_min, v_max = boxes[shape]
        uv = obj.data.uv_layers.active.data
        for face in obj.data.polygons:
            if all(u_min <= uv[i].uv.x <= u_max and v_min <= uv[i].uv.y <= v_max for i in face.loop_indices):
                trim.update(face.vertices)
        # Carry each turned edge with its outer layer.
        trim.update(i for i, neighbors in enumerate(adjacent)
                    if i not in trim and neighbors and all(j in trim for j in neighbors))

    for vertex, old, delta in zip(obj.data.vertices, old_coords, displacement, strict=True):
        point = old + delta
        x, y, z = old
        width = abs(x)
        if shape == "tee":
            taper = .19 * smooth(.29, .38, width)
            point.y += (.061 - y) * taper
            point.z += (1.42 - z) * taper
            # Pull in the rolled back hem while keeping it over the waistband.
            point.y -= .011 * (1 - smooth(.965, 1.08, z)) * smooth(.06, .17, y)
            # Give the back-neck binding room to sit outside the skin ring.
            point.y += .007 * smooth(1.476, 1.507, z) * smooth(.081, .143, y) * (1 - smooth(.075, .16, width))
        elif shape == "tank":
            back_binding = smooth(1.42, 1.505, z) * smooth(.052, .118, y)
            point.y += .010 * back_binding
            point.z += .005 * back_binding * smooth(.035, .115, width)
        elif shape in {"flannel", "hoodie", "puffer", "windbreaker"}:
            taper = (.12 if shape in {"flannel", "windbreaker"} else .07) * smooth(.60, .705, width)
            point.y += (.064 - y) * taper
            point.z += (1.42 - z) * taper
            if shape == "hoodie" and obj.name.endswith("down"):
                fold = smooth(1.375, 1.46, z) * smooth(.071, .115, y) * (1 - smooth(.125, .18, width))
                point.y += .024 * fold
                point.z -= .014 * fold * smooth(1.49, 1.53, z)
                # The third and fourth 40-point rings are the inner
                # return of the lowered hood in the archived pattern.
                # Open a small fold between those rings and the rolled rim.
                if 2030 <= vertex.index < 2110:
                    point.y += .007 + .004 * smooth(.07, .112, width)
                    point.z -= .006 * smooth(.07, .112, width)
                if z > 1.47 and y > .075 and width < .141:
                    outside, _, _, _ = build.BODY_MESH.ray_cast(
                        Vector((point.x, .28, min(point.z, 1.537))), Vector((0, -1, 0)), .23)
                    if outside is not None:
                        point.y += max(0., outside.y + .008 - point.y) * fold
            if shape == "windbreaker":
                # The tee's shoulder arch and lower hem need additional
                # shell clearance while the open placket remains in place.
                shoulder = smooth(.07, .185, width) * (1 - smooth(.32, .435, width))
                shoulder *= smooth(1.38, 1.53, z)
                point.z += .023 * shoulder
                point.y += (y - .055) * .14 * shoulder
                point.y += .014 * smooth(.05, .115, y) * (1 - smooth(1.05, 1.17, z))
                point.x += (1 if x > 0 else -1) * .010 * smooth(.11, .21, width) * (1 - smooth(1.15, 1.34, z))
            if shape == "puffer":
                point.y += .014 * smooth(.08, .15, y) * smooth(.964, 1.014, z) * (1 - smooth(1.08, 1.18, z))
            if vertex.index in trim:
                point.y -= .004 * (1 - smooth(1.35, 1.374, z))
        elif shape in {"standard", "skinny", "baggy", "cargo", "sweats", "shorts"}:
            # Seat and outer hip allowance for the upright idle hand and stride.
            point.x += (.008 if shape in {"standard", "skinny"} else .006) * smooth(.13, .20, width) * smooth(.79, .87, z) * (1 - smooth(.93, .995, z)) * (1 if x > 0 else -1)
            if shape in {"standard", "skinny"}:
                cuff = 1 - smooth(.097, .195, z)
                point.z -= .014 * cuff
                point.x += ( (.17 if x > 0 else -.17) - x) * .12 * cuff
                point.y += (.026 - y) * .10 * cuff
        elif shape == "court":
            # Keep the collar and toe box volume while shortening the platform.
            # Both colorways share an outsole plane within 1 mm of the barefoot rig.
            point.z += .023 * (1 - smooth(-.022, .055, z))
        else:
            # Preserve toe exposure and lower the top of the exaggerated platform.
            # The outsole stays below the toes for these open styles.
            point.z += .004 * (1 - smooth(-.02, .012, z))
            if shape == "slide" and vertex.index in trim and .008 < z < .103:
                # Fit each upright end of the molded band to the actual
                # width of the forefoot at that height, tapering into its sole.
                side = 1 if x > 0 else -1
                outward = side if width > .180 else -side
                start = Vector((side * .180 + outward * .11, point.y, point.z))
                hit, _, _, _ = build.BODY_MESH.ray_cast(start, Vector((-outward, 0, 0)), .11)
                if hit is not None:
                    clearance = max(0., (hit.x - point.x) * outward + .007)
                    pin = smooth(.008, .022, z) * (1 - smooth(.074, .103, z))
                    point.x += outward * min(.022, clearance) * pin
        vertex.co = point
    if shape == "sweats":
        # Soften the tightly gathered ankle folds while keeping the cuff seam.
        for _ in range(2):
            coords = [v.co.copy() for v in obj.data.vertices]
            for vertex, neighbors in zip(obj.data.vertices, adjacent, strict=True):
                if vertex.co.z >= .166 or not neighbors:
                    continue
                amount = .44 * (1 - smooth(.106, .166, vertex.co.z))
                average = sum((coords[j] for j in neighbors), Vector()) / len(neighbors)
                vertex.co = vertex.co.lerp(average, amount)
    obj.data.update()
    if shape not in {"court", "slide", "flip-flop"}:
        # Reuse the skill's barycentric skin transfer, armhole smoothing and
        # hood follow weights, all evaluated against the new rest body.
        obj.modifiers.clear()
        obj.vertex_groups.clear()
        build.weight(obj)
        if shape == "tee":
            build.smooth_sleeve_weights(obj)
    else:
        # Foot/toe weighting already tracks the unchanged lower binding chain.
        for modifier in obj.modifiers:
            if modifier.type == "ARMATURE":
                modifier.object = RIG
        obj.parent = RIG


def material(obj, shape, texture_root):
    mat, = obj.data.materials
    nodes = mat.node_tree.nodes
    bsdf = next(node for node in nodes if node.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Roughness"].default_value = ROUGHNESS[shape]
    asset = "hoodie-gray-down" if obj.name == "hoodie-gray-up" else obj.name
    path, = (texture_root / asset).glob("*_basecolor.png")
    image = bpy.data.images.load(str(path))
    image.colorspace_settings.name = "sRGB"
    image.pack()
    bsdf.inputs["Base Color"].links[0].from_node.image = image


def main(old_body, old_source, texture_root, stage, *items):
    stage = Path(stage)
    stage.mkdir(parents=True, exist_ok=True)
    old_vertices, topology = reference_body(old_body)
    new_vertices = [vertex.co.copy() for vertex in BODY.data.vertices]
    surface = BVHTree.FromPolygons(old_vertices, topology, all_triangles=True)
    with bpy.data.libraries.load(str(Path(old_source).resolve())) as (source, target):
        assert set(items) <= set(source.objects)
        target.objects = list(items)

    for obj in target.objects:
        bpy.context.collection.objects.link(obj)
        obj.parent = RIG
    bpy.context.view_layer.update()
    for obj in target.objects:
        asset = obj.name
        config = TOPS.get(asset) or BOTTOMS.get(asset) or FOOTWEAR.get(asset)
        shape = config["shape"] if config else {
            "tee-white": "tee", "jeans-denim-standard": "standard", "court-sneakers-white": "court",
        }[asset]
        refit(obj, shape, surface, old_vertices, new_vertices, topology)
        material(obj, shape, Path(texture_root))

    runtime_file = stage.parent / "protagonist-male-rework.json"
    masks.main(runtime_file, stage, items)
    if "tee-white" in items:
        load = lambda name: json.loads((stage.parent / name).read_text())
        baseline, counts = migrate_baseline(old_vertices, new_vertices, load("protagonist-male.json"),
                                           load(runtime_file.name), load("original-masks.json"))
        (stage.parent / "baseline/body-masks.json").write_text(json.dumps(baseline))
        (stage / "baseline-mask-migration.json").write_text(json.dumps(counts, indent=2) + "\n")
    for module in (mesh_stats, rig_check):
        mesh_report = (module.run(armature=RIG.name, meshes=items) if module is rig_check
                       else module.run(objects=items, budget="web"))
        (stage / f"{module.__name__}.json").write_text(json.dumps(mesh_report, indent=2) + "\n")
    report = {name: qa_check.run(objects=[name], profile="game", eps=.0003, tol=.001) for name in items}
    (stage / "qa.json").write_text(json.dumps(report, indent=2) + "\n")
    source = stage / Path(old_source).name
    sys.argv = [sys.argv[0], "--", str(source), str(stage), *items]
    import runpy
    runpy.run_path(str(HERE / "export.py"), run_name="__main__")


if __name__ == "__main__":
    main(*sys.argv[sys.argv.index("--") + 1:])
