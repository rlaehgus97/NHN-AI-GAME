"use strict";
/* ai.js — 좌석 선택/경쟁 로직, NPC AI, 빌런 AI */

  /* ============ 좌석 선택 & 자리 경쟁 ============
     [일반 착석]  빈 좌석 클릭 → 좌석 앞으로 자동 이동 → 도착하면 SPACE 없이 즉시 착석
     [자리 경쟁]  같은 좌석을 노리는 NPC가 좌석 앞에 함께 있을 때만 발생.
                  이때만 게이지가 표시되고, 플레이어는 SPACE 연타로 100을 먼저 채워야 한다.
  ================================================================================ */

  // 해당 좌석을 실제로 목표로 삼고 있는 NPC 중 가장 가까운 한 명
  function findSeatRival(seat){
    if (!seat) return null;
    let best=null, bd=Infinity;
    npcs.forEach(n=>{
      if (n.kind!=='competitor' || n.seated || n.disembarking || n.isYielder) return;
      if (n.targetSeat!==seat) return;
      const d = dist2(n.x, n.z, seat.interactionPoint.x, seat.interactionPoint.z);
      if (d<bd){ bd=d; best=n; }
    });
    return best;
  }

  // 플레이어가 이 좌석을 목표로 삼고, 경쟁 가능 거리 안까지 다가와 있는가
  function isPlayerContestingSeat(seat){
    if (G.targetSeat!==seat) return false;
    if (G.posture!==Posture.STANDING) return false;
    const d = Math.hypot(player.position.x-seat.interactionPoint.x,
                         player.position.z-seat.interactionPoint.z);
    return d <= BALANCE.seatCompetitionRange;
  }

  function beginSeatCompetition(seat, npc){
    if (!seat || !npc) return;
    if (G.seatCompetitionActive && G.contestedSeat===seat) return;
    if (G.seatCompetitionActive) endSeatCompetition();
    G.seatCompetitionActive = true;
    G.contestedSeat = seat;
    G.autoMovingToSeat = false;      // 경쟁 중에는 이동 대신 SPACE 연타
    G.targetSeat = seat;
    seat.npcClaimantRef = npc;
    seat.captureProgress = 0;
    seat.npcProgress = 0;
    npc.seatApproachPhase = 'CONTEST';
    AudioFX.play('warning');
    showCenter('경쟁자가 같은 자리를 노립니다! SPACE 연타', true, 1.6);
  }

  // 경쟁 상태만 종료 (좌석 선택 자체는 남을 수 있음)
  function endSeatCompetition(){
    const seat = G.contestedSeat;
    if (seat){
      seat.captureProgress = 0;
      seat.npcProgress = 0;
      if (seat.npcClaimantRef){
        if (seat.npcClaimantRef.seatApproachPhase==='CONTEST') seat.npcClaimantRef.seatApproachPhase=null;
        seat.npcClaimantRef = null;
      }
    }
    G.seatCompetitionActive = false;
    G.contestedSeat = null;
    if (UI && UI.seatWrap) UI.seatWrap.classList.remove('show');
  }

  // 좌석 선택 + 자동 이동 + 경쟁 상태를 한 번에 초기화 (취소 조건 공통 처리)
  function clearPlayerSeatTarget(){
    if (G.targetSeat){
      G.targetSeat.captureProgress = 0;
      if (G.targetSeat.npcClaimantRef && G.targetSeat!==G.contestedSeat){
        G.targetSeat.npcProgress = 0;
      }
    }
    G.targetSeat = null;
    G.autoMovingToSeat = false;
    endSeatCompetition();
  }

  // 실제 경쟁이 진행 중일 때만 게이지를 그린다.
  function updateSeatCaptureGauge(){
    const seat = G.seatCompetitionActive ? G.contestedSeat : null;
    if (seat && G.posture===Posture.STANDING){
      if (UI.seatLabel) UI.seatLabel.textContent = '경쟁자가 같은 자리를 노립니다! SPACE 연타';
      UI.seatWrap.classList.add('show');
      UI.seatFill.style.width = Math.min(100, seat.captureProgress)+'%';
      if (UI.seatRivalFill) UI.seatRivalFill.style.width = Math.min(100, seat.npcProgress)+'%';
    } else {
      UI.seatWrap.classList.remove('show');
    }
  }

  // SPACE 입력 반영 (실제 경쟁 중일 때만 동작)
  function pressSeatCapture(){
    if (!G.seatCompetitionActive || !G.contestedSeat) return;
    if (G.posture!==Posture.STANDING || G.risingTimer>0) return;
    const seat = G.contestedSeat;
    const gain = BALANCE.seatCaptureGainPerPress;
    if (window.GameModules && window.GameModules.SeatCompetition){
      window.GameModules.SeatCompetition.playerPress(seat, gain);
    } else {
      seat.captureProgress = Math.min(100, seat.captureProgress + gain);
    }
  }

  // 경쟁 진행 / 승패 판정
  function updateSeatCompetition(dt){
    if (!G.seatCompetitionActive) return;
    const seat = G.contestedSeat;
    const rival = seat ? seat.npcClaimantRef : null;

    if (!seat || seat.occupied || !rival || rival.seated || rival.disembarking ||
        G.posture!==Posture.STANDING){
      endSeatCompetition();
      return;
    }
    // 플레이어가 멀어지면 경쟁 포기 (NPC가 그대로 좌석을 차지하러 감)
    const pd = Math.hypot(player.position.x-seat.interactionPoint.x,
                          player.position.z-seat.interactionPoint.z);
    if (pd > BALANCE.seatCompetitionCancelRange){
      clearPlayerSeatTarget();
      return;
    }

    // 승패 판정은 감쇠를 적용하기 전에 먼저 확인한다(연타로 100을 채운 프레임을 놓치지 않도록).
    if (seat.captureProgress>=100){
      // 플레이어 승리
      rival.targetSeat = null;
      rival.seatApproachPhase = null;
      rival.avoidSeatTimer = 0.5;   // 잠시 뒤 다른 빈 좌석을 다시 탐색
      endSeatCompetition();
      sitOnSeat(seat, '경쟁에서 이겼습니다! 자리 차지 성공');
      return;
    }
    if (seat.npcProgress>=100){
      // NPC 승리
      endSeatCompetition();
      G.targetSeat = null;
      G.autoMovingToSeat = false;
      npcSit(rival, seat);
      showCenter('자리를 빼앗겼습니다. 다른 빈자리를 찾으세요.', true, 1.8);
      return;
    }

    seat.captureProgress = Math.max(0, seat.captureProgress - BALANCE.seatCaptureDecayPerSecond*dt);
    seat.npcProgress += (rival.captureRate || BALANCE.npcCaptureRatePerSecond) * dt;
  }

  /* 매 프레임: 목표 좌석 유효성 검사 → 경쟁 갱신 → 도착 시 착석 판정 → 게이지 표시 */
  function updateSeatIntent(dt){
    if (!isWorldInputAllowed()){
      if (G.targetSeat || G.seatCompetitionActive) clearPlayerSeatTarget();
      updateSeatCaptureGauge();
      return;
    }

    // 목표 좌석이 다른 승객에게 점유되면 자동 이동을 취소한다.
    if (G.targetSeat && G.targetSeat.occupied){
      const takenByNPC = G.targetSeat.occupant!=='player';
      clearPlayerSeatTarget();
      if (takenByNPC) showCenter('자리를 빼앗겼습니다. 다른 빈자리를 찾으세요.', true, 1.6);
    }
    if (G.targetSeat && G.targetSeat.reservedFor &&
        G.targetSeat.reservedFor!=='player' && G.targetSeat.reservedFor!=='player-safety'){
      clearPlayerSeatTarget();
    }
    if (G.posture!==Posture.STANDING && (G.targetSeat || G.seatCompetitionActive)){
      clearPlayerSeatTarget();
    }

    updateSeatCompetition(dt);

    // 좌석 앞 도착 판정 → 경쟁자가 없으면 즉시 착석
    const seat = G.targetSeat;
    if (seat && !G.seatCompetitionActive && G.posture===Posture.STANDING && G.risingTimer<=0){
      const d = Math.hypot(player.position.x-seat.interactionPoint.x,
                           player.position.z-seat.interactionPoint.z);
      if (d <= BALANCE.seatArriveDistance){
        const rival = findSeatRival(seat);
        const rivalClose = rival && Math.hypot(rival.x-seat.interactionPoint.x,
                                               rival.z-seat.interactionPoint.z) <= BALANCE.seatCompetitionRange;
        if (rivalClose){
          beginSeatCompetition(seat, rival);
        } else if (!seat.occupied){
          sitOnSeat(seat, '착석했습니다');
        }
      }
    }

    updateSeatCaptureGauge();
  }

  /* ============ NPC 승객 행동 ============ */
  function updateUnseatedCompetitors(dt){
    dedupeSeatTargets();
    npcs.forEach(n=>{
      // 감사 태그(빌런 퇴치/선행 보상 연출) 일정 시간 후 제거
      if (n.thankTagTimer>0){
        n.thankTagTimer -= dt;
        if (n.thankTagTimer<=0 && n.thankTag){ n.mesh.remove(n.thankTag); n.thankTag=null; }
      }
      if (n.kind!=='competitor' || n.seated || n.isYielder || n.disembarking) return;

      // 중간역 신규 승객은 문을 통해 객차 중앙까지 들어온 뒤 좌석을 찾는다.
      if(n.boardingAtStation){
        if(n.boardingDelay>0){
          n.boardingDelay=Math.max(0,n.boardingDelay-dt);
          return;
        }
        const entered=window.GameModules
          ? window.GameModules.MovementSystem.moveTowards(n,n.boardTarget,dt,{
              speed:n.moveSpeed||2.6,stopDistance:.15,
              bounds:{xMin:-CAR.doorX+.15,xMax:CAR.doorX-.15,zMin:CAR.platformZ-2,zMax:CAR.aisleZMax}
            })
          : moveNPCTo(n,n.boardTarget.x,n.boardTarget.z,dt);
        if(entered){
          n.boardingAtStation=false;
          const slot=ensureIdleTarget(n);
          n.wanderTX=slot.x;
          n.wanderTZ=slot.z;
          n.wanderTimer=0;
        }
        return;
      }

      // 초기 승객은 상태 전환 후에도 기존 진입 경로를 끝까지 이어간다.
      if(n.initialSettling && n.entryTarget){
        const settled=moveNPCTo(n,n.entryTarget.x,n.entryTarget.z,dt);
        applySmoothNPCSeparation(n,dt,.95);
        if(!settled) return;
        n.initialSettling=false;
      }

      // 빌런 회피 중에는 좌석/대기점 이동을 동시에 적용하지 않는다.
      if(n.avoidVillainTarget){
        if (n.targetSeat && G.contestedSeat===n.targetSeat) endSeatCompetition();
        n.targetSeat=null;
        n.seatApproachPhase=null;
        const escaped=moveNPCTo(n,n.avoidVillainTarget.x,n.avoidVillainTarget.z,dt);
        if(escaped && n.avoidVillainTimer<=0){
          n.avoidVillainTarget=null;
          n.fleeingVillain=false;
        }
        return;
      }

      if(n.avoidSeatTimer>0){
        n.avoidSeatTimer=Math.max(0,n.avoidSeatTimer-dt);
        n.targetSeat=null;
      } else if (!n.targetSeat || n.targetSeat.occupied ||
                 (n.targetSeat.reservedFor && n.targetSeat!==G.contestedSeat)){
        n.fleeingVillain=false;
        n.targetSeat = pickTargetSeatForNPC(n);
      }
      const s = n.avoidSeatTimer>0 ? null : n.targetSeat;

      if (s){
        n.idleTarget=null;
        // 경쟁 중인 좌석이면 좌석 앞에서 대기하며 게이지 승부를 기다린다.
        if (G.seatCompetitionActive && G.contestedSeat===s && s.npcClaimantRef===n){
          moveNPCToSeat(n,s,dt);
        } else {
          const arrived = moveNPCToSeat(n,s,dt);
          if (arrived && !s.occupied && !s.reservedFor){
            if (isPlayerContestingSeat(s)) beginSeatCompetition(s,n);
            else npcSit(n, s);
          }
        }
      } else {
        // 갈 수 있는 좌석이 없으면 개체별 대기 슬롯 주변을 움직여 한곳에 뭉치지 않게 한다.
        const slot = ensureIdleTarget(n);
        n.wanderTX=slot.x; n.wanderTZ=slot.z;
        const arrived=moveNPCToIdleSlot(n,slot,dt);
        n.mesh.position.y=arrived ? 0 : Math.abs(Math.sin(performance.now()*0.011+n.wobble))*0.035;
      }

      applySmoothNPCSeparation(n,dt,1.0);
    });

    updateNPCSeatPoses();
  }

  // 좌석 하나에는 경쟁 NPC 한 명만: 중복 목표는 가장 가까운 NPC만 남기고 나머지는 재탐색
  function dedupeSeatTargets(){
    const owner = new Map();
    npcs.forEach(n=>{
      if (n.kind!=='competitor' || n.seated || n.disembarking || !n.targetSeat) return;
      const seat = n.targetSeat;
      const d = dist2(n.x,n.z,seat.interactionPoint.x,seat.interactionPoint.z);
      // 경쟁 중인 좌석의 지정 경쟁자는 무조건 유지한다.
      if (seat.npcClaimantRef && seat.npcClaimantRef!==n && G.contestedSeat===seat){
        n.targetSeat=null; n.seatApproachPhase=null; return;
      }
      const prev = owner.get(seat);
      if (!prev){ owner.set(seat,{npc:n,d}); return; }
      if (d < prev.d){ prev.npc.targetSeat=null; prev.npc.seatApproachPhase=null; owner.set(seat,{npc:n,d}); }
      else { n.targetSeat=null; n.seatApproachPhase=null; }
    });
  }

  // 상태 전환이나 군중 이동이 있어도 모든 착석 NPC를 동일한 기준점에 고정한다.
  function updateNPCSeatPoses(){
    npcs.forEach(n=>{
      if(!n.seated || !n.seatRef) return;
      placeCharacterOnSeat(n.mesh,n.seatRef);
      n.x=n.mesh.position.x;
      n.z=n.mesh.position.z;
    });
  }

  function applySmoothNPCSeparation(n,dt,minDistance){
    let pushX=0,pushZ=0;
    npcs.forEach(m=>{
      if(m===n || m.seated || m.disembarking) return;
      let dx=n.x-m.x,dz=n.z-m.z;
      let d=Math.hypot(dx,dz);
      if(d<.001){
        dx=(n.standingIndex%2===0?1:-1);dz=(n.standingIndex%3===0?.35:-.35);d=Math.hypot(dx,dz);
      }
      if(d<minDistance){const strength=(minDistance-d)/minDistance;pushX+=dx/d*strength;pushZ+=dz/d*strength;}
    });
    const length=Math.hypot(pushX,pushZ);
    if(length<=.001) return;
    const step=Math.min(.6*dt,length*.08);
    n.x=THREE.MathUtils.clamp(n.x+pushX/length*step,CAR.xMin,CAR.xMax);
    n.z=THREE.MathUtils.clamp(n.z+pushZ/length*step,CAR.aisleZMin,CAR.aisleZMax);
    n.mesh.position.x=n.x;n.mesh.position.z=n.z;
  }

  // 빈 좌석과 서 있는 경쟁자가 함께 있으면 1초 안에 가장 가까운 NPC가 좌석을 채우게 한다.
  // (플레이어가 이미 노리는 좌석과 경쟁 중인 좌석은 대상에서 제외한다)
  function ensureEmptySeatGetsFilled(dt){
    const empty=seats.find(s=>!s.occupied && !s.reservedFor &&
      s!==G.targetSeat && s!==G.contestedSeat &&
      !npcs.some(n=>!n.seated && n.targetSeat===s));
    const candidates=npcs.filter(n=>n.kind==='competitor' && !n.seated &&
      !n.disembarking && !n.boardingAtStation && !n.avoidVillainTarget &&
      n.avoidSeatTimer<=0 &&
      (!n.targetSeat || n.targetSeat.occupied || n.targetSeat.reservedFor));
    if(!empty || !candidates.length){
      G.emptySeatFillTimer=0;
      return;
    }
    G.emptySeatFillTimer+=dt;
    let closest=candidates[0],best=Infinity;
    candidates.forEach(n=>{
      const d=dist2(n.x,n.z,empty.interactionPoint.x,empty.interactionPoint.z);
      if(d<best){best=d;closest=n;}
    });
    closest.avoidSeatTimer=0;
    closest.targetSeat=empty;
    // Never snap a distant passenger into the seat. updateUnseatedCompetitors
    // performs the walk and calls npcSit only after reaching the interaction point.
    if(G.emptySeatFillTimer>=1.0) G.emptySeatFillTimer=0;
  }

  function ensureIdleTarget(n){
    if(n.idleTarget) return n.idleTarget;
    const candidates=[];
    for(let row=0;row<2;row++){
      for(let column=0;column<11;column++){
        candidates.push({
          x:THREE.MathUtils.clamp(-8.0+column*1.6+row*0.8,CAR.xMin+0.4,CAR.xMax-0.4),
          z:row===0?-0.75:0.75
        });
      }
    }
    const claimed=npcs.filter(o=>o!==n && o.idleTarget).map(o=>o.idleTarget);
    const free=candidates.filter(slot=>!claimed.some(used=>Math.hypot(slot.x-used.x,slot.z-used.z)<0.8));
    const pool=free.length ? free : candidates;
    pool.sort((a,b)=>dist2(n.x,n.z,a.x,a.z)-dist2(n.x,n.z,b.x,b.z));
    n.idleTarget={x:pool[0].x,z:pool[0].z};
    return n.idleTarget;
  }

  function moveNPCToSeat(n,seat,dt){
    const aisleEntryZ=THREE.MathUtils.clamp(n.z,CAR.aisleZMin+0.12,CAR.aisleZMax-0.12);
    if(n.z<CAR.aisleZMin || n.z>CAR.aisleZMax){
      n.seatApproachPhase='ENTER_AISLE';
      moveNPCTo(n,n.x,aisleEntryZ,dt);
      return false;
    }
    if(Math.abs(n.x-seat.interactionPoint.x)>0.22){
      n.seatApproachPhase='ALONG_AISLE';
      moveNPCTo(n,seat.interactionPoint.x,0,dt);
      return false;
    }
    n.seatApproachPhase='TO_SEAT';
    return moveNPCTo(n,seat.interactionPoint.x,seat.interactionPoint.z,dt);
  }

  function moveNPCToIdleSlot(n,slot,dt){
    const dx=slot.x-n.x,dz=slot.z-n.z;
    const distance=Math.hypot(dx,dz);
    if(distance<0.08){
      n.mesh.position.y=0;
      // 정지한 NPC가 맞은편 NPC를 계속 응시하지 않도록 객차 진행 방향을 바라본다.
      n.mesh.rotation.y=0;
      return true;
    }
    const step=Math.min(distance,Math.max(1.15,n.wanderSpeed||0)*dt);
    n.x+=dx/distance*step;
    n.z+=dz/distance*step;
    n.mesh.position.x=n.x;
    n.mesh.position.z=n.z;
    n.mesh.rotation.y=Math.atan2(dx,dz);
    return false;
  }

  // SEAT_RUSH 단계에서 매 프레임 호출되는 NPC 갱신
  function updateSeatRush(dt){
    updateUnseatedCompetitors(dt);
  }

  // 좌석 경쟁 종료 직전에는 좌표를 순간 변경하지 않고 목표만 확정한다.
  // 플레이어가 노리는 좌석과 경쟁 중인 좌석은 강제 배정에서 제외한다.
  function settleRemainingSeats(){
    const unseated=npcs.filter(n=>n.kind==='competitor' && !n.seated && !n.disembarking);
    const playerHeld=new Set();
    if(G.targetSeat && !G.targetSeat.occupied) playerHeld.add(G.targetSeat);
    if(G.contestedSeat) playerHeld.add(G.contestedSeat);

    const claimed=new Set(unseated
      .filter(n=>n.targetSeat && !n.targetSeat.occupied && !n.targetSeat.reservedFor)
      .map(n=>n.targetSeat));
    unseated.forEach(n=>{
      if(n.avoidSeatTimer>0 || (n.targetSeat && claimed.has(n.targetSeat))) return;
      const available=seats
        .filter(s=>!s.occupied && !s.reservedFor && !claimed.has(s) && !playerHeld.has(s))
        .sort((a,b)=>dist2(n.x,n.z,a.interactionPoint.x,a.interactionPoint.z)-
          dist2(n.x,n.z,b.interactionPoint.x,b.interactionPoint.z));
      if(available[0]){n.targetSeat=available[0];claimed.add(available[0]);}
    });
  }

  // 좌석별로 이미 그 좌석을 노리는 NPC 수를 페널티로 고려해, 특정 좌석에 몰리지 않게 분산시킴
  function pickTargetSeatForNPC(n){
    let best=null, bestScore=Infinity;
    seats.forEach(s=>{
      if (s.occupied) return;
      if (s.reservedFor) return;                  // 예약된 좌석(빌런 퇴치/선행 보상)은 노리지 않음
      const targeting = npcs.filter(o=> o!==n && !o.seated && o.targetSeat===s).length;
      if(targeting>0) return;                      // 한 좌석에는 한 NPC만 접근하도록 목표를 독점
      const d = Math.sqrt(dist2(n.x,n.z,s.interactionPoint.x,s.interactionPoint.z));
      // 플레이어가 이미 노리는 좌석은 약간의 페널티를 줘서 모든 NPC가 몰리지 않게 한다.
      const score = d + (s===G.targetSeat ? 2.2 : 0);
      if (score<bestScore){ bestScore=score; best=s; }
    });
    return best;
  }

  function npcSit(n, s){
    if (!n || !s) return;
    if (s.occupied || s.reservedFor) return; // 예약된 좌석(빌런 퇴치 보상)은 NPC가 앉을 수 없음
    if (window.GameModules && !window.GameModules.SeatCompetition.npcArrived(s,n)) return;
    s.occupied=true; s.occupant=n; n.seated=true; n.seatRef=s;
    n.seatApproachPhase=null;
    n.targetSeat=null;
    s.captureProgress=0; s.npcProgress=0; s.npcClaimantRef=null;
    placeCharacterOnSeat(n.mesh, s);
    n.x=n.mesh.position.x;
    n.z=n.mesh.position.z;
  }

  function moveNPCTo(n, tx, tz, dt){
    if (window.GameModules){
      return window.GameModules.MovementSystem.moveTowards(n,{x:tx,z:tz},dt,{
        speed:n.moveSpeed||2.6,
        stopDistance:0.15,
        bounds:{xMin:CAR.xMin,xMax:CAR.xMax,zMin:CAR.platformZ,zMax:CAR.aisleZMax}
      });
    }
    const dx=tx-n.x, dz=tz-n.z; const d=Math.hypot(dx,dz);
    if (d<0.15) return true;
    const spd = n.moveSpeed || 2.6;
    n.x += dx/d*spd*dt; n.z += dz/d*spd*dt;
    n.mesh.position.set(n.x, Math.abs(Math.sin(performance.now()*0.01+n.wobble))*0.04, n.z);
    n.mesh.rotation.y = Math.atan2(dx,dz);
    return false;
  }

  // 착석하지 않은 NPC들이 통로를 자유롭게 배회 (ARRIVAL 단계에서 사용)
  function updateNPCWander(dt){
    npcs.forEach(n=>{
      // 감사 태그(빌런 퇴치 보상 연출) 일정 시간 후 제거
      if (n.thankTagTimer>0){
        n.thankTagTimer -= dt;
        if (n.thankTagTimer<=0 && n.thankTag){ n.mesh.remove(n.thankTag); n.thankTag=null; }
      }
      if (n.seated || n.isYielder || n.disembarking) return;
      n.wanderTimer -= dt;
      const dx=n.wanderTX-n.x, dz=n.wanderTZ-n.z;
      const d=Math.hypot(dx,dz);
      // 목표 도달했거나 시간이 다 되면 새 목표 선정
      if (d<0.25 || n.wanderTimer<=0){
        n.wanderTX = CAR.xMin + Math.random()*(CAR.xMax-CAR.xMin);
        n.wanderTZ = CAR.aisleZMin + Math.random()*(CAR.aisleZMax-CAR.aisleZMin);
        n.wanderTimer = 1.5 + Math.random()*2.5;
      } else {
        const spd = n.wanderSpeed || 1.5;
        n.x += dx/d*spd*dt;
        n.z += dz/d*spd*dt;
        n.x = THREE.MathUtils.clamp(n.x, CAR.xMin, CAR.xMax);
        n.z = THREE.MathUtils.clamp(n.z, CAR.aisleZMin, CAR.aisleZMax);
        n.mesh.position.set(n.x, Math.abs(Math.sin(performance.now()*0.011+n.wobble))*0.05, n.z);
        n.mesh.rotation.y = Math.atan2(dx,dz);
      }
      applySmoothNPCSeparation(n,dt,.85);
    });
  }

  // 목적지 도착 시 "일부" 승객이 함께 하차하는 연출. enterState(ARRIVAL)에서 n.disembarking=true로
  // 표시된 NPC를 문 쪽으로 이동시키고, 승강장 밖으로 완전히 나가면 제거한다.
  function updateNPCDisembark(dt){
    for (let i=npcs.length-1; i>=0; i--){
      const n = npcs[i];
      if (!n.disembarking) continue;
      // 먼저 문 안쪽 대기점으로 이동한 뒤 같은 x축을 유지하며 문을 통과한다.
      // 대각선으로 바깥 목표를 향해 벽을 뚫고 나가는 현상을 방지한다.
      const targetX = n.exitTargetX;
      const targetZ = n.disembarkPhase==='THROUGH_DOOR'
        ? CAR.platformZ-1.2
        : n.exitQueueZ;
      const dx=targetX-n.x, dz=targetZ-n.z;
      const d=Math.hypot(dx,dz);
      if (d<0.3){
        if(n.disembarkPhase!=='THROUGH_DOOR'){
          n.x=targetX;
          n.z=targetZ;
          n.mesh.position.set(n.x,0,n.z);
          // 문이 열릴 때까지 문 안쪽 차선에서 대기한다.
          if(G.doorsOpen) n.disembarkPhase='THROUGH_DOOR';
        } else {
          scene.remove(n.mesh);
          npcs.splice(i,1);
        }
        continue;
      }
      const spd = n.moveSpeed || 2.6;
      n.x += dx/d*spd*dt; n.z += dz/d*spd*dt;
      n.mesh.position.set(n.x, 0, n.z);
      n.mesh.rotation.y = Math.atan2(dx,dz);
    }
  }

  function beginNPCDisembark(n){
    if(n.disembarking) return;
    const activeCount=npcs.filter(o=>o.disembarking).length;
    const lanes=G.doorBlocker && !G.doorBlocker.cleared
      ? [-1.55,-1.05,-0.5,0.5,1.05,1.55]
      : [-1.5,-1.0,-0.5,0,0.5,1.0,1.5];
    n.disembarking=true;
    n.disembarkPhase='TO_DOOR';
    n.exitTargetX=lanes[activeCount%lanes.length];
    n.exitQueueZ=CAR.farWallZ+0.6+Math.floor(activeCount/lanes.length)*0.7;
    if (G.contestedSeat && G.contestedSeat.npcClaimantRef===n) endSeatCompetition();
    n.targetSeat=null;
    if(n.seated && n.seatRef){
      n.x=n.mesh.position.x;
      n.z=n.mesh.position.z;
      n.seatRef.occupied=false;
      n.seatRef.occupant=null;
      n.seated=false;
      n.seatRef=null;
      n.mesh.scale.set(1,1,1);
    }
  }

  // 서 있는 NPC가 빌런 주변에서 멈춰 있지 않고 위험 반대 방향으로 피하도록 한다.
  function updateNPCAvoidVillains(dt){
    npcs.forEach(n=>{
      if(n.seated || n.disembarking || n.isYielder) return;
      if(n.avoidVillainTimer>0) n.avoidVillainTimer=Math.max(0,n.avoidVillainTimer-dt);
      let nearest=null,nearestDistance=Infinity;
      villains.forEach(v=>{
        if(v.defeated) return;
        const d=Math.hypot(n.x-v.x,n.z-v.z);
        if(d<nearestDistance){nearestDistance=d;nearest=v;}
      });
      if(nearest && nearestDistance<2.25 && (!n.avoidVillainTarget || n.avoidVillainTimer<=0)){
        const awayX=n.x-nearest.x;
        const directionX=Math.abs(awayX)>0.12 ? Math.sign(awayX) : (n.standingIndex%2===0?-1:1);
        n.avoidVillainTarget={
          x:THREE.MathUtils.clamp(n.x+directionX*2.2,CAR.xMin+0.35,CAR.xMax-0.35),
          z:THREE.MathUtils.clamp(n.z+(n.z>=nearest.z?0.45:-0.45),CAR.aisleZMin+0.18,CAR.aisleZMax-0.18)
        };
        n.avoidVillainTimer=0.9;
        n.fleeingVillain=true;
        n.idleTarget=null;
        if (G.contestedSeat && G.contestedSeat.npcClaimantRef===n) endSeatCompetition();
        n.targetSeat=null;
        n.seatApproachPhase=null;
      } else if((!nearest || nearestDistance>2.8) && n.avoidVillainTimer<=0){
        n.avoidVillainTarget=null;
        n.fleeingVillain=false;
      }
    });
  }

  /* ============ Villain AI ============ */
  function updateVillains(dt){
    const px=player.position.x, pz=player.position.z;
    villains.forEach(v=>{
      if (v.defeated) return;
      v.timer+=dt; if(v.dmgCooldown>0) v.dmgCooldown-=dt;
      if (v.hitFlash>0){ v.hitFlash-=dt; }
      const flash = v.hitFlash>0 ? Math.sin(performance.now()*0.05)*0.15 : 0;

      if(v.type==='broth' || v.type==='climate' || v.type==='umbrella'){
        updateSpecialVillain(v,dt,px,pz);
        v.x=THREE.MathUtils.clamp(v.x,CAR.xMin,CAR.xMax);
        v.z=THREE.MathUtils.clamp(v.z,CAR.aisleZMin,CAR.aisleZMax);
        v.mesh.position.set(v.x,0,v.z);
        return;
      }

      if (!v.hasApproachedPlayer && window.GameModules){
        if(v.type==='drunk'){
          v.approachOffsetX=Math.sin(performance.now()*0.007)*0.32;
          v.mesh.rotation.z=Math.sin(performance.now()*0.009)*0.28;
        }
        window.GameModules.MovementSystem.approachPlayer(v,player.position,dt,{
          speed:v.type==='drunk'?1.55:1.3,
          stopDistance:v.type==='drunk'?0.75:1.45,
          bounds:{xMin:CAR.xMin,xMax:CAR.xMax,zMin:-1.2,zMax:1.2}
        });
        v.mesh.position.set(v.x,0,v.z);
        return;
      }

      if (v.type==='drunk'){
        // WANDER / HIT — 불규칙 이동, 예측 불가능한 취객
        if (v.state==='HIT'){ if(v.timer>0.3){ v.state='WANDER'; v.timer=0; } }
        else if(G.posture===Posture.SEATED && window.GameModules){
          // 착석 플레이어에게는 무작위로 멀어지지 않고 공격 거리까지 확실히 접근한다.
          window.GameModules.MovementSystem.moveTowards(v,player.position,dt,{
            speed:1.45,
            stopDistance:0.55,
            bounds:{xMin:CAR.xMin,xMax:CAR.xMax,zMin:-1.25,zMax:1.25}
          });
        }
        else {
          if (v.timer>1.4){ v.dirX=(Math.random()<0.5?-1:1); v.dirZ=(Math.random()<0.5?-1:1); v.timer=0; }
          v.x += v.dirX*1.4*dt + Math.sin(performance.now()*0.008)*0.01;
          v.z += v.dirZ*0.6*dt;
        }
        v.mesh.rotation.z = Math.sin(performance.now()*0.006)*0.25 + flash;

        // 취객은 플레이어뿐 아니라 주변 NPC도 밀어냄
        npcs.forEach(n=>{
          if (n.seated) return;
          const dx=n.x-v.x, dz=n.z-v.z; const d=Math.hypot(dx,dz);
          if (d<0.8 && d>0.001){
            const p=(0.8-d);
            n.x += dx/d*p*0.4; n.z += dz/d*p*0.4;
            n.z = THREE.MathUtils.clamp(n.z, CAR.aisleZMin, CAR.aisleZMax);
            n.mesh.position.x=n.x; n.mesh.position.z=n.z;
          }
        });
      } else {
        updateBackpackVillain(v, dt, px, pz);
      }

      // 경계
      v.x=THREE.MathUtils.clamp(v.x,CAR.xMin,CAR.xMax);
      v.z=THREE.MathUtils.clamp(v.z,-1.2,1.2);
      v.mesh.position.set(v.x, 0, v.z);

      // 히트 스톱 연출: 전체 로직/타이머는 멈추지 않고, 짧은 스케일 펀치만 적용
      if (v.hitStop>0){
        v.hitStop -= dt;
        const p = Math.max(0, v.hitStop)/BALANCE.hitStopDuration;
        v.mesh.scale.setScalar(1 + Math.sin(p*Math.PI)*0.15);
      } else if (v.mesh.scale.x!==1){
        v.mesh.scale.setScalar(1);
      }

      // 취객은 착석 중에도 부딪힐 수 있지만 피해가 크게 줄고 넉백은 받지 않는다.
      if (v.type==='drunk'){
        const d=Math.hypot(px-v.x,pz-v.z);
        if (d<1.15 && v.dmgCooldown<=0){
          v.dmgCooldown=1.0;
          if(G.posture===Posture.SEATED){
            damage(BALANCE.villainCollisionDamage*0.35);
            forceStandFromVillain(v,0.65);
          } else {
            damage(BALANCE.villainCollisionDamage);
            knockPlayerFrom(v, BALANCE.drunkKnockbackDistance, 0.3);
          }
        }
      }
    });
  }

  function updateSpecialVillain(v,dt,px,pz){
    if(v.type==='climate') return;
    if(v.type==='umbrella'){
      v.actionTimer+=dt;
      if(v.state==='DRAIN'){
        const targetX=THREE.MathUtils.clamp(v.x>0?3.2:-3.2,CAR.xMin,CAR.xMax);
        moveNPCTo(v,targetX,0.55,dt);
        if(v.actionTimer>=1.6){
          v.state='WAIT'; v.actionTimer=0;
          createSlipperyZone(v.x,v.z,'umbrella');
          AudioFX.play('water');
          showCenter('젖은 우산에서 물이 흘러 바닥이 미끄럽습니다!',true,1.6);
        }
      }
      if(v.mesh.userData.umbrella) v.mesh.userData.umbrella.rotation.z=.25+Math.sin(performance.now()*.006)*.12;
      return;
    }

    const targetZ=THREE.MathUtils.clamp(pz,CAR.aisleZMin+.08,CAR.aisleZMax-.08);
    const d=Math.hypot(px-v.x,targetZ-v.z);
    if(v.state==='APPROACH'){
      window.GameModules.MovementSystem.moveTowards(v,{x:px,z:targetZ},dt,{speed:1.25,stopDistance:1.25,
        bounds:{xMin:CAR.xMin,xMax:CAR.xMax,zMin:CAR.aisleZMin,zMax:CAR.aisleZMax}});
      v.mesh.rotation.z=Math.sin(performance.now()*.008)*.18;
      if(d<1.45){v.state='BROTH_TELEGRAPH';v.actionTimer=.8;AudioFX.play('brothWarn');}
    } else if(v.state==='BROTH_TELEGRAPH'){
      v.actionTimer-=dt;
      if(v.mesh.userData.cup) v.mesh.userData.cup.rotation.z=THREE.MathUtils.lerp(0,1.15,1-v.actionTimer/.8);
      if(v.actionTimer<=0){
        createSlipperyZone(px,pz,'broth');
        AudioFX.play('water');
        if(G.posture===Posture.SEATED) damage(14);
        else if(G.posture===Posture.HOLDING_HANDLE) damage(2);
        v.state='BROTH_COOLDOWN';v.actionTimer=3.2;
        showCenter('뜨거운 국물이 쏟아졌습니다!',true,1.2);
      }
    } else if(v.state==='BROTH_COOLDOWN'){
      v.actionTimer-=dt;
      if(v.mesh.userData.cup) v.mesh.userData.cup.rotation.z+=(0-v.mesh.userData.cup.rotation.z)*Math.min(1,dt*5);
      if(v.actionTimer<=0) v.state='APPROACH';
    } else if(v.state==='HIT' && v.timer>.3){ v.state='APPROACH';v.timer=0; }
  }

  /* ============ 백팩 빌런: MOVE → TELEGRAPH → SWING → RECOVERY ============
     - MOVE: 통로를 이동. 플레이어를 완벽히 추적하지 않고 목표 지점을 주기적으로 다시 뽑음.
     - TELEGRAPH(0.7~1.0s): backpackPivot을 뒤로 당기며 예고. 이 상태에서 맞으면 공격이 취소됨(HIT 전환).
     - SWING(~0.32s): backpackPivot과 상체만 회전(전체 몸이 팽이처럼 돌지 않음). 판정은 중간 구간 1회.
     - RECOVERY: 피벗 회전을 부드럽게 원위치로 복구 후 MOVE로 복귀.
  ========================================================================== */
  function updateBackpackVillain(v, dt, px, pz){
    const bp = v.backpackPivot, bodyP = v.bodyPivot;
    const attackZ=THREE.MathUtils.clamp(pz,CAR.aisleZMin+0.08,CAR.aisleZMax-0.08);
    const attackDistance=Math.hypot(px-v.x,attackZ-v.z);

    if (v.state==='MOVE'){
      if (v.timer > v.moveRetargetAt){
        v.moveOffset = (Math.random()-0.5)*3.0;      // 플레이어를 정확히 추적하지 않도록 오프셋 부여
        v.moveRetargetAt = v.timer + 1.0 + Math.random()*1.2;
      }
      const dx=px-v.x, dz=attackZ-v.z;
      const d=Math.hypot(dx,dz);
      if(d>0.05){
        const step=Math.min(d,1.35*dt);
        v.x+=dx/d*step;
        v.z+=dz/d*step;
        v.mesh.rotation.y=Math.atan2(dx,dz);
      }
      if (bodyP) bodyP.rotation.z += (0 - bodyP.rotation.z)*Math.min(1,dt*6);
      if (bp) bp.rotation.y += (0 - bp.rotation.y)*Math.min(1,dt*6);
      if (attackDistance<0.75 && v.timer>0.35){
        v.state='TELEGRAPH';
        v.telegraphDuration = 0.7 + Math.random()*0.3;
        v.telegraph = v.telegraphDuration;
        v.timer=0;
      }
    } else if (v.state==='TELEGRAPH'){
      v.telegraph -= dt;
      const t = 1 - Math.max(0, v.telegraph)/v.telegraphDuration;
      if (bodyP) bodyP.rotation.z = -0.25*t + Math.sin(performance.now()*0.02)*0.04;
      if (bp) bp.rotation.y = THREE.MathUtils.lerp(0, -1.1, t); // 백팩을 뒤로 당겨 예고
      if (v.telegraph<=0){
        v.state='SWING'; v.swingDuration=0.32; v.swingTimer=0; v.swingHit=false; v.timer=0;
      }
    } else if (v.state==='SWING'){
      v.swingTimer += dt;
      const t = Math.min(1, v.swingTimer/v.swingDuration);
      if (bp) bp.rotation.y = THREE.MathUtils.lerp(-1.1, 2.4, t);       // 백팩만 빠르게 휘두름
      if (bodyP) bodyP.rotation.z = THREE.MathUtils.lerp(-0.25, 0.15, t); // 상체는 살짝만 함께 회전
      if (!v.swingHit && t>=0.35 && t<=0.65){
        const d = Math.hypot(px-v.x, pz-v.z);
        if (d<2.4){
          v.swingHit = true; // 공격 판정은 이 프레임에 단 1회만
          if (G.posture===Posture.SEATED){
            damage(BALANCE.villainCollisionDamage*BALANCE.backpackSeatedDamageMultiplier);
            forceStandFromVillain(v,0.8);
          } else if (G.posture===Posture.HOLDING_HANDLE){
            damage(BALANCE.villainCollisionDamage*0.3);
          } else {
            damage(BALANCE.villainCollisionDamage);
            knockPlayerFrom(v, BALANCE.backpackKnockbackDistance, 0.35);
          }
        }
      }
      if (v.swingTimer>=v.swingDuration){ v.state='RECOVERY'; v.timer=0; }
    } else if (v.state==='RECOVERY'){
      if (bp) bp.rotation.y += (0 - bp.rotation.y)*Math.min(1,dt*5);
      if (bodyP) bodyP.rotation.z += (0 - bodyP.rotation.z)*Math.min(1,dt*5);
      v.timer += dt;
      if (v.timer>0.9){ v.state='MOVE'; v.timer=0; }
    } else if (v.state==='HIT'){
      if (bp) bp.rotation.y += (0 - bp.rotation.y)*Math.min(1,dt*6);
      if (bodyP) bodyP.rotation.z += (0 - bodyP.rotation.z)*Math.min(1,dt*6);
      if (v.timer>0.3){ v.state='MOVE'; v.timer=0; }
    }

    // 피격 시 미세한 흔들림(고개/상체) 연출
    if (bodyP){ bodyP.rotation.x = v.hitFlash>0 ? Math.sin(performance.now()*0.05)*0.12 : 0; }
  }

  // 거리(distance)만큼, stunTime 동안 서서히 감속하며 튕겨나가는 넉백을 건다.
  // (한 프레임에 순간이동하는 대신, updatePlayer에서 매 프레임 이동시켜 "튕겨나가는" 느낌을 준다)
  function knockPlayerFrom(v, distance, stunTime){
    const dx=player.position.x-v.x, dz=player.position.z-v.z;
    const d=Math.hypot(dx,dz)||1;
    G.knockback.dirX = dx/d;
    G.knockback.dirZ = dz/d;
    G.knockback.distance = distance!=null ? distance : 1.6;
    G.knockback.timer = BALANCE.knockbackDuration;
    G.stun = Math.max(G.stun, stunTime!=null ? stunTime : BALANCE.knockbackDuration);
    G.shake = Math.max(G.shake, 0.3);
  }
