"use strict";
/* scene.js — Three.js 씬 초기화, 지하철 환경(벽/좌석/손잡이) 및 캐릭터 모델 생성 */

  /* ============ Scene setup ============ */
  function initScene() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xb4b8bd);
    scene.fog = new THREE.Fog(0xb4b8bd, 24, 46);

    // 차량이 넓어졌으므로 시야각과 카메라 높이를 함께 키운다.
    camera = new THREE.PerspectiveCamera(55, window.innerWidth/window.innerHeight, 0.1, 200);
    camera.position.set(0, 10.8, 11.8);
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

  /* ============ Subway environment ============ */
  function matClay(hex){ return new THREE.MeshStandardMaterial({ color:hex, roughness:0.95, metalness:0.0 }); }

  function buildEnvironment() {
    const carLen = CAR_LENGTH, carWidth = CAR_WIDTH;

    // 바닥 (차량 + 승강장)
    const floor = new THREE.Mesh(new THREE.BoxGeometry(carLen+1, 0.2, carWidth), matClay(0xececec));
    floor.position.set(0,-0.1,0); floor.receiveShadow = true; scene.add(floor);

    const platform = new THREE.Mesh(new THREE.BoxGeometry(carLen+1, 0.2, 3.8), matClay(0xd2d5da));
    platform.position.set(0,-0.1, CAR.farWallZ - 2.1); platform.receiveShadow = true; scene.add(platform);

    // 원경 벽 (far wall) — 문 구멍 자리는 두 조각으로 분리
    const wallMat = matClay(0xf3f3f1);
    const wallH = 2.9;
    function wallSeg(x, w){
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, wallH, 0.25), wallMat);
      m.position.set(x, wallH/2, CAR.farWallZ); m.receiveShadow=true; m.castShadow=true; scene.add(m);
    }
    const halfDoor = CAR.doorX;             // 문폭 절반
    const segW = (carLen/2) - halfDoor;
    wallSeg(-(halfDoor + segW/2), segW);
    wallSeg( (halfDoor + segW/2), segW);
    // 문 상단 인방
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(halfDoor*2, 0.5, 0.25), wallMat);
    lintel.position.set(0, wallH-0.25, CAR.farWallZ); scene.add(lintel);

    // 양끝 벽
    [ -carLen/2-0.2, carLen/2+0.2 ].forEach(x=>{
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.25, wallH, carWidth), wallMat);
      m.position.set(x, wallH/2, 0); m.receiveShadow=true; scene.add(m);
    });
    // 근경(near)은 카메라를 위해 낮은 난간만
    const rail = new THREE.Mesh(new THREE.BoxGeometry(carLen, 0.4, 0.2), matClay(0xdadada));
    rail.position.set(0, 0.2, CAR.nearWallZ); scene.add(rail);

    // 천장 손잡이 바
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.05,0.05,carLen,10), matClay(0xbfc3c8));
    bar.rotation.z = Math.PI/2; bar.position.set(0, 2.55, 0); scene.add(bar);

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
  }

  /* ============ Seats and handles ============
     좌석 15석 구성
       - 원경(문쪽) 벤치 8석: 문 앞 공간(±1.9)을 비우고 좌우 4석씩
       - 근경(반대쪽) 벤치 7석: 문이 없으므로 균등 배치
     BALANCE.seatCount(15)와 seatDefs 길이가 반드시 일치해야 한다.
  ========================================================== */
  function buildBenchesAndSeats() {
    const benchLen = CAR_LENGTH - 1.4;
    const benchMat = matClay(0xcfd3d8);
    [ -CAR.benchZ, CAR.benchZ ].forEach(z=>{
      const bench = new THREE.Mesh(new THREE.BoxGeometry(benchLen, 0.5, 1.05), benchMat);
      bench.position.set(0, 0.25, z); bench.receiveShadow=true; scene.add(bench);
      const back = new THREE.Mesh(new THREE.BoxGeometry(benchLen, 0.75, 0.2), benchMat);
      back.position.set(0, 0.63, z + (z<0? -0.42 : 0.42)); scene.add(back);
    });

    const farRow  = [-7.9, -6.2, -4.5, -2.8, 2.8, 4.5, 6.2, 7.9];   // 문쪽 벤치 8석
    const nearRow = [-7.2, -4.8, -2.4, 0.0, 2.4, 4.8, 7.2];          // 반대쪽 벤치 7석
    const seatDefs = [];
    farRow.forEach(x=> seatDefs.push({ x, z:-CAR.seatZ, face: 1 }));
    nearRow.forEach(x=> seatDefs.push({ x, z: CAR.seatZ, face:-1 }));

    const seatMat = matClay(0x9aa0a8);
    seatPickables.length = 0;

    seatDefs.forEach(d=>{
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.14, 0.85), seatMat.clone());
      mesh.position.set(d.x, 0.55, d.z); mesh.receiveShadow=true; scene.add(mesh);

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
    const ringMat = matClay(0xe0a94b);
    [ -7.5, -4.5, -1.5, 1.5, 4.5, 7.5 ].forEach(x=>{
      const mesh = new THREE.Mesh(new THREE.TorusGeometry(0.18,0.05,8,16), ringMat.clone());
      mesh.position.set(x, 2.1, 0); scene.add(mesh);
      // 손잡이 끈
      const strap = new THREE.Mesh(new THREE.CylinderGeometry(0.02,0.02,0.4,6), matClay(0xcccccc));
      strap.position.set(x, 2.35, 0); scene.add(strap);
      handles.push({ mesh, x, z:0, occupied:false, occupant:null });
    });
  }

  /* ============ 좌석 하이라이트 ============
     상태별 색 구분
       점유됨          : 표시 없음
       경쟁 중         : 빨강
       플레이어 선택   : 파랑
       플레이어 예약   : 초록 (빌런 퇴치 / 선행 보상)
       NPC가 노리는 중 : 주황
       마우스 hover    : 밝은 노랑
       일반 빈자리     : 옅은 크림색
  =========================================== */
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

  /* ============ Character factory (클레이 스타일) ============ */
  function makeCharacter(bodyColor, headColor) {
    const g = new THREE.Group();
    const bodyMat = matClay(bodyColor);
    const headMat = matClay(headColor || 0xf1c9a5);

    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.34,0.42,0.85,16), bodyMat);
    body.position.y = 0.55; body.castShadow=true; g.add(body);
    const belly = new THREE.Mesh(new THREE.SphereGeometry(0.42,16,12), bodyMat);
    belly.position.y = 0.55; belly.scale.set(1,0.8,1); g.add(belly);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.32,16,14), headMat);
    head.position.y = 1.25; head.castShadow=true; g.add(head);
    // 다리
    [-0.18,0.18].forEach(x=>{
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.12,0.12,0.35,10), bodyMat);
      leg.position.set(x,0.17,0); g.add(leg);
    });
    // 팔
    const armL = new THREE.Mesh(new THREE.CylinderGeometry(0.1,0.1,0.4,10), bodyMat);
    armL.position.set(-0.42,0.6,0); armL.rotation.z=0.3; g.add(armL);
    const armR = new THREE.Mesh(new THREE.CylinderGeometry(0.1,0.1,0.4,10), bodyMat);
    armR.position.set(0.42,0.6,0); armR.rotation.z=-0.3; g.add(armR);

    g.userData.head = head; g.userData.armR = armR; g.userData.armL = armL;
    g.userData.baseArmRz = -0.3;
    return g;
  }

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
    const bodyChar = makeCharacter(0x8e44ad, 0xd0a3e0);
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
    player = makeCharacter(0x4a90d9, 0xf1c9a5);

    // 기존 오른팔(armR)을 어깨 피벗 하위로 재구성
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

    const tag = makeTag('나', '#2d78c9'); player.add(tag);
    scene.add(player);
  }
