"use strict";
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
    timeText: document.getElementById('timeText'),
    stationText: document.getElementById('stationText'),
    progressFill: document.getElementById('progressFill'),
    bagCd: document.getElementById('bagCd'),
    interact: document.getElementById('interactPrompt'),
    centerMsg: document.getElementById('centerMsg'),
    seatWrap: document.getElementById('seatGaugeWrap'),
    seatFill: document.getElementById('seatGaugeFill'),
    seatLabel: document.getElementById('seatGaugeLabel')
  };
  const STATION_NAMES = ['출발','1번째 역','2번째 역','3번째 역','목적지'];

  function updateHUD(){
    const hp = Math.round(G.health);
    UI.healthFill.style.width = (G.health/BALANCE.maxHealth*100)+'%';
    UI.healthNum.textContent = hp;
    UI.healthWarn.textContent = (G.health<=25)? '위험! 체력이 부족합니다' : '';
    if (G.health<=25){ UI.healthFill.style.filter='brightness(1.2) saturate(1.4)'; }
    else UI.healthFill.style.filter='none';

    const ho = Math.round(G.honor);
    UI.honorFill.style.width = (G.honor/BALANCE.maxHonor*100)+'%';
    UI.honorNum.textContent = ho;
    UI.honorGrade.textContent = honorGrade(G.honor);
    UI.honorWarn.textContent = (G.honor<=0)? '명예가 바닥났습니다. 이대로 도착해도 실패!' : '';

    UI.timeText.textContent = Math.max(0,G.timeLeft).toFixed(1);
    UI.progressFill.style.width = (G.stageElapsed/BALANCE.stageDuration*100)+'%';
    UI.stationText.textContent = STATION_NAMES[Math.min(G.stationIndex,4)];

    const pt = G.posture===Posture.SEATED?'앉음': G.posture===Posture.HOLDING_HANDLE?'손잡이':'서 있음';
    UI.postureTag.textContent = '자세: '+pt;

    let buffs=[];
    if (G.kindness.active) buffs.push('선행('+G.kindness.remaining.toFixed(0)+'s)');
    if (G.villainRewardBuff>0) buffs.push('의인('+G.villainRewardBuff.toFixed(0)+'s)');
    UI.buffRow.textContent = buffs.length? '버프: '+buffs.join(' · ') : '';

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

