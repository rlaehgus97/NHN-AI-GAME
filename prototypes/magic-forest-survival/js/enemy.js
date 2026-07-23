// ============================================================
// ENEMY: 어두운 괴물 적 클래스
// 기괴한 외형, 비대칭 팔다리, 붉은 눈 등 다크 판타지 적 표현
// ============================================================
class Enemy {
  /**
   * @param {number} x - 월드 X 좌표
   * @param {number} y - 월드 Y 좌표
   */
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.alive = true;

    // 크기/속도에 약간의 랜덤 차이 → 복제된 느낌 감소
    this.size = randFloat(CONFIG.ENEMY.MIN_SIZE, CONFIG.ENEMY.MAX_SIZE);
    const speedMult = randFloat(0.75, 1.35);
    this.speed = CONFIG.ENEMY.BASE_SPEED * speedMult;
    this.hp = Math.round(CONFIG.ENEMY.BASE_HP * (0.8 + this.size / CONFIG.ENEMY.MAX_SIZE * 0.8));
    this.maxHp = this.hp;
    this.damage = CONFIG.ENEMY.BASE_DAMAGE;

    this.vx = 0;
    this.vy = 0;

    // 피격 애니메이션
    this.hitFlash = 0;       // 피격 시 흰색 번쩍임 지속 시간
    this.hitShake = 0;       // 흔들림 지속 시간
    this.hitShakeAmt = 0;    // 흔들림 강도

    // 움직임 개성 (고유 흔들림 패턴)
    this.wobbleSeed = randFloat(0, Math.PI * 2);
    this.wobbleSpeed = randFloat(3.5, 6.5);
    this.wobbleAmt = randFloat(0.06, 0.18);

    // 외형 고유 값 (한 번 결정되면 고정)
    this.bodyHue = randFloat(250, 310);   // 어두운 보라~검정 계열
    this.eyeX1 = randFloat(-0.35, -0.1); // 첫 번째 눈 상대 위치
    this.eyeX2 = randFloat(0.1, 0.35);   // 두 번째 눈 상대 위치
    this.eyeY = randFloat(-0.3, 0.1);
    this.eyeHue = randFloat(0, 30);       // 붉은~오렌지 눈 색
    this.tentacleCount = randInt(3, 6);   // 촉수/발 개수
    this.tentacleAngles = [];
    for (let i = 0; i < this.tentacleCount; i++) {
      this.tentacleAngles.push(randFloat(0, Math.PI * 2));
    }
    this.spikeCount = randInt(4, 8);      // 뿔/가시 개수
    this.hasHorn = Math.random() < 0.5;   // 뿔 여부

    this.age = randFloat(0, 10); // 애니메이션 오프셋 (서로 다르게 시작)
  }

  /**
   * @param {number} dt
   * @param {{x:number,y:number}} player - 플레이어 위치 (추적용)
   * @param {Enemy[]} enemies - 다른 적 목록 (밀어내기용)
   */
  update(dt, player, enemies) {
    this.age += dt;

    // 플레이어 방향으로 이동
    const dx = player.x - this.x;
    const dy = player.y - this.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d > 0) {
      const nx = dx / d, ny = dy / d;
      this.vx += nx * this.speed * dt * 8;
      this.vy += ny * this.speed * dt * 8;
    }

    // 최대 속도 제한
    const spd = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
    if (spd > this.speed) {
      this.vx = (this.vx / spd) * this.speed;
      this.vy = (this.vy / spd) * this.speed;
    }

    // 적끼리 약하게 밀어내기
    for (const other of enemies) {
      if (other === this || !other.alive) continue;
      const ex = this.x - other.x;
      const ey = this.y - other.y;
      const ed = Math.sqrt(ex * ex + ey * ey);
      const minD = this.size + other.size;
      if (ed < minD && ed > 0) {
        const force = CONFIG.ENEMY.REPEL_FORCE * (1 - ed / minD);
        this.vx += (ex / ed) * force * dt;
        this.vy += (ey / ed) * force * dt;
      }
    }

    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.vx *= 0.9;
    this.vy *= 0.9;

    // 피격 타이머 감소
    if (this.hitFlash > 0) this.hitFlash -= dt;
    if (this.hitShake > 0) this.hitShake -= dt;
  }

  /**
   * 피해를 받음
   * @param {number} amount
   * @returns {boolean} 사망 여부
   */
  takeDamage(amount) {
    this.hp -= amount;
    this.hitFlash = 0.12;
    this.hitShake = 0.18;
    this.hitShakeAmt = 5;
    if (this.hp <= 0) {
      this.alive = false;
      return true;
    }
    return false;
  }

  /** 사망 시 연기/파티클 생성 */
  die(particles) {
    spawnParticles(particles, this.x, this.y, 'smoke', 6);
    spawnParticles(particles, this.x, this.y, 'blood', 8);
  }

  /**
   * 적 그리기 (어두운 괴물 외형)
   * 이 함수를 수정하거나 이미지 그리기 코드로 교체해 외형을 변경할 수 있습니다.
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} camX
   * @param {number} camY
   */
  draw(ctx, camX, camY) {
    let sx = this.x - camX;
    let sy = this.y - camY;

    // 피격 흔들림
    if (this.hitShake > 0) {
      sx += (Math.random() - 0.5) * this.hitShakeAmt * 2;
      sy += (Math.random() - 0.5) * this.hitShakeAmt * 2;
    }

    // 몸체 흔들림 (꿈틀거리는 느낌)
    const wobble = Math.sin(this.age * this.wobbleSpeed + this.wobbleSeed);
    const scaleX = 1 + wobble * this.wobbleAmt;
    const scaleY = 1 - wobble * this.wobbleAmt * 0.6;

    ctx.save();
    ctx.translate(sx, sy);

    // === 본체 그리기 시작 ===
    this._drawBody(ctx, scaleX, scaleY, wobble);
    // === 본체 그리기 끝 ===

    ctx.restore();

    // 체력 바 (본체 위)
    this._drawHpBar(ctx, sx, sy);
  }

  /**
   * 괴물 본체 그리기 (외형 교체 시 이 함수만 수정)
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} scaleX
   * @param {number} scaleY
   * @param {number} wobble
   */
  _drawBody(ctx, scaleX, scaleY, wobble) {
    const s = this.size;
    const isFlashing = this.hitFlash > 0;

    // --- 1. 촉수/발 (뒤에 그려서 몸체 뒤에 있는 것처럼 보임) ---
    for (let i = 0; i < this.tentacleCount; i++) {
      const baseAngle = this.tentacleAngles[i] + this.age * 1.2 + wobble * 0.4;
      const tLen = s * randFloat(0.8, 1.5);

      ctx.save();
      ctx.rotate(baseAngle);
      ctx.strokeStyle = isFlashing ? '#ffffff'
        : `hsl(${this.bodyHue}, 40%, ${8 + i * 2}%)`;
      ctx.lineWidth = s * 0.18;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      // 꼬불꼬불한 촉수
      ctx.bezierCurveTo(
        s * 0.3, tLen * 0.3 + wobble * 4,
        s * -0.3, tLen * 0.7,
        0, tLen
      );
      ctx.stroke();

      // 촉수 끝 발톱
      ctx.strokeStyle = isFlashing ? '#ffffff' : `hsl(${this.bodyHue + 20}, 60%, 30%)`;
      ctx.lineWidth = s * 0.1;
      ctx.beginPath();
      ctx.moveTo(0, tLen);
      ctx.lineTo(s * 0.2, tLen + s * 0.3);
      ctx.moveTo(0, tLen);
      ctx.lineTo(s * -0.2, tLen + s * 0.3);
      ctx.stroke();
      ctx.restore();
    }

    // --- 2. 그림자 (발광 효과) ---
    const shadowGrad = ctx.createRadialGradient(0, s * 0.2, 0, 0, 0, s * 2.2);
    shadowGrad.addColorStop(0, `hsla(${this.bodyHue}, 80%, 5%, 0.5)`);
    shadowGrad.addColorStop(1, 'transparent');
    ctx.fillStyle = shadowGrad;
    ctx.beginPath();
    ctx.ellipse(0, 0, s * scaleX * 1.8, s * scaleY * 1.8, 0, 0, Math.PI * 2);
    ctx.fill();

    // --- 3. 몸체 (불규칙한 blob 형태) ---
    ctx.scale(scaleX, scaleY);
    // 외곽 발광
    ctx.shadowColor = `hsl(${this.bodyHue}, 80%, 20%)`;
    ctx.shadowBlur = 12;

    // 몸체 색상 (피격 시 흰색으로 번쩍임)
    const bodyColor = isFlashing
      ? '#ffffff'
      : `hsl(${this.bodyHue}, 50%, 12%)`;

    // 불규칙한 blob: 여러 개의 타원을 조합
    ctx.fillStyle = bodyColor;

    // 메인 몸체
    ctx.beginPath();
    ctx.ellipse(0, 0, s, s * 0.9, wobble * 0.2, 0, Math.PI * 2);
    ctx.fill();

    // 몸체 위쪽 혹 (비대칭)
    ctx.beginPath();
    ctx.ellipse(s * 0.3 * Math.sign(wobble), -s * 0.35, s * 0.5, s * 0.45, wobble * 0.3, 0, Math.PI * 2);
    ctx.fill();

    // --- 4. 뿔 (일부 적) ---
    if (this.hasHorn) {
      ctx.fillStyle = isFlashing ? '#ffffff' : `hsl(${this.bodyHue + 10}, 40%, 25%)`;
      ctx.shadowBlur = 0;
      // 왼쪽 뿔
      ctx.beginPath();
      ctx.moveTo(-s * 0.35, -s * 0.7);
      ctx.lineTo(-s * 0.55, -s * 1.3);
      ctx.lineTo(-s * 0.18, -s * 0.75);
      ctx.fill();
      // 오른쪽 뿔 (약간 다른 크기)
      ctx.beginPath();
      ctx.moveTo(s * 0.25, -s * 0.72);
      ctx.lineTo(s * 0.5, -s * 1.1);
      ctx.lineTo(s * 0.15, -s * 0.78);
      ctx.fill();
    }

    // --- 5. 이빨 ---
    ctx.fillStyle = isFlashing ? '#ffcccc' : '#cccccc';
    ctx.shadowBlur = 0;
    const teethY = s * 0.25;
    const teethW = s * 0.8;
    for (let i = 0; i < 4; i++) {
      const tx = -teethW / 2 + (teethW / 3.5) * i;
      const th = s * 0.22 + (i % 2) * s * 0.1;
      ctx.beginPath();
      ctx.moveTo(tx, teethY);
      ctx.lineTo(tx + s * 0.08, teethY + th);
      ctx.lineTo(tx + s * 0.18, teethY);
      ctx.fill();
    }

    // --- 6. 눈 (붉은 빛) ---
    const eyeSize = s * 0.28;
    const eyePositions = [
      { x: this.eyeX1 * s * 2, y: this.eyeY * s * 2 },
      { x: this.eyeX2 * s * 2, y: this.eyeY * s * 2 + wobble * 2 },
    ];

    for (const eye of eyePositions) {
      // 눈 발광
      ctx.shadowColor = `hsl(${this.eyeHue}, 100%, 60%)`;
      ctx.shadowBlur = 14;

      // 흰자 (사실 황녹색 혹은 혈적색)
      ctx.fillStyle = isFlashing ? '#ffffff' : `hsl(${this.eyeHue + 10}, 100%, 55%)`;
      ctx.beginPath();
      ctx.ellipse(eye.x, eye.y, eyeSize, eyeSize * 0.85, 0, 0, Math.PI * 2);
      ctx.fill();

      // 동공 (세로로 긴 고양이/파충류 눈)
      ctx.shadowBlur = 0;
      ctx.fillStyle = isFlashing ? '#ffaaaa' : '#111';
      ctx.beginPath();
      ctx.ellipse(eye.x, eye.y, eyeSize * 0.25, eyeSize * 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // --- 7. 몸체 질감 (스크래치 선) ---
    if (!isFlashing) {
      ctx.shadowBlur = 0;
      ctx.strokeStyle = `hsl(${this.bodyHue}, 30%, 20%)`;
      ctx.lineWidth = 1.2;
      for (let i = 0; i < 3; i++) {
        const lx = (i - 1) * s * 0.4;
        ctx.beginPath();
        ctx.moveTo(lx - s * 0.15, -s * 0.3);
        ctx.lineTo(lx + s * 0.1, s * 0.2);
        ctx.stroke();
      }
    }
  }

  /** 체력 바 그리기 */
  _drawHpBar(ctx, sx, sy) {
    const barW = this.size * 2.2;
    const barH = 4;
    const barX = sx - barW / 2;
    const barY = sy - this.size - 12;
    const ratio = Math.max(0, this.hp / this.maxHp);

    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    roundRect(ctx, barX - 1, barY - 1, barW + 2, barH + 2, 3);
    ctx.fill();

    // 체력 색상: 초록 → 노랑 → 빨강
    const hue = ratio * 120;
    ctx.fillStyle = `hsl(${hue}, 90%, 50%)`;
    if (ratio > 0) {
      roundRect(ctx, barX, barY, barW * ratio, barH, 2);
      ctx.fill();
    }
  }
}
