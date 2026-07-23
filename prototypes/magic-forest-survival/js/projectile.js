// ============================================================
// PROJECTILE: 마법 투사체 클래스
// ============================================================
class Projectile {
  /**
   * @param {number} x - 발사 위치 (월드 좌표)
   * @param {number} y
   * @param {number} angle - 발사 각도 (라디안)
   * @param {number} damage - 공격력
   */
  constructor(x, y, angle, damage) {
    this.x = x;
    this.y = y;
    this.angle = angle;
    this.damage = damage;
    this.alive = true;

    this.vx = Math.cos(angle) * CONFIG.PROJECTILE.SPEED;
    this.vy = Math.sin(angle) * CONFIG.PROJECTILE.SPEED;

    this.size = CONFIG.PROJECTILE.SIZE;
    this.travelDist = 0; // 이동 거리 추적
    this.age = 0;        // 경과 시간 (애니메이션용)

    // 색상: 마젠타~시안~골드 범위에서 랜덤
    const hues = [200, 260, 300, 50];
    this.hue = hues[Math.floor(Math.random() * hues.length)];
  }

  /** @param {number} dt */
  update(dt, particles) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.travelDist += CONFIG.PROJECTILE.SPEED * dt;
    this.age += dt;

    // 꼬리 파티클 생성
    if (Math.random() < 0.8) {
      spawnParticles(particles, this.x, this.y, 'trail', 1);
    }

    // 최대 사거리 초과 시 제거
    if (this.travelDist >= CONFIG.PROJECTILE.MAX_RANGE) {
      this.alive = false;
    }
  }

  /**
   * 투사체 그리기 (마법 별 형태 + 발광)
   * 이 함수를 수정하면 투사체 외형을 교체할 수 있습니다.
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} camX
   * @param {number} camY
   */
  draw(ctx, camX, camY) {
    const sx = this.x - camX;
    const sy = this.y - camY;
    const pulse = 1 + 0.3 * Math.sin(this.age * 18); // 크기 맥동
    const r = this.size * pulse;

    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(this.age * 5);

    // 외부 발광 (큰 글로우)
    const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 3.5);
    glow.addColorStop(0, `hsla(${this.hue}, 100%, 90%, 0.6)`);
    glow.addColorStop(1, `hsla(${this.hue}, 100%, 70%, 0)`);
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, r * 3.5, 0, Math.PI * 2);
    ctx.fill();

    // 별 모양 몸체
    ctx.shadowColor = `hsl(${this.hue}, 100%, 80%)`;
    ctx.shadowBlur = 16;

    // 외부 별
    ctx.fillStyle = `hsl(${this.hue}, 100%, 85%)`;
    drawStar(ctx, 0, 0, r * 1.4, r * 0.6, 5);
    ctx.fill();

    // 내부 흰 코어
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  /** 적중 시 폭발 파티클 생성 */
  onHit(particles) {
    spawnParticles(particles, this.x, this.y, 'magic_explosion', 8);
    this.alive = false;
  }
}
