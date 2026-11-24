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
    "asset-qa", "character-rigging", "export-pipelines", "geometry-nodes",
):
    sys.path.insert(0, str(SKILLS / f"blender-{skill}/scripts"))

import garment
import build_pbr_material
import gn_builder
sys.path.insert(0, str(Path(__file__).resolve().parent))
from catalog_config import TOPS, BOTTOMS, FOOTWEAR

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
        self.head_follow = {}

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
        if self.head_follow:
            influence=mesh.attributes.new("hood_follow_head","FLOAT","POINT")
            for index,weight_value in self.head_follow.items():
                influence.data[index].value=weight_value
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


def tee(asset="tee-white"):
    settings = TOPS.get(asset,{"shape":"tee"})
    shape = settings["shape"]
    is_outer = shape in {"hoodie","windbreaker","puffer"}
    is_long = is_outer or shape=="flannel"
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
    if shape=="tank":
        hole_lower, hole_upper, half_hole = 9, 17, 5
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
            if i>=14 and not is_long and shape!="tank":
                height += .021 * min(1,(i-13)/3) * outer
            if shape=="tank":
                x *= 1-(.09 if i<10 else .15+.09*max(0,min(1,(i-13)/3)))*outer
                if i>=12:
                    height -= .062*max(0,ca)**1.4*(i-11)/10 + .024*max(0,-ca)**2*(i-11)/10
                    height -= .012*outer*min(1,(i-11)/4)
                    y -= .045*max(0,ca)**1.9*(i-11)/10
            if is_long:
                size = .018 if shape=="flannel" else .032
                if shape=="puffer":
                    size += .014 if i%2 else .032
                shell = 1 if i<17 else max(.15,(21-i)/4)
                hinge = .57 if hole_lower<=i<=hole_upper else 0
                x += size*sa*shell*(1-hinge*outer)
                y -= size*ca*shell
                height += .004*outer*min(1,i/10)
                if i<8 and shape in ("hoodie","windbreaker"):
                    height -= .025*(8-i)/8
                if shape=="flannel" and i<6:
                    height -= .041*abs(ca)**2 * (6-i)/6
            if hole_lower <= i <= hole_upper and shape!="tank":
                shoulder_arch = .011 if is_long else .023
                height += shoulder_arch*outer*(i-hole_lower)/(hole_upper-hole_lower)
            if shape=="tank" and i>=14:
                start=Vector((x,y,height))
                q=ease_point(start,.009)
                if (q-start).length>.012:
                    q=start+(q-start).normalized()*.012
            else:
                q = Vector((x,y,height)) if i<5 or i>=16 else ease_point((x,y,height),.014)
            coords.append(q)
        rings.append(p.loop(coords))

    def torso_uv(row, j):
        # Front and back grain are oriented from hem to shoulder. Collar and
        # lower hem use their own texture strip, with two stitched courses.
        v0, v1 = row/(len(rings)-1), (row+1)/(len(rings)-1)
        if shape=="puffer" and (j in {0,n-1}) and 3<=row<19:
            return uv_rect((.984,.04,.014,.72),(j==0)/2,(j==0)/2+.5,v0,v1)
        if shape=="windbreaker" and j in {3,n-4} and 3<=row<19:
            return uv_rect((.984,.04,.014,.72),0,1,v0,v1)
        if row < 3 or row >= 19:
            v0, v1 = ((row/3, (row+1)/3) if row<3 else ((row-19)/2, (row-18)/2))
            return uv_rect((.02,.955,.94,.025), j/n, (j+1)/n, v0, v1)
        front = j < n//4 or j >= 3*n//4
        col = (j+n//4)%n if front else j-n//4
        return uv_rect((.02 if front else .36,.03,.30,.77), col/(n/2), (col+1)/(n/2), v0, v1)

    for i in range(len(rings)-1):
        omitted = {j for center in holes for j in range(center-half_hole, center+half_hole)}
        excluded = omitted if hole_lower<=i<hole_upper else set()
        if shape=="windbreaker":
            excluded = excluded | {0,1,2,n-3,n-2,n-1}
        p.band(rings[i], rings[i+1], lambda j: torso_uv(i,j), excluded)
    for side, center in enumerate(holes):
        lo, hi = center-half_hole, center+half_hole
        boundary = (rings[hole_lower][lo:hi+1]
                    + [rings[i][hi] for i in range(hole_lower+1,hole_upper)]
                    + rings[hole_upper][lo:hi+1][::-1]
                    + [rings[i][lo] for i in range(hole_upper-1,hole_lower,-1)])
        if shape=="tank":
            # Soften the drafted armhole into a continuous oval before
            # running the narrow binding around the turned edge.
            for _ in range(3):
                smooth = [p.vertices[key].lerp(
                    (p.vertices[boundary[(j-1)%len(boundary)]]+p.vertices[boundary[(j+1)%len(boundary)]])*.5,.46)
                    for j,key in enumerate(boundary)]
                for key,q in zip(boundary,smooth,strict=True):
                    p.vertices[key]=q
            # Narrow binding follows the armhole to the inside of the top.
            last = boundary
            center = sum((p.vertices[index] for index in boundary),Vector())/len(boundary)
            for band, inset in enumerate((.065,.125,.146)):
                bordered = []
                for idx in boundary:
                    q = p.vertices[idx].lerp(center,inset)
                    q.x += (1 if side==0 else -1)*(.003 if band<2 else -.002)
                    bordered.append(q)
                current=p.loop(bordered)
                edge_trim(p,last,current,band,3)
                last=current
            continue
        sign = 1 if side==0 else -1
        count = len(boundary)
        previous = boundary
        sleeve = [
            (.249,.069,1.437,.078,.101), (.270,.069,1.432,.077,.094),
            (.295,.068,1.425,.077,.087), (.322,.066,1.423,.077,.082),
            (.346,.063,1.421,.074,.077), (.367,.063,1.420,.071,.073),
            (.372,.063,1.420,.073,.074), (.379,.063,1.420,.073,.074),
        ]
        if is_long:
            sleeve = [
                (.247,.069,1.439,.083,.105),(.271,.069,1.432,.081,.095),
                (.302,.068,1.424,.080,.088),(.338,.067,1.421,.076,.084),
                (.373,.066,1.420,.074,.081),(.403,.070,1.421,.068,.078),
                (.429,.073,1.423,.065,.077),(.449,.077,1.425,.066,.078),
                (.472,.077,1.426,.063,.074),(.498,.075,1.424,.062,.075),
                (.524,.071,1.422,.059,.071),(.554,.070,1.418,.056,.067),
                (.584,.067,1.418,.052,.063),(.618,.066,1.419,.047,.059),
                (.641,.065,1.418,.045,.055),(.662,.065,1.419,.039,.049),
                (.675,.065,1.420,.034,.042),(.686,.064,1.421,.034,.041),
                (.701,.063,1.421,.033,.039),
            ]
        trim = len(sleeve)-3
        for row, (x, y, z, ry, rz) in enumerate(sleeve):
            if is_outer:
                excess = (.010 if shape!="puffer" else (.019 if row%2 else .010))*(1-.60*(row/len(sleeve))**2)
                ry += excess
                rz += excess
            points = []
            for j, idx in enumerate(boundary):
                a = -math.pi/2 + sign*TAU*(j-half_hole)/count
                prev = p.vertices[idx]
                roll = (.003*math.sin(6*a+row) + .002*math.cos(3*a))*(1-row/len(sleeve)) if is_long else (.003*math.sin(6*a+row) + .002*math.cos(3*a))*(1-row/10)
                target = Vector((sign*(x-.010*math.sin(a)), y+(ry+roll)*math.cos(a), z+(rz+roll)*math.sin(a)))
                if row == 0:
                    target = target.lerp(Vector((sign*max(.194,abs(prev.x)),prev.y,prev.z)), .30)
                    if is_long:
                        target.x = sign*max(abs(target.x),abs(prev.x)+.011)
                elif is_long:
                    target.x = sign*max(abs(target.x),abs(p.vertices[previous[j]].x)+.006)
                points.append(ease_point(target, .012, lambda q: sign*q.x>.16))
            ring = p.loop(points)
            bounds = (.69,.04+side*.39,.29,.32) if row < trim else (.02,.955,.94,.025)
            def sleeve_uv(j):
                v0, v1 = (row/trim, (row+1)/trim) if row<trim else ((row-trim)/3, (row-trim+1)/3)
                return uv_rect(bounds, j/count,(j+1)/count,v0,v1)
            p.band(previous, ring, sleeve_uv)
            previous = ring
    if is_long:
        top_details(p,rings[-1],shape,settings.get("hood"))
    return p.mesh(asset)


def edge_trim(panel, previous, current, band, row_count):
    count = len(previous)
    panel.band(previous,current,lambda j:uv_rect((.02,.952,.94,.032),j/count,(j+1)/count,
                                                 band/row_count,(band+1)/row_count))


def panel_patch(panel, surface, corners, uv_bounds, skin_offset=.003):
    """Lay a sewn patch onto the exterior of a curved front panel."""
    coords = []
    for u in (0,.06,.24,.50,.76,.94,1):
        low = Vector(corners[0]).lerp(Vector(corners[1]),u)
        high = Vector(corners[3]).lerp(Vector(corners[2]),u)
        column = []
        for v in (0,.09,.35,.67,.91,1):
            x,z = low.lerp(high,v)
            q,_,_,_ = surface.ray_cast(Vector((x,-.5,z)),Vector((0,1,0)),.6)
            if q is None:
                raise ValueError(f"Pattern panel missed garment surface at {x:.4f}, {z:.4f}")
            q.y -= skin_offset * (1 if .01<u<.99 and .01<v<.99 else -.22)
            column.append(panel.point(q))
        coords.append(column)
    for j in range(6):
        for i in range(5):
            panel.face((coords[j][i],coords[j+1][i],coords[j+1][i+1],coords[j][i+1]),
                       uv_rect(uv_bounds,j/6,(j+1)/6,i/5,(i+1)/5))


def cord(panel, points, radius=.0028, uv_bounds=(.87,.55,.10,.11)):
    """Small smooth sweep with a real textile cross section."""
    loops = []
    for i,co in enumerate(points):
        p = Vector(co)
        direction = Vector(points[min(i+1,len(points)-1)])-Vector(points[max(i-1,0)])
        direction.normalize()
        a = direction.cross(Vector((0,1,0)))
        if a.length<.001:
            a=direction.cross(Vector((1,0,0)))
        a.normalize()
        b=direction.cross(a)
        ring = panel.loop(p+radius*(a*math.cos(TAU*j/6)+b*math.sin(TAU*j/6)) for j in range(6))
        if loops:
            panel.band(loops[-1],ring,lambda j:uv_rect(uv_bounds,j/6,(j+1)/6,(i-1)/(len(points)-1),i/(len(points)-1)))
        loops.append(ring)


def drawstring(panel,points):
    mesh=bpy.data.meshes.new("Hood drawstring path")
    mesh.from_pydata(points,[(j,j+1) for j in range(len(points)-1)],[])
    obj=bpy.data.objects.new("Hood drawstring template",mesh)
    bpy.context.collection.objects.link(obj)
    spec={
        "name":"Hood drawstring sweep",
        "inputs":[["Geometry","GEOMETRY"]],
        "outputs":[["Geometry","GEOMETRY"]],
        "nodes":{
            "path":["GeometryNodeMeshToCurve"],
            "circle":["GeometryNodeCurvePrimitiveCircle",{},{"Resolution":6,"Radius":.0029}],
            "sweep":["GeometryNodeCurveToMesh"],
        },
        "links":[["in.Geometry","path.Mesh"],["path.Curve","sweep.Curve"],
                 ["circle.Curve","sweep.Profile Curve"],["sweep.Mesh","out.Geometry"]],
    }
    result=gn_builder.run(spec=spec,apply_to=obj.name)
    if not result.get("ok"):
        raise RuntimeError(result)
    dg=bpy.context.evaluated_depsgraph_get()
    evaluated=obj.evaluated_get(dg)
    curve=evaluated.to_mesh()
    try:
        ids=panel.loop(v.co for v in curve.vertices)
        for face in curve.polygons:
            u=face.index%6
            v=face.index//6
            panel.face(tuple(ids[i] for i in face.vertices),
                       uv_rect((.87,.55,.10,.11),u/6,(u+1)/6,v/(len(points)-1),(v+1)/(len(points)-1)))
    finally:
        evaluated.to_mesh_clear()
        bpy.data.objects.remove(obj,do_unlink=True)
        bpy.data.meshes.remove(mesh)
    print("@@JSON@@"+json.dumps(result))


def hood(panel, neck, hood_mode):
    count = len(neck)
    if hood_mode == "up":
        # Face opening to crown. The opening clears ears and cheeks in
        # head space. Round lobes wrap behind the back of the skull.
        profiles = [
            (.113,.181,.009,1.657), (.120,.185,.013,1.657),
            (.126,.192,.028,1.658), (.128,.190,.059,1.656),
            (.123,.179,.105,1.658), (.110,.156,.142,1.663),
            (.083,.119,.171,1.668), (.054,.080,.194,1.675),
            (.024,.046,.211,1.678), (.008,.022,.218,1.678),
        ]
    else:
        # Laid on the upper back with an open, rolled lip and soft crown folds.
        profiles = [
            (.105,.030,.115,1.510), (.111,.034,.123,1.506),
            (.119,.033,.139,1.494), (.123,.033,.165,1.471),
            (.119,.031,.188,1.441), (.101,.026,.209,1.411),
            (.076,.022,.216,1.385), (.047,.015,.216,1.371),
            (.019,.010,.212,1.365), (.006,.007,.210,1.364),
        ]
    rings = []
    for row,(rx,rz,y,z) in enumerate(profiles):
        coords = []
        for j in range(count):
            a=TAU*j/count
            c,s=math.cos(a),math.sin(a)
            fold=.005*math.sin(5*a+row*.43)*math.sin(math.pi*row/(len(profiles)-1))
            height=z-(rz+fold)*c
            depth=y-.025*max(0,-c)*(1-row/len(profiles)) if hood_mode=="up" else y+.019*c
            if hood_mode=="up":
                depth += .016*max(0,c)
            coords.append(((rx+fold)*s,depth,height))
        ring=panel.loop(coords)
        if hood_mode=="up":
            for key,xyz in zip(ring,coords,strict=True):
                t=min(1,max(0,(xyz[2]-1.470)/.114))
                panel.head_follow[key]=t*t*(3-2*t)
        if rings:
            panel.band(rings[-1],ring,lambda j:uv_rect((.685,.045,.293,.72),j/count,(j+1)/count,
                                                       (row-1)/(len(profiles)-1),row/(len(profiles)-1)))
        rings.append(ring)
    end = sum((panel.vertices[i] for i in rings[-1]),Vector())/count
    end.y += .003
    cap = panel.point(end)
    if hood_mode=="up":
        panel.head_follow[cap]=1.0
    for j,key in enumerate(rings[-1]):
        a,b=TAU*j/count,TAU*(j+1)/count
        panel.face((key,rings[-1][(j+1)%count],cap),
                   [(.85+.07*math.cos(a),.82+.034*math.sin(a)),
                    (.85+.07*math.cos(b),.82+.034*math.sin(b)),(.85,.82)])
    if hood_mode=="up":
        opening = rings[0]
        # Join the arc below the face to the neckline. The upper arc
        # remains open and receives a turned edge at solidify.
        hood_base = [opening[j%count] for j in range(-7,8)]
        # Pattern anchors sit in the front third of the hoodie's neck binding.
        collar_base = [neck[j%count] for j in range(-7,8)]
    else:
        hood_base = [rings[0][j%count] for j in range(-7,8)]
        collar_base = [neck[(count//2+j)%count] for j in range(-7,8)]
    # A visible continuous hinge joining the hood to the inner collar.
    for j in range(len(hood_base)-1):
        panel.face((collar_base[j],collar_base[j+1],hood_base[j+1],hood_base[j]),
                   uv_rect((.02,.958,.94,.025),j/14,(j+1)/14,0,1))


def top_details(p, neck, shape, hood_mode):
    surface=BVHTree.FromPolygons(p.vertices,p.faces)
    if shape=="flannel":
        for sign in (-1,1):
            x0,x1=sorted((sign*.052,sign*.138))
            panel_patch(p,surface,((x0,1.267),(x1,1.267),(x1,1.370),(x0,1.370)),(.69,.46,.135,.21),.005)
            panel_patch(p,surface,((x0,1.346),(x1,1.346),(x1,1.376),(x0,1.376)),(.835,.55,.14,.09),.007)
        # Fold the collar band down to two pointed leaves. Connect the
        # upper edge to the crew opening so the points stay with the neckline.
        count=len(neck)
        for side in (1,-1):
            last=[neck[(side*j)%count] for j in range(0, count//2+1)]
            for row in range(1,5):
                coords=[]
                fraction=row/4
                for j,idx in enumerate(last):
                    t=j/(len(last)-1)
                    q=p.vertices[neck[(side*j)%count]].copy()
                    spread=(.026+.028*math.exp(-((t-.24)/.15)**2))*math.sin(math.pi*t)**.4
                    q.x += side*(.005+spread)*fraction
                    q.y -= .046*max(0,math.cos(t*math.pi))*fraction
                    q.z += (.006 if row==1 else (-.006-.065*math.exp(-((t-.21)/.16)**2))*fraction)*math.sin(math.pi*t)**.4
                    if j in (0,len(last)-1):
                        q.y -= (.006 if j==0 else -.003)*fraction
                        q.z += .004*fraction
                    coords.append(q)
                current=p.loop(coords)
                for j in range(len(last)-1):
                    p.face((last[j],last[j+1],current[j+1],current[j]),
                           uv_rect((.69,.69,.27,.15),j/(len(last)-1),(j+1)/(len(last)-1),(row-1)/4,row/4))
                last=current
        for z in (1.02,1.095,1.17,1.245,1.32,1.395,1.445):
            q,_,_,_=surface.ray_cast(Vector((.003,-.44,z)),Vector((0,1,0)),.5)
            if q:
                cord(p,[q+Vector((0,-.001,-.004)),q+Vector((0,-.005,0)),q+Vector((0,-.001,.004))],
                     radius=.004, uv_bounds=(.94,.841,.04,.04))
    if shape=="hoodie":
        panel_patch(p,surface,((-.137,1.008),(.137,1.008),(.096,1.140),(-.096,1.140)),
                    (.69,.10,.29,.27),.007)
        for sign in (-1,1):
            line=[]
            for i in range(8):
                f=i/7
                z=1.463-.186*f
                x=sign*(.047+.018*f+.009*math.sin(f*3))
                q,_,_,_=surface.ray_cast(Vector((x,-.5,z)),Vector((0,1,0)),.5)
                if q:
                    line.append(q+Vector((0,-(.003+.011*math.sin(math.pi*f)),0)))
            if len(line)>1:
                drawstring(p,line)
        hood(p,neck,hood_mode)
    if shape in ("windbreaker","puffer"):
        count=len(neck)
        if shape=="windbreaker":
            active=list(range(3,count-3))
        else:
            active=list(range(count))
        last=neck
        for j,(height,stretch) in enumerate(((.013,1.04),(.053,1.05),(.060,1.01))):
            coords=[]
            for i in range(count):
                v=p.vertices[neck[i]]
                coords.append((v.x*stretch,.072+(v.y-.072)*stretch,v.z+height))
            cur=p.loop(coords)
            p.band(last,cur,lambda u:uv_rect((.02,.955,.94,.025),u/count,(u+1)/count,j/3,(j+1)/3),
                   [x for x in range(count) if x not in active or (x+1)%count not in active])
            last=cur


def jeans(asset="jeans-denim-standard"):
    shape = BOTTOMS.get(asset,{"shape":"standard"})["shape"]
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
            fullness = .010 if shape in ("baggy","cargo","sweats","shorts") and i<5 else 0
            if shape in ("sweats","shorts") and i>4:
                y -= .003*math.cos(a*30)*ca
            coords.append(ease_point(((wx+fullness)*sa,y-.55*fullness*ca,z+rise+yoke),.009))
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
    if shape=="shorts":
        profile=profile[:6]+[
            (.565,.134,.039,.093,.115,.003),(.556,.135,.040,.095,.116,.002),
            (.548,.136,.040,.095,.116,.001),
        ]
    for side in (1,-1):
        if side==1:
            prior = hips[0][:n//2+1]+bridge
        else:
            prior = [hips[0][0]]+hips[0][n//2:][::-1]+bridge
        count = len(prior)
        for row,(z,cx,cy,rx,ry,crease) in enumerate(profile):
            if shape=="skinny":
                taper = min(.024,.081*(.80-z))
                rx -= taper
                ry -= taper*.90
                crease *= .60
            elif shape=="baggy":
                volume=min(.036,.12*(.79-z))
                rx+=volume
                ry+=volume*.92
                crease*=1.2
                if z<.17:
                    z-=.017
                    crease+=.003
            elif shape in ("cargo","sweats"):
                room=.025*math.sin(math.pi*min(.9,max(.16,(.80-z)/.75)))
                if shape=="sweats" and z<.14:
                    room-=.034*(.14-z)/.042
                rx+=room
                ry+=room*.8
                if z<.26 and shape=="sweats":
                    crease+=.008
            elif shape=="shorts":
                rx+=.015*min(1,row/3)
                ry+=.015*min(1,row/3)
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
    bottom_details(p,shape)
    return p.mesh(asset)


def bottom_details(p,shape):
    surface=BVHTree.FromPolygons(p.vertices,p.faces)
    if shape=="cargo":
        for side in (-1,1):
            # Bellows patch with anchored edges and a raised center pleat.
            for flap in (False,True):
                pocket=[]
                zs=(.566,.578,.624,.676,.699,.707) if not flap else (.679,.687,.701,.721,.727,.731)
                for i,z in enumerate(zs):
                    row=[]
                    for j,u in enumerate((0,.07,.33,.50,.67,.93,1)):
                        y=.007+(u-.5)*(.125 if flap else .117)
                        q,_,_,_=surface.ray_cast(Vector((side*.5,y,z)),Vector((-side,0,0)),.45)
                        if q is None:
                            raise ValueError("Cargo pocket did not meet the thigh")
                        loft=(.009 if flap else .008)*math.sin(math.pi*u)**.5
                        q.x += side*((loft+.005*(j in (2,4)))*(1 if i not in (0,5) else .15)-.0009+(.0039 if flap else 0))
                        row.append(p.point(q))
                    if pocket:
                        region=(.775,.80,.17,.135) if flap else (.775,.685,.17,.135)
                        old=pocket[-1]
                        for j in range(6):
                            p.face((old[j],old[j+1],row[j+1],row[j]),
                                   uv_rect(region,j/6,(j+1)/6,(i-1)/5,i/5))
                    pocket.append(row)
    if shape in ("sweats","shorts"):
        for side in (-1,1):
            line=[]
            for i in range(10):
                t=i/9
                x=side*(.014+t*.020+.006*math.sin(t*5))
                z=.994-t*.126
                q,_,_,_=surface.ray_cast(Vector((x,-.4,z)),Vector((0,1,0)),.36)
                if q:
                    line.append(q+Vector((0,-(.0031+.009*math.sin(math.pi*t)),0)))
            if len(line)>1:
                cord(p,line,radius=.0024,uv_bounds=(.86,.31,.07,.16))


def sneakers(asset="court-sneakers-white"):
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
    return p.mesh(asset)


def sandals(asset):
    p=Panels()
    n=36
    style=FOOTWEAR[asset]["shape"]
    for side in (1,-1):
        c=(side*.177,-.037)
        loops=[]
        for layer,(z,sw) in enumerate(((-.020,.940),(-.016,1.0),(-.003,1.012),(.005,1.0),(.008,.958))):
            outline=[]
            for j in range(n):
                a=TAU*j/n
                ca,sa=math.cos(a),math.sin(a)
                y=c[1]-.152*math.copysign(abs(ca)**.88,ca)*sw
                cx=c[0]+side*(.016*max(0,ca)-.010*max(0,-ca))
                w=(.057+.007*max(0,ca)-.009*math.exp(-((y-.018)/.056)**2))*sw
                x=cx+side*w*math.copysign(abs(sa)**.92,sa)
                rocker=.004*max(0,ca)**7 + .002*max(0,-ca)**8
                outline.append((x,y,z+rocker))
            cur=p.loop(outline)
            if loops:
                p.band(loops[-1],cur,lambda j:uv_rect((.02,.035,.92,.116),j/n,(j+1)/n,(layer-1)/4,layer/4))
            loops.append(cur)
        for ring,z,atlas in ((loops[0],-.020,(.25,.365)),(loops[-1],.006,(.25,.733))):
            center=p.point((*c,z))
            for j in range(n):
                def uv(a):
                    return (atlas[0]+.19*math.sin(a),atlas[1]-.158*math.cos(a))
                p.face((ring[j],ring[(j+1)%n],center),[uv(TAU*j/n),uv(TAU*(j+1)/n),atlas])

        if style=="slide":
            previous=None
            steps=20
            for i,(y,width,height) in enumerate(((-.103,.058,.075),(-.099,.060,.078),(-.083,.061,.086),(-.065,.060,.100),
                                                  (-.044,.057,.110),(-.027,.054,.116),(-.010,.049,.120),(-.006,.048,.120))):
                points=[]
                for j in range(steps+1):
                    a=math.pi*j/steps
                    x=side*(.180+width*math.cos(a)+.007*max(0,-y/.10))
                    arch=math.sin(a)**.90
                    z=.002+height*arch
                    if 2<j<steps-2:
                        q,_,_,_=BODY_MESH.ray_cast(Vector((x,y,.149)),Vector((0,0,-1)),.146)
                        if q:
                            z=max(z,q.z+.005)
                    points.append((x,y-.007*arch,z))
                current=p.loop(points)
                if previous:
                    for j in range(steps):
                        p.face((previous[j],previous[j+1],current[j+1],current[j]),
                               uv_rect((.53,.40,.44,.43),j/steps,(j+1)/steps,(i-1)/7,i/7))
                previous=current
        else:
            tip_starts=(side*.183,-.126,.045)
            cord(p,[(side*.183,-.127,.006),(side*.183,-.127,.031),tip_starts],
                 radius=.0048,uv_bounds=(.58,.40,.36,.35))
            for branch in (-1,1):
                previous=None
                for j in range(12):
                    t=j/11
                    x=side*(.183+branch*.052*t + .005*math.sin(math.pi*t))
                    y=-.126+.137*t
                    z=.046+.042*math.sin(math.pi*t)**.9-.045*t**5
                    w=(.004+.006*math.sin(t*1.76))*(1-.18*t)
                    coordinates=[]
                    for k in range(8):
                        a=TAU*k/8
                        coordinates.append((x+side*w*math.cos(a)*.88,
                                            y-branch*w*math.cos(a)*.40,
                                            z+.00175*math.sin(a)))
                    loop=p.loop(coordinates)
                    if previous:
                        p.band(previous,loop,lambda k:uv_rect((.56,.39,.41,.42),k/8,(k+1)/8,(j-1)/11,j/11))
                    previous=loop
    return p.mesh(asset)


def smooth_sleeve_weights(obj):
    """Blend the chest and upper-arm influences across the armhole seam."""
    adjacency=[[] for _ in obj.data.vertices]
    for edge in obj.data.edges:
        a,b=edge.vertices
        adjacency[a].append(b)
        adjacency[b].append(a)
    vertices=[v.index for v in obj.data.vertices if .128<abs(v.co.x)<.40 and v.co.z>1.285]
    weights=[{g.group:g.weight for g in v.groups} for v in obj.data.vertices]
    for _ in range(5):
        updated={}
        for i in vertices:
            amount=.62*max(0,1-abs(abs(obj.data.vertices[i].co.x)-.23)/.16)
            blend={joint:w*(1-amount) for joint,w in weights[i].items()}
            for neighbor in adjacency[i]:
                for joint,w in weights[neighbor].items():
                    blend[joint]=blend.get(joint,0)+w*amount/len(adjacency[i])
            updated[i]=blend
        for i,w in updated.items():
            weights[i]=w
    for i in vertices:
        for group in [g.group for g in obj.data.vertices[i].groups]:
            obj.vertex_groups[group].remove([i])
        keep=sorted(((joint,w) for joint,w in weights[i].items() if w>.001),key=lambda v:-v[1])[:4]
        total=sum(w for joint,w in keep)
        for joint,w in keep:
            obj.vertex_groups[joint].add([i],w/total,"REPLACE")


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
    if TOPS.get(obj.name,{}).get("shape") in {"flannel","hoodie","windbreaker","puffer"}:
        smooth_sleeve_weights(obj)
    head_map=obj.data.attributes.get("hood_follow_head")
    if head_map:
        head=obj.vertex_groups["spine.006"]
        for v in obj.data.vertices:
            blend=head_map.data[v.index].value
            if blend<=0:
                continue
            weights={g.group:g.weight*(1-blend) for g in v.groups}
            weights[head.index]=blend+weights.get(head.index,0)
            for i in [g.group for g in v.groups]:
                obj.vertex_groups[i].remove([v.index])
            keep=sorted(((i,w) for i,w in weights.items() if w>.001),key=lambda item:-item[1])[:4]
            total=sum(w for i,w in keep)
            for i,w in keep:
                obj.vertex_groups[i].add([v.index],w/total,"REPLACE")
    for v in obj.data.vertices:
        weights = [g.weight for g in v.groups if g.weight > 0]
        if not weights or len(weights)>4 or abs(sum(weights)-1)>1e-5:
            raise ValueError(f"{obj.name} vertex {v.index} has invalid weights {weights}")
    armature = obj.modifiers.new("Canonical game rig", "ARMATURE")
    armature.object = RIG
    obj.parent = RIG
    if obj.name in FOOTWEAR or obj.name=="court-sneakers-white":
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
    if asset in TOPS:
        obj = tee(asset)
    elif asset in BOTTOMS:
        obj = jeans(asset)
    elif asset in FOOTWEAR:
        obj = sneakers(asset) if FOOTWEAR[asset]["shape"]=="court" else sandals(asset)
    else:
        obj = factories[asset]()
    if not asset.startswith("court-sneakers"):
        cloth_thickness(obj, .0037 if asset=="slides-black" else .0026)
    shared=bpy.data.materials.get("M_hoodie-gray-down") if asset=="hoodie-gray-up" else None
    if shared:
        obj.data.materials.append(shared)
    else:
        print("@@JSON@@"+json.dumps(build_pbr_material.run(name=f"M_{asset}", textures=[str(ROOT/"materials"/asset)], objects=[obj.name])))
    material = obj.data.materials[0]
    shader = next(node for node in material.node_tree.nodes if node.type=="BSDF_PRINCIPLED")
    shader.inputs["Roughness"].default_value = .75
    shader.inputs["Sheen Weight"].default_value = .16 if not asset.startswith(("court-sneakers","windbreaker","puffer","slides","flip-flops")) else 0
    next(node for node in material.node_tree.nodes if node.type=="NORMAL_MAP").inputs["Strength"].default_value = .38
    weight(obj)
    print("@@JSON@@"+json.dumps(garment.penetration(obj, BODY)))
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=str(staging/f"{asset}.blend"), compress=True)


if __name__ == "__main__":
    asset, output = sys.argv[sys.argv.index("--")+1:]
    build(asset, Path(output).resolve())
