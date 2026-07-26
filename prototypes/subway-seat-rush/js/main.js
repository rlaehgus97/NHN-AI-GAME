"use strict";
/* main.js — 게임 상태 전환, 메인 루프, 입력 처리, 부트스트랩 */

  /* ============ State transitions ============ */
  function enterState(s){
    G.state = s; G.stateTimer = 0;
    if (s===GameState.BOARDING){
      openDoors();
      // 플레이어 문 앞에 배치
      player.position.set(0.4, 0, CAR.aisleZMax-0.2);
      setPosture(Posture.STANDING);
      showCenter('지하철이 도착했습니다. 탑승하세요!', false, 1.6);
    }
    else if (s===GameState.SEAT_RUSH){
      showCenter('좌석 경쟁! 빈자리로!', false, 1.4);
    }
    else if (s===GameState.TRAVELING){
      UI.seatWrap.classList.remove('show');
      closeDoors();
      // 미착석 경쟁 NPC는 통로에 정리
      showCenter('출발합니다. 45초간 생존!', false, 1.4);
    }
    else if (s===GameState.ARRIVAL){
      openDoors();
      exitMarker.material.opacity = 0.55;
      showCenter('목적지입니다. 문으로 이동하세요!', false, 2.2);
      G.arrivalTimeLeft = BALANCE.arrivalExitDuration;
      // 앉아있거나 손잡이면 자동 해제 안내(수동 E 가능) — 여기선 자동 기립
      if (G.posture===Posture.SEATED) standUpFromSeat();
      if (G.posture===Posture.HOLDING_HANDLE) releaseHandle();
    }
  }

  function openDoors(){ G.doorsOpen=true; }
  function closeDoors(){ G.doorsOpen=false; }

  function updateDoors(dt){
    const halfDoor = CAR.doorX;
    const targetL = G.doorsOpen ? -halfDoor*1.5 : -halfDoor/2;
    const targetR = G.doorsOpen ?  halfDoor*1.5 :  halfDoor/2;
    doorLeft.position.x += (targetL - doorLeft.position.x)*Math.min(1,dt*5);
    doorRight.position.x += (targetR - doorRight.position.x)*Math.min(1,dt*5);
  }

  /* ============ Main state update ============ */
  function updateStates(dt){
    G.stateTimer += dt;
    switch(G.state){
      case GameState.BOARDING: {
        // NPC 승강장→통로 진입
        npcs.forEach(n=>{ if(n.kind==='competitor' && !n.seated){
          moveNPCTo(n, n.standSpot.x, Math.min(n.standSpot.z, 0.6), dt);
        }});
        if (G.stateTimer >= BALANCE.boardingDuration){ enterState(GameState.SEAT_RUSH); }
        break;
      }
      case GameState.SEAT_RUSH: {
        updateSeatRush(dt);
        // 플레이어 착석 게이지 완료 체크는 SPACE 입력에서
        const allOccupied = seats.every(s=>s.occupied);
        if (G.stateTimer >= BALANCE.seatRushDuration || allOccupied){
          enterState(GameState.TRAVELING);
        }
        break;
      }
      case GameState.TRAVELING: {
        G.timeLeft -= dt;
        G.stageElapsed += dt;
        updateStationProgress();
        updateScriptedEvents(dt);
        updateVitals(dt);
        updateVillains(dt);
        updateNPCWander(dt);
        updateInteractPrompt();
        if (G.honor<=0 && !G._honorZeroWarned){ G._honorZeroWarned=true; }
        if (G.timeLeft<=0){ enterState(GameState.ARRIVAL); }
        break;
      }
      case GameState.EVENT: {
        // 모달 대기 — 타이머 정지, 배경 유지
        break;
      }
      case GameState.ARRIVAL: {
        G.arrivalTimeLeft -= dt;
        updateVillains(dt); // 빌런 잔여 이동만
        updateNPCWander(dt);
        updateInteractPrompt();
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

  function judgeArrival(){
    if (G.health<=0){ endGame(false,'체력이 모두 소진되었습니다.'); return; }
    if (G.honor<=0){ endGame(false,'명예가 바닥나 하차에 실패했습니다.'); return; }
    endGame(true, '무사히 목적지에 하차했습니다!');
  }

  /* ============ End game / result ============ */
  function endGame(success, reason){
    if (G.state===GameState.CLEAR || G.state===GameState.GAME_OVER) return;
    G.state = success ? GameState.CLEAR : GameState.GAME_OVER;
    const ov = document.getElementById('resultOverlay');
    document.getElementById('resultTitle').textContent = success? '🎉 생존 성공!' : '💀 GAME OVER';
    document.getElementById('resultReason').textContent = reason;
    document.getElementById('resultStats').innerHTML =
      '<div class="resultStat">남은 체력: <b>'+Math.round(G.health)+'</b></div>'+
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
    npcs.forEach(n=> scene.remove(n.mesh)); npcs=[];
    villains.forEach(v=> scene.remove(v.mesh)); villains=[];
    seats.forEach(s=>{ s.occupied=false; s.occupant=null; s.captureProgress=0; s.captureBy=null;
      s.mesh.scale.set(1,1,1); });
    handles.forEach(h=>{ h.occupied=false; h.occupant=null; });
    exitMarker.material.opacity = 0.0;
  }

  function startNewGame(){
    // 오버레이 정리
    document.getElementById('startScreen').classList.add('hidden');
    document.getElementById('resultOverlay').classList.add('hidden');
    document.getElementById('eventOverlay').classList.add('hidden');
    // 상태 초기화
    resetGameData();
    clearDynamicObjects();
    // 키 입력 초기화
    for (const k in keys) keys[k]=false;
    leftMouseDown=false;
    // 플레이어 초기화
    setPosture(Posture.STANDING);
    player.scale.set(1,1,1);
    player.position.set(0.4,0, CAR.aisleZMax-0.2);
    player.rotation.y=0;
    // 승객 재생성
    spawnPassengers();
    // 문 닫힘에서 시작 → BOARDING 진입(3초 후 열림 연출 위해 우선 닫고 살짝 뒤 open)
    G.doorsOpen=false;
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
    camera.position.y = 9;
    camera.position.z = 10 + sz;
    camera.lookAt(camX, 0.8, p.z*0.3);
  }

  /* ============ Animation loop ============ */
  function animate(){
    requestAnimationFrame(animate);
    let dt = clock.getDelta();
    if (dt>0.05) dt=0.05; // 탭 비활성 등으로 큰 dt 방지

    if (G.state!==GameState.READY && G.state!==GameState.CLEAR && G.state!==GameState.GAME_OVER){
      updatePlayer(dt);
      resolveNPCPush();
      updateStates(dt);
    }
    updateDoors(dt);
    updateCamera(dt);

    // 중앙 메시지 페이드
    if (centerTimer>0){ centerTimer-=dt; if(centerTimer<=0) UI.centerMsg.classList.remove('show'); }

    updateHUD();
    renderer.render(scene, camera);
  }

  /* ============ Input ============ */
  function onKeyDown(e){
    const k = e.key.toLowerCase();
    // 이벤트 모달 중 1/2 선택
    if (G.state===GameState.EVENT){
      if (k==='1'){ resolveYield(1); return; }
      if (k==='2'){ resolveYield(2); return; }
      return; // 그 외 입력 차단
    }
    if (keys[k]) { return; } // 반복 방지 일부
    keys[k]=true;

    if (G.state===GameState.SEAT_RUSH && k===' '){
      // 좌석 경쟁 연타
      const seat = nearestEmptySeat(player.position.x, player.position.z, 1.3);
      if (seat && G.posture===Posture.STANDING && !seat.occupied){
        seat.captureBy='player';
        seat.captureProgress = Math.min(100, seat.captureProgress + BALANCE.seatCaptureGainPerPress);
        if (seat.captureProgress>=100){ sitOnSeat(seat); showCenter('자리 차지 성공! 체력 회복', false, 1.4); }
      }
    }
    if (k==='e'){ handleInteractKey(); }
    if (k==='f'){ tryBagAttack(); }
    if (k===' ') { /* SEAT_RUSH 외에는 상호작용 예비 */ }
  }
  function onKeyUp(e){ keys[e.key.toLowerCase()]=false; }

  function onMouseDown(e){
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
    renderer.domElement.addEventListener('contextmenu', e=>e.preventDefault());

    document.getElementById('startBtn').addEventListener('click', startNewGame);
    document.getElementById('restartBtn').addEventListener('click', startNewGame);
    document.getElementById('reloadBtn').addEventListener('click', ()=>location.reload());
    document.getElementById('choice1').addEventListener('click', ()=>{ if(G.state===GameState.EVENT) resolveYield(1); });
    document.getElementById('choice2').addEventListener('click', ()=>{ if(G.state===GameState.EVENT) resolveYield(2); });
  }

  function main(){
    initScene();
    buildEnvironment();
    buildPlayer();
    resetGameData();
    bindEventsOnce();
    if (!started){ started=true; animate(); }
  }

  window.addEventListener('load', main);
