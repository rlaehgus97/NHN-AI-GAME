"use strict";
/* ai.js — 좌석 경쟁 NPC AI 및 빌런 AI */

  /* ============ Seat competition ============
     좌석마다 "플레이어 게이지(captureProgress)"와 "경쟁 NPC 게이지(npcProgress)"를
     동시에 진행시켜, 먼저 100에 도달하는 쪽이 좌석을 차지하는 방식(레이스형 경쟁).
     먼저 도착했다고 무조건 이기지 않으며, 두 게이지가 동시에 채워지므로 결과를 예측하기 어렵다.
  =============================================================================== */
  // 좌석 게이지 UI + 플레이어 SPACE 입력 반영분. SEAT_RUSH와 TRAVELING 양쪽에서 공용으로 사용됨
  // (착석은 항상 이 게이지를 100까지 채워야만 가능하며, E키로 즉시 앉는 경로는 없음)
  function updateSeatCaptureGauge(dt){
    const px=player.position.x, pz=player.position.z;
    const seat = nearestEmptySeat(px,pz,1.3);

    if (seat && G.posture===Posture.STANDING){
      const contested = seat.npcClaimantRef && !seat.npcClaimantRef.seated;
      if (UI.seatLabel){
        if (seat.reservedFor==='player'){
          UI.seatLabel.textContent = '양보받은 자리! SPACE ('+Math.ceil(seat.reservedTimer)+'s)';
        } else if (contested){
          UI.seatLabel.textContent = '경쟁 승객보다 먼저 SPACE!';
        } else {
          UI.seatLabel.textContent = '빈자리 착석: SPACE';
        }
      }
      UI.seatWrap.classList.add('show');
      UI.seatFill.style.width = seat.captureProgress+'%';
    } else {
      UI.seatWrap.classList.remove('show');
    }
  }

  // 좌석이 없는 경쟁 NPC들의 행동: 빈 좌석(예약되지 않은)이 있으면 쫓아가서 차지를 시도하고,
  // 없으면 통로를 자유롭게 배회한다. SEAT_RUSH뿐 아니라 TRAVELING 중에도 계속 호출되므로,
  // 플레이어가 자리에서 일어나거나 빌런 퇴치로 좌석이 비면 다른 NPC가 알아서 채우러 온다.
  function updateUnseatedCompetitors(dt){
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
        applySmoothNPCSeparation(n,dt,.82);
        if(!settled) return;
        n.initialSettling=false;
      }

      // 빌런 회피 중에는 좌석/대기점 이동을 동시에 적용하지 않는다.
      if(n.avoidVillainTarget){
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
      } else if (!n.targetSeat || n.targetSeat.occupied || n.targetSeat.reservedFor){
        n.fleeingVillain=false;
        n.targetSeat = pickTargetSeatForNPC(n);
      }
      const s = n.avoidSeatTimer>0 ? null : n.targetSeat;

      if (s){
        n.idleTarget=null;
        // 단순화 규칙: 빈 좌석의 상호작용 지점에 먼저 도착한 대상이 즉시 차지한다.
        const arrived = moveNPCToSeat(n,s,dt);
        if (arrived && !s.occupied && !s.reservedFor){
          npcSit(n, s);
        }
      } else {
        // 갈 수 있는 좌석이 없으면 개체별 대기 슬롯 주변을 움직여 한곳에 뭉치지 않게 한다.
        const slot = ensureIdleTarget(n);
        n.wanderTX=slot.x; n.wanderTZ=slot.z;
        const arrived=moveNPCToIdleSlot(n,slot,dt);
        n.mesh.position.y=arrived ? 0 : Math.abs(Math.sin(performance.now()*0.011+n.wobble))*0.035;
      }

      applySmoothNPCSeparation(n,dt,.9);
    });

    updateNPCSeatPoses();
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
    const step=Math.min(.55*dt,length*.08);
    n.x=THREE.MathUtils.clamp(n.x+pushX/length*step,CAR.xMin,CAR.xMax);
    n.z=THREE.MathUtils.clamp(n.z+pushZ/length*step,CAR.aisleZMin,CAR.aisleZMax);
    n.mesh.position.x=n.x;n.mesh.position.z=n.z;
  }

  // 빈 좌석과 서 있는 경쟁자가 함께 있으면 1초 안에 가장 가까운 NPC가 좌석을 채우게 한다.
  function ensureEmptySeatGetsFilled(dt){
    const empty=seats.find(s=>!s.occupied && !s.reservedFor &&
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
      for(let column=0;column<10;column++){
        candidates.push({
          x:THREE.MathUtils.clamp(-6.5+column*1.44+row*0.72,CAR.xMin+0.4,CAR.xMax-0.4),
          z:row===0?-0.55:0.55
        });
      }
    }
    const claimed=npcs.filter(o=>o!==n && o.idleTarget).map(o=>o.idleTarget);
    const free=candidates.filter(slot=>!claimed.some(used=>Math.hypot(slot.x-used.x,slot.z-used.z)<0.7));
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

  // SEAT_RUSH 단계에서 매 프레임 호출되는 통합 함수(게이지 UI + NPC 이동/점유)
  function updateSeatRush(dt){
    updateSeatCaptureGauge(dt);
    updateUnseatedCompetitors(dt);
  }

  // 좌석 경쟁 종료 직전에는 좌표를 순간 변경하지 않고 목표만 확정한다.
  // NPC는 TRAVELING 전환 뒤에도 동일한 경로를 이어 걸어가 좌석에 도착한 뒤 착석한다.
  function settleRemainingSeats(){
    const unseated=npcs.filter(n=>n.kind==='competitor' && !n.seated && !n.disembarking);
    const claimed=new Set(unseated
      .filter(n=>n.targetSeat && !n.targetSeat.occupied && !n.targetSeat.reservedFor)
      .map(n=>n.targetSeat));
    unseated.forEach(n=>{
      if(n.avoidSeatTimer>0 || (n.targetSeat && claimed.has(n.targetSeat))) return;
      const available=seats
        .filter(s=>!s.occupied && !s.reservedFor && !claimed.has(s))
        .sort((a,b)=>dist2(n.x,n.z,a.interactionPoint.x,a.interactionPoint.z)-
          dist2(n.x,n.z,b.interactionPoint.x,b.interactionPoint.z));
      if(available[0]){n.targetSeat=available[0];claimed.add(available[0]);}
    });
  }

  // 좌석별로 이미 그 좌석을 노리는 NPC 수를 페널티로 고려해, 특정 좌석에 몰리지 않게 분산시킴
  function pickTargetSeatForNPC(n){
    let best=null, bestScore=Infinity;
    seats.forEach(s=>{
      if (s.occupied || s.reservedFor) return; // 예약된 좌석(빌런 퇴치/선행 보상)은 노리지 않음
      const targeting = npcs.filter(o=> o!==n && !o.seated && o.targetSeat===s).length;
      if(targeting>0) return; // 한 좌석에는 한 NPC만 접근하도록 목표를 독점한다.
      const d = Math.sqrt(dist2(n.x,n.z,s.interactionPoint.x,s.interactionPoint.z));
      const score = d;
      if (score<bestScore){ bestScore=score; best=s; }
    });
    return best;
  }

  function npcSit(n, s){
    if (s.occupied || s.reservedFor) return; // 예약된 좌석(빌런 퇴치 보상)은 NPC가 앉을 수 없음
    if (window.GameModules && !window.GameModules.SeatCompetition.npcArrived(s,n)) return;
    s.occupied=true; s.occupant=n; n.seated=true; n.seatRef=s;
    n.seatApproachPhase=null;
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
      applySmoothNPCSeparation(n,dt,.78);
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
          destroyCharacterModel(n.mesh);
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
      ? [-1.25,-0.82,-0.4,0.4,0.82,1.25]
      : [-1.05,-0.7,-0.35,0,0.35,0.7,1.05];
    n.disembarking=true;
    n.disembarkPhase='TO_DOOR';
    n.exitTargetX=lanes[activeCount%lanes.length];
    n.exitQueueZ=CAR.farWallZ+0.55+Math.floor(activeCount/lanes.length)*0.65;
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
          x:THREE.MathUtils.clamp(n.x+directionX*2.0,CAR.xMin+0.35,CAR.xMax-0.35),
          z:THREE.MathUtils.clamp(n.z+(n.z>=nearest.z?0.38:-0.38),CAR.aisleZMin+0.18,CAR.aisleZMax-0.18)
        };
        n.avoidVillainTimer=0.9;
        n.fleeingVillain=true;
        n.idleTarget=null;
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
      // GLTF 캐릭터라면 MOVE 상태에서만 Walking/Idle 크로스페이드(연출 개선, 선택사항).
      // bodyP의 자식은 createCharacterGroup() 결과(GLTF면 characterModel.group, 아니면 프리미티브 그룹).
      const bodyCM = bodyP && bodyP.children[0] && bodyP.children[0].userData.characterModel;
      if (bodyCM) bodyCM.setLocomotion(d>0.05 ? 'walk' : 'idle');
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
