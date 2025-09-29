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
  busyMsg,
}) {
  const mainMountRef = useRef(null);
  const writerRef = useRef(null);

  useEffect(() => {
    if (!selected || !mainMountRef.current) return;
    const mount = mainMountRef.current;
    mount.innerHTML = '';

    // SVG khung + lưới
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    svg.classList.add('mount');
    svg.style.width = '100%';
    svg.style.display = 'block';

    // nền
    const bg = document.createElementNS(svgNS, 'rect');
    bg.setAttribute('x', 0);
    bg.setAttribute('y', 0);
    bg.setAttribute('width', size);
    bg.setAttribute('height', size);
    bg.setAttribute('rx', 16);
    bg.setAttribute('ry', 16);
    bg.setAttribute('fill', GRID_DEFAULTS.bg);
    bg.setAttribute('stroke', GRID_DEFAULTS.borderColor);
    bg.setAttribute('stroke-width', 1.5);
    svg.appendChild(bg);

    const cell = size / 3;
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

    if (showGrid) {
      // 3×3
      svg.appendChild(
        mkLine(cell, 0, cell, size, {
          stroke: GRID_DEFAULTS.majorColor,
          width: 1.5,
        }),
      );
      svg.appendChild(
        mkLine(2 * cell, 0, 2 * cell, size, {
          stroke: GRID_DEFAULTS.majorColor,
          width: 1.5,
        }),
      );
      svg.appendChild(
        mkLine(0, cell, size, cell, {
          stroke: GRID_DEFAULTS.majorColor,
          width: 1.5,
        }),
      );
      svg.appendChild(
        mkLine(0, 2 * cell, size, 2 * cell, {
          stroke: GRID_DEFAULTS.majorColor,
          width: 1.5,
        }),
      );

      // 4×4 trong mỗi ô lớn
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
          const x0 = c * cell;
          const y0 = r * cell;
          const step = cell / 4;
          for (let q = 1; q <= 3; q++) {
            const x = x0 + q * step;
            svg.appendChild(
              mkLine(x, y0, x, y0 + cell, {
                stroke: GRID_DEFAULTS.minorColor,
                width: 2,
                dash: '3 6',
              }),
            );
            const y = y0 + q * step;
            svg.appendChild(
              mkLine(x0, y, x0 + cell, y, {
                stroke: GRID_DEFAULTS.minorColor,
                width: 2,
                dash: '3 6',
              }),
            );
          }
        }
      }
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
