"use strict";
/* Commute-survival UI shell: rebuild presentation while preserving gameplay-facing IDs. */
  (function buildCommuteUI(){
    const left=document.getElementById('hudLeft');
    const right=document.getElementById('hudRight');
    const controls=document.getElementById('controlsHint');
    const startPanel=document.querySelector('#startScreen .panel');
    if(left) left.innerHTML=`
      <div class="hudBlock transitCard">
        <div class="cardScrew"></div>
        <div class="barLabel vitalLabel"><span><i class="hudIcon stressIcon">!</i> 통근 스트레스</span><strong id="healthNum">0</strong></div>
        <div class="bar stressBar"><span id="healthFill"></span></div>
        <div id="healthWarn"></div>
        <div class="barLabel vitalLabel honorLabel"><span><i class="hudIcon honorIcon">★</i> 명예</span><strong id="honorNum">50</strong></div>
        <div class="bar honorBar"><span id="honorFill"></span></div>
        <div id="honorGrade">평범한 시민</div><div id="honorWarn"></div>
        <div class="statusRail"><div id="postureTag">서 있음</div><div id="seatStatus">빈자리 · 클릭해서 착석</div></div>
        <div id="buffRow"></div>
      </div>`;
    if(right) right.innerHTML=`
      <div class="hudBlock routeBoard">
        <div class="routeTop"><span class="lineBadge">1</span><div id="stationText">서울역</div></div>
        <div class="routeMap"><div id="progressTrack"><div id="progressFill"></div></div>
          <div class="stationNodes"><i data-station="0"></i><i data-station="1"></i><i data-station="2"></i><i data-station="3"></i><i data-station="4"></i></div>
          <div class="stationDots"><span>서울역</span><span>시청</span><span>종각</span><span>종로3가</span><span>종로5가</span></div>
        </div>
        <div class="routeBottom"><div><strong id="timeText">45.0</strong><span>출발</span></div><div id="bagCd">▣ 가방: 준비됨</div></div>
      </div>`;
    if(controls) controls.innerHTML='<b>SHIFT</b> 대시 <em>·</em> <b>F</b> 가방 <em>·</em> <b>E</b> 손잡이 <em>·</em> <b>P</b> 핸드폰 <span>(스트레스 40+)</span>';
    if(startPanel) startPanel.innerHTML=`
      <div class="startEyebrow">SEOUL LINE 1 · AFTER WORK SURVIVAL</div>
      <h1><span class="titleTrain">▣</span> 지옥철 생존기</h1>
      <p class="startLead">퇴근길 혼잡을 버티고 목적지에서 무사히 하차하라.</p>
      <div class="ruleCards">
        <div><i>01</i><b>스트레스 관리</b><span>서 있거나 위험에 노출되면 빠르게 상승</span></div>
        <div><i>02</i><b>빈자리 경쟁</b><span>좌석을 선점하고 필요하면 SPACE 연타</span></div>
        <div><i>03</i><b>명예 선택</b><span>퇴근도 중요하지만 시민의 품격도 지킬 것</span></div>
      </div>
      <div class="ctrlList"><div class="ctrlSub"><b>마우스</b> 이동·좌석 선택　<b>SHIFT</b> 대시　<b>F</b> 가방　<b>E</b> 손잡이　<b>P</b> 핸드폰</div></div>
      <button id="startBtn" class="btn"><span>교통카드 태그</span> 퇴근 시작</button>`;
  })();
/* ui.js — HUD 업데이트 및 화면 메시지 표시 */

  /* ============ UI manager ============ */
  const UI = {
    healthFill: document.getElementById('healthFill'),
    healthNum: document.getElementById('healthNum'),
    healthWarn: document.getElementById('healthWarn'),
    honorFill: document.getElementById('honorFill'),
    honorNum: document.getElementById('honorNum'),
    honorGrade: document.getElementById('honorGrade'),
    honorWarn: document.getElementById('honorWarn'),
    postureTag: document.getElementById('postureTag'),
    buffRow: document.getElementById('buffRow'),
    seatStatus: document.getElementById('seatStatus'),
    timeText: document.getElementById('timeText'),
    stationText: document.getElementById('stationText'),
    progressFill: document.getElementById('progressFill'),
    bagCd: document.getElementById('bagCd'),
    interact: document.getElementById('interactPrompt'),
    centerMsg: document.getElementById('centerMsg'),
    seatWrap: document.getElementById('seatGaugeWrap'),
    seatFill: document.getElementById('seatGaugeFill'),
    seatRivalFill: document.getElementById('seatGaugeRival'),
    seatLabel: document.getElementById('seatGaugeLabel')
  };
  const STATION_NAMES = ['출발','1번째 역','2번째 역','3번째 역','목적지'];

  function updateHUD(){
    const stress = Math.round(G.stress||0);
    UI.healthFill.style.width = (stress/BALANCE.maxHealth*100)+'%';
    UI.healthNum.textContent = stress;
    UI.healthWarn.textContent = (stress>=75)? '위험! 통근 스트레스가 높습니다' : '';
    if (stress>=75){ UI.healthFill.style.filter='brightness(1.2) saturate(1.4)'; }
    else UI.healthFill.style.filter='none';

    const ho = Math.round(G.honor);
    UI.honorFill.style.width = (G.honor/BALANCE.maxHonor*100)+'%';
    UI.honorNum.textContent = ho;
    UI.honorGrade.textContent = honorGrade(G.honor);
    UI.honorWarn.textContent = (G.honor<=0)? '명예가 바닥났습니다. 이대로 도착해도 실패!' : '';

    UI.timeText.textContent = Math.max(0,G.timeLeft).toFixed(1);
    UI.progressFill.style.width = (G.stageElapsed/BALANCE.stageDuration*100)+'%';
    const routeNames=['서울역','시청','종각','종로3가','종로5가'];
    const stationIndex=Math.min(G.stationIndex,4);
    UI.stationText.textContent = routeNames[stationIndex];
    document.querySelectorAll('.stationNodes i').forEach((node,index)=>{
      node.classList.toggle('passed',index<stationIndex);
      node.classList.toggle('active',index===stationIndex);
    });

    const pt = G.posture===Posture.SEATED?'앉음': G.posture===Posture.HOLDING_HANDLE?'손잡이':'서 있음';
    UI.postureTag.textContent = pt;

    let buffs=[];
    if (G.kindness.active) buffs.push('선행('+G.kindness.remaining.toFixed(0)+'s)');
    if (G.villainRewardBuff>0) buffs.push('의인('+G.villainRewardBuff.toFixed(0)+'s)');
    if (G.encircled) buffs.push('포위 상태');
    UI.buffRow.textContent = buffs.length? '버프: '+buffs.join(' · ') : '';

    // 좌석 선택 상태 안내 (빈자리 / 선택 / 경쟁)
    if (UI.seatStatus){
      const emptyCount = seats.filter(s=>!s.occupied).length;
      if (G.seatCompetitionActive) UI.seatStatus.textContent = '🔴 자리 경쟁 중! SPACE 연타';
      else if (G.targetSeat) UI.seatStatus.textContent = '🔵 선택한 좌석으로 이동 중';
      else if (G.posture===Posture.SEATED) UI.seatStatus.textContent = '🟢 착석 완료';
      else UI.seatStatus.textContent = '빈자리 '+emptyCount+'석 · 클릭해서 착석';
    }

    UI.bagCd.textContent = G.bagCooldown>0 ? ('가방: '+G.bagCooldown.toFixed(1)+'s') : '가방: 준비됨';
  }

  let centerTimer=0;
  let centerQueue=[];   // 메시지가 겹칠 때 순서대로 보여주기 위한 대기열

  function showCenter(text, warn, dur){
    if (centerTimer>0){
      // 이미 다른 메시지가 표시 중이면, 덮어쓰지 않고 대기열에 쌓아서 순서대로 보여준다.
      if (centerQueue.length < 3){ centerQueue.push({ text, warn, dur: dur||1.5 }); }
      return;
    }
    displayCenterNow(text, warn, dur);
  }

  function displayCenterNow(text, warn, dur){
    UI.centerMsg.querySelector('span').textContent = text;
    UI.centerMsg.classList.toggle('warn', !!warn);
    UI.centerMsg.classList.add('show');
    centerTimer = dur||1.5;
  }

  // 현재 메시지의 표시 시간이 끝났을 때 호출: 대기열에 다음 메시지가 있으면 이어서 보여줌
  function advanceCenterQueue(){
    if (centerQueue.length){
      const next = centerQueue.shift();
      displayCenterNow(next.text, next.warn, next.dur);
    } else {
      UI.centerMsg.classList.remove('show');
    }
  }

  function resetCenterMessages(){
    centerQueue.length = 0;
    centerTimer = 0;
    UI.centerMsg.classList.remove('show');
  }

  function setInteract(text){ UI.interact.innerHTML = text || '&nbsp;'; }
