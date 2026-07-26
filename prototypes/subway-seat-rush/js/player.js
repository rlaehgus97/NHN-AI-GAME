"use strict";
/* player.js — 플레이어 이동, 자세(서기/앉기/손잡이), 상호작용, 가방 공격 */

  /* ============ Interaction system ============ */
  function dist2(ax,az,bx,bz){ const dx=ax-bx,dz=az-bz; return dx*dx+dz*dz; }

  function nearestEmptySeat(px,pz,maxD){
    let best=null, bd=maxD*maxD;
    seats.forEach(s=>{
      if (s.occupied) return;
      const d = dist2(px,pz, s.interactionPoint.x, s.interactionPoint.z);
      if (d<bd){ bd=d; best=s; }
    });
    return best;
  }
  function nearestFreeHandle(px,pz,maxD){
    let best=null, bd=maxD*maxD;
    handles.forEach(h=>{ if(h.occupied) return;
      const d=dist2(px,pz,h.x,h.z); if(d<bd){bd=d;best=h;} });
    return best;
  }

  function sitOnSeat(seat){
    seat.occupied=true; seat.occupant='player'; seat.captureProgress=0; seat.captureBy=null;
    G.occupiedSeat = seat;
    setPosture(Posture.SEATED);
    player.position.set(seat.x, 0, seat.z + (seat.face>0? 0.05 : -0.05));
  }
  function standUpFromSeat(){
    if (G.occupiedSeat){ G.occupiedSeat.occupied=false; G.occupiedSeat.occupant=null; }
    const s = G.occupiedSeat; G.occupiedSeat=null;
    setPosture(Posture.STANDING);
    if (s) player.position.set(s.x, 0, s.interactionPoint.z);
  }
  function grabHandle(h){
    h.occupied=true; h.occupant='player'; G.heldHandle=h;
    setPosture(Posture.HOLDING_HANDLE);
    player.position.set(h.x, 0, 0);
  }
  function releaseHandle(){
    if (G.heldHandle){ G.heldHandle.occupied=false; G.heldHandle.occupant=null; }
    G.heldHandle=null; setPosture(Posture.STANDING);
  }

  function setPosture(p){
    G.posture = p;
    // 시각적 구분
    if (p===Posture.SEATED){ player.scale.set(1,0.72,1); }
    else { player.scale.set(1,1,1); }
    // 손잡이: 오른팔 위로
    if (player.userData.armR){
      player.userData.armR.rotation.z = (p===Posture.HOLDING_HANDLE)? -1.9 : player.userData.baseArmRz;
    }
  }

  /* ============ Bag attack ============ */
  function tryBagAttack(){
    if (G.state!==GameState.TRAVELING && G.state!==GameState.ARRIVAL) return;
    if (G.posture!==Posture.STANDING) return;
    if (G.bagCooldown>0 || G.stun>0) return;
    G.bagCooldown = BALANCE.bagAttackCooldown;
    G.bagSwing = 0.28;
    const px=player.position.x, pz=player.position.z;
    const fdir = new THREE.Vector2(G.facing.x, G.facing.y).normalize();
    let hitAny=false;
    villains.forEach(v=>{
      if (v.defeated) return;
      const dx=v.x-px, dz=v.z-pz;
      const d = Math.hypot(dx,dz);
      if (d>BALANCE.bagAttackRange || d<0.01) return;
      const toV = new THREE.Vector2(dx,dz).normalize();
      const ang = Math.acos(THREE.MathUtils.clamp(fdir.dot(toV),-1,1));
      if (ang <= BALANCE.bagAttackArc/2){
        hitVillain(v, toV);
        hitAny=true;
      }
    });
    if (hitAny){ G.shake = Math.max(G.shake, 0.25); showCenter('퍽! 민폐 승객을 밀어냈습니다', false, 0.8); }
  }

  function hitVillain(v, dir){
    // 백팩맨: TELEGRAPH 중 맞으면 회전 취소
    if (v.type==='backpack' && v.state==='TELEGRAPH'){ v.state='COOLDOWN'; v.cooldown=1.2; v.telegraph=0; }
    v.hp -= 1; v.hitFlash = 0.25; v.state='HIT'; v.timer=0;
    // 넉백
    v.x += dir.x*0.9; v.z += dir.z*0.6;
    v.z = THREE.MathUtils.clamp(v.z, -1.2, 1.2);
    v.x = THREE.MathUtils.clamp(v.x, CAR.xMin, CAR.xMax);
    if (v.hp<=0){ defeatVillain(v); }
  }

  function defeatVillain(v){
    v.defeated=true; v.state='DEFEATED';
    scene.remove(v.mesh);
    G.villainsDefeated++;
    // 보상
    heal(BALANCE.villainDefeatHealthReward);
    addHonor(BALANCE.villainDefeatHonorReward);
    G.villainRewardBuff = 5; // 5초간 감소 30%↓
    // 서 있으면 우선 착석 기회
    if (G.posture===Posture.STANDING){
      const freed = freeUpOneSeat();
      if (freed){
        G.prioritySeatTimer = 5;
        showCenter('민폐 승객을 막아낸 당신에게 누군가 자리를 양보했습니다!', false, 2.2);
      } else {
        showCenter('빌런 퇴치! 체력·명예 회복', false, 1.6);
      }
    } else {
      showCenter('빌런 퇴치! 체력·명예 회복', false, 1.6);
    }
  }

  // 앉아있던 일반 NPC 하나를 일으켜 좌석을 비움
  function freeUpOneSeat(){
    for (const s of seats){
      if (s.occupied && s.occupant && s.occupant!=='player' && s.occupant.kind){
        const npc = s.occupant;
        npc.seated=false; npc.seatRef=null;
        s.occupied=false; s.occupant=null; s.captureProgress=0;
        // NPC를 통로로
        npc.targetSeat=null;
        return s;
      }
    }
    return null;
  }

  /* ============ Collision handling ============ */
  function resolvePlayerBounds(x, z){
    x = THREE.MathUtils.clamp(x, CAR.xMin, CAR.xMax);
    const inDoorX = Math.abs(x) < CAR.doorX;
    if (G.doorsOpen && inDoorX){
      // 문 열림: 승강장까지 왕래 가능
      z = THREE.MathUtils.clamp(z, CAR.platformZ, CAR.aisleZMax);
    } else {
      z = THREE.MathUtils.clamp(z, CAR.aisleZMin, CAR.aisleZMax);
    }
    return { x, z };
  }

  // 플레이어-NPC 간단 밀어내기
  function resolveNPCPush(){
    const px=player.position.x, pz=player.position.z;
    npcs.forEach(n=>{
      if (n.seated) return;
      const dx=px-n.mesh.position.x, dz=pz-n.mesh.position.z;
      const d=Math.hypot(dx,dz);
      const min=0.75;
      if (d<min && d>0.001){
        const push=(min-d)/2;
        n.mesh.position.x -= dx/d*push;
        n.mesh.position.z -= dz/d*push;
        n.x=n.mesh.position.x; n.z=n.mesh.position.z;
      }
    });
  }

  /* ============ Player update ============ */
  function updatePlayer(dt){
    // 입력 잠금 상태
    const canMove = (G.posture===Posture.STANDING) && G.stun<=0 &&
      (G.state===GameState.BOARDING || G.state===GameState.SEAT_RUSH ||
       G.state===GameState.TRAVELING || G.state===GameState.ARRIVAL);

    let mx=0, mz=0;
    if (canMove){
      if (keys['w']||keys['arrowup']) mz-=1;
      if (keys['s']||keys['arrowdown']) mz+=1;
      if (keys['a']||keys['arrowleft']) mx-=1;
      if (keys['d']||keys['arrowright']) mx+=1;
    }
    if (mx||mz){
      const len=Math.hypot(mx,mz); mx/=len; mz/=len;
      const spd = (keys['shift']? BALANCE.dashSpeed : BALANCE.moveSpeed);
      let nx=player.position.x+mx*spd*dt;
      let nz=player.position.z+mz*spd*dt;
      const r=resolvePlayerBounds(nx,nz);
      player.position.x=r.x; player.position.z=r.z;
      G.facing.set(mx,mz);
      // 바라보는 방향
      player.rotation.y = Math.atan2(mx, mz);
    }
    // 가방 스윙 애니메이션
    if (G.bagSwing>0){
      G.bagSwing-=dt;
      const t = Math.max(0,G.bagSwing)/0.28;
      if (player.userData.armR) player.userData.armR.rotation.z = -0.3 - Math.sin((1-t)*Math.PI)*1.6;
      if (player.userData.bag) player.userData.bag.rotation.y = -Math.sin((1-t)*Math.PI)*2.0;
    } else if (G.posture===Posture.STANDING){
      if (player.userData.armR) player.userData.armR.rotation.z = -0.3;
      if (player.userData.bag) player.userData.bag.rotation.y = 0;
    }
    if (G.bagCooldown>0) G.bagCooldown-=dt;
    if (G.stun>0) G.stun-=dt;

    // 살짝 걷기 바운스
    if ((mx||mz) && canMove){ player.position.y = Math.abs(Math.sin(performance.now()*0.012))*0.05; }
    else player.position.y = Math.max(0, player.position.y-dt*0.5);
  }

  /* ============ Interaction prompt (TRAVELING/ARRIVAL) ============ */
  function updateInteractPrompt(){
    if (G.state===GameState.SEAT_RUSH) return; // seatRush에서 처리
    const px=player.position.x, pz=player.position.z;

    if (G.state===GameState.ARRIVAL){
      if (G.posture!==Posture.STANDING) setInteract('E: 일어나서 문으로 이동하세요');
      else setInteract('문으로 이동하세요! (출구로 하차)');
      return;
    }
    if (G.state!==GameState.TRAVELING){ setInteract(''); return; }

    if (G.posture===Posture.SEATED){ setInteract('E: 일어서기'); return; }
    if (G.posture===Posture.HOLDING_HANDLE){ setInteract('E: 손잡이 놓기'); return; }

    // STANDING
    let nearVillain=false;
    villains.forEach(v=>{ if(!v.defeated && Math.hypot(v.x-px,v.z-pz)<2.4) nearVillain=true; });
    const seat = nearestEmptySeat(px,pz,1.2);
    const handle = nearestFreeHandle(px,pz,1.1);
    if (nearVillain) setInteract('F / 좌클릭: 가방 휘두르기');
    else if (seat) setInteract('E: 빈자리에 앉기' + (G.prioritySeatTimer>0?' (우선 착석 기회!)':''));
    else if (handle) setInteract('E: 손잡이 잡기');
    else setInteract('');
  }

  /* ============ E 상호작용 ============ */
  function handleInteractKey(){
    const px=player.position.x, pz=player.position.z;
    if (G.state===GameState.SEATED) {}
    if (G.posture===Posture.SEATED){ standUpFromSeat(); return; }
    if (G.posture===Posture.HOLDING_HANDLE){ releaseHandle(); return; }
    if (G.state===GameState.TRAVELING){
      const seat = nearestEmptySeat(px,pz,1.2);
      if (seat){ sitOnSeat(seat); showCenter('착석! 체력 회복 시작', false, 1.0); return; }
      const handle = nearestFreeHandle(px,pz,1.1);
      if (handle){ grabHandle(handle); showCenter('손잡이를 잡았습니다', false, 1.0); return; }
    }
  }

