import React, { useEffect, useRef } from 'react';
import HanziWriter from 'hanzi-writer';
import { loadCharData } from '../utils/hanzi';

export default function StepsGrid({ selected, strokeColor }) {
  const stepsRef = useRef(null);

  useEffect(() => {
    if (!selected || !stepsRef.current) return;
    stepsRef.current.innerHTML = '';
    loadCharData(selected)
      .then(charData => {
        const steps = charData.strokes.length;
        const svgNS = 'http://www.w3.org/2000/svg';
        for (let i = 0; i < steps; i++) {
          const box = document.createElementNS(svgNS, 'svg');
          const S = 84;
          box.setAttribute('width', String(S));
          box.setAttribute('height', String(S));
          box.classList.add('stepBox');
          const line = (x1, y1, x2, y2) => {
            const ln = document.createElementNS(svgNS, 'line');
            ln.setAttribute('x1', x1);
            ln.setAttribute('y1', y1);
            ln.setAttribute('x2', x2);
            ln.setAttribute('y2', y2);
            ln.setAttribute('stroke', '#E5E7EB');
            return ln;
          };
          const t1 = S / 3,
            t2 = (2 * S) / 3;
          box.appendChild(line(t1, 0, t1, S));
          box.appendChild(line(t2, 0, t2, S));
          box.appendChild(line(0, t1, S, t1));
          box.appendChild(line(0, t2, S, t2));
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
  }, [selected, strokeColor]);

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
