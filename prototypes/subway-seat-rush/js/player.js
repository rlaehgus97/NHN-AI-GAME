"use strict";
/* player.js — 플레이어 이동(마우스 포인터 방향), 자세, 좌석 클릭/자동 이동, 가방 공격 */

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

  // 모든 캐릭터가 같은 위치·회전·크기로 앉도록 하는 공통 착석 포즈
  function placeCharacterOnSeat(character, seat){
    character.position.set(
      seat.x,
      CAR.seatSitY,
      seat.z + seat.face*CAR.seatSitOffset
    );
    character.rotation.y = seat.face>0 ? 0 : Math.PI;
    character.scale.set(1,CAR.seatedScaleY,1);
  }

  function recordDirectorPlayerAction(type, source){
    const director = window.GameModules && window.GameModules.director;
    if (director && director.recordPlayerAction){
      director.recordPlayerAction({ type, source:source || 'manual', time:G.stageElapsed });
    }
  }

  function isDirectorSeatingLocked(){
    const director = window.GameModules && window.GameModules.director;
    return !!(director && director.isSeatingLocked && director.isSeatingLocked(G.stageElapsed));
  }

  // seat: 대상 좌석, msg: 착석 시 표시할 기본 메시지(양보받은 좌석이면 전용 메시지로 대체됨)
  function sitOnSeat(seat, msg){
    if (isDirectorSeatingLocked()){
      clearPlayerSeatTarget();
      return false;
    }
    const wasReserved = (seat.reservedFor==='player' || seat.reservedFor==='player-safety');
    seat.occupied=true; seat.occupant='player';
    seat.captureProgress=0; seat.npcProgress=0; seat.npcClaimantRef=null;
    seat.reservedFor=null; seat.reservedTimer=0;
    G.occupiedSeat = seat;
    setPosture(Posture.SEATED);
    placeCharacterOnSeat(player, seat);

    // 착석하면 선택/경쟁 상태는 모두 종료된다.
    G.targetSeat = null;
    G.autoMovingToSeat = false;
    G.seatCompetitionActive = false;
    G.contestedSeat = null;
    if (UI && UI.seatWrap) UI.seatWrap.classList.remove('show');
    recordDirectorPlayerAction('SIT', 'manual');

    // 같은 좌석을 노리던 NPC는 목표를 잃고 다른 빈자리를 찾는다.
    npcs.forEach(n=>{ if(n.targetSeat===seat){ n.targetSeat=null; n.seatApproachPhase=null; } });

    AudioFX.play('sit');
    VisualFX.burst(seat.x, 1.05, seat.z, 0xf6c344, 12);
    VisualFX.flash('success');
    showCenter(wasReserved ? '양보받은 자리에 앉았습니다!' : (msg || '착석했습니다'), false, 1.4);
  }
  function standUpFromSeat(source='manual'){
    if (G.occupiedSeat){ G.occupiedSeat.occupied=false; G.occupiedSeat.occupant=null; }
    const s = G.occupiedSeat; G.occupiedSeat=null;
    setPosture(Posture.STANDING);
    G.risingTimer = BALANCE.standUpDelay; // 일어나는 동안 짧은 지연(이동/공격 불가)
    if (s) player.position.set(s.x, 0, s.interactionPoint.z);
    if (s) recordDirectorPlayerAction('STAND', source);
    AudioFX.play('stand');
    ensurePlayerSafetyResources();
  }
  function grabHandle(h){
    h.occupied=true; h.occupant='player'; G.heldHandle=h;
    clearPlayerSeatTarget();
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
    if (p===Posture.SEATED){ player.scale.set(1,CAR.seatedScaleY,1); }
    else { player.scale.set(1,1,1); }
    // 손잡이: 오른팔 위로
    if (player.userData.armR){
      player.userData.armR.rotation.z = (p===Posture.HOLDING_HANDLE)? -1.9 : player.userData.baseArmRz;
    }
  }

  /* ============ 마우스 클릭 처리 (좌석 → 빌런 → 바닥 순서) ============ */

  // 이 상태에서만 게임 월드에 대한 마우스 입력을 허용한다.
  function isWorldInputAllowed(){
    return G.state===GameState.BOARDING || G.state===GameState.SEAT_RUSH ||
           G.state===GameState.TRAVELING || G.state===GameState.ARRIVAL;
  }

  // 좌석 클릭: 목표 좌석으로 지정하고, 이미 충분히 가까우면 즉시 착석 판정을 맡긴다.
  function handleSeatClick(seat){
    if (!seat) return false;
    // 목적지 도착 후에는 좌석을 고를 수 없다(하차가 우선). 클릭은 이동 처리로 넘긴다.
    if (G.state===GameState.ARRIVAL) return false;
    if (G.posture!==Posture.STANDING){
      showCenter('먼저 일어나야 합니다. (E)', true, 1.0);
      return true;   // 클릭은 소비 — 가방 공격으로 넘기지 않음
    }
    if (isDirectorSeatingLocked()){
      showCenter('AI 디렉터 제약으로 잠시 착석할 수 없습니다.', true, 1.0);
      return true;
    }
    if (seat.occupied){
      showCenter('이미 누군가 앉아 있는 자리입니다.', true, 1.0);
      return true;
    }
    if (seat.reservedFor && seat.reservedFor!=='player' && seat.reservedFor!=='player-safety'){
      return true;
    }
    const d = Math.hypot(player.position.x-seat.interactionPoint.x,
                         player.position.z-seat.interactionPoint.z);
    if (d > BALANCE.seatClickMaxDistance) return true;

    // 다른 좌석을 선택하면 이전 선택/경쟁 상태는 즉시 해제된다.
    if (G.targetSeat && G.targetSeat!==seat) clearPlayerSeatTarget();
    else if (G.seatCompetitionActive && G.contestedSeat!==seat) endSeatCompetition();

    G.targetSeat = seat;
    G.autoMovingToSeat = true;
    return true;
  }

  // 바닥 클릭: 좌석 자동 이동을 취소하고 포인터 방향 이동으로 전환
  function handleGroundClick(){
    clearPlayerSeatTarget();
    G.pointerHeld = true;
    leftMouseDown = true;
  }

  /* ============ Bag attack: WINDUP → STRIKE → RECOVERY ============ */
  function tryBagAttack(){
    if (G.state!==GameState.TRAVELING && G.state!==GameState.ARRIVAL) return;
    if (G.posture!==Posture.STANDING) return;
    if (G.risingTimer>0) return;                 // 일어나는 중엔 공격 불가
    if (G.bagAttack.phase!=='IDLE') return;       // 이전 모션이 끝나야 재공격
    if (G.bagCooldown>0 || G.stun>0) return;
    // 공격을 시작하면 좌석 자동 이동은 취소된다.
    clearPlayerSeatTarget();
    G.bagCooldown = BALANCE.bagAttackCooldown;
    G.bagAttack.phase = 'WINDUP';
    G.bagAttack.timer = 0;
    G.bagAttack.hasHit = false;
    AudioFX.play('swing');
  }

  // 실제 판정: STRIKE 모션 중간 구간에서 단 한 번만 호출됨
  function resolveBagHit(){
    const px=player.position.x, pz=player.position.z;
    const fdir = new THREE.Vector2(G.facing.x, G.facing.y).normalize();
    let hitAny=false;
    villains.forEach(v=>{
      if (v.defeated) return;
      if(v.type==='climate' || v.type==='umbrella') return;
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
    if (hitAny){ G.shake = Math.max(G.shake, 0.25); AudioFX.play('hit');
      VisualFX.burst(player.position.x,1,player.position.z,0xff6b4a,14); VisualFX.flash('danger');
      showCenter('퍽! 민폐 승객을 밀어냈습니다', false, 0.8); }
  }

  // 가방 공격 모션(어깨/손 피벗)과 판정 타이밍을 매 프레임 갱신
  function updateBagAttack(dt){
    const ba = G.bagAttack;
    const sp = player.userData.shoulderPivot;
    const hp = player.userData.handPivot;

    if (ba.phase==='IDLE'){
      if (sp) sp.rotation.z += (0 - sp.rotation.z)*Math.min(1, dt*10);
      if (hp) hp.rotation.z += (0 - hp.rotation.z)*Math.min(1, dt*10);
      return;
    }

    ba.timer += dt;

    if (ba.phase==='WINDUP'){
      const t = Math.min(1, ba.timer/BALANCE.bagWindupDuration);
      if (sp) sp.rotation.z = THREE.MathUtils.lerp(0, BALANCE.armWindupZ, t);
      if (hp) hp.rotation.z = THREE.MathUtils.lerp(0, -0.15, t);
      if (ba.timer >= BALANCE.bagWindupDuration){ ba.phase='STRIKE'; ba.timer=0; }
    } else if (ba.phase==='STRIKE'){
      const dur = BALANCE.bagStrikeDuration;
      const t = Math.min(1, ba.timer/dur);
      if (sp) sp.rotation.z = THREE.MathUtils.lerp(BALANCE.armWindupZ, BALANCE.armStrikeZ, t);
      if (hp) hp.rotation.z = THREE.MathUtils.lerp(-0.15, 0.45, t); // 가방이 팔을 살짝 앞질러 휘둘러지는 느낌
      // 판정은 모션 중간 구간(40~75%)에서 단 한 번만
      if (!ba.hasHit && t>=0.4 && t<=0.75){
        ba.hasHit = true;
        resolveBagHit();
      }
      if (ba.timer >= dur){ ba.phase='RECOVERY'; ba.timer=0; }
    } else if (ba.phase==='RECOVERY'){
      const dur = BALANCE.bagRecoveryDuration;
      const t = Math.min(1, ba.timer/dur);
      if (sp) sp.rotation.z = THREE.MathUtils.lerp(BALANCE.armStrikeZ, 0, t);
      if (hp) hp.rotation.z = THREE.MathUtils.lerp(0.45, 0, t);
      if (ba.timer >= dur){ ba.phase='IDLE'; ba.timer=0; ba.hasHit=false; }
    }
  }

  // dir은 THREE.Vector2(x, y)이며 y가 z축 성분이다.
  // 기존 코드가 dir.z(존재하지 않음)를 참조해 v.z가 NaN이 되고,
  // 맞은 빌런이 화면에서 사라지던 문제를 방지한다.
  function hitVillain(v, dir){
    const dirX = dir.x;
    const dirZ = (dir.z !== undefined) ? dir.z : dir.y;
    v.hp -= 1;
    v.hitFlash = 0.25;
    v.hitStop = BALANCE.hitStopDuration; // 짧은 스케일 펀치 연출용(전체 로직은 멈추지 않음)
    v.state = 'HIT'; v.timer = 0;
    v.swingHit = false; v.telegraph = 0; // 예고/스윙 도중 맞으면 그대로 취소되어 HIT으로 전환됨
    // 넉백: 취객은 더 크게 밀려남
    const kb = (v.type==='drunk') ? {x:1.6, z:1.0} : {x:0.7, z:0.5};
    v.x += dirX*kb.x; v.z += dirZ*kb.z;
    v.z = THREE.MathUtils.clamp(v.z, -1.2, 1.2);
    v.x = THREE.MathUtils.clamp(v.x, CAR.xMin, CAR.xMax);
    if (v.hp<=0){ defeatVillain(v); }
  }

  function defeatVillain(v){
    v.defeated=true; v.state='DEFEATED';
    scene.remove(v.mesh);
    if(v.zoneMesh) scene.remove(v.zoneMesh);
    // 퇴치와 공격 판정이 같은 프레임에 겹쳐도 플레이어 입력 잠금이 남지 않게 한다.
    G.stun=0;
    G.risingTimer=0;
    G.knockback.timer=0;
    G.knockback.distance=0;
    G.villainsDefeated++;
    // 기본 보상: 체력/명예
    heal(BALANCE.villainDefeatHealthReward);
    addHonor(BALANCE.villainDefeatHonorReward);
    G.villainRewardBuff = 5; // 5초간 소모 감소 30%↓ (보조 보상)
    // 핵심 보상: 서 있는 상태라면 NPC가 실제로 자리를 양보(systems.js)
    if (G.posture===Posture.STANDING){
      attemptSeatReward('민폐 승객 해결! 명예 +'+BALANCE.villainDefeatHonorReward);
    } else {
      showCenter('민폐 승객 해결! 명예 +'+BALANCE.villainDefeatHonorReward, false, 1.6);
    }
  }

  function forceStandFromVillain(v, distance){
    if(G.posture!==Posture.SEATED) return false;
    standUpFromSeat('villain');
    G.risingTimer=0;
    knockPlayerFrom(v,distance||0.7,0.18);
    showCenter('충격으로 자리에서 밀려났습니다!',true,1.1);
    return true;
  }

  /* ============ Collision handling ============ */
  // 문이 닫혀있을 때는 플레이어가 현재 있는 쪽(승강장/차량)의 경계를 벗어날 수 없음
  function resolvePlayerBounds(x, z){
    x = THREE.MathUtils.clamp(x, CAR.xMin, CAR.xMax);
    const inDoorX = Math.abs(x) < CAR.doorX;
    if (G.doorsOpen && inDoorX){
      // 문 열림 + 문 앞: 승강장부터 차량 안쪽까지 자유롭게 왕래 가능
      z = THREE.MathUtils.clamp(z, CAR.platformZ, CAR.aisleZMax);
    } else {
      // 문이 닫혔거나 문 x범위 밖: 현재 있던 쪽(승강장 vs 차량)의 경계 안으로 제한
      const onPlatformSide = player.position.z <= CAR.farWallZ;
      if (onPlatformSide){
        z = THREE.MathUtils.clamp(z, CAR.platformZ, CAR.farWallZ);
      } else {
        z = THREE.MathUtils.clamp(z, CAR.aisleZMin, CAR.aisleZMax);
      }
    }
    return { x, z };
  }

  // 플레이어-NPC 간단 밀어내기 (통로가 넓어진 만큼 최소 간격도 조금 키움)
  function resolveNPCPush(dt){
    const px=player.position.x, pz=player.position.z;
    npcs.forEach(n=>{
      if (n.seated) return;
      const dx=px-n.mesh.position.x, dz=pz-n.mesh.position.z;
      const d=Math.hypot(dx,dz);
      const min=0.88;
      if (d<min && d>0.001){
        const push=Math.min((min-d)/2,1.3*dt);
        n.mesh.position.x -= dx/d*push;
        n.mesh.position.z -= dz/d*push;
        n.x=n.mesh.position.x; n.z=n.mesh.position.z;
      }
    });
  }

  /* ============ 마우스 포인터 이동 ============ */
  // 이동이 가능한 상황인지 판정 (착석/손잡이/경직/넉백/기립중/경쟁중/오버레이 상태 제외)
  function canPlayerMove(){
    if (G.posture!==Posture.STANDING) return false;
    if (G.stun>0 || G.risingTimer>0 || G.knockback.timer>0) return false;
    if (G.seatCompetitionActive) return false;   // 경쟁 중에는 제자리에서 SPACE 연타
    return isWorldInputAllowed();
  }

  // 포인터 방향 이동 + 좌석 자동 이동. 실제로 이동했는지 여부를 반환한다.
  function updatePlayerMovement(dt){
    if (!canPlayerMove()) return false;

    const speedMul = getPlayerHazardSpeedMultiplier();
    const speed = (keys['shift'] ? BALANCE.dashSpeed : BALANCE.moveSpeed) * speedMul;

    let mx=0, mz=0, moving=false;

    if (G.autoMovingToSeat && G.targetSeat){
      // 선택한 좌석의 상호작용 지점으로 자동 이동
      const t = G.targetSeat.interactionPoint;
      const dx = t.x - player.position.x, dz = t.z - player.position.z;
      const d = Math.hypot(dx,dz);
      if (d > BALANCE.seatArriveDistance*0.75){ mx=dx/d; mz=dz/d; moving=true; }
    } else if (G.pointerHeld && G.pointerWorld.valid){
      // 마우스를 누르고 있는 동안 포인터 방향으로 이동
      const dx = G.pointerWorld.x - player.position.x, dz = G.pointerWorld.z - player.position.z;
      const d = Math.hypot(dx,dz);
      if (d > BALANCE.pointerMoveDeadzone){ mx=dx/d; mz=dz/d; moving=true; }
    }

    if (moving){
      const nx = player.position.x + mx*speed*dt;
      const nz = player.position.z + mz*speed*dt;
      const r = resolvePlayerBounds(nx,nz);
      player.position.x = r.x; player.position.z = r.z;
      G.facing.set(mx,mz);
      player.rotation.y = Math.atan2(mx,mz);   // 회전 방향 = 실제 이동 방향
      return true;
    }

    // 멈춰 있을 때도 포인터를 바라본다 (공격 방향과 일치)
    if (!G.autoMovingToSeat && G.pointerWorld.valid){
      const dx = G.pointerWorld.x - player.position.x, dz = G.pointerWorld.z - player.position.z;
      const d = Math.hypot(dx,dz);
      if (d > BALANCE.pointerFaceDeadzone){
        G.facing.set(dx/d, dz/d);
        player.rotation.y = Math.atan2(dx,dz);
      }
    }
    return false;
  }

  /* ============ Player update ============ */
  function updatePlayer(dt){
    if (G.risingTimer>0) G.risingTimer = Math.max(0, G.risingTimer-dt);

    // 경직/넉백 상태에서는 좌석 선택과 자동 이동을 즉시 취소한다.
    if ((G.stun>0 || G.knockback.timer>0) && (G.targetSeat || G.seatCompetitionActive)){
      clearPlayerSeatTarget();
    }

    // 넉백(튕겨나감): 마우스 입력보다 우선 적용되며, 짧은 시간 동안 감속하며 밀려난다
    if (G.knockback.timer>0){
      const remainingFrac = G.knockback.timer / BALANCE.knockbackDuration;
      const speed = (G.knockback.distance / BALANCE.knockbackDuration) * 2 * remainingFrac; // ease-out
      const nx = player.position.x + G.knockback.dirX*speed*dt;
      const nz = player.position.z + G.knockback.dirZ*speed*dt;
      const r = resolvePlayerBounds(nx, nz);
      player.position.x = r.x; player.position.z = r.z;
      G.knockback.timer = Math.max(0, G.knockback.timer - dt);
    }

    const moved = updatePlayerMovement(dt);

    if(G.surgeTimer>0){
      G.surgeTimer=Math.max(0,G.surgeTimer-dt);
      if(G.posture===Posture.STANDING){
        // 대량 하차 인파는 벽(-z 직선)이 아니라 실제 출입문 중앙으로 수렴한다.
        const doorTargetX=0;
        const doorTargetZ=CAR.platformZ-0.6;
        const surgeDX=doorTargetX-player.position.x;
        const surgeDZ=doorTargetZ-player.position.z;
        const surgeDistance=Math.hypot(surgeDX,surgeDZ)||1;
        const surgeSpeed=1.3;
        const nextX=player.position.x+surgeDX/surgeDistance*surgeSpeed*dt;
        const nextZ=player.position.z+surgeDZ/surgeDistance*surgeSpeed*dt;
        const surgeBounds=resolvePlayerBounds(nextX,nextZ);
        player.position.x=surgeBounds.x; player.position.z=surgeBounds.z;
      }
    }

    updateBagAttack(dt);
    if (G.bagCooldown>0) G.bagCooldown-=dt;
    if (G.stun>0) G.stun-=dt;

    // 살짝 걷기 바운스
    if (G.posture===Posture.SEATED && G.occupiedSeat){
      // 걷기 바운스 복귀 코드가 착석 높이를 0으로 내려버리지 않도록 포즈를 고정한다.
      placeCharacterOnSeat(player, G.occupiedSeat);
    } else if (moved){
      player.position.y = Math.abs(Math.sin(performance.now()*0.012))*0.05;
    } else {
      player.position.y = Math.max(0, player.position.y-dt*0.5);
    }
  }

  /* ============ Interaction prompt ============ */
  function updateInteractPrompt(){
    const px=player.position.x, pz=player.position.z;

    if (G.state===GameState.ARRIVAL){
      if(G.doorBlocker && !G.doorBlocker.cleared &&
        Math.hypot(px-G.doorBlocker.x,pz-G.doorBlocker.z)<1.5){
        setInteract('E: 문 앞 승객을 옆으로 치우기');
        return;
      }
      if (G.posture!==Posture.STANDING) setInteract('E: 일어나서 문으로 이동하세요');
      else setInteract('문 방향을 클릭해 이동하세요! (출구로 하차)');
      return;
    }

    if (G.seatCompetitionActive){ setInteract('SPACE 연타! 경쟁자보다 먼저 자리를 차지하세요'); return; }
    if (G.state===GameState.BOARDING){ setInteract('마우스를 누른 채 차량 안으로 이동하세요'); return; }
    if (G.state===GameState.SEAT_RUSH){ setInteract('밝게 표시된 빈 좌석을 클릭하세요'); return; }
    if (G.state!==GameState.TRAVELING){ setInteract(''); return; }
    if (G.risingTimer>0){ setInteract('일어나는 중...'); return; }

    if (G.posture===Posture.SEATED){ setInteract('E: 일어서기'); return; }
    if (G.posture===Posture.HOLDING_HANDLE){ setInteract('E: 손잡이 놓기'); return; }

    // STANDING
    let nearVillain=false;
    villains.forEach(v=>{ if(!v.defeated && Math.hypot(v.x-px,v.z-pz)<2.4) nearVillain=true; });
    const handle = nearestFreeHandle(px,pz,1.1);
    if (G.autoMovingToSeat && G.targetSeat) setInteract('선택한 좌석으로 이동 중...');
    else if (nearVillain) setInteract('F / 빌런 클릭: 가방 휘두르기');
    else if (G.hoveredSeat) setInteract('클릭: 이 빈자리에 앉기');
    else if (handle) setInteract('E: 손잡이 잡기');
    else setInteract('');
  }

  /* ============ E 상호작용 ============ */
  function handleInteractKey(){
    if (G.risingTimer>0) return;
    const px=player.position.x, pz=player.position.z;
    if (G.posture===Posture.SEATED){ standUpFromSeat(); return; }
    if (G.posture===Posture.HOLDING_HANDLE){ releaseHandle(); return; }
    if(tryClearDoorBlocker()) return;
    if (G.state===GameState.TRAVELING){
      if(hasNearbyUtilityVillain()) return;
      // 좌석은 E가 아니라 "클릭"으로 앉는다. E는 손잡이 전용.
      const handle = nearestFreeHandle(px,pz,1.1);
      if (handle){ grabHandle(handle); showCenter('손잡이를 잡았습니다', false, 1.0); return; }
    }
  }
