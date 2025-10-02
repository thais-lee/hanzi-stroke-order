import React, { useEffect, useRef } from 'react';
import HanziWriter from 'hanzi-writer';
import { loadCharData } from '../utils/hanzi';
import { CHAR_BOX_SCALE, GRID_DEFAULTS } from '../utils/misc';

const WHITE_HEX = /^#?(?:f{3}|f{6})$/i;

export default function Stage({
  selected,
  size,
  showOutline,
  showChar,
  speed,
  delayBetweenStrokes,
  strokeColor,
  radicalColor,
  renderer,
  onAnimateClick,
  onLoopClick,
  buttonsRight,
  showGrid = true,
  // NEW: grid options (dùng chung toàn app)
  gridMode = '3x3', // '3x3' | '2x2' | 'mi' | 'zhong' | 'hui'
  subdividePerCell4x4 = true, // cho 3×3/2×2
  includeDiagonals = false, // thêm đường chéo (3×3/2×2)
  zhongInnerRatio = 0.5, // cỡ ô trung cung
  huiInnerMarginRatio = 0.16, // lề vào khung trong
  busyMsg,
}) {
  const mainMountRef = useRef(null);
  const writerRef = useRef(null);

  useEffect(() => {
    if (!selected || !mainMountRef.current) return;
    const mount = mainMountRef.current;
    mount.innerHTML = '';

    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    svg.classList.add('mount');
    svg.style.width = '100%';
    svg.style.display = 'block';

    // nền + viền
    const bg = document.createElementNS(svgNS, 'rect');
    bg.setAttribute('x', 0);
    bg.setAttribute('y', 0);
    bg.setAttribute('width', size);
    bg.setAttribute('height', size);
    bg.setAttribute('rx', GRID_DEFAULTS.borderRadius);
    bg.setAttribute('ry', GRID_DEFAULTS.borderRadius);
    bg.setAttribute('fill', GRID_DEFAULTS.bg);
    bg.setAttribute('stroke', GRID_DEFAULTS.borderColor);
    bg.setAttribute('stroke-width', 1.5);
    svg.appendChild(bg);

    // helpers
    const mkLine = (x1, y1, x2, y2, { stroke, width, dash }) => {
      const ln = document.createElementNS(svgNS, 'line');
      ln.setAttribute('x1', x1);
      ln.setAttribute('y1', y1);
      ln.setAttribute('x2', x2);
      ln.setAttribute('y2', y2);
      ln.setAttribute('stroke', stroke);
      ln.setAttribute('stroke-width', width);
      if (dash) ln.setAttribute('stroke-dasharray', dash);
      return ln;
    };
    const mkRect = (x, y, w, h, { stroke, width }) => {
      const r = document.createElementNS(svgNS, 'rect');
      r.setAttribute('x', x);
      r.setAttribute('y', y);
      r.setAttribute('width', w);
      r.setAttribute('height', h);
      r.setAttribute('fill', 'none');
      r.setAttribute('stroke', stroke);
      r.setAttribute('stroke-width', width);
      return r;
    };

    // Vẽ lưới theo gridMode
    if (showGrid) {
      const major = { stroke: GRID_DEFAULTS.majorColor, width: 1.5 };
      const minor = {
        stroke: GRID_DEFAULTS.minorColor,
        width: 2,
        dash: `${GRID_DEFAULTS.minorDash?.[0] ?? 3} ${
          GRID_DEFAULTS.minorDash?.[1] ?? 6
        }`,
      };

      const drawMinor4x4Within = (x0, y0, cell) => {
        const step = cell / 4;
        for (let q = 1; q <= 3; q++) {
          const x = x0 + q * step;
          svg.appendChild(mkLine(x, y0, x, y0 + cell, minor));
          const y = y0 + q * step;
          svg.appendChild(mkLine(x0, y, x0 + cell, y, minor));
        }
      };

      const draw3x3 = () => {
        const cell = size / 3;
        svg.appendChild(mkLine(cell, 0, cell, size, major));
        svg.appendChild(mkLine(2 * cell, 0, 2 * cell, size, major));
        svg.appendChild(mkLine(0, cell, size, cell, major));
        svg.appendChild(mkLine(0, 2 * cell, size, 2 * cell, major));
        if (includeDiagonals) {
          svg.appendChild(mkLine(0, 0, size, size, minor));
          svg.appendChild(mkLine(size, 0, 0, size, minor));
        }
        if (subdividePerCell4x4) {
          for (let r = 0; r < 3; r++) {
            for (let c = 0; c < 3; c++) {
              drawMinor4x4Within(c * cell, r * cell, cell);
            }
          }
        }
      };

      const draw2x2 = () => {
        const mid = size / 2;
        svg.appendChild(mkLine(mid, 0, mid, size, major));
        svg.appendChild(mkLine(0, mid, size, mid, major));
        if (includeDiagonals) {
          svg.appendChild(mkLine(0, 0, size, size, minor));
          svg.appendChild(mkLine(size, 0, 0, size, minor));
        }
        if (subdividePerCell4x4) {
          const cell = size / 2;
          for (let r = 0; r < 2; r++) {
            for (let c = 0; c < 2; c++) {
              drawMinor4x4Within(c * cell, r * cell, cell);
            }
          }
        }
      };

      const drawMi = () => {
        const mid = size / 2;
        svg.appendChild(mkLine(mid, 0, mid, size, major)); // dọc
        svg.appendChild(mkLine(0, mid, size, mid, major)); // ngang
        svg.appendChild(mkLine(0, 0, size, size, major)); // chéo \
        svg.appendChild(mkLine(size, 0, 0, size, major)); // chéo /
      };

      const drawZhong = () => {
        const mid = size / 2;
        svg.appendChild(mkLine(mid, 0, mid, size, major));
        svg.appendChild(mkLine(0, mid, size, mid, major));
        const inner = size * Math.min(Math.max(zhongInnerRatio, 0.25), 0.8);
        const x = (size - inner) / 2;
        const y = (size - inner) / 2;
        svg.appendChild(mkRect(x, y, inner, inner, minor));
      };

      const drawHui = () => {
        const m = size * Math.min(Math.max(huiInnerMarginRatio, 0.1), 0.3);
        svg.appendChild(mkRect(m, m, size - 2 * m, size - 2 * m, major));
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
    }

    mount.appendChild(svg);

    // padding theo CHAR_BOX_SCALE
    const pad = Math.round((size * (1 - CHAR_BOX_SCALE)) / 2);
    const safeStroke =
      !strokeColor || WHITE_HEX.test(strokeColor) ? '#111111' : strokeColor;

    // HanziWriter
    const writer = HanziWriter.create(svg, selected, {
      width: size,
      height: size,
      padding: pad,
      showOutline,
      showCharacter: showChar,
      strokeAnimationSpeed: speed,
      delayBetweenStrokes,
      strokeColor: safeStroke,
      radicalColor,
      renderer,
      charDataLoader: (c, done) => loadCharData(c).then(done),
    });
    writerRef.current = writer;

    setTimeout(() => {
      try {
        writer.animateCharacter();
      } catch {
        // ignore
      }
    }, 120);
  }, [
    selected,
    size,
    showOutline,
    showChar,
    speed,
    delayBetweenStrokes,
    strokeColor,
    radicalColor,
    renderer,
    showGrid,
    gridMode,
    subdividePerCell4x4,
    includeDiagonals,
    zhongInnerRatio,
    huiInnerMarginRatio,
  ]);

  const animate = () => {
    try {
      writerRef.current?.hideCharacter();
      writerRef.current?.animateCharacter();
    } catch {
      // ignore
    }
  };
  const loop = () => {
    try {
      writerRef.current?.hideCharacter();
      writerRef.current?.loopCharacterAnimation();
    } catch {
      // ignore
    }
  };

  return (
    <div className="section stage">
      <div className="stageInner">
        <div className="stageBox" ref={mainMountRef} />
        {busyMsg && (
          <div className="busyOverlay" style={{ alignSelf: 'center' }}>
            {busyMsg}
          </div>
        )}
        <div
          style={{
            display: 'flex',
            gap: 8,
            marginTop: 8,
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <button className="btn" onClick={onAnimateClick || animate}>
            Animate
          </button>
          <button className="btn secondary" onClick={onLoopClick || loop}>
            Loop
          </button>
          {buttonsRight}
        </div>
      </div>
    </div>
  );
}
