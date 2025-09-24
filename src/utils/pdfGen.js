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

// === PNG toàn bộ glyph (dùng cho ô luyện – glyph mờ)
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

// === PNG từng-bước (tích lũy từ nét 0..upto) – dùng cho phần hướng dẫn
async function makeGlyphStepPngDataUrl(char, px, paddingPx, uptoStrokeIndex) {
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

  ctx.fillStyle = '#111';
  const upto = Math.min(uptoStrokeIndex, data.strokes.length - 1);
  for (let i = 0; i <= upto; i++) ctx.fill(new Path2D(data.strokes[i]));
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
    includeDiagonals = false, // (tuỳ chọn)
    showFaint = true,
    faintAlpha = 0.18,
    sourceMode = 'selected',
    title = 'Bảng luyện viết',
    cjkFontBytes = null,

    // === LƯỚI ===
    gridEnabled = true,
    gridOpts = GRID_DEFAULTS,

    // === HƯỚNG DẪN (mới) ===
    guideStepSizePt = 30, // ≈ 30px
    guideGapPt = 6, // khoảng cách giữa các bước
  } = opts;

  const { w: baseW, h: baseH } = PAGE_SIZES[pageSize] || PAGE_SIZES.A4;
  const isPortrait = orientation === 'portrait';
  const pageW = isPortrait ? baseW : baseH;
  const pageH = isPortrait ? baseH : baseW;
  const margin = mmToPt(marginMm);
  const _cols = Math.max(2, Math.min(12, cols)); // vẫn dùng cho phần luyện
  const usableW = pageW - margin * 2;
  const cell = Math.floor(usableW / _cols);
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

  // chuẩn bị glyph mờ cho phần luyện
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

  // màu/nét lưới
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

  // Lưới 3×3 + mỗi ô nhỏ chia 4×4
  const drawCellGrid = (x, y, size) => {
    drawRect(x, y, size, size, majorTh, borderColor);
    const t1x = x + size / 3,
      t2x = x + (2 * size) / 3;
    const t1y = y + size / 3,
      t2y = y + (2 * size) / 3;
    drawLine(t1x, y, t1x, y + size, majorTh, majorColor);
    drawLine(t2x, y, t2x, y + size, majorTh, majorColor);
    drawLine(x, t1y, x + size, t1y, majorTh, majorColor);
    drawLine(x, t2y, x + size, t2y, majorTh, majorColor);
    if (includeDiagonals) {
      drawLine(x, y, x + size, y + size, minorTh, minorColor);
      drawLine(x + size, y, x, y + size, minorTh, minorColor);
    }
    const sub = size / 3;
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        const sx = x + i * sub;
        const sy = y + j * sub;
        const step = sub / 4;
        for (let q = 1; q <= 3; q++) {
          drawLine(
            sx + q * step,
            sy,
            sx + q * step,
            sy + sub,
            minorTh,
            minorColor,
          );
          drawLine(
            sx,
            sy + q * step,
            sx + sub,
            sy + q * step,
            minorTh,
            minorColor,
          );
        }
      }
    }
  };

  // ===== PHẦN 1: HƯỚNG DẪN – KHÔNG PHỤ THUỘC COLS =====
  const guideChar = validSeq[0];
  const guideData = await loadCharData(guideChar);
  const strokeCount = guideData.strokes.length;

  // render ảnh từng bước ở độ phân giải cao hơn rồi thu về 30pt để nét mịn
  const pxGuide = 240; // nội suy mượt khi vẽ ở 30pt
  const padGuide = Math.max(0, Math.round((pxGuide * (1 - GLYPH_SCALE)) / 2));

  const stepImgs = [];
  for (let i = 0; i < strokeCount; i++) {
    const url = await makeGlyphStepPngDataUrl(guideChar, pxGuide, padGuide, i);
    const img = await doc.embedPng(url);
    stepImgs.push(img);
  }

  // xếp ngang liên tiếp, tự wrap theo chiều rộng trang
  const stepW = guideStepSizePt;
  const stepH = guideStepSizePt;
  const gap = Math.max(0, guideGapPt);
  const perRow = Math.max(
    1,
    Math.floor((pageW - 2 * margin + gap) / (stepW + gap)),
  );
  const guideRows = Math.ceil(strokeCount / perRow);
  const guideAreaH = guideRows * stepH + (guideRows - 1) * gap;

  // vẽ
  for (let i = 0; i < strokeCount; i++) {
    const row = Math.floor(i / perRow);
    const col = i % perRow;
    const x = margin + col * (stepW + gap);
    const topY = pageH - margin - (row + 1) * stepH - row * gap;
    const y = topY; // pdf-lib gốc trái-dưới; topY đã là đáy vùng bước cao stepH
    page.drawImage(stepImgs[i], {
      x,
      y,
      width: stepW,
      height: stepH,
      opacity: 1,
    });
  }

  // ===== PHẦN 2: LƯỚI LUYỆN CHỮ Ở DƯỚI =====
  const remainingH = pageH - margin * 2 - guideAreaH;
  const gridRows = Math.max(1, Math.floor(remainingH / cell));
  if (gridRows < 1) throw new Error('NOT_ENOUGH_SPACE_FOR_GRID');

  const gridTopStart = margin + guideAreaH; // khoảng từ đáy
  let idxCell = 0;
  for (let r = 0; r < gridRows; r++) {
    for (let c = 0; c < _cols; c++) {
      const x = margin + c * cell;
      const yTop = gridTopStart + r * cell;
      const y = pageH - (yTop + cell);

      if (gridEnabled) drawCellGrid(x, y, cell);

      if (showFaint && glyphMap.size) {
        const ch = validSeq[idxCell % validSeq.length];
        const img = glyphMap.get(ch);
        if (img)
          page.drawImage(img, { x, y, width: cell, height: cell, opacity: 1 });
      }
      idxCell++;
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

  const info =
    `${_cols} cột • ${gridRows} hàng luyện ` +
    `(+ ${guideRows} hàng hướng dẫn, ${strokeCount} bước, size ${guideStepSizePt}pt) ` +
    `• ô ~${Math.round(cell)}pt (${Math.round(cell * 0.3528)}mm)`;
  const warn = invalid.length
    ? `Bỏ qua ký tự không có dữ liệu: ${invalid.join(' ')}`
    : '';
  return { blob, info, warn };
}
