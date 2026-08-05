# 인수인계 문서 — subway-seat-rush 그래픽 개선 작업

작성일: 2026-08-05 / 작성자: Claude (이전 세션) → CODEX 인계용

## 0. 가장 먼저 알아야 할 것 — 커밋 안 된 작업 다수

`git status` 기준, 아래 파일들이 **전부 uncommitted**(작업 디렉토리에만 존재, 아직 커밋 안 됨) 상태입니다.
CODEX가 작업을 이어받기 전에 **커밋 여부를 사용자에게 먼저 확인**하는 걸 권장합니다.

```
On branch dohyun (origin/dohyun 와 동기화됨, 즉 마지막 커밋 095e9db 이후 아무것도 push 안 됨)

Modified (unstaged):
  index.html, js/ai.js, js/entities.js, js/hazards.js, js/main.js,
  js/modules/movement-system.js, js/modules/runtime.js, js/modules/station-system.js,
  js/player.js, js/scene.js, js/systems.js, style.css

Untracked:
  assets/                          (assets/models/subway-line1.glb, 4.1MB — 최적화된 실제 지하철 모델)
  js/modules/character-assets.js
  js/modules/character-model.js
  js/modules/gltf-asset-loader.js
  subway.glb                       (126MB — 사용자가 구매한 원본 Sketchfab 모델, 최적화 전 원본)
```

- 브랜치: `dohyun` (origin/dohyun과 sync 완료 상태 — 즉 마지막 push는 095e9db "1차 구현 완료"까지고, 그 이후 모든 그래픽 개선 작업은 로컬에만 있음).
- **절대 `JunHee` 브랜치에서 작업하지 말 것** (사용자 명시 지시). 최종적으로 `demo` 브랜치로 PR 예정.
- `subway.glb`(126MB, 루트)는 커밋하면 안 됨 — .gitignore 추가하거나 삭제 권장(아직 미처리, 사용자에게 아직 여쭤보지 않음).
- 사용자 bash 권한 방침: "삭제 및 reset류를 제외한 모든 명령은 물어보지 않고 실행해도 됨"이라고 이전에 명시함.

## 1. 프로젝트 개요

- 위치: `prototypes/subway-seat-rush/` — Three.js r128, 빌드 툴 없는 순수 정적 HTML/JS 게임.
- 로컬 실행: `file://`는 ES Module 때문에 안 됨. 반드시 로컬 서버 필요.
  Windows에서 `python3`는 스토어 스텁이라 동작 안 함 → 실제 인터프리터 경로로 실행: `/c/Python314/python -m http.server 8792` (또는 사용자 환경의 실제 python 경로).
- 게임 내용: 퇴근길 지하철에서 자리 뺏기/버티기 서바이벌. 좌석 착석, NPC 경쟁, 이벤트(자리 양보 등), 손잡이, 문 등 시스템 존재.

## 2. 이번 작업 세션의 목표

사용자 요청: "게임이 당장 출시해도 될 정도로 그래픽 개선" — UI 및 지하철 내부/캐릭터 디자인 업그레이드.
방향 선택: **실물에 가까운 3D 에셋 사용** (원시 도형 폴리싱이 아니라 실제 모델 기반).

### 2-1. 캐릭터: Fall Guys풍 절차적 "젤리빈" 캐릭터
- Fall Guys 실제 에셋은 저작권 문제로 사용 불가 → **절차적으로 직접 제작**하기로 결정.
- `js/scene.js`의 `makeCharacter(bodyColor, headColor)` 가 캐릭터 팩토리:
  - 몸통: `SphereGeometry(0.46, 20, 16)`을 `(1, 0.85, 0.95)`로 스케일 (→ X 지름 ≈ 0.92, 스케일 안 먹음).
  - 머리: `SphereGeometry(0.4, ...)`, 눈, 팔다리는 `makeStubLimb()`.
- `createCharacterGroup()`이 캐릭터 생성 진입점 — 예전엔 GLTF 로드 분기가 있었으나 지금은 **항상 절차적 젤리빈만 사용** (GLTF 캐릭터 파이프라인은 아래 4번 항목대로 완전히 dormant 상태).

### 2-2. 지하철 차량: 실제 구매 3D 모델로 교체
사용자가 Sketchfab에서 실제 지하철 차량 모델(`subway.glb`, CC BY 4.0, 제작자 cktjrrud0404)을 구매 → 최적화해서 게임에 통합.

## 3. 지하철 모델 파이프라인 (가장 복잡하고 많은 반복이 있었던 부분)

### 3-1. 최적화 과정 (스크래치패드 스크립트, 저장소에는 없음 — 재사용 필요시 재작성 필요)
원본 `subway.glb`(132MB) → `assets/models/subway-line1.glb`(4.1MB)로 축소. 사용 도구: `@gltf-transform/core`, `@gltf-transform/functions` (npx, 프로젝트 의존성 아님, 세션 스크래치패드에만 설치됨).

파이프라인 순서(중요 — 순서 바뀌면 결과 나빠짐, `join`/`flatten`은 절대 `simplify` 전에 하지 말 것):
```
weld → (이름/geometry 기반 불필요 부품 삭제, trim.mjs) → simplify → dedup → prune
```
- 단순 폴리곤 축소(`simplify`)만으로는 거의 안 줄어듦 — 원인은 큰 메쉬가 아니라 볼트/바 등 **작은 부품이 극단적으로 많이 반복**되기 때문. 이름 패턴 삭제 + X범위 크롭 + "얇고 넓은 판" 기하학적 규칙(지붕/천장 트림 자동 탐지)을 `simplify` **이전에** 적용해야 효과 있음.
- `EXT_mesh_gpu_instancing`은 r128 GLTFLoader.js가 미지원 확인됨(grep으로 확인) → `--instance` 옵션 사용 불가.

### 3-2. 런타임 통합 (`js/scene.js`)

**설정값** (`js/scene.js` 상단 근처):
```js
const SUBWAY_MODEL = {
  url: 'assets/models/subway-line1.glb?v=4',
  scale: { x: 2.0, y: 1.139, z: 1.451 },
  offset: { x: 4.79, y: 1.33, z: 0 }
};
```
- `scale.x=2.0`인 이유: 모델 실측 결과 벤치 1인당 폭 ≈0.478인데 캐릭터 몸통 X 지름 ≈0.92라서 캐릭터 1명이 좌석 눈금 2칸을 덮어버림. 유저 제안대로 **모델 자체를 옆으로 2배 늘려서** 좌석 1칸 = 캐릭터 1명 폭이 되도록 보정.
- `offset.x=4.79`: 모델의 실제 문 중심(★기준 x≈-2.395)이 우리 게임 좌표계의 문(x=0)에 오도록 스케일 변경 후 재계산한 값.

**로드 함수** `loadSubwayModel(shellMeshes, endCapMeshes)` (js/scene.js:93~136):
- 비동기 GLTF 로드 성공 시에만 프리미티브 "껍데기"(벽/좌석/벤치 등, `shellMeshes` 배열)를 숨김 → 로드 실패해도 게임이 깨지지 않는 폴백 구조.
- `renderer.localClippingEnabled = true` + `THREE.Plane` 클리핑으로 `MODEL_CLIP_Y=2.8` 위쪽(지붕/천장 잔여물)을 렌더링 단계에서 통째로 잘라냄 — **이름 기반 파일 삭제보다 훨씬 견고한 해결책**이었음(자세한 배경은 4번 항목 참고).
- 로드 후 모델의 실제 `Box3`를 계산해서 끝벽(`endCapMeshes`) 위치를 동적으로 재배치(트리밍으로 잘린 모델 끝이 뻥 뚫려 보이는 문제 방지).
- 클리핑으로 지붕이 사라진 자리에 아주 옅은 반투명 캡(`opacity:0.12`)을 씌워서 "막힌 공간" 느낌만 살림.

**재질 처리** `applyGlassTransparency(material)` (js/scene.js:62~78, **가장 최근에 수정한 부분**):
```js
function applyGlassTransparency(material) {
  if (!material) return;
  const name = material.name || '';
  if (/glass|window/i.test(name)) {
    material.transparent = true;
    material.opacity = 0.22;
    material.depthWrite = false;
    return;
  }
  if (/^(basic_white|door_pattern|black_rubber)$/i.test(name)) {
    material.transparent = true;
    material.opacity = 0.4;
    material.depthWrite = false;
  }
}
```
- 원본 모델의 유리/창문 재질이 전부 불투명(OPAQUE)이라 위쪽에서 내려다보는 카메라로는 내부가 안 보였음 → 강제 반투명화.
- **가장 최근 변경(이번 세션)**: 사용자가 "벽하고 문 오브젝트 투명도를 높여서 좌석/NPC가 더 잘 보이게" 요청 → `basic_white`(벽 패널), `door_pattern`(문), `black_rubber`(문 테두리 고무) 재질도 반투명(opacity 0.4) 처리 추가. **사용자 확인 아직 안 받음** — 다음 대화에서 결과 확인 필요.
- 재질 이름은 `@gltf-transform/core`로 `subway-line1.glb`를 직접 inspect해서 확인한 실측값(모델 전체 재질 목록, 부품별 world bbox 집계)이며, 많은 재질이 좌/우 대칭 및 여러 부품에 재사용되고 있어 이름만으로 "이건 확실히 벽이다"라고 100% 단정하긴 어려움 — 필요시 스크래치패드에 `mat-bounds.mjs`(재질별 집계 bbox 출력 스크립트, 아래 8번 참고) 재작성해서 재확인 가능.

**손잡이 정리** `isOverheadBarClutter(mesh)` (js/scene.js:75~78):
```js
function isOverheadBarClutter(mesh) {
  const mats = mesh.material ? (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) : [];
  return mats.some(m => /^(deep_green|light_gray|black_plastic)$/i.test(m?.name || ''));
}
```
- 검은색 손잡이 그립(모델에 원래 있던 것)이 우리 게임의 노란색 기능성 손잡이와 헷갈린다는 피드백으로 숨김 처리. **이것만 남기고 그 외 모든 "천장 잡동사니 숨기기" 로직은 전부 되돌렸음** (아래 4번 "포기한 문제" 참고).

## 4. 포기한 문제 — "공중에 떠있는 6개의 흰색 물체" (중요, 재시도 금지)

사용자가 스크린샷에 빨간 원으로 표시한 정체불명의 흰색 물체 6개를 반복적으로 제거 시도했으나 **끝내 해결 못 하고 사용자가 명시적으로 포기 지시**:

> "그냥 저 6개 물체 없애는 거 포기하고 천장에 달린 bar들도 다 원상복구해줘"

시도했던 것들 (전부 실패 또는 부작용 발생, 모두 되돌림):
- 광고판/천장 필/장식 스티커 등 이름·재질 기반 후보 다수 시도 — 서버 캐시 아님, 브라우저 캐시 아님(시크릿+하드리프레시로 확인) 확인했지만 여전히 안 사라짐.
- 우클릭 레이캐스트 진단 도구(`js/main.js`의 `contextmenu` 리스너, 아래 5번 참고)로 발견: **`basic016`이라는 거대한 예약/충돌 프록시 노드**(sx≈19.28, sy≈2.47 — 차량을 거의 다 덮는 크기)가 모든 우클릭을 가로채고 있었음. 이게 6개 물체의 정체인지는 끝내 확인 못 함.
- `basic016`을 숨기는 시도 → **벽/문/바닥이 뿌옇게 뜨는 새로운 시각적 회귀 발생**(아마 이 박스가 뒤 배경 가림 역할도 겸하고 있었던 듯). 이 부작용 때문에 전부 되돌림.
- **최종 상태**: `isOverheadBarClutter`는 검은 손잡이 그립만 숨기는 최소 형태로 복원. 6개 물체 문제는 미해결 상태로 남아있고, **더 이상 건드리지 말라는 것이 사용자 지시**임. CODEX가 이 문제를 다시 파고들기 전에 반드시 사용자에게 재확인 필요.

## 5. 남아있는 디버깅용 코드 (제거 요청받지 않음, 정리 필요할 수 있음)

`js/main.js`의 `bindEventsOnce()` 안, `contextmenu` 이벤트 리스너(약 458번째 줄)에 **우클릭하면 레이캐스트로 클릭된 오브젝트의 이름 체인을 콘솔+화면에 출력하는 진단 도구**가 남아있음. "6개 물체" 문제 진단용으로 추가했던 것 — 게임 정식 기능 아님. 삭제 요청은 없었으나 정리 후보.

## 6. 카메라 — 문쪽 벽 근처 캐릭터 시야 가림 문제

- 문제: 클리핑 높이(`MODEL_CLIP_Y`)를 1.9→2.8로 올려 창문/문/기둥을 완전한 형태로 살렸더니, 그 벽 프레임이 커지면서 카메라 각도(기존 약 39°, 완만함)로는 문쪽 벽 근처 캐릭터가 프레임에 가려 안 보이는 문제 발생.
- 검토한 4가지 옵션(플랜모드로 제안): ① 카메라 각도를 가파르게, ② 벽 지오메트리만 손보기(반복 실패 패턴이라 비추천), ③ 매 프레임 occlusion 감지 후 반투명화(가장 정석이지만 구현 큼), ④ 캐릭터 상시 표시 마커(안전망 성격).
- 사용자 결정: **"1번을 시도해보고 맘에 안들면 롤백해서 3번으로 가자"** → 1번만 구현함.
- 적용: `js/scene.js initScene()`과 `js/main.js updateCamera()` 양쪽에서 카메라를 `(0,9,10)` → `(0,11.5,7.5)`로 이동(각도 약 39°→약 55°, 더 위/가깝게 = 더 탑뷰에 가깝게).
- **사용자의 최종 확인을 명시적으로 받지 못함** — 이후 스크린샷 피드백이 다른 이슈(천장 재차단, 기둥, 손잡이)로 넘어가면서 암묵적으로 수용된 것으로 보이나, CODEX가 재확인해보는 것을 권장.
- 옵션 ③(occlusion 감지 반투명)이나 ④(캐릭터 상시 마커)는 미구현 — 필요시 다음 단계로 고려 가능.

## 7. 좌석/벤치 배치 (`js/scene.js` `buildBenchesAndSeats()`)

3번의 시행착오 끝에 확정된 현재 값 — 모델의 실측 벤치 피치(≈0.478/인당, 스케일 2배 적용 후 ≈0.956) 기준:
```js
const seatDefs = [
  { x:-4.28, z:-1.7, face: 1 }, { x:-3.33, z:-1.7, face: 1 }, { x:-2.37, z:-1.7, face: 1 },
  { x: 2.39, z:-1.7, face: 1 }, { x: 3.34, z:-1.7, face: 1 },
  { x:-4.28, z: 1.7, face:-1 }, { x:-3.33, z: 1.7, face:-1 }, { x:-2.37, z: 1.7, face:-1 },
  { x: 2.39, z: 1.7, face:-1 }, { x: 3.34, z: 1.7, face:-1 }
];
```
좌석 박스(프리미티브)는 모델 로드 성공 시 숨겨지고(`envShellMeshes`에 포함), 모델 자체의 좌석이 그 자리를 대신 보여줌 — 좌표는 게임 로직(착석 판정 등)에서 계속 사용되므로 그대로 둬야 함.

## 8. 재사용 가능한 조사 도구 (세션 스크래치패드, 저장소 밖 — 필요시 재작성 필요)

경로: `C:\Users\admin\AppData\Local\Temp\claude\...\scratchpad\gltf-inspect\` (세션별 임시 경로라 다음 세션엔 없을 수 있음. `@gltf-transform/core`/`@gltf-transform/functions`를 `npm install`해서 재구성 가능)
- `trim.mjs` — 파일 레벨 부품 삭제 스크립트(이름 패턴 + 정확 이름 목록 + X범위 크롭 + 기하학적 "얇은 판" 규칙). 지붕 문제는 이제 런타임 클리핑으로 해결해서 이 스크립트는 현재 비활성/참고용.
- `find-parts.mjs` — 키워드로 노드 이름/위치 검색.
- `list-mats.mjs`, `mat-bounds.mjs` — 이번 세션에 새로 작성. 모델의 전체 재질 이름 목록 및 재질별 집계 world bbox(min/max/size) 출력 — 투명도 작업 시 어떤 재질이 어디에 쓰이는지 확인하는 데 사용.

**교훈**: 이름 기반 정확 매칭은 gltf-transform과 Three.js 런타임 사이에서 이름 표기가 미묘하게 달라져(`basic.016` vs `basic016` 등) 깨지기 쉬웠음. 크기/위치 등 **기하학적 특징 기반 판별이 이름 매칭보다 훨씬 견고**했다는 게 이번 작업의 핵심 교훈.

## 9. 지금 당장 확인이 필요한 것 (다음 세션 첫 할 일)

1. **가장 최근 변경**(벽/문 반투명화, opacity 0.4)이 의도대로 보이는지 — 너무 흐릿하거나 반대로 안 보이는 부작용이 있는지 스크린샷으로 확인.
2. 카메라 각도 변경(6번 항목)이 여전히 만족스러운지 재확인.
3. 이 모든 uncommitted 변경사항을 커밋할지 여부 — 사용자 확인 후 진행.
4. `subway.glb`(126MB, 루트) 처리 방침 결정 — .gitignore 추가 또는 삭제.
