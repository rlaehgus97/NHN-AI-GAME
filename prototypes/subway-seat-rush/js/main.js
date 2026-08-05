"use strict";
/* main.js — 게임 상태 전환, 메인 루프, 마우스/키 입력 처리, 부트스트랩 */

  /* ============ State transitions ============ */
  function enterState(s){
    // 탑승 시작 / 목적지 도착으로 넘어갈 때는 좌석 선택과 경쟁 상태를 완전히 정리한다.
    // (SEAT_RUSH → TRAVELING 전환은 이동 중인 좌석을 유지해 도착 후 착석할 수 있게 둔다)
    if (s===GameState.BOARDING || s===GameState.ARRIVAL) clearPlayerSeatTarget();

    G.state = s; G.stateTimer = 0;
    if (s===GameState.BOARDING){
      AudioFX.play('approach');
      G.doorsOpen = false;
      closeDoors();
      // 플레이어는 승강장에서 대기 (문이 열려야 탑승 가능) — 차량(전방, +z) 방향을 바라보게 함
      player.position.set(0.3, 0, CAR.platformZ + 0.3);
      player.rotation.y = 0;
      setPosture(Posture.STANDING);
      showCenter('지하철이 도착했습니다. 마우스를 누른 채 탑승하세요!', false, 1.8);
    }
    else if (s===GameState.SEAT_RUSH){
      G.seatsSettled=false;
      G.seatsSettledAt=0;
      showCenter('빈 좌석을 클릭해 앉으세요!', false, 1.6);
    }
    else if (s===GameState.TRAVELING){
      document.body.classList.add('train-moving');
      closeDoors();
      // 안전장치: 문이 닫히는 순간 아직 승강장에 남아있으면 차량 안으로 이동시킴
      if (player.position.z <= CAR.farWallZ){
        player.position.set(THREE.MathUtils.clamp(player.position.x, -CAR.doorX+0.2, CAR.doorX-0.2),
          0, CAR.aisleZMax - 0.3);
      }
      npcs.forEach(n=>{
        if (!n.seated && n.z<=CAR.farWallZ){
          n.z = CAR.aisleZMax - 0.3; n.x = THREE.MathUtils.clamp(n.x, CAR.xMin, CAR.xMax);
          n.mesh.position.set(n.x, 0, n.z);
        }
      });
      showCenter('출발합니다. 목적지 안내까지 버티세요!', false, 1.4);
    }
    else if (s===GameState.ARRIVAL){
      G.stationIndex = 4;
      document.body.classList.remove('train-moving');
      if(!G.doorBlocker || G.doorBlocker.cleared) openDoors();
      else closeDoors();
      exitMarker.material.opacity = 0.55;
      showCenter('목적지입니다. 문으로 이동하세요!', false, 2.2);
      G.arrivalTimeLeft = BALANCE.arrivalExitDuration;
      // 앉아있거나 손잡이면 자동 해제 안내(수동 E 가능) — 여기선 자동 기립
      if (G.posture===Posture.SEATED) standUpFromSeat('arrival');
      if (G.posture===Posture.HOLDING_HANDLE) releaseHandle();

      // 일부 승객도 함께 하차: 무작위로 선정해 문 쪽으로 내보낸다 (앉아있었다면 좌석도 비움)
      npcs.forEach(n=>{
        if (n.isYielder) return;
        if (Math.random() < BALANCE.disembarkRatio){
          beginNPCDisembark(n);
        }
      });
    }
  }

  function openDoors(){ if(!G.doorsOpen) AudioFX.play('doorOpen'); G.doorsOpen=true; }
  function closeDoors(){ if(G.doorsOpen) AudioFX.play('doorClose'); G.doorsOpen=false; }

  function updateDoors(dt){
    const halfDoor = CAR.doorX;
    const targetL = G.doorsOpen ? -halfDoor*1.5 : -halfDoor/2;
    const targetR = G.doorsOpen ?  halfDoor*1.5 :  halfDoor/2;
    doorLeft.position.x += (targetL - doorLeft.position.x)*Math.min(1,dt*5);
    doorRight.position.x += (targetR - doorRight.position.x)*Math.min(1,dt*5);
  }

  // 스테이지 타임라인 값(모듈/폴백 어느 쪽이든 동일). 만약 둘 다 없으면 기본값으로 동작한다.
  function stageTimeline(){
    if (window.GameModules && window.GameModules.stage) return window.GameModules.stage.timeline;
    return { destinationArrival: BALANCE.stageDuration-5, doorsClose: BALANCE.stageDuration };
  }

  function advanceStageTimeline(dt){
    G.stageElapsed+=dt;
    G.timeLeft=Math.max(0,BALANCE.stageDuration-G.stageElapsed);
    updateStageDirector(dt);
    updatePendingStageEvents(dt);
  }

  /* ============ Main state update ============ */
  function updateStates(dt){
    G.stateTimer += dt;
    switch(G.state){
      case GameState.BOARDING: {
        advanceStageTimeline(dt);
        // 1) 문 닫힌 채 대기(도착 메시지) → 2) 문 열림 → 3) 탑승 진입 → 4) 좌석 선택 시작
        if (!G.doorsOpen && G.stateTimer >= BALANCE.boardingApproachDuration){
          openDoors();
          showCenter('문이 열렸습니다! 탑승하세요', false, 1.2);
        }
        if (G.doorsOpen){
          npcs.forEach(n=>{ if(n.kind==='competitor' && !n.seated){
            if(n.boardingDelay>0){
              n.boardingDelay=Math.max(0,n.boardingDelay-dt);
            } else if(window.GameModules){
              if(!n.boardingEntered){
                const reachedDoorPath=window.GameModules.MovementSystem.moveTowards(n,n.boardTarget,dt,{
                  speed:5.0, stopDistance:0.12,
                  bounds:{xMin:-CAR.doorX+0.2,xMax:CAR.doorX-0.2,zMin:CAR.platformZ-2,zMax:CAR.aisleZMax}
                });
                n.boardingEntered=reachedDoorPath || n.z>CAR.farWallZ+0.08;
              }
              if(n.boardingEntered){
                const entryTarget=n.entryTarget || {x:0,z:0};
                const settled=window.GameModules.MovementSystem.moveTowards(n,entryTarget,dt,{
                  speed:2.6,stopDistance:0.12,
                  bounds:{xMin:CAR.xMin,xMax:CAR.xMax,zMin:CAR.aisleZMin,zMax:CAR.aisleZMax}
                });
                if(settled) n.initialSettling=false;
              }
            } else {
              moveNPCTo(n,n.boardTarget.x,n.boardTarget.z,dt);
            }
          }});
          npcs.forEach(n=>{if(!n.seated) applySmoothNPCSeparation(n,dt,.95);});
        }
        updateInteractPrompt();
        if (G.doorsOpen && G.stateTimer >= BALANCE.boardingApproachDuration + BALANCE.boardingEntryDuration){
          enterState(GameState.SEAT_RUSH);
        }
        break;
      }
      case GameState.SEAT_RUSH: {
        advanceStageTimeline(dt);
        updateSeatRush(dt);
        const allOccupied = seats.every(s=>s.occupied);
        const settleAt=Math.max(0,BALANCE.seatRushDuration-BALANCE.seatSettleLeadTime);
        if(!G.seatsSettled && (G.stateTimer>=settleAt || allOccupied)){
          settleRemainingSeats();
          G.seatsSettled=true;
          G.seatsSettledAt=G.stateTimer;
        }
        const settleVisible=G.seatsSettled &&
          G.stateTimer-G.seatsSettledAt>=BALANCE.seatSettleLeadTime;
        // 플레이어가 좌석으로 이동 중이거나 경쟁 중이면 짧은 유예 시간을 준다.
        const playerCommitted = G.seatCompetitionActive ||
          (G.autoMovingToSeat && G.targetSeat && !G.targetSeat.occupied);
        updateInteractPrompt();
        const graceOver = G.stateTimer >= BALANCE.seatRushDuration + BALANCE.seatRushGraceTime;
        const timeUp = G.stateTimer >= BALANCE.seatRushDuration;
        if (graceOver || ((timeUp || (allOccupied && settleVisible)) && !playerCommitted)){
          enterState(GameState.TRAVELING);
        }
        break;
      }
      case GameState.TRAVELING: {
        advanceStageTimeline(dt);
        updateVitals(dt);
        updateSeatReservations(dt);
        updateVillains(dt);
        updateEnvironmentHazards(dt);
        updateNPCAvoidVillains(dt);
        updateUnseatedCompetitors(dt); // 빈자리가 생기면(플레이어 기립, 빌런 퇴치 보상 만료 등) NPC가 알아서 채우러 옴
        ensureEmptySeatGetsFilled(dt);
        if (npcs.some(n=>n.disembarking)) updateNPCDisembark(dt);
        if(G.doorsOpen && G.stationIndex>0 && G.stationIndex<4 &&
          Math.abs(player.position.x)<CAR.doorX+0.2 && player.position.z<CAR.farWallZ-0.15){
          endGame(false,'목적지가 아닌 역에서 잘못 하차했습니다.');
        }
        updateInteractPrompt();
        updateSpecialInteractions(dt);
        // 자리 양보 이벤트: 일정 시간 이후 플레이어가 앉아 있으면 1회 발생
        if (!G.flags.yieldDone && G.stageElapsed>=BALANCE.yieldMinTime && G.posture===Posture.SEATED){
          openYieldEvent();
        }
        // 안전장치: 어떤 이유로든 디렉터의 DESTINATION_ARRIVAL을 놓쳐도 목적지에는 반드시 도착한다.
        if (G.stageElapsed >= stageTimeline().destinationArrival + 1){
          enterState(GameState.ARRIVAL);
        }
        break;
      }
      case GameState.EVENT: {
        // 모달 대기 — 타이머 정지, 배경 유지
        break;
      }
      case GameState.ARRIVAL: {
        updateStageDirector(dt);
        G.arrivalTimeLeft -= dt;
        updateVillains(dt); // 빌런 잔여 이동만
        updateEnvironmentHazards(dt);
        updateNPCWander(dt);
        updateNPCDisembark(dt); // 함께 하차하는 승객들을 문 쪽으로 이동/제거
        updateInteractPrompt();
        updateSpecialInteractions(dt);
        // 출구 도달 판정: 문 밖(z <= farWall-1.0) & 문 x 범위
        const px=player.position.x, pz=player.position.z;
        if (Math.abs(px)<CAR.doorX+0.3 && pz < CAR.farWallZ + 0.4){
          judgeArrival();
        } else if (G.arrivalTimeLeft<=0){
          endGame(false, '제한 시간 안에 하차하지 못했습니다.');
        }
        // 안전장치: 도착 상태가 비정상적으로 길어지면 문이 닫힌 것으로 처리한다.
        G.stageElapsed += dt;
        if (G.stageElapsed >= stageTimeline().doorsClose + 2 &&
            G.state===GameState.ARRIVAL){
          closeDoors();
          endGame(false, '문이 닫힐 때까지 하차하지 못했습니다.');
        }
        // 시간 표시 재활용
        G.timeLeft = G.arrivalTimeLeft;
        break;
      }
    }
  }

  function updateStageDirector(dt){
    if (!window.GameModules) return;
    const actions = window.GameModules.director.update(dt, {
      state:G.state,
      posture:G.posture,
      elapsed:G.stageElapsed
    });
    actions.forEach(action=>{
      if (action.type==='FORCE_STAND'){
        console.info('[AI Director][decision]', action.type, action);
        if (G.state===GameState.TRAVELING && G.posture===Posture.SEATED){
          standUpFromSeat('ai-director');
          showCenter('오래 앉아 있어 잠시 일어납니다.', true, 1.4);
        }
      } else if (action.type==='LOCK_SEATING'){
        console.info('[AI Director][decision]', action.type, action);
        clearPlayerSeatTarget();
        if (G.posture===Posture.SEATED) standUpFromSeat('ai-director');
        showCenter('착석과 기상을 반복해 잠시 착석할 수 없습니다.', true, 1.6);
      } else if (action.type==='EVENT_SLOT'){
        if (action.eventId==='sudden-stop'){
          triggerSuddenStopWarn();
          G.pendingSuddenStop = 3; // 12초 예고 → 15초 결과
        } else {
          spawnVillain(action.eventId);
        }
      } else if (action.type==='STATION_WARNING'){
        showCenter(G.midStationFlow==='disembarking'
          ? '대량 하차 예고! 좌석·손잡이로 고정하거나 문 반대편으로 이동하세요.'
          : '대량 승차 예고! 문 주변을 벗어나 중앙 빈 공간을 선점하세요.', true, 2.6);
        AudioFX.play('warning');
        exitMarker.material.opacity=.3;
        if(G.midStationFlow==='boarding'){
          G.crowdWarningActive=true;
          showCrowdWarningZone();
        }
        if(G.midStationFlow==='disembarking') prepareMassDisembark();
      } else if (action.type==='INTERMEDIATE_ARRIVAL'){
        handleIntermediateArrival(action.stationIndex);
      } else if (action.type==='DESTINATION_WARNING'){
        showCenter('곧 목적지입니다. 하차 준비를 하세요!', true, 2.2);
        AudioFX.play('warning');
        exitMarker.material.opacity=.4;
        spawnDoorBlocker();
      } else if (action.type==='EXIT_QUEUE'){
        showCenter('승객들이 하차문으로 이동합니다!', false, 1.8);
        prepareDestinationExitQueue();
      } else if (action.type==='DESTINATION_ARRIVAL'){
        enterState(GameState.ARRIVAL);
      } else if (action.type==='DOORS_CLOSE'){
        closeDoors();
        if (G.state===GameState.ARRIVAL){
          endGame(false,'문이 닫힐 때까지 하차하지 못했습니다.');
        }
      }
    });
  }

  function updatePendingStageEvents(dt){
    if (G.pendingSuddenStop>0){
      G.pendingSuddenStop-=dt;
      if (G.pendingSuddenStop<=0) doSuddenStop();
    }
    if (G.intermediateDoorTimer>0){
      G.intermediateDoorTimer-=dt;
      if (G.intermediateDoorTimer<=0){ closeDoors(); exitMarker.material.opacity=0; }
    }
  }

  function handleIntermediateArrival(stationIndex){
    clearSlipperyZones();
    window.GameModules.StationSystem.resetStationScope({
      G, seats, villains, npcs, scene
    }, stationIndex);
    openDoors();
    G.intermediateDoorTimer = 2.5;

    if (G.midStationFlow==='boarding'){
      const boardingCount = 10;
      const lanes=[-1.45,-0.5,0.5,1.45];
      const crowdSpots=[
        {x:-5.6,z:-.6},{x:-2.8,z:.6},{x:0,z:-.6},{x:2.8,z:.6},{x:5.6,z:-.6}
      ];
      for(let i=0;i<boardingCount;i++){
        const x=lanes[i%lanes.length];
        const row=Math.floor(i/lanes.length);
        const n=spawnNPC('competitor',x,CAR.platformZ+0.45-row*0.72);
        n.boardTarget={x,z:CAR.farWallZ+0.35};
        n.boardingAtStation=true;
        n.boardingDelay=i*0.1;
        if(i<5){
          n.crowdBlocker=true;
          n.avoidSeatTimer=999;
          n.idleTarget={...crowdSpots[i]};
        }
      }
      showCenter('중간역 대량 승차! '+boardingCount+'명이 탑승합니다.', true, 2.2);
      G.crowdPressureTimer=15;
      G.crowdExposure=(G.posture===Posture.STANDING && Math.abs(player.position.x)<2.8 && player.position.z<.05)?0.65:0;
      G.encircled=G.crowdExposure>=.65;
      G.crowdWarningActive=false;
    } else {
      showCenter('대량 하차 서지! 서 있으면 출입문 방향으로 밀려납니다.', true, 2.2);
      G.surgeTimer=2.5;
    }
  }

  function prepareMassDisembark(){
    const eligible=npcs.filter(n=>!n.isYielder && !n.disembarking);
    const targetCount=Math.max(3,Math.round(eligible.length*0.45));
    for(let i=0;i<Math.min(targetCount,eligible.length);i++){
      beginNPCDisembark(eligible[i]);
    }
    showCenter('하차 승객들이 문 앞에 미리 줄을 섭니다.',false,1.8);
  }

  function prepareDestinationExitQueue(){
    npcs.forEach(n=>{
      if(!n.isYielder && !n.disembarking) beginNPCDisembark(n);
    });
  }

  function judgeArrival(){
    if (G.stress>=BALANCE.maxHealth){ endGame(false,'통근 스트레스가 100에 도달했습니다.'); return; }
    if (G.honor<=0){ endGame(false,'명예가 바닥나 하차에 실패했습니다.'); return; }
    endGame(true, '무사히 목적지에 하차했습니다!');
  }

  /* ============ End game / result ============ */
  function endGame(success, reason){
    if (G.state===GameState.CLEAR || G.state===GameState.GAME_OVER) return;
    G.state = success ? GameState.CLEAR : GameState.GAME_OVER;
    if (window.PhoneMiniGames) PhoneMiniGames.close(true);
    clearPlayerSeatTarget();
    G.pointerHeld=false; leftMouseDown=false; G.hoveredSeat=null;
    document.body.classList.remove('train-moving');
    AudioFX.stop(); AudioFX.play(success?'success':'fail');
    const ov = document.getElementById('resultOverlay');
    document.getElementById('resultTitle').textContent = success? '🎉 생존 성공!' : '💀 GAME OVER';
    document.getElementById('resultReason').textContent = reason;
    document.getElementById('resultStats').innerHTML =
      '<div class="resultStat">통근 스트레스: <b>'+Math.round(G.stress)+'</b></div>'+
      '<div class="resultStat">명예: <b>'+Math.round(G.honor)+'</b> ('+honorGrade(G.honor)+')</div>'+
      '<div class="resultStat">빌런 퇴치: <b>'+G.villainsDefeated+'</b>회</div>'+
      '<div class="resultStat">선행: <b>'+G.goodDeeds+'</b>회</div>';
    ov.classList.remove('hidden');
    document.getElementById('eventOverlay').classList.add('hidden');
    setInteract('');
    UI.seatWrap.classList.remove('show');
  }

  /* ============ Reset and restart ============ */
  function clearDynamicObjects(){
    clearEnvironmentHazards();
    npcs.forEach(n=>{ destroyCharacterModel(n.mesh); scene.remove(n.mesh); }); npcs=[];
    villains.forEach(v=>{ destroyCharacterModel(v.mesh); scene.remove(v.mesh); if(v.zoneMesh) scene.remove(v.zoneMesh); }); villains=[];
    seats.forEach(s=>{
      s.occupied=false; s.occupant=null;
      s.captureProgress=0; s.npcProgress=0; s.npcClaimantRef=null;
      s.reservedFor=null; s.reservedTimer=0;
      s.mesh.scale.set(1,1,1);
      s.mesh.material.emissive.setHex(0x000000);
      s.highlight.material.opacity=0;
    });
    handles.forEach(h=>{ h.occupied=false; h.occupant=null; });
    exitMarker.material.opacity = 0.0;
    VisualFX.clear();
  }

  function startNewGame(){
    AudioFX.ensure();
    AudioFX.start();
    // 오버레이 정리
    document.getElementById('startScreen').classList.add('hidden');
    document.getElementById('resultOverlay').classList.add('hidden');
    document.getElementById('eventOverlay').classList.add('hidden');
    if (window.PhoneMiniGames) PhoneMiniGames.reset();
    clearDynamicObjects();
    // 상태 초기화 (좌석 선택/hover/경쟁 상태 포함)
    resetGameData();
    resetCenterMessages();
    // 입력 초기화
    for (const k in keys) keys[k]=false;
    leftMouseDown=false;
    G.pointerHeld=false;
    G.hoveredSeat=null;
    UI.seatWrap.classList.remove('show');
    UI.seatFill.style.width='0%';
    if (UI.seatRivalFill) UI.seatRivalFill.style.width='0%';
    // 플레이어 초기화
    setPosture(Posture.STANDING);
    player.scale.set(1,1,1);
    player.rotation.y=0;
    if (player.userData.shoulderPivot) player.userData.shoulderPivot.rotation.z = 0;
    if (player.userData.handPivot) player.userData.handPivot.rotation.z = 0;
    // 승객 재생성 (승강장에서 대기)
    spawnPassengers();
    ensurePlayerSafetyResources();
    spawnStaticStressZone();
    G.timeLeft = BALANCE.stageDuration;
    enterState(GameState.BOARDING);
  }

  /* ============ Camera follow (넓어진 차량에 맞춰 조정) ============ */
  function updateCamera(dt){
    const p = player.position;
    let sx=0, sz=0;
    if (G.shake>0){ G.shake-=dt*1.5; const s=Math.max(0,G.shake);
      sx=(Math.random()-0.5)*s; sz=(Math.random()-0.5)*s; }
    const camX = THREE.MathUtils.clamp(p.x, (CAR.playerXMin || CAR.xMin)+1.7, (CAR.playerXMax || CAR.xMax)-1.7);
    const tx = camX + sx;
    camera.position.x += (tx - camera.position.x)*Math.min(1,dt*4);
    camera.position.y = 11.5; // initScene()과 동일 — 문쪽 벽 근처 캐릭터가 벽에 가려 안 보이던 문제 보완
    camera.position.z = 7.5 + sz;
    camera.lookAt(camX, 0.8, p.z*0.3);
  }

  /* ============ Animation loop ============ */
  function animate(){
    requestAnimationFrame(animate);
    let realDt = clock.getDelta();
    if (realDt>0.05) realDt=0.05; // 탭 비활성 등으로 큰 dt 방지
    if (window.PhoneMiniGames) PhoneMiniGames.update(realDt);
    const dt = G.phoneOpen ? realDt*BALANCE.phoneWorldTimeScale : realDt;

    // READY(시작 화면) 상태에서는 플레이어/NPC/타이머/이벤트가 절대 진행되지 않음
    if (G.state!==GameState.READY && G.state!==GameState.CLEAR && G.state!==GameState.GAME_OVER){
      updatePlayer(dt);
      updateSeatIntent(dt);   // 좌석 도착 판정 / 경쟁 진행 / 게이지 표시
      resolveNPCPush(dt);
      updateStates(dt);
    }
    if (window.GameModules && window.GameModules.CharacterAssets) window.GameModules.CharacterAssets.updateAll(dt);
    updateDoors(dt);
    updateSeatHighlights();
    VisualFX.update(dt);
    updateCamera(dt);
    updateMovingExterior(dt);

    // 중앙 메시지 페이드
    if (centerTimer>0){ centerTimer-=dt; if(centerTimer<=0){ advanceCenterQueue(); } }

    updateHUD();
    renderer.render(scene, camera);
  }

  /* ============ 마우스 포인터 → 월드 좌표 ============ */
  let _pointerHit = null;

  function updatePointerFromEvent(e){
    if (!raycaster || !camera) return;
    if (!_pointerHit) _pointerHit = new THREE.Vector3();
    const rect = renderer.domElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    pointerNDC.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointerNDC.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointerNDC, camera);
    if (raycaster.ray.intersectPlane(groundPlane, _pointerHit)){
      G.pointerWorld.x = _pointerHit.x;
      G.pointerWorld.z = _pointerHit.z;
      G.pointerWorld.valid = true;
    } else {
      G.pointerWorld.valid = false;
    }
  }

  // 1순위: 클릭 가능한 좌석
  function pickSeatUnderPointer(){
    if (!seatPickables.length) return null;
    const hits = raycaster.intersectObjects(seatPickables, false);
    for (let i=0;i<hits.length;i++){
      const seat = hits[i].object.userData.seatRef;
      if (seat) return seat;
    }
    return null;
  }

  // 2순위: 클릭 가능한 빌런
  // 빌런 메시(entities.js/scene.js)는 원본 그대로 두기 위해, 레이캐스트 대신
  // "포인터가 가리키는 바닥 좌표"와 빌런 위치의 거리로 판정한다.
  function pickVillainUnderPointer(){
    if (!G.pointerWorld.valid) return null;
    let best=null, bd=BALANCE.villainClickRadius;
    villains.forEach(v=>{
      if (v.defeated) return;
      const d = Math.hypot(v.x-G.pointerWorld.x, v.z-G.pointerWorld.z);
      if (d<bd){ bd=d; best=v; }
    });
    return best;
  }

  function updateHoveredSeat(){
    if (!isWorldInputAllowed()){ G.hoveredSeat=null; return; }
    const seat = pickSeatUnderPointer();
    G.hoveredSeat = (seat && !seat.occupied) ? seat : null;
  }

  /* ============ Input ============ */
  function onKeyDown(e){
    const k = e.key.toLowerCase();
    if (k==='p' && window.PhoneMiniGames){
      e.preventDefault();
      PhoneMiniGames.toggle();
      return;
    }
    if (G.phoneOpen && window.PhoneMiniGames){
      e.preventDefault();
      PhoneMiniGames.keyDown(k);
      return;
    }
    // 시작/결과 화면에서는 게임 입력을 완전히 차단
    if (G.state===GameState.READY || G.state===GameState.CLEAR || G.state===GameState.GAME_OVER) return;

    // 이벤트 모달 중 1/2 선택
    if (G.state===GameState.EVENT){
      if (k==='1'){ resolveYield(1); return; }
      if (k==='2'){ resolveYield(2); return; }
      return; // 그 외 입력 차단
    }
    if (keys[k]) { return; } // 연타만 인정 (누르고 있어도 반복 입력되지 않음)
    keys[k]=true;

    // SPACE: 실제 자리 경쟁이 진행 중일 때만 게이지가 오른다.
    if (k===' '){
      e.preventDefault();
      pressSeatCapture();
      return;
    }
    if (k==='e'){ handleInteractKey(); }
    if (k==='f'){ tryBagAttack(); }
  }
  function onKeyUp(e){ keys[e.key.toLowerCase()]=false; }

  /* 좌클릭 판정 순서: 좌석 → 빌런 → 바닥
     캔버스에서만 받으므로 HTML 버튼/HUD 클릭은 게임 입력이 되지 않는다. */
  function onCanvasPointerDown(e){
    if (e.button!==0) return;
    if (!isWorldInputAllowed()) return;
    e.preventDefault();
    updatePointerFromEvent(e);

    const seat = pickSeatUnderPointer();
    if (seat){ handleSeatClick(seat); return; }

    const villain = pickVillainUnderPointer();
    if (villain){
      tryBagAttack();
      G.pointerHeld = true; leftMouseDown = true;
      return;
    }
    handleGroundClick();
  }

  function onPointerMove(e){
    updatePointerFromEvent(e);
    updateHoveredSeat();
  }
  function onPointerUp(e){
    if (e && e.button!==undefined && e.button!==0) return;
    G.pointerHeld=false; leftMouseDown=false;
  }
  function onBlur(){
    for(const k in keys) keys[k]=false;
    G.pointerHeld=false; leftMouseDown=false; G.hoveredSeat=null;
  }

  function onResize(){
    camera.aspect = window.innerWidth/window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }

  /* ============ Bootstrap (이벤트 리스너 1회만 등록) ============ */
  function bindEventsOnce(){
    if (bindEventsOnce._done) return; bindEventsOnce._done=true;
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    // 이동/좌석 클릭은 캔버스에서만 (HUD·버튼 클릭과 분리)
    renderer.domElement.style.touchAction = 'none';
    renderer.domElement.addEventListener('pointerdown', onCanvasPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    window.addEventListener('blur', onBlur);
    window.addEventListener('resize', onResize);
    renderer.domElement.addEventListener('contextmenu', e=>e.preventDefault());

    document.getElementById('startBtn').addEventListener('click', startNewGame);
    document.getElementById('restartBtn').addEventListener('click', startNewGame);
    document.getElementById('reloadBtn').addEventListener('click', ()=>location.reload());
    document.getElementById('choice1').addEventListener('click', ()=>{ if(G.state===GameState.EVENT) resolveYield(1); });
    document.getElementById('choice2').addEventListener('click', ()=>{ if(G.state===GameState.EVENT) resolveYield(2); });
    document.getElementById('soundToggle').addEventListener('click', e=>{
      const muted=AudioFX.toggle();
      e.currentTarget.textContent=muted?'🔇':'🔊';
      e.currentTarget.classList.toggle('muted',muted);
      e.currentTarget.setAttribute('aria-label',muted?'소리 켜기':'소리 끄기');
    });
  }

  function main(){
    // 캐릭터가 전부 즉시 생성되는 절차적 젤리빈이라(비동기 애셋 로딩 없음) 더 이상
    // 로딩 게이팅이 필요 없음 — Start 버튼은 처음부터 활성 상태(index.html 기본값).
    initScene();
    buildEnvironment();
    buildPlayer();
    resetGameData();
    bindEventsOnce();
    if (!started){ started=true; animate(); }
  }

  window.addEventListener('load', main);
