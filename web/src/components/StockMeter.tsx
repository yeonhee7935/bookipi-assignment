export function StockMeter({ remaining, total }: { remaining: number; total: number }) {
  const ratio = total > 0 ? remaining / total : 0;
  const low = remaining > 0 && ratio <= 0.2;

  return (
    <div className="stock">
      <div className="stock__label">
        <span>{remaining > 0 ? `${remaining} of ${total} seats left` : 'No seats left'}</span>
        {low && <span className="stock__low">Almost gone</span>}
      </div>
      <div className="stock__bar">
        <div style={{ width: `${ratio * 100}%` }} className={low ? 'low' : ''} />
      </div>
    </div>
  );
}
