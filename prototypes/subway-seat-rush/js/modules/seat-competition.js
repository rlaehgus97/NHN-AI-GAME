const defaultStrategy = {
  // 실제 자리 경쟁이 진행 중일 때만 호출된다. amount만큼 게이지를 올리고,
  // 100에 도달하면 true(플레이어 승리)를 반환한다.
  playerPress(seat, amount) {
    if (!seat || seat.occupied) return false;
    const gain = typeof amount === "number" ? amount : 100;
    seat.captureProgress = Math.min(100, (seat.captureProgress || 0) + gain);
    return seat.captureProgress >= 100;
  },

  npcArrived(seat, npc) {
    if (seat.occupied || seat.reservedFor === "player") return false;
    seat.npcClaimantRef = npc;
    return true;
  }
};

let strategy = defaultStrategy;

export const SeatCompetition = {
  setStrategy(nextStrategy) {
    strategy = { ...defaultStrategy, ...nextStrategy };
  },

  resetStrategy() {
    strategy = defaultStrategy;
  },

  playerPress(seat, amount) {
    return strategy.playerPress(seat, amount);
  },

  npcArrived(seat, npc) {
    return strategy.npcArrived(seat, npc);
  },

  resetSeat(seat) {
    seat.captureProgress = 0;
    seat.npcProgress = 0;
    seat.npcClaimantRef = null;
  }
};
