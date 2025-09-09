import React from 'react';

export default function ProgressBars({
  batching,
  batchMsg,
  overallCount,
  convPct,
  zipPct,
}) {
  if (!batching) return null;
  return (
    <div className="progressWrap" style={{ marginTop: 8 }}>
      <div className="muted">
        {batchMsg} — {overallCount.i + 1}/{overallCount.n}
      </div>

      <div className="progress">
        <span
          style={{
            width: `${Math.round(
              (overallCount.i / Math.max(1, overallCount.n)) * 100,
            )}%`,
          }}
        />
      </div>

      <div className="progress">
        <span style={{ width: `${convPct}%` }} />
      </div>

      <div className="progress">
        <span style={{ width: `${zipPct}%` }} />
      </div>
    </div>
  );
}
