import HanziWriter from 'hanzi-writer';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { loadCharData } from './hanzi';
import { GLYPH_SCALE, mmToPt, hasNonLatin, asciiOnly } from './misc';

export const PAGE_SIZES = {
  A4: { w: 595.28, h: 841.89 },
  Letter: { w: 612, h: 792 },
};

// Vẽ chữ -> PNG đúng transform của HanziWriter
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
    includeDiagonals = false,
    showFaint = true,
    faintAlpha = 0.18,
    sourceMode = 'selected',
    title = 'Bảng luyện viết',
    cjkFontBytes = null,
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

  // nguồn ký tự
  const rawSeq =
    sourceMode === 'selected' ? [selected] : chars?.length ? chars : [selected];

  // verify có dữ liệu
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

  // embed PNG chữ mờ
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

  const lineColor = rgb(0.9, 0.91, 0.94);
  const borderColor = rgb(0.85, 0.88, 0.95);
  const drawLine = (x1, y1, x2, y2, th = 0.8) =>
    page.drawLine({
      start: { x: x1, y: y1 },
      end: { x: x2, y: y2 },
      thickness: th,
      color: lineColor,
    });
  const drawRect = (x, y, w, h, th = 0.8) =>
    page.drawRectangle({
      x,
      y,
      width: w,
      height: h,
      borderWidth: th,
      borderColor,
      color: rgb(1, 1, 1),
    });

  let idx = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < _cols; c++) {
      const x = margin + c * cell;
      const yTop = margin + r * cell;
      const y = pageH - (yTop + cell);

      drawRect(x, y, cell, cell, 0.6);
      const t1x = x + cell / 3,
        t2x = x + (2 * cell) / 3;
      const t1y = y + cell / 3,
        t2y = y + (2 * cell) / 3;
      drawLine(t1x, y, t1x, y + cell, 0.6);
      drawLine(t2x, y, t2x, y + cell, 0.6);
      drawLine(x, t1y, x + cell, t1y, 0.6);
      drawLine(x, t2y, x + cell, t2y, 0.6);
      if (includeDiagonals) {
        drawLine(x, y, x + cell, y + cell, 0.5);
        drawLine(x + cell, y, x, y + cell, 0.5);
      }

      if (showFaint && glyphMap.size) {
        const ch = validSeq[idx % validSeq.length];
        const img = glyphMap.get(ch);
        if (img)
          page.drawImage(img, { x, y, width: cell, height: cell, opacity: 1 });
        idx++;
      }
    }
  }

  // footer/title
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
  )} hàng • ô ~${Math.round(cell)}pt (${Math.round(cell * 0.3528)}mm) • ${
    cjkFontBytes ? 'CJK font' : 'ASCII only'
  }`;
  const warn = invalid.length
    ? `Bỏ qua ký tự không có dữ liệu: ${invalid.join(' ')}`
    : '';

  return { blob, info, warn };
}
