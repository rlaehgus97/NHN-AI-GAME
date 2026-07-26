"use strict";
/* state.js — 전역 변수(scene/player/npcs 등)와 게임 진행 상태(G) 초기화 */

  /* ============ Globals ============ */
  let scene, camera, renderer, clock;
  let player;                 // THREE.Group
  let seats = [];             // Seat objects
  let handles = [];           // HandlePoint objects
  let npcs = [];              // NPCPassenger (ambient + competitors)
  let villains = [];          // Villain objects
  let doorLeft, doorRight;    // 문 메시
  let exitMarker;             // 출구 표시
  const keys = {};            // 눌린 키 상태
  let leftMouseDown = false;
  let started = false;        // 애니메이션 루프 1회만 시작

  // 게임 진행 상태
  const G = {};

  function resetGameData() {
    G.state = GameState.READY;
    G.posture = Posture.STANDING;
    G.health = BALANCE.maxHealth;
    G.honor = BALANCE.startHonor;
    G.timeLeft = BALANCE.stageDuration;
    G.stateTimer = 0;          // 현재 상태 경과
    G.stageElapsed = 0;        // TRAVELING 총 경과
    G.stationIndex = 0;
    G.doorsOpen = false;
    G.occupiedSeat = null;
    G.heldHandle = null;
    G.bagCooldown = 0;
    G.bagSwing = 0;            // 스윙 애니메이션 타이머
    G.facing = new THREE.Vector2(0, -1); // 기본: 차량 안쪽(위)
    G.kindness = { active:false, remaining:0, mult:1 };
    G.villainRewardBuff = 0;   // 빌런 보상: 잠깐 감소량 30%↓ 남은시간
    G.stun = 0;                // 경직
    G.shake = 0;               // 화면 흔들림 잔량
    G.goodDeeds = 0;
    G.villainsDefeated = 0;
    G.arrivalTimeLeft = BALANCE.arrivalExitDuration;
    G.exitReached = false;
    // 이벤트 플래그
    G.flags = { drunkSpawned:false, backpackSpawned:false, yieldDone:false,
                suddenStopWarned:false, suddenStopDone:false, yieldReturnPosture:null };
    G.eventReturnState = null;
    G.prioritySeatTimer = 0;   // 빌런 퇴치 후 우선 착석 안내 시간
    G.centerMsgTimer = 0;
  }

