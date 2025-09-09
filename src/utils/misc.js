export const GLYPH_SCALE = 0.88; // 88% kích thước ô

export const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
export const mmToPt = mm => (mm * 72) / 25.4;

// eslint-disable-next-line no-control-regex
export const hasNonLatin = s => /[^\x00-\x7F]/.test(s || '');
export const asciiOnly = s => (s || '').replace(/[^ -~]/g, '');

// Vẽ lưới 3x3 lên canvas
export function drawGridOnCtx(ctx, size, bg = '#fff', line = '#E5E7EB') {
  ctx.save();
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = line;
  const lw = Math.max(1, Math.round(size / 360));
  ctx.lineWidth = lw;
  const t1 = size / 3,
    t2 = (2 * size) / 3;
  ctx.beginPath();
  ctx.moveTo(t1, 0);
  ctx.lineTo(t1, size);
  ctx.moveTo(t2, 0);
  ctx.lineTo(t2, size);
  ctx.moveTo(0, t1);
  ctx.lineTo(size, t1);
  ctx.moveTo(0, t2);
  ctx.lineTo(size, t2);
  ctx.stroke();
  ctx.restore();
}

// Canvas tổng hợp: nền + lưới + canvas nguồn
export function makeCompositeCanvas(srcCanvas, outDim) {
  const comp = document.createElement('canvas');
  comp.width = outDim;
  comp.height = outDim;
  const ctx = comp.getContext('2d');
  drawGridOnCtx(ctx, outDim, '#fff');
  ctx.drawImage(srcCanvas, 0, 0, outDim, outDim);
  return { comp, ctx };
}
