'use client';

import { useState } from 'react';

type Interval = '1h' | '6h' | '1d' | '1w' | '1m' | 'max';
type TokenSide = 'yes' | 'no';
type Format = 'caption' | 'square' | 'narrow';

type EventOption = {
  id: string;
  slug: string;
  question: string;
  yesPrice: number;
  yesTokenId: string;
  noTokenId: string;
  icon: string | null;
};

type EventMeta = {
  slug: string;
  title: string;
  description: string;
  icon: string | null;
  tags: string[];
  options: EventOption[];
};

type Pick = {
  id: string;
  name: string;
  color: string;
};

type RenderResult = {
  videoUrl: string;
  filename: string;
  mode?: 'single' | 'compare';
  market?: { question: string; yesPrice: number; delta24hPct: number; points: number };
  series?: { id: string; name: string; color: string; yesPrice: number; points: number }[];
};

const INTERVALS: { id: Interval; label: string }[] = [
  { id: '1h', label: '1 Hour' },
  { id: '6h', label: '6 Hours' },
  { id: '1d', label: '1 Day' },
  { id: '1w', label: '1 Week' },
  { id: '1m', label: '1 Month' },
  { id: 'max', label: 'ALL' },
];

const PRESET_COLORS = ['#E64545', '#2563EB', '#1FB360', '#F5A623', '#9333EA', '#0EA5E9', '#0B0B0F'];
const DEFAULT_COLORS = ['#E64545', '#2563EB'];

export default function Home() {
  const [url, setUrl] = useState('');
  const [event, setEvent] = useState<EventMeta | null>(null);
  const [picks, setPicks] = useState<Pick[]>([]);
  const [token, setToken] = useState<TokenSide>('yes');
  const [interval, setInterval] = useState<Interval>('1m');
  const [headline, setHeadline] = useState('');
  const [format, setFormat] = useState<Format>('caption');
  const [smooth, setSmooth] = useState(false);
  const [liveTrades, setLiveTrades] = useState(false);
  const [showDescription, setShowDescription] = useState(false);

  const [loadingEvent, setLoadingEvent] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RenderResult | null>(null);

  async function loadEvent(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    setEvent(null);
    setPicks([]);
    setLoadingEvent(true);
    try {
      const res = await fetch('/api/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load event');
      setEvent(json);
      const first = json.options[0];
      if (first) {
        setPicks([{ id: first.id, name: shortName(first.question), color: DEFAULT_COLORS[0] }]);
      }
      setToken('yes');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingEvent(false);
    }
  }

  function shortName(question: string): string {
    return question
      .replace(/^Will\s+/i, '')
      .replace(/\s+win the .+$/i, '')
      .replace(/\?$/, '')
      .trim();
  }

  function togglePick(option: EventOption) {
    setPicks((prev) => {
      const existing = prev.findIndex((p) => p.id === option.id);
      if (existing >= 0) {
        return prev.filter((p) => p.id !== option.id);
      }
      if (prev.length >= 2) {
        return [
          prev[0],
          {
            id: option.id,
            name: shortName(option.question),
            color: DEFAULT_COLORS[1],
          },
        ];
      }
      const color = DEFAULT_COLORS[prev.length] ?? PRESET_COLORS[prev.length];
      return [
        ...prev,
        { id: option.id, name: shortName(option.question), color },
      ];
    });
  }

  function updatePick(id: string, patch: Partial<Pick>) {
    setPicks((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  function selectTop(n: 1 | 2) {
    if (!event) return;
    const top = [...event.options].sort((a, b) => b.yesPrice - a.yesPrice).slice(0, n);
    setPicks(
      top.map((opt, i) => ({
        id: opt.id,
        name: shortName(opt.question),
        color: DEFAULT_COLORS[i] ?? PRESET_COLORS[i],
      })),
    );
  }

  async function render() {
    if (!event || picks.length === 0) return;
    setError(null);
    setResult(null);
    setRendering(true);
    try {
      const body: Record<string, unknown> = { url, interval, headline, format, smooth };
      if (picks.length >= 2) {
        body.options = picks.slice(0, 2).map((p) => ({
          id: p.id,
          name: p.name,
          color: p.color,
        }));
      } else {
        body.optionId = picks[0].id;
        body.token = token;
        if (liveTrades) body.trades = true;
      }
      const res = await fetch('/api/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Render failed');
      setResult(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRendering(false);
    }
  }

  const isCompare = picks.length >= 2;

  return (
    <main style={styles.main}>
      <div style={styles.grid}>
        <section style={styles.card}>
          <h2 style={styles.cardTitle}>Market Card</h2>
          <p style={styles.cardSub}>Enter a Polymarket Event or Market URL to get started</p>

          <form onSubmit={loadEvent} style={styles.col}>
            <label style={styles.label}>
              Polymarket Event URL
              <input
                required
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://polymarket.com/event/..."
                style={styles.input}
                disabled={loadingEvent}
              />
            </label>
            <button type="submit" disabled={loadingEvent || !url} style={styles.primaryDark}>
              {loadingEvent ? 'Loading…' : 'Get Markets'}
            </button>
          </form>

          {event && (
            <>
              <div style={styles.eventHeader}>
                <h3 style={styles.eventTitle}>{event.title}</h3>
                {event.description && (
                  <button
                    type="button"
                    style={styles.descToggle}
                    onClick={() => setShowDescription((v) => !v)}
                  >
                    Description {showDescription ? '▲' : '▼'}
                  </button>
                )}
                {showDescription && event.description && (
                  <p style={styles.description}>{event.description}</p>
                )}
              </div>

              <div style={styles.label as React.CSSProperties}>
                <span>Select Markets (up to 2)</span>
                <div style={styles.optionList}>
                  {event.options.map((opt) => {
                    const picked = picks.find((p) => p.id === opt.id);
                    return (
                      <label key={opt.id} style={styles.optionRow}>
                        <input
                          type="checkbox"
                          checked={!!picked}
                          onChange={() => togglePick(opt)}
                          style={{ marginRight: 10 }}
                        />
                        <span style={styles.optionLabel}>
                          {opt.question}{' '}
                          <span style={{ color: '#8C8D95', marginLeft: 8 }}>
                            {Math.round(opt.yesPrice * 100)}%
                          </span>
                        </span>
                        {picked && (
                          <div
                            style={{
                              width: 14,
                              height: 14,
                              borderRadius: 7,
                              background: picked.color,
                              marginLeft: 8,
                              flexShrink: 0,
                            }}
                          />
                        )}
                      </label>
                    );
                  })}
                </div>
                <div style={styles.intervalGrid}>
                  <button type="button" onClick={() => selectTop(1)} style={styles.intervalBtn}>
                    Top 1
                  </button>
                  <button type="button" onClick={() => selectTop(2)} style={styles.intervalBtn}>
                    Top 2
                  </button>
                  <button
                    type="button"
                    onClick={() => setPicks([])}
                    style={styles.intervalBtn}
                  >
                    Clear
                  </button>
                </div>
              </div>

              {picks.length > 0 && (
                <div style={styles.label as React.CSSProperties}>
                  <span>Series ({isCompare ? 'Compare mode' : 'Single mode'})</span>
                  <div style={styles.col}>
                    {picks.map((p) => (
                      <div key={p.id} style={styles.seriesRow}>
                        <input
                          type="color"
                          value={p.color}
                          onChange={(e) => updatePick(p.id, { color: e.target.value })}
                          style={styles.colorInput}
                        />
                        <input
                          type="text"
                          value={p.name}
                          onChange={(e) => updatePick(p.id, { name: e.target.value })}
                          placeholder="Display name"
                          style={{ ...styles.input, flex: 1 }}
                        />
                        <div style={styles.swatches}>
                          {PRESET_COLORS.map((c) => (
                            <button
                              key={c}
                              type="button"
                              onClick={() => updatePick(p.id, { color: c })}
                              style={{
                                ...styles.swatch,
                                background: c,
                                outline:
                                  p.color.toLowerCase() === c.toLowerCase()
                                    ? '2px solid #0B0B0F'
                                    : '1px solid #D7D8DD',
                              }}
                              aria-label={`Pick color ${c}`}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {!isCompare && picks.length === 1 && (
                <label style={styles.label}>
                  Select Token
                  <select
                    value={token}
                    onChange={(e) => setToken(e.target.value as TokenSide)}
                    style={styles.input}
                  >
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
                </label>
              )}

              <div style={styles.label as React.CSSProperties}>
                <span>Interval</span>
                <div style={styles.intervalGrid}>
                  {INTERVALS.map((iv) => (
                    <button
                      type="button"
                      key={iv.id}
                      onClick={() => setInterval(iv.id)}
                      style={{
                        ...styles.intervalBtn,
                        ...(interval === iv.id ? styles.intervalBtnActive : null),
                      }}
                    >
                      {iv.label}
                    </button>
                  ))}
                </div>
              </div>

              <div style={styles.label as React.CSSProperties}>
                <span>Chart Data</span>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => setSmooth(false)}
                    style={{
                      ...styles.intervalBtn,
                      ...(!smooth ? styles.intervalBtnActive : null),
                    }}
                  >
                    Raw
                  </button>
                  <button
                    type="button"
                    onClick={() => setSmooth(true)}
                    style={{
                      ...styles.intervalBtn,
                      ...(smooth ? styles.intervalBtnActive : null),
                    }}
                  >
                    Smooth
                  </button>
                </div>
              </div>

              <div style={styles.label as React.CSSProperties}>
                <span>Live Trades Overlay {isCompare ? '(disabled in compare mode)' : ''}</span>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                  <button
                    type="button"
                    disabled={isCompare}
                    onClick={() => setLiveTrades(false)}
                    style={{
                      ...styles.intervalBtn,
                      ...(!liveTrades || isCompare ? styles.intervalBtnActive : null),
                      opacity: isCompare ? 0.5 : 1,
                      cursor: isCompare ? 'not-allowed' : 'pointer',
                    }}
                  >
                    Off
                  </button>
                  <button
                    type="button"
                    disabled={isCompare}
                    onClick={() => setLiveTrades(true)}
                    style={{
                      ...styles.intervalBtn,
                      ...(liveTrades && !isCompare ? styles.intervalBtnActive : null),
                      opacity: isCompare ? 0.5 : 1,
                      cursor: isCompare ? 'not-allowed' : 'pointer',
                    }}
                  >
                    On
                  </button>
                </div>
              </div>

              <div style={styles.label as React.CSSProperties}>
                <span>Export Format</span>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => setFormat('caption')}
                    style={{
                      ...styles.intervalBtn,
                      ...(format === 'caption' ? styles.intervalBtnActive : null),
                    }}
                  >
                    Caption 1080×1440
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormat('square')}
                    style={{
                      ...styles.intervalBtn,
                      ...(format === 'square' ? styles.intervalBtnActive : null),
                    }}
                  >
                    Square 1080×1080
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormat('narrow')}
                    style={{
                      ...styles.intervalBtn,
                      ...(format === 'narrow' ? styles.intervalBtnActive : null),
                    }}
                  >
                    Narrow 960×1098
                  </button>
                </div>
              </div>

              {format === 'caption' && (
                <label style={styles.label}>
                  Caption Text (optional)
                  <textarea
                    value={headline}
                    onChange={(e) => setHeadline(e.target.value)}
                    placeholder="There's a legitimate chance Elon tweets 900 times this month 😬"
                    style={{ ...styles.input, minHeight: 80, resize: 'vertical' }}
                  />
                </label>
              )}

              <button
                type="button"
                onClick={render}
                disabled={rendering || picks.length === 0}
                style={styles.primaryBlue}
              >
                {rendering ? 'Rendering… (30–90s)' : 'Render Video'}
              </button>
            </>
          )}

          {error && <div style={styles.error}>{error}</div>}
        </section>

        <section style={styles.card}>
          <h2 style={styles.cardTitle}>Preview</h2>
          {!event && (
            <p style={styles.cardSub}>Load an event to see options and render a video.</p>
          )}
          {event && !result && (
            <div style={styles.previewPlaceholder}>
              <div style={styles.previewMeta}>
                <strong>{event.title}</strong>
                <span style={{ color: '#8C8D95', marginTop: 6 }}>
                  {picks.length === 0
                    ? 'Pick 1 option for single mode, 2 for compare mode.'
                    : isCompare
                      ? `Compare: ${picks.map((p) => p.name).join(' vs ')}`
                      : `Single: ${picks[0].name} (${token})`}
                </span>
                <span style={{ color: '#8C8D95' }}>
                  Interval: {INTERVALS.find((i) => i.id === interval)?.label}
                </span>
              </div>
              <p style={{ color: '#8C8D95', fontSize: 14, marginTop: 16 }}>
                Click "Render Video" to generate an MP4.
              </p>
            </div>
          )}
          {result && (
            <div style={styles.col}>
              {result.mode === 'compare' && result.series && (
                <div style={styles.previewMeta}>
                  <strong>{event?.title}</strong>
                  <div style={{ display: 'flex', gap: 16, marginTop: 6 }}>
                    {result.series.map((s) => (
                      <span
                        key={s.id}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#0B0B0F' }}
                      >
                        <span
                          style={{
                            width: 10,
                            height: 10,
                            borderRadius: 5,
                            background: s.color,
                          }}
                        />
                        {s.name} {Math.round(s.yesPrice * 100)}% · {s.points} pts
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {result.mode !== 'compare' && result.market && (
                <div style={styles.previewMeta}>
                  <strong>{result.market.question}</strong>
                  <span style={{ color: '#8C8D95', marginTop: 4 }}>
                    {Math.round(result.market.yesPrice * 100)}% · {result.market.points} pts
                  </span>
                </div>
              )}
              <video
                src={result.videoUrl}
                controls
                autoPlay
                loop
                muted
                style={styles.video}
              />
              <a href={result.videoUrl} download style={styles.download}>
                Download {result.filename}
              </a>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  main: {
    minHeight: '100vh',
    padding: '32px 24px',
    background: '#F2F3F5',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
    gap: 24,
    maxWidth: 1400,
    margin: '0 auto',
  },
  card: {
    background: '#FFFFFF',
    borderRadius: 16,
    padding: 28,
    border: '1px solid #E4E5E9',
    display: 'flex',
    flexDirection: 'column',
    gap: 18,
  },
  cardTitle: {
    fontSize: 24,
    fontWeight: 700,
    color: '#0B0B0F',
    letterSpacing: -0.3,
    margin: 0,
  },
  cardSub: {
    color: '#8C8D95',
    fontSize: 14,
    margin: 0,
  },
  col: {
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
  },
  label: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    fontSize: 13,
    fontWeight: 600,
    color: '#4B4C53',
  },
  input: {
    background: '#FFFFFF',
    border: '1px solid #D7D8DD',
    borderRadius: 10,
    padding: '12px 14px',
    color: '#0B0B0F',
    fontSize: 14,
    outline: 'none',
    fontWeight: 400,
  },
  primaryDark: {
    background: '#0B0B0F',
    color: '#fff',
    border: 'none',
    borderRadius: 10,
    padding: '14px 16px',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
  },
  primaryBlue: {
    background: '#2563EB',
    color: '#fff',
    border: 'none',
    borderRadius: 10,
    padding: '14px 16px',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    marginTop: 4,
  },
  eventHeader: {
    paddingTop: 8,
    borderTop: '1px solid #ECEDEF',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  eventTitle: {
    fontSize: 18,
    fontWeight: 700,
    color: '#0B0B0F',
    margin: 0,
  },
  descToggle: {
    background: 'transparent',
    border: 'none',
    color: '#8C8D95',
    fontSize: 13,
    fontWeight: 500,
    padding: 0,
    textAlign: 'left',
    cursor: 'pointer',
  },
  description: {
    color: '#4B4C53',
    fontSize: 13,
    lineHeight: 1.5,
    margin: 0,
    whiteSpace: 'pre-wrap',
  },
  optionList: {
    border: '1px solid #D7D8DD',
    borderRadius: 10,
    maxHeight: 220,
    overflowY: 'auto',
    background: '#FAFAFB',
  },
  optionRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '8px 12px',
    borderBottom: '1px solid #ECEDEF',
    fontSize: 13,
    fontWeight: 500,
    color: '#0B0B0F',
    cursor: 'pointer',
  },
  optionLabel: {
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  seriesRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  colorInput: {
    width: 40,
    height: 40,
    border: '1px solid #D7D8DD',
    borderRadius: 8,
    background: 'transparent',
    padding: 2,
    cursor: 'pointer',
    flexShrink: 0,
  },
  swatches: {
    display: 'flex',
    gap: 6,
    flexWrap: 'wrap',
  },
  swatch: {
    width: 24,
    height: 24,
    borderRadius: 6,
    cursor: 'pointer',
    border: 'none',
    padding: 0,
  },
  intervalGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 8,
  },
  intervalBtn: {
    background: '#FFFFFF',
    border: '1px solid #D7D8DD',
    color: '#0B0B0F',
    borderRadius: 10,
    padding: '12px 14px',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },
  intervalBtnActive: {
    background: '#0B0B0F',
    color: '#FFFFFF',
    borderColor: '#0B0B0F',
  },
  previewPlaceholder: {
    border: '1px dashed #D7D8DD',
    borderRadius: 12,
    padding: 20,
    background: '#FAFAFB',
  },
  previewMeta: {
    display: 'flex',
    flexDirection: 'column',
    fontSize: 14,
    color: '#0B0B0F',
  },
  video: {
    width: '100%',
    borderRadius: 12,
    background: '#000',
    aspectRatio: '1080 / 1440',
  },
  download: {
    color: '#2563EB',
    textDecoration: 'none',
    fontSize: 14,
    fontWeight: 600,
  },
  error: {
    padding: 12,
    background: '#FDECEC',
    border: '1px solid #F5C7C7',
    borderRadius: 10,
    color: '#B33A3A',
    fontSize: 13,
  },
};
