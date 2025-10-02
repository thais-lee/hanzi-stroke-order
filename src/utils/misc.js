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
  majorColor: '#BFCAE4', // đường chính
  minorColor: '#D5DDEF', // lưới con
  borderColor: '#BFCAE4',
  sameThickness: false, // lưới con mảnh hơn
  minorDash: [2, 6], // nét đứt cho lưới con (animation + video)
  borderRadius: 14, // bo góc khung; 0 = viền vuông

  // NEW – tuỳ chọn lưới thống nhất
  gridMode: '3x3', // '3x3' | '2x2' | 'mi' | 'zhong' | 'hui'
  subdividePerCell4x4: true, // áp dụng cho 3×3 & 2×2
  includeDiagonals: false, // chéo cho 3×3/2×2
  zhongInnerRatio: 0.5, // 0.25..0.8
  huiInnerMarginRatio: 0.16, // 0.1..0.3
};

/**
 * Vẽ nền + lưới theo gridMode lên CanvasRenderingContext2D.
 * Hỗ trợ 2 cách gọi:
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

  // --- NỀN (phải vẽ kín để video không bị nền đen)
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

  // Nếu tắt lưới: chỉ vẽ viền ngoài rồi thoát
  if (!o.enabled) {
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

  // --- Helper: lưới con 4×4 trong vùng (x0..x0+side, y0..y0+side)
  const drawMinor4x4Within = (x0, y0, side) => {
    const step = side / 4;
    if (o.minorDash && Array.isArray(o.minorDash)) {
      const dash = o.minorDash.map(v => v * scale);
      ctx.setLineDash(dash);
    } else {
      ctx.setLineDash([]);
    }
    ctx.strokeStyle = o.minorColor;
    ctx.lineWidth = minorTh;
    for (let q = 1; q <= 3; q++) {
      const x = x0 + q * step;
      const y = y0 + q * step;
      ctx.beginPath();
      ctx.moveTo(x, y0);
      ctx.lineTo(x, y0 + side);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.lineTo(x0 + side, y);
      ctx.stroke();
    }
  };

  // --- VẼ LƯỚI CHÍNH THEO gridMode
  const {
    gridMode = '3x3',
    subdividePerCell4x4 = true,
    includeDiagonals = false,
    zhongInnerRatio = 0.5,
    huiInnerMarginRatio = 0.16,
  } = o;

  // các đường chính: nét liền
  ctx.setLineDash([]);
  ctx.strokeStyle = o.majorColor;
  ctx.lineWidth = majorTh;

  if (gridMode === '2x2') {
    const mid = size / 2;
    ctx.beginPath();
    ctx.moveTo(mid, 0);
    ctx.lineTo(mid, size);
    ctx.moveTo(0, mid);
    ctx.lineTo(size, mid);
    ctx.stroke();

    if (includeDiagonals) {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(size, size);
      ctx.moveTo(size, 0);
      ctx.lineTo(0, size);
      ctx.stroke();
    }

    if (subdividePerCell4x4) {
      const sub = size / 2;
      for (let r = 0; r < 2; r++)
        for (let c = 0; c < 2; c++) drawMinor4x4Within(c * sub, r * sub, sub);
    }
  } else if (gridMode === 'mi') {
    const mid = size / 2;
    ctx.beginPath();
    ctx.moveTo(mid, 0);
    ctx.lineTo(mid, size); // dọc
    ctx.moveTo(0, mid);
    ctx.lineTo(size, mid); // ngang
    ctx.moveTo(0, 0);
    ctx.lineTo(size, size); // chéo \
    ctx.moveTo(size, 0);
    ctx.lineTo(0, size); // chéo /
    ctx.stroke();
    // không có lưới con 4×4 trong kiểu này
  } else if (gridMode === 'zhong') {
    const mid = size / 2;
    ctx.beginPath();
    ctx.moveTo(mid, 0);
    ctx.lineTo(mid, size);
    ctx.moveTo(0, mid);
    ctx.lineTo(size, mid);
    ctx.stroke();

    // ô trung cung (dùng nét mảnh + dash giống minor)
    const inner = size * Math.min(Math.max(zhongInnerRatio, 0.25), 0.8);
    const x = (size - inner) / 2;
    const y = (size - inner) / 2;
    if (o.minorDash && Array.isArray(o.minorDash)) {
      const dash = o.minorDash.map(v => v * scale);
      ctx.setLineDash(dash);
    } else ctx.setLineDash([]);
    ctx.strokeStyle = o.minorColor;
    ctx.lineWidth = minorTh;
    ctx.strokeRect(x, y, inner, inner);
  } else if (gridMode === 'hui') {
    // khung trong (dùng nét chính)
    const m = size * Math.min(Math.max(huiInnerMarginRatio, 0.1), 0.3);
    ctx.setLineDash([]);
    ctx.strokeStyle = o.majorColor;
    ctx.lineWidth = majorTh;
    ctx.strokeRect(m, m, size - 2 * m, size - 2 * m);
  } else {
    // 3×3 mặc định
    const cell = size / 3;
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

    if (includeDiagonals) {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(size, size);
      ctx.moveTo(size, 0);
      ctx.lineTo(0, size);
      ctx.stroke();
    }

    if (subdividePerCell4x4) {
      for (let r = 0; r < 3; r++)
        for (let c = 0; c < 3; c++) {
          const x0 = c * cell,
            y0 = r * cell;
          drawMinor4x4Within(x0, y0, cell);
        }
    }
  }

  // --- VIỀN NGOÀI
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
