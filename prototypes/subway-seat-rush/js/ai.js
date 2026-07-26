"use strict";
/* ai.js — 좌석 경쟁 NPC AI 및 빌런 AI */

  /* ============ Seat competition ============ */
  function updateSeatRush(dt){
    const px=player.position.x, pz=player.position.z;
    const seat = nearestEmptySeat(px,pz,1.3);
    // 플레이어 게이지
    if (seat && G.posture===Posture.STANDING){
      setInteract('SPACE 연타: 자리 차지!');
      UI.seatWrap.classList.add('show');
      UI.seatFill.style.width = seat.captureProgress+'%';
      // 자연 감소
      if (seat.captureBy==='player' || seat.captureBy===null){
        seat.captureProgress = Math.max(0, seat.captureProgress - BALANCE.seatCaptureDecayPerSecond*dt);
      }
    } else {
      UI.seatWrap.classList.remove('show');
    }

    // NPC 경쟁: 목표 좌석으로 이동 후 게이지
    npcs.forEach(n=>{
      if (n.kind!=='competitor' || n.seated) return;
      if (!n.targetSeat || n.targetSeat.occupied){
        n.targetSeat = pickTargetSeatForNPC(n);
      }
      const s = n.targetSeat;
      if (!s){ // 좌석 없음 → 통로 대기
        moveNPCTo(n, n.standSpot.x, n.standSpot.z, dt); return;
      }
      const tx=s.interactionPoint.x, tz=s.interactionPoint.z;
      const arrived = moveNPCTo(n, tx, tz, dt);
      if (arrived && !s.occupied){
        if (s.captureBy!=='player'){ s.captureBy='npc:'+npcs.indexOf(n); }
        // 플레이어가 경쟁중이 아니면 NPC가 채움
        if (s.captureBy!=='player'){
          s.captureProgress += BALANCE.npcCaptureRatePerSecond*dt;
          if (s.captureProgress>=100){ npcSit(n,s); }
        }
      }
    });
  }

  function pickTargetSeatForNPC(n){
    let best=null,bd=1e9;
    seats.forEach(s=>{ if(s.occupied) return;
      const d=dist2(n.x,n.z,s.interactionPoint.x,s.interactionPoint.z);
      if(d<bd){bd=d;best=s;} });
    return best;
  }
  function npcSit(n,s){
    s.occupied=true; s.occupant=n; n.seated=true; n.seatRef=s;
    n.mesh.position.set(s.x,0,s.z); n.mesh.scale.set(1,0.72,1);
  }
  function moveNPCTo(n, tx, tz, dt){
    const dx=tx-n.x, dz=tz-n.z; const d=Math.hypot(dx,dz);
    if (d<0.15) return true;
    const spd=2.6;
    n.x += dx/d*spd*dt; n.z += dz/d*spd*dt;
    n.mesh.position.set(n.x, Math.abs(Math.sin(performance.now()*0.01+n.wobble))*0.04, n.z);
    n.mesh.rotation.y = Math.atan2(dx,dz);
    return false;
  }

  // 착석하지 않은 NPC들이 통로를 자유롭게 배회
  function updateNPCWander(dt){
    npcs.forEach(n=>{
      if (n.seated || n.isYielder) return;
      n.wanderTimer -= dt;
      const dx=n.wanderTX-n.x, dz=n.wanderTZ-n.z;
      const d=Math.hypot(dx,dz);
      // 목표 도달했거나 시간이 다 되면 새 목표 선정
      if (d<0.25 || n.wanderTimer<=0){
        n.wanderTX = CAR.xMin + Math.random()*(CAR.xMax-CAR.xMin);
        n.wanderTZ = CAR.aisleZMin + Math.random()*(CAR.aisleZMax-CAR.aisleZMin);
        n.wanderTimer = 1.5 + Math.random()*2.5;
      } else {
        n.x += dx/d*n.wanderSpeed*dt;
        n.z += dz/d*n.wanderSpeed*dt;
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

  /* ============ Villain AI ============ */
  function updateVillains(dt){
    const px=player.position.x, pz=player.position.z;
    villains.forEach(v=>{
      if (v.defeated) return;
      v.timer+=dt; if(v.dmgCooldown>0) v.dmgCooldown-=dt;
      if (v.hitFlash>0){ v.hitFlash-=dt; }

      // 공통 시각: 히트시 흔들림
      const flash = v.hitFlash>0 ? Math.sin(performance.now()*0.05)*0.15 : 0;

      if (v.type==='drunk'){
        // WANDER / STAGGER / HIT
        if (v.state==='HIT'){ if(v.timer>0.3){ v.state='WANDER'; v.timer=0; } }
        else {
          // 불규칙 이동 + 비틀
          if (v.timer>1.4){ v.dirX=(Math.random()<0.5?-1:1); v.dirZ=(Math.random()<0.5?-1:1); v.timer=0; }
          v.x += v.dirX*1.4*dt + Math.sin(performance.now()*0.008)*0.01;
          v.z += v.dirZ*0.6*dt;
        }
        v.mesh.rotation.z = Math.sin(performance.now()*0.006)*0.25 + flash;
      } else {
        // backpack: MOVE→TELEGRAPH→SPIN→COOLDOWN
        if (v.state==='MOVE'){
          const dx=px-v.x; v.x += Math.sign(dx)*1.1*dt;
          if (Math.abs(px-v.x)<2.2 && v.timer>2){ v.state='TELEGRAPH'; v.telegraph=1.0; v.timer=0; }
        } else if (v.state==='TELEGRAPH'){
          v.telegraph-=dt;
          v.mesh.rotation.z = Math.sin(performance.now()*0.03)*0.3; // 예고 흔들림
          if (v.telegraph<=0){ v.state='SPIN'; v.spinTimer=0.7; v.timer=0; }
        } else if (v.state==='SPIN'){
          v.spinTimer-=dt;
          v.mesh.rotation.y += dt*14;
          // 회전 중 범위 피해
          if (Math.hypot(px-v.x,pz-v.z)<2.0 && v.dmgCooldown<=0){
            v.dmgCooldown=0.8;
            if (G.posture===Posture.SEATED){ /* 피해 없음 */ }
            else if (G.posture===Posture.HOLDING_HANDLE){ damage(BALANCE.villainCollisionDamage*0.3); }
            else { damage(BALANCE.villainCollisionDamage); knockPlayerFrom(v); }
          }
          if (v.spinTimer<=0){ v.state='COOLDOWN'; v.cooldown=1.5; v.timer=0; }
        } else if (v.state==='COOLDOWN'){
          v.cooldown-=dt; v.mesh.rotation.y=0;
          if (v.cooldown<=0){ v.state='MOVE'; v.timer=0; }
        } else if (v.state==='HIT'){
          if (v.timer>0.3){ v.state='MOVE'; v.timer=0; }
        }
        v.mesh.rotation.z += flash;
      }

      // 경계
      v.x=THREE.MathUtils.clamp(v.x,CAR.xMin,CAR.xMax);
      v.z=THREE.MathUtils.clamp(v.z,-1.2,1.2);
      v.mesh.position.set(v.x, 0, v.z);

      // 취객 근접 충돌 피해 (서 있는 플레이어)
      if (v.type==='drunk' && G.posture!==Posture.SEATED){
        const d=Math.hypot(px-v.x,pz-v.z);
        if (d<0.85 && v.dmgCooldown<=0){
          v.dmgCooldown=1.0;
          damage(BALANCE.villainCollisionDamage);
          G.stun=0.3; G.shake=Math.max(G.shake,0.2);
          knockPlayerFrom(v);
        }
      }
    });
  }

  function knockPlayerFrom(v){
    const dx=player.position.x-v.x, dz=player.position.z-v.z;
    const d=Math.hypot(dx,dz)||1;
    const r=resolvePlayerBounds(player.position.x+dx/d*0.8, player.position.z+dz/d*0.8);
    player.position.x=r.x; player.position.z=r.z;
  }

