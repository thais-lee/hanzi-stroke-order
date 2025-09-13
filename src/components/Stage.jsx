import React, { useEffect, useRef } from 'react';
import HanziWriter from 'hanzi-writer';
import { loadCharData } from '../utils/hanzi';

const BOX_SCALE = 0.9; // chữ ~90% ô
const WHITE_HEX = /^#?(?:f{3}|f{6})$/i; // #fff / fff / #ffffff
const NS = 'http://www.w3.org/2000/svg';

function drawGrid(svg, px) {
  if (!svg || !px) return;
  svg.innerHTML = '';
  svg.setAttribute('viewBox', `0 0 ${px} ${px}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.setAttribute('shape-rendering', 'crispEdges'); // nét rõ

  // nền trắng
  const bg = document.createElementNS(NS, 'rect');
  bg.setAttribute('x', 0);
  bg.setAttribute('y', 0);
  bg.setAttribute('width', px);
  bg.setAttribute('height', px);
  bg.setAttribute('fill', '#ffffff');
  svg.appendChild(bg);

  const mk = (x1, y1, x2, y2, { stroke = '#CBD5E1', width = 1, dash } = {}) => {
    const ln = document.createElementNS(NS, 'line');
    ln.setAttribute('x1', x1);
    ln.setAttribute('y1', y1);
    ln.setAttribute('x2', x2);
    ln.setAttribute('y2', y2);
    ln.setAttribute('stroke', stroke);
    ln.setAttribute('stroke-width', width);
    if (dash) ln.setAttribute('stroke-dasharray', dash);
    return ln;
  };

  const cell = px / 3;

  // 3×3 chính (đậm hơn)
  const mainW = Math.max(1.2, px / 400);
  svg.appendChild(mk(cell, 0, cell, px, { width: mainW, stroke: '#94A3B8' }));
  svg.appendChild(
    mk(2 * cell, 0, 2 * cell, px, { width: mainW, stroke: '#94A3B8' }),
  );
  svg.appendChild(mk(0, cell, px, cell, { width: mainW, stroke: '#94A3B8' }));
  svg.appendChild(
    mk(0, 2 * cell, px, 2 * cell, { width: mainW, stroke: '#94A3B8' }),
  );

  // sub-grid 4×4 trong mỗi ô (đứt nét, nhưng rõ hơn)
  const subStroke = '#CBD5E1';
  const subW = Math.max(0.9, px / 700);
  const dash = `${Math.max(2, Math.round(px / 160))},${Math.max(
    4,
    Math.round(px / 90),
  )}`;

  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const x0 = c * cell;
      const y0 = r * cell;
      const step = cell / 4;
      for (let q = 1; q <= 3; q++) {
        const x = x0 + q * step;
        const y = y0 + q * step;
        svg.appendChild(
          mk(x, y0, x, y0 + cell, { stroke: subStroke, width: subW, dash }),
        );
        svg.appendChild(
          mk(x0, y, x0 + cell, y, { stroke: subStroke, width: subW, dash }),
        );
      }
    }
  }
}

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
}) {
  const gridRef = useRef(null); // SVG lưới (layer dưới)
  const mountRef = useRef(null); // DIV mount HanziWriter (layer trên)
  const writerRef = useRef(null);

  useEffect(() => {
    if (!selected || !mountRef.current) return;

    // Lấy cạnh ô vuông thực tế (responsive)
    const wrapper = mountRef.current.parentElement; // khối giữ tỉ lệ
    const px = Math.round(wrapper?.clientWidth || size || 320);

    drawGrid(gridRef.current, px);

    mountRef.current.innerHTML = '';
    const pad = Math.round((px * (1 - BOX_SCALE)) / 2);
    const safeStroke =
      !strokeColor || WHITE_HEX.test(strokeColor) ? '#111111' : strokeColor;

    const writer = HanziWriter.create(mountRef.current, selected, {
      width: px,
      height: px,
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

    // animate lần đầu
    setTimeout(() => {
      try {
        writer.animateCharacter();
      } catch {
        //ignore
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
  ]);

  const animate = () => {
    try {
      writerRef.current?.hideCharacter();
      writerRef.current?.animateCharacter();
    } catch {
      //ignore
    }
  };
  const loop = () => {
    try {
      writerRef.current?.hideCharacter();
      writerRef.current?.loopCharacterAnimation();
    } catch {
      //ignore
    }
  };

  return (
    <div className="section stage">
      <div className="stageInner">
        <div style={{ width: 'min(100%, 520px)', margin: '0 auto' }}>
          <div
            style={{
              position: 'relative',
              width: '100%',
              aspectRatio: '1 / 1',
              background: '#fff',
              border: '2px solid #cfe0ff', // VIỀN BO NGOÀI
              borderRadius: 14,
              overflow: 'hidden', // bo góc thật
            }}
          >
            <svg
              ref={gridRef}
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                display: 'block',
                pointerEvents: 'none',
              }}
            />
            <div ref={mountRef} style={{ position: 'absolute', inset: 0 }} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
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
