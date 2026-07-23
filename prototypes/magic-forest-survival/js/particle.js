// ============================================================
// PARTICLE: 파티클 효과 (마법 꼬리, 사망 연기, 타격 효과 등)
// ============================================================
class Particle {
  /**
   * @param {number} x - 월드 X 좌표
   * @param {number} y - 월드 Y 좌표
   * @param {string} type - 파티클 종류: 'sparkle'|'smoke'|'hit'|'trail'|'star'|'levelup'
   */
  constructor(x, y, type = 'sparkle') {
    this.x = x;
    this.y = y;
    this.type = type;
    this.alive = true;

    switch (type) {
      case 'trail': // 투사체 꼬리
        this.vx = randFloat(-20, 20);
        this.vy = randFloat(-20, 20);
        this.life = randFloat(0.15, 0.35);
        this.maxLife = this.life;
        this.size = randFloat(3, 7);
        this.color = `hsl(${randFloat(180, 280).toFixed(0)}, 100%, 80%)`;
        break;

      case 'sparkle': // 마법봉 발사 이펙트
        this.vx = randFloat(-80, 80);
        this.vy = randFloat(-80, 80);
        this.life = randFloat(0.2, 0.5);
        this.maxLife = this.life;
        this.size = randFloat(2, 5);
        this.color = `hsl(${randFloat(200, 300).toFixed(0)}, 100%, 85%)`;
        break;

      case 'hit': // 적 피격 이펙트
        this.vx = randFloat(-120, 120);
        this.vy = randFloat(-120, 120);
        this.life = randFloat(0.15, 0.35);
        this.maxLife = this.life;
        this.size = randFloat(3, 8);
        this.color = `hsl(${randFloat(0, 40).toFixed(0)}, 100%, 75%)`;
        break;

      case 'smoke': // 적 사망 어두운 연기
        this.vx = randFloat(-40, 40);
        this.vy = randFloat(-80, -20);
        this.life = randFloat(0.6, 1.2);
        this.maxLife = this.life;
        this.size = randFloat(8, 22);
        this.color = `hsl(${randFloat(260, 300).toFixed(0)}, 60%, ${randFloat(10, 25).toFixed(0)}%)`;
        this.rotation = randFloat(0, Math.PI * 2);
        this.rotSpeed = randFloat(-2, 2);
        break;

      case 'blood': // 적 사망 어두운 파티클
        this.vx = randFloat(-150, 150);
        this.vy = randFloat(-150, 50);
        this.life = randFloat(0.3, 0.7);
        this.maxLife = this.life;
        this.size = randFloat(3, 9);
        this.color = `hsl(${randFloat(270, 310).toFixed(0)}, 80%, ${randFloat(15, 30).toFixed(0)}%)`;
        this.gravity = 200;
        break;

      case 'star': // 레벨업 별 파티클
        const angle = randFloat(0, Math.PI * 2);
        const speed = randFloat(80, 200);
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;
        this.life = randFloat(0.5, 1.2);
        this.maxLife = this.life;
        this.size = randFloat(4, 10);
        this.color = `hsl(${randFloat(40, 80).toFixed(0)}, 100%, 80%)`;
        this.rotation = 0;
        this.rotSpeed = randFloat(-4, 4);
        break;

      case 'magic_explosion': // 투사체 충돌 폭발
        const a = randFloat(0, Math.PI * 2);
        const s = randFloat(100, 300);
        this.vx = Math.cos(a) * s;
        this.vy = Math.sin(a) * s;
        this.life = randFloat(0.2, 0.5);
        this.maxLife = this.life;
        this.size = randFloat(4, 12);
        this.color = `hsl(${randFloat(160, 280).toFixed(0)}, 100%, 80%)`;
        break;

      case 'player_hit': // 플레이어 피격 효과
        const pa = randFloat(0, Math.PI * 2);
        const ps = randFloat(80, 180);
        this.vx = Math.cos(pa) * ps;
        this.vy = Math.sin(pa) * ps;
        this.life = randFloat(0.3, 0.6);
        this.maxLife = this.life;
        this.size = randFloat(5, 12);
        this.color = `hsl(${randFloat(0, 30).toFixed(0)}, 100%, 70%)`;
        break;

      default:
        this.vx = 0; this.vy = 0;
        this.life = 0.5; this.maxLife = 0.5;
        this.size = 4;
        this.color = '#fff';
    }

    this.gravity = this.gravity || 0;
    this.rotation = this.rotation || 0;
    this.rotSpeed = this.rotSpeed || 0;
  }

  /** @param {number} dt - delta time (초) */
  update(dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.vy += this.gravity * dt;

    // 연기는 천천히 올라가면서 커짐
    if (this.type === 'smoke') {
      this.size += 12 * dt;
      this.rotation += this.rotSpeed * dt;
    }

    if (this.type === 'star') {
      this.rotation += this.rotSpeed * dt;
      this.vx *= 0.96;
      this.vy *= 0.96;
    }

    this.life -= dt;
    if (this.life <= 0) this.alive = false;
  }

  /**
   * 파티클 그리기 (카메라 좌표로 변환해서 렌더링)
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} camX - 카메라 X 오프셋
   * @param {number} camY - 카메라 Y 오프셋
   */
  draw(ctx, camX, camY) {
    const sx = this.x - camX;
    const sy = this.y - camY;
    const progress = this.life / this.maxLife; // 1 → 0
    const alpha = Math.max(0, progress);

    ctx.save();
    ctx.globalAlpha = alpha;

    if (this.type === 'smoke') {
      // 연기: 반투명 원
      ctx.globalAlpha = alpha * 0.55;
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.arc(sx, sy, this.size, 0, Math.PI * 2);
      ctx.fill();
    } else if (this.type === 'star') {
      // 별 모양 파티클
      ctx.translate(sx, sy);
      ctx.rotate(this.rotation);
      ctx.fillStyle = this.color;
      ctx.shadowColor = this.color;
      ctx.shadowBlur = 6;
      drawStar(ctx, 0, 0, this.size, this.size * 0.4, 5);
      ctx.fill();
    } else {
      // 일반 원형 파티클 (발광 효과)
      ctx.fillStyle = this.color;
      ctx.shadowColor = this.color;
      ctx.shadowBlur = this.size * 2;
      ctx.beginPath();
      ctx.arc(sx, sy, this.size * progress * 0.8 + this.size * 0.2, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }
}

/** 파티클 풀에 새 파티클을 추가하는 헬퍼 (최대 수 제한) */
function spawnParticles(pool, x, y, type, count) {
  for (let i = 0; i < count; i++) {
    if (pool.length < CONFIG.PARTICLE.MAX_COUNT) {
      pool.push(new Particle(x, y, type));
    }
  }
}
