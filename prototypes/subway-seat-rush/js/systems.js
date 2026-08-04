"use strict";
/* systems.js — 체력/명예 시스템, 이벤트 매니저(자리양보/급정거), 빌런 퇴치 보상, 스테이지 타이머 */

  /* ============ Health and honor systems ============ */
  function damage(amount){
    G.health = Math.max(0, G.health - amount);
    G.stress = BALANCE.maxHealth-G.health;
    if (G.health <= 0 && (G.state === GameState.TRAVELING || G.state === GameState.ARRIVAL)){
      endGame(false, '통근 스트레스가 100에 도달했습니다.');
    }
  }
  function heal(amount){
    G.health = Math.min(BALANCE.maxHealth, G.health + amount);
    G.stress = BALANCE.maxHealth-G.health;
  }
  function addHonor(amount){ G.honor = Math.max(0, Math.min(BALANCE.maxHonor, G.honor + amount)); }
  function honorGrade(h){
    if (h>=70) return '의인';
    if (h>=40) return '평범한 시민';
    if (h>=1)  return '눈치 없는 승객';
    return '인간성 상실';
  }

  function applyKindnessBuff(){
    G.kindness.active = true;
    G.kindness.remaining = BALANCE.kindnessBuffDuration;
    G.kindness.mult = BALANCE.kindnessDrainMultiplier;
  }

  /* ============ 좌석 양보 연출 (빌런 퇴치 보상 / 선행에 대한 보답) ============
     앉아있는 일반 NPC 한 명을 선택해 실제로 일으켜 세우고, 통로로 이동시킨 뒤
     해당 좌석을 플레이어 전용으로 일정 시간 예약한다.
     - 빌런을 퇴치했을 때(player.js의 defeatVillain)
     - 플레이어가 자리를 양보하는 선행을 했을 때(resolveYield) — 이 경우 무조건 호출됨
     두 상황 모두에서 재사용되며, introText로 상황에 맞는 안내 문구를 받는다.
  =========================================================================== */
  function attemptSeatReward(introText){
    const candidateSeat = seats.find(s=> s.occupied && s.occupant && s.occupant!=='player' &&
                                          s.occupant.kind && !s.occupant.isYielder);
    if (!candidateSeat){
      // 비울 좌석이 없으면(모두 서 있는 경우 등) 안내 문구만 표시
      showCenter(introText, false, 1.8);
      return;
    }
    const npc = candidateSeat.occupant;

    // 좌석 비우기
    npc.seated=false; npc.seatRef=null;
    candidateSeat.occupied=false; candidateSeat.occupant=null;
    candidateSeat.captureProgress=0; candidateSeat.npcProgress=0; candidateSeat.npcClaimantRef=null;
    npc.targetSeat=null;

    // NPC가 플레이어를 바라보며 감사 태그 표시
    npc.mesh.scale.set(1,1,1);
    npc.mesh.position.set(candidateSeat.x, 0, candidateSeat.z);
    npc.x=candidateSeat.x;
    npc.z=candidateSeat.z;
    const dx=player.position.x-candidateSeat.x, dz=player.position.z-candidateSeat.z;
    npc.mesh.rotation.y = Math.atan2(dx,dz);
    if (npc.thankTag){ npc.mesh.remove(npc.thankTag); }
    npc.thankTag = makeTag(Math.random()<0.5 ? '고마워요!' : '여기 앉으세요!', '#27ae60');
    npc.mesh.add(npc.thankTag);
    npc.thankTagTimer = 1.8;

    // NPC는 통로의 빈 위치로 이동(배회 로직에 편입)
    const dir = Math.random()<0.5 ? -1 : 1;
    npc.wanderTX = THREE.MathUtils.clamp(candidateSeat.interactionPoint.x + dir*1.4, CAR.xMin, CAR.xMax);
    npc.wanderTZ = THREE.MathUtils.clamp(candidateSeat.interactionPoint.z, CAR.aisleZMin, CAR.aisleZMax);
    npc.wanderTimer = 3;
    npc.x = candidateSeat.x; npc.z = candidateSeat.z;

    // 좌석을 플레이어 전용으로 예약
    candidateSeat.reservedFor = 'player';
    candidateSeat.reservedTimer = BALANCE.seatReservationDuration;

    showCenter(introText+'\n승객이 양보한 초록색 자리를 클릭하세요!', false, 2.4);
  }

  // 예약된 좌석의 남은 시간을 갱신하고, 시간이 지나면 예약 해제(다른 NPC도 다시 앉을 수 있게 됨)
  function updateSeatReservations(dt){
    seats.forEach(s=>{
      if(s.reservedFor==='player-safety') return;
      if (s.reservedFor && !s.occupied){
        s.reservedTimer -= dt;
        if (s.reservedTimer<=0){ s.reservedFor=null; s.reservedTimer=0; }
      }
    });
  }

  function ensurePlayerSafetyResources(){
    const safetySeat=seats.find(s=>!s.occupied) || seats[0];
    if(safetySeat){
      safetySeat.reservedFor='player-safety';
      safetySeat.reservedTimer=BALANCE.stageDuration+10;
    }
    handles.forEach((handle,index)=>{ handle.playerSafety=index<2; });
  }

  /* ============ Event manager (자리 양보 / 급정거) ============
     자리 양보: 명예를 얻는 대신 좌석을 실제로 잃음(장점/단점 공존).
     모른 척하기: 계속 앉아있을 수 있지만 명예가 깎임(패널티는 완화됨).
  =============================================================================== */
  function openYieldEvent(){
    G.flags.yieldDone = true;
    clearPlayerSeatTarget();
    G.eventReturnState = G.state;
    G.state = GameState.EVENT;
    // 양보 NPC 등장 (플레이어 앞)
    const s = G.occupiedSeat;
    const yn = spawnNPC('ambient', s.x, s.interactionPoint.z);
    yn.isYielder = true; yn.mesh.add(makeTag('노약자','#e67e22'));
    G._yielder = yn;
    const ov = document.getElementById('eventOverlay');
    document.getElementById('eventTitle').textContent = '자리 양보?';
    document.getElementById('eventDesc').textContent = '힘들어 보이는 승객이 당신 앞에 서 있습니다.';
    document.getElementById('choice1').innerHTML = '자리 양보<span class="kbd">[1]</span>';
    document.getElementById('choice2').innerHTML = '모른 척하기<span class="kbd">[2]</span>';
    ov.classList.remove('hidden');
  }
  function resolveYield(choice){
    const ov = document.getElementById('eventOverlay');
    ov.classList.add('hidden');
    const yn = G._yielder;
    if (choice===1){
      addHonor(BALANCE.yieldSeatHonorReward);
      G.goodDeeds++;
      applyKindnessBuff();               // 즉시 회복 대신, 이후 체력 소모가 완화되는 선행 버프
      const s = G.occupiedSeat;
      standUpFromSeat();
      if (s && yn){ s.occupied=true; s.occupant=yn; yn.seated=true; yn.seatRef=s;
        placeCharacterOnSeat(yn.mesh, s); yn.x=yn.mesh.position.x; yn.z=yn.mesh.position.z; }
      showCenter('자리를 양보했습니다. 명예 +'+BALANCE.yieldSeatHonorReward, false, 1.8);
      // 선행에 대한 보답: 앉아있던 다른 승객 중 1명이 무조건 감동해서 자리를 양보함
      attemptSeatReward('당신의 선행을 지켜본 승객이 있습니다!');
    } else {
      addHonor(-BALANCE.ignoreSeatHonorPenalty);
      if (yn){ scene.remove(yn.mesh); npcs = npcs.filter(n=>n!==yn); }
      showCenter('모른 척했습니다... 주변의 따가운 시선', true, 1.8);
    }
    G._yielder=null;
    G.state = G.eventReturnState || GameState.TRAVELING;
    G.eventReturnState = null;
  }

  function triggerSuddenStopWarn(){
    G.flags.suddenStopWarned = true;
    AudioFX.play('warning');
    showCenter('열차가 급정거합니다! 손잡이를 잡으세요!', true, 1.5);
  }
  function doSuddenStop(){
    G.flags.suddenStopDone = true;
    AudioFX.play('brake');
    VisualFX.flash('brake');
    G.shake = Math.max(G.shake, 0.5);
    if (G.posture===Posture.SEATED){
      damage(BALANCE.suddenStopDamage * BALANCE.suddenStopSeatedMultiplier); // 가장 안전하지만 완전 무적은 아님
    } else if (G.posture===Posture.HOLDING_HANDLE){
      damage(BALANCE.suddenStopDamage * 0.25);
    } else {
      damage(BALANCE.suddenStopDamage);
      player.position.z += 1.0; // 앞으로 넉백
      G.stun = 0.4;
    }
    // NPC/빌런 흔들림
    villains.forEach(v=>{ if(!v.defeated){ v.z += 0.3; } });
    if(slipperyZones.some(zone=>playerInZone(zone)) && G.posture===Posture.STANDING){
      damage(7);
      G.stun=Math.max(G.stun,0.65);
      G.knockback.timer=BALANCE.knockbackDuration;
      G.knockback.distance=1.4;
      G.knockback.dirX=(Math.random()<.5?-1:1);
      G.knockback.dirZ=.35;
      showCenter('미끄러운 바닥에서 중심을 잃었습니다!',true,1.4);
    }
  }

  /* ============ Stage timer and station manager ============ */
  function updateStationProgress(){
    // 45초를 4구간으로: 11,22,33 에서 역 통과
    const e = G.stageElapsed;
    let idx = 0;
    if (e>=11) idx=1;
    if (e>=22) idx=2;
    if (e>=33) idx=3;
    if (e>=45) idx=4;
    if (idx !== G.stationIndex){
      G.stationIndex = idx;
      if (idx<4){ showCenter(STATION_NAMES[idx]+' 통과', false, 1.2); }
      G.shake = 0;
    }
  }

  // 스크립트 이벤트 스케줄 — 시간은 매 게임(재시작 포함)마다 G.eventSchedule에서 새로 랜덤 결정됨(state.js)
  function updateScriptedEvents(dt){
    const e = G.stageElapsed;
    const sch = G.eventSchedule;
    if (!G.flags.drunkSpawned && e>=sch.drunkAt){ G.flags.drunkSpawned=true; spawnVillain('drunk'); }
    if (!G.flags.backpackSpawned && e>=sch.backpackAt){ G.flags.backpackSpawned=true; spawnVillain('backpack'); }
    // 자리 양보: 최소 시간 이후, 앉아있으면 1회
    if (!G.flags.yieldDone && e>=BALANCE.yieldMinTime && G.posture===Posture.SEATED){ openYieldEvent(); }
    // 급정거: 경고 후 일정 간격 뒤 실제 발생
    if (!G.flags.suddenStopWarned && e>=sch.suddenStopWarnAt){ triggerSuddenStopWarn(); }
    if (G.flags.suddenStopWarned && !G.flags.suddenStopDone && e>=sch.suddenStopWarnAt+BALANCE.suddenStopWarnLeadTime){ doSuddenStop(); }
  }

  /* ============ Health drain / recovery ============ */
  function updateVitals(dt){
    if (G.state!==GameState.TRAVELING) return;
    // 버프 타이머
    if (G.kindness.active){ G.kindness.remaining-=dt; if(G.kindness.remaining<=0){ G.kindness.active=false; G.kindness.mult=1; } }
    if (G.villainRewardBuff>0){ G.villainRewardBuff-=dt; }

    let drainMult = 1;
    if (G.kindness.active) drainMult *= G.kindness.mult;
    if (G.villainRewardBuff>0) drainMult *= 0.7;

    // 빌런 근접시 가중 + 자세와 무관하게 붙는 추가 위험
    let nearVillain=false;
    villains.forEach(v=>{ if(!v.defeated && Math.hypot(v.x-player.position.x,v.z-player.position.z)<2.2) nearVillain=true; });

    // 빌런을 방치(퇴치하지 않음)하면 거리와 무관하게 명예가 서서히 계속 깎임
    const anyActiveVillain = villains.some(v=>!v.defeated);
    if (anyActiveVillain){
      G.villainIgnoreTimer += dt;
      if (G.villainIgnoreTimer >= BALANCE.villainIgnorePenaltyInterval){
        G.villainIgnoreTimer -= BALANCE.villainIgnorePenaltyInterval;
        addHonor(-BALANCE.villainIgnorePenaltyAmount);
      }
    } else {
      G.villainIgnoreTimer = 0;
    }

    if (G.posture===Posture.STANDING){
      let d = BALANCE.standingDrainPerSecond;
      if (nearVillain) d *= BALANCE.villainDrainMultiplier;
      damage(d*drainMult*dt);
    } else if (G.posture===Posture.SEATED){
      heal(BALANCE.seatedRecoveryPerSecond*dt);
      if (nearVillain) damage(BALANCE.nearVillainExtraDrain*dt);
    } else if (G.posture===Posture.HOLDING_HANDLE){
      damage(BALANCE.handleDrainPerSecond*drainMult*dt);
      if (nearVillain) damage(BALANCE.nearVillainExtraDrain*0.5*dt);
    }
  }
