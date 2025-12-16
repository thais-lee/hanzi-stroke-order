/* eslint-disable no-unused-vars */
import React, { useState, useEffect, useRef } from 'react';
import HanziWriter from 'hanzi-writer';
import { loadCharCategories } from '../utils/charLists';

/* Helpers */
const shuffleArray = arr => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const normalize = s => (s || '').toLowerCase().trim().replace(/\s+/g, ' ');

/* Component */
export default function ReviewMode() {
  /* Data & settings */
  const [flatList, setFlatList] = useState([]);
  const [progressIndex, setProgressIndex] = useState(0);
  const [reviewMode, setReviewMode] = useState('mixed'); // read|write|mixed
  const [questionCount, setQuestionCount] = useState(10);
  const [timeLimit, setTimeLimit] = useState(0);

  /* Game state */
  const [status, setStatus] = useState('setup'); // setup|playing|finished
  const [questions, setQuestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const currentIndexRef = useRef(0);
  const [results, setResults] = useState([]);
  const [score, setScore] = useState(0);

  /* Per-question UI */
  const [userInput, setUserInput] = useState('');
  const [feedback, setFeedback] = useState(null); // 'correct'|'wrong'|null
  const [showHint, setShowHint] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);

  /* Meaning display */
  const [showMeaning, setShowMeaning] = useState(false);

  /* HanziWriter refs */
  const writerRef = useRef(null);
  const writerInstance = useRef(null);

  /* Locks */
  const lockRef = useRef(false);

  /* Load categories */
  useEffect(() => {
    const cats = loadCharCategories() || [];
    const flattened = [];
    let idx = 0;
    cats.forEach(cat => {
      (cat.items || []).forEach(item => {
        flattened.push({
          ...item,
          categoryName: cat.label,
          globalIndex: idx++,
        });
      });
    });
    setFlatList(flattened);
    if (flattened.length > 0) setProgressIndex(flattened.length - 1);
  }, []);

  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

  /* Start quiz */
  const startQuiz = () => {
    const pool = flatList.slice(0, progressIndex + 1);
    if (!pool.length) {
      alert('Chưa có dữ liệu để ôn tập');
      return;
    }
    const picked = shuffleArray(pool).slice(0, Math.max(1, questionCount));
    const quiz = picked.map(item => {
      let type = reviewMode;
      if (reviewMode === 'mixed') type = Math.random() < 0.5 ? 'read' : 'write';
      return { ...item, type };
    });
    setQuestions(quiz);
    setResults([]);
    setScore(0);
    setCurrentIndex(0);
    setStatus('playing');
  };

  /* Prepare question */
  const prepareQuestionForIndex = index => {
    setUserInput('');
    setFeedback(null);
    setShowHint(false);
    setShowMeaning(false);
    setTimeLeft(timeLimit > 0 ? timeLimit : 0);

    // cleanup writer
    if (writerInstance.current) {
      if (writerRef.current) writerRef.current.innerHTML = '';
      writerInstance.current = null;
    }

    const q = questions[index];
    if (!q) return;
    if (q.type === 'write') {
      setTimeout(() => initWriterForQuestion(q), 80);
    } else {
      if (writerRef.current) writerRef.current.innerHTML = '';
    }
  };

  const initWriterForQuestion = q => {
    if (!writerRef.current) return;
    writerRef.current.innerHTML = '';
    writerInstance.current = HanziWriter.create(writerRef.current, q.value, {
      width: 260,
      height: 260,
      padding: 8,
      showOutline: false,
      showCharacter: false,
      strokeColor: '#222222',
      radicalColor: '#16a34a',
      outlineColor: '#cccccc',
      drawingWidth: 18,
      highlightOnComplete: true,
    });

    writerInstance.current.quiz({
      onMistake: () => {},
      onComplete: () => {
        handleAnswer(true, q);
      },
    });
  };

  /* Effect: prepare when playing/currentIndex/questions changes */
  useEffect(() => {
    if (status !== 'playing') return;
    if (!questions || questions.length === 0) return;
    if (currentIndex < 0 || currentIndex >= questions.length) return;
    prepareQuestionForIndex(currentIndex);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, currentIndex, questions]);

  /* Timer */
  useEffect(() => {
    if (status !== 'playing') return;
    if (timeLimit <= 0) return;

    setTimeLeft(timeLimit);
    let timerId = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerId);
          const q = questions[currentIndexRef.current];
          if (q) handleAnswer(false, q);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timerId);
  }, [currentIndex, status, timeLimit, questions]);

  /* Handle answer */
  const handleAnswer = (isCorrect, q) => {
    if (lockRef.current) return;
    lockRef.current = true;

    setResults(prev => [
      ...prev,
      { ...q, isCorrect, userAnswer: q.type === 'read' ? userInput : '(viết)' },
    ]);

    if (isCorrect) {
      setScore(s => s + 1);
      setFeedback('correct');
      setShowMeaning(false);
    } else {
      setFeedback('wrong');
      if (q.meaning) setShowMeaning(true);
      if (q.type === 'write') writerInstance.current?.showCharacter();
    }

    setTimeout(() => {
      lockRef.current = false;
      const next = currentIndexRef.current + 1;
      if (!questions || next >= questions.length) {
        setStatus('finished');
      } else {
        setCurrentIndex(prev => prev + 1);
      }
    }, 1000);
  };

  /* Read check */
  const checkReading = () => {
    const q = questions[currentIndexRef.current];
    if (!q) return;
    const labelNorm = normalize(q.label || '');
    const inputNorm = normalize(userInput || '');
    const ok = inputNorm.length > 0 && labelNorm.includes(inputNorm);
    handleAnswer(ok, q);
  };

  /* Skip */
  const skipQuestion = () => {
    const q = questions[currentIndexRef.current];
    if (!q) return;
    handleAnswer(false, q);
  };

  /* Toggle meaning view */
  const toggleMeaning = () => {
    setShowMeaning(s => !s);
  };

  /* Render */
  if (status === 'setup') {
    return (
      <div className="review-container">
        <h2>Cài đặt ôn tập</h2>

        <label>Tiến độ ({flatList.length} chữ):</label>
        <select
          className="select-box"
          value={progressIndex}
          onChange={e => setProgressIndex(Number(e.target.value))}
        >
          {flatList.map((it, i) => (
            <option key={i} value={i}>
              #{i + 1} - {it.label.slice(3)}
            </option>
          ))}
        </select>

        <label style={{ marginTop: 12 }}>Chế độ</label>
        <select
          className="select-box"
          value={reviewMode}
          onChange={e => setReviewMode(e.target.value)}
        >
          <option value="read">Đọc (nhìn chữ → gõ âm)</option>
          <option value="write">Viết (nhìn âm → viết chữ)</option>
          <option value="mixed">Hỗn hợp</option>
        </select>

        <div style={{ height: 12 }} />

        <div className="row">
          <div>
            <label>Số câu</label>
            <input
              className="input-field"
              type="number"
              min={1}
              value={questionCount}
              onChange={e => setQuestionCount(Number(e.target.value) || 1)}
            />
          </div>
          <div>
            <label>Giây / câu (0 = vô hạn)</label>
            <input
              className="input-field"
              type="number"
              min={0}
              value={timeLimit}
              onChange={e => setTimeLimit(Number(e.target.value) || 0)}
            />
          </div>
        </div>

        <button
          className="btn-primary"
          onClick={startQuiz}
          style={{ marginTop: 16 }}
        >
          Bắt đầu
        </button>
      </div>
    );
  }

  if (status === 'finished') {
    return (
      <div className="review-container center">
        <h2>Kết quả</h2>

        <div className="score-box" style={{ marginTop: 10 }}>
          <span className="score-num">{score}</span>
          <span className="score-total">/ {questions.length}</span>
        </div>

        <div className="result-list" style={{ marginTop: 16 }}>
          {results.map((r, i) => (
            <div key={i} className={`result-row ${r.isCorrect ? 'ok' : 'bad'}`}>
              <div className="char-icon">{r.value}</div>
              <div>
                <div style={{ fontWeight: 700 }}>{r.label}</div>
                <div style={{ color: '#6b7280' }}>
                  {r.reading ? `(${r.reading})` : ''}{' '}
                  {r.meaning ? `— ${r.meaning}` : ''}
                </div>
              </div>
            </div>
          ))}
        </div>

        <button
          className="btn-primary"
          onClick={() => setStatus('setup')}
          style={{ marginTop: 18 }}
        >
          Ôn tập lại
        </button>
      </div>
    );
  }

  const q = questions[currentIndex] || {};

  return (
    <div className="review-container playing">
      <div className="quiz-header">
        <div>
          Câu {currentIndex + 1} / {questions.length}
        </div>
        {timeLimit > 0 && (
          <div className={timeLeft < 5 ? 'timer-danger' : 'timer-normal'}>
            ⏱ {timeLeft}s
          </div>
        )}
      </div>

      {q.type === 'read' ? (
        <>
          <div className="big-char">{q.value}</div>

          {/* Phiên âm (nếu có)
          <div
            style={{
              textAlign: 'center',
              color: '#374151',
              fontWeight: 600,
              marginBottom: 6,
            }}
          >
            {q.reading ? `(${q.reading})` : q.label}
          </div> */}

          {/* Nút hiển thị nghĩa */}
          <div style={{ textAlign: 'center', marginBottom: 8 }}>
            <button className="btn-small" onClick={toggleMeaning}>
              {showMeaning ? 'Ẩn giải nghĩa' : 'Giải nghĩa'}
            </button>
          </div>

          {/* Phần nghĩa */}
          {showMeaning && q.meaning && (
            <div
              className="feedback-msg"
              style={{
                background: 'transparent',
                border: '1px solid #e6eef0',
                color: '#374151',
                fontWeight: 600,
              }}
            >
              
              {q.meaning}
            </div>
          )}

          <div style={{ height: 8 }} />

          {!feedback ? (
            <div className="input-group">
              <input
                autoFocus
                className="input-field big-input"
                placeholder="Nhập âm Hán Việt..."
                value={userInput}
                onChange={e => setUserInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && checkReading()}
              />
              <button className="btn-check" onClick={checkReading}>
                Kiểm tra
              </button>
            </div>
          ) : (
            <div className={`feedback-msg ${feedback}`}>
              {feedback === 'correct'
                ? 'Chính xác!'
                : `Sai rồi! Đáp án: ${q.label}${
                    q.reading ? ' (' + q.reading + ')' : ''
                  }`}
            </div>
          )}
        </>
      ) : (
        <>
          {/* ========== WRITE MODE: CHỈ HIỂN THỊ PHIÊN ÂM + NGHĨA (KHÔNG HIỆN CHỮ HÁN) ========== */}

          {/* Hiển thị PHIÊN ÂM (nếu có) — LƯU Ý: không hiển thị q.label hoặc q.value */}
          <div
            style={{
              textAlign: 'center',
              marginBottom: 6,
              color: '#374151',
              fontWeight: 700,
            }}
          >
            {q.reading ? `${q.reading}` : '—'}
          </div>

          {/* Hiển thị NGHĨA nếu user mở hoặc tự bật khi sai */}
          <div style={{ textAlign: 'center', marginBottom: 8 }}>
            <button className="btn-small" onClick={toggleMeaning}>
              {showMeaning ? 'Ẩn giải nghĩa' : 'Xem giải nghĩa'}
            </button>
          </div>

          {(showMeaning || feedback === 'wrong') && q.meaning && (
            <div
              className="feedback-msg"
              style={{
                background: 'transparent',
                border: '1px solid #e6eef0',
                color: '#374151',
                fontWeight: 600,
                marginBottom: 8,
              }}
            >
              {q.meaning}
            </div>
          )}

          {/* HanziWriter canvas (ẩn chữ mẫu by default) */}
          <div className="writer-box">
            <div ref={writerRef} />
          </div>

          {!feedback ? (
            <div className="controls-row" style={{ marginTop: 8 }}>
              <button
                className="btn-small"
                onClick={() => writerInstance.current?.animateCharacter()}
              >
                Xem mẫu
              </button>
              <button className="btn-small danger" onClick={skipQuestion}>
                Bỏ qua
              </button>
            </div>
          ) : (
            <div
              className={`feedback-msg ${feedback}`}
              style={{ marginTop: 8 }}
            >
              {feedback === 'correct' ? 'Đúng rồi!' : 'Sai rồi!'}
            </div>
          )}
        </>
      )}
    </div>
  );
}
