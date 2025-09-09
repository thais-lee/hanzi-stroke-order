import React, { useEffect, useRef } from 'react';
import HanziWriter from 'hanzi-writer';
import { loadCharData } from '../utils/hanzi';

const BOX_SCALE = 0.9; // chữ chiếm ~90% ô
const WHITE_HEX = /^#?(?:f{3}|f{6})$/i; // #fff / fff / #ffffff

export default function Stage({
  selected,
  size,
//   basePadding,
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
  const mainMountRef = useRef(null);
  const writerRef = useRef(null);

  useEffect(() => {
    if (!selected || !mainMountRef.current) return;

    const mount = mainMountRef.current;
    mount.innerHTML = '';

    // --- SVG nền lưới 3x3 (responsive, dùng viewBox để co giãn đúng tỉ lệ) ---
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');

    // Vẽ theo hệ toạ độ size x size nhưng hiển thị "co dãn" theo CSS
    svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    svg.classList.add('mount');

    // Cho SVG tự co theo chiều ngang container (tránh vượt khung trên mobile)
    svg.style.width = '100%';
    svg.style.height = 'auto';
    svg.style.display = 'block';

    const line = (x1, y1, x2, y2) => {
      const ln = document.createElementNS(svgNS, 'line');
      ln.setAttribute('x1', x1);
      ln.setAttribute('y1', y1);
      ln.setAttribute('x2', x2);
      ln.setAttribute('y2', y2);
      ln.setAttribute('stroke', '#E5E7EB');
      ln.setAttribute('stroke-width', '1');
      return ln;
    };
    const t1 = size / 3,
      t2 = (2 * size) / 3;
    svg.appendChild(line(t1, 0, t1, size));
    svg.appendChild(line(t2, 0, t2, size));
    svg.appendChild(line(0, t1, size, t1));
    svg.appendChild(line(0, t2, size, t2));
    mount.appendChild(svg);

    // --- Padding để chữ chiếm ~90% ô, luôn ở chính giữa ---
    const pad = Math.round((size * (1 - BOX_SCALE)) / 2);

    // --- Chặn "màu trắng" vô tình (trên mobile có lúc input color trả #fff) ---
    const safeStroke =
      !strokeColor || WHITE_HEX.test(strokeColor) ? '#111111' : strokeColor;

    // Khởi tạo HanziWriter vào cùng chính cái <svg> này
    const writer = HanziWriter.create(svg, selected, {
      width: size,
      height: size,
      padding: pad, // dùng pad 90% thay vì basePadding
      showOutline,
      showCharacter: showChar,
      strokeAnimationSpeed: speed,
      delayBetweenStrokes,
      strokeColor: safeStroke, // màu nét “an toàn”
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
        /* noop */
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
      /* noop */
    }
  };

  const loop = () => {
    try {
      writerRef.current?.hideCharacter();
      writerRef.current?.loopCharacterAnimation();
    } catch {
      /* noop */
    }
  };

  return (
    <div className="section stage">
      <div className="stageInner">
        {/* khung chứa svg – đặt max-width để UI gọn trên mobile */}
        <div className="stageBox" ref={mainMountRef} />
        <div style={{ display: 'flex', gap: 8 }}>
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
