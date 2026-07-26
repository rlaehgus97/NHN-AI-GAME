"use strict";
/* constants.js — 게임 밸런스 상수, 상태 enum, 차량 치수(CAR) */

  /* ============ Game constants and balance ============ */
  const BALANCE = {
    stageDuration: 45,
    boardingDuration: 3,
    seatRushDuration: 7,
    arrivalExitDuration: 8,

    maxHealth: 100,
    maxHonor: 100,
    startHonor: 50,

    standingDrainPerSecond: 2.2,
    crowdedDrainMultiplier: 1.5,   // (프로토타입: 빌런 근접시 적용)
    villainDrainMultiplier: 1.8,
    seatedRecoveryPerSecond: 5,
    handleDrainPerSecond: 0.5,

    villainCollisionDamage: 10,
    suddenStopDamage: 8,

    bagAttackCooldown: 0.65,
    bagAttackRange: 2.2,
    bagAttackArc: Math.PI * 0.65,

    villainDefeatHealthReward: 10,
    villainDefeatHonorReward: 10,

    yieldSeatHonorReward: 20,
    ignoreSeatHonorPenalty: 35,

    kindnessBuffDuration: 8,
    kindnessDrainMultiplier: 0.5,

    // 플레이어 이동
    moveSpeed: 4.2,
    dashSpeed: 7.5,
    // 좌석 경쟁
    seatCaptureGainPerPress: 22,
    seatCaptureDecayPerSecond: 14,
    npcCaptureRatePerSecond: 20
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
                doorX:1.5, platformZ:-3.6, farWallZ:-2.2, nearWallZ:2.2 };

