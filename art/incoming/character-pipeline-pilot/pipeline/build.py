"""Blender entry point for the Hood Hero character pipeline pilot."""
import argparse
import importlib
import json
import sys
from pathlib import Path

import bpy
from mathutils import Matrix

HERE = Path(__file__).resolve().parent
sys.dont_write_bytecode = True
sys.path.insert(0, str(HERE))
from motion import CANON, GAME, Capture, add_tracks, transfer


def load_source(path):
    bpy.ops.wm.open_mainfile(filepath=str(path), load_ui=False)
    rig = bpy.data.objects["GAME_RIG_Body"]
    rig.animation_data_clear()
    prefix = "Baseline "
    for action in bpy.data.actions:
        action.name = prefix + action.name
    rig.data.pose_position = 'POSE'
    for bone in rig.pose.bones:
        bone.matrix_basis = Matrix.Identity(4)
    return rig, bpy.data.objects["Body"]


def setup_mpfb(tools):
    bpy.ops.wm.read_factory_settings(use_empty=True, app_template="")
    module = "bl_ext.user_default.mpfb"
    bpy.ops.preferences.addon_enable(module=module)
    services = importlib.import_module(module + ".services")
    services.LocationService.update_mh_user_data_if_relevant(str(tools / "system"))
    human = services.HumanService
    macros = services.TargetService.get_default_macro_info_dict()
    macros.update(gender=1., age=.42, muscle=.62, weight=.47, proportions=.55,
                  race={"african": 1., "asian": 0., "caucasian": 0.})
    body = human.create_human(macro_detail_dict=macros)
    body.name = "MPFB_Body"
    assets = tools / "system"
    human.set_character_skin(str(assets / "skins/young_african_male/young_african_male.mhmat"),
                             body, skin_type="GAMEENGINE")
    rig = human.add_builtin_rig(body, "game_engine", import_weights=True)
    rig.name = "MPFB_Game"
    accessories = []
    eyes = human.add_mhclo_asset(str(assets / "eyes/low-poly/low-poly.mhclo"), body,
                                asset_type="Eyes", subdiv_levels=0, material_type="MAKESKIN",
                                alternative_materials=None)
    accessories.append(eyes)
    for ob in accessories:
        for modifier in list(ob.modifiers):
            if modifier.type == 'SUBSURF':
                ob.modifiers.remove(modifier)
    # All parts share a single authoring-space affine. Freeze it only for export
    # so the full source retains MPFB helpers, targets and original weights.
    evaluated = body.evaluated_get(bpy.context.evaluated_depsgraph_get())
    heights = [(evaluated.matrix_world @ v.co).z for v in evaluated.data.vertices]
    factor = 1.78 / (max(heights) - min(heights))
    scale = bpy.data.objects.new("Height_1.78m", None)
    bpy.context.collection.objects.link(scale)
    root = rig
    while root.parent:
        root = root.parent
    root.parent = scale
    scale.scale = (factor,) * 3
    scale.location.z = -min(heights) * factor
    bpy.context.view_layer.update()
    print("MPFB_BONES", list(rig.data.bones.keys()))
    print("MPFB_SIZE", factor, min(heights), max(heights), "eyes", [m.name for m in eyes.data.materials])
    return rig, body, [scale, rig, body, *accessories]


def export(path, objects):
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.hide_set(False)
        obj.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(path), export_format='GLB', use_selection=True,
                             export_animation_mode='NLA_TRACKS', export_frame_range=False,
                             export_force_sampling=True, export_frame_step=1, export_apply=True,
                             export_morph=False, export_all_influences=False, export_optimize_animation_size=False)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("kind", choices=["a", "b"])
    parser.add_argument("tools", type=Path)
    parser.add_argument("stage", type=Path)
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:])
    args.stage.mkdir(parents=True, exist_ok=True)
    if args.kind == "a":
        rig, body = load_source(HERE.parents[1] / "protagonist-male/source/protagonist-male_source.blend")
        objects = [rig, body]
        mapping = CANON
    else:
        rig, body, objects = setup_mpfb(args.tools)
        mapping = GAME
    bpy.context.scene.render.fps = 30
    actions = []
    receipt = {}
    for name in ("Idle", "Walk", "Run"):
        capture = Capture(args.tools / "motion" / f"{name}.bvh", name)
        action, metrics = transfer(rig, body, mapping, capture)
        actions.append(action)
        receipt[name] = capture.receipt() | metrics
    add_tracks(rig, actions)
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=str(args.stage / f"{args.kind}.blend"), compress=True)
    for track in rig.animation_data.nla_tracks:
        track.mute = False
    export(args.stage / f"{args.kind}.glb", objects)
    (args.stage / f"{args.kind}.json").write_text(json.dumps(receipt, indent=2) + "\n")


if __name__ == "__main__":
    main()
