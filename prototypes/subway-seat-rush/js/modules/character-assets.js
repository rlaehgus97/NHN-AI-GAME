/* character-assets.js — 캐릭터 GLTF 애셋 프리로드 및 인스턴스 관리 싱글턴.
   window.GameModules.CharacterAssets 로 노출되어 legacy 스크립트(scene.js/entities.js/
   player.js/ai.js/main.js)에서 사용된다. */

import { loadGLTF } from './gltf-asset-loader.js';
import { CharacterModel, ASSET_MANIFEST } from './character-model.js';

const READY_TIMEOUT_MS = 8000;

let sourceGLTF = null;
let available = false;
let settled = false; // ready가 한 번 확정되면 그 이후의 뒤늦은 로드 성공/실패는 무시(세션 내 재분기 방지)
const activeInstances = new Set();

function hasLoaderSupport() {
  return typeof THREE !== 'undefined' && !!THREE.GLTFLoader && !!THREE.SkeletonUtils;
}

async function preload() {
  if (!hasLoaderSupport()) {
    console.warn('[CharacterAssets] GLTFLoader/SkeletonUtils 미탑재 — 프리미티브 캐릭터로 폴백합니다.');
    return;
  }
  try {
    const gltf = await loadGLTF(ASSET_MANIFEST.url);
    if (!settled) { sourceGLTF = gltf; available = true; }
  } catch (err) {
    console.warn('[CharacterAssets] 플레이스홀더 모델 로드 실패 — 프리미티브 캐릭터로 폴백합니다.', err);
  }
}

const timeout = new Promise(resolve => setTimeout(resolve, READY_TIMEOUT_MS));

const ready = Promise.race([preload(), timeout]).then(() => { settled = true; });

function createInstance() {
  if (!available || !sourceGLTF) return null;
  const model = new CharacterModel(sourceGLTF, m => activeInstances.delete(m));
  activeInstances.add(model);
  return model;
}

function destroyInstance(model) {
  if (model) model.destroy();
}

function updateAll(dt) {
  activeInstances.forEach(m => m.update(dt));
}

export const CharacterAssets = {
  ready,
  get available() { return available; },
  get activeCount() { return activeInstances.size; },
  createInstance,
  destroyInstance,
  updateAll
};
