/* eslint-disable no-useless-escape */
/* eslint-disable no-control-regex */
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

/** -----------------------
 *  VẼ CÁC KIỂU LƯỚI
 *  gridMode: '3x3' | '2x2' | 'mi' | 'zhong' | 'hui'
 *  ----------------------*/
function makeGridDrawer(page, colors, thicks, opts) {
  const { majorColor, minorColor, borderColor } = colors;
  const { majorTh, minorTh } = thicks;
  const {
    includeDiagonals,
    gridMode,
    subdividePerCell4x4,
    zhongInnerRatio,
    huiInnerMarginRatio,
  } = opts;

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

  const drawMinor4x4Within = (sx, sy, size) => {
    const step = size / 4;
    for (let q = 1; q <= 3; q++) {
      drawLine(
        sx + q * step,
        sy,
        sx + q * step,
        sy + size,
        minorTh,
        minorColor,
      );
      drawLine(
        sx,
        sy + q * step,
        sx + size,
        sy + q * step,
        minorTh,
        minorColor,
      );
    }
  };

  const draw3x3 = (x, y, size) => {
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
    if (subdividePerCell4x4) {
      const sub = size / 3;
      for (let i = 0; i < 3; i++)
        for (let j = 0; j < 3; j++)
          drawMinor4x4Within(x + i * sub, y + j * sub, sub);
    }
  };

  const draw2x2 = (x, y, size) => {
    drawRect(x, y, size, size, majorTh, borderColor);
    const midx = x + size / 2,
      midy = y + size / 2;
    drawLine(midx, y, midx, y + size, majorTh, majorColor);
    drawLine(x, midy, x + size, midy, majorTh, majorColor);
    if (includeDiagonals) {
      drawLine(x, y, x + size, y + size, minorTh, minorColor);
      drawLine(x + size, y, x, y + size, minorTh, minorColor);
    }
    if (subdividePerCell4x4) {
      const sub = size / 2;
      for (let i = 0; i < 2; i++)
        for (let j = 0; j < 2; j++)
          drawMinor4x4Within(x + i * sub, y + j * sub, sub);
    }
  };

  const drawMi = (x, y, size) => {
    drawRect(x, y, size, size, majorTh, borderColor);
    const midx = x + size / 2,
      midy = y + size / 2;
    drawLine(midx, y, midx, y + size, majorTh, majorColor); // dọc
    drawLine(x, midy, x + size, midy, majorTh, majorColor); // ngang
    drawLine(x, y, x + size, y + size, majorTh, majorColor); // chéo \
    drawLine(x + size, y, x, y + size, majorTh, majorColor); // chéo /
  };

  const drawZhong = (x, y, size) => {
    drawRect(x, y, size, size, majorTh, borderColor);
    const midx = x + size / 2,
      midy = y + size / 2;
    drawLine(midx, y, midx, y + size, majorTh, majorColor);
    drawLine(x, midy, x + size, midy, majorTh, majorColor);
    const inner = size * Math.min(Math.max(zhongInnerRatio, 0.25), 0.8); // 0.25..0.8
    const ix = x + (size - inner) / 2,
      iy = y + (size - inner) / 2;
    drawRect(ix, iy, inner, inner, minorTh, minorColor);
  };

  const drawHui = (x, y, size) => {
    drawRect(x, y, size, size, majorTh, borderColor);
    const m = size * Math.min(Math.max(huiInnerMarginRatio, 0.1), 0.3); // 0.1..0.3
    drawRect(x + m, y + m, size - 2 * m, size - 2 * m, majorTh, majorColor);
  };

  return (x, y, size) => {
    switch (gridMode) {
      case '2x2':
        return draw2x2(x, y, size);
      case 'mi':
        return drawMi(x, y, size);
      case 'zhong':
        return drawZhong(x, y, size);
      case 'hui':
        return drawHui(x, y, size);
      case '3x3':
      default:
        return draw3x3(x, y, size);
    }
  };
}

export async function generatePracticePDF(opts) {
  const {
    selected,
    chars,
    pageSize = 'A4',
    orientation = 'portrait',
    cols = 6,
    marginMm = 12,

    // === LƯỚI ===
    gridEnabled = true,
    gridOpts = GRID_DEFAULTS, // vẫn giữ để tương thích
    includeDiagonals = false, // tham số cũ
    showFaint = true,
    faintAlpha = 0.18,
    sourceMode = 'selected',
    title = 'Bảng luyện viết',
    cjkFontBytes = null,

    // === HƯỚNG DẪN (thứ tự nét) ===
    guideStepSizePt = 30, // ~30px
    guideGapPt = 6, // khoảng cách giữa các bước

    // === KIỂU LƯỚI MỚI ===
    gridMode = '3x3', // '3x3' | '2x2' | 'mi' | 'zhong' | 'hui'
    subdividePerCell4x4 = true, // áp dụng cho 3×3 & 2×2
    zhongInnerRatio = 0.5, // cỡ ô trung cung (0.25..0.8)
    huiInnerMarginRatio = 0.16, // lề vào cho khung trong (0.1..0.3)
  } = opts;

  const { w: baseW, h: baseH } = PAGE_SIZES[pageSize] || PAGE_SIZES.A4;
  const isPortrait = orientation === 'portrait';
  const pageW = isPortrait ? baseW : baseH;
  const pageH = isPortrait ? baseH : baseW;
  const margin = mmToPt(marginMm);
  const _cols = Math.max(2, Math.min(12, cols));
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
  const majorColor = rgb(0.50, 0.55, 0.72); // ~#7F8DB8
  const minorColor = rgb(0.68, 0.73, 0.86); // ~#ADB9DB
  const borderColor = majorColor;
  // Dày hơn khoảng 1.5–2 lần so với mặc định
  const majorTh = Math.max(1.2, cell / 120);
  const minorTh = gridOpts?.sameThickness
    ? majorTh
    : Math.max(1.0, majorTh * 0.80);

  // helper vẽ lưới theo kiểu đã chọn
  const drawCellGrid = makeGridDrawer(
    page,
    { majorColor, minorColor, borderColor },
    { majorTh, minorTh },
    {
      includeDiagonals,
      gridMode,
      subdividePerCell4x4,
      zhongInnerRatio,
      huiInnerMarginRatio,
    },
  );

  // ===== PHẦN 1: HƯỚNG DẪN – KHÔNG PHỤ THUỘC COLS =====
  const guideChar = validSeq[0];
  const guideData = await loadCharData(guideChar);
  const strokeCount = guideData.strokes.length;

  // render ở độ phân giải cao rồi thu về 30pt để mịn
  const pxGuide = 240;
  const padGuide = Math.max(0, Math.round((pxGuide * (1 - GLYPH_SCALE)) / 2));
  const stepImgs = [];
  for (let i = 0; i < strokeCount; i++) {
    const url = await makeGlyphStepPngDataUrl(guideChar, pxGuide, padGuide, i);
    const img = await doc.embedPng(url);
    stepImgs.push(img);
  }

  // xếp ngang liên tiếp, tự wrap
  const stepW = guideStepSizePt;
  const stepH = guideStepSizePt;
  const gap = Math.max(0, guideGapPt);
  const perRow = Math.max(
    1,
    Math.floor((pageW - 2 * margin + gap) / (stepW + gap)),
  );
  const guideRows = Math.ceil(strokeCount / perRow);
  const guideAreaH = guideRows * stepH + (guideRows - 1) * gap;

  for (let i = 0; i < strokeCount; i++) {
    const row = Math.floor(i / perRow);
    const col = i % perRow;
    const x = margin + col * (stepW + gap);
    const topY = pageH - margin - (row + 1) * stepH - row * gap;
    const y = topY;
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
    `(+ ${guideRows} hàng hướng dẫn, ${strokeCount} bước) • lưới=${gridMode}` +
    (subdividePerCell4x4 && (gridMode === '3x3' || gridMode === '2x2')
      ? ' + 4×4/ô con'
      : '') +
    ` • ô ~${Math.round(cell)}pt (${Math.round(cell * 0.3528)}mm)`;
  const warn = invalid.length
    ? `Bỏ qua ký tự không có dữ liệu: ${invalid.join(' ')}`
    : '';
  return { blob, info, warn };
}

// ====== Helper đặt tên Unicode an toàn
function unicodeSafeNameFromChar(ch) {
  let name = (ch || '').normalize('NFC');
  name = name.replace(/[\/\\:*?"<>|\u0000-\u001F]/g, '').trim();
  if (!name) name = `U+${ch.codePointAt(0).toString(16).toUpperCase()}`;
  return name;
}

// ===== Tiện ích tải xuống Blob
export function saveBlob(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    document.body.removeChild(a);
  }, 1200);
}

/**
 * GỘP NHIỀU CHỮ THÀNH 1 PDF (mỗi chữ 1 trang)
 */
export async function generatePracticePDFCombined(
  charList,
  baseOpts = {},
  onProgress,
) {
  const merged = await PDFDocument.create();
  const cleaned = (charList || []).map(ch => (ch || '').trim()).filter(Boolean);
  const skipped = [];

  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i];
    onProgress?.(i + 1, cleaned.length, ch);
    try {
      const { blob } = await generatePracticePDF({
        ...baseOpts,
        selected: ch,
        sourceMode: 'selected',
      });
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const src = await PDFDocument.load(bytes);
      const pages = await merged.copyPages(src, src.getPageIndices());
      pages.forEach(p => merged.addPage(p));
    } catch (e) {
      console.warn('Skip char:', ch, e);
      skipped.push(ch);
    }
  }

  const mergedBytes = await merged.save();
  const outBlob = new Blob([mergedBytes], { type: 'application/pdf' });
  const name = `practice_${cleaned.join('') || 'batch'}.pdf`;
  return { blob: outBlob, filename: name, skipped };
}

/**
 * TẠO ZIP NHIỀU FILE PDF (mỗi chữ 1 file) – có số thứ tự
 * Yêu cầu: npm i jszip
 * naming: { index:true, start:1, padWidth:'auto'|2|3..., sep:'_' }
 */
export async function generatePracticePDFZip(
  charList,
  baseOpts = {},
  onProgress,
  naming = {},
) {
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();

  const cleaned = (charList || []).map(ch => (ch || '').trim()).filter(Boolean);
  const skipped = [];

  const nameOpts = {
    index: true,
    start: 1,
    padWidth: 'auto',
    sep: '_',
    ...naming,
  };
  const total = cleaned.length;
  const width =
    nameOpts.padWidth === 'auto'
      ? String(nameOpts.start + total - 1).length
      : Math.max(1, Number(nameOpts.padWidth) || 1);

  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i];
    onProgress?.(i + 1, total, ch);
    try {
      const { blob } = await generatePracticePDF({
        ...baseOpts,
        selected: ch,
        sourceMode: 'selected',
      });
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const baseName = unicodeSafeNameFromChar(ch);
      const prefix = nameOpts.index
        ? String(nameOpts.start + i).padStart(width, '0') + nameOpts.sep
        : '';
      zip.file(`${prefix}${baseName}.pdf`, bytes);
    } catch (e) {
      console.warn('Skip char:', ch, e);
      skipped.push(ch);
    }
  }

  const zipBlob = await zip.generateAsync({ type: 'blob' });
  const name = `practice_batch_${Date.now()}.zip`;
  return { blob: zipBlob, filename: name, skipped };
}
