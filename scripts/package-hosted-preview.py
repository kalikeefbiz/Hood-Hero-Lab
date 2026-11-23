#!/usr/bin/env python3
"""Package strip.html (the city preview) for the private claude.ai artifact preview.

The artifact host serves no .glb or .ktx2 files, so models and textures ship as JSON
({"bytes": base64}) next to the page, and a small inline script in the page hands the
loaders the original bytes. The app code is the normal production build.

  VITE_BASE_PATH=./ VITE_DEV_FEEDBACK=1 npx vite build --outDir /tmp/preview-build --emptyOutDir
  python3 scripts/package-hosted-preview.py /tmp/preview-build /tmp/preview-stage

Then publish /tmp/preview-stage/living-reservoir.html with the Artifact tool, root
/tmp/preview-stage, and the file list printed at the end (`files`). To update the existing
preview, pass its url (read it first), and send null for files that no longer exist.
"""
import base64, json, os, re, shutil, subprocess, sys

SHIM = """<script>
// Hosted-preview packaging: this host serves models and textures as JSON (base64). Give the
// loaders the original bytes when they ask for a .glb or .ktx2.
(function(){var f=window.fetch.bind(window);window.fetch=function(input,init){var u=typeof input==="string"?input:input.url;
if(/\\.(glb|ktx2)(\\?|$)/.test(u)){return f(u.replace(/(\\.(glb|ktx2))(\\?|$)/,"$1.json$3"),init).then(function(r){if(!r.ok)return r;return r.json().then(function(j){
var s=atob(j.bytes),n=s.length,a=new Uint8Array(n);for(var i=0;i<n;i++)a[i]=s.charCodeAt(i);
return new Response(a.buffer,{status:200,headers:{"Content-Type":"application/octet-stream"}});});});}
return f(input,init);};})();
</script>
"""
ASSET_DIRS = ["assets/strip", "assets/reservoir", "assets/tex", "assets/models/characters", "basis"]


def main(build, stage):
    os.makedirs(stage, exist_ok=True)
    files = []
    # 1. The strip entry chunk and everything it imports (static and dynamic), plus CSS.
    entry = next(f for f in os.listdir(f"{build}/assets") if f.startswith("strip-") and f.endswith(".js"))
    seen, stack = set(), [entry]
    while stack:
        f = stack.pop()
        if f in seen:
            continue
        seen.add(f)
        if f.endswith(".js"):
            for m in re.findall(r"""["'`]\./([A-Za-z0-9_.\-]+\.(?:js|css))["'`]""", open(f"{build}/assets/{f}").read()):
                if os.path.exists(f"{build}/assets/{m}"):
                    stack.append(m)
    seen |= {f for f in os.listdir(f"{build}/assets") if f.startswith("strip-") and f.endswith(".css")}
    os.makedirs(f"{stage}/assets", exist_ok=True)
    for f in sorted(seen):
        shutil.copy(f"{build}/assets/{f}", f"{stage}/assets/{f}")
        files.append(f"assets/{f}")
    # 2. Models and textures as JSON; everything else (basis transcoder) as is.
    for d in ASSET_DIRS:
        for dp, _, fs in os.walk(f"{build}/{d}"):
            for name in fs:
                src = os.path.join(dp, name)
                rel = os.path.relpath(src, build)
                os.makedirs(os.path.dirname(f"{stage}/{rel}"), exist_ok=True)
                if name.endswith((".glb", ".ktx2")):
                    with open(src, "rb") as fh:
                        payload = json.dumps({"bytes": base64.b64encode(fh.read()).decode()})
                    with open(f"{stage}/{rel}.json", "w") as fh:
                        fh.write(payload)
                    files.append(f"{rel}.json")
                else:
                    shutil.copy(src, f"{stage}/{rel}")
                    files.append(rel)
    # 3. Commit stamp for playtest notes.
    commit = subprocess.run(["git", "rev-parse", "HEAD"], capture_output=True, text=True).stdout.strip()
    with open(f"{stage}/build-info.json", "w") as fh:
        json.dump({"commit": commit}, fh)
    files.append("build-info.json")
    # 4. The page: the artifact host adds doctype/charset/viewport, so keep title, shim, head, body.
    html = open(f"{build}/strip.html").read()
    head = re.search(r"<head>(.*)</head>", html, re.S).group(1)
    body = re.search(r"<body>(.*)</body>", html, re.S).group(1)
    for pat in [r"\s*<meta charset[^>]*>", r"\s*<meta name=\"viewport\"[^>]*>", r"\s*<link rel=\"icon\"[^>]*>"]:
        head = re.sub(pat, "", head)
    title = re.search(r"<title>.*?</title>", head).group(0)
    head = head.replace(title, "")
    with open(f"{stage}/living-reservoir.html", "w") as fh:
        fh.write(title + "\n" + SHIM + head.strip() + "\n" + body.strip() + "\n")
    size = sum(os.path.getsize(f"{stage}/{f}") for f in files)
    print(json.dumps({"page": f"{stage}/living-reservoir.html", "root": stage, "count": len(files),
                      "megabytes": round(size / 1e6, 1), "files": files}))


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
