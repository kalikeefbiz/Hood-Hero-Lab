"""Sample rest and keyed pose kinematics in metres, in Blender coordinates."""
import json
import math
import sys
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector

HERE = Path(__file__).resolve().parent
sys.dont_write_bytecode = True
sys.path.insert(0, str(HERE))
from motion import CANON, GAME, Capture


def rounded(value):
    return round(float(value), 5)


def describe(samples):
    rows = {}
    for name in ("LeftToe", "RightToe"):
        positions = np.array([frame[name] for frame in samples])
        speed = np.diff(positions, axis=0) * 30
        z_floor = np.min(positions[:, 2])
        contact = (positions[:-1, 2] < z_floor + .028) & (positions[1:, 2] < z_floor + .028)
        if contact.sum() >= 2:
            rows[name] = {
                "low_toe_intervals": int(contact.sum()),
                "median_backward_mps": rounded(np.median(speed[contact, 1])),
                "p10_p90_backward_mps": [rounded(x) for x in np.quantile(speed[contact, 1], [.1, .9])],
                "horizontal_contact_proxy_mps": [rounded(x) for x in np.median(speed[contact, :2], axis=0)],
            }
    for name in ("Hips", "LeftWrist", "Head", "LeftCollar"):
        positions = np.array([frame[name] for frame in samples])
        rows[name] = {
            "vertical_excursion_m": rounded(np.ptp(positions[:, 2])),
            "sagittal_excursion_m": rounded(np.ptp(positions[:, 1])),
        }
    return rows


def eval_target(kind, rig, body, mapping, output):
    bones = rig.pose.bones
    anim = rig.animation_data
    for track in anim.nla_tracks:
        track.mute = True
    scene = bpy.context.scene
    res = {}
    for clip in ("Idle", "Walk", "Run"):
        action = bpy.data.actions[clip]
        anim.action = action
        start, end = map(int, action.frame_range)
        samples = []
        floor = []
        head_pitch = []
        angles = {key: [] for key in ("LeftKnee", "LeftElbow")}
        for frame in range(start, end + 1):
            scene.frame_set(frame)
            bpy.context.view_layer.update()
            samples.append({src: tuple(rig.matrix_world @ bones[name].head) for src, name in mapping.items()})
            head = bones[mapping["Head"]]
            delta = head.matrix.to_quaternion() @ head.bone.matrix_local.to_quaternion().inverted()
            gaze = delta @ Vector((0, -1, 0))
            head_pitch.append(math.degrees(math.atan2(gaze.z, math.hypot(gaze.x, gaze.y))))
            for key, upper, lower in (("LeftKnee", "LeftHip", "LeftAnkle"), ("LeftElbow", "LeftShoulder", "LeftWrist")):
                a, b, c = (Vector(samples[-1][i]) for i in (upper, key, lower))
                angles[key].append(math.degrees((b - a).angle(c - b)))
            evaluated = body.evaluated_get(bpy.context.evaluated_depsgraph_get())
            floor.append(min((evaluated.matrix_world @ v.co).z for v in evaluated.data.vertices))
        res[clip] = describe(samples) | {
            "sole_height_range_m": [rounded(min(floor)), rounded(max(floor))],
            "head_pitch_degrees_positive_up": [rounded(min(head_pitch)), rounded(max(head_pitch))],
            "left_joint_flexion_degrees": {key: [rounded(min(values)), rounded(max(values))]
                                           for key, values in angles.items()},
            "endpoint_max_joint_delta_m": rounded(max(math.dist(samples[0][key], samples[-1][key]) for key in mapping)),
        }
    output.write_text(json.dumps(res, indent=2) + "\n")


def eval_source(tools, output):
    details, joints = {}, {}
    for clip in ("Idle", "Walk", "Run"):
        capture = Capture(tools / "motion" / f"{clip}.bvh", clip)
        positions, pitch = [], []
        trace = []
        for frame in range(capture.start, capture.end + 1, 2):
            sample = capture.pose(frame)
            trace.append({key: list(pos) for key, (_, pos) in sample.items()})
            relative = {key: tuple(pos - sample["Hips"][1]) for key, (_, pos) in sample.items()}
            positions.append(relative)
            gaze = sample["Head"][0] @ Vector((0, 0, 1))
            pitch.append(math.degrees(math.atan2(gaze.z, math.hypot(gaze.x, gaze.y))))
        details[clip] = capture.receipt() | describe(positions) | {
            "head_pitch_degrees_positive_up": [rounded(min(pitch)), rounded(max(pitch))],
        }
        joints[clip] = {"parents": dict(zip(capture.names, capture.parents)), "frames": trace}
    output.write_text(json.dumps(details, indent=2) + "\n")
    (tools / "stage/source-points.json").write_text(json.dumps(joints))


if __name__ == "__main__":
    kind, tools, output = sys.argv[sys.argv.index("--") + 1:]
    if kind == "source":
        eval_source(Path(tools), Path(output))
    elif kind in {"baseline", "a"}:
        eval_target(kind, bpy.data.objects["GAME_RIG_Body"], bpy.data.objects["Body"], CANON, Path(output))
    else:
        eval_target(kind, bpy.data.objects["MPFB_Game"], bpy.data.objects["MPFB_Body"], GAME, Path(output))
