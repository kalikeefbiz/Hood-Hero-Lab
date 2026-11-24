"""Author wardrobe panels on the accepted, unmodified protagonist source.

Run through blender-core's run_in_blender.py. Arguments are the wearable ID and
a disposable staging directory. Paths to Blender Skills and the handoff are
resolved from BLENDER_SKILLS and this script respectively.
"""
import json
import math
import os
from pathlib import Path
import sys

import bmesh
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

ROOT = Path(__file__).resolve().parents[1]
SKILLS = Path(os.environ.get("BLENDER_SKILLS", Path.home() / ".agents/skills"))
for skill in (
    "clothing", "pbr-materials", "retopology-uv", "game-optimization",
    "asset-qa", "character-rigging", "export-pipelines",
):
    sys.path.insert(0, str(SKILLS / f"blender-{skill}/scripts"))

import garment
import build_pbr_material

BODY = bpy.data.objects["Body"]
RIG = bpy.data.objects["GAME_RIG_Body"]
RIG.data.pose_position = "REST"
BODY_MESH = BVHTree.FromPolygons(
    [v.co for v in BODY.data.vertices],
    [p.vertices[:] for p in BODY.data.polygons],
    all_triangles=True,
)
TAU = math.tau


class Panels:
    """Joined cut-and-sew panels with independent corner UVs."""

    def __init__(self):
        self.vertices = []
        self.faces = []
        self.uvs = []
        self.flat = set()

    def point(self, xyz):
        self.vertices.append(Vector(xyz))
        return len(self.vertices) - 1

    def loop(self, points):
        return [self.point(p) for p in points]

    def face(self, vertices, uv, smooth=True):
        if not smooth:
            self.flat.add(len(self.faces))
        self.faces.append(vertices)
        self.uvs.append(uv)

    def band(self, lower, upper, uv, skip=()):
        for j in range(len(lower)):
            if j in skip:
                continue
            k = (j + 1) % len(lower)
            self.face((lower[j], lower[k], upper[k], upper[j]), uv(j))

    def mesh(self, name):
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata(self.vertices, [], self.faces)
        mesh.update()
        layer = mesh.uv_layers.new(name="UVMap")
        for poly, corners in zip(mesh.polygons, self.uvs, strict=True):
            poly.use_smooth = poly.index not in self.flat
            for loop, uv in zip(poly.loop_indices, corners, strict=True):
                layer.data[loop].uv = uv
        bm = bmesh.new()
        bm.from_mesh(mesh)
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_edges], context="VERTS")
        bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
        bm.to_mesh(mesh)
        bm.free()
        obj = bpy.data.objects.new(name, mesh)
        bpy.context.collection.objects.link(obj)
        return obj


def uv_rect(bounds, u0, u1, v0, v1):
    x, y, w, h = bounds
    return [(x + w*u, y + h*v) for u, v in ((u0,v0),(u1,v0),(u1,v1),(u0,v1))]


def ease_point(p, minimum, accept=None):
    """Raise the drafted surface off the nearest accepted skin surface."""
    p = Vector(p)
    q, normal, _, gap = BODY_MESH.find_nearest(p)
    if accept and not accept(q):
        return p
    if gap < 0.12:
        signed_gap = (p-q).dot(normal)
        return p + normal * max(0, minimum - signed_gap)
    return p


def tee():
    p = Panels()
    n = 40
    # Each profile gives height, width, depth centre, anterior and posterior depth.
    # Shoulder rows arch toward the deltoid before turning into the collar.
    profiles = [
        (0.966,.191,.022,.147,.167), (.971,.192,.022,.148,.168),
        (.980,.191,.022,.147,.167), (.990,.188,.022,.144,.165),
        (1.021,.172,.016,.132,.151), (1.057,.168,.001,.121,.128),
        (1.095,.164,.001,.120,.116), (1.14,.164,.003,.122,.114),
        (1.19,.166,.005,.120,.120), (1.24,.174,.010,.121,.126),
        (1.283,.182,.017,.126,.137), (1.320,.194,.027,.123,.141),
        (1.370,.206,.042,.129,.149), (1.414,.216,.055,.124,.143),
        (1.448,.224,.062,.119,.132), (1.478,.228,.061,.125,.123),
        (1.509,.214,.067,.126,.114), (1.517,.178,.068,.118,.107),
        (1.519,.127,.065,.112,.106), (1.522,.104,.062,.104,.104),
        (1.523,.098,.062,.098,.102), (1.524,.092,.062,.094,.100),
    ]
    hole_lower, hole_upper, half_hole = 11, 16, 4
    holes = [n//4, 3*n//4]
    rings = []
    for i, (z, width, center, front, back) in enumerate(profiles):
        coords = []
        for j in range(n):
            a = TAU*j/n
            ca, sa = math.cos(a), math.sin(a)
            outer = abs(sa)**4
            fold = .005 * math.sin(11*a + 42*z) * math.exp(-((z-1.055)/.08)**2)
            fold += .003 * math.cos(7*a - 59*z) * math.exp(-((z-1.25)/.10)**2)
            x = (width+fold)*sa
            y = center-(front if ca>=0 else back)*math.copysign(abs(ca)**.78, ca) - ca*fold
            height = z
            if i>=12:
                z_front = (1.367,1.392,1.411,1.425,1.438,1.450,1.461,1.472,1.476,1.480)[i-12]
                z_back = (1.370,1.402,1.435,1.463,1.486,1.496,1.503,1.507,1.511,1.514)[i-12]
                height -= (z-z_front)*max(0,ca)**1.45 + (z-z_back)*max(0,-ca)**1.45
            # Keep the shoulder ridge over the skin as the arm drops.
            if i>=14:
                height += .021 * min(1,(i-13)/3) * outer
            if hole_lower <= i <= hole_upper:
                height += .023*outer*(i-hole_lower)/(hole_upper-hole_lower)
            coords.append(Vector((x,y,height)) if i<5 or i>=16 else ease_point((x,y,height), .014))
        rings.append(p.loop(coords))

    def torso_uv(row, j):
        # Front and back grain are oriented from hem to shoulder. Collar and
        # lower hem use their own texture strip, with two stitched courses.
        v0, v1 = row/(len(rings)-1), (row+1)/(len(rings)-1)
        if row < 3 or row >= 19:
            v0, v1 = ((row/3, (row+1)/3) if row<3 else ((row-19)/2, (row-18)/2))
            return uv_rect((.02,.955,.94,.025), j/n, (j+1)/n, v0, v1)
        front = j < n//4 or j >= 3*n//4
        col = (j+n//4)%n if front else j-n//4
        return uv_rect((.02 if front else .36,.03,.30,.77), col/(n/2), (col+1)/(n/2), v0, v1)

    for i in range(len(rings)-1):
        omitted = {j for center in holes for j in range(center-half_hole, center+half_hole)}
        p.band(rings[i], rings[i+1], lambda j: torso_uv(i,j),
               omitted if hole_lower<=i<hole_upper else ())
    for side, center in enumerate(holes):
        lo, hi = center-half_hole, center+half_hole
        boundary = (rings[hole_lower][lo:hi+1]
                    + [rings[i][hi] for i in range(hole_lower+1,hole_upper)]
                    + rings[hole_upper][lo:hi+1][::-1]
                    + [rings[i][lo] for i in range(hole_upper-1,hole_lower,-1)])
        sign = 1 if side==0 else -1
        count = len(boundary)
        previous = boundary
        sleeve = [
            (.249,.069,1.437,.078,.101), (.270,.069,1.432,.077,.094),
            (.295,.068,1.425,.077,.087), (.322,.066,1.423,.077,.082),
            (.346,.063,1.421,.074,.077), (.367,.063,1.420,.071,.073),
            (.372,.063,1.420,.073,.074), (.379,.063,1.420,.073,.074),
        ]
        for row, (x, y, z, ry, rz) in enumerate(sleeve):
            points = []
            for j, idx in enumerate(boundary):
                a = -math.pi/2 + sign*TAU*(j-half_hole)/count
                prev = p.vertices[idx]
                roll = (.003*math.sin(6*a+row) + .002*math.cos(3*a))*(1-row/10)
                target = Vector((sign*(x-.010*math.sin(a)), y+(ry+roll)*math.cos(a), z+(rz+roll)*math.sin(a)))
                if row == 0:
                    target = target.lerp(Vector((sign*max(.194,abs(prev.x)),prev.y,prev.z)), .30)
                points.append(ease_point(target, .012, lambda q: sign*q.x>.16))
            ring = p.loop(points)
            bounds = (.69,.04+side*.39,.29,.32) if row < 5 else (.02,.955,.94,.025)
            def sleeve_uv(j):
                v0, v1 = (row/5, (row+1)/5) if row<5 else ((row-5)/3, (row-4)/3)
                return uv_rect(bounds, j/count,(j+1)/count,v0,v1)
            p.band(previous, ring, sleeve_uv)
            previous = ring
    return p.mesh("tee-white")


def jeans():
    p = Panels()
    n, gusset = 40, 8
    hips = []
    for i,(z,wx,front,back) in enumerate((
        (.799,.208,.122,.141), (.865,.204,.121,.141), (.907,.198,.122,.144),
        (.940,.187,.126,.149), (.969,.177,.126,.149), (.976,.177,.125,.145),
        (.999,.167,.121,.137), (1.006,.166,.119,.136), (1.009,.165,.117,.135),
    )):
        coords = []
        for j in range(n):
            a = TAU*j/n
            ca,sa = math.cos(a),math.sin(a)
            depth = front if ca>=0 else back
            y = .013-depth*math.copysign(abs(ca)**.82,ca)
            # Curve the fly and back rise up into the first hip ring.
            rise = max(0,2-i)*(.035 + .007*max(0,-ca))*abs(ca)**3
            yoke = .013*max(0,-ca)*(i/8)
            coords.append(ease_point((wx*sa,y,z+rise+yoke),.009))
        hips.append(p.loop(coords))

    def hip_uv(row,j):
        front = j < n//4 or j >= 3*n//4
        col = (j+n//4)%n if front else j-n//4
        return uv_rect((.02 if front else .51,.67,.47,.29),
                       col/(n/2),(col+1)/(n/2),row/8,(row+1)/8)

    for i in range(len(hips)-1):
        p.band(hips[i],hips[i+1],lambda j: hip_uv(i,j))
    front,back = p.vertices[hips[0][0]],p.vertices[hips[0][n//2]]
    bridge = []
    for j in range(1,gusset):
        u = j/gusset
        q = back.lerp(front,u)
        q.z -= .061*math.sin(math.pi*u)
        bridge.append(p.point(q))

    profile = [
        # Height, centre X and Y, width, fore-aft depth, crease strength.
        (.779,.111,.013,.098,.118,.003), (.747,.112,.010,.096,.111,.004),
        (.714,.112,.014,.092,.105,.005), (.673,.118,.019,.089,.103,.004),
        (.630,.123,.028,.086,.106,.006), (.580,.131,.038,.081,.110,.005),
        (.536,.142,.044,.079,.111,.006), (.505,.149,.048,.079,.110,.008),
        (.475,.151,.056,.079,.115,.008), (.444,.153,.058,.080,.109,.007),
        (.410,.154,.061,.081,.107,.006), (.367,.159,.064,.080,.100,.005),
        (.319,.163,.062,.077,.097,.005), (.270,.169,.055,.074,.096,.006),
        (.220,.170,.048,.072,.090,.005), (.178,.168,.042,.070,.089,.006),
        (.143,.168,.035,.069,.092,.005), (.133,.170,.026,.071,.101,.004),
        (.122,.170,.022,.073,.103,.004), (.113,.170,.020,.075,.104,.003),
        (.105,.170,.018,.076,.106,.002), (.098,.170,.017,.076,.107,.001),
    ]
    for side in (1,-1):
        if side==1:
            prior = hips[0][:n//2+1]+bridge
        else:
            prior = [hips[0][0]]+hips[0][n//2:][::-1]+bridge
        count = len(prior)
        for row,(z,cx,cy,rx,ry,crease) in enumerate(profile):
            points = []
            for j in range(count):
                angle = math.radians(-46+272*j/(n/2) if j<=n/2 else 226+88*(j-n/2)/gusset)
                s,c = math.sin(angle),math.cos(angle)
                wrinkle = crease*(.60*math.sin(5*angle+row*1.9)+.40*math.cos(9*angle-row*1.7))
                x = side*(cx+(rx+wrinkle)*math.copysign(abs(s)**.92,s))
                y = cy-(ry+wrinkle)*math.copysign(abs(c)**.83,c)
                height = z + crease*.85*math.sin(6*angle+.85*row+.52*side)
                points.append(ease_point((x,y,height),.013, lambda q:q.x*side>.008))
            current = p.loop(points)
            def leg_uv(j):
                bounds = (.02 if side==1 else .51,.055,.47,.59)
                return uv_rect(bounds,j/count,(j+1)/count,1-(row+1)/len(profile),1-row/len(profile))
            p.band(prior,current,leg_uv)
            prior = current
    return p.mesh("jeans-denim-standard")


def sneakers():
    p = Panels()
    n = 40
    sole = [
        (-.022,.94),(-.019,.990),(-.013,1.005),(-.009,.992),
        (-.005,1.004),(.010,1.0),(.022,.977),
    ]
    upper = (0,.12,.26,.43,.61,.80,.94,1.0)

    def outline(side,a,scale=1.0):
        ca,sa = math.cos(a),math.sin(a)
        # The wider, slightly square toe shifts toward the big toe and
        # transitions through a pinched waist into a rounded heel cup.
        y = -.041 - scale*.160*math.copysign(abs(ca)**.84,ca)
        width = .061+.010*max(0,ca)-.008*math.exp(-((y-.027)/.047)**2)
        center = .180+.014*max(0,ca)-.012*max(0,-ca)
        return Vector((side*(center+scale*width*math.copysign(abs(sa)**.92,sa)),y,0))

    for side in (1,-1):
        loops = []
        for z,scale in sole:
            points = []
            for j in range(n):
                a = TAU*j/n
                q = outline(side,a,scale)
                q.z = z + .006*max(0,math.cos(a))**8
                points.append(q)
            loops.append(p.loop(points))
        center = p.point((side*.178,-.050,-.023))
        for j in range(n):
            a,b = TAU*j/n,TAU*(j+1)/n
            def outsole_uv(angle):
                return (.86+.103*math.sin(angle),.135-.095*math.cos(angle))
            p.face((center,loops[0][(j+1)%n],loops[0][j]),[(.86,.135),outsole_uv(b),outsole_uv(a)],False)
        for i in range(len(loops)-1):
            p.band(loops[i],loops[i+1],lambda j:uv_rect((.02,.055,.70,.21),j/n,(j+1)/n,
                                                       i/(len(loops)-1),(i+1)/(len(loops)-1)))
        previous = loops[-1]
        upper_start = len(p.faces)
        for i,t in enumerate(upper[1:],1):
            points = []
            for j in range(n):
                a = TAU*j/n
                ca,sa = math.cos(a),math.sin(a)
                q = p.vertices[loops[-1][j]].copy()
                collar = Vector((side*(.174+.046*sa),.049-(.066 if ca>=0 else .063)*ca,
                          .093+.028*max(0,ca)**2+.006*max(0,-ca)-.014*abs(sa)**2))
                current = q.lerp(collar,t)
                current.z += .017*math.sin(math.pi*t)*(1-.42*abs(sa))
                if i>1 and i<len(upper)-1:
                    hit,_,_,_ = BODY_MESH.ray_cast(Vector((current.x,current.y,.146)),Vector((0,0,-1)),.144)
                    if hit and hit.z < .133:
                        current.z = max(current.z,hit.z+.009)
                if i in {2,5,7}:
                    current.x += side*.0018*sa
                    current.y -= .0018*ca
                points.append(current)
            loop = p.loop(points)
            p.band(previous,loop,lambda j:uv_rect((.02,.325,.70,.59),j/n,(j+1)/n,
                                                   (i-1)/(len(upper)-1),i/(len(upper)-1)))
            previous=loop
        for depth,ix in ((.003,.002),(.009,.005),(.023,.006)):
            points = []
            for j,key in enumerate(previous):
                a=TAU*j/n
                origin=p.vertices[loop[j]]
                points.append((origin.x-side*ix*math.sin(a),origin.y+ix*math.cos(a),origin.z-depth))
            inner=p.loop(points)
            p.band(previous,inner,lambda j:uv_rect((.75,.31,.23,.12),j/n,(j+1)/n,(depth-.002)/.026,depth/.026))
            previous=inner
        polys=p.faces[upper_start:]
        top = BVHTree.FromPolygons(p.vertices,polys)

        def surface(x,y):
            loc,_,_,_ = top.ray_cast(Vector((x,y,.195)),Vector((0,0,-1)),.19)
            if not loc:
                raise ValueError(f"No shoe surface at {x:.4f}, {y:.4f}")
            return loc.z

        # Flattened, braided lace spans placed on the actual vamp, alternating
        # over and under. Their ends sink into the quarters at the eyelets.
        def lace(cx0,cy0,cx1,cy1,id):
            rings = []
            for j in range(6):
                t = j/5
                x = side*(cx0*(1-t)+cx1*t)
                y = cy0*(1-t)+cy1*t+.0014*math.sin(math.pi*t)
                z = surface(x,y)+(.0025+.0008*id)*math.sin(math.pi*t)
                rings.append(p.loop((x,y+.0025*math.cos(a*TAU/6), z+.00115*math.sin(a*TAU/6)) for a in range(6)))
            for j in range(5):
                p.band(rings[j],rings[j+1],lambda k:uv_rect((.76,.53,.20,.12),k/6,(k+1)/6,j/5,(j+1)/5))

        for k in range(6):
            y = -.113+k*.016
            center = .193-k*.0026
            w = .042-k*.0006
            lace(center-w/2,y,center+w/2,y+.010,1)
            if k<5:
                lace(center+w/2,y,center-w/2-.001,y+.016,0)

        # Toe perforations and quarter stitches are baked into the panel atlas.
    return p.mesh("court-sneakers-white")


def weight(obj):
    # Region memberships are body metadata. Restrict the transfer source to
    # the actual deform groups, while leaving the original Body untouched.
    proxy = BODY.copy()
    bpy.context.collection.objects.link(proxy)
    for group in list(proxy.vertex_groups):
        if group.name not in RIG.data.bones or not RIG.data.bones[group.name].use_deform:
            proxy.vertex_groups.remove(group)
    garment._transfer_weights(obj, proxy, 4)
    bpy.data.objects.remove(proxy, do_unlink=True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.vertex_group_normalize_all(group_select_mode="ALL", lock_active=False)
    for v in obj.data.vertices:
        weights = [g.weight for g in v.groups if g.weight > 0]
        if not weights or len(weights)>4 or abs(sum(weights)-1)>1e-5:
            raise ValueError(f"{obj.name} vertex {v.index} has invalid weights {weights}")
    armature = obj.modifiers.new("Canonical game rig", "ARMATURE")
    armature.object = RIG
    obj.parent = RIG
    if obj.name.startswith("court-sneakers"):
        # The collar does not make a shoe a shin segment. Keep the upper
        # rigid to the foot and retain transferred toe flex at the forefoot.
        for v in obj.data.vertices:
            side = "L" if v.co.x>0 else "R"
            foot, toe = obj.vertex_groups[f"foot.{side}"], obj.vertex_groups[f"toe.{side}"]
            toe_weight = sum(g.weight for g in v.groups if g.group == toe.index)
            for g in [g.group for g in v.groups]:
                obj.vertex_groups[g].remove([v.index])
            foot.add([v.index],1-toe_weight,"REPLACE")
            if toe_weight:
                toe.add([v.index],toe_weight,"REPLACE")


def cloth_thickness(obj, meters):
    modifier = obj.modifiers.new("Fabric edge thickness", "SOLIDIFY")
    modifier.thickness = meters
    modifier.offset = -.35
    modifier.use_rim_only = True
    modifier.use_even_offset = True
    old_faces = len(obj.data.polygons)
    solidify = modifier.name
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=solidify)
    layer = obj.data.uv_layers.active
    rims = len(obj.data.polygons)-old_faces
    for index in range(rims):
        face = obj.data.polygons[old_faces+index]
        corners = uv_rect((.015,.87,.97,.010),index/rims,(index+1)/rims,0,1)
        for loop, uv in zip(face.loop_indices,corners,strict=True):
            layer.data[loop].uv = uv


def build(asset, staging):
    factories = {"tee-white": tee, "jeans-denim-standard": jeans, "court-sneakers-white": sneakers}
    obj = factories[asset]()
    if asset != "court-sneakers-white":
        cloth_thickness(obj, .0026)
    print("@@JSON@@"+json.dumps(build_pbr_material.run(name=f"M_{asset}", textures=[str(ROOT/"materials"/asset)], objects=[obj.name])))
    material = obj.data.materials[0]
    shader = next(node for node in material.node_tree.nodes if node.type=="BSDF_PRINCIPLED")
    shader.inputs["Roughness"].default_value = .75
    shader.inputs["Sheen Weight"].default_value = .16
    next(node for node in material.node_tree.nodes if node.type=="NORMAL_MAP").inputs["Strength"].default_value = .38
    weight(obj)
    print("@@JSON@@"+json.dumps(garment.penetration(obj, BODY)))
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=str(staging/f"{asset}.blend"), compress=True)


if __name__ == "__main__":
    asset, output = sys.argv[sys.argv.index("--")+1:]
    build(asset, Path(output).resolve())
