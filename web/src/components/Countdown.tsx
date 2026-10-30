import { formatDate, timeLeft } from '../time';

const pad = (n: number) => String(n).padStart(2, '0');

export function Countdown({ label, target, now }: { label: string; target: Date; now: number }) {
  const left = timeLeft(target, now);

  if (left.kind === 'date') {
    return (
      <div className="countdown">
        <span className="eyebrow">{label}</span>
        <strong className="countdown__date">{formatDate(left.date)}</strong>
      </div>
    );
  }

  const units: [string, number][] = [
    ['Hours', left.hours],
    ['Min', left.minutes],
    ['Sec', left.seconds],
  ];
  if (left.days > 0) units.unshift(['Days', left.days]);

  return (
    <div className="countdown">
      <span className="eyebrow">{label} in</span>
      <div className="countdown__units" aria-live="off">
        {units.map(([unit, value]) => (
          <div key={unit} className="countdown__unit">
            <strong>{pad(value)}</strong>
            <span>{unit}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
