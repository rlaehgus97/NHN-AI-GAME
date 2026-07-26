"use strict";
/* systems.js — 체력/명예 시스템, 이벤트 매니저(자리양보/급정거), 스테이지 타이머 */

  /* ============ Health and honor systems ============ */
  function damage(amount){
    G.health = Math.max(0, G.health - amount);
    if (G.health <= 0 && G.state === GameState.TRAVELING){
      endGame(false, '체력이 모두 소진되었습니다.');
    }
  }
  function heal(amount){ G.health = Math.min(BALANCE.maxHealth, G.health + amount); }
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

  /* ============ Event manager (자리 양보 / 급정거) ============ */
  function openYieldEvent(){
    G.flags.yieldDone = true;
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
      heal(10); G.goodDeeds++;
      applyKindnessBuff();
      // NPC가 앉음
      const s = G.occupiedSeat;
      standUpFromSeat();
      if (s && yn){ s.occupied=true; s.occupant=yn; yn.seated=true; yn.seatRef=s;
        yn.mesh.position.set(s.x,0,s.z); yn.mesh.scale.set(1,0.72,1); }
      showCenter('자리를 양보했습니다. 명예 상승!', false, 1.8);
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
    showCenter('열차가 급정거합니다! 손잡이를 잡으세요!', true, 1.5);
  }
  function doSuddenStop(){
    G.flags.suddenStopDone = true;
    G.shake = Math.max(G.shake, 0.5);
    if (G.posture===Posture.SEATED){
      // 피해 없음
    } else if (G.posture===Posture.HOLDING_HANDLE){
      damage(BALANCE.suddenStopDamage * 0.25);
    } else {
      damage(BALANCE.suddenStopDamage);
      // 앞으로 넉백
      player.position.z += 1.0;
      G.stun = 0.4;
    }
    // NPC/빌런 흔들림
    villains.forEach(v=>{ if(!v.defeated){ v.z += 0.3; } });
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
      // 역 통과시 퇴치된 빌런 정리 (이미 remove됨) / 흔들림 리셋
      G.shake = 0;
    }
  }

  // 스크립트 이벤트 스케줄
  function updateScriptedEvents(dt){
    const e = G.stageElapsed;
    if (!G.flags.drunkSpawned && e>=6){ G.flags.drunkSpawned=true; spawnVillain('drunk'); }
    if (!G.flags.backpackSpawned && e>=18){ G.flags.backpackSpawned=true; spawnVillain('backpack'); }
    // 자리 양보: 27초 이후, 앉아있으면 1회
    if (!G.flags.yieldDone && e>=27 && G.posture===Posture.SEATED){ openYieldEvent(); }
    // 급정거: 34초 경고 → 35.5초 실행
    if (!G.flags.suddenStopWarned && e>=34){ triggerSuddenStopWarn(); }
    if (G.flags.suddenStopWarned && !G.flags.suddenStopDone && e>=35.5){ doSuddenStop(); }
  }

  /* ============ Health drain / recovery ============ */
  function updateVitals(dt){
    if (G.state!==GameState.TRAVELING) return;
    // 버프 타이머
    if (G.kindness.active){ G.kindness.remaining-=dt; if(G.kindness.remaining<=0){ G.kindness.active=false; G.kindness.mult=1; } }
    if (G.villainRewardBuff>0){ G.villainRewardBuff-=dt; }
    if (G.prioritySeatTimer>0){ G.prioritySeatTimer-=dt; }

    let drainMult = 1;
    if (G.kindness.active) drainMult *= G.kindness.mult;
    if (G.villainRewardBuff>0) drainMult *= 0.7;

    // 빌런 근접시 가중
    let nearVillain=false;
    villains.forEach(v=>{ if(!v.defeated && Math.hypot(v.x-player.position.x,v.z-player.position.z)<2.2) nearVillain=true; });

    if (G.posture===Posture.STANDING){
      let d = BALANCE.standingDrainPerSecond;
      if (nearVillain) d *= BALANCE.villainDrainMultiplier;
      damage(d*drainMult*dt);
    } else if (G.posture===Posture.SEATED){
      heal(BALANCE.seatedRecoveryPerSecond*dt);
    } else if (G.posture===Posture.HOLDING_HANDLE){
      damage(BALANCE.handleDrainPerSecond*drainMult*dt);
    }
  }

