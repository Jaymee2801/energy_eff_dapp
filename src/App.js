import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  loadModel,
  runInference,
  verifyOnChain,
  encodeFeatures,
  getRating,
  RATINGS,
  FEATURE_META,
} from './model';
import './App.css';

/* ── Building input configuration ────────────────────────────────────── */
const INPUTS = [
  {
    key: 'insulationRating',
    label: 'Insulation Rating',
    min: 1, max: 7, step: 0.5, default: 4,
    icon: '🧱',
    hint: 'Rating 1 (best) to 7 (worst) — wall & roof insulation',
    format: v => {
      const grades = ['A+', 'A', 'B', 'C', 'D', 'E', 'F'];
      const idx = Math.min(6, Math.floor(v - 1));
      return grades[idx];
    },
    encodeIdx: 0,
  },
  {
    key: 'hvacCop',
    label: 'HVAC Efficiency (COP)',
    min: 1, max: 6, step: 0.1, default: 3.2,
    icon: '❄️',
    hint: 'Coefficient of Performance — higher is more efficient',
    format: v => v.toFixed(1),
    encodeIdx: 1,
  },
  {
    key: 'windowUValue',
    label: 'Window U-Value',
    min: 0.5, max: 3.5, step: 0.1, default: 1.8,
    icon: '🪟',
    hint: 'W/m²K — lower value means better insulation',
    format: v => v.toFixed(1) + ' W/m²K',
    encodeIdx: 2,
  },
  {
    key: 'occupancyHrs',
    label: 'Smart Occupancy',
    min: 0, max: 24, step: 1, default: 14,
    icon: '📡',
    hint: 'Hours per day with smart occupancy-based control',
    format: v => v + ' hrs/day',
    encodeIdx: 3,
  },
  {
    key: 'renewablePct',
    label: 'Renewable Energy',
    min: 0, max: 100, step: 1, default: 35,
    icon: '☀️',
    hint: 'Percentage of energy from renewable sources',
    format: v => v + '%',
    encodeIdx: 4,
  },
];

const PRESETS = [
  {
    label: '1970s Office Block',
    emoji: '🏚',
    tag: 'G',
    values: { insulationRating: 6.5, hvacCop: 1.4, windowUValue: 3.2, occupancyHrs: 0, renewablePct: 0 },
  },
  {
    label: 'Suburban House',
    emoji: '🏠',
    tag: 'D',
    values: { insulationRating: 4, hvacCop: 2.8, windowUValue: 2.0, occupancyHrs: 8, renewablePct: 15 },
  },
  {
    label: 'Modern Apartment',
    emoji: '🏢',
    tag: 'B',
    values: { insulationRating: 2.5, hvacCop: 4.1, windowUValue: 1.2, occupancyHrs: 16, renewablePct: 40 },
  },
  {
    label: 'Passive House',
    emoji: '🌿',
    tag: 'A',
    values: { insulationRating: 1, hvacCop: 5.8, windowUValue: 0.6, occupancyHrs: 24, renewablePct: 95 },
  },
];

/* ── EPC Grade ladder component ───────────────────────────────────────── */
function GradeLadder({ score }) {
  return (
    <div className="grade-ladder">
      {[...RATINGS].reverse().map((r) => {
        const active = score >= r.min && score < r.max;
        const width = 30 + (RATINGS.indexOf(r) / (RATINGS.length - 1)) * 55;
        return (
          <div
            key={r.grade}
            className={'grade-row' + (active ? ' grade-active' : '')}
            style={{ '--gc': r.color }}
          >
            <div className="grade-bar-wrap" style={{ width: width + '%' }}>
              <div className="grade-bar" style={{ background: r.color }}>
                <span className="grade-letter">{r.grade}</span>
              </div>
              <div className="grade-arrow" style={{ borderLeftColor: r.color }} />
            </div>
            {active && (
              <span className="grade-active-label" style={{ color: r.color }}>
                ← Your building
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ── Score dial component ─────────────────────────────────────────────── */
function ScoreDial({ score, rating }) {
  const circumference = 2 * Math.PI * 56;
  const dash = score * circumference;
  const pct = (score * 100).toFixed(1);

  return (
    <div className="dial-wrap">
      <svg className="dial-svg" viewBox="0 0 140 140">
        {/* Background track */}
        <circle
          cx="70" cy="70" r="56"
          fill="none"
          stroke="rgba(0,0,0,0.06)"
          strokeWidth="10"
        />
        {/* Rating zone arcs (background) */}
        {RATINGS.map((r) => {
          const start = r.min * circumference;
          const len = (r.max - r.min) * circumference;
          return (
            <circle
              key={r.grade}
              cx="70" cy="70" r="56"
              fill="none"
              stroke={r.color}
              strokeWidth="10"
              strokeDasharray={`${len} ${circumference - len}`}
              strokeDashoffset={circumference / 4 - start}
              opacity="0.15"
              style={{ transform: 'rotate(-90deg)', transformOrigin: '70px 70px' }}
            />
          );
        })}
        {/* Active progress arc */}
        <circle
          cx="70" cy="70" r="56"
          fill="none"
          stroke={rating.color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference - dash}`}
          strokeDashoffset={circumference / 4}
          style={{
            transform: 'rotate(-90deg)',
            transformOrigin: '70px 70px',
            transition: 'stroke-dasharray 0.6s cubic-bezier(0.4,0,0.2,1), stroke 0.3s',
            filter: `drop-shadow(0 0 6px ${rating.color}66)`,
          }}
        />
        {/* Center content */}
        <text x="70" y="62" textAnchor="middle" className="dial-grade" fill={rating.color}>
          {rating.grade}
        </text>
        <text x="70" y="80" textAnchor="middle" className="dial-pct" fill={rating.color}>
          {pct}%
        </text>
        <text x="70" y="95" textAnchor="middle" className="dial-label" fill="rgba(0,0,0,0.35)">
          efficiency
        </text>
      </svg>
      <div className="dial-verdict" style={{ color: rating.color, borderColor: rating.color + '44', background: rating.bg }}>
        {rating.label}
      </div>
      <div className="dial-desc">{rating.desc}</div>
    </div>
  );
}

/* ── Chain proof component ────────────────────────────────────────────── */
function ChainProof({ proof, verifying }) {
  if (verifying) {
    return (
      <div className="chain-card loading">
        <div className="chain-spinner" />
        <div>
          <div className="chain-title loading">Submitting to OpenGradient Network…</div>
          <div className="chain-sub">Generating ZKML proof · awaiting validator consensus</div>
        </div>
      </div>
    );
  }
  if (!proof) return null;

  const rows = [
    ['Network',    proof.network],
    ['Mode',       proof.inferMode],
    ['Block',      '#' + proof.blockNumber.toLocaleString()],
    ['CO₂ Saved',  proof.co2Saved + ' kg/yr est.'],
    ['Model CID',  proof.modelCid.slice(0, 22) + '…'],
    ['Tx Hash',    proof.txHash.slice(0, 22) + '…'],
    ['Time',       new Date(proof.timestamp).toLocaleTimeString()],
  ];

  return (
    <div className="chain-card verified">
      <div className="chain-badge">
        <span className="badge-check">✓</span>
        <span>Verified on OpenGradient</span>
        <span className="zkml-pill">ZKML</span>
      </div>
      <div className="chain-table">
        {rows.map(([k, v]) => (
          <div key={k} className="chain-row">
            <span className="chain-key">{k}</span>
            <span className="chain-val">{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Main App ─────────────────────────────────────────────────────────── */
export default function App() {
  const defaults = Object.fromEntries(INPUTS.map(f => [f.key, f.default]));
  const [vals, setVals] = useState(defaults);
  const [score, setScore] = useState(null);
  const [proof, setProof] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const [modelReady, setModelReady] = useState(false);
  const [activePreset, setActivePreset] = useState(null);
  const [history, setHistory] = useState([]);
  const debounceRef = useRef(null);

  useEffect(() => {
    loadModel().then(() => setModelReady(true)).catch(console.error);
  }, []);

  const encoded = encodeFeatures(vals);
  const rating = score !== null ? getRating(score) : null;

  const doInfer = useCallback(async (currentVals) => {
    if (!modelReady) return;
    try {
      const features = encodeFeatures(currentVals);
      const result = await runInference(features);
      setScore(result);
      setProof(null);
      const r = getRating(result);
      setHistory(prev => [
        {
          score: result,
          grade: r.grade,
          color: r.color,
          time: new Date().toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' }),
          preset: activePreset,
        },
        ...prev.slice(0, 4),
      ]);
    } catch (err) {
      console.error('Inference error:', err);
    }
  }, [modelReady, activePreset]);

  useEffect(() => {
    if (!modelReady) return;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doInfer(vals), 200);
    return () => clearTimeout(debounceRef.current);
  }, [vals, modelReady, doInfer]);

  const handleChange = (key, value) => {
    setVals(prev => ({ ...prev, [key]: value }));
    setActivePreset(null);
  };

  const applyPreset = (preset) => {
    setVals(preset.values);
    setActivePreset(preset.label);
    setProof(null);
  };

  const doVerify = useCallback(async () => {
    if (score === null || verifying) return;
    setVerifying(true);
    try {
      const result = await verifyOnChain(encoded, score);
      setProof(result);
    } catch (err) {
      console.error('Verify error:', err);
    } finally {
      setVerifying(false);
    }
  }, [score, encoded, verifying]);

  /* Estimated annual energy cost (illustrative) */
  const annualCostEst = score !== null
    ? Math.round(1800 - score * 1400)
    : null;

  const co2Est = score !== null
    ? (score * 12.4).toFixed(1)
    : null;

  return (
    <div className="app">
      <div className="bg-texture" />

      {/* Header */}
      <header className="hdr">
        <div className="hdr-inner">
          <div className="logo">
            <div className="logo-leaf">🌿</div>
            <div>
              <div className="logo-name">EcoChain</div>
              <div className="logo-sub">Energy Efficiency Scorer · OpenGradient Network</div>
            </div>
          </div>
          <div className={'model-tag ' + (modelReady ? 'live' : 'wait')}>
            <span className="tag-dot" />
            {modelReady ? 'Model Ready' : 'Loading…'}
          </div>
        </div>
      </header>

      <main className="main">

        {/* ── LEFT PANEL ── */}
        <aside className="left-panel">
          <div className="panel-section">
            <h2 className="section-heading">Building Types</h2>
            <div className="presets">
              {PRESETS.map(p => {
                const isActive = activePreset === p.label;
                const pr = RATINGS.find(r => r.grade === p.tag);
                const tagColor = pr ? pr.color : '#888';
                return (
                  <button
                    key={p.label}
                    className={'preset ' + (isActive ? 'active' : '')}
                    style={isActive ? { borderColor: tagColor } : {}}
                    onClick={() => applyPreset(p)}
                  >
                    <span className="preset-emoji">{p.emoji}</span>
                    <div className="preset-info">
                      <span className="preset-name">{p.label}</span>
                      <span className="preset-grade" style={{ color: tagColor }}>
                        Grade {p.tag}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="panel-section">
            <h2 className="section-heading">Building Parameters</h2>
            <div className="inputs">
              {INPUTS.map((f) => {
                const pct = (vals[f.key] - f.min) / (f.max - f.min);
                const encVal = encoded[f.encodeIdx];
                const encColor = encVal > 0.65 ? '#27ae60' : encVal > 0.35 ? '#f39c12' : '#c0392b';
                return (
                  <div key={f.key} className="input-group">
                    <div className="input-top">
                      <span className="inp-icon">{f.icon}</span>
                      <span className="inp-label">{f.label}</span>
                      <span className="inp-value">{f.format(vals[f.key])}</span>
                    </div>
                    <div className="slider-row">
                      <input
                        type="range"
                        min={f.min}
                        max={f.max}
                        step={f.step}
                        value={vals[f.key]}
                        onChange={e => handleChange(f.key, parseFloat(e.target.value))}
                        className="slider"
                        style={{ '--pct': (pct * 100) + '%', '--col': encColor }}
                      />
                      <div
                        className="enc-indicator"
                        style={{ background: encColor + '22', borderColor: encColor + '55', color: encColor }}
                      >
                        {(encVal * 100).toFixed(0)}%
                      </div>
                    </div>
                    <div className="inp-hint">{f.hint}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </aside>

        {/* ── RIGHT PANEL ── */}
        <section className="right-panel">

          {score !== null && rating ? (
            <>
              {/* Score section */}
              <div className="score-section">
                <div className="score-left">
                  <ScoreDial score={score} rating={rating} />
                </div>
                <div className="score-right">
                  <GradeLadder score={score} />
                </div>
              </div>

              {/* Stats row */}
              <div className="stats-row">
                <div className="stat-card">
                  <div className="stat-icon">💷</div>
                  <div className="stat-value">~£{annualCostEst}</div>
                  <div className="stat-label">Est. annual energy cost</div>
                </div>
                <div className="stat-card">
                  <div className="stat-icon">🌍</div>
                  <div className="stat-value">{co2Est} kg</div>
                  <div className="stat-label">CO₂ saved per year</div>
                </div>
                <div className="stat-card">
                  <div className="stat-icon">⚡</div>
                  <div className="stat-value">{(score * 100).toFixed(0)}/100</div>
                  <div className="stat-label">Efficiency score</div>
                </div>
                <div className="stat-card">
                  <div className="stat-icon">🏷</div>
                  <div className="stat-value" style={{ color: rating.color }}>Grade {rating.grade}</div>
                  <div className="stat-label">EPC rating</div>
                </div>
              </div>

              {/* Feature breakdown */}
              <div className="breakdown-section">
                <h3 className="section-heading">Feature Analysis</h3>
                <div className="breakdown-grid">
                  {FEATURE_META.map((fm, i) => {
                    const encVal = encoded[i];
                    const encColor = encVal > 0.65 ? '#27ae60' : encVal > 0.35 ? '#f39c12' : '#c0392b';
                    const contribution = (encVal * fm.weight) / FEATURE_META.reduce((a, m) => a + m.weight, 0);
                    return (
                      <div key={fm.key} className="breakdown-card">
                        <div className="bc-top">
                          <span className="bc-icon">{fm.icon}</span>
                          <span className="bc-label">{fm.label}</span>
                          <span className="bc-pct" style={{ color: encColor }}>
                            {(encVal * 100).toFixed(0)}%
                          </span>
                        </div>
                        <div className="bc-track">
                          <div
                            className="bc-fill"
                            style={{
                              width: (encVal * 100) + '%',
                              background: encColor,
                              boxShadow: '0 0 8px ' + encColor + '44',
                            }}
                          />
                        </div>
                        <div className="bc-contrib">
                          {(contribution * 100).toFixed(1)}% contribution
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Tensor readout */}
              <div className="tensor-section">
                <div className="tensor-row">
                  <span className="t-label">Input  float32[1,5]</span>
                  <span className="t-value">[{encoded.map(v => v.toFixed(4)).join(', ')}]</span>
                </div>
                <div className="tensor-row">
                  <span className="t-label">Output float32[1,1]</span>
                  <span className="t-value" style={{ color: rating.color }}>
                    [{score.toFixed(8)}]
                  </span>
                </div>
              </div>

              {/* Verify */}
              <div className="verify-section">
                <h3 className="section-heading">OpenGradient On-Chain Verification</h3>
                {!proof && !verifying && (
                  <button className="btn-verify" onClick={doVerify}>
                    <span>⛓</span>
                    Verify Score on OpenGradient via ZKML
                  </button>
                )}
                <ChainProof proof={proof} verifying={verifying} />
              </div>

              {/* History */}
              {history.length > 0 && (
                <div className="history-section">
                  <h3 className="section-heading">Assessment History</h3>
                  <div className="history-list">
                    {history.map((h, i) => (
                      <div key={i} className="history-item">
                        <span className="h-time">{h.time}</span>
                        <span className="h-grade" style={{ color: h.color, borderColor: h.color + '44', background: h.color + '11' }}>
                          {h.grade}
                        </span>
                        <div className="h-bar-track">
                          <div className="h-bar-fill" style={{ width: (h.score * 100) + '%', background: h.color }} />
                        </div>
                        <span className="h-score" style={{ color: h.color }}>
                          {(h.score * 100).toFixed(1)}%
                        </span>
                        {h.preset && <span className="h-preset">{h.preset}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="empty-state">
              <div className="empty-orb" />
              <div className="empty-title">Awaiting Assessment</div>
              <div className="empty-sub">
                Adjust the building parameters or select a preset<br />
                to generate an energy efficiency score
              </div>
              <div className="empty-chain">
                Powered by <em>energy_efficiency.onnx</em> · Verifiable on OpenGradient
              </div>
            </div>
          )}
        </section>
      </main>

      <footer className="ftr">
        <span>energy_efficiency.onnx</span>
        <span className="ftr-dot">·</span>
        <span>ONNX Runtime Web</span>
        <span className="ftr-dot">·</span>
        <span>OpenGradient Alpha Testnet</span>
        <span className="ftr-dot">·</span>
        <span>Results are indicative only</span>
      </footer>
    </div>
  );
}
