export const MovementSystem = {
  moveTowards(entity, target, dt, options = {}) {
    const speed = options.speed ?? entity.moveSpeed ?? 2.6;
    const stopDistance = options.stopDistance ?? 0.15;
    const dx = target.x - entity.x;
    const dz = target.z - entity.z;
    const distance = Math.hypot(dx, dz);

    if (distance <= stopDistance) {
      const idleModel = entity.mesh && entity.mesh.userData.characterModel;
      if (idleModel) idleModel.setLocomotion('idle');
      return true;
    }

    const step = Math.min(distance - stopDistance, speed * dt);
    entity.x += dx / distance * step;
    entity.z += dz / distance * step;

    if (options.bounds) {
      entity.x = Math.max(options.bounds.xMin, Math.min(options.bounds.xMax, entity.x));
      entity.z = Math.max(options.bounds.zMin, Math.min(options.bounds.zMax, entity.z));
    }

    if (entity.mesh) {
      entity.mesh.position.x = entity.x;
      entity.mesh.position.z = entity.z;
      entity.mesh.rotation.y = Math.atan2(dx, dz);
      // GLTF 캐릭터라면 걷는 동안만 Walking 크로스페이드(연출 개선, 선택사항).
      // 프리미티브 폴백 캐릭터는 userData.characterModel이 없으므로 완전히 no-op.
      const walkModel = entity.mesh.userData.characterModel;
      if (walkModel) walkModel.setLocomotion('walk');
    }
    return false;
  },

  approachPlayer(villain, playerPosition, dt, options = {}) {
    let target = {
      x: playerPosition.x + (villain.approachOffsetX || 0),
      z: playerPosition.z + (villain.approachOffsetZ || 0)
    };
    // 좌석은 통로 이동 범위 바깥에 있으므로, 도달 불가능한 목표를 계속 추적하지 않게 한다.
    if (options.bounds) {
      target = {
        x: Math.max(options.bounds.xMin, Math.min(options.bounds.xMax, target.x)),
        z: Math.max(options.bounds.zMin, Math.min(options.bounds.zMax, target.z))
      };
    }
    const arrived = this.moveTowards(villain, target, dt, {
      speed: options.speed ?? 1.35,
      stopDistance: options.stopDistance ?? 1.75,
      bounds: options.bounds
    });
    villain.hasApproachedPlayer = arrived;
    return arrived;
  }
};
