"""Fit the three existing wardrobe meshes onto the MPFB rest mesh."""
import json
import sys
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector, geometry
from mathutils.bvhtree import BVHTree

HERE = Path(__file__).resolve().parent
sys.dont_write_bytecode = True
sys.path.insert(0, str(HERE))
from build import export

GARMENTS = ("tee-white", "jeans-denim-standard", "court-sneakers-white")


class Surface:
    def __init__(self, obj, evaluated=False):
        if evaluated:
            obj = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
        obj.data.calc_loop_triangles()
        self.points = [obj.matrix_world @ v.co for v in obj.data.vertices]
        self.faces = [tuple(t.vertices) for t in obj.data.loop_triangles]
        self.tree = BVHTree.FromPolygons(self.points, self.faces, all_triangles=True)
        self.weights = [[(obj.vertex_groups[w.group].name, w.weight) for w in v.groups]
                        for v in obj.data.vertices]

    def radius(self, center, direction):
        return self.tree.ray_cast(center, direction, .64)[3]

    def skin(self, point, names):
        nearest, _, triangle, _ = self.tree.find_nearest(point)
        ids = self.faces[triangle]
        a, b, c = (self.points[i] for i in ids)
        # Evaluate each barycentric basis value by the same affine transform.
        basis = (Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1)))
        proportions = geometry.barycentric_transform(nearest, a, b, c, *basis)
        weights = {}
        for index, fraction in zip(ids, proportions):
            for bone, weight in self.weights[index]:
                if bone in names:
                    weights[bone] = weights.get(bone, 0.) + max(fraction, 0.) * weight
        chosen = sorted(weights.items(), key=lambda pair: pair[1], reverse=True)[:4]
        total = sum(weight for _, weight in chosen)
        assert total > 0
        return [(bone, weight / total) for bone, weight in chosen if weight > 0]


def line(a, b, value, axis):
    t = np.clip((value - a[axis]) / (b[axis] - a[axis]), 0., 1.)
    center = a.lerp(b, t)
    center[axis] = value
    return center


def radial(point, old_center, new_center, axis, canonical, mpfb):
    offset = point - old_center
    axial = offset[axis]
    offset[axis] = 0
    radial_distance = offset.length
    direction = offset.normalized()
    a = canonical.radius(old_center, direction)
    b = mpfb.radius(new_center, direction)
    delta = 0. if a is None or b is None else float(np.clip(b - a, -.065, .065))
    result = new_center + direction * max(.002, radial_distance + delta)
    result[axis] += axial
    return result


def fit_point(point, name, old, new, canonical, mpfb):
    side = 'L' if point.x > 0 else 'R'
    suffix = side.lower()
    if name == "court-sneakers-white":
        oa, na, ot, nt = (old(f'foot.{side}'), new(f'foot_{suffix}'),
                          old(f'toe.{side}'), new(f'ball_{suffix}'))
        result = point + na - oa
        result.y = na.y + (point.y - oa.y) * float(np.clip((nt.y - na.y) / (ot.y - oa.y), .82, 1.1))
        result.z = point.z
        return result

    if name == "tee-white":
        oc, nc = old(f'upper_arm.{side}'), new(f'upperarm_{suffix}')
        oe, ne = old(f'forearm.{side}'), new(f'lowerarm_{suffix}')
        axis = (oe - oc).rotation_difference(ne - nc)
        sleeve = nc + axis @ (point - oc)
        sleeve.y = nc.y + (sleeve.y - nc.y) * .88
        z = np.interp(point.z, [.88, 1.20, 1.43, 1.55],
                      [new("pelvis").z, new("spine_03").z - .08, nc.z, new("neck_01").z + .035])
        torso = Vector((point.x * .95, new("spine_03").y + (point.y - .016) * .98, z))
        t = float(np.clip((abs(point.x) - .13) / .14, 0., 1.))
        return torso.lerp(sleeve, t * t * (3 - 2 * t))

    joints_old = [old(f'{key}.{side}') for key in ('foot', 'shin', 'thigh')]
    joints_new = [new(f'{key}_{suffix}') for key in ('foot', 'calf', 'thigh')]
    z = float(np.interp(point.z, [0, *[v.z for v in joints_old], 1.0],
                       [0, *[v.z for v in joints_new], new("pelvis").z + .10]))
    segment = 0 if point.z < joints_old[1].z else 1
    oc = line(*joints_old[segment:segment + 2], point.z, 2)
    nc = line(*joints_new[segment:segment + 2], z, 2)
    legs = radial(point, oc, nc, 2, canonical, mpfb)
    waist = Vector((point.x * .95, new("pelvis").y + (point.y - .015) * .88, z))
    return legs.lerp(waist, float(np.clip((point.z - .73) / .13, 0., 1.)))


def assemble(canonical_path, wardrobe_path, stage):
    bpy.ops.wm.open_mainfile(filepath=str(stage / "b.blend"), load_ui=False)
    rig = bpy.data.objects["MPFB_Game"]
    body = bpy.data.objects["MPFB_Body"]
    body_surface = Surface(body, evaluated=True)
    with bpy.data.libraries.load(str(canonical_path)) as (available, loaded):
        loaded.objects = ["Body", "GAME_RIG_Body"]
    original_body, original_rig = loaded.objects
    canonical_surface = Surface(original_body)
    with bpy.data.libraries.load(str(wardrobe_path)) as (_, loaded):
        loaded.objects = list(GARMENTS)
    def old(name):
        return original_rig.matrix_world @ original_rig.data.bones[name].head_local
    def new(name):
        return rig.matrix_world @ rig.data.bones[name].head_local

    receipts = {}
    clothes = loaded.objects[:]
    for obj in clothes:
        bpy.context.collection.objects.link(obj)
        obj.parent = rig
        obj.matrix_parent_inverse.identity()
        obj.matrix_basis.identity()
        for modifier in list(obj.modifiers):
            obj.modifiers.remove(modifier)
        obj.vertex_groups.clear()
        groups = {name: obj.vertex_groups.new(name=name) for name in rig.data.bones.keys()}
        displacement = []
        for vertex in obj.data.vertices:
            original = vertex.co.copy()
            p = fit_point(original, obj.name, old, new, canonical_surface, body_surface)
            near, normal, _, distance = body_surface.tree.find_nearest(p)
            if obj.name != "court-sneakers-white" and distance < .035:
                clearance = (p - near).dot(normal)
                if clearance < .008:
                    p += normal * min(.021, .008 - clearance)
            for name, weight in body_surface.skin(p, groups):
                groups[name].add([vertex.index], weight, 'REPLACE')
            vertex.co = rig.matrix_world.inverted() @ p
            displacement.append((original - p).length)
        for name, group in groups.items():
            if not any(any(w.group == group.index for w in v.groups) for v in obj.data.vertices):
                obj.vertex_groups.remove(group)
        deform = obj.modifiers.new("MPFB deformation", 'ARMATURE')
        deform.object = rig
        receipts[obj.name] = {"vertices": len(obj.data.vertices),
                              "mean_fit_displacement_m": round(float(np.mean(displacement)), 5),
                              "max_fit_displacement_m": round(max(displacement), 5)}

    bpy.context.view_layer.update()
    # Conservative coverage beneath the fitted shells, leave trim openings.
    garment_surfaces = [Surface(obj) for obj in clothes]
    masked = body.copy()
    masked.data = body.data.copy()
    bpy.context.collection.objects.link(masked)
    masked.name = "MPFB_Masked"
    visible = masked.vertex_groups.new(name="Visible with starter outfit")
    masked_count = 0
    for modifier in body.modifiers:
        if modifier.type == 'MASK':
            modifier.show_viewport = False
    bpy.context.view_layer.update()
    evaluated = body.evaluated_get(bpy.context.evaluated_depsgraph_get())
    assert len(evaluated.data.vertices) == len(masked.data.vertices)
    for v in evaluated.data.vertices:
        p = evaluated.matrix_world @ v.co
        below_collar = p.z < 1.415 or (abs(p.x) > .11 and p.z < 1.47)
        shirt_zone = 1.075 < p.z and below_collar and abs(p.x) < .303
        pants_zone = .088 < p.z < 1.08
        shoe_zone = p.z <= .087
        covered = False
        for inside, surface in zip((shirt_zone, pants_zone, shoe_zone), garment_surfaces):
            if inside:
                near, normal, _, distance = surface.tree.find_nearest(p)
                covered |= distance < .12
        if covered:
            masked_count += 1
        else:
            visible.add([v.index], 1., 'REPLACE')
    for modifier in body.modifiers:
        if modifier.type == "MASK":
            modifier.show_viewport = True
    mask = masked.modifiers.new("Starter outfit coverage", 'MASK')
    mask.vertex_group = visible.name
    masked.hide_set(True)

    for obj in clothes:
        receipts[obj.name]["deform_bones"] = len(obj.vertex_groups)
    receipts["masked_vertices_including_helpers"] = masked_count
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=str(stage / "c.blend"), compress=True)
    for track in rig.animation_data.nla_tracks:
        track.mute = False
    export(stage / "c.glb", [rig, rig.parent, body, masked, bpy.data.objects["MPFB_Body.low-poly"], *clothes])
    (stage / "c.json").write_text(json.dumps(receipts, indent=2) + "\n")


if __name__ == "__main__":
    paths = map(Path, sys.argv[sys.argv.index("--") + 1:])
    assemble(*paths)
