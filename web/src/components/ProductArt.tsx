// Bundled illustration (no external image host, no brand assets): a paid invoice,
// since the product is a lifetime plan for an invoicing app.
/** `stamp` is shown over a dimmed illustration once the sale can no longer be joined. */
export function ProductArt({ stamp }: { stamp?: 'Sold out' | 'Ended' }) {
  return (
    <div className={`art ${stamp ? 'art--dimmed' : ''}`}>
      <svg viewBox="60 28 280 340" role="img" aria-label="A paid invoice for Bookipi Pro Lifetime">
        <ellipse cx="200" cy="352" rx="112" ry="10" fill="rgba(0,0,0,0.12)" />
        <rect x="96" y="48" width="208" height="296" rx="14" fill="#ffffff" stroke="#dfe5f2" />

        <text x="120" y="92" fontSize="17" fontWeight="800" letterSpacing="3" fill="#131a2c">INVOICE</text>
        <text x="280" y="92" fontSize="11" textAnchor="end" fill="#8a94ab">#0001</text>
        <rect x="120" y="108" width="84" height="7" rx="3.5" fill="#e5ecfc" />
        <rect x="120" y="122" width="56" height="7" rx="3.5" fill="#e5ecfc" />

        <line x1="120" y1="150" x2="280" y2="150" stroke="#e5ecfc" />
        <text x="120" y="174" fontSize="11" fontWeight="600" fill="#131a2c">Pro Lifetime plan</text>
        <text x="280" y="174" fontSize="11" textAnchor="end" fill="#131a2c">$199.00</text>
        <rect x="120" y="186" width="110" height="7" rx="3.5" fill="#eef2fb" />
        <rect x="120" y="206" width="92" height="7" rx="3.5" fill="#eef2fb" />
        <rect x="252" y="206" width="28" height="7" rx="3.5" fill="#eef2fb" />

        <line x1="120" y1="232" x2="280" y2="232" stroke="#e5ecfc" />
        <text x="120" y="256" fontSize="11" fill="#8a94ab">TOTAL (AUD)</text>
        <text x="280" y="257" fontSize="15" fontWeight="800" textAnchor="end" fill="#131a2c">$199.00</text>

        <g transform="rotate(-12 200 300)" fill="none" stroke="var(--accent)" strokeWidth="4">
          <rect x="146" y="276" width="108" height="46" rx="8" />
          <text x="200" y="309" fontSize="26" fontWeight="800" letterSpacing="5" textAnchor="middle" fill="var(--accent)" stroke="none">
            PAID
          </text>
        </g>
      </svg>
      {stamp && <span className="art__stamp">{stamp}</span>}
    </div>
  );
}
