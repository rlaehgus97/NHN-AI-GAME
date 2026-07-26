"use strict";
/* scene.js — Three.js 씬 초기화, 지하철 환경(벽/좌석/손잡이) 및 캐릭터 모델 생성 */

  /* ============ Scene setup ============ */
  function initScene() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xb4b8bd);
    scene.fog = new THREE.Fog(0xb4b8bd, 20, 38);

    camera = new THREE.PerspectiveCamera(52, window.innerWidth/window.innerHeight, 0.1, 200);
    camera.position.set(0, 9, 10);
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
    dir.position.set(6, 14, 8);
    dir.castShadow = true;
    dir.shadow.mapSize.set(1024,1024);
    dir.shadow.camera.left=-16; dir.shadow.camera.right=16;
    dir.shadow.camera.top=12; dir.shadow.camera.bottom=-12;
    scene.add(dir);
    const amb = new THREE.AmbientLight(0xffffff, 0.22);
    scene.add(amb);

    clock = new THREE.Clock();
  }

  /* ============ Subway environment ============ */
  function matClay(hex){ return new THREE.MeshStandardMaterial({ color:hex, roughness:0.95, metalness:0.0 }); }

  function buildEnvironment() {
    const carLen = 15.4, carWidth = 4.6;

    // 바닥 (차량 + 승강장)
    const floor = new THREE.Mesh(new THREE.BoxGeometry(carLen+1, 0.2, carWidth), matClay(0xececec));
    floor.position.set(0,-0.1,0); floor.receiveShadow = true; scene.add(floor);

    const platform = new THREE.Mesh(new THREE.BoxGeometry(carLen+1, 0.2, 3.4), matClay(0xd2d5da));
    platform.position.set(0,-0.1, CAR.farWallZ - 1.9); platform.receiveShadow = true; scene.add(platform);

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
    exitMarker = new THREE.Mesh(new THREE.CircleGeometry(1.1, 24),
        new THREE.MeshStandardMaterial({ color:0x2ecc71, roughness:1, transparent:true, opacity:0.0 }));
    exitMarker.rotation.x = -Math.PI/2;
    exitMarker.position.set(0, 0.02, CAR.farWallZ - 1.4);
    scene.add(exitMarker);

    buildBenchesAndSeats();
    buildHandles();
  }

  /* ============ Seats and handles ============ */
  function buildBenchesAndSeats() {
    // 벤치(양쪽 벽) — 낮은 형태로 카메라 시야 확보
    const benchMat = matClay(0xcfd3d8);
    [ -1.75, 1.75 ].forEach(z=>{
      const bench = new THREE.Mesh(new THREE.BoxGeometry(13.6, 0.45, 0.9), benchMat);
      bench.position.set(0, 0.22, z); bench.receiveShadow=true; scene.add(bench);
      const back = new THREE.Mesh(new THREE.BoxGeometry(13.6, 0.7, 0.18), benchMat);
      back.position.set(0, 0.6, z + (z<0? -0.36 : 0.36)); scene.add(back);
    });

    // 좌석 5개 (원경 4 + 근경 1)
    const seatDefs = [
      { x:-5, z:-1.7, face: 1 },
      { x:-3, z:-1.7, face: 1 },
      { x: 3, z:-1.7, face: 1 },
      { x: 5, z:-1.7, face: 1 },
      { x: 0, z: 1.7, face:-1 }
    ];
    const seatMat = matClay(0x9aa0a8);
    seatDefs.forEach((d,i)=>{
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.12, 0.8), seatMat.clone());
      mesh.position.set(d.x, 0.5, d.z); scene.add(mesh);
      const point = { x: d.x, z: d.z + d.face*0.95 }; // 통로쪽 상호작용 위치
      seats.push({ mesh, x:d.x, z:d.z, face:d.face, occupied:false, occupant:null,
                   interactionPoint:point, captureProgress:0, captureBy:null });
    });
  }

  function buildHandles() {
    const ringMat = matClay(0xe0a94b);
    [ -4.5, -1.5, 1.5, 4.5 ].forEach(x=>{
      const mesh = new THREE.Mesh(new THREE.TorusGeometry(0.18,0.05,8,16), ringMat.clone());
      mesh.position.set(x, 2.1, 0); mesh.rotation.x = Math.PI/2 * 0; scene.add(mesh);
      // 손잡이 끈
      const strap = new THREE.Mesh(new THREE.CylinderGeometry(0.02,0.02,0.4,6), matClay(0xcccccc));
      strap.position.set(x, 2.35, 0); scene.add(strap);
      handles.push({ mesh, x, z:0, occupied:false, occupant:null });
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

  /* ============ Player ============ */
  function buildPlayer() {
    player = makeCharacter(0x4a90d9, 0xf1c9a5);
    // 가방 (휘두르기용)
    const bag = new THREE.Mesh(new THREE.BoxGeometry(0.4,0.5,0.22), matClay(0x8e5a3c));
    bag.position.set(0.55, 0.55, 0.15);
    player.add(bag); player.userData.bag = bag;
    const tag = makeTag('나', '#2d78c9'); player.add(tag);
    scene.add(player);
  }

