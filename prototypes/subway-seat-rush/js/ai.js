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
        const entered=moveNPCTo(n,n.boardTarget.x,n.boardTarget.z,dt);
        if(entered){
          n.boardingAtStation=false;
          const slot=getStandingSlot(n);
          n.wanderTX=slot.x;
          n.wanderTZ=slot.z;
          n.wanderTimer=0;
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
        // 단순화 규칙: 빈 좌석의 상호작용 지점에 먼저 도착한 대상이 즉시 차지한다.
        const arrived = moveNPCTo(n, s.interactionPoint.x, s.interactionPoint.z, dt);
        if (arrived && !s.occupied && !s.reservedFor){
          npcSit(n, s);
        }
      } else {
        // 갈 수 있는 좌석이 없으면 개체별 대기 슬롯 주변을 움직여 한곳에 뭉치지 않게 한다.
        n.wanderTimer -= dt;
        const slot = getStandingSlot(n);
        if (n.wanderTZ<CAR.aisleZMin || n.wanderTZ>CAR.aisleZMax){
          n.wanderTX=slot.x; n.wanderTZ=slot.z; n.wanderTimer=0;
        }
        const dx=n.wanderTX-n.x, dz=n.wanderTZ-n.z;
        const d=Math.hypot(dx,dz);
        if (d<0.25 || n.wanderTimer<=0){
          n.wanderTX = THREE.MathUtils.clamp(slot.x+(Math.random()-0.5)*0.45,CAR.xMin,CAR.xMax);
          n.wanderTZ = THREE.MathUtils.clamp(slot.z+(Math.random()-0.5)*0.25,CAR.aisleZMin,CAR.aisleZMax);
          n.wanderTimer = 2.2 + Math.random()*2.5;
        } else {
          const spd = n.wanderSpeed || 1.5;
          n.x += dx/d*spd*dt; n.z += dz/d*spd*dt;
          n.x = THREE.MathUtils.clamp(n.x, CAR.xMin, CAR.xMax);
          n.z = THREE.MathUtils.clamp(n.z, CAR.aisleZMin, CAR.aisleZMax);
          n.mesh.position.set(n.x, Math.abs(Math.sin(performance.now()*0.011+n.wobble))*0.05, n.z);
          n.mesh.rotation.y = Math.atan2(dx,dz);
        }
      }

      // NPC끼리 가볍게 밀어내기 (겹침 방지)
      npcs.forEach(m=>{
        if (m===n || m.seated) return;
        const ddx=n.x-m.x, ddz=n.z-m.z; const dd=Math.hypot(ddx,ddz);
        if (dd<0.7 && dd>0.001){ const p=(0.7-dd)/2; n.x+=ddx/dd*p; n.z+=ddz/dd*p;
          n.z=THREE.MathUtils.clamp(n.z,CAR.aisleZMin,CAR.aisleZMax);
          n.mesh.position.x=n.x; n.mesh.position.z=n.z; }
      });
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

  // 빈 좌석과 서 있는 경쟁자가 함께 있으면 1초 안에 가장 가까운 NPC가 좌석을 채우게 한다.
  function ensureEmptySeatGetsFilled(dt){
    const empty=seats.find(s=>!s.occupied && !s.reservedFor);
    const candidates=npcs.filter(n=>n.kind==='competitor' && !n.seated &&
      !n.disembarking && !n.boardingAtStation);
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
    if(G.emptySeatFillTimer>=1.0 && !empty.occupied){
      npcSit(closest,empty);
      G.emptySeatFillTimer=0;
    }
  }

  function getStandingSlot(n){
    const index=n.standingIndex||0;
    const columns=7;
    const column=index%columns;
    const row=Math.floor(index/columns)%2;
    return {
      x:-6.0+column*2.0,
      z:row===0 ? -0.55 : 0.55
    };
  }

  // SEAT_RUSH 단계에서 매 프레임 호출되는 통합 함수(게이지 UI + NPC 이동/점유)
  function updateSeatRush(dt){
    updateSeatCaptureGauge(dt);
    updateUnseatedCompetitors(dt);
  }

  // SEAT_RUSH 종료 시 호출: 아직 못 앉은 경쟁 NPC를 남은 빈 좌석에 즉시 배정해
  // "좌석은 항상 꽉 차야 한다"는 규칙을 애니메이션 타이밍과 무관하게 보장한다.
  // (플레이어를 포함해 인원이 좌석보다 1명 많으므로, 정산 후에는 정확히 1명만 서 있게 된다)
  function settleRemainingSeats(){
    const unseated = npcs.filter(n=> n.kind==='competitor' && !n.seated);
    const empty = seats.filter(s=> !s.occupied && !s.reservedFor);
    for (let i=unseated.length-1;i>0;i--){
      const j=Math.floor(Math.random()*(i+1));
      const tmp=unseated[i]; unseated[i]=unseated[j]; unseated[j]=tmp;
    }
    for (let i=0;i<Math.min(unseated.length, empty.length); i++){
      npcSit(unseated[i], empty[i]);
    }
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
      // NPC끼리 가볍게 밀어내기 (겹침 방지)
      npcs.forEach(m=>{
        if (m===n || m.seated) return;
        const ddx=n.x-m.x, ddz=n.z-m.z; const dd=Math.hypot(ddx,ddz);
        if (dd<0.7 && dd>0.001){ const p=(0.7-dd)/2; n.x+=ddx/dd*p; n.z+=ddz/dd*p;
          n.z=THREE.MathUtils.clamp(n.z,CAR.aisleZMin,CAR.aisleZMax);
          n.mesh.position.x=n.x; n.mesh.position.z=n.z; }
      });
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
        : CAR.farWallZ+0.65;
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
    const lanes=[-1.05,-0.7,-0.35,0,0.35,0.7,1.05];
    n.disembarking=true;
    n.disembarkPhase='TO_DOOR';
    n.exitTargetX=lanes[activeCount%lanes.length];
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
      let pushX=0, pushZ=0;
      villains.forEach(v=>{
        if(v.defeated) return;
        const dx=n.x-v.x, dz=n.z-v.z;
        const d=Math.hypot(dx,dz);
        if(d>0.01 && d<2.25){
          const strength=(2.25-d)/2.25;
          pushX+=dx/d*strength;
          pushZ+=dz/d*strength;
        }
      });
      const length=Math.hypot(pushX,pushZ);
      if(length<=0.01) return;
      const speed=1.4;
      n.x=THREE.MathUtils.clamp(n.x+pushX/length*speed*dt,CAR.xMin,CAR.xMax);
      n.z=THREE.MathUtils.clamp(n.z+pushZ/length*speed*dt,CAR.aisleZMin,CAR.aisleZMax);
      n.wanderTX=n.x+pushX/length;
      n.wanderTZ=n.z+pushZ/length;
      n.wanderTimer=Math.max(n.wanderTimer,0.8);
      n.mesh.position.set(n.x,Math.abs(Math.sin(performance.now()*0.011+n.wobble))*0.05,n.z);
      n.mesh.rotation.y=Math.atan2(pushX,pushZ);
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

      if (!v.hasApproachedPlayer && window.GameModules){
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

  /* ============ 백팩 빌런: MOVE → TELEGRAPH → SWING → RECOVERY ============
     - MOVE: 통로를 이동. 플레이어를 완벽히 추적하지 않고 목표 지점을 주기적으로 다시 뽑음.
     - TELEGRAPH(0.7~1.0s): backpackPivot을 뒤로 당기며 예고. 이 상태에서 맞으면 공격이 취소됨(HIT 전환).
     - SWING(~0.32s): backpackPivot과 상체만 회전(전체 몸이 팽이처럼 돌지 않음). 판정은 중간 구간 1회.
     - RECOVERY: 피벗 회전을 부드럽게 원위치로 복구 후 MOVE로 복귀.
  ========================================================================== */
  function updateBackpackVillain(v, dt, px, pz){
    const bp = v.backpackPivot, bodyP = v.bodyPivot;

    if (v.state==='MOVE'){
      if (v.timer > v.moveRetargetAt){
        v.moveOffset = (Math.random()-0.5)*3.0;      // 플레이어를 정확히 추적하지 않도록 오프셋 부여
        v.moveRetargetAt = v.timer + 1.0 + Math.random()*1.2;
      }
      const targetX = px + v.moveOffset;
      const dx = targetX - v.x;
      if (Math.abs(dx)>0.05) v.x += Math.sign(dx)*1.1*dt;
      if (bodyP) bodyP.rotation.z += (0 - bodyP.rotation.z)*Math.min(1,dt*6);
      if (bp) bp.rotation.y += (0 - bp.rotation.y)*Math.min(1,dt*6);
      if (Math.abs(px-v.x)<2.2 && v.timer>2){
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
        if (d<2.1){
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
