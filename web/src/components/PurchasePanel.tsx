import { useEffect, useState, type FormEvent } from 'react';
import { api, type SaleStatus } from '../api';
import { attemptPurchase, checkPurchase, type Feedback } from '../purchase';

const buttonLabel: Record<SaleStatus, string> = {
  upcoming: 'Opens soon',
  active: 'Buy now',
  sold_out: 'Sold out',
  ended: 'Drop ended',
};

const icon: Record<Feedback['tone'], string> = { success: '✓', info: 'i', error: '!' };

function useCooldown() {
  const [until, setUntil] = useState(0);
  const [, tick] = useState(0);
  const remaining = Math.max(0, Math.ceil((until - Date.now()) / 1000));
  useEffect(() => {
    if (remaining === 0) return;
    const id = setTimeout(() => tick((n) => n + 1), 250);
    return () => clearTimeout(id);
  });
  return [remaining, (seconds: number) => setUntil(Date.now() + seconds * 1000)] as const;
}

export function PurchasePanel({ status }: { status: SaleStatus }) {
  const [userId, setUserId] = useState('');
  const [pending, setPending] = useState(false);
  // Remembers which user id a message is about, so editing the id never shows another user's result.
  const [feedback, setFeedback] = useState<(Feedback & { userId: string }) | null>(null);
  // Which user ids we know own an item. Without login, the input can be changed to
  // another user at any time, so ownership is tracked per id rather than per page.
  const [ownedIds, setOwnedIds] = useState<ReadonlySet<string>>(new Set());
  const [cooldown, startCooldown] = useCooldown();

  const id = userId.trim();
  const owned = ownedIds.has(id);

  // An error ("high demand", "not open yet") is stale once the sale moves on; a success is not.
  useEffect(() => {
    setFeedback((current) => (current?.tone === 'success' ? current : null));
  }, [status]);

  async function run(action: () => Promise<Feedback>) {
    setPending(true);
    setFeedback(null);
    const forId = id;
    const result = await action();
    if (result.retryAfter) startCooldown(result.retryAfter);
    if (result.owned !== undefined) {
      setOwnedIds((ids) => {
        const next = new Set(ids);
        if (result.owned) next.add(forId);
        else next.delete(forId);
        return next;
      });
    }
    setFeedback({ ...result, userId: forId });
    setPending(false);
  }

  const buy = (e: FormEvent) => {
    e.preventDefault();
    run(() => attemptPurchase(api, id));
  };

  const label = owned
    ? 'Purchased ✓'
    : pending
      ? 'Securing…'
      : cooldown > 0
        ? `Try again in ${cooldown}s`
        : buttonLabel[status];

  return (
    <form className="purchase" onSubmit={buy}>
      <label className="eyebrow" htmlFor="userId">
        Account email or username
      </label>
      <input
        id="userId"
        autoComplete="off"
        placeholder="you@example.com"
        value={userId}
        maxLength={64}
        onChange={(e) => setUserId(e.target.value)}
      />
      <button
        className={`buy ${owned ? 'buy--owned' : ''}`}
        type="submit"
        disabled={!id || owned || pending || cooldown > 0 || status !== 'active'}
      >
        {label}
      </button>
      <button type="button" className="link" disabled={!id || pending} onClick={() => run(() => checkPurchase(api, id))}>
        Already bought? Check your order
      </button>

      {feedback?.userId === id && (
        <div className={`feedback feedback--${feedback.tone}`} role="status">
          <span className="feedback__icon">{icon[feedback.tone]}</span>
          <div>
            <strong>{feedback.title}</strong>
            {feedback.detail && <p>{feedback.detail}</p>}
          </div>
        </div>
      )}
    </form>
  );
}
