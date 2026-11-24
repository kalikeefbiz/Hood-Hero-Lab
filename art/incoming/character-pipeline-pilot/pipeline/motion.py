"""Read Xsens BVH, select straight complete strides and bake rest-space retargets."""
import math

import bpy
import numpy as np
from mathutils import Matrix, Vector


CANON = {
    "Hips": "spine", "Chest": "spine.001", "Chest2": "spine.002",
    "Chest4": "spine.003", "Neck": "spine.004", "Head": "spine.006",
}
GAME = {
    "Hips": "pelvis", "Chest": "spine_01", "Chest2": "spine_02",
    "Chest4": "spine_03", "Neck": "neck_01", "Head": "head",
}
PARTS = {
    "Collar": ("shoulder", "clavicle"), "Shoulder": ("upper_arm", "upperarm"),
    "Elbow": ("forearm", "lowerarm"), "Wrist": ("hand", "hand"),
    "Hip": ("thigh", "thigh"), "Knee": ("shin", "calf"),
    "Ankle": ("foot", "foot"), "Toe": ("toe", "ball"),
}
for side, short in (("Left", "L"), ("Right", "R")):
    for part, (canon, game) in PARTS.items():
        CANON[side + part] = f"{canon}.{short}"
        GAME[side + part] = f"{game}_{short.lower()}"


class Capture:
    def __init__(self, path, name):
        hierarchy, motion = path.read_text().split("MOTION")
        self.names = []
        self.parents = []
        self.offsets = []
        stack = []
        for line in hierarchy.splitlines():
            fields = line.split()
            if not fields:
                continue
            if fields[0] in {"ROOT", "JOINT"}:
                self.parents.append(stack[-1] if stack else None)
                self.names.append(fields[1])
                stack.append(fields[1])
            elif fields[0] == "End":
                stack.append(None)
            elif fields[0] == "OFFSET" and stack[-1]:
                self.offsets.append(Vector([float(v) * .01 for v in fields[1:]]))
            elif fields[0] == "}":
                stack.pop()
        lines = motion.strip().splitlines()
        self.rows = np.loadtxt(lines[2:])
        assert self.rows.shape[1] == 3 + 3 * len(self.names)
        self.name = name
        self.start, self.end = self.choose_window(name)
        start, end = self.rows[[self.start, self.end], :3] * .01
        self.origin = Vector(start)
        angle = math.radians(float(np.mean(self.rows[self.start:self.end, 3])))
        if name != "Idle":
            angle = math.atan2(end[0] - start[0], end[2] - start[2])
        self.axes = Matrix.Rotation(math.pi / 2, 3, 'X') @ Matrix.Rotation(-angle, 3, 'Y')
        self.speed = float(np.linalg.norm((end - start)[[0, 2]]) * 60 / (self.end - self.start))

    def choose_window(self, name):
        if name == "Idle":
            # Within the publisher's trimmed standing interval. Match endpoints over 8 s.
            starts, durations = range(685, 1000, 2), (480,)
        elif name == "Walk":
            starts, durations = range(508, 655, 2), range(58, 86, 2)
        else:
            starts, durations = range(465, 554, 2), range(36, 56, 2)
        options = []
        for start in starts:
            for duration in durations:
                segment = self.rows[start:start + duration + 1]
                delta = (segment[-1, 3:] - segment[0, 3:] + 180) % 360 - 180
                displacement = segment[-1, [0, 2]] - segment[0, [0, 2]]
                if name != "Idle":
                    speed = np.linalg.norm(displacement) * .6 / duration
                    if speed < (.75 if name == "Walk" else 1.55):
                        continue
                    angles = np.unwrap(np.deg2rad(segment[:, 3]))
                    turn = np.ptp(angles)
                    if turn > .40:
                        continue
                else:
                    turn = 0
                score = np.sqrt(np.mean(delta ** 2)) + 8 * turn
                options.append((score, start, start + duration))
        assert options, f"No eligible motion window for {name}"
        _, start, end = min(options)
        return start, end

    def pose(self, frame):
        row = self.rows[frame]
        world = {}
        for index, (name, parent, offset) in enumerate(zip(self.names, self.parents, self.offsets)):
            y, x, z = np.deg2rad(row[3 + 3 * index:6 + 3 * index])
            rotation = Matrix.Rotation(y, 3, 'Y') @ Matrix.Rotation(x, 3, 'X') @ Matrix.Rotation(z, 3, 'Z')
            if parent is None:
                world[name] = self.axes @ rotation, self.axes @ (Vector(row[:3] * .01) - self.origin)
            else:
                parent_rotation, parent_position = world[parent]
                world[name] = parent_rotation @ rotation, parent_position + parent_rotation @ offset
        return world

    def receipt(self):
        return {"file": {"Idle": "Neutral_ID", "Walk": "Neutral_FW", "Run": "Neutral_FR"}[self.name],
                "capture_frames_zero_based": [self.start, self.end],
                "source_speed_mps": round(self.speed, 4), "baked_fps": 30}


BASIS = Matrix.Rotation(math.pi / 2, 3, 'X')


def transfer(rig, body, mapping, capture):
    """Copy global rotation deltas, with anatomical limb swing-axis correction."""
    missing = set(mapping.values()) - set(rig.pose.bones.keys())
    if missing:
        raise ValueError(f"{rig.name}: missing mapped bones {missing}")
    anim = rig.animation_data_create()
    action = bpy.data.actions.new(capture.name)
    action.use_fake_user = True
    anim.action = action
    previous = {}
    poses = []
    hips = rig.pose.bones[mapping["Hips"]]
    source_leg = abs(sum(capture.offsets[capture.names.index("Left" + name)].y
                         for name in ("Knee", "Ankle")))
    target_leg = sum((rig.data.bones[mapping[a]].head_local - rig.data.bones[mapping[b]].head_local).length
                     for a, b in (("LeftHip", "LeftKnee"), ("LeftKnee", "LeftAnkle")))
    ratio = target_leg / source_leg
    rest_alignment = {}
    for side in ("Left", "Right"):
        for name, child in (("Shoulder", "Elbow"), ("Elbow", "Wrist"), ("Hip", "Knee"), ("Knee", "Ankle")):
            source = BASIS @ capture.offsets[capture.names.index(side + child)]
            a = rig.data.bones[mapping[side + name]]
            b = rig.data.bones[mapping[side + child]]
            rest_alignment[side + name] = (b.head_local - a.head_local).rotation_difference(source).to_matrix()

    if mapping is GAME:
        for side in ("Left", "Right"):
            rest_alignment[side + "Wrist"] = rest_alignment[side + "Elbow"]

    # The neutral standing take looks at the floor (about 20 degrees).
    # Set a common gameplay gaze for both rigs while retaining captured motion.
    gaze_by_clip = {"Idle": (15, 9), "Walk": (11, 6), "Run": (17, 5)}
    gaze = dict(zip(("Head", "Neck"), gaze_by_clip[capture.name]))
    endpoint = capture.pose(capture.end)["Hips"][1]
    rig_to_world_scale = rig.matrix_world.to_scale().z
    for frame in range(capture.start, capture.end + 1, 2):
        source = capture.pose(frame)
        rig_position = source["Hips"][1].copy()
        progress = (frame - capture.start) / (capture.end - capture.start)
        rig_position -= endpoint * progress
        for bone in rig.pose.bones:
            bone.matrix_basis = Matrix.Identity(4)
            bone.rotation_mode = 'QUATERNION'
        bpy.context.view_layer.update()
        for src, name in mapping.items():
            bone = rig.pose.bones[name]
            rotation = source[src][0] @ BASIS.inverted()
            if src in gaze:
                rotation = Matrix.Rotation(math.radians(-gaze[src]), 3, 'X') @ rotation
            if src in rest_alignment:
                rotation = rotation @ rest_alignment[src]
            # Allow the authored clavicle and neck rest offsets to remain intact.
            desired = (rotation @ bone.bone.matrix_local.to_3x3()).to_quaternion()
            parent_delta = (bone.parent.matrix.to_quaternion() @ bone.parent.bone.matrix_local.to_quaternion().inverted()
                            if bone.parent else None)
            if parent_delta is not None:
                desired = parent_delta.inverted() @ desired
            bone.rotation_quaternion = bone.bone.matrix_local.to_quaternion().inverted() @ desired
            bpy.context.view_layer.update()
        hips.location = hips.bone.matrix_local.to_3x3().inverted() @ (rig_position * ratio)
        bpy.context.view_layer.update()
        evaluated = body.evaluated_get(bpy.context.evaluated_depsgraph_get())
        sole = min((evaluated.matrix_world @ v.co).z for v in evaluated.data.vertices)
        soles = {"L": tuple(rig.pose.bones[mapping["LeftToe"]].head),
                 "R": tuple(rig.pose.bones[mapping["RightToe"]].head)}
        poses.append(({name: rig.pose.bones[name].rotation_quaternion.copy() for name in mapping.values()},
                      hips.location.copy(), sole, soles))

    # Floor calibration keeps the captured flight in Run. Walk and Idle use a
    # per-frame vertical offset to remove penetration without changing stride.
    floor = min(pose[2] for pose in poses)
    measurements, baked = [], []
    up = hips.bone.matrix_local.to_3x3().inverted() @ Vector((0, 0, 1))
    for i, (rotations, location, sole, toes) in enumerate(poses):
        # Close the loop over four samples, then match first derivatives at the seam.
        blend = max(0., (i - (len(poses) - 5)) / 4)
        blend = blend * blend * (3 - 2 * blend)
        keys = {name: value.slerp(poses[0][0][name], blend) for name, value in rotations.items()}
        floor_here = floor if capture.name == "Run" else sole
        floor_first = floor if capture.name == "Run" else poses[0][2]
        position = (location - up * floor_here / rig_to_world_scale).lerp(
            poses[0][1] - up * floor_first / rig_to_world_scale, blend)
        baked.append((keys, position))
        measurements.append({"toe_xyz_pre_seam": toes, "sole_z_pre_seam": sole - floor_here})
    for name, start in baked[0][0].items():
        forward = start.inverted() @ baked[1][0][name]
        backward = baked[-2][0][name].inverted() @ start
        delta = forward.slerp(backward, .5)
        baked[1][0][name] = start @ delta
        baked[-2][0][name] = start @ delta.inverted()
    step = (baked[1][1] - baked[-2][1]) * .5
    baked[1] = (baked[1][0], baked[0][1] + step)
    baked[-2] = (baked[-2][0], baked[0][1] - step)
    for i, (rotations, location) in enumerate(baked):
        for name, value in rotations.items():
            bone = rig.pose.bones[name]
            if name in previous:
                value.make_compatible(previous[name])
            previous[name] = value.copy()
            bone.rotation_quaternion = value
            bone.keyframe_insert("rotation_quaternion", frame=i, group=name)
        hips.location = location
        hips.keyframe_insert("location", frame=i, group=hips.name)
    for curve in action.layers[0].strips[0].channelbag(anim.action_slot).fcurves:
        for key in curve.keyframe_points:
            key.interpolation = 'LINEAR'
    anim.action = None
    for bone in rig.pose.bones:
        bone.matrix_basis = Matrix.Identity(4)
    return action, {"leg_ratio": round(ratio, 5), "speed_from_capture_scaled_mps": round(capture.speed * ratio * rig_to_world_scale, 4),
                    "samples": measurements}


def add_tracks(rig, actions):
    for action in actions:
        track = rig.animation_data.nla_tracks.new()
        track.name = action.name
        track.strips.new(action.name, 0, action)
        track.mute = True
