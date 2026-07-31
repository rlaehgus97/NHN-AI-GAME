export const StationSystem = {
  resetStationScope(context, stationIndex) {
    context.G.stationIndex = stationIndex;
    context.G.villainIgnoreTimer = 0;
    context.G.knockback = { timer: 0, dirX: 0, dirZ: 0, distance: 0 };
    context.G.stun = 0;

    context.seats.forEach(seat => {
      seat.captureProgress = 0;
      seat.npcProgress = 0;
      seat.npcClaimantRef = null;
      if (!seat.occupied) {
        seat.reservedFor = null;
        seat.reservedTimer = 0;
      }
    });

    context.villains.forEach(villain => {
      if (!villain.defeated && villain.mesh) context.scene.remove(villain.mesh);
    });
    context.villains.length = 0;
  }
};

