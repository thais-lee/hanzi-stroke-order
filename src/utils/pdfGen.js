// utils/pdfGen.js
import HanziWriter from 'hanzi-writer';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { loadCharData } from './hanzi';
import {
  GLYPH_SCALE,
  mmToPt,
  hasNonLatin,
  asciiOnly,
  GRID_DEFAULTS,
} from './misc';

export const PAGE_SIZES = {
  A4: { w: 595.28, h: 841.89 },
  Letter: { w: 612, h: 792 },
};

// Vẽ chữ thành PNG theo transform HanziWriter (dùng cho glyph mờ trong ô)
async function makeGlyphPngDataUrl(char, px, paddingPx, alpha) {
  const data = await loadCharData(char);
  const canvas = document.createElement('canvas');
  canvas.width = px;
  canvas.height = px;
  const ctx = canvas.getContext('2d');

  const tf = HanziWriter.getScalingTransform(px, px, paddingPx);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  let applied = false;
  if (tf && typeof tf.transform === 'string') {
    const m = tf.transform.match(/matrix\(([^)]+)\)/);
    if (m) {
      const nums = m[1].trim().split(/[ ,]+/).map(Number);
      if (nums.length >= 6 && nums.every(Number.isFinite)) {
        const [a, b, c, d, e, f] = nums;
        ctx.setTransform(a, b, c, d, e, f);
        applied = true;
      }
    }
    if (!applied) {
      let tx = 0,
        ty = 0,
        sx = 1,
        sy = 1;
      const t = tf.transform.match(/translate\(([^)]+)\)/);
      if (t) {
        const p = t[1].trim().split(/[ ,]+/).map(Number);
        tx = p[0] || 0;
        ty = p[1] ?? 0;
      }
      const s = tf.transform.match(/scale\(([^)]+)\)/);
      if (s) {
        const p = s[1].trim().split(/[ ,]+/).map(Number);
        sx = p[0];
        sy = p.length > 1 ? p[1] : sx;
      }
      ctx.translate(tx, ty);
      ctx.scale(sx, sy);
      applied = true;
    }
  }
  if (!applied && tf && 'x' in tf) {
    ctx.translate(tf.x, tf.y);
    ctx.scale(tf.scale, -tf.scale);
    applied = true;
  }
  if (!applied) {
    const inner = px - paddingPx * 2;
    const s = inner / 1024;
    ctx.translate(paddingPx, paddingPx + inner);
    ctx.scale(s, -s);
  }

  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#111';
  for (const d of data.strokes) ctx.fill(new Path2D(d));
  ctx.restore();

  return canvas.toDataURL('image/png');
}

export async function generatePracticePDF(opts) {
  const {
    selected,
    chars,
    pageSize = 'A4',
    orientation = 'portrait',
    cols = 6,
    marginMm = 12,
    includeDiagonals = false, // (tuỳ chọn thêm)
    showFaint = true,
    faintAlpha = 0.18,
    sourceMode = 'selected',
    title = 'Bảng luyện viết',
    cjkFontBytes = null,

    // === LƯỚI ===
    gridEnabled = true,
    gridOpts = GRID_DEFAULTS, // màu/nét giống animation
  } = opts;

  const { w: baseW, h: baseH } = PAGE_SIZES[pageSize] || PAGE_SIZES.A4;
  const isPortrait = orientation === 'portrait';
  const pageW = isPortrait ? baseW : baseH;
  const pageH = isPortrait ? baseH : baseW;
  const margin = mmToPt(marginMm);
  const _cols = Math.max(2, Math.min(12, cols));
  const usableW = pageW - margin * 2;
  const cell = Math.floor(usableW / _cols);
  const rows = Math.max(1, Math.floor((pageH - margin * 2) / cell));
  if (cell < 24) throw new Error('CELL_TOO_SMALL');

  const doc = await PDFDocument.create();
  const page = doc.addPage([pageW, pageH]);

  // dữ liệu chữ
  const rawSeq =
    sourceMode === 'selected' ? [selected] : chars?.length ? chars : [selected];
  const checks = await Promise.all(
    rawSeq.map(ch =>
      loadCharData(ch)
        .then(() => ({ ch, ok: true }))
        .catch(() => ({ ch, ok: false })),
    ),
  );
  const validSeq = checks.filter(r => r.ok).map(r => r.ch);
  const invalid = checks.filter(r => !r.ok).map(r => r.ch);
  if (!validSeq.length) throw new Error('NO_VALID_CHARS');

  // chuẩn bị glyph mờ
  const uniqueSeq = Array.from(new Set(validSeq));
  const glyphMap = new Map();
  const basePx = Math.max(360, Math.round(Math.max(cell * 2.4, 480)));
  const pxCap = uniqueSeq.length > 24 ? 600 : 900;
  if (showFaint) {
    for (const ch of uniqueSeq) {
      const px = Math.min(basePx, pxCap);
      const pad = Math.max(0, Math.round((px * (1 - GLYPH_SCALE)) / 2));
      const url = await makeGlyphPngDataUrl(ch, px, pad, faintAlpha);
      const img = await doc.embedPng(url);
      glyphMap.set(ch, img);
    }
  }

  // màu/nét lưới (PDF không luôn hỗ trợ dash tốt → dùng đường liền; nếu bản pdf-lib của bạn có dashArray thì có thể thêm)
  const majorColor = rgb(0.75, 0.79, 0.89); // #BFCAE4
  const minorColor = rgb(0.84, 0.87, 0.94); // #D5DDEF
  const borderColor = rgb(0.75, 0.79, 0.89);
  const majorTh = Math.max(0.8, cell / 180);
  const minorTh = gridOpts?.sameThickness
    ? majorTh
    : Math.max(0.6, majorTh * 0.66);

  const drawLine = (x1, y1, x2, y2, th, color) =>
    page.drawLine({
      start: { x: x1, y: y1 },
      end: { x: x2, y: y2 },
      thickness: th,
      color,
    });

  const drawRect = (x, y, w, h, th, color) =>
    page.drawRectangle({
      x,
      y,
      width: w,
      height: h,
      borderWidth: th,
      borderColor: color,
      color: rgb(1, 1, 1),
    });

  let idx = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < _cols; c++) {
      const x = margin + c * cell;
      const yTop = margin + r * cell;
      const y = pageH - (yTop + cell);

      if (gridEnabled) {
        // viền ô
        drawRect(x, y, cell, cell, majorTh, borderColor);
        // 3×3
        const t1x = x + cell / 3,
          t2x = x + (2 * cell) / 3;
        const t1y = y + cell / 3,
          t2y = y + (2 * cell) / 3;
        drawLine(t1x, y, t1x, y + cell, majorTh, majorColor);
        drawLine(t2x, y, t2x, y + cell, majorTh, majorColor);
        drawLine(x, t1y, x + cell, t1y, majorTh, majorColor);
        drawLine(x, t2y, x + cell, t2y, majorTh, majorColor);
        if (includeDiagonals) {
          drawLine(x, y, x + cell, y + cell, minorTh, minorColor);
          drawLine(x + cell, y, x, y + cell, minorTh, minorColor);
        }
        // 4×4 trong mỗi ô
        const step = cell / 4;
        for (let q = 1; q <= 3; q++) {
          const xs = x + q * step;
          drawLine(xs, y, xs, y + cell, minorTh, minorColor);
          const ys = y + q * step;
          drawLine(x, ys, x + cell, ys, minorTh, minorColor);
        }
      }

      // glyph mờ
      if (showFaint && glyphMap.size) {
        const ch = validSeq[idx % validSeq.length];
        const img = glyphMap.get(ch);
        if (img)
          page.drawImage(img, { x, y, width: cell, height: cell, opacity: 1 });
      }
      idx++;
    }
  }

  // footer
  const rawFooter = `${
    title || 'Practice sheet'
  } • ${new Date().toLocaleDateString()}`;
  let footerText = rawFooter;
  let font;
  try {
    if (cjkFontBytes)
      font = await doc.embedFont(cjkFontBytes, { subset: true });
    else {
      font = await doc.embedFont(StandardFonts.Helvetica);
      if (hasNonLatin(footerText)) footerText = asciiOnly(rawFooter);
    }
  } catch {
    font = await doc.embedFont(StandardFonts.Helvetica);
    footerText = asciiOnly(rawFooter);
  }
  page.drawText(footerText, {
    x: margin,
    y: margin / 2.2,
    size: 9,
    font,
    color: rgb(0.45, 0.47, 0.5),
  });

  const bytes = await doc.save();
  const blob = new Blob([bytes], { type: 'application/pdf' });

  const info = `${_cols} cột × ${Math.max(
    1,
    Math.floor((pageH - margin * 2) / cell),
  )} hàng • ô ~${Math.round(cell)}pt (${Math.round(cell * 0.3528)}mm)`;
  const warn = invalid.length
    ? `Bỏ qua ký tự không có dữ liệu: ${invalid.join(' ')}`
    : '';
  return { blob, info, warn };
}
