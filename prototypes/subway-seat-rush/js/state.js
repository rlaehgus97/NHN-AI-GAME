"use strict";
/* state.js — 전역 변수(scene/player/npcs 등)와 게임 진행 상태(G) 초기화 */

  /* ============ Globals ============ */
  let scene, camera, renderer, clock;
  let player;                 // THREE.Group
  let seats = [];             // Seat objects
  let handles = [];           // HandlePoint objects
  let npcs = [];              // NPCPassenger (competitors)
  let villains = [];          // Villain objects
  let doorLeft, doorRight;    // 문 메시
  let exitMarker;             // 출구 표시
  const keys = {};            // 눌린 키 상태
  let leftMouseDown = false;
  let started = false;        // 애니메이션 루프 1회만 시작

  // 게임 진행 상태
  const G = {};
  let nextMidStationFlow = 'boarding';

  // 범위 [min,max] 내 균등 난수
  function randRange(range){ return range[0] + Math.random()*(range[1]-range[0]); }

  function resetGameData() {
    G.state = GameState.READY;
    G.posture = Posture.STANDING;
    G.health = BALANCE.maxHealth;
    G.honor = BALANCE.startHonor;
    G.timeLeft = BALANCE.stageDuration;
    G.stateTimer = 0;          // 현재 상태 경과
    G.stageElapsed = 0;        // TRAVELING 총 경과
    G.stationIndex = 0;
    // 시작 시 NPC가 0명이 되는 분기는 사용하지 않는다.
    // 대량 승차/하차 분기는 이후 스테이지 설정에서 명시적으로 선택한다.
    G.initialCrowd = 'crowded';
    // 첫 게임은 대량 승차를 보장하고, 재시작할 때마다 승차/하차를 교대로 테스트한다.
    G.midStationFlow = nextMidStationFlow;
    if(started){
      nextMidStationFlow = nextMidStationFlow==='boarding' ? 'disembarking' : 'boarding';
    }
    G.intermediateDoorTimer = 0;
    G.pendingSuddenStop = 0;
    G.emptySeatFillTimer = 0;
    G.seatsSettled = false;
    G.seatsSettledAt = 0;
    G.doorsOpen = false;
    G.occupiedSeat = null;
    G.heldHandle = null;

    // 가방 공격: WINDUP → STRIKE → RECOVERY 상태 머신
    G.bagCooldown = 0;
    G.bagAttack = { phase: 'IDLE', timer: 0, hasHit: false };

    // 착석 → 기립 전환 지연 (일어나는 도중엔 이동/공격 불가)
    G.risingTimer = 0;

    G.facing = new THREE.Vector2(0, -1); // 기본: 차량 안쪽(위)
    G.kindness = { active:false, remaining:0, mult:1 };
    G.villainRewardBuff = 0;   // 빌런 보상: 잠깐 감소량 30%↓ 남은시간
    G.stun = 0;                // 경직
    G.shake = 0;               // 화면 흔들림 잔량
    G.knockback = { timer:0, dirX:0, dirZ:0, distance:0 }; // 피격 넉백(짧은 시간 밀려나는 연출)
    G.villainIgnoreTimer = 0;  // 빌런을 방치할 때 명예가 깎이는 주기 타이머
    G.goodDeeds = 0;
    G.villainsDefeated = 0;
    G.arrivalTimeLeft = BALANCE.arrivalExitDuration;

    // 이벤트 플래그
    G.flags = { drunkSpawned:false, backpackSpawned:false, yieldDone:false,
                suddenStopWarned:false, suddenStopDone:false };
    G.eventReturnState = null;
    G.centerMsgTimer = 0;

    // 이벤트 발생 시간: 매 게임(재시작 포함)마다 새로 랜덤 결정
    G.eventSchedule = {
      drunkAt: randRange(BALANCE.drunkSpawnRange),
      backpackAt: randRange(BALANCE.backpackSpawnRange),
      suddenStopWarnAt: randRange(BALANCE.suddenStopRange)
    };
    if (window.GameModules) window.GameModules.director.reset();
  }
