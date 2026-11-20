import sys, json; sys.path.insert(0,'/home/claude/scripts')
from common import *; from posing import *
from mathutils import Matrix, Vector, Quaternion, Euler
import math
src,out=sys.argv[-3],sys.argv[-2]; P=json.loads(sys.argv[-1]) if sys.argv[-1].startswith('{') else {}
bpy.ops.wm.open_mainfile(filepath=src)
ao=bpy.data.objects['QuannyRig']; arm=ao.data
# ---------------- parameters
N=P.get('N',36); FPS=30; CYC=P.get('cyc',1.10)        # cycle distance (m) per N frames
STANCE=P.get('stance',0.60); HS=P.get('hs',0.07); TO=P.get('to',0.40)                         # heel phase end, heel-rise start (fractions of cycle)
FX=P.get('fx',0.125); TOEOUT=P.get('toeout',8)
LIFT=P.get('lift',0.075); PITCH_HS=P.get('pitch_hs',16); PITCH_TO=P.get('pitch_to',-34)
BASE=P.get('base',0.925); BOB=P.get('bob',0.017)
SWAYX=P.get('swayx',0.022); YAW=P.get('yaw',7); ROLL=P.get('roll',5); TILT=P.get('tilt',4)
ARMS=P.get('arms',14); ARMDOWN=P.get('armdown',70)
TAU=2*math.pi
def rad(d): return math.radians(d)
# ---------------- helper bones (IK targets & poles)
bpy.context.view_layer.objects.active=ao; bpy.ops.object.mode_set(mode='EDIT')
for s,sg in (('Left',1),('Right',-1)):
    f=arm.edit_bones[s+'Foot']
    ik=arm.edit_bones.new('IK_'+s); ik.head=f.head; ik.tail=f.tail; ik.roll=f.roll; ik.parent=arm.edit_bones['Root']; ik.use_deform=False
    pl=arm.edit_bones.new('Pole_'+s); pl.head=(sg*0.16,-0.6,0.55); pl.tail=(sg*0.16,-0.65,0.55); pl.parent=arm.edit_bones['Hips']; pl.use_deform=False
bpy.ops.object.mode_set(mode='POSE')
REST={b.name:b.matrix_local.copy() for b in arm.bones}
def setup_ik(angle):
    for s in ('Left','Right'):
        pb=ao.pose.bones[s+'Leg']
        for c in list(pb.constraints): pb.constraints.remove(c)
        c=pb.constraints.new('IK'); c.target=ao; c.subtarget='IK_'+s; c.pole_target=ao; c.pole_subtarget='Pole_'+s
        c.pole_angle=rad(angle); c.chain_count=2
        fb=ao.pose.bones[s+'Foot']
        for c in list(fb.constraints): fb.constraints.remove(c)
        c=fb.constraints.new('COPY_ROTATION'); c.target=ao; c.subtarget='IK_'+s
# pick pole angle: knees should point forward (-Y) and stay in leg plane
def knee_test(angle):
    setup_ik(angle)
    pb=ao.pose.bones['IK_Left']; pb.location=(0,0,0)
    ao.pose.bones['IK_Left'].matrix=Matrix.Translation((0.13,0.0,0.18))@REST['IK_Left'].to_3x3().to_4x4()
    bpy.context.view_layer.update()
    k=ao.pose.bones['LeftLeg'].head.copy(); return k
best=None
for a in (-90,90,0,180):
    k=knee_test(a); print('pole',a,'knee',tuple(round(x,3) for x in k))
    if best is None or k.y<best[1].y: best=(a,k)
POLE=best[0]; setup_ik(POLE); print('using pole angle',POLE)
for pb in ao.pose.bones: pb.matrix_basis=Matrix()
# ---------------- math helpers
def smooth(t): t=min(max(t,0),1); return t*t*(3-2*t)
def hermite(p0,p1,m0,m1,t):
    t2=t*t;t3=t2*t; return (2*t3-3*t2+1)*p0+(t3-2*t2+t)*m0+(-2*t3+3*t2)*p1+(t3-t2)*m1
def catmull(keys,t):
    # keys: list of (t,v) sorted, t in [0,1]
    for i in range(len(keys)-1):
        if keys[i][0]<=t<=keys[i+1][0]: break
    t0,v0=keys[i]; t1,v1=keys[i+1]
    vm=keys[i-1][1] if i>0 else v0-(v1-v0); vp=keys[i+2][1] if i+2<len(keys) else v1+(v1-v0)
    tm=keys[i-1][0] if i>0 else t0-(t1-t0); tp=keys[i+2][0] if i+2<len(keys) else t1+(t1-t0)
    m0=(v1-vm)/(t1-tm)*(t1-t0); m1=(vp-v0)/(tp-t0)*(t1-t0)
    return hermite(v0,v1,m0,m1,(t-t0)/(t1-t0))
ANK_REST=Vector((0.19,0.04,0.10)); HEEL_OFF=Vector((0,0.08,-0.10)); BALL_OFF=Vector((0.01,-0.14,-0.10))
def footrot(pitch_up,sg): return Euler((0,0,rad(-sg*TOEOUT)),'XYZ').to_matrix()@Euler((rad(-pitch_up),0,0)).to_matrix()
F0=-CYC*STANCE/2+P.get('f0off',0.035)   # ground-contact reference y at heel strike (centered under hips)
def foot_state(p,sg):
    """returns ankle position, foot rotation matrix, toe bend (deg)"""
    p%=1.0
    def ground(pp): return Vector((sg*FX, F0+CYC*pp, 0.10))  # flat-foot ankle position moving with ground
    def pose_on(pp,pitch,pivot_off):
        R=footrot(pitch,sg); Rf=footrot(0,sg)
        a0=ground(pp); piv=a0+Rf@Vector((sg*pivot_off.x,pivot_off.y,pivot_off.z))
        return piv+R@(-Vector((sg*pivot_off.x,pivot_off.y,pivot_off.z))), R
    if p<HS:
        t=p/HS; pitch=PITCH_HS*(1-t)**2; a,R=pose_on(p,pitch,HEEL_OFF); return a,R,0
    if p<TO:
        return ground(p),footrot(0,sg),0
    if p<STANCE:
        t=(p-TO)/(STANCE-TO); pitch=PITCH_TO*t**1.6; a,R=pose_on(p,pitch,BALL_OFF); return a,R,-pitch
    s=(p-STANCE)/(1-STANCE)
    a0,_=pose_on(STANCE,PITCH_TO,BALL_OFF); a1,_=pose_on(1.0,PITCH_HS,HEEL_OFF)
    a1.y-=CYC  # heel strike position of next cycle
    dy_ds=CYC*(1-STANCE)
    y=hermite(a0.y,a1.y,dy_ds*P.get('m0',0.9),dy_ds*P.get('m1',0.25),s)
    z=a0.z+(a1.z-a0.z)*smooth(s)+LIFT*math.sin(math.pi*s**P.get('liftskew',0.85))**1.3
    x=sg*FX+sg*0.012*math.sin(math.pi*s)   # slight outward swing arc (baggy pants)
    pitch=catmull(P.get('swingpitch',[(0,PITCH_TO),(0.28,-9),(0.6,3),(0.85,13),(1,PITCH_HS)]),s)
    toe=max(0,-PITCH_TO*(1-s/0.3)) if s<0.3 else 0
    return Vector((x,y,z)),footrot(pitch,sg),toe
# ---------------- per-frame posing
def pose_frame(f):
    p=f/N
    for pb in ao.pose.bones: pb.matrix_basis=Matrix()
    # pelvis
    BP=P.get('bobphase',0.06); th=TAU*(p-BP)*2
    z=BASE-BOB*(math.cos(th)-P.get('bobshape',0.22)*math.cos(2*th))*(1.0 if (p-BP)%1<0.5 else P.get('bobasym',1.18))
    x=SWAYX*math.cos(TAU*(p-0.33))
    yaw=-YAW*math.cos(TAU*(p-0.02)); roll=-ROLL*math.cos(TAU*(p-0.30)); pit=TILT+1.2*math.cos(2*TAU*(p-0.1))
    Rp=Euler((rad(pit),rad(roll),rad(yaw)),'YXZ').to_matrix()   # forward tilt = toward -Y
    hp=Vector((x,0.03+0.008*math.cos(2*TAU*(p-0.3)),z))
    ao.pose.bones['Hips'].matrix=Matrix.Translation(hp)@Rp.to_4x4()@REST['Hips'].to_3x3().to_4x4()
    # feet
    for s,sg,ph in (('Left',1,0.0),('Right',-1,0.5)):
        a,R,toe=foot_state(p+ph,sg)
        bpy.context.view_layer.update()
        ao.pose.bones['IK_'+s].matrix=Matrix.Translation(a)@R.to_4x4()@REST['IK_'+s].to_3x3().to_4x4()
        set_delta(ao,s+'ToeBase',D(toe,0,0))
    # spine: counter-rotate shoulders, slight lean back, keep head steady
    cy=-1.65*yaw; cr=-1.95*roll
    sp=-(TILT-P.get('chest',3.0))+P.get('chestosc',0.7)*math.cos(2*TAU*(p-0.18))            # chest ends ~1.5 deg behind vertical (confident)
    for n,w in (('Spine',0.3),('Spine1',0.35),('Spine2',0.35)):
        set_delta(ao,n,D(sp*w,cr*w,cy*w,'YXZ'))
    chest_yaw=yaw+cy; chest_roll=roll+cr; chest_pitch=pit+sp
    hy=-chest_yaw+1.5*math.sin(TAU*(p-0.1)); hr=-chest_roll*0.7+1.2*math.cos(TAU*(p-0.42))
    hpch=P.get('headpitch',-1.0)-chest_pitch+1.4*math.cos(2*TAU*(p-0.14))     # world head pitch ~2.5 deg chin-up, nod on bounce
    set_delta(ao,'Neck',D(hpch*0.4,hr*0.4,hy*0.4,'YXZ')); set_delta(ao,'Head',D(hpch*0.6,hr*0.6,hy*0.6,'YXZ'))
    # arms
    for s,sg,ph in (('Left',1,0.5),('Right',-1,0.0)):
        fwd=math.cos(TAU*(p-ph-0.045))           # +1 = arm fully forward (lags the opposite leg)
        fwd_l=math.cos(TAU*(p-ph-0.11))          # forearm/hand drag
        set_delta(ao,s+'Shoulder',D(0,sg*(9+1.2*math.cos(2*TAU*(p-0.12))),-sg*P.get('clav',4.5)*fwd))
        swing=-(ARMS*fwd+P.get('armbias',2))
        set_delta(ao,s+'Arm',D(swing,0,0)@D(0,0,-sg*4)@D(0,sg*ARMDOWN,0)@D(P.get('armtwist',24),0,0))
        flex=P.get('flex',13)+P.get('flexfwd',10)*max(0,fwd_l)+3*fwd_l
        set_delta(ao,s+'ForeArm',D(8,0,-sg*flex))
        set_delta(ao,s+'Hand',D(0,sg*(8+5*fwd_l),-sg*6*fwd_l))
        set_delta(ao,s+'HandFingers1',D(0,sg*P.get('curl1',26),0)); set_delta(ao,s+'HandFingers2',D(0,sg*P.get('curl2',32),0))
        set_delta(ao,s+'HandThumb1',D(0,sg*10,-sg*8)); set_delta(ao,s+'HandThumb2',D(0,sg*14,0))
    # bandana follows left thigh swing with lag + pelvis sway
    bsw=-P.get('band',7)*math.cos(TAU*(p-0.97-0.07))-P.get('bandback',0); bside=-4*math.sin(TAU*(p-0.33-0.08))
    set_delta(ao,'Bandana',D(bsw,bside,0))
# ---------------- keyframe
act=bpy.data.actions.new(P.get('name','Walk')); ao.animation_data_create(); ao.animation_data.action=act
sc=bpy.context.scene; sc.render.fps=FPS; sc.frame_start=0; sc.frame_end=N
ext=[]
for f in range(N+1):
    sc.frame_set(f); pose_frame(f)
    for pb in ao.pose.bones:
        pb.keyframe_insert('rotation_quaternion',frame=f)
        if pb.name in('Hips',) or pb.name.startswith('IK_'): pb.keyframe_insert('location',frame=f)
# check reach / foot error
err=0
for f in range(N+1):
    sc.frame_set(f)
    for s in ('Left','Right'):
        d=(ao.pose.bones[s+'Foot'].head-ao.pose.bones['IK_'+s].head).length; err=max(err,d)
        L=(ao.pose.bones[s+'UpLeg'].head-ao.pose.bones['IK_'+s].head).length
        ext.append(L/0.876)
print('max foot IK error %.4f  max leg extension %.3f'%(err,max(ext)))
# knee direction check at mid-stance
sc.frame_set(int(0.3*N)); print('knee L',tuple(round(v,3) for v in ao.pose.bones['LeftLeg'].head))
# ---------------- bake IK to FK, strip helper bones
for pb in ao.pose.bones:
    try: pb.select=True
    except AttributeError: pb.bone.select=True
bpy.ops.nla.bake(frame_start=0,frame_end=N,only_selected=False,visual_keying=True,clear_constraints=True,use_current_action=True,bake_types={'POSE'})
bpy.ops.object.mode_set(mode='EDIT')
for n in ('IK_Left','IK_Right','Pole_Left','Pole_Right'): arm.edit_bones.remove(arm.edit_bones[n])
bpy.ops.object.mode_set(mode='OBJECT')
act=ao.animation_data.action
def fcurves(a):
    try: return a.fcurves
    except AttributeError: return [fc for l in a.layers for st in l.strips for cb in st.channelbags for fc in cb.fcurves]
try:
    rm=[fc for fc in fcurves(act) if any(k in fc.data_path for k in ('IK_','Pole_'))]
    for fc in rm:
        try: act.fcurves.remove(fc)
        except Exception: pass
except Exception as e: print('fc cleanup',e)
act.name=P.get('name','Walk')
bpy.ops.wm.save_as_mainfile(filepath=out)
print('saved',out)
