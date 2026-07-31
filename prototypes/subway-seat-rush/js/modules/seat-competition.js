const defaultStrategy = {
  playerPress(seat) {
    if (seat.occupied) return false;
    seat.captureProgress = 100;
    return true;
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
