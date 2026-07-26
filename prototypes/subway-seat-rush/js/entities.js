"use strict";
/* entities.js — NPC 승객 및 빌런(진상 승객) 스폰 로직 */

  /* ============ NPC passengers ============ */
  // kind: 'ambient' | 'competitor'
  function spawnNPC(kind, x, z) {
    const color = kind==='competitor' ? 0x9b8f80 : 0xa9adb2;
    const mesh = makeCharacter(color, 0xe8c39e);
    mesh.position.set(x, 0, z);
    scene.add(mesh);
    const npc = { mesh, kind, targetSeat:null, seated:false, seatRef:null,
                  vx:0, vz:0, x, z, standSpot:{x,z}, isYielder:false, wobble:Math.random()*6,
                  wanderTX:x, wanderTZ:z, wanderTimer:Math.random()*2, wanderSpeed:1.3+Math.random()*0.9 };
    npcs.push(npc);
    return npc;
  }

  function spawnPassengers() {
    // 경쟁 승객 6명 — 승강장에서 진입
    for (let i=0;i<6;i++){
      const x = -5 + i*2;
      spawnNPC('competitor', x, CAR.platformZ + (Math.random()*0.6));
    }
    // 배경 승객 몇 명 — 통로에 분산 (좌석 경쟁 안 함)
    const ambientSpots = [[-6.5,0.4],[6.5,-0.4],[-2,0.6],[2,-0.6]];
    ambientSpots.forEach(s=> spawnNPC('ambient', s[0], s[1]));
  }

  /* ============ Villains ============ */
  function makeVillainMesh(type){
    if (type==='drunk'){
      const g = makeCharacter(0xc0392b, 0xd98b7a);
      g.add(makeTag('취객','#c0392b'));
      return g;
    } else {
      const g = makeCharacter(0x8e44ad, 0xd0a3e0);
      // 등에 큰 백팩
      const pack = new THREE.Mesh(new THREE.BoxGeometry(0.7,0.8,0.5), matClay(0x5b2c6f));
      pack.position.set(0,0.6,-0.45); g.add(pack);
      g.add(makeTag('백팩','#8e44ad'));
      return g;
    }
  }

  function spawnVillain(type){
    const mesh = makeVillainMesh(type);
    const x = (Math.random()<0.5? -6.5 : 6.5);
    mesh.position.set(x, 0, 0.2);
    scene.add(mesh);
    const v = {
      type, mesh, x, z:0.2,
      hp: (type==='drunk'?3:3),
      state: (type==='drunk'?'WANDER':'MOVE'),
      timer: 0, dirX:(Math.random()<0.5?-1:1), dirZ:(Math.random()<0.5?-1:1),
      hitFlash:0, defeated:false, telegraph:0, spinTimer:0, cooldown:0,
      dmgCooldown:0
    };
    villains.push(v);
    showCenter(type==='drunk'? '⚠ 만취 비틀이 등장!' : '⚠ 백팩 회전맨 등장!', true, 1.6);
    return v;
  }

