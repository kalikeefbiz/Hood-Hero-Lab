"""Evaluate each authored pattern independently to avoid cross-slot QA collisions."""
import json
import os
from pathlib import Path
import sys

import bpy

skills=Path(os.environ.get("BLENDER_SKILLS",Path.home()/".agents/skills"))
sys.path.insert(0,str(skills/"blender-asset-qa"/"scripts"))
import qa_check

names=sys.argv[sys.argv.index("--")+1:]
reports={}
for name in names:
    reports[name]=qa_check.run(objects=[name],profile="game",eps=.0003,tol=.001)
print("@@JSON@@"+json.dumps(reports))
