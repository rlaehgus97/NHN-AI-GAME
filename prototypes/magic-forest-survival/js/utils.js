// ============================================================
// UTILS: 공통 유틸리티 함수 모음
// ============================================================

/** 두 점 사이의 거리 계산 */
function dist(ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  return Math.sqrt(dx * dx + dy * dy);
}

/** 선형 보간 (Linear interpolation) */
function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** 값을 min~max 범위로 제한 */
function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

/** 각도를 -PI ~ PI 범위로 정규화 */
function normalizeAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/** 랜덤 정수 (min 이상 max 이하) */
function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** 랜덤 실수 (min 이상 max 미만) */
function randFloat(min, max) {
  return Math.random() * (max - min) + min;
}

/** 특정 범위 안의 랜덤 HSL 색상 문자열 */
function randColor(hMin, hMax, s, l) {
  return `hsl(${randFloat(hMin, hMax).toFixed(0)}, ${s}%, ${l}%)`;
}

/** 2D 벡터 정규화 (단위 벡터로 변환) */
function normalize(dx, dy) {
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len === 0) return { x: 0, y: 0 };
  return { x: dx / len, y: dy / len };
}

/** 별 모양 경로를 ctx에 그림 (외부에서 fill/stroke 호출) */
function drawStar(ctx, cx, cy, outerR, innerR, points) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const r = (i % 2 === 0) ? outerR : innerR;
    const angle = (i * Math.PI) / points - Math.PI / 2;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

/** 원형 그라디언트 발광 효과 */
function drawGlow(ctx, cx, cy, radius, color, alpha) {
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
  grad.addColorStop(0, color.replace(')', `, ${alpha})`).replace('rgb', 'rgba').replace('hsl', 'hsla'));
  grad.addColorStop(1, color.replace(')', ', 0)').replace('rgb', 'rgba').replace('hsl', 'hsla'));
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();
}

/** 텍스트를 캔버스 중앙에 그리기 */
function drawCenteredText(ctx, text, x, y, font, color) {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
}

/** 둥근 사각형 경로 그리기 */
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
