/* =========================================================================
 *  「왁뿌볼이 되어버리다?!」 프로토타입
 *  - 순수 HTML/CSS/JS + Three.js(CDN, UMD 전역 THREE)
 *  - 이동 / 구 굴리기 / 장애물·추격자 충돌 / 내구도 / 대시 검증용
 * ========================================================================= */

/* ===== 전역 상수 ===== */
const MAP_SIZE = 50;               // 바닥 한 변 길이
const MAP_HALF = MAP_SIZE / 2;     // 경계 계산용 반값
const PLAYER_RADIUS = 0.6;         // 플레이어 구 반지름

const PLAYER_MAX_SPEED = 7;        // 일반 최대 이동 속도 (units/sec)
const DASH_MULTIPLIER = 1.7;       // 대시 배율
const ACCEL_SMOOTH = 9;            // 가속 부드러움 (클수록 빠르게 붙음)
const DECEL_SMOOTH = 3;            // 감속 부드러움 (작을수록 더 미끄러짐)

const CHASER_SPEED = 6;            // 추격자 속도 (플레이어 일반 속도보다 느림)
const OBSTACLE_COUNT = 10;         // 장애물 개수

const MAX_DURABILITY = 100;        // 최대 내구도
const DMG_OBSTACLE = 15;           // 장애물 충돌 데미지
const DMG_CHASER = 30;             // 추격자 충돌 데미지
const INVULN_TIME = 0.7;           // 충돌 무적 시간(초)

const CAMERA_LERP = 5;             // 카메라 추종 부드러움
const MAX_DELTA = 0.05;            // deltaTime 상한 (비정상 이동 방지)

/* ===== 게임 상태 ===== */
const GAME_STATE = { START: 'START', PLAYING: 'PLAYING', GAME_OVER: 'GAME_OVER' };
let currentState = GAME_STATE.START;

/* ===== Three.js 핵심 객체 ===== */
let scene, camera, renderer, clock;

/* ===== 게임 오브젝트 ===== */
let player = null;          // { mesh, velocity, durability, invulnTimer, hitFlashTimer, crackMeshes, baseColor }
let obstacles = [];         // [{ mesh, box }]
let chasers = [];           // [{ group }]
let dashParticles = [];     // [{ mesh, life, maxLife }]

/* ===== 게임 변수 ===== */
let survivalTime = 0;       // 생존 시간(초)
let centerMessageTimer = 0; // '도망쳐!' 표시 타이머
let shakeTimer = 0;         // 화면 흔들림 타이머
let dashSpawnTimer = 0;     // 대시 잔상 생성 간격 타이머
let showDebug = false;      // 디버그 표시 여부
let fps = 0;                // 평활화된 FPS

/* ===== 입력 상태 (Set으로 관리) ===== */
const keys = new Set();

/* =========================================================================
 *  초기화
 * ========================================================================= */
function init() {
  // Three.js 로드 확인
  if (typeof THREE === 'undefined') {
    document.getElementById('start-screen').innerHTML =
      '<div class="overlay-box"><h1 class="title gameover-title">로드 실패</h1>' +
      '<p class="subtitle">Three.js CDN을 불러오지 못했습니다.<br>인터넷 연결을 확인해 주세요.</p></div>';
    return;
  }

  // 렌더러
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.getElementById('game-container').appendChild(renderer.domElement);

  // 씬
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1a2a);
  scene.fog = new THREE.Fog(0x1a1a2a, 45, 90);

  // 카메라 (3인칭 뒤쪽 위)
  camera = new THREE.PerspectiveCamera(
    60, window.innerWidth / window.innerHeight, 0.1, 300
  );
  camera.position.set(0, 7, 10);
  camera.lookAt(0, 0, 0);

  clock = new THREE.Clock();

  // 월드 구성
  createLights();
  createGround();
  createPlayer();
  createChasers();
  createObstacles();
  resetChasers();

  // 입력 / UI / 리사이즈
  setupInput();
  setupUI();
  window.addEventListener('resize', onResize);

  // 애니메이션 루프 시작 (단 한 번만 시작 → 재시작 시 중복 없음)
  animate();
}

/* =========================================================================
 *  조명 / 바닥
 * ========================================================================= */
function createLights() {
  // 전체 밝기
  const ambient = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambient);

  // 방향광 (그림자 생성)
  const dir = new THREE.DirectionalLight(0xffffff, 0.85);
  dir.position.set(12, 22, 8);
  dir.castShadow = true;
  dir.shadow.mapSize.set(1024, 1024);
  dir.shadow.camera.left = -35;
  dir.shadow.camera.right = 35;
  dir.shadow.camera.top = 35;
  dir.shadow.camera.bottom = -35;
  dir.shadow.camera.near = 1;
  dir.shadow.camera.far = 70;
  scene.add(dir);
}

function createGround() {
  // 바닥 평면
  const groundGeo = new THREE.PlaneGeometry(MAP_SIZE, MAP_SIZE);
  const groundMat = new THREE.MeshStandardMaterial({ color: 0x2c2c40, roughness: 1 });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // 격자무늬
  const grid = new THREE.GridHelper(MAP_SIZE, MAP_SIZE, 0x5a5a80, 0x3a3a55);
  grid.position.y = 0.01;
  scene.add(grid);
}

/* =========================================================================
 *  플레이어 생성
 * ========================================================================= */
function createPlayer() {
  const geo = new THREE.SphereGeometry(PLAYER_RADIUS, 32, 32);
  const baseColor = new THREE.Color(0xffcc33); // 밝은 노랑
  const mat = new THREE.MeshStandardMaterial({
    color: baseColor.clone(), roughness: 0.35, metalness: 0.1
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.position.set(0, PLAYER_RADIUS, 0);
  scene.add(mesh);

  // 회전 확인용 장식(띠·점·눈)을 자식으로 추가 → 구와 함께 회전
  addPlayerDecorations(mesh);

  // 균열 메시(자식) 미리 생성, 처음엔 모두 숨김
  const crackMeshes = createCrackMeshes(mesh);

  player = {
    mesh,
    velocity: new THREE.Vector3(),
    durability: MAX_DURABILITY,
    invulnTimer: 0,
    hitFlashTimer: 0,
    crackMeshes,
    baseColor
  };
}

// 플레이어 표면 장식 (모두 자식 오브젝트)
function addPlayerDecorations(mesh) {
  // 적도 띠 (토러스)
  const band = new THREE.Mesh(
    new THREE.TorusGeometry(PLAYER_RADIUS * 0.98, 0.06, 8, 32),
    new THREE.MeshStandardMaterial({ color: 0xff5577 })
  );
  band.rotation.x = Math.PI / 2;
  mesh.add(band);

  // 방향 확인용 점들
  const dotMat = new THREE.MeshStandardMaterial({ color: 0x3aa0ff });
  const dotDirs = [
    new THREE.Vector3(0.6, 0.7, 0.3),
    new THREE.Vector3(-0.5, 0.6, -0.5),
    new THREE.Vector3(0.4, -0.6, 0.6)
  ];
  dotDirs.forEach((d) => {
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 10), dotMat);
    dot.position.copy(d.normalize()).multiplyScalar(PLAYER_RADIUS * 0.98);
    mesh.add(dot);
  });

  // 눈 (앞쪽 -Z = W 진행 방향)
  const eyeWhiteMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
  const eyeBlackMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
  [-1, 1].forEach((sx) => {
    const white = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 12), eyeWhiteMat);
    white.position.set(sx * 0.22, 0.18, -PLAYER_RADIUS * 0.9);
    mesh.add(white);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 10), eyeBlackMat);
    pupil.position.set(sx * 0.22, 0.18, -PLAYER_RADIUS * 0.99);
    mesh.add(pupil);
  });
}

// 내구도에 따라 표시할 균열(검은 선) 메시들
function createCrackMeshes(mesh) {
  const normals = [
    new THREE.Vector3(0.3, 0.5, -0.8),
    new THREE.Vector3(-0.6, 0.3, 0.7),
    new THREE.Vector3(0.7, -0.2, 0.6),
    new THREE.Vector3(-0.4, -0.6, -0.6),
    new THREE.Vector3(0.1, 0.8, 0.5),
    new THREE.Vector3(-0.8, 0.1, -0.3)
  ];
  const cracks = normals.map((n) => {
    const crack = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.02, 0.06),
      new THREE.MeshBasicMaterial({ color: 0x111111 })
    );
    const dir = n.clone().normalize();
    crack.position.copy(dir).multiplyScalar(PLAYER_RADIUS);
    // 박스의 +Y축을 표면 법선에 정렬 → 박스가 표면에 눕는다(검은 선처럼 보임)
    crack.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    crack.visible = false;
    mesh.add(crack);
    return crack;
  });
  return cracks;
}

/* =========================================================================
 *  장애물 생성
 * ========================================================================= */
function createObstacles() {
  const placed = [];
  let attempts = 0;

  while (placed.length < OBSTACLE_COUNT && attempts < 600) {
    attempts++;
    const x = randRange(-MAP_HALF + 3, MAP_HALF - 3);
    const z = randRange(-MAP_HALF + 3, MAP_HALF - 3);

    // 시작 지점(원점) 주변에는 생성하지 않음
    if (Math.hypot(x, z) < 6) continue;

    // 장애물끼리 지나치게 겹치지 않도록
    let overlap = false;
    for (const p of placed) {
      if (Math.hypot(x - p.x, z - p.z) < 4.5) { overlap = true; break; }
    }
    if (overlap) continue;

    const mesh = makeRandomObstacle();
    mesh.position.set(x, mesh.userData.baseY, z);
    scene.add(mesh);

    // 충돌 검사용 바운딩 박스(축 정렬 도형이므로 정확)
    const box = new THREE.Box3().setFromObject(mesh);
    obstacles.push({ mesh, box });
    placed.push({ x, z });
  }
}

// 무작위 기본 도형 장애물 하나 생성
function makeRandomObstacle() {
  const type = Math.floor(Math.random() * 3);
  const color = new THREE.Color().setHSL(0.07 + Math.random() * 0.1, 0.4, 0.42);
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.9 });

  let geo, height;
  if (type === 0) {
    // 상자
    const w = 1.5 + Math.random() * 1.5;
    const h = 1.5 + Math.random() * 2;
    const d = 1.5 + Math.random() * 1.5;
    geo = new THREE.BoxGeometry(w, h, d);
    height = h;
  } else if (type === 1) {
    // 원기둥
    const r = 0.8 + Math.random() * 0.7;
    const h = 1.5 + Math.random() * 2;
    geo = new THREE.CylinderGeometry(r, r, h, 16);
    height = h;
  } else {
    // 원뿔
    const r = 1 + Math.random() * 0.8;
    const h = 2 + Math.random() * 2;
    geo = new THREE.ConeGeometry(r, h, 16);
    height = h;
  }

  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.baseY = height / 2; // 바닥에 놓이도록 y 오프셋
  return mesh;
}

// 장애물 모두 제거(재시작 시 중복 방지)
function removeObstacles() {
  for (const o of obstacles) {
    scene.remove(o.mesh);
    o.mesh.geometry.dispose();
    o.mesh.material.dispose();
  }
  obstacles = [];
}

/* =========================================================================
 *  추격자 생성 (기본 도형 조합, 하나의 Group)
 * ========================================================================= */
function createChasers() {
  chasers.push({ group: makeChaser(0x2b2b45) });
  chasers.push({ group: makeChaser(0x402b3a) });
  chasers.forEach((c) => scene.add(c.group));
}

function makeChaser(bodyColor) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.8 });
  const headMat = new THREE.MeshStandardMaterial({ color: 0x55556e, roughness: 0.8 });

  // 다리 (원기둥 2개)
  [-0.15, 0.15].forEach((x) => {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.6, 12), bodyMat);
    leg.position.set(x, 0.3, 0);
    leg.castShadow = true;
    group.add(leg);
  });

  // 몸통 (상자)
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.3), bodyMat);
  body.position.set(0, 1.0, 0);
  body.castShadow = true;
  group.add(body);

  // 팔 (원기둥 2개)
  [-0.33, 0.33].forEach((x) => {
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.55, 12), bodyMat);
    arm.position.set(x, 1.0, 0);
    arm.castShadow = true;
    group.add(arm);
  });

  // 머리 (구)
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 16, 16), headMat);
  head.position.set(0, 1.55, 0);
  head.castShadow = true;
  group.add(head);

  // 코 (+Z 방향 = 바라보는 방향 확인용)
  const nose = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.08, 0.14),
    new THREE.MeshStandardMaterial({ color: 0xff5544 })
  );
  nose.position.set(0, 1.55, 0.24);
  group.add(nose);

  return group;
}

// 추격자를 시작 위치(먼 구석)로 되돌림
function resetChasers() {
  const spots = [
    { x: MAP_HALF - 4, z: MAP_HALF - 4 },
    { x: -(MAP_HALF - 4), z: -(MAP_HALF - 4) }
  ];
  chasers.forEach((c, i) => {
    c.group.position.set(spots[i].x, 0, spots[i].z);
    c.group.rotation.y = 0;
  });
}

/* =========================================================================
 *  입력 처리
 * ========================================================================= */
function setupInput() {
  window.addEventListener('keydown', (e) => {
    // H: 디버그 토글 (키 반복 무시)
    if ((e.key === 'h' || e.key === 'H') && !e.repeat) {
      showDebug = !showDebug;
      return;
    }
    const k = normalizeKey(e);
    if (k) {
      keys.add(k);
      e.preventDefault(); // 브라우저 기본 동작으로 입력이 끊기지 않도록
    }
  });

  window.addEventListener('keyup', (e) => {
    const k = normalizeKey(e);
    if (k) keys.delete(k);
  });

  // 창 밖으로 포커스가 나가면 눌린 키 상태를 초기화(키 고착 방지)
  window.addEventListener('blur', () => keys.clear());
}

// 이벤트를 내부 키 이름으로 정규화
function normalizeKey(e) {
  if (e.key === 'Shift') return 'shift';
  const k = e.key.toLowerCase();
  if (k === 'w' || k === 'a' || k === 's' || k === 'd') return k;
  return null;
}

/* =========================================================================
 *  UI 버튼 연결
 * ========================================================================= */
function setupUI() {
  document.getElementById('start-button').addEventListener('click', startGame);
  document.getElementById('restart-button').addEventListener('click', startGame);
}

/* =========================================================================
 *  게임 시작 / 초기화 / 종료
 * ========================================================================= */
function startGame() {
  resetGame();
  document.getElementById('start-screen').classList.add('hidden');
  document.getElementById('gameover-screen').classList.add('hidden');
  document.getElementById('hud').classList.remove('hidden');
  currentState = GAME_STATE.PLAYING;
  clock.getDelta(); // 대기 동안 쌓인 delta를 버려 첫 프레임 튐 방지
}

// 모든 게임 상태/오브젝트 초기화
function resetGame() {
  survivalTime = 0;
  centerMessageTimer = 2;   // 시작 직후 2초 '도망쳐!'
  shakeTimer = 0;
  dashSpawnTimer = 0;

  // 플레이어 초기화
  player.mesh.position.set(0, PLAYER_RADIUS, 0);
  player.mesh.quaternion.identity();
  player.mesh.scale.setScalar(1);
  player.velocity.set(0, 0, 0);
  player.durability = MAX_DURABILITY;
  player.invulnTimer = 0;
  player.hitFlashTimer = 0;
  player.mesh.material.color.copy(player.baseColor);
  updateCracks();

  // 장애물 재배치
  removeObstacles();
  createObstacles();

  // 추격자 위치 초기화
  resetChasers();

  // 대시 잔상 제거
  clearDashParticles();

  // 카메라 초기 위치
  camera.position.set(0, 7, 10);

  // 입력 초기화
  keys.clear();

  // UI 초기화
  document.getElementById('center-message').textContent = '';
  updateHUD();
}

function gameOver() {
  if (currentState !== GAME_STATE.PLAYING) return;
  currentState = GAME_STATE.GAME_OVER;
  document.getElementById('final-time').textContent = survivalTime.toFixed(1);
  document.getElementById('gameover-screen').classList.remove('hidden');
  document.getElementById('center-message').textContent = '';
  keys.clear();
}

/* =========================================================================
 *  메인 게임 갱신 (PLAYING 상태에서만 호출)
 * ========================================================================= */
function updateGame(dt) {
  // 타이머 갱신
  player.invulnTimer = Math.max(0, player.invulnTimer - dt);
  player.hitFlashTimer = Math.max(0, player.hitFlashTimer - dt);
  shakeTimer = Math.max(0, shakeTimer - dt);

  // 플레이어 이동 + 구 굴리기
  const dashing = updatePlayerMovement(dt);

  // 충돌 처리
  handleObstacleCollisions();
  updateChasers(dt);
  handleChaserCollisions();

  // 대시 잔상 생성
  handleDashParticles(dt, dashing);

  // 내구도 균열 / 피격 색상
  updateCracks();
  updatePlayerColor();

  // 생존 시간
  survivalTime += dt;

  // 중앙 메시지 / HUD
  updateCenterMessage(dt);
  updateHUD();
}

/* ===== 플레이어 이동 ===== */
// 반환값: 현재 프레임에서 대시 중인지 여부(boolean)
function updatePlayerMovement(dt) {
  // 입력 방향(월드 기준). 카메라 회전이 없으므로 월드 축 그대로 사용
  const dir = new THREE.Vector3();
  if (keys.has('w')) dir.z -= 1; // 앞
  if (keys.has('s')) dir.z += 1; // 뒤
  if (keys.has('a')) dir.x -= 1; // 좌
  if (keys.has('d')) dir.x += 1; // 우

  const hasInput = dir.lengthSq() > 0;
  if (hasInput) dir.normalize(); // 대각선 속도 과증가 방지

  const dashing = hasInput && keys.has('shift');
  const targetSpeed = PLAYER_MAX_SPEED * (dashing ? DASH_MULTIPLIER : 1);
  const targetVel = dir.multiplyScalar(hasInput ? targetSpeed : 0);

  // 프레임 독립적 부드러운 가/감속 (관성 슬라이드 포함)
  const rate = hasInput ? ACCEL_SMOOTH : DECEL_SMOOTH;
  const t = 1 - Math.exp(-rate * dt);
  player.velocity.lerp(targetVel, t);
  if (player.velocity.lengthSq() < 0.0004) player.velocity.set(0, 0, 0);

  // 위치 갱신 + 경계 제한
  const oldPos = player.mesh.position.clone();
  player.mesh.position.addScaledVector(player.velocity, dt);
  clampToBounds(player.mesh.position);

  // 실제 이동량으로 구 굴리기
  const actualDisp = player.mesh.position.clone().sub(oldPos);
  rollSphere(actualDisp);

  return dashing;
}

// 이동량에 맞춰 구를 실제로 굴린다
function rollSphere(disp) {
  const dist = Math.hypot(disp.x, disp.z);
  if (dist < 1e-6) return;
  const moveDir = new THREE.Vector3(disp.x, 0, disp.z).normalize();
  const up = new THREE.Vector3(0, 1, 0);
  // 회전축 = up × moveDir  (구르는 물리와 일치)
  const axis = new THREE.Vector3().crossVectors(up, moveDir).normalize();
  const angle = dist / PLAYER_RADIUS; // 회전량 = 이동거리 / 반지름
  player.mesh.rotateOnWorldAxis(axis, angle);
}

// 맵 경계 안으로 위치 제한
function clampToBounds(pos) {
  const m = MAP_HALF - PLAYER_RADIUS;
  pos.x = Math.max(-m, Math.min(m, pos.x));
  pos.z = Math.max(-m, Math.min(m, pos.z));
}

/* ===== 장애물 충돌 ===== */
function handleObstacleCollisions() {
  const center = player.mesh.position;
  for (const obs of obstacles) {
    // 박스 위에서 구 중심과 가장 가까운 점
    const closest = obs.box.clampPoint(center, new THREE.Vector3());
    const diff = new THREE.Vector3(center.x - closest.x, 0, center.z - closest.z);
    const dist = diff.length();

    if (dist < PLAYER_RADIUS) {
      // 밀어낼 방향 결정 (중심이 박스 안이면 속도 반대쪽)
      let pushDir;
      if (dist > 1e-4) {
        pushDir = diff.multiplyScalar(1 / dist);
      } else {
        pushDir = new THREE.Vector3(player.velocity.x, 0, player.velocity.z);
        if (pushDir.lengthSq() < 1e-6) pushDir.set(1, 0, 0);
        pushDir.normalize().negate();
      }

      // 통과 방지: 표면 밖으로 밀어냄
      player.mesh.position.addScaledVector(pushDir, PLAYER_RADIUS - dist);

      // 파고드는 속도 성분 제거 후 감쇠
      const vn = player.velocity.dot(pushDir);
      if (vn < 0) player.velocity.addScaledVector(pushDir, -vn);
      player.velocity.multiplyScalar(0.5);

      // 데미지 (무적 아닐 때만)
      hurtPlayer(DMG_OBSTACLE);
    }
  }
}

/* ===== 추격자 이동 / 충돌 ===== */
function updateChasers(dt) {
  for (const c of chasers) {
    const g = c.group;
    const toP = new THREE.Vector3(
      player.mesh.position.x - g.position.x,
      0,
      player.mesh.position.z - g.position.z
    );
    const dist = toP.length();
    if (dist > 0.01) {
      const step = Math.min(CHASER_SPEED * dt, dist);
      g.position.addScaledVector(toP.multiplyScalar(1 / dist), step);
      // 플레이어를 바라보도록 회전 (코 방향 +Z가 플레이어를 향함)
      g.rotation.y = Math.atan2(
        player.mesh.position.x - g.position.x,
        player.mesh.position.z - g.position.z
      );
    }
  }

  // 추격자끼리 겹침 분리
  separateChasers();

  // 장애물 밖으로 밀어내고 맵 경계 제한
  for (const c of chasers) {
    pushOutOfObstacles(c.group.position, 0.5);
    clampChaser(c.group.position);
  }
}

// 두 추격자가 완전히 겹치지 않도록 분리
function separateChasers() {
  if (chasers.length < 2) return;
  const a = chasers[0].group.position;
  const b = chasers[1].group.position;
  const d = new THREE.Vector3(a.x - b.x, 0, a.z - b.z);
  const dist = d.length();
  const minDist = 1.5;
  if (dist < minDist && dist > 1e-3) {
    const push = (minDist - dist) / 2;
    d.multiplyScalar(1 / dist);
    a.addScaledVector(d, push);
    b.addScaledVector(d, -push);
  }
}

// 임의 위치를 장애물 밖으로 밀어냄
function pushOutOfObstacles(pos, radius) {
  for (const obs of obstacles) {
    const closest = obs.box.clampPoint(pos, new THREE.Vector3());
    const diff = new THREE.Vector3(pos.x - closest.x, 0, pos.z - closest.z);
    const dist = diff.length();
    if (dist < radius) {
      const dir = dist > 1e-4 ? diff.multiplyScalar(1 / dist) : new THREE.Vector3(1, 0, 0);
      pos.addScaledVector(dir, radius - dist);
    }
  }
}

function clampChaser(pos) {
  const m = MAP_HALF - 1;
  pos.x = Math.max(-m, Math.min(m, pos.x));
  pos.z = Math.max(-m, Math.min(m, pos.z));
}

function handleChaserCollisions() {
  for (const c of chasers) {
    const g = c.group;
    const away = new THREE.Vector3(
      player.mesh.position.x - g.position.x,
      0,
      player.mesh.position.z - g.position.z
    );
    const dist = away.length();
    const hitDist = PLAYER_RADIUS + 0.55;

    if (dist < hitDist) {
      if (dist < 1e-3) away.set(1, 0, 0); else away.multiplyScalar(1 / dist);

      // 플레이어를 추격자 반대 방향으로 밀어냄
      player.mesh.position.addScaledVector(away, (hitDist - dist) + 0.6);
      clampToBounds(player.mesh.position);
      player.velocity.addScaledVector(away, 4);

      // 추격자도 잠깐 뒤로 밀림
      g.position.addScaledVector(away, -0.8);
      clampChaser(g.position);

      // 데미지 (무적 self-guard 로 프레임/중복 감소 방지)
      hurtPlayer(DMG_CHASER);
    }
  }
}

/* ===== 데미지 처리 (충돌 무적 포함) ===== */
function hurtPlayer(amount) {
  if (player.invulnTimer > 0) return; // 무적 중엔 데미지 없음
  player.durability -= amount;
  player.invulnTimer = INVULN_TIME;
  player.hitFlashTimer = 0.2; // 붉은 플래시
  shakeTimer = 0.3;           // 화면 흔들림

  if (player.durability <= 0) {
    player.durability = 0;
    updateHUD();
    gameOver();
  }
}

/* ===== 대시 잔상 파티클 ===== */
function handleDashParticles(dt, dashing) {
  dashSpawnTimer -= dt;
  const speed = Math.hypot(player.velocity.x, player.velocity.z);
  if (dashing && speed > 1 && dashSpawnTimer <= 0) {
    dashSpawnTimer = 0.035;
    spawnDashParticle();
  }
}

function spawnDashParticle() {
  const m = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xfff0a0, transparent: true, opacity: 0.55 })
  );
  m.position.copy(player.mesh.position);
  // 진행 방향 반대쪽(뒤)으로 약간 이동
  const back = new THREE.Vector3(player.velocity.x, 0, player.velocity.z);
  if (back.lengthSq() > 0) m.position.addScaledVector(back.normalize(), -0.5);
  m.position.y = PLAYER_RADIUS * 0.6;
  scene.add(m);
  dashParticles.push({ mesh: m, life: 0.4, maxLife: 0.4 });
}

// 매 프레임 파티클 수명/투명도 갱신 (게임 상태와 무관하게 사라지도록 animate에서 호출)
function updateDashParticles(dt) {
  for (let i = dashParticles.length - 1; i >= 0; i--) {
    const p = dashParticles[i];
    p.life -= dt;
    if (p.life <= 0) {
      scene.remove(p.mesh);
      p.mesh.geometry.dispose();
      p.mesh.material.dispose();
      dashParticles.splice(i, 1);
      continue;
    }
    const t = p.life / p.maxLife;
    p.mesh.material.opacity = 0.55 * t;
    p.mesh.scale.setScalar(0.5 + 0.5 * t);
  }
}

function clearDashParticles() {
  for (const p of dashParticles) {
    scene.remove(p.mesh);
    p.mesh.geometry.dispose();
    p.mesh.material.dispose();
  }
  dashParticles = [];
}

/* ===== 내구도 균열 / 색상 ===== */
function updateCracks() {
  const d = player.durability;
  const c = player.crackMeshes;
  c[0].visible = d <= 70;              // 70 이하: 선 1개
  c[1].visible = d <= 40;              // 40 이하: 선 2개 추가
  c[2].visible = d <= 40;
  c[3].visible = d <= 20;              // 20 이하: 선 더 추가
  c[4].visible = d <= 20;
  c[5].visible = d <= 20;
  // 20 이하: 크기 약간 축소
  player.mesh.scale.setScalar(d <= 20 ? 0.9 : 1.0);
}

function updatePlayerColor() {
  if (player.hitFlashTimer > 0) player.mesh.material.color.set(0xff3333);
  else player.mesh.material.color.copy(player.baseColor);
}

/* ===== 카메라 추종 ===== */
function updateCamera(dt) {
  const offset = new THREE.Vector3(0, 7, 10); // 뒤쪽 위
  const desired = player.mesh.position.clone().add(offset);
  const t = 1 - Math.exp(-CAMERA_LERP * dt);
  camera.position.lerp(desired, t);

  // 충돌 시 화면 흔들림
  if (shakeTimer > 0) {
    const s = shakeTimer * 0.6;
    camera.position.x += (Math.random() - 0.5) * s;
    camera.position.y += (Math.random() - 0.5) * s;
  }
  camera.lookAt(player.mesh.position);
}

/* ===== HUD / 중앙 메시지 / 디버그 ===== */
function updateHUD() {
  const d = Math.max(0, player.durability);
  document.getElementById('durability-value').textContent = Math.ceil(d);
  document.getElementById('time-value').textContent = survivalTime.toFixed(1);

  const fill = document.getElementById('durability-bar-fill');
  fill.style.width = d + '%';
  if (d > 40) fill.style.background = '#4caf50';
  else if (d > 20) fill.style.background = '#ffb300';
  else fill.style.background = '#e53935';
}

function updateCenterMessage(dt) {
  const el = document.getElementById('center-message');
  if (centerMessageTimer > 0) {
    centerMessageTimer -= dt;
    el.textContent = '도망쳐!';
    el.style.opacity = Math.min(1, centerMessageTimer / 0.5); // 끝날 때 페이드
  } else if (el.textContent) {
    el.textContent = '';
  }
}

function updateDebug() {
  const el = document.getElementById('debug-panel');
  if (!showDebug) { el.classList.add('hidden'); return; }
  el.classList.remove('hidden');
  const speed = player ? Math.hypot(player.velocity.x, player.velocity.z) : 0;
  const px = player ? player.mesh.position.x.toFixed(2) : '0';
  const pz = player ? player.mesh.position.z.toFixed(2) : '0';
  el.innerHTML =
    'FPS: ' + fps.toFixed(0) + '<br>' +
    'X: ' + px + '<br>' +
    'Z: ' + pz + '<br>' +
    '속도: ' + speed.toFixed(2) + '<br>' +
    '상태: ' + currentState;
}

/* =========================================================================
 *  메인 루프
 * ========================================================================= */
function animate() {
  requestAnimationFrame(animate);

  // deltaTime (상한 제한으로 비정상 이동 방지)
  let dt = clock.getDelta();
  if (dt > MAX_DELTA) dt = MAX_DELTA;

  // FPS 평활화
  if (dt > 0) fps = fps * 0.9 + (1 / dt) * 0.1;

  // PLAYING 상태에서만 게임 로직 실행 → 게임오버/시작 시 정지
  if (currentState === GAME_STATE.PLAYING) {
    updateGame(dt);
  }

  updateDashParticles(dt); // 남은 잔상은 상태와 무관하게 사라짐
  updateCamera(dt);
  updateDebug();

  renderer.render(scene, camera);
}

/* ===== 리사이즈 ===== */
function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

/* ===== 유틸 ===== */
function randRange(min, max) {
  return min + Math.random() * (max - min);
}

/* ===== 시작 ===== */
init();
