// ============================================================
// GAME: 메인 게임 루프 및 상태 관리
// requestAnimationFrame + delta time 기반
// ============================================================

// ── 오디오 헬퍼 함수 ───────────────────────────────────────
/** Web Audio API로 간단한 마법 발사음 생성 */
function playShootSound(ctx) {
  if (!CONFIG.AUDIO.ENABLED) return;
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1400, ctx.currentTime + 0.08);
    gain.gain.setValueAtTime(CONFIG.AUDIO.SHOOT_VOLUME, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.12);
  } catch (e) {}
}

/** 적 피격음 */
function playHitSound(ctx) {
  if (!CONFIG.AUDIO.ENABLED) return;
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'square';
    osc.frequency.setValueAtTime(220, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(CONFIG.AUDIO.HIT_VOLUME, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.1);
  } catch (e) {}
}

/** 플레이어 피격음 */
function playPlayerHitSound(ctx) {
  if (!CONFIG.AUDIO.ENABLED) return;
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(150, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(60, ctx.currentTime + 0.18);
    gain.gain.setValueAtTime(CONFIG.AUDIO.PLAYER_HIT_VOLUME, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.18);
  } catch (e) {}
}

/** 적 사망음 */
function playDeathSound(ctx) {
  if (!CONFIG.AUDIO.ENABLED) return;
  try {
    const buf = ctx.createBuffer(1, ctx.sampleRate * 0.2, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    }
    const src = ctx.createBufferSource();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 400;
    src.buffer = buf;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(CONFIG.AUDIO.DEATH_VOLUME, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
    src.start(ctx.currentTime);
  } catch (e) {}
}

/** 레벨업 효과음 */
function playLevelUpSound(ctx) {
  if (!CONFIG.AUDIO.ENABLED) return;
  try {
    const notes = [523, 659, 784, 1047]; // C E G C (화음)
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = freq;
      const t = ctx.currentTime + i * 0.1;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(CONFIG.AUDIO.LEVELUP_VOLUME, t + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      osc.start(t);
      osc.stop(t + 0.35);
    });
  } catch (e) {}
}

// ── 게임 상태 ────────────────────────────────────────────────
const STATE = { START: 'start', PLAYING: 'playing', LEVELUP: 'levelup', GAMEOVER: 'gameover' };

// ── 데미지 숫자 클래스 ──────────────────────────────────────
class DamageNumber {
  constructor(x, y, value, isPlayer = false) {
    this.x = x;
    this.y = y;
    this.value = `-${value}`;
    this.vy = -80 - Math.random() * 40;
    this.vx = (Math.random() - 0.5) * 30;
    this.life = 0.9;
    this.maxLife = 0.9;
    this.alive = true;
    this.size = isPlayer ? 20 : 15;
    this.color = isPlayer ? '#ff4466' : '#ffddaa';
  }
  update(dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.vy += 120 * dt; // 중력
    this.life -= dt;
    if (this.life <= 0) this.alive = false;
  }
}

// ── 메인 게임 클래스 ────────────────────────────────────────
class Game {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    this.ctx = this.canvas.getContext('2d');

    // 게임 상태
    this.state = STATE.START;
    this.time = 0;           // 경과 시간 (초)
    this.lastTime = 0;       // 이전 프레임 타임스탬프

    // 게임 오브젝트
    this.player = null;
    this.enemies = [];
    this.projectiles = [];
    this.particles = [];
    this.damageNumbers = [];

    // 카메라
    this.camX = 0;
    this.camY = 0;
    this.camShake = 0;      // 화면 흔들림 강도

    // 스폰
    this.spawnTimer = 0;
    this.spawnInterval = CONFIG.SPAWN.INITIAL_INTERVAL;

    // 맵 장식
    this.decorations = null;

    // 레벨업 UI 상태
    this.levelUpOptions = [];
    this.levelUpCardRects = [];

    // 게임 오버 버튼 영역
    this.gameOverBtnRect = null;
    // 시작 화면 버튼 영역
    this.startBtnRect = null;

    // 입력 상태
    this.keys = new Set();
    this.mouseX = 0;  // 화면 좌표
    this.mouseY = 0;
    this.mouseDown = false;

    // 오디오
    this.audioCtx = null;

    // UI 애니메이션 시간
    this.uiTime = 0;

    // 이벤트 리스너 (한 번만 등록)
    this._bindEvents();

    // 캔버스 크기 설정
    this._resize();

    // 게임 루프 시작
    requestAnimationFrame((ts) => this._loop(ts));
  }

  /** 이벤트 리스너 등록 (중복 방지: 한 번만 호출) */
  _bindEvents() {
    window.addEventListener('resize', () => this._resize());

    window.addEventListener('keydown', (e) => {
      this.keys.add(e.key.toLowerCase());
      // 방향키 스크롤 방지
      if (['arrowup','arrowdown','arrowleft','arrowright',' '].includes(e.key.toLowerCase())) {
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));

    this.canvas.addEventListener('mousemove', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      this.mouseX = e.clientX - rect.left;
      this.mouseY = e.clientY - rect.top;
    });

    this.canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        this.mouseDown = true;
        this._handleClick(this.mouseX, this.mouseY);
        // AudioContext는 사용자 인터랙션 후에만 생성 가능
        if (!this.audioCtx) {
          try { this.audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e) {}
        }
      }
    });
    this.canvas.addEventListener('mouseup', (e) => { if (e.button === 0) this.mouseDown = false; });

    // 우클릭 메뉴 방지
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    // 드래그 방지
    this.canvas.addEventListener('dragstart', (e) => e.preventDefault());
  }

  /** 캔버스 크기를 창 크기에 맞춤 */
  _resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  /** 게임 초기화 (시작/재시작 시 호출) */
  _initGame() {
    const W = CONFIG.WORLD_WIDTH;
    const H = CONFIG.WORLD_HEIGHT;

    // 플레이어를 맵 중앙에 배치
    this.player = new Player(W / 2, H / 2);
    this.enemies = [];
    this.projectiles = [];
    this.particles = [];
    this.damageNumbers = [];

    // 카메라 초기화
    this.camX = this.player.x - this.canvas.width / 2;
    this.camY = this.player.y - this.canvas.height / 2;
    this.camShake = 0;

    // 스폰 초기화
    this.spawnTimer = 0;
    this.spawnInterval = CONFIG.SPAWN.INITIAL_INTERVAL;

    // 맵 장식 생성
    this.decorations = generateMapDecorations();

    this.time = 0;
    this.uiTime = 0;
    this.lastTime = 0;
  }

  /** 클릭 이벤트 처리 */
  _handleClick(mx, my) {
    if (this.state === STATE.START) {
      if (this.startBtnRect) {
        const { btnX, btnY, btnW, btnH } = this.startBtnRect;
        if (mx >= btnX && mx <= btnX + btnW && my >= btnY && my <= btnY + btnH) {
          this._startGame();
        }
      }
    } else if (this.state === STATE.LEVELUP) {
      for (const rect of this.levelUpCardRects) {
        if (mx >= rect.x && mx <= rect.x + rect.w && my >= rect.y && my <= rect.y + rect.h) {
          this._applyLevelUp(this.levelUpOptions[rect.optIndex]);
          return;
        }
      }
    } else if (this.state === STATE.GAMEOVER) {
      if (this.gameOverBtnRect) {
        const { btnX, btnY, btnW, btnH } = this.gameOverBtnRect;
        if (mx >= btnX && mx <= btnX + btnW && my >= btnY && my <= btnY + btnH) {
          this._initGame();
          this.state = STATE.PLAYING;
        }
      }
    }
  }

  /** 레벨업 화면에서 카드 호버 업데이트 */
  _updateLevelUpHover(mx, my) {
    for (const opt of this.levelUpOptions) {
      opt.hovered = false;
    }
    for (const rect of this.levelUpCardRects) {
      if (mx >= rect.x && mx <= rect.x + rect.w && my >= rect.y && my <= rect.y + rect.h) {
        this.levelUpOptions[rect.optIndex].hovered = true;
      }
    }
  }

  /** 게임 시작 */
  _startGame() {
    this._initGame();
    this.state = STATE.PLAYING;
  }

  // ── 게임 루프 ──────────────────────────────────────────────
  _loop(timestamp) {
    // delta time 계산 (초 단위, 최대 0.05초로 캡 → 탭 전환 후 폭발 방지)
    const dt = this.lastTime ? Math.min((timestamp - this.lastTime) / 1000, 0.05) : 0;
    this.lastTime = timestamp;
    this.uiTime += dt;

    this._update(dt);
    this._draw();

    requestAnimationFrame((ts) => this._loop(ts));
  }

  // ── 업데이트 ───────────────────────────────────────────────
  _update(dt) {
    if (this.state === STATE.PLAYING) {
      this.time += dt;
      this._updatePlaying(dt);
    } else if (this.state === STATE.LEVELUP) {
      this._updateLevelUpHover(this.mouseX, this.mouseY);
    }
    // START, GAMEOVER는 UI만 렌더링
  }

  _updatePlaying(dt) {
    const player = this.player;
    const W = this.canvas.width, H = this.canvas.height;

    // 마우스 → 월드 좌표 변환
    const mouseWorldX = this.mouseX + this.camX;
    const mouseWorldY = this.mouseY + this.camY;

    // 플레이어 업데이트
    player.update(dt, this.keys, mouseWorldX, mouseWorldY, this.mouseDown,
                  this.projectiles, this.particles, this.audioCtx);

    // 게임 오버 체크
    if (!player.alive) {
      this.state = STATE.GAMEOVER;
      return;
    }

    // 카메라 업데이트 (플레이어를 부드럽게 추적)
    const targetCamX = player.x - W / 2;
    const targetCamY = player.y - H / 2;
    this.camX = lerp(this.camX, targetCamX, CONFIG.CAMERA.LERP);
    this.camY = lerp(this.camY, targetCamY, CONFIG.CAMERA.LERP);

    // 카메라 흔들림 적용
    let shakeDX = 0, shakeDY = 0;
    if (this.camShake > 0) {
      shakeDX = (Math.random() - 0.5) * this.camShake * 12;
      shakeDY = (Math.random() - 0.5) * this.camShake * 12;
      this.camShake *= CONFIG.CAMERA.SHAKE_DECAY;
      if (this.camShake < 0.01) this.camShake = 0;
    }
    const renderCamX = this.camX + shakeDX;
    const renderCamY = this.camY + shakeDY;
    this._renderCamX = renderCamX;
    this._renderCamY = renderCamY;

    // 적 스폰
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0 && this.enemies.length < CONFIG.SPAWN.MAX_ENEMIES) {
      this._spawnEnemy();
      this.spawnTimer = this.spawnInterval;
    }

    // 스폰 간격 감소 (레벨 기반)
    const targetInterval = Math.max(
      CONFIG.SPAWN.MIN_INTERVAL,
      CONFIG.SPAWN.INITIAL_INTERVAL - player.level * CONFIG.SPAWN.INTERVAL_DECREASE
    );
    this.spawnInterval = lerp(this.spawnInterval, targetInterval, 0.01);

    // 투사체 업데이트
    for (const proj of this.projectiles) {
      if (!proj.alive) continue;
      proj.update(dt, this.particles);
    }

    // 적 업데이트
    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;
      enemy.update(dt, player, this.enemies);

      // 플레이어-적 충돌 (접촉 피해)
      const d = dist(player.x, player.y, enemy.x, enemy.y);
      if (d < player.size + enemy.size * 0.85) {
        // 플레이어 밀어내기
        const nx = player.x - enemy.x, ny = player.y - enemy.y;
        const len = Math.sqrt(nx * nx + ny * ny) || 1;
        player.vx += (nx / len) * CONFIG.ENEMY.PUSH_FORCE * dt;
        player.vy += (ny / len) * CONFIG.ENEMY.PUSH_FORCE * dt;

        // 피해
        const didHit = player.takeDamage(enemy.damage, this.particles, this.audioCtx);
        if (didHit) {
          this.camShake = Math.min(this.camShake + 1.0, 2.5);
          this.damageNumbers.push(new DamageNumber(player.x, player.y - player.size * 2, Math.max(1, enemy.damage - player.defense), true));
        }
      }
    }

    // 투사체-적 충돌
    for (const proj of this.projectiles) {
      if (!proj.alive) continue;
      for (const enemy of this.enemies) {
        if (!enemy.alive) continue;
        const d = dist(proj.x, proj.y, enemy.x, enemy.y);
        if (d < proj.size + enemy.size * 0.85) {
          // 피해 적용
          const died = enemy.takeDamage(proj.damage);
          this.damageNumbers.push(new DamageNumber(enemy.x, enemy.y - enemy.size, proj.damage));
          if (this.audioCtx) playHitSound(this.audioCtx);

          if (died) {
            enemy.die(this.particles);
            if (this.audioCtx) playDeathSound(this.audioCtx);
            player.onKill();
            this._checkLevelUp();
          }

          proj.onHit(this.particles);
          break;
        }
      }
    }

    // 파티클 업데이트
    for (const p of this.particles) {
      if (p.alive) p.update(dt);
    }

    // 데미지 숫자 업데이트
    for (const dn of this.damageNumbers) {
      if (dn.alive) dn.update(dt);
    }

    // 죽은 오브젝트 제거 (필터)
    this.enemies = this.enemies.filter(e => e.alive);
    this.projectiles = this.projectiles.filter(p => p.alive);
    this.particles = this.particles.filter(p => p.alive);
    this.damageNumbers = this.damageNumbers.filter(d => d.alive);
  }

  /** 화면 바깥 랜덤 위치에 적 스폰 */
  _spawnEnemy() {
    const W = this.canvas.width, H = this.canvas.height;
    const margin = CONFIG.ENEMY.SPAWN_DISTANCE;
    let x, y;

    // 화면 4면 중 하나에서 스폰
    const side = randInt(0, 3);
    switch (side) {
      case 0: x = this.player.x + randFloat(-W * 0.6, W * 0.6); y = this.player.y - H * 0.6 - margin; break;
      case 1: x = this.player.x + randFloat(-W * 0.6, W * 0.6); y = this.player.y + H * 0.6 + margin; break;
      case 2: x = this.player.x - W * 0.6 - margin; y = this.player.y + randFloat(-H * 0.6, H * 0.6); break;
      case 3: x = this.player.x + W * 0.6 + margin; y = this.player.y + randFloat(-H * 0.6, H * 0.6); break;
    }

    // 월드 경계 내로 클램프
    x = clamp(x, 30, CONFIG.WORLD_WIDTH - 30);
    y = clamp(y, 30, CONFIG.WORLD_HEIGHT - 30);

    this.enemies.push(new Enemy(x, y));
  }

  /** 레벨업 조건 체크 */
  _checkLevelUp() {
    const player = this.player;
    if (player.killsThisLevel >= player.killsForNextLevel) {
      this._showLevelUpScreen();
    }
  }

  /** 레벨업 화면 표시 */
  _showLevelUpScreen() {
    if (this.audioCtx) playLevelUpSound(this.audioCtx);

    const player = this.player;
    const allOptions = [
      {
        id: 'attack',
        icon: '⚔',
        name: '마법 공격력 강화',
        desc: '마법 투사체 피해량 증가',
        glowColor: '#ff8833',
        btnColorTop: '#aa5511',
        btnColorBot: '#884400',
        before: player.attack,
        after: player.attack + CONFIG.LEVELUP.ATTACK_INCREASE,
        apply: (p) => { p.attack += CONFIG.LEVELUP.ATTACK_INCREASE; },
      },
      {
        id: 'defense',
        icon: '🛡',
        name: '방어력 강화',
        desc: '적에게 받는 피해 감소 (최소 1)',
        glowColor: '#3399ff',
        btnColorTop: '#113388',
        btnColorBot: '#112266',
        before: player.defense,
        after: player.defense + CONFIG.LEVELUP.DEFENSE_INCREASE,
        apply: (p) => { p.defense += CONFIG.LEVELUP.DEFENSE_INCREASE; },
      },
      {
        id: 'maxhp',
        icon: '♥',
        name: '최대 체력 증가',
        desc: '최대 체력 및 현재 체력 회복',
        glowColor: '#ff3355',
        btnColorTop: '#991133',
        btnColorBot: '#771122',
        before: player.maxHp,
        after: player.maxHp + CONFIG.LEVELUP.HP_INCREASE,
        apply: (p) => {
          p.maxHp += CONFIG.LEVELUP.HP_INCREASE;
          p.hp = Math.min(p.hp + CONFIG.LEVELUP.HP_INCREASE, p.maxHp);
        },
      },
    ];

    // 중복 없이 3개 랜덤 선택
    const shuffled = [...allOptions].sort(() => Math.random() - 0.5);
    this.levelUpOptions = shuffled.slice(0, Math.min(3, shuffled.length)).map(o => ({ ...o, hovered: false }));
    this.levelUpCardRects = [];
    this.state = STATE.LEVELUP;
  }

  /** 레벨업 능력 적용 */
  _applyLevelUp(option) {
    const player = this.player;
    option.apply(player);
    player.level++;

    // 다음 레벨업 처치 수 계산 (누적 증가)
    player.killsForNextLevel = CONFIG.LEVELUP.BASE_KILLS + (player.level - 1) * CONFIG.LEVELUP.KILLS_INCREMENT;
    player.killsThisLevel = 0;

    // 레벨업 파티클
    spawnParticles(this.particles, player.x, player.y, 'star', 20);

    this.state = STATE.PLAYING;
  }

  // ── 렌더링 ─────────────────────────────────────────────────
  _draw() {
    const ctx = this.ctx;
    const W = this.canvas.width, H = this.canvas.height;

    ctx.clearRect(0, 0, W, H);

    if (this.state === STATE.START) {
      this.startBtnRect = drawStartScreen(ctx, W, H, this.uiTime);
      return;
    }

    // 플레이 중 & 레벨업 & 게임오버 공통: 게임 월드 렌더링
    const camX = this._renderCamX !== undefined ? this._renderCamX : this.camX;
    const camY = this._renderCamY !== undefined ? this._renderCamY : this.camY;

    // 배경
    if (this.decorations) {
      drawBackground(ctx, camX, camY, W, H, this.decorations);
    }

    // 플레이어 발 아래 빛 표시
    if (this.player) {
      const psx = this.player.x - camX;
      const psy = this.player.y - camY;
      drawPlayerGround(ctx, psx, psy, this.player.size);
    }

    // 파티클 (적 뒤, 투사체 앞에 그림)
    for (const p of this.particles) {
      if (p.alive && (p.type === 'smoke' || p.type === 'blood')) {
        p.draw(ctx, camX, camY);
      }
    }

    // 투사체
    for (const proj of this.projectiles) {
      if (proj.alive) proj.draw(ctx, camX, camY);
    }

    // 적
    for (const enemy of this.enemies) {
      if (enemy.alive) enemy.draw(ctx, camX, camY);
    }

    // 플레이어
    if (this.player && this.player.alive) {
      this.player.draw(ctx, camX, camY);
    }

    // 전경 파티클 (sparkle, trail, hit, star, magic_explosion, player_hit)
    for (const p of this.particles) {
      if (p.alive && p.type !== 'smoke' && p.type !== 'blood') {
        p.draw(ctx, camX, camY);
      }
    }

    // 데미지 숫자
    drawDamageNumbers(ctx, this.damageNumbers, camX, camY);

    // HUD
    if (this.state === STATE.PLAYING && this.player) {
      drawHUD(ctx, this.player, {
        survivalTime: this.time,
        kills: this.player.kills,
        killsForNextLevel: this.player.killsForNextLevel,
        killsThisLevel: this.player.killsThisLevel,
      }, W, H);
    }

    // 레벨업 화면 오버레이
    if (this.state === STATE.LEVELUP) {
      // HUD도 함께 표시
      if (this.player) {
        drawHUD(ctx, this.player, {
          survivalTime: this.time,
          kills: this.player.kills,
          killsForNextLevel: this.player.killsForNextLevel,
          killsThisLevel: this.player.killsThisLevel,
        }, W, H);
      }
      this.levelUpCardRects = drawLevelUpScreen(ctx, W, H, this.levelUpOptions, this.player, this.uiTime);
    }

    // 게임 오버 화면 오버레이
    if (this.state === STATE.GAMEOVER) {
      this.gameOverBtnRect = drawGameOverScreen(ctx, W, H, {
        survivalTime: this.time,
        level: this.player ? this.player.level : 1,
        kills: this.player ? this.player.kills : 0,
      }, this.uiTime);
    }
  }
}

// ── 게임 진입점 ─────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  // 전역 게임 인스턴스 생성
  window.game = new Game();
});
