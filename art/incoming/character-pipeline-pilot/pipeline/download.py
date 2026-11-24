"""Download and verify the pinned build inputs in the current tools directory."""
import hashlib
import json
import subprocess
import sys
from pathlib import Path

for item in json.loads(Path(sys.argv[1]).read_text())["buildInputs"]:
    path = Path(item["file"])
    path.parent.mkdir(parents=True, exist_ok=True)
    download = path.with_suffix(path.suffix + ".part") if not path.exists() else path
    if download != path:
        subprocess.run(["curl", "-fL", "--retry", "2", item["url"], "-o", str(download)], check=True)
    with download.open("rb") as handle:
        actual = hashlib.file_digest(handle, "sha256").hexdigest()
    if actual != item["sha256"]:
        raise SystemExit(f"SHA-256 mismatch for {download}: {actual}")
    if download != path:
        download.replace(path)
