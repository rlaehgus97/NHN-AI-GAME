"use strict";
/* main.js — 게임 상태 전환, 메인 루프, 입력 처리, 부트스트랩 */

  /* ============ State transitions ============ */
  function enterState(s){
    G.state = s; G.stateTimer = 0;
    if (s===GameState.BOARDING){
      AudioFX.play('approach');
      G.doorsOpen = false;
      closeDoors();
      // 플레이어는 승강장에서 대기 (문이 열려야 탑승 가능) — 차량(전방, +z) 방향을 바라보게 함
      player.position.set(0.3, 0, CAR.platformZ + 0.3);
      player.rotation.y = 0;
      setPosture(Posture.STANDING);
      showCenter('지하철이 도착했습니다. 탑승하세요!', false, 1.6);
    }
    else if (s===GameState.SEAT_RUSH){
      G.seatsSettled=false;
      G.seatsSettledAt=0;
      showCenter('좌석 경쟁! 빈자리로!', false, 1.4);
    }
    else if (s===GameState.TRAVELING){
      document.body.classList.add('train-moving');
      UI.seatWrap.classList.remove('show');
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
      if (G.posture===Posture.SEATED) standUpFromSeat();
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
        // 1) 문 닫힌 채 대기(도착 메시지) → 2) 문 열림 → 3) 탑승 진입 → 4) 좌석 경쟁 시작
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
          npcs.forEach(n=>{if(!n.seated) applySmoothNPCSeparation(n,dt,.82);});
        }
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
        if (G.stateTimer >= BALANCE.seatRushDuration || (allOccupied && settleVisible)){
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
        updateSeatCaptureGauge(dt); // 이동 중에도 빈자리(양보받은 자리 등)는 SPACE 연타로만 앉을 수 있음
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
        // 시간 표시 재활용
        G.timeLeft = G.arrivalTimeLeft;
        break;
      }
    }
  }

  function updateStageDirector(dt){
    if (!window.GameModules) return;
    const actions = window.GameModules.director.update(dt);
    actions.forEach(action=>{
      if (action.type==='EVENT_SLOT'){
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
      const lanes=[-1.1,-0.37,0.37,1.1];
      const crowdSpots=[
        {x:-4.5,z:-.48},{x:-2.2,z:.48},{x:0,z:-.48},{x:2.2,z:.48},{x:4.5,z:-.48}
      ];
      for(let i=0;i<boardingCount;i++){
        const x=lanes[i%lanes.length];
        const row=Math.floor(i/lanes.length);
        const n=spawnNPC('competitor',x,CAR.platformZ+0.45-row*0.72);
        n.boardTarget={x,z:CAR.farWallZ+0.25};
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
    clearDynamicObjects();
    // 상태 초기화
    resetGameData();
    resetCenterMessages();
    // 키 입력 초기화
    for (const k in keys) keys[k]=false;
    leftMouseDown=false;
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

  /* ============ Camera follow ============ */
  function updateCamera(dt){
    const p = player.position;
    let sx=0, sz=0;
    if (G.shake>0){ G.shake-=dt*1.5; const s=Math.max(0,G.shake);
      sx=(Math.random()-0.5)*s; sz=(Math.random()-0.5)*s; }
    const camX = THREE.MathUtils.clamp(p.x, -3.5, 3.5);
    const tx = camX + sx;
    camera.position.x += (tx - camera.position.x)*Math.min(1,dt*4);
    camera.position.y = 11.5; // initScene()과 동일 — 문쪽 벽 근처 캐릭터가 벽에 가려 안 보이던 문제 보완
    camera.position.z = 7.5 + sz;
    camera.lookAt(camX, 0.8, p.z*0.3);
  }

  /* ============ Animation loop ============ */
  function animate(){
    requestAnimationFrame(animate);
    let dt = clock.getDelta();
    if (dt>0.05) dt=0.05; // 탭 비활성 등으로 큰 dt 방지

    // READY(시작 화면) 상태에서는 플레이어/NPC/타이머/이벤트가 절대 진행되지 않음
    if (G.state!==GameState.READY && G.state!==GameState.CLEAR && G.state!==GameState.GAME_OVER){
      updatePlayer(dt);
      resolveNPCPush(dt);
      updateStates(dt);
    }
    if (window.GameModules && window.GameModules.CharacterAssets) window.GameModules.CharacterAssets.updateAll(dt);
    updateDoors(dt);
    VisualFX.update(dt);
    updateCamera(dt);

    // 중앙 메시지 페이드
    if (centerTimer>0){ centerTimer-=dt; if(centerTimer<=0){ advanceCenterQueue(); } }

    updateHUD();
    renderer.render(scene, camera);
  }

  /* ============ Input ============ */
  function onKeyDown(e){
    // 시작 화면(READY)에서는 모든 입력을 완전히 차단
    if (G.state===GameState.READY) return;

    const k = e.key.toLowerCase();
    // 이벤트 모달 중 1/2 선택
    if (G.state===GameState.EVENT){
      if (k==='1'){ resolveYield(1); return; }
      if (k==='2'){ resolveYield(2); return; }
      return; // 그 외 입력 차단
    }
    if (keys[k]) { return; } // 반복 방지 일부
    keys[k]=true;

    if ((G.state===GameState.SEAT_RUSH || G.state===GameState.TRAVELING) && k===' '){
      // 좌석은 항상 SPACE 연타로만 앉을 수 있음(E로 즉시 앉는 경로 없음).
      // SEAT_RUSH에서는 경쟁 NPC 게이지와 동시에 채워지고, TRAVELING에서는(예: 양보받은 좌석)
      // 경쟁자 없이 게이지만 채우면 되지만 동일하게 SPACE 입력이 필요하다.
      const seat = nearestEmptySeat(player.position.x, player.position.z, 1.3);
      if (seat && G.posture===Posture.STANDING && G.risingTimer<=0 && !seat.occupied){
        if (window.GameModules.SeatCompetition.playerPress(
          seat, BALANCE.seatCaptureGainPerPress
        )){
          sitOnSeat(seat, '자리 차지 성공!');
        }
      }
    }
    if (k==='e'){ handleInteractKey(); }
    if (k==='f'){ tryBagAttack(); }
  }
  function onKeyUp(e){ keys[e.key.toLowerCase()]=false; }

  function onMouseDown(e){
    if (G.state===GameState.READY) return;
    if (e.button===0){ leftMouseDown=true;
      if (G.state===GameState.TRAVELING || G.state===GameState.ARRIVAL) tryBagAttack();
    }
  }
  function onMouseUp(e){ if(e.button===0) leftMouseDown=false; }
  function onBlur(){ for(const k in keys) keys[k]=false; leftMouseDown=false; }

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
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('blur', onBlur);
    window.addEventListener('resize', onResize);
    // 좌클릭 방향 조준 방지용: canvas 우클릭 메뉴 차단
    // ---- 임시 진단 기능: 우클릭한 지점의 3D 물체 이름을 화면에 표시(정체불명 오브젝트 찾기용) ----
    renderer.domElement.addEventListener('contextmenu', e=>{
      e.preventDefault();
      const rect = renderer.domElement.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((e.clientX-rect.left)/rect.width)*2-1,
        -((e.clientY-rect.top)/rect.height)*2+1
      );
      const ray = new THREE.Raycaster();
      ray.setFromCamera(ndc, camera);
      const hits = ray.intersectObjects(scene.children, true);
      if (hits.length){
        const obj = hits[0].object;
        const chain = [];
        for (let o=obj; o; o=o.parent){ if (o.name) chain.unshift(o.name); }
        console.log('[진단] 우클릭 물체:', chain.join(' > '), obj);
        showCenter('진단: ' + (chain.join(' > ') || '(이름 없음)'), false, 4);
      } else {
        showCenter('진단: 클릭 위치에 물체 없음', false, 2);
      }
    });

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
