"use strict";
/* constants.js — 게임 밸런스 상수, 상태 enum, 차량 치수(CAR) */

  /* ============ Game constants and balance ============ */
  const BALANCE = {
    stageDuration: 75,

    // 탑승 단계
    boardingApproachDuration: 0.8,   // 0~5초 탑승/HUD 구간 안에서 문 열림
    boardingEntryDuration: 2.4,      // NPC와 플레이어 탑승
    seatRushDuration: 1.8,           // 총 5초 후 자유 탐색 구간 진입
    seatSettleLeadTime: 0.45,        // 운행 시작 전 NPC 착석 정산을 먼저 보여주는 시간
    seatRushGraceTime: 2.6,          // 플레이어가 좌석으로 이동/경쟁 중이면 좌석 단계를 잠시 더 유지
    arrivalExitDuration: 5,
    disembarkRatio: 0.4,  // 목적지 도착 시 함께 하차하는 승객 비율

    maxHealth: 100,
    maxHonor: 100,
    startHonor: 50,

    // 스트레스 해소용 핸드폰 미니게임
    phoneUnlockStress: 40,
    phoneWorldTimeScale: 0.35,

    standingDrainPerSecond: 2.2,
    crowdedDrainMultiplier: 1.5,   // (프로토타입: 빌런 근접시 적용)
    villainDrainMultiplier: 1.8,
    nearVillainExtraDrain: 1.5,    // 자세와 관계없이 빌런 근접 시 추가로 붙는 위험(초당)
    villainIgnorePenaltyInterval: 3,  // 빌런을 퇴치하지 않고 방치할 때 명예가 깎이는 주기(초)
    villainIgnorePenaltyAmount: 1,    // 위 주기마다 깎이는 명예량
    seatedRecoveryPerSecond: 2,    // 착석 회복 완화 (기존 5 → 2)
    handleDrainPerSecond: 0.5,

    villainCollisionDamage: 10,
    backpackSeatedDamageMultiplier: 0.35, // 착석 중 백팩 피격 시 받는 피해 비율
    suddenStopDamage: 8,
    suddenStopSeatedMultiplier: 0.15,     // 착석 중 급정거 피해 비율(완전 무적 아님)

    // 피격 넉백(튕겨나가는 연출): 순간이동이 아니라 짧은 시간 동안 감속하며 밀려남
    knockbackDuration: 0.3,
    backpackKnockbackDistance: 2.6,  // 백팩 스윙에 맞았을 때 튕겨나가는 거리
    drunkKnockbackDistance: 1.6,     // 취객과 충돌했을 때 튕겨나가는 거리

    standUpDelay: 0.5,             // 일어서기(E) 후 이동/공격 불가 지연시간

    // 가방 공격 (윈드업 → 스트라이크 → 리커버리)
    bagAttackCooldown: 0.65,
    bagAttackRange: 2.2,
    bagAttackArc: Math.PI * 0.65,
    bagWindupDuration: 0.10,
    bagStrikeDuration: 0.10,
    bagRecoveryDuration: 0.18,
    hitStopDuration: 0.05,
    armWindupZ: 0.35,               // 어깨 피벗: 뒤로 당기는 각도
    armStrikeZ: -1.9,               // 어깨 피벗: 앞으로 휘두르는 각도

    villainDefeatHealthReward: 10,
    villainDefeatHonorReward: 15,   // 명예 보상 강화 (기존 10 → 15)
    seatReservationDuration: 5,     // 빌런 퇴치 보상 좌석 예약 시간(초)

    yieldSeatHonorReward: 20,
    ignoreSeatHonorPenalty: 15,     // 완화 (기존 35 → 15)

    kindnessBuffDuration: 8,
    kindnessDrainMultiplier: 0.5,

    /* ============ 플레이어 이동 (마우스 포인터 방향 이동) ============ */
    moveSpeed: 5.5,                 // 기본 이동 속도 (기존 4.2 → 5.5)
    dashSpeed: 8.5,                 // SHIFT 대시 속도 (기존 7.5 → 8.5)
    pointerMoveDeadzone: 0.30,      // 포인터가 이 거리 안이면 제자리(떨림 방지)
    pointerFaceDeadzone: 0.35,      // 정지 상태에서 포인터를 바라보기 시작하는 최소 거리

    /* ============ 좌석 클릭 / 자동 이동 ============ */
    seatClickMaxDistance: 22,       // 이 거리 안의 좌석만 클릭으로 선택 가능(사실상 객차 전체)
    seatArriveDistance: 0.42,       // 좌석 상호작용 지점 도착 판정 거리 → 도착 시 즉시 착석
    seatCompetitionRange: 1.55,     // 플레이어와 경쟁 NPC가 이 거리 안에 함께 있어야 경쟁 시작
    seatCompetitionCancelRange: 2.9,// 경쟁 중 이 거리보다 멀어지면 경쟁 포기
    villainClickRadius: 1.3,        // 포인터가 빌런 위치에서 이 거리 안이면 "빌런 클릭"으로 판정

    // 좌석 경쟁 (플레이어 SPACE 연타 게이지 vs 경쟁 NPC 게이지, 먼저 100에 도달하는 쪽이 승리)
    seatCaptureGainPerPress: 13,
    seatCaptureDecayPerSecond: 12,
    npcCaptureRatePerSecond: 24,       // NPC 기준 점유 속도 (개체별로 ±20% 편차 적용됨)

    competitorCount: 16,  // 좌석 경쟁 NPC 수 (좌석 15개보다 많아 항상 몇 명은 서서 감)
    seatCount: 15,        // 전체 좌석 수 (scene.js의 seatDefs 배열과 반드시 일치)

    // 이벤트 발생 시간 범위(초). 게임 시작마다 이 범위 내에서 랜덤 결정됨
    yieldMinTime: 24,
    drunkSpawnRange: [5, 9],
    backpackSpawnRange: [15, 22],
    suddenStopRange: [32, 38],
    suddenStopWarnLeadTime: 1.5   // 급정거 경고 후 실제 발생까지 간격
  };

  /* ============ Game state / enums ============ */
  const AI_DIRECTOR = {
    longSeatDuration: 10,
    rapidToggleWindow: 6,
    rapidToggleTransitions: 3,
    seatLockDuration: 5,
    longSeatCooldown: 15,
    rapidToggleCooldown: 12,
    constraintMinGap: 3
  };

  const GameState = {
    READY: 'READY', BOARDING: 'BOARDING', SEAT_RUSH: 'SEAT_RUSH',
    TRAVELING: 'TRAVELING', EVENT: 'EVENT', ARRIVAL: 'ARRIVAL',
    CLEAR: 'CLEAR', GAME_OVER: 'GAME_OVER'
  };
  const Posture = { STANDING:'STANDING', SEATED:'SEATED', HOLDING_HANDLE:'HOLDING_HANDLE' };

  /* ============ 차량 치수 (확장판) ============
     기존: 길이 15.4 / 통로 ±1.25 / 좌석 10석
     변경: 길이 19.0 / 통로 ±1.70 / 좌석 15석 — 통로와 좌석 간격을 넓혀 이동을 편하게 함
  ============================================== */
  const CAR_LENGTH = 19.0;   // 차량 전체 길이 (scene.js와 공유)
  const CAR_WIDTH  = 6.0;    // 차량 전체 폭 (scene.js와 공유)

  const CAR = { xMin:-8.6, xMax:8.6, playerXMin:-15.35, playerXMax:15.35,
                leftConnectorX:-14.20, connectorX:14.20, connectorHalfWidth:0.75,
                aisleZMin:-1.70, aisleZMax:1.70,
                doorX:1.9, platformZ:-4.6, farWallZ:-2.9, nearWallZ:2.9,
                benchZ: 1.75,         // GLB 모델 벤치 중심 z (양쪽 대칭)
                seatZ: 1.70,          // GLB 모델 좌석 상판 중심 z (양쪽 대칭)
                seatInteractOffset: 0.95, // 좌석 → 통로쪽 상호작용 지점까지 거리
                seatSitY: 0.68,       // 캐릭터 하체가 좌석 상판에 묻히지 않는 착석 높이
                seatSitOffset: 0.10,  // NPC와 플레이어가 함께 쓰는 착석 중심 위치
                seatedScaleY: 0.82 };
