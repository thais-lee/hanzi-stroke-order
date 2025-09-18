// src/components/Modal.jsx
import React, { useEffect, useRef } from 'react';

export default function Modal({
  open,
  title,
  onClose,
  children,
  maxWidth = 720,
}) {
  const ref = useRef(null);

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose?.();
    }
    if (open) document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="modalOverlay"
      onMouseDown={e => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div
        className="modalCard"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={ref}
        style={{ maxWidth }}
      >
        <div className="modalHeader">
          <div className="modalTitle">{title}</div>
          <button className="btn ghost" onClick={onClose}>
            Đóng
          </button>
        </div>
        <div className="modalBody">{children}</div>
      </div>
    </div>
  );
}
