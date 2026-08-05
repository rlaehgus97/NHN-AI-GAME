"use strict";
/* entities.js — NPC 승객 및 빌런(진상 승객) 스폰 로직 */

  /* ============ NPC passengers ============ */
  // Fall Guys풍 채도 높은 원색 팔레트 — competitor NPC마다 개체별로 무작위 배정해 다채로운 군중을 만든다.
  const NPC_COLOR_PALETTE = [0xff5e5e,0xffb347,0xffe066,0x8ce99a,0x63e6be,0x66d9e8,0x74c0fc,0xb197fc,0xf783ac,0xffa8a8];

  // kind: 'competitor' (좌석 경쟁 NPC). 초기 탑승 방해를 줄이기 위해 배경(ambient) NPC는 스폰하지 않음.
  function spawnNPC(kind, x, z) {
    const color = kind==='competitor'
      ? NPC_COLOR_PALETTE[Math.floor(Math.random()*NPC_COLOR_PALETTE.length)]
      : 0xa9adb2;
    const mesh = createCharacterGroup(color, color);
    mesh.position.set(x, 0, z);
    scene.add(mesh);

    // 개체별 속도 편차: 느림 / 보통 / 빠름
    let moveSpeed = 2.6, captureRate = BALANCE.npcCaptureRatePerSecond;
    if (kind==='competitor'){
      const tier = Math.random();
      if (tier < 0.33){ moveSpeed *= 0.82; captureRate *= 0.80; }      // 느림
      else if (tier < 0.7){ /* 보통: 기본값 유지 */ }
      else { moveSpeed *= 1.22; captureRate *= 1.20; }                  // 빠름
    }

    const npc = {
      mesh, kind, targetSeat:null, seated:false, seatRef:null,
      x, z, standSpot:{x,z},
      boardTarget: { x, z: CAR.farWallZ+0.35 }, // 문턱을 넘으면 바로 객차 안쪽으로 분산
      boardingAtStation:false, boardingDelay:0, boardingEntered:false,
      entryTarget:null, initialSettling:false,
      isYielder:false, wobble:Math.random()*6,
      wanderTX:x, wanderTZ:z, wanderTimer:Math.random()*2, wanderSpeed:1.3+Math.random()*0.9,
      moveSpeed, captureRate,
      thankTag:null, thankTagTimer:0,
      standingIndex:npcs.length,
      idleTarget:null,
      seatApproachPhase:null,
      avoidSeatTimer:0, fleeingVillain:false,
      avoidVillainTarget:null, avoidVillainTimer:0,
      disembarking:false, disembarkPhase:null, exitTargetX:0, exitQueueZ:CAR.farWallZ+0.7
    };
    npcs.push(npc);
    return npc;
  }

  function spawnPassengers() {
    // 좌석 경쟁 NPC: 승강장에 플레이어와 함께 대기 (문이 열려야 탑승 가능)
    // 좌석 15석 + 승객 17명(플레이어 포함) → 항상 2명 이상이 서서 가게 된다.
    // (G.initialCrowd는 중간역 승·하차 흐름을 정하는 데만 쓰고, 초기 승객 수는 항상 고정한다.
    //  이전에는 'empty'일 때 0명이 되어 자리 경쟁 자체가 발생하지 않는 문제가 있었다.)
    const count = BALANCE.competitorCount;
    const doorLanes=[-1.45,-0.5,0.5,1.45];
    for (let i=0;i<count;i++){
      const x=doorLanes[i%doorLanes.length];
      const row=Math.floor(i/doorLanes.length);
      const z=CAR.platformZ+0.6-row*0.75;
      const n=spawnNPC('competitor',x,z);
      n.boardTarget={x,z:CAR.farWallZ+0.85};
      n.boardingDelay=i*0.12;
      const side=i%2===0?-1:1;
      const rank=Math.floor(i/2);
      const staggerZ=[-1.05,0,1.05][rank%3];
      n.entryTarget={
        x:THREE.MathUtils.clamp(side*(1.4+rank*1.02),CAR.xMin+.5,CAR.xMax-.5),
        z:staggerZ
      };
      n.initialSettling=true;
    }
    // 배경(ambient) 승객은 좌석 경쟁을 방해하므로 초기 탑승 단계에서는 생성하지 않음.
  }

  /* ============ Villains ============ */
  function makeVillainMesh(type){
    if (type==='drunk'){
      const g = createCharacterGroup(0xc0392b, 0xd98b7a);
      g.add(makeTag('취객','#c0392b'));
      return g;
    }
    if(type==='broth'){
      const g=createCharacterGroup(0xd35400,0xe8c39e);
      const cup=new THREE.Mesh(new THREE.CylinderGeometry(.14,.11,.35,10),matClay(0xffc65c));
      cup.position.set(.48,.82,0); g.add(cup); g.userData.cup=cup;
      g.add(makeTag('어묵 국물','#d35400')); return g;
    }
    if(type==='climate'){
      const g=createCharacterGroup(0x2980b9,0xe8c39e);
      g.add(makeTag('냉방 조작','#2980b9')); return g;
    }
    if(type==='umbrella'){
      const g=createCharacterGroup(0x2471a3,0xe8c39e);
      const umbrella=new THREE.Mesh(new THREE.CylinderGeometry(.04,.04,1.45,8),matClay(0x34495e));
      umbrella.position.set(.5,.65,0); umbrella.rotation.z=.25; g.add(umbrella);
      g.userData.umbrella=umbrella; g.add(makeTag('젖은 우산','#2471a3')); return g;
    }
    // 백팩 빌런: villainRoot > bodyPivot / backpackPivot 계층 구조 (scene.js)
    return makeBackpackVillain();
  }

  function spawnVillain(type){
    const mesh = makeVillainMesh(type);
    const x = type==='climate' ? (Math.random()<.5?-4.5:4.5) : (Math.random()<0.5? -6.5 : 6.5);
    mesh.position.set(x, 0, 0.2);
    scene.add(mesh);
    const v = {
      type, mesh, x, z:0.2,
      hp: 1,
      state: (type==='drunk'?'WANDER':type==='broth'?'APPROACH':type==='umbrella'?'DRAIN':'MOVE'),
      timer: 0, dirX:(Math.random()<0.5?-1:1), dirZ:(Math.random()<0.5?-1:1),
      hitFlash:0, hitStop:0, defeated:false,
      dmgCooldown:0,
      // 백팩 빌런 전용 상태값
      telegraph:0, telegraphDuration:0,
      swingTimer:0, swingDuration:0, swingHit:false,
      moveOffset:0, moveRetargetAt:0,
      bodyPivot: mesh.userData.bodyPivot || null,
      backpackPivot: mesh.userData.backpackPivot || null,
      hasApproachedPlayer:false,
      approachOffsetX:(Math.random()-0.5)*0.8,
      approachOffsetZ:0,
      zoneRadius:2.0, zoneMesh:null, neglectTimer:0, relocatedNPC:false,
      interactProgress:0, actionTimer:0, spillDone:false
    };
    if(type==='climate'){
      v.zoneMesh=makeHazardDisc(x,0.2,v.zoneRadius,0x66d9ff,.2);
      v.hasApproachedPlayer=true;
    }
    villains.push(v);
    AudioFX.play(type==='drunk'?'villain':type==='backpack'?'backpack':type);
    VisualFX.flash('danger');
    VisualFX.burst(x,1,0.2,type==='drunk'?0xe74c3c:0x9b59b6,16);
    const names={drunk:'만취 비틀이',backpack:'백팩 회전맨이',broth:'어묵 국물 승객이',climate:'냉방 조작 승객이',umbrella:'젖은 우산 승객이'};
    showCenter('⚠ '+names[type]+' 등장!', true, 1.6);
    return v;
  }
