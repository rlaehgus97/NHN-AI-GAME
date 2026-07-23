// ============================================================
// UI: HUD, 레벨업 화면, 게임 오버, 시작 화면 렌더링
// ============================================================

/**
 * 게임 플레이 중 HUD 그리기
 * @param {CanvasRenderingContext2D} ctx
 * @param {Player} player
 * @param {object} gameState - { survivalTime, kills, killsForNextLevel, killsThisLevel }
 * @param {number} canvasW
 * @param {number} canvasH
 */
function drawHUD(ctx, player, gameState, canvasW, canvasH) {
  ctx.save();
  ctx.textBaseline = 'top';

  const PAD = 14;

  // ── 왼쪽 패널: 체력바 + 레벨 ──────────────────────────
  const panelW = 210;
  const panelH = 90;
  const panelX = PAD;
  const panelY = PAD;

  // 패널 배경 (마법책 느낌의 어두운 갈색)
  drawHUDPanel(ctx, panelX, panelY, panelW, panelH);

  // 체력 아이콘 + 게이지
  ctx.font = 'bold 13px Georgia, serif';
  ctx.fillStyle = '#e8d8ff';
  ctx.textAlign = 'left';
  ctx.fillText('♥ HP', panelX + 12, panelY + 12);

  // 체력 게이지 배경
  const barX = panelX + 12, barY = panelY + 30;
  const barW = panelW - 24, barH = 14;
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  roundRect(ctx, barX, barY, barW, barH, 7);
  ctx.fill();

  // 체력 게이지 (붉은 마법 구슬 느낌)
  const hpRatio = Math.max(0, player.hp / player.maxHp);
  if (hpRatio > 0) {
    const hpGrad = ctx.createLinearGradient(barX, barY, barX + barW, barY);
    hpGrad.addColorStop(0, '#cc2244');
    hpGrad.addColorStop(0.5, '#ff4466');
    hpGrad.addColorStop(1, '#ff7799');
    ctx.fillStyle = hpGrad;
    roundRect(ctx, barX, barY, barW * hpRatio, barH, 7);
    ctx.fill();

    // 게이지 빛 반사 효과
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    roundRect(ctx, barX + 2, barY + 2, (barW * hpRatio) * 0.6, barH * 0.35, 5);
    ctx.fill();
  }

  // 체력 수치 텍스트
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 11px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.fillText(`${Math.ceil(player.hp)} / ${player.maxHp}`, barX + barW / 2, barY + 1);

  // 레벨 + 레벨업 진행
  ctx.textAlign = 'left';
  ctx.fillStyle = '#e8d8ff';
  ctx.font = 'bold 12px Georgia, serif';
  ctx.fillText(`✦ Lv.${player.level}`, panelX + 12, panelY + 52);

  // 레벨업 진행 바
  const lvBarX = panelX + 65, lvBarY = panelY + 54;
  const lvBarW = panelW - 77, lvBarH = 10;
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  roundRect(ctx, lvBarX, lvBarY, lvBarW, lvBarH, 5);
  ctx.fill();
  const lvRatio = player.killsThisLevel / player.killsForNextLevel;
  if (lvRatio > 0) {
    const lvGrad = ctx.createLinearGradient(lvBarX, 0, lvBarX + lvBarW, 0);
    lvGrad.addColorStop(0, '#7722cc');
    lvGrad.addColorStop(1, '#cc88ff');
    ctx.fillStyle = lvGrad;
    roundRect(ctx, lvBarX, lvBarY, lvBarW * Math.min(1, lvRatio), lvBarH, 5);
    ctx.fill();
  }

  ctx.fillStyle = '#ccaaff';
  ctx.font = '10px Georgia, serif';
  ctx.textAlign = 'right';
  ctx.fillText(`${player.killsThisLevel}/${player.killsForNextLevel}`, panelX + panelW - 10, panelY + 52);

  // ── 오른쪽 패널: 스탯 요약 ──────────────────────────────
  const rightW = 145;
  const rightH = 90;
  const rightX = canvasW - rightW - PAD;
  const rightY = PAD;

  drawHUDPanel(ctx, rightX, rightY, rightW, rightH);

  ctx.textAlign = 'left';
  ctx.fillStyle = '#e8d8ff';
  ctx.font = '12px Georgia, serif';

  const statLines = [
    `⚔ 공격력:  ${player.attack}`,
    `🛡 방어력:  ${player.defense}`,
    `☠ 처치수:  ${player.kills}`,
    `⏱ 생존:    ${formatTime(gameState.survivalTime)}`,
  ];
  statLines.forEach((line, i) => {
    ctx.fillText(line, rightX + 12, rightY + 10 + i * 18);
  });
}

/** HUD 패널 배경 그리기 (마법책 스타일) */
function drawHUDPanel(ctx, x, y, w, h) {
  // 배경
  ctx.fillStyle = 'rgba(12, 6, 25, 0.78)';
  roundRect(ctx, x, y, w, h, 8);
  ctx.fill();

  // 테두리 (마법 빛 느낌)
  ctx.strokeStyle = 'rgba(170, 100, 255, 0.45)';
  ctx.lineWidth = 1.5;
  roundRect(ctx, x, y, w, h, 8);
  ctx.stroke();

  // 모서리 장식
  const corners = [[x + 5, y + 5], [x + w - 5, y + 5], [x + 5, y + h - 5], [x + w - 5, y + h - 5]];
  ctx.fillStyle = 'rgba(180, 120, 255, 0.6)';
  for (const [cx, cy] of corners) {
    ctx.beginPath();
    ctx.arc(cx, cy, 2, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * 시작 화면 그리기
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} canvasW
 * @param {number} canvasH
 * @param {number} time - 경과 시간 (애니메이션용)
 */
function drawStartScreen(ctx, canvasW, canvasH, time) {
  // 배경 그라디언트
  const bg = ctx.createRadialGradient(canvasW / 2, canvasH / 2, 0, canvasW / 2, canvasH / 2, canvasW * 0.8);
  bg.addColorStop(0, '#1a0d35');
  bg.addColorStop(0.5, '#0d0820');
  bg.addColorStop(1, '#050310');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvasW, canvasH);

  // 배경 별들
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  for (let i = 0; i < 80; i++) {
    const bx = (Math.sin(i * 2.4) * 0.5 + 0.5) * canvasW;
    const by = (Math.cos(i * 1.7) * 0.5 + 0.5) * canvasH;
    const pulse = 0.5 + 0.5 * Math.sin(time * 2 + i);
    ctx.globalAlpha = pulse * 0.7;
    ctx.beginPath();
    ctx.arc(bx, by, 1.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  const cx = canvasW / 2;
  const cy = canvasH / 2;

  // 제목 후광
  const titleGlow = ctx.createRadialGradient(cx, cy - 120, 0, cx, cy - 120, 200);
  titleGlow.addColorStop(0, 'rgba(160, 80, 255, 0.3)');
  titleGlow.addColorStop(1, 'transparent');
  ctx.fillStyle = titleGlow;
  ctx.beginPath();
  ctx.arc(cx, cy - 120, 200, 0, Math.PI * 2);
  ctx.fill();

  // 게임 제목
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  ctx.shadowColor = '#aa55ff';
  ctx.shadowBlur = 30 + Math.sin(time * 2) * 10;
  ctx.font = `bold ${Math.min(42, canvasW * 0.065)}px Georgia, serif`;
  ctx.fillStyle = '#e8ccff';
  ctx.fillText('✦ 마법사 핍의 모험 ✦', cx, cy - 140);

  ctx.shadowBlur = 0;
  ctx.font = `${Math.min(18, canvasW * 0.028)}px Georgia, serif`;
  ctx.fillStyle = '#b088dd';
  ctx.fillText('Magic Survivor - 어둠의 숲에서 살아남아라', cx, cy - 100);

  // 미니 캐릭터 (시작 화면용 - canvas 도형)
  drawStartCharacter(ctx, cx, cy - 20, time);

  // 조작법 패널
  const infoY = cy + 100;
  const infoW = Math.min(420, canvasW * 0.65);
  const infoH = 130;
  const infoX = cx - infoW / 2;

  ctx.fillStyle = 'rgba(10, 5, 25, 0.8)';
  roundRect(ctx, infoX, infoY, infoW, infoH, 12);
  ctx.fill();
  ctx.strokeStyle = 'rgba(160, 100, 255, 0.4)';
  ctx.lineWidth = 1.5;
  roundRect(ctx, infoX, infoY, infoW, infoH, 12);
  ctx.stroke();

  ctx.fillStyle = '#d4aaff';
  ctx.font = `bold ${Math.min(14, canvasW * 0.022)}px Georgia, serif`;
  ctx.fillText('◈ 조작 방법 ◈', cx, infoY + 20);

  const controls = [
    ['W A S D', '이동'],
    ['마우스', '마법봉 조준'],
    ['좌클릭 (hold)', '마법 발사'],
  ];
  ctx.font = `${Math.min(13, canvasW * 0.02)}px Georgia, serif`;
  controls.forEach(([key, desc], i) => {
    ctx.textAlign = 'right';
    ctx.fillStyle = '#ffddaa';
    ctx.fillText(key, cx - 8, infoY + 50 + i * 24);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ccbbee';
    ctx.fillText(`▸ ${desc}`, cx + 8, infoY + 50 + i * 24);
  });

  // 시작 버튼
  const btnW = 180, btnH = 48;
  const btnX = cx - btnW / 2, btnY = cy + 255;
  const btnPulse = 0.85 + 0.15 * Math.sin(time * 3);

  ctx.globalAlpha = btnPulse;
  const btnGrad = ctx.createLinearGradient(btnX, btnY, btnX, btnY + btnH);
  btnGrad.addColorStop(0, '#8833dd');
  btnGrad.addColorStop(1, '#5511aa');
  ctx.fillStyle = btnGrad;
  roundRect(ctx, btnX, btnY, btnW, btnH, 10);
  ctx.fill();

  ctx.strokeStyle = 'rgba(200, 150, 255, 0.7)';
  ctx.lineWidth = 2;
  roundRect(ctx, btnX, btnY, btnW, btnH, 10);
  ctx.stroke();

  ctx.shadowColor = '#aa66ff';
  ctx.shadowBlur = 12;
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${Math.min(18, canvasW * 0.028)}px Georgia, serif`;
  ctx.textAlign = 'center';
  ctx.fillText('✦ 게임 시작 ✦', cx, btnY + btnH / 2);
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;

  // 시작 버튼 영역 반환 (클릭 감지용)
  return { btnX, btnY, btnW, btnH };
}

/** 시작 화면 미니 캐릭터 프리뷰 */
function drawStartCharacter(ctx, cx, cy, time) {
  const bob = Math.sin(time * 2.5) * 4;
  ctx.save();
  ctx.translate(cx, cy + bob);

  // 간단한 치비 마법사 실루엣
  const s = 28;

  // 망토
  ctx.fillStyle = '#5533aa';
  ctx.beginPath();
  ctx.ellipse(0, s * 0.4, s * 0.9, s * 1.1, 0, 0, Math.PI * 2);
  ctx.fill();

  // 머리
  ctx.fillStyle = '#f5dbbe';
  ctx.shadowColor = '#8855ff';
  ctx.shadowBlur = 15;
  ctx.beginPath();
  ctx.arc(0, -s * 0.85, s * 1.05, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  // 눈
  ctx.fillStyle = '#333';
  ctx.beginPath(); ctx.arc(-s * 0.28, -s * 0.9, s * 0.13, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(s * 0.3, -s * 0.9, s * 0.13, 0, Math.PI * 2); ctx.fill();

  // 모자
  ctx.fillStyle = '#4a2d8a';
  ctx.beginPath();
  ctx.moveTo(-s * 0.55, -s * 1.82);
  ctx.quadraticCurveTo(-s * 0.1, -s * 3.2, s * 0.18, -s * 3.15);
  ctx.quadraticCurveTo(s * 0.5, -s * 2.5, s * 0.55, -s * 1.82);
  ctx.closePath();
  ctx.fill();

  // 모자 별
  ctx.fillStyle = '#ffd700';
  ctx.shadowColor = '#ffd700';
  ctx.shadowBlur = 8;
  drawStar(ctx, s * 0.08, -s * 2.8, s * 0.2, s * 0.09, 5);
  ctx.fill();
  ctx.shadowBlur = 0;

  // 마법봉 (회전)
  const wandAngle = Math.sin(time * 1.5) * 0.6 - 0.3;
  const tipX = s * 1.5 * Math.cos(wandAngle);
  const tipY = s * 1.5 * Math.sin(wandAngle) - s * 0.3;
  ctx.strokeStyle = '#7a4a2a';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(s * 0.3, -s * 0.1);
  ctx.lineTo(tipX, tipY);
  ctx.stroke();

  ctx.fillStyle = '#cc88ff';
  ctx.shadowColor = '#cc88ff';
  ctx.shadowBlur = 12;
  drawStar(ctx, tipX, tipY, s * 0.3, s * 0.13, 5);
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.restore();
}

/**
 * 레벨업 화면 그리기 (마법 카드 선택)
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} canvasW
 * @param {number} canvasH
 * @param {object[]} options - 레벨업 선택지 배열
 * @param {Player} player
 * @param {number} time
 * @returns {object[]} 카드 클릭 영역 배열
 */
function drawLevelUpScreen(ctx, canvasW, canvasH, options, player, time) {
  // 배경 어두운 오버레이
  ctx.fillStyle = 'rgba(5, 2, 15, 0.85)';
  ctx.fillRect(0, 0, canvasW, canvasH);

  const cx = canvasW / 2;
  const cy = canvasH / 2;

  // 제목
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = '#dd99ff';
  ctx.shadowBlur = 20;
  ctx.font = `bold ${Math.min(30, canvasW * 0.045)}px Georgia, serif`;
  ctx.fillStyle = '#f0d8ff';
  ctx.fillText(`✦ 레벨 업! Lv.${player.level} → Lv.${player.level + 1} ✦`, cx, cy - 150);
  ctx.shadowBlur = 0;

  ctx.font = `${Math.min(15, canvasW * 0.023)}px Georgia, serif`;
  ctx.fillStyle = '#c0a0e0';
  ctx.fillText('능력을 선택하세요', cx, cy - 110);

  // 카드 배치
  const cardW = Math.min(160, canvasW * 0.22);
  const cardH = 200;
  const gap = 24;
  const totalW = options.length * cardW + (options.length - 1) * gap;
  const startX = cx - totalW / 2;
  const cardY = cy - 80;

  const cardRects = [];

  options.forEach((opt, i) => {
    const cardX = startX + i * (cardW + gap);
    const isHovered = opt.hovered;

    // 카드 호버 효과
    const cardOffsetY = isHovered ? -12 : 0;
    const glowStrength = isHovered ? 25 : 8;

    // 카드 발광
    ctx.shadowColor = opt.glowColor || '#aa66ff';
    ctx.shadowBlur = glowStrength + Math.sin(time * 3 + i) * 4;

    // 카드 배경
    const cardGrad = ctx.createLinearGradient(cardX, cardY + cardOffsetY, cardX, cardY + cardH + cardOffsetY);
    cardGrad.addColorStop(0, isHovered ? '#2a1250' : '#1a0b38');
    cardGrad.addColorStop(1, isHovered ? '#180b30' : '#0f0620');
    ctx.fillStyle = cardGrad;
    roundRect(ctx, cardX, cardY + cardOffsetY, cardW, cardH, 14);
    ctx.fill();

    // 카드 테두리
    ctx.strokeStyle = isHovered ? (opt.glowColor || '#bb77ff') : 'rgba(150, 80, 255, 0.4)';
    ctx.lineWidth = isHovered ? 2.5 : 1.5;
    roundRect(ctx, cardX, cardY + cardOffsetY, cardW, cardH, 14);
    ctx.stroke();

    ctx.shadowBlur = 0;

    // 아이콘
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `${Math.min(36, cardW * 0.22)}px serif`;
    ctx.fillText(opt.icon, cardX + cardW / 2, cardY + cardOffsetY + 45);

    // 능력 이름
    ctx.font = `bold ${Math.min(14, cardW * 0.087)}px Georgia, serif`;
    ctx.fillStyle = '#e8d8ff';
    ctx.fillText(opt.name, cardX + cardW / 2, cardY + cardOffsetY + 90);

    // 수치 변화 표시
    ctx.font = `${Math.min(13, cardW * 0.082)}px Georgia, serif`;
    ctx.fillStyle = '#ffddaa';
    ctx.fillText(`${opt.before} → ${opt.after}`, cardX + cardW / 2, cardY + cardOffsetY + 115);

    // 설명
    ctx.font = `${Math.min(11, cardW * 0.069)}px Georgia, serif`;
    ctx.fillStyle = '#b0a0d8';

    // 설명 텍스트 줄바꿈 처리
    wrapText(ctx, opt.desc, cardX + cardW / 2, cardY + cardOffsetY + 145, cardW - 16, 16);

    // 선택 버튼
    const btnH = 30;
    const btnY2 = cardY + cardOffsetY + cardH - btnH - 10;
    const btnGrad2 = ctx.createLinearGradient(cardX + 10, btnY2, cardX + 10, btnY2 + btnH);
    btnGrad2.addColorStop(0, opt.btnColorTop || '#6622bb');
    btnGrad2.addColorStop(1, opt.btnColorBot || '#4411aa');
    ctx.fillStyle = btnGrad2;
    roundRect(ctx, cardX + 10, btnY2, cardW - 20, btnH, 8);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${Math.min(12, cardW * 0.075)}px Georgia, serif`;
    ctx.fillText('선택', cardX + cardW / 2, btnY2 + btnH / 2);

    cardRects.push({
      x: cardX, y: cardY + cardOffsetY,
      w: cardW, h: cardH,
      optIndex: i,
    });
  });

  return cardRects;
}

/**
 * 게임 오버 화면 그리기
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} canvasW
 * @param {number} canvasH
 * @param {{ survivalTime, level, kills }} stats
 * @param {number} time
 * @returns {{ btnX, btnY, btnW, btnH }}
 */
function drawGameOverScreen(ctx, canvasW, canvasH, stats, time) {
  // 어둠에 잠기는 효과
  const bg = ctx.createRadialGradient(canvasW / 2, canvasH / 2, 0, canvasW / 2, canvasH / 2, canvasW * 0.7);
  bg.addColorStop(0, 'rgba(15, 5, 30, 0.92)');
  bg.addColorStop(1, 'rgba(0, 0, 0, 0.97)');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvasW, canvasH);

  const cx = canvasW / 2;
  const cy = canvasH / 2;

  // 흩어지는 어두운 파티클 효과 (시간 기반 애니메이션)
  for (let i = 0; i < 12; i++) {
    const ang = i * (Math.PI * 2 / 12) + time * 0.3;
    const r = 100 + Math.sin(time * 1.5 + i) * 30;
    const px = cx + Math.cos(ang) * r;
    const py = cy - 40 + Math.sin(ang) * r * 0.4;
    ctx.fillStyle = `hsla(${270 + i * 10}, 60%, 25%, ${0.3 + Math.sin(time * 2 + i) * 0.15})`;
    ctx.beginPath();
    ctx.arc(px, py, 4 + Math.sin(time + i * 2) * 2, 0, Math.PI * 2);
    ctx.fill();
  }

  // 게임 오버 텍스트
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = '#550022';
  ctx.shadowBlur = 30;
  ctx.font = `bold ${Math.min(46, canvasW * 0.07)}px Georgia, serif`;
  ctx.fillStyle = '#cc3355';
  ctx.fillText('✝ 마법이 꺼졌습니다 ✝', cx, cy - 150);
  ctx.shadowBlur = 0;

  ctx.font = `${Math.min(16, canvasW * 0.025)}px Georgia, serif`;
  ctx.fillStyle = '#9977aa';
  ctx.fillText('핍은 어둠 속으로 사라졌습니다...', cx, cy - 105);

  // 결과 패널
  const panelW = Math.min(340, canvasW * 0.55);
  const panelH = 140;
  const panelX = cx - panelW / 2;
  const panelY = cy - 80;

  ctx.fillStyle = 'rgba(8, 3, 20, 0.85)';
  roundRect(ctx, panelX, panelY, panelW, panelH, 12);
  ctx.fill();
  ctx.strokeStyle = 'rgba(180, 60, 90, 0.5)';
  ctx.lineWidth = 1.5;
  roundRect(ctx, panelX, panelY, panelW, panelH, 12);
  ctx.stroke();

  const resultLines = [
    ['⏱ 생존 시간', formatTime(stats.survivalTime)],
    ['✦ 최종 레벨', `Lv. ${stats.level}`],
    ['☠ 총 처치 수', `${stats.kills} 마리`],
  ];

  ctx.font = `${Math.min(15, canvasW * 0.023)}px Georgia, serif`;
  resultLines.forEach(([label, val], i) => {
    ctx.textAlign = 'left';
    ctx.fillStyle = '#c8a8dd';
    ctx.fillText(label, panelX + 20, panelY + 28 + i * 36);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#ffddaa';
    ctx.font = `bold ${Math.min(15, canvasW * 0.023)}px Georgia, serif`;
    ctx.fillText(val, panelX + panelW - 20, panelY + 28 + i * 36);
    ctx.font = `${Math.min(15, canvasW * 0.023)}px Georgia, serif`;
  });

  // 다시 시작 버튼
  const btnW = 190, btnH = 50;
  const btnX = cx - btnW / 2;
  const btnY = cy + 90;
  const pulse = 0.85 + 0.15 * Math.sin(time * 2.5);

  ctx.globalAlpha = pulse;
  const btnGrad = ctx.createLinearGradient(btnX, btnY, btnX, btnY + btnH);
  btnGrad.addColorStop(0, '#882233');
  btnGrad.addColorStop(1, '#551122');
  ctx.fillStyle = btnGrad;
  roundRect(ctx, btnX, btnY, btnW, btnH, 10);
  ctx.fill();

  ctx.strokeStyle = 'rgba(220, 100, 130, 0.6)';
  ctx.lineWidth = 2;
  roundRect(ctx, btnX, btnY, btnW, btnH, 10);
  ctx.stroke();

  ctx.shadowColor = '#ff4466';
  ctx.shadowBlur = 10;
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${Math.min(18, canvasW * 0.028)}px Georgia, serif`;
  ctx.textAlign = 'center';
  ctx.fillText('✦ 다시 시작 ✦', cx, btnY + btnH / 2);
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;

  return { btnX, btnY, btnW, btnH };
}

/** 시간(초)을 "분:초" 형식으로 변환 */
function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

/** 캔버스에 텍스트 줄바꿈 그리기 */
function wrapText(ctx, text, cx, y, maxWidth, lineHeight) {
  const words = text.split(' ');
  let line = '';
  for (const word of words) {
    const test = line ? line + ' ' + word : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, cx, y);
      line = word;
      y += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, cx, y);
}

/** 데미지 숫자 표시 (팝업) */
function drawDamageNumbers(ctx, damageNumbers, camX, camY) {
  for (const dn of damageNumbers) {
    if (!dn.alive) continue;
    const alpha = dn.life / dn.maxLife;
    ctx.globalAlpha = alpha;
    ctx.font = `bold ${dn.size}px Georgia, serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = dn.color;
    ctx.shadowColor = dn.color;
    ctx.shadowBlur = 5;
    ctx.fillText(dn.value, dn.x - camX, dn.y - camY);
    ctx.shadowBlur = 0;
  }
  ctx.globalAlpha = 1;
}
