import React, { useEffect, useRef } from 'react';
import HanziWriter from 'hanzi-writer';
import { loadCharData } from '../utils/hanzi';
import { GRID_DEFAULTS } from '../utils/misc';

export default function StepsGrid({
  selected,
  strokeColor,
  // NEW: grid options đồng bộ với Stage/PDF
  gridEnabled = true,
  gridMode = '3x3', // '3x3' | '2x2' | 'mi' | 'zhong' | 'hui'
  subdividePerCell4x4 = true,
  includeDiagonals = false,
  zhongInnerRatio = 0.5,
  huiInnerMarginRatio = 0.16,
}) {
  const stepsRef = useRef(null);

  useEffect(() => {
    if (!selected || !stepsRef.current) return;
    stepsRef.current.innerHTML = '';

    loadCharData(selected)
      .then(charData => {
        const steps = charData.strokes.length;
        const svgNS = 'http://www.w3.org/2000/svg';

        const drawGrid = (box, S) => {
          if (!gridEnabled) return;
          const major = { stroke: GRID_DEFAULTS.majorColor, width: 1.2 };
          const minor = {
            stroke: GRID_DEFAULTS.minorColor,
            width: 1,
            dash: `${GRID_DEFAULTS.minorDash?.[0] ?? 3} ${
              GRID_DEFAULTS.minorDash?.[1] ?? 6
            }`,
          };

          const mkLine = (x1, y1, x2, y2, style) => {
            const ln = document.createElementNS(svgNS, 'line');
            ln.setAttribute('x1', x1);
            ln.setAttribute('y1', y1);
            ln.setAttribute('x2', x2);
            ln.setAttribute('y2', y2);
            ln.setAttribute('stroke', style.stroke);
            ln.setAttribute('stroke-width', style.width);
            if (style.dash) ln.setAttribute('stroke-dasharray', style.dash);
            box.appendChild(ln);
          };
          const mkRect = (x, y, w, h, style) => {
            const r = document.createElementNS(svgNS, 'rect');
            r.setAttribute('x', x);
            r.setAttribute('y', y);
            r.setAttribute('width', w);
            r.setAttribute('height', h);
            r.setAttribute('fill', 'none');
            r.setAttribute('stroke', style.stroke);
            r.setAttribute('stroke-width', style.width);
            box.appendChild(r);
          };
          const drawMinor4x4Within = (x0, y0, cell) => {
            const step = cell / 4;
            for (let q = 1; q <= 3; q++) {
              const x = x0 + q * step;
              mkLine(x, y0, x, y0 + cell, minor);
              const y = y0 + q * step;
              mkLine(x0, y, x0 + cell, y, minor);
            }
          };

          const draw3x3 = () => {
            const cell = S / 3;
            mkLine(cell, 0, cell, S, major);
            mkLine(2 * cell, 0, 2 * cell, S, major);
            mkLine(0, cell, S, cell, major);
            mkLine(0, 2 * cell, S, 2 * cell, major);
            if (includeDiagonals) {
              mkLine(0, 0, S, S, minor);
              mkLine(S, 0, 0, S, minor);
            }
            if (subdividePerCell4x4) {
              for (let r = 0; r < 3; r++)
                for (let c = 0; c < 3; c++) {
                  drawMinor4x4Within(c * cell, r * cell, cell);
                }
            }
          };
          const draw2x2 = () => {
            const mid = S / 2;
            mkLine(mid, 0, mid, S, major);
            mkLine(0, mid, S, mid, major);
            if (includeDiagonals) {
              mkLine(0, 0, S, S, minor);
              mkLine(S, 0, 0, S, minor);
            }
            if (subdividePerCell4x4) {
              const cell = S / 2;
              for (let r = 0; r < 2; r++)
                for (let c = 0; c < 2; c++) {
                  drawMinor4x4Within(c * cell, r * cell, cell);
                }
            }
          };
          const drawMi = () => {
            const mid = S / 2;
            mkLine(mid, 0, mid, S, major);
            mkLine(0, mid, S, mid, major);
            mkLine(0, 0, S, S, major);
            mkLine(S, 0, 0, S, major);
          };
          const drawZhong = () => {
            const mid = S / 2;
            mkLine(mid, 0, mid, S, major);
            mkLine(0, mid, S, mid, major);
            const inner = S * Math.min(Math.max(zhongInnerRatio, 0.25), 0.8);
            const x = (S - inner) / 2,
              y = (S - inner) / 2;
            mkRect(x, y, inner, inner, minor);
          };
          const drawHui = () => {
            const m = S * Math.min(Math.max(huiInnerMarginRatio, 0.1), 0.3);
            mkRect(m, m, S - 2 * m, S - 2 * m, major);
          };

          (
            ({
              '3x3': draw3x3,
              '2x2': draw2x2,
              mi: drawMi,
              zhong: drawZhong,
              hui: drawHui,
            })[gridMode] || draw3x3
          )();
        };

        for (let i = 0; i < steps; i++) {
          const S = 84;
          const box = document.createElementNS(svgNS, 'svg');
          box.setAttribute('width', String(S));
          box.setAttribute('height', String(S));
          box.classList.add('stepBox');

          // vẽ lưới theo chế độ
          drawGrid(box, S);

          // glyph tích lũy tới bước i
          const g = document.createElementNS(svgNS, 'g');
          const tf = HanziWriter.getScalingTransform(S, S, 4);
          g.setAttribute('transform', tf.transform);
          charData.strokes.slice(0, i + 1).forEach(d => {
            const path = document.createElementNS(svgNS, 'path');
            path.setAttribute('d', d);
            path.setAttribute('fill', strokeColor);
            g.appendChild(path);
          });
          box.appendChild(g);

          stepsRef.current.appendChild(box);
        }
      })
      .catch(() => {});
  }, [
    selected,
    strokeColor,
    gridEnabled,
    gridMode,
    subdividePerCell4x4,
    includeDiagonals,
    zhongInnerRatio,
    huiInnerMarginRatio,
  ]);

  return (
    <div className="section">
      <div className="stepTitle">
        <div style={{ fontWeight: 600 }}>Các bước hoàn thành</div>
        <div className="muted">ký tự: {selected || '—'}</div>
      </div>
      <div ref={stepsRef} className="stepsGrid" />
      <div className="row" style={{ marginTop: 8 }}>
        <div className="muted">
          Dữ liệu tải từ <code>hanzi-writer-data</code>
        </div>
      </div>
    </div>
  );
}
