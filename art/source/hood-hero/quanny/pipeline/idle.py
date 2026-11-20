import sys, json; sys.path.insert(0,'/home/claude/scripts')
from common import *; from posing import *
from mathutils import Matrix, Vector, Euler
import math
src,out=sys.argv[-2],sys.argv[-1]
bpy.ops.wm.open_mainfile(filepath=src)
ao=bpy.data.objects['QuannyRig']; arm=ao.data
N=240; FPS=30; TAU=2*math.pi
def rad(d): return math.radians(d)
bpy.context.view_layer.objects.active=ao; bpy.ops.object.mode_set(mode='EDIT')
for s,sg in (('Left',1),('Right',-1)):
    f=arm.edit_bones[s+'Foot']
    ik=arm.edit_bones.new('IK_'+s); ik.head=f.head; ik.tail=f.tail; ik.roll=f.roll; ik.parent=arm.edit_bones['Root']; ik.use_deform=False
    pl=arm.edit_bones.new('Pole_'+s); pl.head=(sg*0.22,-0.6,0.55); pl.tail=(sg*0.22,-0.65,0.55); pl.parent=arm.edit_bones['Hips']; pl.use_deform=False
bpy.ops.object.mode_set(mode='POSE')
REST={b.name:b.matrix_local.copy() for b in arm.bones}
for s in ('Left','Right'):
    c=ao.pose.bones[s+'Leg'].constraints.new('IK'); c.target=ao; c.subtarget='IK_'+s; c.pole_target=ao; c.pole_subtarget='Pole_'+s; c.pole_angle=rad(90); c.chain_count=2
    c=ao.pose.bones[s+'Foot'].constraints.new('COPY_ROTATION'); c.target=ao; c.subtarget='IK_'+s
def seg(keys,t):
    """eased interpolation between keys (hold-and-ease, like a head turn); wraps."""
    t%=1.0
    for i in range(len(keys)-1):
        if keys[i][0]<=t<=keys[i+1][0]:
            a,b=keys[i],keys[i+1]; u=(t-a[0])/(b[0]-a[0]); u=u*u*u*(u*(6*u-15)+10)
            return a[1]+(b[1]-a[1])*u
    return keys[-1][1]
HEAD_YAW=[(0,0),(0.10,0),(0.19,27),(0.36,24),(0.46,3),(0.60,0),(0.66,-18),(0.79,-15),(0.87,0),(1,0)]   # + = looks to his left
HEAD_PITCH=[(0,-3),(0.19,-1.5),(0.36,-2),(0.46,-4.5),(0.60,-3),(0.66,1),(0.79,0.5),(0.87,-3),(1,-3)]  # - = chin up
FEET={'Left':(Vector((0.175,-0.07,0.10)),14),'Right':(Vector((-0.15,0.07,0.10)),20)}  # ankle pos, toe-out deg
def pose_frame(f):
    p=f/N
    for pb in ao.pose.bones: pb.matrix_basis=Matrix()
    br=math.sin(TAU*p*2)                     # breathing, ~4 s per breath
    sh=math.sin(TAU*p+0.6)                   # slow weight drift
    look=seg(HEAD_YAW,p); lookL=seg(HEAD_YAW,p-0.03)
    # pelvis: weight on right leg (contrapposto), left hip dropped
    hp=Vector((-0.042+0.007*sh,0.035,0.940+0.002*br-0.003*abs(sh)))
    Rp=Euler((rad(3.5),rad(-4.5-0.8*sh),rad(7+0.10*lookL)),'YXZ').to_matrix()
    ao.pose.bones['Hips'].matrix=Matrix.Translation(hp)@Rp.to_4x4()@REST['Hips'].to_3x3().to_4x4()
    bpy.context.view_layer.update()
    for s,sg in (('Left',1),('Right',-1)):
        a,yaw=FEET[s]; R=Euler((0,0,rad(-sg*yaw))).to_matrix()
        ao.pose.bones['IK_'+s].matrix=Matrix.Translation(a)@R.to_4x4()@REST['IK_'+s].to_3x3().to_4x4()
    # spine: counter the hip roll so shoulders sit level-ish, lean back a touch, breathe, follow the look
    cy=-7+0.22*lookL; cr=6.0+0.8*sh
    for n,w in (('Spine',0.3),('Spine1',0.35),('Spine2',0.35)):
        set_delta(ao,n,D((-4.5+0.9*br)*w,cr*w,cy*w,'YXZ'))
    chest_yaw=7+cy; chest_roll=-4.5+cr
    hy=look-chest_yaw-0.10*lookL; hpch=seg(HEAD_PITCH,p); hr=-chest_roll*0.6+2.5
    set_delta(ao,'Neck',D(hpch*0.4,hr*0.4,hy*0.35,'YXZ')); set_delta(ao,'Head',D(hpch*0.6,hr*0.6,hy*0.65,'YXZ'))
    # arms: relaxed, slightly away from the baggy jeans; small breath and drift motion
    for s,sg,fw,fl,dn,tw in (('Left',1,-5,9,61,8),('Right',-1,3,11,71,26)):
        set_delta(ao,s+'Shoulder',D(0,sg*(10+0.9*br),-sg*1.5))
        sw=fw+1.2*math.sin(TAU*p+sg*0.9)
        set_delta(ao,s+'Arm',D(-sw,0,0)@D(0,0,-sg*4)@D(0,sg*(dn-0.6*br),0)@D(tw,0,0))
        set_delta(ao,s+'ForeArm',D(8,0,-sg*(fl+1.5*math.sin(TAU*p*2+sg))))
        set_delta(ao,s+'Hand',D(0,sg*10,-sg*4))
        fid=max(0,math.sin(TAU*(p-0.52)))**8 if s=='Right' else 0   # one finger fidget per loop
        set_delta(ao,s+'HandFingers1',D(0,sg*(22+28*fid),0)); set_delta(ao,s+'HandFingers2',D(0,sg*(26+30*fid),0))
        set_delta(ao,s+'HandThumb1',D(0,sg*8,-sg*8)); set_delta(ao,s+'HandThumb2',D(0,sg*10,0))
    set_delta(ao,'Bandana',D(-1.5*math.sin(TAU*p+0.3),2.0*sh,0))
act=bpy.data.actions.new('Idle'); ao.animation_data_create(); ao.animation_data.action=act
sc=bpy.context.scene; sc.render.fps=FPS; sc.frame_start=0; sc.frame_end=N
for f in range(N+1):
    sc.frame_set(f); pose_frame(f)
    for pb in ao.pose.bones:
        pb.keyframe_insert('rotation_quaternion',frame=f)
        if pb.name=='Hips' or pb.name.startswith('IK_'): pb.keyframe_insert('location',frame=f)
err=0; ext=0
for f in range(0,N+1,10):
    sc.frame_set(f)
    for s in ('Left','Right'):
        err=max(err,(ao.pose.bones[s+'Foot'].head-ao.pose.bones['IK_'+s].head).length)
        ext=max(ext,(ao.pose.bones[s+'UpLeg'].head-ao.pose.bones['IK_'+s].head).length/0.876)
print('max foot IK error %.4f  max leg extension %.3f'%(err,ext))
for pb in ao.pose.bones:
    try: pb.select=True
    except AttributeError: pb.bone.select=True
bpy.ops.nla.bake(frame_start=0,frame_end=N,only_selected=False,visual_keying=True,clear_constraints=True,use_current_action=True,bake_types={'POSE'})
bpy.ops.object.mode_set(mode='EDIT')
for n in ('IK_Left','IK_Right','Pole_Left','Pole_Right'): arm.edit_bones.remove(arm.edit_bones[n])
bpy.ops.object.mode_set(mode='OBJECT')
ao.animation_data.action.name='Idle'
bpy.ops.wm.save_as_mainfile(filepath=out); print('saved')
