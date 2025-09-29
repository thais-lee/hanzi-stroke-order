// utils/misc.js
export const CHAR_BOX_SCALE = 0.9; // tỉ lệ chữ trong ô (dùng chung Stage + Video)
export const GLYPH_SCALE = CHAR_BOX_SCALE; // PDF glyph mờ khớp đúng với animation

export const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
export const mmToPt = mm => (mm * 72) / 25.4;
// eslint-disable-next-line no-control-regex
export const hasNonLatin = s => /[^\x00-\x7F]/.test(s || '');
export const asciiOnly = s => (s || '').replace(/[^ -~]/g, '');

export const GRID_DEFAULTS = {
  enabled: true,
  bg: '#ffffff',
  majorColor: '#BFCAE4', // đường chính 3×3
  minorColor: '#D5DDEF', // lưới con 4×4
  borderColor: '#BFCAE4',
  sameThickness: false, // lưới con mảnh hơn
  minorDash: [2, 6], // nét đứt cho lưới con (animation + video)
  borderRadius: 14, // bo góc khung; 0 = viền vuông
};

/**
 * Vẽ nền + lưới 3×3 + lưới con 4×4 (trong từng ô lớn).
 * - Hỗ trợ 2 kiểu gọi:
 *   drawGridOnCtx(ctx, size, optsObject)
 *   drawGridOnCtx(ctx, size, bgString, majorColorString) // tương thích cũ
 */
export function drawGridOnCtx(
  ctx,
  size,
  opts = '#fff',
  lineLegacy = '#E5E7EB',
) {
  const o =
    typeof opts === 'string'
      ? {
          ...GRID_DEFAULTS,
          bg: opts,
          majorColor: lineLegacy,
          minorColor: lineLegacy,
          borderColor: lineLegacy,
        }
      : { ...GRID_DEFAULTS, ...opts };

  const scale = Math.max(1, Math.round(size / 360));
  const majorTh = scale;
  const minorTh = o.sameThickness
    ? majorTh
    : Math.max(1, Math.floor(majorTh * 0.9));

  // nền (phải vẽ kín để video không bị nền đen)
  ctx.save();
  if (o.borderRadius > 0) {
    const r = o.borderRadius;
    ctx.beginPath();
    ctx.moveTo(r, 0);
    ctx.lineTo(size - r, 0);
    ctx.quadraticCurveTo(size, 0, size, r);
    ctx.lineTo(size, size - r);
    ctx.quadraticCurveTo(size, size, size - r, size);
    ctx.lineTo(r, size);
    ctx.quadraticCurveTo(0, size, 0, size - r);
    ctx.lineTo(0, r);
    ctx.quadraticCurveTo(0, 0, r, 0);
    ctx.closePath();
    ctx.fillStyle = o.bg;
    ctx.fill();
  } else {
    ctx.fillStyle = o.bg;
    ctx.fillRect(0, 0, size, size);
  }

  if (!o.enabled) {
    // chỉ viền ngoài rồi thoát
    ctx.setLineDash([]);
    ctx.strokeStyle = o.borderColor;
    ctx.lineWidth = majorTh;
    if (o.borderRadius > 0) {
      const r = o.borderRadius;
      ctx.beginPath();
      ctx.moveTo(r, 0);
      ctx.lineTo(size - r, 0);
      ctx.quadraticCurveTo(size, 0, size, r);
      ctx.lineTo(size, size - r);
      ctx.quadraticCurveTo(size, size, size - r, size);
      ctx.lineTo(r, size);
      ctx.quadraticCurveTo(0, size, 0, size - r);
      ctx.lineTo(0, r);
      ctx.quadraticCurveTo(0, 0, r, 0);
      ctx.stroke();
    } else {
      ctx.strokeRect(0, 0, size, size);
    }
    ctx.restore();
    return;
  }

  const cell = size / 3;

  // 3×3
  ctx.setLineDash([]);
  ctx.strokeStyle = o.majorColor;
  ctx.lineWidth = majorTh;
  ctx.beginPath();
  ctx.moveTo(cell, 0);
  ctx.lineTo(cell, size);
  ctx.moveTo(2 * cell, 0);
  ctx.lineTo(2 * cell, size);
  ctx.moveTo(0, cell);
  ctx.lineTo(size, cell);
  ctx.moveTo(0, 2 * cell);
  ctx.lineTo(size, 2 * cell);
  ctx.stroke();

  // 4×4 trong mỗi ô lớn
  if (o.minorDash && Array.isArray(o.minorDash)) {
    const dash = o.minorDash.map(v => v * scale);
    ctx.setLineDash(dash);
  } else ctx.setLineDash([]);

  ctx.strokeStyle = o.minorColor;
  ctx.lineWidth = minorTh;

  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const x0 = c * cell;
      const y0 = r * cell;
      const step = cell / 4;
      for (let q = 1; q <= 3; q++) {
        const x = x0 + q * step;
        ctx.beginPath();
        ctx.moveTo(x, y0);
        ctx.lineTo(x, y0 + cell);
        ctx.stroke();
        const y = y0 + q * step;
        ctx.beginPath();
        ctx.moveTo(x0, y);
        ctx.lineTo(x0 + cell, y);
        ctx.stroke();
      }
    }
  }

  // viền
  ctx.setLineDash([]);
  ctx.strokeStyle = o.borderColor;
  ctx.lineWidth = majorTh;
  if (o.borderRadius > 0) {
    const r = o.borderRadius;
    ctx.beginPath();
    ctx.moveTo(r, 0);
    ctx.lineTo(size - r, 0);
    ctx.quadraticCurveTo(size, 0, size, r);
    ctx.lineTo(size, size - r);
    ctx.quadraticCurveTo(size, size, size - r, size);
    ctx.lineTo(r, size);
    ctx.quadraticCurveTo(0, size, 0, size - r);
    ctx.lineTo(0, r);
    ctx.quadraticCurveTo(0, 0, r, 0);
    ctx.stroke();
  } else {
    ctx.strokeRect(0, 0, size, size);
  }
  ctx.restore();
}

/** Canvas trống để captureStream (video). */
export function makeCompositeCanvas(_srcCanvas, outDim) {
  const comp = document.createElement('canvas');
  comp.width = outDim;
  comp.height = outDim;
  const ctx = comp.getContext('2d');
  return { comp, ctx };
}
