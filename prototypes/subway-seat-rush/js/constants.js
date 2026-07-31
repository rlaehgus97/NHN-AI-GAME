"use strict";
/* constants.js — 게임 밸런스 상수, 상태 enum, 차량 치수(CAR) */

  /* ============ Game constants and balance ============ */
  const BALANCE = {
    stageDuration: 75,

    // 탑승 단계
    boardingApproachDuration: 0.6,   // 열차 도착 안내 후 문이 열리기까지
    boardingEntryDuration: 1.0,      // NPC가 객차 중앙에 들어오는 시간
    seatRushDuration: 3.2,
    seatSettleLeadTime: 0.45,        // 운행 시작 전 NPC 착석 정산을 먼저 보여주는 시간
    arrivalExitDuration: 5,
    disembarkRatio: 0.4,  // 목적지 도착 시 함께 하차하는 승객 비율

    maxHealth: 100,
    maxHonor: 100,
    startHonor: 50,

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

    // 플레이어 이동
    moveSpeed: 4.2,
    dashSpeed: 7.5,

    // 좌석 경쟁 (플레이어 게이지 vs 경쟁 NPC 게이지, 먼저 100에 도달하는 쪽이 승리)
    seatCaptureGainPerPress: 16,       // 완화 (기존 22 → 16): 연타 스킬 비중 증가
    seatCaptureDecayPerSecond: 14,
    npcCaptureRatePerSecond: 22,       // NPC 기준 점유 속도 (개체별로 ±20% 편차 적용됨)

    competitorCount: 14,  // 좌석 경쟁 NPC 수 (좌석 10개보다 많아 항상 몇 명은 서서 감)
    seatCount: 10,         // 전체 좌석 수 (scene.js의 seatDefs 배열과 일치해야 함)

    // 이벤트 발생 시간 범위(초). 게임 시작마다 이 범위 내에서 랜덤 결정됨
    yieldMinTime: 24,
    drunkSpawnRange: [5, 9],
    backpackSpawnRange: [15, 22],
    suddenStopRange: [32, 38],
    suddenStopWarnLeadTime: 1.5   // 급정거 경고 후 실제 발생까지 간격
  };

  /* ============ Game state / enums ============ */
  const GameState = {
    READY: 'READY', BOARDING: 'BOARDING', SEAT_RUSH: 'SEAT_RUSH',
    TRAVELING: 'TRAVELING', EVENT: 'EVENT', ARRIVAL: 'ARRIVAL',
    CLEAR: 'CLEAR', GAME_OVER: 'GAME_OVER'
  };
  const Posture = { STANDING:'STANDING', SEATED:'SEATED', HOLDING_HANDLE:'HOLDING_HANDLE' };

  // 차량 내부 경계 (aisle)
  const CAR = { xMin:-7.3, xMax:7.3, aisleZMin:-1.25, aisleZMax:1.25,
                doorX:1.5, platformZ:-3.6, farWallZ:-2.2, nearWallZ:2.2,
                seatSitY: 0.68,       // 캐릭터 하체가 좌석 상판에 묻히지 않는 착석 높이
                seatSitOffset: 0.10,  // NPC와 플레이어가 함께 쓰는 착석 중심 위치
                seatedScaleY: 0.82 };
