import React from 'react';
import { PAGE_SIZES, generatePracticePDF } from '../utils/pdfGen';
import { GRID_DEFAULTS } from '../utils/misc';

export default function PDFPanel({
  pdfPageSize,
  setPdfPageSize,
  pdfOrientation,
  setPdfOrientation,
  pdfCols,
  setPdfCols,
  pdfMarginMm,
  setPdfMarginMm,
  pdfIncludeDiagonals,
  setPdfIncludeDiagonals,
  pdfShowFaint,
  setPdfShowFaint,
  pdfFaintAlpha,
  setPdfFaintAlpha,
  pdfSourceMode,
  setPdfSourceMode,
  pdfTitle,
  setPdfTitle,
  cjkFontBytes,
  selected,
  chars,
  pdfUrl,
  setPdfUrl,
  setBusyMsg,
  pdfWarn,
  setPdfWarn,
  pdfInfo,
  setPdfInfo,
  gridEnabled,
}) {
  const makePDF = async (download = false) => {
    try {
      setBusyMsg('Đang tạo PDF…');
      setPdfWarn('');
      setPdfInfo('');
      if (pdfUrl) {
        URL.revokeObjectURL(pdfUrl);
        setPdfUrl('');
      }

      const { blob, info, warn } = await generatePracticePDF({
        selected,
        chars,
        pageSize: pdfPageSize,
        orientation: pdfOrientation,
        cols: pdfCols,
        marginMm: pdfMarginMm,
        includeDiagonals: pdfIncludeDiagonals,
        showFaint: pdfShowFaint,
        faintAlpha: pdfFaintAlpha,
        sourceMode: pdfSourceMode,
        title: pdfTitle,
        cjkFontBytes,
        gridEnabled,
        gridOpts: GRID_DEFAULTS
      });

      const url = URL.createObjectURL(blob);
      setPdfUrl(url);
      if (warn) setPdfWarn(warn);
      setPdfInfo(info);

      if (download) {
        const a = document.createElement('a');
        a.href = url;
        a.download = `hanzi-practice-${pdfPageSize}-${pdfOrientation}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
    } catch (err) {
      console.error(err);
      let msg = 'Không thể tạo PDF. ';
      if (String(err?.message).includes('NO_VALID_CHARS'))
        msg += 'Không có ký tự hợp lệ.';
      else if (String(err?.message).includes('CELL_TOO_SMALL'))
        msg += 'Ô quá nhỏ – hãy giảm số cột hoặc lề.';
      else msg += 'Hãy giảm số cột hoặc kiểm tra dữ liệu chữ.';
      alert(msg);
    } finally {
      setBusyMsg('');
    }
  };

  return (
    <div className="section">
      <div style={{ fontWeight: 600, marginBottom: 6 }}>
        Tạo lưới chữ để in (PDF)
      </div>

      <div className="row">
        <label>Khổ giấy</label>
        <select
          className="select"
          value={pdfPageSize}
          onChange={e => setPdfPageSize(e.target.value)}
        >
          <option value="A4">A4 (210×297mm)</option>
          <option value="Letter">Letter (8.5×11in)</option>
        </select>
        <select
          className="select"
          value={pdfOrientation}
          onChange={e => setPdfOrientation(e.target.value)}
        >
          <option value="portrait">Dọc</option>
          <option value="landscape">Ngang</option>
        </select>
      </div>

      <div className="row">
        <label>Số cột</label>
        <input
          className="input"
          type="range"
          min={3}
          max={12}
          step={1}
          value={pdfCols}
          onChange={e => setPdfCols(parseInt(e.target.value) || 6)}
        />
        <span className="muted">{pdfCols} cột (hàng tự tính)</span>
      </div>

      <div className="row">
        <label>Lề (mm)</label>
        <input
          className="input number"
          type="number"
          min={5}
          max={30}
          step={1}
          value={pdfMarginMm}
          onChange={e => setPdfMarginMm(parseInt(e.target.value) || 12)}
        />
      </div>

      <div className="row">
        <label>Tùy chọn lưới</label>
        <label>
          <input
            className="checkbox"
            type="checkbox"
            checked={pdfIncludeDiagonals}
            onChange={e => setPdfIncludeDiagonals(e.target.checked)}
          />{' '}
          Có đường chéo
        </label>
      </div>

      <div className="row">
        <label>Chữ mẫu mờ</label>
        <label>
          <input
            className="checkbox"
            type="checkbox"
            checked={pdfShowFaint}
            onChange={e => setPdfShowFaint(e.target.checked)}
          />{' '}
          In kèm chữ mờ để tô
        </label>
      </div>

      <div className="row">
        <label>Cường độ chữ mờ</label>
        <input
          className="input"
          type="range"
          min={0.05}
          max={1.00}
          step={0.05}
          value={pdfFaintAlpha}
          onChange={e => setPdfFaintAlpha(parseFloat(e.target.value) || 0.2)}
        />
        <span className="muted">{Math.round(pdfFaintAlpha * 100)}%</span>
      </div>

      <div className="row">
        <label>Nguồn chữ cho lưới</label>
        <select
          className="select"
          value={pdfSourceMode}
          onChange={e => setPdfSourceMode(e.target.value)}
        >
          <option value="selected">Lặp lại ký tự đang chọn</option>
          <option value="sequence">
            Dùng chuỗi đã nhập (tuần tự, lặp vòng)
          </option>
        </select>
      </div>

      <div className="row">
        <label>Tiêu đề trang (có thể chứa CJK)</label>
        <input
          className="input"
          value={pdfTitle}
          onChange={e => setPdfTitle(e.target.value)}
          placeholder="Bảng luyện viết / 书写练习"
        />
      </div>

      <div className="row">
        <label>Trạng thái font CJK</label>
        <div className="muted">
          {cjkFontBytes
            ? 'đã tìm thấy CJK font'
            : 'không tìm thấy CJK font – dùng Helvetica (ASCII)'}
        </div>
      </div>

      <div className="row" style={{ gap: 8 }}>
        <button className="btn" onClick={() => makePDF(false)}>
          Tạo bản xem trước
        </button>
        <button
          className="btn secondary"
          onClick={() => makePDF(true)}
          disabled={!selected}
        >
          Tạo & tải PDF
        </button>
        {pdfUrl && (
          <button
            className="btn ghost"
            onClick={() => {
              URL.revokeObjectURL(pdfUrl);
              setPdfUrl('');
            }}
          >
            Xóa preview
          </button>
        )}
      </div>

      {pdfWarn && (
        <div className="row">
          <div className="warn">{pdfWarn}</div>
        </div>
      )}
      {pdfInfo && (
        <div className="row">
          <div className="muted">{pdfInfo}</div>
        </div>
      )}

      {pdfUrl && (
        <div
          className="row"
          style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}
        >
          <label className="muted">
            Xem trước PDF (trượt để xem toàn trang):
          </label>
          <iframe className="pdfPrev" title="preview" src={pdfUrl} />
          <div style={{ display: 'flex', gap: 8 }}>
            <a
              className="btn"
              href={pdfUrl}
              download={`hanzi-practice-${pdfPageSize}-${pdfOrientation}.pdf`}
            >
              Tải ngay
            </a>
            <div className="muted">
              Nếu preview không hiện, trình duyệt có thể chặn – hãy nhấn "Tải
              ngay".
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
