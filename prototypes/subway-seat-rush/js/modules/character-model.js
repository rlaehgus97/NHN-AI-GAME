/* character-model.js — GLTF 캐릭터 인스턴스 래퍼(CharacterModel) + 플레이스홀더 애셋 매니페스트.
   나중에 실제 아트로 교체할 때는 ASSET_MANIFEST 한 곳만 바꾸면 된다. */

// 기존 makeCharacter() 프리미티브 캐릭터의 대략적인 키(발~정수리, 단위: 씬 유닛)와
// 맞춰서 좌석/문/벤치 치수(constants.js CAR)를 다시 튜닝하지 않아도 되게 한다.
const TARGET_HEIGHT = 1.57;

export const ASSET_MANIFEST = {
  url: 'https://raw.githubusercontent.com/mrdoob/three.js/r128/examples/models/gltf/RobotExpressive/RobotExpressive.glb',
  clips: {
    idle: 'Idle',
    walk: 'Walking',
    run: 'Running',
    sit: 'Sitting',
    handle: 'Standing', // HOLDING_HANDLE에 정확히 맞는 클립이 없어 근사치로 사용
    punch: 'Punch'
  },
  bones: {
    rightHand: 'Hand.R'
  }
};

const warned = new Set();
function warnOnce(key, msg) {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn('[CharacterModel] ' + msg);
}

export class CharacterModel {
  // sourceGLTF: gltf-asset-loader가 캐싱한 { scene, animations } (모든 인스턴스가 공유)
  constructor(sourceGLTF, onDestroy) {
    const cloned = THREE.SkeletonUtils.clone(sourceGLTF.scene);

    // 발이 y=0에 오도록, 키가 TARGET_HEIGHT가 되도록 자동 보정.
    // 외부(게임 로직)는 오직 this.group의 position/rotation/scale만 건드리므로
    // 이 보정값은 별도의 내부 wrapper에 둬서 외부 조작과 절대 충돌하지 않게 한다.
    const box = new THREE.Box3().setFromObject(cloned);
    const rawHeight = Math.max(0.0001, box.max.y - box.min.y);
    const scale = TARGET_HEIGHT / rawHeight;

    const calibration = new THREE.Group();
    calibration.scale.setScalar(scale);
    calibration.position.y = -box.min.y * scale;
    calibration.add(cloned);

    this.group = new THREE.Group();
    this.group.add(calibration);
    this.group.userData.characterModel = this;

    this.clonedScene = cloned;
    this.animations = sourceGLTF.animations;
    this.mixer = new THREE.AnimationMixer(cloned);
    this.currentAction = null;
    this._locomotionState = undefined;
    this._boneCache = new Map();
    this._onDestroy = onDestroy;
  }

  playAction(semanticName, opts = {}) {
    const clipName = ASSET_MANIFEST.clips[semanticName];
    const clip = clipName && THREE.AnimationClip.findByName(this.animations, clipName);
    if (!clip) { warnOnce('clip:' + semanticName, '클립을 찾을 수 없음: ' + semanticName); return; }

    const action = this.mixer.clipAction(clip);
    action.clampWhenFinished = !!opts.clampWhenFinished;
    action.loop = opts.loop !== undefined ? opts.loop : THREE.LoopRepeat;
    action.timeScale = opts.timeScale || 1;
    action.reset();
    action.play();

    if (this.currentAction && this.currentAction !== action) {
      this.currentAction.crossFadeTo(action, opts.fadeTime !== undefined ? opts.fadeTime : 0.15, false);
    }
    this.currentAction = action;
  }

  setLocomotion(state) {
    if (state === this._locomotionState) return;
    this._locomotionState = state;
    if (state) this.playAction(state, { fadeTime: 0.2 });
  }

  // 다음 setLocomotion() 호출이 (직전과 같은 state라도) 반드시 크로스페이드를 다시 트리거하게 만든다.
  // 예: 가방 공격(Punch)이나 앉기(Sitting)처럼 setLocomotion을 거치지 않고 playAction을 직접
  // 호출한 뒤, 원래 로코모션으로 복귀해야 할 때 캐시된 state와 실제 재생 중인 액션이 어긋나는 것을 막는다.
  resetLocomotion() {
    this._locomotionState = undefined;
  }

  getAttachPoint(alias) {
    const boneName = ASSET_MANIFEST.bones[alias] || alias;
    if (this._boneCache.has(boneName)) return this._boneCache.get(boneName);
    let found = null;
    this.clonedScene.traverse(o => { if (!found && o.isBone && o.name === boneName) found = o; });
    if (!found) { warnOnce('bone:' + boneName, '본을 찾을 수 없음: ' + boneName); found = this.group; }
    this._boneCache.set(boneName, found);
    return found;
  }

  update(dt) {
    this.mixer.update(dt);
  }

  destroy() {
    this.mixer.stopAllAction();
    if (this._onDestroy) this._onDestroy(this);
  }
}
