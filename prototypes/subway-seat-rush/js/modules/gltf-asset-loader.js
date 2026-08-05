/* gltf-asset-loader.js — THREE.GLTFLoader 얇은 래퍼, URL 기준 Promise 캐시.
   게임 지식이 전혀 없는 범용 유틸 — 나중에 차량/환경 모델을 불러올 때도 그대로 재사용한다. */

const cache = new Map();
let loaderInstance = null;

// THREE.GLTFLoader는 별도 classic <script>(GLTFLoader.js)가 붙여주는 전역이라
// 그 스크립트가 CDN 차단 등으로 실패했을 수 있다. 모듈 평가 시점(top-level)이 아니라
// 실제 호출 시점에 지연 생성해야, 이 모듈을 import하는 다른 ES 모듈들의 평가가
// GLTFLoader 부재만으로 통째로 깨지지 않는다.
function getLoader() {
  if (!loaderInstance) {
    if (typeof THREE === 'undefined' || !THREE.GLTFLoader) return null;
    loaderInstance = new THREE.GLTFLoader();
  }
  return loaderInstance;
}

export function loadGLTF(url) {
  if (!cache.has(url)) {
    cache.set(url, new Promise((resolve, reject) => {
      const loader = getLoader();
      if (!loader) { reject(new Error('THREE.GLTFLoader is not available')); return; }
      loader.load(url, resolve, undefined, reject);
    }));
  }
  return cache.get(url);
}
