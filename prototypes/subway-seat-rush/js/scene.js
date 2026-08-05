"use strict";
/* scene.js — Three.js 씬 초기화, 지하철 환경(벽/좌석/손잡이) 및 캐릭터 모델 생성 */

  /* ============ Scene setup ============ */
  function initScene() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xb4b8bd);
    scene.fog = new THREE.Fog(0xb4b8bd, 24, 46);

    camera = new THREE.PerspectiveCamera(55, window.innerWidth/window.innerHeight, 0.1, 200);
    // 문쪽 벽(원경 벽)의 문/창문 프레임이 실제 높이로 완전히 렌더링되면서, 기존의 완만한 각도(약 39°)로는
    // 그 벽 근처 캐릭터가 프레임에 가려 안 보이는 문제가 생겼다 — 카메라를 더 위/가깝게 당겨 각도를
    // 가파르게(약 55°)해서 벽 높이가 시야를 가로막는 정도를 줄인다(updateCamera()도 동일하게 맞춤).
    camera.position.set(0, 11.5, 7.5);
    camera.lookAt(0, 0.8, 0);

    renderer = new THREE.WebGLRenderer({ antialias:true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.getElementById('canvasWrap').appendChild(renderer.domElement);

    const hemi = new THREE.HemisphereLight(0xdfe3e8, 0x8b8f95, 0.55);
    scene.add(hemi);
    const dir = new THREE.DirectionalLight(0xffffff, 0.45);
    dir.position.set(6, 16, 9);
    dir.castShadow = true;
    dir.shadow.mapSize.set(1024,1024);
    dir.shadow.camera.left=-20; dir.shadow.camera.right=20;
    dir.shadow.camera.top=14; dir.shadow.camera.bottom=-14;
    scene.add(dir);
    const amb = new THREE.AmbientLight(0xffffff, 0.22);
    scene.add(amb);

    clock = new THREE.Clock();

    // 마우스 포인터 → 월드 좌표 변환용
    raycaster = new THREE.Raycaster();
    pointerNDC = new THREE.Vector2(0,0);
    groundPlane = new THREE.Plane(new THREE.Vector3(0,1,0), 0);
  }

  /* ============ Subway environment (서울 1호선 배색) ============ */
  function matClay(hex){ return new THREE.MeshStandardMaterial({ color:hex, roughness:0.95, metalness:0.0 }); }
  function matMetal(hex){ return new THREE.MeshStandardMaterial({ color:hex, roughness:0.35, metalness:0.85 }); }

  // 실제 서울교통공사 1호선 공식 노선색(#0052A4, 진한 네이비) — 색상 자체는 사실 정보라 재현에
  // 라이선스 문제 없음(공식 로고/마크는 쓰지 않음). 이 색으로 문 인방·노선도·바닥 경고 스트립 등을 통일.
  const LINE_COLOR = 0x0052a4;
  const LINE_COLOR_HEX = '#0052a4';

  // 실제 서울 1호선 차량 3D 모델(사용자가 구매/최적화해 assets/models/에 배치, CC BY 라이선스).
  // getBounds()로 모델의 실제 문/벤치 좌표를 정밀 측정한 결과(모델 좌표계):
  //   문 4개(문틀 중심 x): -11.9, -7.17, -2.395(★기준), 2.40
  //   6인용 벤치 3개(x범위): [-11.01,-8.14] [-6.21,-3.34] [-1.44,1.43] (폭 2.87, 1인당 실측 약 0.478)
  // 캐릭터 몸통 X 지름이 약 0.92라서, scale.x=1.0(1인당 0.478)에서는 캐릭터 하나가 모델 좌석
  // 눈금 2칸을 덮어버렸다 — 사용자 제안대로 scale.x를 키워서(0.478*scale ≥ 캐릭터 지름 0.92가
  // 되도록 scale.x=2.0) 모델 좌석 1칸이 캐릭터 1명 폭과 실제로 맞도록 늘렸다.
  // offset.x는 여전히 같은 문(-2.395, ★)이 우리 게임 문(x=0)에 오도록 scale 변경에 맞춰 재계산.
  const SUBWAY_MODEL = {
    url: 'assets/models/subway-line1.glb?v=4',
    scale: { x: 2.0, y: 1.139, z: 1.451 },
    offset: { x: 4.79, y: 1.33, z: 0 }
  };

  // 원본 모델의 유리/창문 재질이 전부 alphaMode:OPAQUE(불투명)로 만들어져 있어서, 우리처럼
  // 차량 밖 위쪽에서 내려다보는 카메라로는 내부가 아예 안 보인다 — 런타임에 반투명으로 강제 보정.
  // 벽 패널(basic_white)·문(door_pattern)·문 테두리 고무(black_rubber)도 같은 이유로 반투명 처리해서
  // 좌석/NPC가 벽·문 너머로도 보이게 한다(사용자 요청). 유리보다는 덜 투명하게(0.4) 해서 "벽이 있다"는
  // 형태감은 유지한다 — gltf-transform mat-bounds 실측으로 door_green_light(작은 표시등)는 제외.
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

  // "basic016" 거대 프록시 박스를 숨기는 시도가 오히려 벽/문/바닥이 뿌옇게 뜨는 새 문제를
  // 일으켜서(아마 그 박스가 뒤쪽 배경을 가려주던 역할도 겸하고 있었던 듯) 이것도 되돌렸다.
  // 이제 이 함수는 검은 손잡이 그립(재질 3종 조합)만 숨긴다 — 우리 프리미티브 노란 손잡이와
  // 헷갈린다는 피드백으로 확인된, 부작용 없이 확실했던 항목만 남겼다.
  function isOverheadBarClutter(mesh) {
    const mats = mesh.material ? (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) : [];
    return mats.some(m => /^(deep_green|light_gray|black_plastic)$/i.test(m?.name || ''));
  }

  // 지붕/천장 트림 부품을 이름·형태로 아무리 찾아 지워도 계속 새로운 조각이 튀어나와서(같은 이름이
  // 여러 다른 부품에 재사용됨), 파일을 더 건드리는 대신 렌더링 단계에서 일정 높이 위를 통째로
  // 잘라내는 클리핑 평면으로 전환했다 — 모델 재질에만 적용되므로 우리 손잡이/문/캐릭터는 영향 없음.
  // getBounds()로 실측한 월드 Y 최댓값: 창문≈2.52, 문≈2.12, 금속 기둥/봉≈2.76, 전체 모델≈2.90.
  // 기존 1.9는 이 전부보다 훨씬 낮아서 창문·문·기둥이 전부 중간에서 잘려 보였다 — 기둥/봉 실제
  // 끝(2.76)보다 살짝 위로 올려서 창문·문·기둥은 완전한 형태로 두고, 그 위 지붕 잔여물만 잘라낸다.
  const MODEL_CLIP_Y = 2.8;
  const modelClipPlane = new THREE.Plane(new THREE.Vector3(0,-1,0), MODEL_CLIP_Y);

  // 실제 모델이 로드되면 가려질 프리미티브 "껍데기"(벽/바닥/장식/좌석/벤치) 메시 목록.
  // 문/손잡이처럼 위치가 이동/애니메이션되는 오브젝트만 여기 넣지 않는다 — 좌석은 이제
  // 모델의 실제(넓어진) 좌석을 그대로 보여주고, 우리 프리미티브 좌석 박스는 로드 성공 시 가려서
  // "베이지색 상자가 덮어씌운 것처럼" 보이던 문제를 없앤다(로드 실패 시엔 폴백으로 계속 보임).
  function loadSubwayModel(shellMeshes, endCapMeshes) {
    const gm = window.GameModules;
    if (!gm || !gm.loadGLTF) return;
    gm.loadGLTF(SUBWAY_MODEL.url).then(gltf => {
      const model = gltf.scene;
      model.scale.set(SUBWAY_MODEL.scale.x, SUBWAY_MODEL.scale.y, SUBWAY_MODEL.scale.z);
      model.position.set(SUBWAY_MODEL.offset.x, SUBWAY_MODEL.offset.y, SUBWAY_MODEL.offset.z);
      model.updateMatrixWorld(true); // isOverheadBarClutter()의 기하학적 안전망이 정확한 월드 좌표를 읽도록
      renderer.localClippingEnabled = true;
      model.traverse(o => {
        if (!o.isMesh) return;
        if (isOverheadBarClutter(o)) { o.visible = false; return; }
        o.castShadow = true; o.receiveShadow = true;
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach(m => { applyGlassTransparency(m); if (m) m.clippingPlanes = [modelClipPlane]; });
      });
      scene.add(model);
      shellMeshes.forEach(m => { if (m) m.visible = false; });

      // 모델의 실제(스케일 적용 후) X 끝단을 계산해서 끝벽을 거기에 딱 맞춰 재배치 —
      // 트리밍으로 잘려나간 모델 끝부분이 뻥 뚫려 보이던 문제를 해결.
      const box = new THREE.Box3().setFromObject(model);
      if (endCapMeshes && endCapMeshes.length){
        const capThickness = 0.25;
        const targets = [ box.min.x + capThickness/2, box.max.x - capThickness/2 ];
        endCapMeshes.forEach((cap, i) => {
          cap.wall.position.x = targets[i];
          cap.stripe.position.x = targets[i];
        });
      }

      // 클리핑으로 지붕을 통째로 지워서 차량이 "뚜껑 없는 상자"처럼 보이던 문제 보완 —
      // 완전 불투명 지붕(=다시 시야를 막음) 대신 아주 옅은 반투명 캡만 얹어서 "막힌 공간" 느낌만 살림.
      const ceiling = new THREE.Mesh(
        new THREE.PlaneGeometry(box.max.x - box.min.x, 5),
        new THREE.MeshStandardMaterial({ color:0xe8e4da, transparent:true, opacity:0.12, depthWrite:false, side:THREE.DoubleSide })
      );
      ceiling.rotation.x = -Math.PI/2;
      ceiling.position.set((box.min.x+box.max.x)/2, MODEL_CLIP_Y+0.02, 0);
      scene.add(ceiling);
    }).catch(err => {
      console.warn('[scene] 지하철 차량 모델 로드 실패 — 프리미티브 차량으로 유지합니다.', err);
    });
  }

  // 무료 텍스처(three.js 공식 예제 저장소, r128 — RobotExpressive.glb와 동일한 출처) — 별도 로더 스크립트
  // 없이 코어 THREE.TextureLoader로 바로 사용 가능. 지하철 바닥/벽 패널에 질감을 입혀 밋밋한 단색을 보강한다.
  const TEX_BASE = 'https://raw.githubusercontent.com/mrdoob/three.js/r128/examples/textures/';
  const texLoader = new THREE.TextureLoader();
  function tiledTexture(url, repeatX, repeatY){
    const tex = texLoader.load(url);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeatX, repeatY);
    return tex;
  }

  // 캔버스에 직접 그린 그래픽을 벽걸이 패널(PlaneGeometry)에 입힌다 — 실사 이미지 라이선스 이슈를
  // 피하기 위해 노선도/광고는 makeTag()와 같은 방식으로 전부 자체 제작.
  function makeCanvasPanel(pixelW, pixelH, drawFn, planeW, planeH){
    const cv = document.createElement('canvas'); cv.width=pixelW; cv.height=pixelH;
    drawFn(cv.getContext('2d'), pixelW, pixelH);
    const tex = new THREE.CanvasTexture(cv);
    return new THREE.Mesh(new THREE.PlaneGeometry(planeW, planeH),
      new THREE.MeshStandardMaterial({ map:tex, roughness:0.9, metalness:0 }));
  }

  // 실제 모델 로드 시 가려질 프리미티브 껍데기 메시들(buildEnvironment/buildBenchesAndSeats/buildHandles가 공유)
  let envShellMeshes = [];

  function buildEnvironment() {
    envShellMeshes = [];
    const carLen = CAR_LENGTH, carWidth = CAR_WIDTH;

    // 바닥 (차량 + 승강장) — 실제 지하철 바닥에 가깝게 미세한 논슬립 질감만(과한 체커 패턴 억제)
    const floorMat = new THREE.MeshStandardMaterial({
      color:0xdedad0, roughness:0.9, metalness:0.03,
      map: tiledTexture(TEX_BASE+'floors/FloorsCheckerboard_S_Diffuse.jpg', 22, 5),
      normalMap: tiledTexture(TEX_BASE+'floors/FloorsCheckerboard_S_Normal.jpg', 22, 5)
    });
    floorMat.normalScale.set(0.35,0.35); // 체커 패턴을 과하지 않게, 미세한 논슬립 질감 정도로만
    const floor = new THREE.Mesh(new THREE.BoxGeometry(carLen+1, 0.2, carWidth), floorMat);
    floor.position.set(0,-0.1,0); floor.receiveShadow = true; scene.add(floor);
    envShellMeshes.push(floor);

    // 문 앞 점자/경고 표시 노란 띠 — 실제 지하철 승강장·출입문 앞 특유의 요소
    const doorWarnStrip = new THREE.Mesh(new THREE.BoxGeometry(CAR.doorX*2+0.3, 0.02, 0.16), matClay(0xffd400));
    doorWarnStrip.position.set(0, 0.005, CAR.farWallZ+0.28); scene.add(doorWarnStrip);
    envShellMeshes.push(doorWarnStrip);

    const platform = new THREE.Mesh(new THREE.BoxGeometry(carLen+1, 0.2, 3.8), matClay(0xd2d5da));
    platform.position.set(0,-0.1, CAR.farWallZ - 2.1); platform.receiveShadow = true; scene.add(platform);

    // 원경 벽 (far wall) — 문 구멍 자리는 두 조각으로 분리. 실제 차량 내장재에 가까운 아이보리 톤 패널.
    const wallMat = new THREE.MeshStandardMaterial({
      color:0xf1ead9, roughness:0.88, metalness:0.05,
      map: tiledTexture(TEX_BASE+'carbon/Carbon.png', 3, 1.4),
      normalMap: tiledTexture(TEX_BASE+'carbon/Carbon_Normal.png', 3, 1.4)
    });
    const lineStripeMat = matClay(LINE_COLOR); // 1호선 네이비 액센트 띠
    const wallH = 2.9;
    function wallSeg(x, w){
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, wallH, 0.25), wallMat);
      m.position.set(x, wallH/2, CAR.farWallZ); m.receiveShadow=true; m.castShadow=true; scene.add(m);
      envShellMeshes.push(m);
      // 창 높이 대의 노선색 액센트 띠
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(w, 0.1, 0.26), lineStripeMat);
      stripe.position.set(x, 1.62, CAR.farWallZ); scene.add(stripe);
      envShellMeshes.push(stripe);
      return m;
    }
    const halfDoor = CAR.doorX;             // 문폭 절반
    const segW = (carLen/2) - halfDoor;
    const wallSegL = wallSeg(-(halfDoor + segW/2), segW);
    const wallSegR = wallSeg( (halfDoor + segW/2), segW);
    // 문 상단 인방 — 노선색으로 강조
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(halfDoor*2, 0.5, 0.25), matClay(LINE_COLOR));
    lintel.position.set(0, wallH-0.25, CAR.farWallZ); scene.add(lintel);
    envShellMeshes.push(lintel);

    // 양끝 벽 — 모델이 로드되면 이 위치가 모델의 실제(스케일 적용 후) 끝 지점으로 재배치된다.
    // 항상 보이는 상태 유지(envShellMeshes에 넣지 않음) — 모델 로드 실패/전이든 뻥 뚫린 끝이 없게.
    const endWallX = [ -carLen/2-0.2, carLen/2+0.2 ];
    const endCapMeshes = endWallX.map(x=>{
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.25, wallH, carWidth), wallMat);
      m.position.set(x, wallH/2, 0); m.receiveShadow=true; scene.add(m);
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.1, carWidth), lineStripeMat);
      stripe.position.set(x, 1.62, 0); scene.add(stripe);
      return { wall:m, stripe };
    });
    // 근경(near)은 카메라를 위해 낮은 난간만
    const rail = new THREE.Mesh(new THREE.BoxGeometry(carLen, 0.4, 0.2), matClay(0xdadada));
    rail.position.set(0, 0.2, CAR.nearWallZ); scene.add(rail);
    envShellMeshes.push(rail);

    // 문 근처 수직 스탠션 폴 2개 — 실제 지하철처럼 스테인리스 은색
    [-halfDoor-0.18, halfDoor+0.18].forEach(x=>{
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.045,0.045,2.35,10), matMetal(0xd7dadd));
      pole.position.set(x, 1.18, CAR.aisleZMax-0.08); pole.castShadow=true; scene.add(pole);
      envShellMeshes.push(pole);
    });

    // 노선도 패널(문 위 인방 앞면) — 실제 지하철 문 위 LED 노선 안내기 느낌으로(어두운 배경 + 노선색)
    const routeMap = makeCanvasPanel(512,96, (ctx,w,h)=>{
      ctx.fillStyle='#0d1b2e'; ctx.fillRect(0,0,w,h);
      const y=h*0.42, xs=[0.1,0.3,0.5,0.7,0.9].map(f=>w*f);
      ctx.strokeStyle=LINE_COLOR_HEX; ctx.lineWidth=6;
      ctx.beginPath(); ctx.moveTo(xs[0],y); ctx.lineTo(xs[4],y); ctx.stroke();
      const labels=['출발','1역','2역','3역','목적지'];
      xs.forEach((x,i)=>{
        ctx.fillStyle = i===4 ? '#ff5e5e' : '#ffffff';
        ctx.beginPath(); ctx.arc(x,y,9,0,Math.PI*2); ctx.fill();
        ctx.fillStyle='#eaf0f8'; ctx.font='bold 18px sans-serif'; ctx.textAlign='center';
        ctx.fillText(labels[i], x, y+28);
      });
    }, 2.6, 0.5);
    routeMap.position.set(0, wallH-0.25, CAR.farWallZ+0.14);
    scene.add(routeMap);
    envShellMeshes.push(routeMap);

    // 광고 포스터 2개(양쪽 벽 세그먼트) — 실사 이미지 대신 직접 그린 그래픽
    const ADS = [
      { bg:'#ff922b', title:'지옥철 생존 보험', sub:'가입만 해도 마음이 편안' },
      { bg:'#5c7cfa', title:'푹신 좌석 쿠션', sub:'서서 가는 그대에게' }
    ];
    [wallSegL, wallSegR].forEach((seg,i)=>{
      const ad = ADS[i];
      const panel = makeCanvasPanel(384,256, (ctx,w,h)=>{
        ctx.fillStyle=ad.bg; ctx.fillRect(0,0,w,h);
        ctx.fillStyle='#fff'; ctx.textAlign='center';
        ctx.font='bold 34px sans-serif'; ctx.fillText(ad.title, w/2, h*0.46);
        ctx.font='20px sans-serif'; ctx.fillText(ad.sub, w/2, h*0.68);
      }, 1.6, 1.05);
      panel.position.set(seg.position.x, wallH*0.52, CAR.farWallZ+0.14);
      scene.add(panel);
      envShellMeshes.push(panel);
    });

    // 천장 손잡이 바 — 스테인리스 은색
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.05,0.05,carLen,10), matMetal(0xd7dadd));
    bar.rotation.z = Math.PI/2; bar.position.set(0, 2.55, 0); scene.add(bar);
    envShellMeshes.push(bar);

    // 문 (슬라이딩 2짝)
    const doorMat = new THREE.MeshStandardMaterial({ color:0xbfd4e0, roughness:0.6, metalness:0.1,
                     transparent:true, opacity:0.85 });
    doorLeft  = new THREE.Mesh(new THREE.BoxGeometry(halfDoor, wallH-0.5, 0.12), doorMat);
    doorRight = new THREE.Mesh(new THREE.BoxGeometry(halfDoor, wallH-0.5, 0.12), doorMat.clone());
    doorLeft.position.set(-halfDoor/2, (wallH-0.5)/2, CAR.farWallZ);
    doorRight.position.set( halfDoor/2, (wallH-0.5)/2, CAR.farWallZ);
    scene.add(doorLeft); scene.add(doorRight);

    // 출구 표시(바닥 하이라이트) — 기본 숨김
    exitMarker = new THREE.Mesh(new THREE.CircleGeometry(1.3, 24),
        new THREE.MeshStandardMaterial({ color:0x2ecc71, roughness:1, transparent:true, opacity:0.0 }));
    exitMarker.rotation.x = -Math.PI/2;
    exitMarker.position.set(0, 0.02, CAR.farWallZ - 1.6);
    scene.add(exitMarker);

    buildBenchesAndSeats();
    buildHandles();

    // 실제 1호선 차량 모델 로드(비동기) — 성공 시 벽/바닥/벤치/좌석 등 프리미티브 껍데기를 가린다.
    // 손잡이/문/끝벽은 절대 가리지 않음(항상 우리 프리미티브가 담당 — 애니메이션·경계 정합 때문).
    loadSubwayModel(envShellMeshes, endCapMeshes);
  }

  /* ============ Seats and handles ============
     좌석 15석 구성
       - 원경(문쪽) 벤치 8석: 문 앞 공간(±1.9)을 비우고 좌우 4석씩
       - 근경(반대쪽) 벤치 7석: 문이 없으므로 균등 배치
     BALANCE.seatCount(15)와 seatDefs 길이가 반드시 일치해야 한다.
  ========================================================== */
  function buildBenchesAndSeats() {
    const benchLen = CAR_LENGTH - 1.4;
    const benchMat = matClay(0xe4dcc8);
    [ -CAR.benchZ, CAR.benchZ ].forEach(z=>{
      const bench = new THREE.Mesh(new THREE.BoxGeometry(benchLen, 0.5, 1.05), benchMat);
      bench.position.set(0, 0.25, z); bench.receiveShadow=true; scene.add(bench);
      const back = new THREE.Mesh(new THREE.BoxGeometry(benchLen, 0.75, 0.2), benchMat);
      back.position.set(0, 0.63, z + (z<0? -0.42 : 0.42)); scene.add(back);
      envShellMeshes.push(bench, back);
    });

    const farRow  = [-7.9, -6.2, -4.5, -2.8, 2.8, 4.5, 6.2, 7.9];   // 문쪽 벤치 8석
    const nearRow = [-7.2, -4.8, -2.4, 0.0, 2.4, 4.8, 7.2];          // 반대쪽 벤치 7석
    const seatDefs = [];
    farRow.forEach(x=> seatDefs.push({ x, z:-CAR.seatZ, face: 1 }));
    nearRow.forEach(x=> seatDefs.push({ x, z: CAR.seatZ, face:-1 }));

    seatPickables.length = 0;

    seatDefs.forEach((d,i)=>{
      const isPriority = i===0 || i===farRow.length;
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(1.5, 0.14, 0.85),
        matClay(isPriority ? 0xffd400 : 0xd98c4a)
      );
      mesh.position.set(d.x, 0.55, d.z); mesh.receiveShadow=true; scene.add(mesh);
      envShellMeshes.push(mesh);

      // 빈자리 강조용 평면(좌석 위) — 색/투명도를 매 프레임 갱신
      const highlight = new THREE.Mesh(
        new THREE.PlaneGeometry(1.58, 0.94),
        new THREE.MeshBasicMaterial({ color:0xfff2c4, transparent:true, opacity:0, depthWrite:false })
      );
      highlight.rotation.x = -Math.PI/2;
      highlight.position.set(d.x, 0.64, d.z);
      scene.add(highlight);

      // 클릭 판정용 투명 박스(좌석보다 조금 크게 잡아 클릭을 쉽게 함)
      const pick = new THREE.Mesh(
        new THREE.BoxGeometry(1.72, 1.25, 1.5),
        new THREE.MeshBasicMaterial({ transparent:true, opacity:0, depthWrite:false })
      );
      pick.position.set(d.x, 0.62, d.z + d.face*0.3);
      scene.add(pick);

      const point = { x: d.x, z: d.z + d.face*CAR.seatInteractOffset }; // 통로쪽 상호작용 위치
      const seat = {
        mesh, highlight, pick, x:d.x, z:d.z, face:d.face, occupied:false, occupant:null,
        interactionPoint:point,
        captureProgress:0,      // 플레이어 점유 게이지 (0~100, 경쟁 중에만 사용)
        npcProgress:0,          // 현재 경쟁 중인 NPC의 점유 게이지 (0~100)
        npcClaimantRef:null,    // npcProgress를 채우고 있는 NPC 참조
        reservedFor:null,       // 'player' — 빌런 퇴치 보상으로 예약된 좌석
        reservedTimer:0
      };
      pick.userData.seatRef = seat;
      mesh.userData.seatRef = seat;
      seats.push(seat);
      seatPickables.push(pick);
    });
  }

  function buildHandles() {
    // 실제 지하철 손잡이는 은색 스테인리스 + 노란/주황 고무 그립 — 링만 살짝 포인트 컬러
    [ -7.5, -4.5, -1.5, 1.5, 4.5, 7.5 ].forEach(x=>{
      const mesh = new THREE.Mesh(new THREE.TorusGeometry(0.18,0.05,8,16), matClay(0xffbf3f));
      mesh.position.set(x, 2.1, 0); mesh.rotation.x = Math.PI/2 * 0; scene.add(mesh);
      // 손잡이 끈(스테인리스)
      const strap = new THREE.Mesh(new THREE.CylinderGeometry(0.02,0.02,0.4,6), matMetal(0xd7dadd));
      strap.position.set(x, 2.35, 0); scene.add(strap);
      // 끈 꼭대기 마감 브라켓 — 천장이 옅게만 보여서, 끈이 허공에 매달린 것처럼 보이지 않게
      // "여기서 천장에 고정된다"는 시각적 종결점을 짧은 원판으로 만들어준다.
      const mount = new THREE.Mesh(new THREE.CylinderGeometry(0.06,0.06,0.03,10), matMetal(0xc7cbd0));
      mount.position.set(x, 2.565, 0); scene.add(mount);
      handles.push({ mesh, x, z:0, occupied:false, occupant:null });
    });
  }

  /* ============ 좌석 하이라이트 ============ */
  function isSeatTargetedByNPC(seat){
    for (let i=0;i<npcs.length;i++){
      const n = npcs[i];
      if (!n.seated && !n.disembarking && n.targetSeat===seat) return true;
    }
    return seat.npcClaimantRef ? !seat.npcClaimantRef.seated : false;
  }

  function seatHighlightStyle(seat){
    if (seat.occupied) return null;
    if (G.seatCompetitionActive && G.contestedSeat===seat)
      return { color:0xff5e57, opacity:0.75, emissive:0x6b1f1b };
    if (G.targetSeat===seat)
      return { color:0x4aa3ff, opacity:0.68, emissive:0x11395e };
    if (seat.reservedFor==='player')
      return { color:0x2ecc71, opacity:0.66, emissive:0x13512b };
    if (isSeatTargetedByNPC(seat))
      return { color:0xff9f43, opacity:0.52, emissive:0x53300e };
    if (G.hoveredSeat===seat)
      return { color:0xffe08a, opacity:0.62, emissive:0x4d3d16 };
    return { color:0xfff2c4, opacity:0.30, emissive:0x272009 };
  }

  function updateSeatHighlights(){
    const pulse = 0.86 + Math.sin(performance.now()*0.005)*0.14;
    seats.forEach(seat=>{
      const style = seatHighlightStyle(seat);
      if (!style){
        seat.highlight.material.opacity = 0;
        seat.mesh.material.emissive.setHex(0x000000);
        return;
      }
      seat.highlight.material.color.setHex(style.color);
      seat.highlight.material.opacity = style.opacity*pulse;
      seat.mesh.material.emissive.setHex(style.emissive);
    });
  }

  /* ============ Character factory (Fall Guys풍 젤리빈 스타일) ============
     실제 Fall Guys 게임 리소스는 저작권상 쓸 수 없어 "영감을 받은" 프리미티브 형태로 직접 제작.
     함수 시그니처와 반환 그룹의 userData(head/armR/armL/baseArmRz) 계약은 기존과 동일하게 유지 —
     player.js(가방 스윙 pivot, 손잡이 팔 회전)와 ai.js(백팩 빌런 telegraph/swing pivot)가
     이 계약에 의존하므로, 형태만 바꾸고 애니메이션 배선은 전혀 건드리지 않는다. */
  function makeStubLimb(mat, side){
    // 팔 하나: [어깨 부착점(Group, 로컬 원점)] > 짧은 팔뚝 실린더 + 끝의 둥근 손 스피어.
    // Group이라 player.js의 shoulderPivot 재부모화(armMesh.position/.rotation 조작)가 그대로 동작.
    const arm = new THREE.Group();
    const forearm = new THREE.Mesh(new THREE.CylinderGeometry(0.1,0.11,0.3,10), mat);
    forearm.position.y = -0.15; forearm.castShadow = true; arm.add(forearm);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.115,10,8), mat);
    hand.position.y = -0.32; hand.castShadow = true; arm.add(hand);
    arm.position.set(0.42*side, 0.56, 0);
    return arm;
  }
  function makeCharacter(bodyColor, headColor) {
    const g = new THREE.Group();
    const bodyMat = matClay(bodyColor);
    const headMat = matClay(headColor !== undefined ? headColor : bodyColor);

    // 몸통: 허리 구분 없이 스피어 하나를 눌러 콩(빈) 모양 실루엣으로
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.46,20,16), bodyMat);
    body.scale.set(1,0.85,0.95);
    body.position.y = 0.44; body.castShadow=true; g.add(body);

    // 머리: 목 없이 몸 위에 바로 얹고, 몸 대비 비율을 크게(Fall Guys 특유의 비율)
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.4,20,16), headMat);
    head.position.y = 1.0; head.castShadow=true; g.add(head);

    // 눈: 작은 점 두 개(입 없음 — 단순한 표정)
    const eyeMat = new THREE.MeshStandardMaterial({ color:0x2b2b2b, roughness:0.4 });
    [-0.14,0.14].forEach(ex=>{
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.045,8,8), eyeMat);
      eye.position.set(ex,0.98,0.37); g.add(eye);
    });

    // 다리: 짧고 뭉툭하게(순수 장식 — 다른 코드가 참조하지 않음)
    [-0.19,0.19].forEach(x=>{
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.14,0.13,0.16,10), bodyMat);
      leg.position.set(x,0.09,0); g.add(leg);
    });

    // 팔
    const armL = makeStubLimb(bodyMat, -1);
    const armR = makeStubLimb(bodyMat, 1);
    g.add(armL); g.add(armR);

    g.userData.head = head; g.userData.armR = armR; g.userData.armL = armL;
    g.userData.baseArmRz = -0.25;
    return g;
  }

  // 모든 인간형 캐릭터(플레이어/NPC/빌런)는 절차적 젤리빈 캐릭터를 사용한다.
  // GLTF 파이프라인(character-assets.js 등)은 삭제하지 않고 남겨뒀지만 이 경로에서는 더 이상
  // 쓰지 않는다 — player.js/ai.js의 userData.characterModel 분기는 항상 falsy로 평가되어
  // 자동으로 프리미티브 경로를 타므로 별도 수정 없이도 안전하다.
  function createCharacterGroup(bodyColor, headColor) {
    return makeCharacter(bodyColor, headColor);
  }

  // scene.remove(mesh)와 함께 항상 호출해야 하는 정리 훅. GLTF 인스턴스는 각자 독립적인
  // AnimationMixer를 갖고 있어서(CharacterAssets.updateAll이 매 프레임 순회) 그냥 씬에서만
  // 제거하면 mixer가 계속 살아남아 누적된다(재시작을 반복할수록 leak).
  // 프리미티브 폴백 캐릭터는 userData.characterModel이 없으므로 완전히 no-op.
  function destroyCharacterModel(mesh) {
    if (!mesh || !mesh.userData) return;
    if (mesh.userData.characterModel) { mesh.userData.characterModel.destroy(); return; }
    // 백팩 빌런: villainRoot(mesh) > bodyPivot > createCharacterGroup() 결과 구조라 한 단계 더 들어가야 함
    const bodyPivot = mesh.userData.bodyPivot;
    const nested = bodyPivot && bodyPivot.children[0] && bodyPivot.children[0].userData.characterModel;
    if (nested) nested.destroy();
  }
  window.destroyCharacterModel = destroyCharacterModel; // station-system.js(ES module)에서도 접근

  // 머리 위 아이콘(스프라이트 대신 간단한 텍스트 캔버스)
  function makeTag(text, color) {
    const cv = document.createElement('canvas'); cv.width=128; cv.height=64;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = color || '#e74c3c'; ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(4,4,120,40,10) : ctx.rect(4,4,120,40); ctx.fill();
    ctx.fillStyle='#fff'; ctx.font='bold 26px sans-serif'; ctx.textAlign='center';
    ctx.fillText(text, 64, 33);
    const tex = new THREE.CanvasTexture(cv);
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map:tex, transparent:true }));
    spr.scale.set(0.9,0.45,1); spr.position.y = 1.9;
    return spr;
  }

  /* ============ Villain 계층 구조 (백팩 빌런 전용) ============
     villainRoot            — 위치 이동 + 이동 방향 회전
     ├─ bodyPivot            — 공격 예고(TELEGRAPH) 및 피격 흔들림
     │  └─ (makeCharacter)   — body/head/arms/legs
     └─ backpackPivot        — 백팩 휘두르기(SWING) 모션
        └─ backpackMesh
  ============================================================ */
  function makeBackpackVillain() {
    const villainRoot = new THREE.Group();

    const bodyPivot = new THREE.Group();
    const bodyChar = createCharacterGroup(0x8e44ad, 0xd0a3e0);
    bodyPivot.add(bodyChar);
    villainRoot.add(bodyPivot);

    const backpackPivot = new THREE.Group();
    backpackPivot.position.set(0, 0.75, -0.15); // 등 쪽 회전축
    const backpackMesh = new THREE.Mesh(new THREE.BoxGeometry(0.7,0.8,0.5), matClay(0x5b2c6f));
    backpackMesh.position.set(0, 0, -0.25);     // 회전축 기준 살짝 뒤로 오프셋(휘두름 반경 확보)
    backpackPivot.add(backpackMesh);
    villainRoot.add(backpackPivot);

    villainRoot.add(makeTag('백팩','#8e44ad'));

    villainRoot.userData.bodyPivot = bodyPivot;
    villainRoot.userData.backpackPivot = backpackPivot;
    villainRoot.userData.charRef = bodyChar;
    return villainRoot;
  }

  /* ============ Player ============
     player
     └─ shoulderPivot   — 가방 공격 스윙(윈드업/스트라이크/리커버리) 전용 회전
        └─ armMesh (기존 armR 재사용)
           └─ handPivot — 가방을 쥔 손 (약간의 휩 랙 모션)
              └─ bagMesh
  ==================================================================== */
  function buildPlayer() {
    player = createCharacterGroup(0x4a90d9, 0xf1c9a5);
    const characterModel = player.userData.characterModel; // GLTF 경로에서만 존재

    if (characterModel) {
      // GLTF 경로: 가방 스윙은 pivot 회전 대신 애니메이션 클립으로 표현한다(player.js updateBagAttack).
      // shoulderPivot/handPivot은 main.js의 리셋 코드가 그대로 써도 안전하도록 빈 스텁으로 유지.
      player.userData.shoulderPivot = new THREE.Group();
      player.userData.handPivot = new THREE.Group();

      const bag = new THREE.Mesh(new THREE.BoxGeometry(0.4,0.5,0.22), matClay(0x8e5a3c));
      bag.position.set(0.02,-0.05,0.06); // 손 본 기준 상대 위치(플레이스홀더 근사치)
      characterModel.getAttachPoint('rightHand').add(bag);
      player.userData.bag = bag;
    } else {
      // 프리미티브 폴백: 기존 오른팔(armR)을 어깨 피벗 하위로 재구성
      const armMesh = player.userData.armR;
      const shoulderPivot = new THREE.Group();
      shoulderPivot.position.copy(armMesh.position); // (0.42, 0.6, 0)
      player.remove(armMesh);
      armMesh.position.set(0,0,0);
      armMesh.rotation.z = player.userData.baseArmRz; // 기존 처짐 각도(-0.3) 유지
      shoulderPivot.add(armMesh);
      player.add(shoulderPivot);

      const handPivot = new THREE.Group();
      handPivot.position.set(0, -0.2, 0.05); // 팔 끝(손) 위치
      armMesh.add(handPivot);

      const bag = new THREE.Mesh(new THREE.BoxGeometry(0.4,0.5,0.22), matClay(0x8e5a3c));
      bag.position.set(0.15, -0.08, 0.12); // 손 피벗 기준 상대 위치
      handPivot.add(bag);

      player.userData.shoulderPivot = shoulderPivot;
      player.userData.handPivot = handPivot;
      player.userData.armR = armMesh;   // 기존 참조 유지 (setPosture 등에서 계속 사용)
      player.userData.bag = bag;        // 기존 참조 유지
    }

    const tag = makeTag('나', '#2d78c9'); player.add(tag);
    scene.add(player);
  }
