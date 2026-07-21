import React from 'react'

// Hand-rolled SVG MPG trend — amber line over odometer, dots per fill.
// A fill that drops >10% below the trailing average of the previous 4 full
// fills renders red: early warning for a dragging brake or clogged filter.
export default function MpgChart({ points }) {
  // points: [{ odometer, mpg, date }] ascending by odometer, mpg non-null
  if (points.length < 2) {
    return <div className="note">MPG trend appears after two full fill-ups.</div>
  }
  const W = 340, H = 120, PL = 34, PR = 10, PT = 12, PB = 20
  const xs = points.map(p => p.odometer)
  const ys = points.map(p => p.mpg)
  const xMin = Math.min(...xs), xMax = Math.max(...xs)
  const yMin = Math.floor(Math.min(...ys) - 0.6), yMax = Math.ceil(Math.max(...ys) + 0.6)
  const X = o => PL + ((o - xMin) / (xMax - xMin || 1)) * (W - PL - PR)
  const Y = m => PT + (1 - (m - yMin) / (yMax - yMin || 1)) * (H - PT - PB)
  const avg = ys.reduce((a, b) => a + b, 0) / ys.length

  const low = points.map((p, i) => {
    const prev = points.slice(Math.max(0, i - 4), i)
    if (!prev.length) return false
    const pa = prev.reduce((a, b) => a + b.mpg, 0) / prev.length
    return p.mpg < pa * 0.9
  })

  const path = points.map((p, i) => `${i ? 'L' : 'M'}${X(p.odometer).toFixed(1)},${Y(p.mpg).toFixed(1)}`).join(' ')
  const area = `${path} L${X(xMax).toFixed(1)},${H - PB} L${X(xMin).toFixed(1)},${H - PB} Z`

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block' }} role="img" aria-label="MPG trend">
      <defs>
        <linearGradient id="mpgfill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFB000" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#FFB000" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* avg reference */}
      <line x1={PL} x2={W - PR} y1={Y(avg)} y2={Y(avg)} stroke="rgba(255,255,255,0.14)" strokeDasharray="3 4" strokeWidth="1" />
      <text x={W - PR} y={Y(avg) - 4} textAnchor="end" fontSize="8.5" fill="#918F87" fontFamily="IBM Plex Mono, monospace">
        avg {avg.toFixed(1)}
      </text>
      {/* y extremes */}
      <text x={PL - 5} y={Y(yMax) + 8} textAnchor="end" fontSize="9" fill="#918F87" fontFamily="IBM Plex Mono, monospace">{yMax}</text>
      <text x={PL - 5} y={Y(yMin)} textAnchor="end" fontSize="9" fill="#918F87" fontFamily="IBM Plex Mono, monospace">{yMin}</text>
      <path d={area} fill="url(#mpgfill)" />
      <path d={path} fill="none" stroke="#FFB000" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {points.map((p, i) => (
        <circle key={i} cx={X(p.odometer)} cy={Y(p.mpg)} r={low[i] ? 3.6 : 2.8}
          fill={low[i] ? '#FF5A52' : '#FFB000'} stroke="#060607" strokeWidth="1.4" />
      ))}
      {/* x labels: first/last odometer */}
      <text x={PL} y={H - 6} fontSize="9" fill="#918F87" fontFamily="IBM Plex Mono, monospace">{xMin.toLocaleString()}</text>
      <text x={W - PR} y={H - 6} textAnchor="end" fontSize="9" fill="#918F87" fontFamily="IBM Plex Mono, monospace">{xMax.toLocaleString()} mi</text>
    </svg>
  )
}
