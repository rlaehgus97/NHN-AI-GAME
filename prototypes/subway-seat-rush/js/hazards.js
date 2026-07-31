"use strict";
/* 환경 위험, 미끄러운 바닥, 비전투 상호작용, 군중 압박 */

function makeHazardDisc(x,z,radius,color,opacity=.28){
  const mesh=new THREE.Mesh(
    new THREE.CircleGeometry(radius,32),
    new THREE.MeshBasicMaterial({color,transparent:true,opacity,depthWrite:false})
  );
  mesh.rotation.x=-Math.PI/2;
  mesh.position.set(x,0.025,z);
  scene.add(mesh);
  return mesh;
}

function spawnStaticStressZone(){
  const choices=[
    {type:'video',label:'큰 소리!',x:-4.7,z:-0.75,color:0xff4d6d},
    {type:'food',label:'음식!',x:3.4,z:0.72,color:0xff9f43},
    {type:'odor',label:'악취!',x:5.6,z:-0.72,color:0x9b59b6}
  ];
  const data=choices[Math.floor(Math.random()*choices.length)];
  const mesh=makeHazardDisc(data.x,data.z,1.45,data.color,.22);
  const icon=makeTag(data.label,'#b33939');
  icon.position.set(data.x,1.75,data.z);
  scene.add(icon);
  hazardZones.push({...data,radius:1.45,stressPerSecond:2.4,mesh,icon,active:true});
}

function createSlipperyZone(x,z,source='water'){
  const existing=slipperyZones.find(zone=>Math.hypot(zone.x-x,zone.z-z)<1.0);
  if(existing){ existing.duration=Math.max(existing.duration,18); return existing; }
  const color=source==='broth'?0xf5a623:0x4da6ff;
  const mesh=makeHazardDisc(x,z,1.05,color,.3);
  const zone={x,z,radius:1.05,duration:18,source,mesh};
  slipperyZones.push(zone);
  return zone;
}

function clearEnvironmentHazards(){
  hazardZones.forEach(zone=>{ scene.remove(zone.mesh); scene.remove(zone.icon); });
  slipperyZones.forEach(zone=>scene.remove(zone.mesh));
  hazardZones.length=0;
  slipperyZones.length=0;
  if(G.doorBlocker?.mesh) scene.remove(G.doorBlocker.mesh);
  if(G.crowdZoneMesh) scene.remove(G.crowdZoneMesh);
  G.doorBlocker=null;
}

function showCrowdWarningZone(){
  if(G.crowdZoneMesh) scene.remove(G.crowdZoneMesh);
  const mesh=new THREE.Mesh(
    new THREE.PlaneGeometry(5.6,1.5),
    new THREE.MeshBasicMaterial({color:0xe74c3c,transparent:true,opacity:.18,depthWrite:false})
  );
  mesh.rotation.x=-Math.PI/2;
  mesh.position.set(0,.03,-.55);
  scene.add(mesh);
  G.crowdZoneMesh=mesh;
}

function clearSlipperyZones(){
  slipperyZones.forEach(zone=>scene.remove(zone.mesh));
  slipperyZones.length=0;
}

function playerInZone(zone){
  return Math.hypot(player.position.x-zone.x,player.position.z-zone.z)<zone.radius;
}

function getPlayerHazardSpeedMultiplier(){
  let multiplier=1;
  if(slipperyZones.some(playerInZone)) multiplier*=0.68;
  const climate=villains.find(v=>!v.defeated && v.type==='climate' && Math.hypot(player.position.x-v.x,player.position.z-v.z)<v.zoneRadius);
  if(climate) multiplier*=0.72;
  if(G.encircled) multiplier*=0.72;
  return multiplier;
}

function updateEnvironmentHazards(dt){
  hazardZones.forEach(zone=>{
    if(zone.active && playerInZone(zone)) damage(zone.stressPerSecond*dt);
    zone.mesh.material.opacity=.18+Math.sin(performance.now()*.004)*.07;
  });
  for(let i=slipperyZones.length-1;i>=0;i--){
    const zone=slipperyZones[i];
    zone.duration-=dt;
    zone.mesh.material.opacity=.2+Math.sin(performance.now()*.005+i)*.08;
    if(zone.duration<=0){ scene.remove(zone.mesh); slipperyZones.splice(i,1); }
  }
  villains.forEach(v=>{
    if(v.defeated || v.type!=='climate') return;
    const inside=Math.hypot(player.position.x-v.x,player.position.z-v.z)<v.zoneRadius;
    if(inside) damage(1.8*dt);
    v.zoneMesh.material.opacity=.16+Math.sin(performance.now()*.006)*.1;
    v.neglectTimer+=dt;
    if(v.neglectTimer>6 && !v.relocatedNPC){
      const occupant=seats
        .filter(s=>s.occupied && s.occupant!=='player' && s.reservedFor!=='player-safety')
        .sort((a,b)=>dist2(a.x,a.z,v.x,v.z)-dist2(b.x,b.z,v.x,v.z))[0];
      if(occupant){
        const npc=occupant.occupant;
        occupant.occupied=false; occupant.occupant=null;
        npc.seated=false; npc.seatRef=null; npc.mesh.scale.set(1,1,1);
        npc.x=occupant.x; npc.z=occupant.interactionPoint.z;
        npc.mesh.position.set(npc.x,0,npc.z); npc.idleTarget=null; npc.targetSeat=null;
        npc.avoidSeatTimer=3;
      }
      v.relocatedNPC=true;
    }
  });
  if(G.crowdPressureTimer>0){
    G.crowdPressureTimer=Math.max(0,G.crowdPressureTimer-dt);
    const inCrowdZone=G.posture===Posture.STANDING &&
      Math.abs(player.position.x)<2.8 && player.position.z<0.05;
    if(inCrowdZone){
      G.crowdExposure=Math.min(2,G.crowdExposure+dt);
      if(G.crowdExposure>=0.65) G.encircled=true;
    } else {
      G.crowdExposure=Math.max(0,G.crowdExposure-dt*2.5);
      if(G.crowdExposure<=0) G.encircled=false;
    }
    if(G.encircled) damage(2.2*dt);
    if(G.crowdZoneMesh) G.crowdZoneMesh.material.opacity=.14+Math.sin(performance.now()*.006)*.08;
    if(G.crowdPressureTimer<=0){
      G.encircled=false;G.crowdExposure=0;
      if(G.crowdZoneMesh){scene.remove(G.crowdZoneMesh);G.crowdZoneMesh=null;}
    }
  }
  updateDoorBlocker(dt);
}

function updateSpecialInteractions(dt){
  let target=null,label='';
  villains.forEach(v=>{
    if(v.defeated || (v.type!=='climate' && v.type!=='umbrella')) return;
    if(Math.hypot(player.position.x-v.x,player.position.z-v.z)<1.45){ target=v; }
  });
  if(target){
    label=target.type==='climate'?'E 길게 누르기: 냉방 장치 복구':'E 길게 누르기: 우산 정리·물기 닦기';
    if(keys['e'] && G.posture===Posture.STANDING){
      target.interactProgress=(target.interactProgress||0)+dt;
      if(target.interactProgress>=2){ resolveUtilityVillain(target); }
    } else target.interactProgress=Math.max(0,(target.interactProgress||0)-dt*.7);
    if(UI?.interact) setInteract(label+' '+Math.round((target.interactProgress||0)/2*100)+'%');
  }
}

function hasNearbyUtilityVillain(){
  return villains.some(v=>!v.defeated && (v.type==='climate'||v.type==='umbrella') &&
    Math.hypot(player.position.x-v.x,player.position.z-v.z)<1.45);
}

function resolveUtilityVillain(v){
  v.defeated=true;
  scene.remove(v.mesh);
  if(v.zoneMesh) scene.remove(v.zoneMesh);
  if(v.type==='umbrella'){
    for(let i=slipperyZones.length-1;i>=0;i--){
      if(slipperyZones[i].source==='umbrella'){scene.remove(slipperyZones[i].mesh);slipperyZones.splice(i,1);}
    }
    addHonor(10); G.goodDeeds++;
    showCenter('우산을 정리하고 물기를 닦았습니다! 매너 +10',false,1.8);
  } else {
    showCenter('냉방 장치를 원상복구했습니다!',false,1.8);
  }
  AudioFX.play('repair');
}

function spawnDoorBlocker(){
  if(G.doorBlocker) return;
  const mesh=makeCharacter(0x34495e,0xe8c39e);
  mesh.position.set(0,0,CAR.farWallZ+0.55);
  mesh.add(makeTag('문 앞 버티기','#34495e'));
  scene.add(mesh);
  G.doorBlocker={mesh,x:0,z:CAR.farWallZ+0.55,cleared:false,pressure:0};
  showCenter('문 앞을 막고 버티는 승객이 나타났습니다!',true,2.2);
}

function tryClearDoorBlocker(){
  const blocker=G.doorBlocker;
  if(!blocker || blocker.cleared || G.posture!==Posture.STANDING) return false;
  if(Math.hypot(player.position.x-blocker.x,player.position.z-blocker.z)>1.35) return false;
  blocker.cleared=true;
  blocker.mesh.position.x=CAR.doorX+1.1;
  blocker.x=blocker.mesh.position.x;
  addHonor(5); G.goodDeeds++;
  showCenter('통행을 위해 승객을 문 옆으로 치웠습니다.',false,1.8);
  if(G.state===GameState.ARRIVAL) openDoors();
  return true;
}

function updateDoorBlocker(dt){
  const blocker=G.doorBlocker;
  if(!blocker || blocker.cleared) return;
  blocker.mesh.position.y=Math.sin(performance.now()*.004)*.025;
  if(G.stageElapsed>=70){
    blocker.pressure+=dt;
    damage((1.2+Math.min(2,blocker.pressure*.12))*dt);
  }
}
