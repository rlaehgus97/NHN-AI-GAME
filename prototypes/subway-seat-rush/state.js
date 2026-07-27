"use strict";
/* entities.js — NPC 승객 및 빌런(진상 승객) 스폰 로직 */

  /* ============ NPC passengers ============ */
  // kind: 'competitor' (좌석 경쟁 NPC). 초기 탑승 방해를 줄이기 위해 배경(ambient) NPC는 스폰하지 않음.
  function spawnNPC(kind, x, z) {
    const color = kind==='competitor' ? 0x9b8f80 : 0xa9adb2;
    const mesh = makeCharacter(color, 0xe8c39e);
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
      boardTarget: { x, z: 0 },   // 탑승 단계에서 걸어 들어갈 목표(차량 통로 중앙)
      isYielder:false, wobble:Math.random()*6,
      wanderTX:x, wanderTZ:z, wanderTimer:Math.random()*2, wanderSpeed:1.3+Math.random()*0.9,
      moveSpeed, captureRate,
      thankTag:null, thankTagTimer:0,
      disembarking:false, exitTargetX:0
    };
    npcs.push(npc);
    return npc;
  }

  function spawnPassengers() {
    // 좌석 경쟁 NPC: 승강장에 플레이어와 함께 대기 (문이 열려야 탑승 가능)
    const count = BALANCE.competitorCount;
    for (let i=0;i<count;i++){
      const t = count>1 ? i/(count-1) : 0.5;
      const x = CAR.xMin + 0.6 + t*(CAR.xMax - CAR.xMin - 1.2);
      const z = CAR.platformZ + (Math.random()*0.6 - 0.3);
      spawnNPC('competitor', x, z);
    }
    // 배경(ambient) 승객은 좌석 경쟁을 방해하므로 초기 탑승 단계에서는 생성하지 않음.
  }

  /* ============ Villains ============ */
  function makeVillainMesh(type){
    if (type==='drunk'){
      const g = makeCharacter(0xc0392b, 0xd98b7a);
      g.add(makeTag('취객','#c0392b'));
      return g;
    }
    // 백팩 빌런: villainRoot > bodyPivot / backpackPivot 계층 구조 (scene.js)
    return makeBackpackVillain();
  }

  function spawnVillain(type){
    const mesh = makeVillainMesh(type);
    const x = (Math.random()<0.5? -6.5 : 6.5);
    mesh.position.set(x, 0, 0.2);
    scene.add(mesh);
    const v = {
      type, mesh, x, z:0.2,
      hp: 3,
      state: (type==='drunk'?'WANDER':'MOVE'),
      timer: 0, dirX:(Math.random()<0.5?-1:1), dirZ:(Math.random()<0.5?-1:1),
      hitFlash:0, hitStop:0, defeated:false,
      dmgCooldown:0,
      // 백팩 빌런 전용 상태값
      telegraph:0, telegraphDuration:0,
      swingTimer:0, swingDuration:0, swingHit:false,
      moveOffset:0, moveRetargetAt:0,
      bodyPivot: mesh.userData.bodyPivot || null,
      backpackPivot: mesh.userData.backpackPivot || null
    };
    villains.push(v);
    showCenter(type==='drunk'? '⚠ 만취 비틀이 등장!' : '⚠ 백팩 회전맨 등장!', true, 1.6);
    return v;
  }
