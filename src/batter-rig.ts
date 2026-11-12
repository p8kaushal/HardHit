import * as BABYLON from 'babylonjs';
import 'babylonjs-loaders';
import type { ShotType } from './types';
import type { TrackedConfidence, TrackedDirections, TrackingJoint } from './pose-retarget';

export type BatterJoint = 'pelvis' | 'spine' | 'chest' | 'neck' | 'head'
  | 'leftShoulder' | 'leftElbow' | 'leftWrist' | 'rightShoulder' | 'rightElbow' | 'rightWrist'
  | 'leftHip' | 'leftKnee' | 'leftAnkle' | 'rightHip' | 'rightKnee' | 'rightAnkle';

export type BatterPose = Partial<Record<BatterJoint, BABYLON.Vector3>>;

type RigMaterials = { blue: BABYLON.Material; trousers: BABYLON.Material; skin: BABYLON.Material; helmet: BABYLON.Material; pads: BABYLON.Material; shoes: BABYLON.Material; batWood: BABYLON.Material; grip: BABYLON.Material };

/** Procedural, fixed-length joint hierarchy; rotations are local to each joint. */
export class BatterRig {
  readonly root: BABYLON.TransformNode;
  readonly joints: Record<BatterJoint, BABYLON.TransformNode>;
  readonly batPivot: BABYLON.TransformNode;
  readonly batMesh: BABYLON.Mesh;
  private skinnedHands: { left: BABYLON.TransformNode; right: BABYLON.TransformNode } | null = null;
  private modelFacing: BABYLON.TransformNode | null = null;
  private frontFacingAdjustment = 0;
  private bindRootYaw = 0;
  private pendingFacingAlignment = true;
  private trackedFacing = 0;
  private trackingPose = false;
  private trackingOffsetY = 0;
  private trackingSpineCorrection: BABYLON.Quaternion | null = null;
  private trackedDirections: TrackedDirections = {};
  private trackedConfidence: TrackedConfidence = {};
  private debugNodes: Partial<Record<TrackingJoint, BABYLON.TransformNode>> = {};
  private xrayMeshes: BABYLON.AbstractMesh[] = [];
  private xrayLines: BABYLON.LinesMesh | null = null;
  private xrayVisible = false;
  private hand: 'RHB' | 'LHB' = 'RHB';

  constructor(private readonly scene: BABYLON.Scene, materials: RigMaterials) {
    this.root = new BABYLON.TransformNode('batterRoot', scene);
    const joint = (name: BatterJoint, parent: BABYLON.TransformNode, x: number, y: number, z: number) => {
      const node = new BABYLON.TransformNode(`batter_${name}`, scene);
      node.parent = parent;
      node.position.set(x, y, z);
      return node;
    };
    const mesh = (shape: BABYLON.Mesh, parent: BABYLON.TransformNode, mat: BABYLON.Material, x: number, y: number, z: number) => {
      shape.parent = parent;
      shape.position.set(x, y, z);
      shape.material = mat;
      shape.isPickable = false;
      return shape;
    };
    const limb = (name: string, parent: BABYLON.TransformNode, mat: BABYLON.Material, length: number, diameter: number) =>
      mesh(BABYLON.MeshBuilder.CreateCylinder(name, { height: length, diameter, tessellation: 8 }, scene), parent, mat, 0, -length / 2, 0);
    const box = (name: string, parent: BABYLON.TransformNode, mat: BABYLON.Material, x: number, y: number, z: number, width: number, height: number, depth: number) =>
      mesh(BABYLON.MeshBuilder.CreateBox(name, { width, height, depth }, scene), parent, mat, x, y, z);
    const ball = (name: string, parent: BABYLON.TransformNode, mat: BABYLON.Material, x: number, y: number, z: number, diameter: number) =>
      mesh(BABYLON.MeshBuilder.CreateSphere(name, { diameter, segments: 8 }, scene), parent, mat, x, y, z);

    const pelvis = joint('pelvis', this.root, 0, 0.91, 0);
    const spine = joint('spine', pelvis, 0, 0.17, 0);
    const chest = joint('chest', spine, 0, 0.3, 0);
    limb('batterTorsoLower', spine, materials.blue, 0.24, 0.4);
    limb('batterTorsoUpper', chest, materials.blue, 0.35, 0.42);
    const neck = joint('neck', chest, 0, 0.23, 0);
    const head = joint('head', neck, 0, 0.15, 0);
    ball('batterHead', head, materials.skin, 0, 0, 0, 0.27);
    const cap = ball('batterHelmet', head, materials.helmet, 0, 0.08, 0, 0.29);
    cap.scaling.y = 0.75;
    box('helmetPeak', head, materials.helmet, 0, 0.05, 0.15, 0.26, 0.035, 0.16);

    const side = (label: 'left' | 'right', sign: number) => {
      const shoulder = joint(`${label}Shoulder`, chest, sign * 0.27, 0, 0.07);
      const elbow = joint(`${label}Elbow`, shoulder, 0, -0.3, 0);
      const wrist = joint(`${label}Wrist`, elbow, 0, -0.28, 0);
      limb(`batter_${label}UpperArm`, shoulder, materials.blue, 0.3, 0.13);
      limb(`batter_${label}Forearm`, elbow, materials.blue, 0.28, 0.12);
      ball(`batter_${label}Glove`, wrist, materials.pads, 0, 0, 0, 0.16);
      const hip = joint(`${label}Hip`, pelvis, sign * 0.13, 0, 0);
      const knee = joint(`${label}Knee`, hip, 0, -0.43, 0);
      const ankle = joint(`${label}Ankle`, knee, 0, -0.4, 0);
      limb(`batter_${label}Thigh`, hip, materials.trousers, 0.43, 0.17);
      limb(`batter_${label}Shin`, knee, materials.trousers, 0.4, 0.17);
      box(`batter_${label}Pad`, knee, materials.pads, 0, -0.2, 0.095, 0.19, 0.38, 0.1);
      box(`batter_${label}Shoe`, ankle, materials.shoes, 0, -0.02, 0.04, 0.18, 0.1, 0.3);
      shoulder.rotation.z = sign * 0.12;
      return { shoulder, elbow, wrist, hip, knee, ankle };
    };
    const left = side('left', -1);
    const right = side('right', 1);
    this.joints = { pelvis, spine, chest, neck, head,
      leftShoulder: left.shoulder, leftElbow: left.elbow, leftWrist: left.wrist,
      rightShoulder: right.shoulder, rightElbow: right.elbow, rightWrist: right.wrist,
      leftHip: left.hip, leftKnee: left.knee, leftAnkle: left.ankle,
      rightHip: right.hip, rightKnee: right.knee, rightAnkle: right.ankle };
    this.batPivot = new BABYLON.TransformNode('batPivot', scene);
    this.batPivot.parent = right.wrist;
    this.batPivot.position.set(0, 0, 0.17);
    this.batPivot.rotation.z = -0.2;
    this.batMesh = box('batMesh', this.batPivot, materials.batWood, 0, -0.43, 0, 0.22, 0.64, 0.065);
    this.batMesh.rotation.y = Math.PI / 2;
    limb('batHandle', this.batPivot, materials.grip, 0.27, 0.05);
    const fallbackObserver = scene.onBeforeRenderObservable.add(() => {
      if (!this.trackingPose || this.skinnedHands || this.root.isDisposed()) return;
      const limbs: [BatterJoint, BatterJoint][] = [['leftShoulder','leftElbow'],['leftElbow','leftWrist'],['rightShoulder','rightElbow'],['rightElbow','rightWrist'],['leftHip','leftKnee'],['leftKnee','leftAnkle'],['rightHip','rightKnee'],['rightKnee','rightAnkle']];
      for (const [joint, child] of limbs) this.alignLimb(this.joints[joint], this.joints[child], this.trackedDirections[joint]);
    });
    this.root.onDisposeObservable.addOnce(() => scene.onBeforeRenderObservable.remove(fallbackObserver));
    void this.loadSkinnedBody();
  }

  private alignLimb(node: BABYLON.TransformNode, child: BABYLON.TransformNode, target?: BABYLON.Vector3): void {
    if (!target) return;
    node.computeWorldMatrix(true); child.computeWorldMatrix(true);
    const current = child.getAbsolutePosition().subtract(node.getAbsolutePosition());
    if (current.lengthSquared() < .000001) return;
    const worldCorrection = new BABYLON.Quaternion(), parentRotation = new BABYLON.Quaternion();
    BABYLON.Quaternion.FromUnitVectorsToRef(current.normalize(), target, worldCorrection);
    node.parent?.computeWorldMatrix(true).decompose(undefined, parentRotation);
    const localCorrection = parentRotation.conjugate().multiply(worldCorrection).multiply(parentRotation);
    node.rotationQuaternion = localCorrection.multiply(node.rotationQuaternion ?? BABYLON.Quaternion.FromEulerVector(node.rotation));
  }

  private async loadSkinnedBody(): Promise<void> {
    const fallbackMeshes = this.root.getChildMeshes().filter(mesh => !mesh.isDescendantOf(this.batPivot));
    let imported: Awaited<ReturnType<typeof BABYLON.SceneLoader.ImportMeshAsync>> | null = null;
    try {
      const result = await BABYLON.SceneLoader.ImportMeshAsync('', '/models/', 'batter-human.glb', this.scene);
      imported = result;
      if (this.root.isDisposed()) {
        result.meshes.forEach(mesh => mesh.dispose());
        result.skeletons.forEach(skeleton => skeleton.dispose());
        return;
      }
      result.animationGroups.forEach(group => group.stop());
      const modelRoot = result.meshes[0];
      const facing = new BABYLON.TransformNode('batterModelFacing', this.scene);
      this.modelFacing = facing;
      facing.parent = this.root;
      facing.rotation.y = Math.PI;
      modelRoot.parent = facing;
      modelRoot.scaling.setAll(0.316);
      modelRoot.computeWorldMatrix(true);
      result.meshes.forEach(mesh => mesh.computeWorldMatrix(true));
      const bodyMesh = result.meshes.find(mesh => mesh.name === 'Human_Mesh');
      if (!bodyMesh) throw new Error('Missing skinned body mesh');
      bodyMesh.refreshBoundingInfo();
      const floor = bodyMesh.getBoundingInfo().boundingBox.minimumWorld.y;
      modelRoot.position.y -= floor - this.root.getAbsolutePosition().y;
      const nodes = new Map(result.transformNodes.map(node => [node.name, node]));
      const leftHand = nodes.get('LeftHand');
      const rightHand = nodes.get('RightHand');
      if (!leftHand || !rightHand) throw new Error('Missing hand joints');
      const leftArm = nodes.get('LeftArm'), rightArm = nodes.get('RightArm');
      if (!leftArm || !rightArm) throw new Error('Missing shoulder joints');
      leftArm.computeWorldMatrix(true); rightArm.computeWorldMatrix(true);
      const shoulderAxis = rightArm.getAbsolutePosition().subtract(leftArm.getAbsolutePosition());
      const shoulderAngle = Math.atan2(shoulderAxis.z, shoulderAxis.x);
      this.frontFacingAdjustment = Math.atan(Math.tan(shoulderAngle));
      const foot = nodes.get('LeftFoot'), toe = nodes.get('LeftToeBase');
      if (foot && toe) {
        foot.computeWorldMatrix(true); toe.computeWorldMatrix(true);
        const toeAxis = toe.getAbsolutePosition().subtract(foot.getAbsolutePosition());
        const forwardZ = -Math.sin(this.frontFacingAdjustment) * toeAxis.x + Math.cos(this.frontFacingAdjustment) * toeAxis.z;
        if (forwardZ < 0) this.frontFacingAdjustment += Math.PI;
      }
      this.bindRootYaw = this.root.rotation.y;
      const mapping: Partial<Record<BatterJoint, string>> = {
        pelvis: 'Hips', spine: 'Spine', chest: 'Spine2', neck: 'Neck', head: 'Head',
        leftShoulder: 'LeftArm', leftElbow: 'LeftForeArm', leftWrist: 'LeftHand',
        rightShoulder: 'RightArm', rightElbow: 'RightForeArm', rightWrist: 'RightHand',
        leftHip: 'LeftUpLeg', leftKnee: 'LeftLeg', leftAnkle: 'LeftFoot',
        rightHip: 'RightUpLeg', rightKnee: 'RightLeg', rightAnkle: 'RightFoot'
      };
      const bindings = Object.entries(mapping).map(([joint, name]) => {
        const node = nodes.get(name);
        if (!node) throw new Error(`Missing joint ${name}`);
        return { driver: this.joints[joint as BatterJoint], node, bind: (node.rotationQuaternion ?? BABYLON.Quaternion.FromEulerVector(node.rotation)).clone() };
      });
      for (const [joint, name] of Object.entries(mapping)) this.debugNodes[joint as BatterJoint] = nodes.get(name);
      this.debugNodes.leftIndex = nodes.get('LeftHandIndex3');
      this.debugNodes.rightIndex = nodes.get('RightHandIndex3');
      this.debugNodes.leftToe = nodes.get('LeftToeBase');
      this.debugNodes.rightToe = nodes.get('RightToeBase');
      this.skinnedHands = { left: leftHand, right: rightHand };
      this.pendingFacingAlignment = true;
      fallbackMeshes.forEach(mesh => mesh.setEnabled(false));
      const canvas = this.scene.getEngine().getRenderingCanvas();
      if (canvas) canvas.dataset.batterModel = 'skinned';
      this.scene.onBeforeRenderObservable.add(() => {
        if (this.root.isDisposed()) return;
        const cameraRotation = new BABYLON.Quaternion();
        if (this.trackingPose && this.scene.activeCamera) this.scene.activeCamera.getWorldMatrix().decompose(undefined, cameraRotation);
        for (const binding of bindings) {
          const r = binding.driver.rotation;
          const delta = BABYLON.Quaternion.RotationYawPitchRoll(r.y, r.x, r.z);
          if (this.trackingPose) {
            const cameraDelta = cameraRotation.multiply(delta).multiply(cameraRotation.conjugate());
            const parentRotation = new BABYLON.Quaternion();
            if (binding.node.parent) binding.node.parent.computeWorldMatrix(true).decompose(undefined, parentRotation);
            const worldBind = parentRotation.multiply(binding.bind);
            const localDelta = worldBind.conjugate().multiply(cameraDelta).multiply(worldBind);
            binding.node.rotationQuaternion = binding.bind.multiply(localDelta);
          } else binding.node.rotationQuaternion = binding.bind.multiply(delta);
          if (this.trackingPose && binding.driver === this.joints.spine && this.trackingSpineCorrection && this.modelFacing) {
            const facingRotation = new BABYLON.Quaternion(), parentRotation = new BABYLON.Quaternion();
            this.modelFacing.computeWorldMatrix(true).decompose(undefined, facingRotation);
            binding.node.parent?.computeWorldMatrix(true).decompose(undefined, parentRotation);
            const worldCorrection = facingRotation.multiply(this.trackingSpineCorrection).multiply(facingRotation.conjugate());
            const localCorrection = parentRotation.conjugate().multiply(worldCorrection).multiply(parentRotation);
            binding.node.rotationQuaternion = localCorrection.multiply(binding.node.rotationQuaternion);
          }
        }
        if (this.trackingPose && this.pendingFacingAlignment && this.modelFacing) {
          const hips = nodes.get('Hips'), spineNode = nodes.get('Spine');
          if (hips && spineNode && !this.trackingSpineCorrection) {
            hips.computeWorldMatrix(true); leftArm.computeWorldMatrix(true); rightArm.computeWorldMatrix(true);
            const shoulderCenter = leftArm.getAbsolutePosition().add(rightArm.getAbsolutePosition()).scale(.5);
            const torso = shoulderCenter.subtract(hips.getAbsolutePosition());
            if (torso.length() > .05) {
              const worldCorrection = new BABYLON.Quaternion();
              BABYLON.Quaternion.FromUnitVectorsToRef(torso.normalize(), BABYLON.Axis.Y, worldCorrection);
              const facingRotation = new BABYLON.Quaternion(), parentRotation = new BABYLON.Quaternion();
              this.modelFacing.computeWorldMatrix(true).decompose(undefined, facingRotation);
              spineNode.parent?.computeWorldMatrix(true).decompose(undefined, parentRotation);
              this.trackingSpineCorrection = facingRotation.conjugate().multiply(worldCorrection).multiply(facingRotation);
              const localCorrection = parentRotation.conjugate().multiply(worldCorrection).multiply(parentRotation);
              spineNode.rotationQuaternion = localCorrection.multiply(spineNode.rotationQuaternion ?? BABYLON.Quaternion.Identity());
            }
          }
          leftArm.computeWorldMatrix(true); rightArm.computeWorldMatrix(true);
          const shoulder = rightArm.getAbsolutePosition().subtract(leftArm.getAbsolutePosition());
          if (Math.hypot(shoulder.x, shoulder.z) > 0.01) {
            // Align the actual rendered shoulders after the tracking pose has been applied.
            let correction = Math.atan(Math.tan(Math.atan2(shoulder.z, shoulder.x) + this.trackedFacing));
            if (foot && toe) {
              foot.computeWorldMatrix(true); toe.computeWorldMatrix(true);
              const footDirection = toe.getAbsolutePosition().subtract(foot.getAbsolutePosition());
              if (-Math.sin(correction) * footDirection.x + Math.cos(correction) * footDirection.z < 0) correction += Math.PI;
            }
            this.frontFacingAdjustment += correction;
            this.modelFacing.rotation.y += correction;
            this.pendingFacingAlignment = false;
          }
        }
        if (this.trackingPose) {
          const limbs: [BatterJoint, string, string][] = [
            ['leftShoulder', 'LeftArm', 'LeftForeArm'], ['leftElbow', 'LeftForeArm', 'LeftHand'],
            ['rightShoulder', 'RightArm', 'RightForeArm'], ['rightElbow', 'RightForeArm', 'RightHand'],
            ['leftHip', 'LeftUpLeg', 'LeftLeg'], ['leftKnee', 'LeftLeg', 'LeftFoot'],
            ['rightHip', 'RightUpLeg', 'RightLeg'], ['rightKnee', 'RightLeg', 'RightFoot'],
            ['leftWrist', 'LeftHand', 'LeftHandIndex3'], ['rightWrist', 'RightHand', 'RightHandIndex3'],
            ['leftAnkle', 'LeftFoot', 'LeftToeBase'], ['rightAnkle', 'RightFoot', 'RightToeBase']
          ];
          for (const [joint, nodeName, childName] of limbs) {
            const node = nodes.get(nodeName), child = nodes.get(childName);
            if (node && child) this.alignLimb(node, child, this.trackedDirections[joint]);
          }
          if (this.modelFacing) {
            this.modelFacing.position.y = this.trackingOffsetY;
            this.modelFacing.computeWorldMatrix(true);
            const feet = ['LeftFoot', 'LeftToeBase', 'RightFoot', 'RightToeBase'].map(name => nodes.get(name)).filter((node): node is BABYLON.TransformNode => !!node);
            const floor = this.root.getAbsolutePosition().y;
            let lowest = Infinity;
            for (const node of feet) { node.computeWorldMatrix(true); lowest = Math.min(lowest, node.getAbsolutePosition().y); }
            if (Number.isFinite(lowest) && lowest < floor) this.modelFacing.position.y += floor - lowest;
          }
        }
        const hand = this.hand === 'RHB' ? this.skinnedHands?.right : this.skinnedHands?.left;
        if (hand) {
          hand.computeWorldMatrix(true);
          this.batPivot.setAbsolutePosition(hand.getAbsolutePosition());
        }
      });
    } catch (error) {
      imported?.animationGroups.forEach(group => group.dispose());
      imported?.meshes.forEach(mesh => mesh.dispose());
      imported?.skeletons.forEach(skeleton => skeleton.dispose());
      const canvas = this.scene.getEngine().getRenderingCanvas();
      if (canvas) canvas.dataset.batterModel = 'fallback';
      console.warn('Unable to load the skinned batter; using the built-in figure.', error);
    }
  }

  setHandedness(hand: 'RHB' | 'LHB'): void {
    this.trackingPose = false;
    this.trackedDirections = {};
    this.trackedConfidence = {};
    this.pendingFacingAlignment = true;
    this.trackingSpineCorrection = null;
    this.setTrackingOffset(BABYLON.Vector3.Zero());
    if (this.modelFacing) this.modelFacing.rotation.y = Math.PI;
    this.joints.pelvis.rotation.y = 0;
    this.hand = hand;
    for (const joint of Object.values(this.joints)) {
      this.scene.stopAnimation(joint);
      joint.rotationQuaternion = null;
      joint.rotation.setAll(0);
    }
    this.scene.stopAnimation(this.batPivot);
    this.joints.leftShoulder.rotation.z = -0.12;
    this.joints.rightShoulder.rotation.z = 0.12;
    this.batPivot.rotation.z = -0.2;
    this.batPivot.parent = hand === 'RHB' ? this.joints.rightWrist : this.joints.leftWrist;
    this.batPivot.position.set(0, 0, 0.17);
  }

  /** Bounds arbitrary pose inputs and rejects non-finite values. */
  setJointRotation(name: BatterJoint, rotation: BABYLON.Vector3): boolean {
    if (![rotation.x, rotation.y, rotation.z].every(Number.isFinite)) return false;
    const bound = (value: number) => Math.max(-Math.PI / 2, Math.min(Math.PI / 2, value));
    this.joints[name].rotation.set(bound(rotation.x), bound(rotation.y), bound(rotation.z));
    return true;
  }

  /** Apply a complete local-space pose only when every supplied joint is valid. */
  applyPose(pose: BatterPose, batRotation?: BABYLON.Vector3): boolean {
    const entries = Object.entries(pose) as [BatterJoint, BABYLON.Vector3][];
    if (entries.some(([name, rotation]) => !this.joints[name] || !rotation || ![rotation.x, rotation.y, rotation.z].every(Number.isFinite)) || (batRotation && ![batRotation.x, batRotation.y, batRotation.z].every(Number.isFinite))) return false;
    entries.forEach(([name, rotation]) => { this.scene.stopAnimation(this.joints[name]); this.setJointRotation(name, rotation); });
    if (batRotation) {
      this.scene.stopAnimation(this.batPivot);
      this.batPivot.rotation.copyFrom(batRotation);
    }
    return true;
  }

  applyTrackingPose(pose: BatterPose, directions: TrackedDirections, confidence: TrackedConfidence = {}): boolean {
    for (const name of Object.keys(directions) as BatterJoint[]) this.joints[name].rotationQuaternion = null;
    const applied = this.applyPose(pose);
    if (applied) { this.trackingPose = true; this.trackedDirections = directions; this.trackedConfidence = confidence; }
    return applied;
  }

  /** Move only the visible figure; match and delivery positions remain unchanged. */
  setTrackingOffset(offset: BABYLON.Vector3): void {
    this.trackingOffsetY = offset.y;
    this.joints.pelvis.position.set(offset.x, 0.91 + offset.y, offset.z);
    this.modelFacing?.position.copyFrom(offset);
  }

  setBatVisible(visible: boolean): void { this.batPivot.setEnabled(visible); }

  /** Show the visible model's joint positions through its mesh. */
  setXrayVisible(visible: boolean): void {
    this.xrayVisible = visible;
    if (visible && !this.xrayLines) {
      const names: TrackingJoint[] = ['pelvis', 'spine', 'chest', 'neck', 'head', 'leftShoulder', 'leftElbow', 'leftWrist', 'rightShoulder', 'rightElbow', 'rightWrist', 'leftHip', 'leftKnee', 'leftAnkle', 'rightHip', 'rightKnee', 'rightAnkle', 'leftIndex', 'rightIndex', 'leftToe', 'rightToe'];
      const pairs: [TrackingJoint, TrackingJoint][] = [['pelvis','spine'],['spine','chest'],['chest','neck'],['neck','head'],['chest','leftShoulder'],['leftShoulder','leftElbow'],['leftElbow','leftWrist'],['chest','rightShoulder'],['rightShoulder','rightElbow'],['rightElbow','rightWrist'],['pelvis','leftHip'],['leftHip','leftKnee'],['leftKnee','leftAnkle'],['pelvis','rightHip'],['rightHip','rightKnee'],['rightKnee','rightAnkle'],['leftWrist','leftIndex'],['rightWrist','rightIndex'],['leftAnkle','leftToe'],['rightAnkle','rightToe']];
      const material = new BABYLON.StandardMaterial('poseXrayMaterial', this.scene);
      material.emissiveColor = BABYLON.Color3.FromHexString('#70f2c0');
      material.disableLighting = true;
      const uncertain = new BABYLON.StandardMaterial('poseXrayUncertain', this.scene);
      uncertain.emissiveColor = BABYLON.Color3.FromHexString('#ffb94f');
      uncertain.disableLighting = true;
      this.scene.setRenderingAutoClearDepthStencil(3, true);
      this.xrayMeshes = names.map(name => {
        const marker = BABYLON.MeshBuilder.CreateSphere(`poseXray_${name}`, { diameter: .07, segments: 6 }, this.scene);
        marker.material = material; marker.renderingGroupId = 3; marker.isPickable = false;
        return marker;
      });
      this.xrayLines = BABYLON.MeshBuilder.CreateLineSystem('poseXrayBones', { lines: pairs.map(() => [BABYLON.Vector3.Zero(), BABYLON.Vector3.Zero()]), updatable: true }, this.scene);
      this.xrayLines.color = BABYLON.Color3.FromHexString('#ffdc70');
      this.xrayLines.renderingGroupId = 3;
      this.xrayLines.isPickable = false;
      const observer = this.scene.onBeforeRenderObservable.add(() => {
        if (!this.xrayVisible || !this.xrayLines || this.root.isDisposed()) return;
        const positions = new Map<TrackingJoint, BABYLON.Vector3>();
        names.forEach((name, i) => {
          const node = this.debugNodes[name] ?? this.joints[name as BatterJoint];
          this.xrayMeshes[i].setEnabled(!!node);
          if (!node) return;
          node.computeWorldMatrix(true);
          const position = node.getAbsolutePosition().clone();
          positions.set(name, position);
          this.xrayMeshes[i].position.copyFrom(position);
          this.xrayMeshes[i].material = this.trackingPose && this.trackedConfidence[name] ? material : uncertain;
        });
        BABYLON.MeshBuilder.CreateLineSystem('poseXrayBones', { lines: pairs.map(([a,b]) => { const start = positions.get(a), end = positions.get(b); return start && end ? [start, end] : [start ?? BABYLON.Vector3.Zero(), start ?? BABYLON.Vector3.Zero()]; }), instance: this.xrayLines }, this.scene);
      });
      this.root.onDisposeObservable.addOnce(() => {
        this.scene.onBeforeRenderObservable.remove(observer);
        this.xrayMeshes.forEach(mesh => mesh.dispose());
        this.xrayLines?.dispose();
        material.dispose();
        uncertain.dispose();
      });
    }
    this.xrayMeshes.forEach(mesh => mesh.setEnabled(visible));
    this.xrayLines?.setEnabled(visible);
  }

  setTrackingFacing(facing: number | null): void {
    const turn = facing ?? 0;
    this.trackedFacing = turn;
    if (this.modelFacing) this.modelFacing.rotation.y = Math.PI + this.frontFacingAdjustment + this.bindRootYaw - this.root.rotation.y + turn;
    this.joints.pelvis.rotation.y = -this.root.rotation.y + turn;
  }

  animateSwing(direction: number, done: () => void, shotType: ShotType = 'grounded', footwork: 'front_foot' | 'back_foot' = 'front_foot'): void {
    this.trackingPose = false;
    for (const joint of Object.values(this.joints)) joint.rotationQuaternion = null;
    const side = Math.sin((direction % 8) * Math.PI / 4);
    const forward = Math.cos((direction % 8) * Math.PI / 4);
    const handed = this.batPivot.parent === this.joints.leftWrist ? -1 : 1;
    const amplitude = shotType === 'defensive' ? 0.35 : shotType === 'grounded' ? 0.7 : shotType === 'lofted' ? 1.05 : 1.25;
    const lift = shotType === 'lofted' ? 0.7 : shotType === 'power' ? 0.35 : shotType === 'defensive' ? -0.2 : 0;
    const animate = (node: BABYLON.TransformNode, axis: 'x' | 'y' | 'z', values: number[]) => {
      this.scene.stopAnimation(node);
      const animation = new BABYLON.Animation(`swing_${node.name}_${axis}`, `rotation.${axis}`, 60, BABYLON.Animation.ANIMATIONTYPE_FLOAT);
      animation.setKeys([0, 4, 10, 18].map((frame, index) => ({ frame, value: values[index] })));
      this.scene.beginDirectAnimation(node, [animation], 0, 18, false);
    };
    this.scene.stopAnimation(this.joints.leftShoulder);
    this.scene.stopAnimation(this.joints.rightShoulder);
    this.scene.stopAnimation(this.batPivot);
    for (const [shoulder, rest] of [[this.joints.leftShoulder, -0.12], [this.joints.rightShoulder, 0.12]] as const) {
      animate(shoulder, 'z', [rest, rest - handed * amplitude * 0.6, rest + handed * amplitude * (0.7 + side * 0.3), rest]);
    }
    for (const elbow of [this.joints.leftElbow, this.joints.rightElbow]) {
      animate(elbow, 'x', [0, -amplitude * 0.5, 0.25 + forward * 0.2 + lift, 0]);
    }
    animate(this.joints.chest, 'y', [0, -handed * amplitude * 0.2, handed * amplitude * (0.4 + side * 0.3), 0]);
    const leadHip = footwork === 'front_foot' ? this.joints.leftHip : this.joints.rightHip;
    animate(leadHip, 'x', [0, -0.1, footwork === 'front_foot' ? -0.28 : 0.2, 0]);
    const bat = new BABYLON.Animation('batSwing', 'rotation.z', 60, BABYLON.Animation.ANIMATIONTYPE_FLOAT);
    bat.setKeys([{ frame: 0, value: -0.2 }, { frame: 4, value: -0.2 - handed * amplitude * 0.8 }, { frame: 10, value: -0.2 + handed * amplitude * (0.9 + side * 0.3 + lift) }, { frame: 18, value: -0.2 }]);
    this.scene.beginDirectAnimation(this.batPivot, [bat], 0, 18, false, 1, done);
  }
}
