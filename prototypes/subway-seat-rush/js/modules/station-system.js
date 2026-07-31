export const StationSystem = {
  resetStationScope(context, stationIndex) {
    context.G.stationIndex = stationIndex;
    context.G.villainIgnoreTimer = 0;
    context.G.knockback = { timer: 0, dirX: 0, dirZ: 0, distance: 0 };
    context.G.stun = 0;
    context.G.pendingSuddenStop = 0;
    context.G.villainRewardBuff = 0;

    context.seats.forEach(seat => {
      seat.captureProgress = 0;
      seat.npcProgress = 0;
      seat.npcClaimantRef = null;
      if (!seat.occupied && seat.reservedFor!=='player-safety') {
        seat.reservedFor = null;
        seat.reservedTimer = 0;
      }
    });

    context.villains.forEach(villain => {
      if (!villain.defeated && villain.mesh) context.scene.remove(villain.mesh);
      if (villain.zoneMesh) context.scene.remove(villain.zoneMesh);
    });
    context.villains.length = 0;

    (context.npcs || []).forEach(npc => {
      npc.avoidVillainTarget = null;
      npc.avoidVillainTimer = 0;
      npc.fleeingVillain = false;
      npc.avoidSeatTimer = 0;
      npc.seatApproachPhase = null;
    });
  }
};
