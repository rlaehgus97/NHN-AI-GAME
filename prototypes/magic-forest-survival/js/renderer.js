// ============================================================
// RENDERER: 맵/배경 렌더링 (카메라 좌표 기반)
// 밤의 숲/오염된 초원 분위기의 배경
// ============================================================

/**
 * 배경 생성 - 맵 장식 요소를 한 번만 사전 생성
 * @returns {{ trees: object[], rocks: object[], bushes: object[], tiles: object[] }}
 */
function generateMapDecorations() {
  const decorations = {
    trees: [],
    rocks: [],
    patches: [],
    tiles: [],
  };

  const W = CONFIG.WORLD_WIDTH;
  const H = CONFIG.WORLD_HEIGHT;

  // 타일 기반 배경 색상 변화 (기본 그리드)
  const TILE = 96;
  const cols = Math.ceil(W / TILE);
  const rows = Math.ceil(H / TILE);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const rnd = Math.random();
      decorations.tiles.push({
        x: c * TILE,
        y: r * TILE,
        w: TILE,
        h: TILE,
        // 어두운 초록~갈색 변형
        dark: rnd < 0.15, // 더 어두운 타일
        stain: rnd > 0.85, // 오염된 어두운 반점
        stainHue: randFloat(270, 320),
      });
    }
  }

  // 죽은 나무 배치 (700개)
  for (let i = 0; i < 700; i++) {
    decorations.trees.push({
      x: randFloat(0, W),
      y: randFloat(0, H),
      height: randFloat(30, 70),
      width: randFloat(10, 22),
      hue: randFloat(15, 35), // 갈색 계열
      isDead: Math.random() < 0.6, // 60%는 죽은 나무
      branches: randInt(2, 5),
    });
  }

  // 바위 배치 (400개)
  for (let i = 0; i < 400; i++) {
    decorations.rocks.push({
      x: randFloat(0, W),
      y: randFloat(0, H),
      rx: randFloat(8, 22),
      ry: randFloat(6, 16),
      angle: randFloat(0, Math.PI),
      hue: randFloat(200, 250),
    });
  }

  // 어두운 웅덩이/오염 지역 (200개)
  for (let i = 0; i < 200; i++) {
    decorations.patches.push({
      x: randFloat(0, W),
      y: randFloat(0, H),
      rx: randFloat(20, 80),
      ry: randFloat(10, 40),
      hue: randFloat(250, 310),
    });
  }

  return decorations;
}

/**
 * 배경 그리기 (카메라 뷰포트만 렌더링)
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} camX
 * @param {number} camY
 * @param {number} canvasW
 * @param {number} canvasH
 * @param {object} decorations - generateMapDecorations() 결과
 */
function drawBackground(ctx, camX, camY, canvasW, canvasH, decorations) {
  // 기본 배경 (어두운 초원)
  ctx.fillStyle = "#1e3320";
  ctx.fillRect(0, 0, canvasW, canvasH);

  const TILE = 96;
  const margin = TILE * 2;

  // 타일 배경 (뷰포트 내 타일만 그림)
  const startC = Math.floor((camX - margin) / TILE);
  const endC = Math.ceil((camX + canvasW + margin) / TILE);
  const startR = Math.floor((camY - margin) / TILE);
  const endR = Math.ceil((camY + canvasH + margin) / TILE);

  const cols = Math.ceil(CONFIG.WORLD_WIDTH / TILE);

  for (let r = startR; r <= endR; r++) {
    for (let c = startC; c <= endC; c++) {
      const idx = r * cols + c;
      const tile = decorations.tiles[idx];
      if (!tile) continue;

      const sx = tile.x - camX;
      const sy = tile.y - camY;

      if (tile.dark) {
        ctx.fillStyle = "#182b1b";
      } else if (tile.stain) {
        ctx.fillStyle = `hsl(${tile.stainHue}, 30%, 10%)`;
      } else {
        ctx.fillStyle = "#1e3320";
      }
      ctx.fillRect(sx, sy, TILE, TILE);
    }
  }

  // 맵 경계 어두운 비네팅
  drawWorldBorder(ctx, camX, camY, canvasW, canvasH);

  // 장식 요소 (뷰포트 근처만 그림)
  const viewMargin = 120;
  const vLeft = camX - viewMargin,
    vRight = camX + canvasW + viewMargin;
  const vTop = camY - viewMargin,
    vBot = camY + canvasH + viewMargin;

  // 어두운 오염 웅덩이
  for (const p of decorations.patches) {
    if (p.x < vLeft || p.x > vRight || p.y < vTop || p.y > vBot) continue;
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = `hsl(${p.hue}, 40%, 8%)`;
    ctx.beginPath();
    ctx.ellipse(p.x - camX, p.y - camY, p.rx, p.ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  // 바위
  for (const r of decorations.rocks) {
    if (r.x < vLeft || r.x > vRight || r.y < vTop || r.y > vBot) continue;
    drawRock(ctx, r.x - camX, r.y - camY, r.rx, r.ry, r.angle, r.hue);
  }

  // 나무 (y 기준 정렬 생략 - 정적 배경이라 OK)
  for (const t of decorations.trees) {
    if (t.x < vLeft || t.x > vRight || t.y < vTop || t.y > vBot) continue;
    drawTree(
      ctx,
      t.x - camX,
      t.y - camY,
      t.height,
      t.width,
      t.hue,
      t.isDead,
      t.branches,
    );
  }
}

/** 월드 경계 검은 비네팅 */
function drawWorldBorder(ctx, camX, camY, canvasW, canvasH) {
  // 월드 바깥 영역에 어두운 오버레이
  const wx = -camX,
    wy = -camY;
  const ww = CONFIG.WORLD_WIDTH,
    wh = CONFIG.WORLD_HEIGHT;

  ctx.fillStyle = "#0a0612";
  // 왼쪽
  if (wx > 0) ctx.fillRect(0, 0, wx, canvasH);
  // 오른쪽
  if (wx + ww < canvasW) ctx.fillRect(wx + ww, 0, canvasW - (wx + ww), canvasH);
  // 위
  if (wy > 0) ctx.fillRect(0, 0, canvasW, wy);
  // 아래
  if (wy + wh < canvasH) ctx.fillRect(0, wy + wh, canvasW, canvasH - (wy + wh));
}

/** 바위 그리기 */
function drawRock(ctx, sx, sy, rx, ry, angle, hue) {
  ctx.save();
  ctx.translate(sx, sy);
  ctx.rotate(angle);

  // 그림자
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.beginPath();
  ctx.ellipse(3, 5, rx * 0.9, ry * 0.55, 0, 0, Math.PI * 2);
  ctx.fill();

  // 바위 본체
  ctx.fillStyle = `hsl(${hue}, 15%, 22%)`;
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();

  // 하이라이트
  ctx.fillStyle = `hsl(${hue}, 10%, 32%)`;
  ctx.beginPath();
  ctx.ellipse(-rx * 0.2, -ry * 0.25, rx * 0.4, ry * 0.3, -0.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

/** 나무 그리기 (죽은 나무 포함) */
function drawTree(ctx, sx, sy, height, width, hue, isDead, branchCount) {
  ctx.save();
  ctx.translate(sx, sy);

  // 그림자
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.beginPath();
  ctx.ellipse(4, 8, width * 0.6, width * 0.25, 0, 0, Math.PI * 2);
  ctx.fill();

  // 줄기
  ctx.strokeStyle = `hsl(${hue}, 30%, ${isDead ? 15 : 20}%)`;
  ctx.lineWidth = width * 0.35;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, -height);
  ctx.stroke();

  // 가지
  for (let i = 0; i < branchCount; i++) {
    const t = 0.3 + (i / branchCount) * 0.6;
    const bY = -height * t;
    const bLen = height * (0.25 + Math.random() * 0.2);
    const bDir = (i % 2 === 0 ? 1 : -1) * (0.6 + Math.random() * 0.4);
    ctx.strokeStyle = `hsl(${hue}, 25%, ${isDead ? 13 : 18}%)`;
    ctx.lineWidth = width * 0.18;
    ctx.beginPath();
    ctx.moveTo(0, bY);
    ctx.lineTo(bLen * bDir, bY - bLen * 0.4);
    ctx.stroke();
  }

  // 살아있는 나무는 잎사귀 (어두운 색)
  if (!isDead) {
    ctx.fillStyle = `hsl(130, 30%, 12%)`;
    ctx.beginPath();
    ctx.arc(0, -height, width * 1.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = `hsl(130, 25%, 16%)`;
    ctx.beginPath();
    ctx.arc(-width * 0.5, -height * 0.85, width * 0.8, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

/** 안전 구역 바닥 하이라이트 (플레이어 주변) */
function drawPlayerGround(ctx, sx, sy, size) {
  const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, size * 3.5);
  grad.addColorStop(0, "rgba(200, 180, 255, 0.07)");
  grad.addColorStop(1, "transparent");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(sx, sy, size * 3.5, 0, Math.PI * 2);
  ctx.fill();
}
