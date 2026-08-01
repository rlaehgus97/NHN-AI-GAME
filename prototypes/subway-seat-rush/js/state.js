"use strict";
/* state.js — 전역 변수(scene/player/npcs 등)와 게임 진행 상태(G) 초기화 */

  /* ============ Globals ============ */
  let scene, camera, renderer, clock;
  let player;                 // THREE.Group
  let seats = [];             // Seat objects
  let handles = [];           // HandlePoint objects
  let npcs = [];              // NPCPassenger (competitors)
  let villains = [];          // Villain objects
  let hazardZones = [];       // 설치형 스트레스 존
  let slipperyZones = [];     // 국물/우산이 만든 미끄러운 바닥
  let doorLeft, doorRight;    // 문 메시
  let exitMarker;             // 출구 표시
  const keys = {};            // 눌린 키 상태 (SHIFT / E / F / SPACE 전용, 이동키는 사용하지 않음)

  /* ============ 마우스 포인터 입력 ============ */
  let raycaster = null;              // 좌석/빌런/바닥 판정용
  let pointerNDC = null;             // 정규화된 화면 좌표(-1~1)
  let groundPlane = null;            // y=0 평면 (포인터 월드 좌표 계산용)
  let seatPickables = [];            // 좌석 클릭 판정용 투명 박스 목록
  let leftMouseDown = false;         // 좌클릭 유지 여부 (G.pointerHeld와 동기화)
  let started = false;               // 애니메이션 루프 1회만 시작

  // 게임 진행 상태
  const G = {};

  // 범위 [min,max] 내 균등 난수
  function randRange(range){ return range[0] + Math.random()*(range[1]-range[0]); }

  function resetGameData() {
    G.state = GameState.READY;
    G.posture = Posture.STANDING;
    G.health = BALANCE.maxHealth;
    G.stress = 0;
    G.honor = BALANCE.startHonor;
    G.timeLeft = BALANCE.stageDuration;
    G.stateTimer = 0;          // 현재 상태 경과
    G.stageElapsed = 0;        // TRAVELING 총 경과
    G.stationIndex = 0;
    G.initialCrowd = Math.random()<0.5 ? 'empty' : 'crowded';
    G.midStationFlow = G.initialCrowd==='empty' ? 'boarding' : 'disembarking';
    G.intermediateDoorTimer = 0;
    G.pendingSuddenStop = 0;
    G.emptySeatFillTimer = 0;
    G.crowdPressureTimer = 0;
    G.crowdWarningActive = false;
    G.crowdExposure = 0;
    G.encircled = false;
    G.crowdZoneMesh = null;
    G.surgeTimer = 0;
    G.doorBlocker = null;
    G.seatsSettled = false;
    G.seatsSettledAt = 0;
    G.doorsOpen = false;
    G.occupiedSeat = null;
    G.heldHandle = null;

    /* ============ 마우스 이동 / 좌석 선택 상태 ============ */
    G.pointerHeld = false;                       // 좌클릭을 누르고 있는가
    G.pointerWorld = { x:0, z:0, valid:false };  // 포인터가 가리키는 바닥의 월드 좌표
    G.hoveredSeat = null;                        // 마우스가 올라간 빈 좌석
    G.targetSeat = null;                         // 클릭으로 선택한 목표 좌석
    G.autoMovingToSeat = false;                  // 목표 좌석으로 자동 이동 중인가
    G.contestedSeat = null;                      // 실제로 경쟁이 진행 중인 좌석
    G.seatCompetitionActive = false;             // 좌석 경쟁 진행 여부
    leftMouseDown = false;

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
