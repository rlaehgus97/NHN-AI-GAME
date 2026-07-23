// ============================================================
// PLAYER: 귀여운 마법사 캐릭터 "핍(Pip)" 클래스
// 큰 머리, 작은 몸의 치비 비율, 마법봉 무기
// ============================================================
class Player {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.alive = true;

    // 스탯 (CONFIG에서 초기화, 레벨업으로 증가)
    this.maxHp = CONFIG.PLAYER.MAX_HP;
    this.hp = this.maxHp;
    this.defense = CONFIG.PLAYER.DEFENSE;
    this.attack = CONFIG.PLAYER.ATTACK;
    this.attackRate = CONFIG.PLAYER.ATTACK_RATE; // 초당 공격 횟수
    this.speed = CONFIG.PLAYER.SPEED;

    // 이동
    this.vx = 0;
    this.vy = 0;

    // 마법봉 조준 각도 (마우스 방향)
    this.wandAngle = 0;

    // 공격 쿨다운
    this.attackCooldown = 0;

    // 무적 시간
    this.invincibleTimer = 0;

    // 걷기 애니메이션
    this.walkPhase = 0;
    this.isMoving = false;
    this.walkBobY = 0; // 수직 진동 오프셋

    // 마법봉 발광 효과
    this.wandGlow = 0;

    // 피격 깜빡임
    this.hitFlash = 0;

    // 레벨 관련
    this.level = 1;
    this.kills = 0;
    this.killsForNextLevel = CONFIG.LEVELUP.BASE_KILLS;
    this.killsThisLevel = 0; // 현재 레벨에서 쌓인 처치 수

    this.size = CONFIG.PLAYER.SIZE;
    this.age = 0;
  }

  /**
   * 플레이어 업데이트
   * @param {number} dt
   * @param {Set<string>} keys - 눌린 키 집합
   * @param {number} mouseWorldX - 마우스 월드 X
   * @param {number} mouseWorldY - 마우스 월드 Y
   * @param {boolean} mouseDown - 마우스 클릭 여부
   * @param {Projectile[]} projectiles
   * @param {Particle[]} particles
   * @param {AudioContext|null} audioCtx
   */
  update(dt, keys, mouseWorldX, mouseWorldY, mouseDown, projectiles, particles, audioCtx) {
    this.age += dt;

    // --- 이동 입력 처리 ---
    let inputX = 0, inputY = 0;
    if (keys.has('w') || keys.has('arrowup'))    inputY -= 1;
    if (keys.has('s') || keys.has('arrowdown'))  inputY += 1;
    if (keys.has('a') || keys.has('arrowleft'))  inputX -= 1;
    if (keys.has('d') || keys.has('arrowright')) inputX += 1;

    // 대각선 이동 시 속도 정규화
    if (inputX !== 0 && inputY !== 0) {
      inputX *= 0.7071;
      inputY *= 0.7071;
    }

    // 가속 + 마찰
    this.vx += inputX * CONFIG.PLAYER.ACCEL * dt;
    this.vy += inputY * CONFIG.PLAYER.ACCEL * dt;
    const friction = Math.pow(CONFIG.PLAYER.FRICTION, dt * 60);
    this.vx *= friction;
    this.vy *= friction;

    // 최대 속도 제한
    const spd = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
    if (spd > this.speed) {
      this.vx = (this.vx / spd) * this.speed;
      this.vy = (this.vy / spd) * this.speed;
    }

    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // 월드 경계 처리
    this.x = clamp(this.x, this.size, CONFIG.WORLD_WIDTH - this.size);
    this.y = clamp(this.y, this.size, CONFIG.WORLD_HEIGHT - this.size);

    // 걷기 애니메이션
    this.isMoving = (Math.abs(this.vx) > 5 || Math.abs(this.vy) > 5);
    if (this.isMoving) {
      this.walkPhase += dt * 8;
      this.walkBobY = Math.sin(this.walkPhase) * 3.5;
    } else {
      this.walkBobY = Math.sin(this.age * 2) * 1.2; // 정지 시 약한 호흡 효과
    }

    // --- 마법봉 조준 각도 ---
    const dx = mouseWorldX - this.x;
    const dy = mouseWorldY - this.y;
    this.wandAngle = Math.atan2(dy, dx);

    // --- 마법 공격 ---
    this.attackCooldown -= dt;
    if (mouseDown && this.attackCooldown <= 0) {
      this._shoot(projectiles, particles, audioCtx);
      this.attackCooldown = 1 / this.attackRate;
      this.wandGlow = 0.2; // 발광 효과
    }

    // 발광 감쇠
    if (this.wandGlow > 0) this.wandGlow -= dt * 3;

    // 무적 타이머
    if (this.invincibleTimer > 0) this.invincibleTimer -= dt;
    if (this.hitFlash > 0) this.hitFlash -= dt;
  }

  /** 마법 투사체 발사 */
  _shoot(projectiles, particles, audioCtx) {
    // 마법봉 끝 위치에서 발사
    const wandLength = this.size * 1.8;
    const tipX = this.x + Math.cos(this.wandAngle) * wandLength;
    const tipY = this.y + Math.sin(this.wandAngle) * wandLength;

    projectiles.push(new Projectile(tipX, tipY, this.wandAngle, this.attack));

    // 발사 파티클
    spawnParticles(particles, tipX, tipY, 'sparkle', 5);

    // 발사 효과음 (Web Audio API)
    if (audioCtx) playShootSound(audioCtx);
  }

  /**
   * 피해를 받음
   * @param {number} amount - 들어오는 피해
   * @returns {boolean} 실제로 피해를 입었는지 여부
   */
  takeDamage(amount, particles, audioCtx) {
    if (this.invincibleTimer > 0) return false;

    const actual = Math.max(1, amount - this.defense);
    this.hp -= actual;
    this.invincibleTimer = CONFIG.PLAYER.INVINCIBLE_TIME;
    this.hitFlash = 0.2;

    if (particles) spawnParticles(particles, this.x, this.y, 'player_hit', 6);
    if (audioCtx) playPlayerHitSound(audioCtx);

    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
    }
    return true;
  }

  /** 적 처치 처리 */
  onKill() {
    this.kills++;
    this.killsThisLevel++;
  }

  /**
   * 플레이어 그리기 (귀여운 치비 마법사)
   * 이 함수를 수정하거나 이미지 그리기로 교체해 외형을 변경할 수 있습니다.
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} camX
   * @param {number} camY
   */
  draw(ctx, camX, camY) {
    const sx = this.x - camX;
    const sy = this.y - camY + this.walkBobY;

    // 무적 시간 중 깜빡임
    if (this.invincibleTimer > 0) {
      const blinkRate = 8;
      if (Math.floor(this.invincibleTimer * blinkRate) % 2 === 0) return;
    }

    ctx.save();
    ctx.translate(sx, sy);

    // 마법봉 방향에 따라 좌우 뒤집기
    const facingLeft = (this.wandAngle > Math.PI / 2 || this.wandAngle < -Math.PI / 2);
    if (facingLeft) ctx.scale(-1, 1);

    // === 캐릭터 본체 그리기 시작 ===
    this._drawBody(ctx, facingLeft);
    // === 캐릭터 본체 그리기 끝 ===

    ctx.restore();

    // 마법봉을 별도로 그림 (flip 영향 없이 올바른 각도로)
    this._drawWand(ctx, sx, sy);
  }

  /**
   * 귀여운 마법사 본체 그리기 (외형 교체 시 이 함수만 수정)
   * @param {CanvasRenderingContext2D} ctx
   * @param {boolean} facingLeft
   */
  _drawBody(ctx, facingLeft) {
    const s = this.size;
    const isHit = this.hitFlash > 0;

    // --- 망토/로브 (몸통 뒤) ---
    ctx.fillStyle = isHit ? '#ff9999' : '#7c5cbf'; // 어두운 보라
    ctx.beginPath();
    ctx.ellipse(0, s * 0.3, s * 0.85, s * 1.1, 0, 0, Math.PI * 2);
    ctx.fill();

    // 망토 하단 - 둥글게
    ctx.fillStyle = isHit ? '#ffaaaa' : '#6a4dab';
    ctx.beginPath();
    ctx.ellipse(0, s * 0.9, s * 0.7, s * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();

    // 망토 장식 (별 문양)
    ctx.fillStyle = isHit ? '#ffffff' : '#d4b8ff';
    ctx.font = `${s * 0.5}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('✦', 0, s * 0.5);

    // --- 다리/발 ---
    const legSwing = this.isMoving ? Math.sin(this.walkPhase) * 5 : 0;
    ctx.fillStyle = isHit ? '#ffaaaa' : '#e8c9a0'; // 살색
    // 왼발
    ctx.beginPath();
    ctx.ellipse(-s * 0.28 - legSwing * 0.3, s * 1.2, s * 0.2, s * 0.28, -legSwing * 0.04, 0, Math.PI * 2);
    ctx.fill();
    // 오른발
    ctx.beginPath();
    ctx.ellipse(s * 0.28 + legSwing * 0.3, s * 1.2, s * 0.2, s * 0.28, legSwing * 0.04, 0, Math.PI * 2);
    ctx.fill();

    // 신발 (작고 귀여운 검은색)
    ctx.fillStyle = isHit ? '#ff9999' : '#2d1a4f';
    ctx.beginPath();
    ctx.ellipse(-s * 0.3 - legSwing * 0.3, s * 1.38, s * 0.22, s * 0.16, -0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(s * 0.3 + legSwing * 0.3, s * 1.38, s * 0.22, s * 0.16, 0.2, 0, Math.PI * 2);
    ctx.fill();

    // --- 목 ---
    ctx.fillStyle = isHit ? '#ffbbbb' : '#f5dbbe';
    ctx.beginPath();
    ctx.ellipse(0, -s * 0.1, s * 0.22, s * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();

    // --- 머리 (크고 둥근 - 치비 특징) ---
    ctx.shadowColor = 'rgba(100, 60, 180, 0.4)';
    ctx.shadowBlur = 10;
    ctx.fillStyle = isHit ? '#ffdddd' : '#f5dbbe'; // 크림색 피부
    ctx.beginPath();
    ctx.arc(0, -s * 0.85, s * 1.05, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // 볼 홍조 (귀여운 포인트)
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = '#ff9999';
    ctx.beginPath();
    ctx.ellipse(-s * 0.55, -s * 0.72, s * 0.28, s * 0.18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(s * 0.55, -s * 0.72, s * 0.28, s * 0.18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // --- 눈 (둥글고 단순) ---
    // 흰자
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(-s * 0.3, -s * 0.92, s * 0.25, s * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(s * 0.3, -s * 0.92, s * 0.25, s * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();

    // 동공
    ctx.fillStyle = '#333';
    ctx.beginPath();
    ctx.arc(-s * 0.28, -s * 0.9, s * 0.13, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(s * 0.32, -s * 0.9, s * 0.13, 0, Math.PI * 2);
    ctx.fill();

    // 눈 하이라이트
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(-s * 0.24, -s * 0.95, s * 0.05, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(s * 0.36, -s * 0.95, s * 0.05, 0, Math.PI * 2);
    ctx.fill();

    // 피격 시 X 눈
    if (this.hitFlash > 0.1) {
      ctx.strokeStyle = '#cc0000';
      ctx.lineWidth = 2;
      const ex = -s * 0.28, ey = -s * 0.9, er = s * 0.15;
      ctx.beginPath(); ctx.moveTo(ex - er, ey - er); ctx.lineTo(ex + er, ey + er); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ex + er, ey - er); ctx.lineTo(ex - er, ey + er); ctx.stroke();
    }

    // 입
    ctx.strokeStyle = isHit ? '#cc4444' : '#a0624a';
    ctx.lineWidth = 1.8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(0, -s * 0.68, s * 0.18, 0.2, Math.PI - 0.2);
    ctx.stroke();

    // --- 마법사 모자 ---
    // 모자 테두리
    ctx.fillStyle = isHit ? '#ff9999' : '#3d2475';
    ctx.beginPath();
    ctx.ellipse(0, -s * 1.82, s * 0.9, s * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();

    // 모자 몸체
    ctx.fillStyle = isHit ? '#ffaaaa' : '#4a2d8a';
    ctx.beginPath();
    ctx.moveTo(-s * 0.55, -s * 1.82);
    ctx.quadraticCurveTo(-s * 0.45, -s * 2.5, -s * 0.12, -s * 3.2);
    ctx.quadraticCurveTo(s * 0.05, -s * 3.3, s * 0.18, -s * 3.15);
    ctx.quadraticCurveTo(s * 0.48, -s * 2.4, s * 0.55, -s * 1.82);
    ctx.closePath();
    ctx.fill();

    // 모자 별 장식
    ctx.fillStyle = isHit ? '#ffff99' : '#ffd700';
    ctx.shadowColor = '#ffd700';
    ctx.shadowBlur = 6;
    drawStar(ctx, s * 0.08, -s * 2.8, s * 0.2, s * 0.09, 5);
    ctx.fill();
    ctx.shadowBlur = 0;

    // 모자 리본
    ctx.fillStyle = isHit ? '#ffaacc' : '#ff6699';
    ctx.beginPath();
    ctx.ellipse(0, -s * 1.9, s * 0.5, s * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  /**
   * 마법봉 그리기 (올바른 각도로, flip 없이)
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} sx - 화면 X 좌표
   * @param {number} sy - 화면 Y 좌표
   */
  _drawWand(ctx, sx, sy) {
    const s = this.size;
    const wandDist = s * 1.1;
    const wandAngle = this.wandAngle;
    const wandStartX = sx + Math.cos(wandAngle) * wandDist * 0.3;
    const wandStartY = sy + Math.sin(wandAngle) * wandDist * 0.3;
    const wandEndX = sx + Math.cos(wandAngle) * wandDist * 1.9;
    const wandEndY = sy + Math.sin(wandAngle) * wandDist * 1.9;

    ctx.save();

    // 마법봉 막대
    ctx.strokeStyle = '#7a4a2a';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(wandStartX, wandStartY);
    ctx.lineTo(wandEndX, wandEndY);
    ctx.stroke();

    // 마법봉 끝 - 빛나는 별 구체
    const glowSize = this.wandGlow > 0
      ? s * 0.55 + this.wandGlow * s * 0.8  // 발사 직후 크게 빛남
      : s * 0.38;

    // 발광 효과
    if (this.wandGlow > 0) {
      const glowGrad = ctx.createRadialGradient(wandEndX, wandEndY, 0, wandEndX, wandEndY, glowSize * 3);
      glowGrad.addColorStop(0, `rgba(200, 150, 255, ${this.wandGlow})`);
      glowGrad.addColorStop(1, 'rgba(180, 100, 255, 0)');
      ctx.fillStyle = glowGrad;
      ctx.beginPath();
      ctx.arc(wandEndX, wandEndY, glowSize * 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // 구체 (별 + 원)
    ctx.shadowColor = '#cc88ff';
    ctx.shadowBlur = 12 + this.wandGlow * 20;
    ctx.fillStyle = '#e8ccff';
    drawStar(ctx, wandEndX, wandEndY, glowSize, glowSize * 0.4, 5);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(wandEndX, wandEndY, glowSize * 0.35, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }
}
