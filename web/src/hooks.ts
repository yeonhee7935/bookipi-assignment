import { useEffect, useState } from 'react';
import { ApiError, api, type Sale } from './api';

/**
 * Polls the sale status. Also tracks the offset between the server clock and this
 * device, so countdowns flip at the server's moment even if the device clock is off.
 */
export function useSale(pollMs = 2000) {
  const [sale, setSale] = useState<Sale | null>(null);
  const [clockOffset, setClockOffset] = useState(0);
  const [error, setError] = useState<'unreachable' | 'no_sale' | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const s = await api.getSale();
        if (cancelled) return;
        setSale(s);
        setClockOffset(Date.parse(s.serverTime) - Date.now());
        setError(null);
      } catch (e) {
        if (cancelled) return;
        const noSale = e instanceof ApiError && e.status === 404;
        if (noSale) setSale(null);
        setError(noSale ? 'no_sale' : 'unreachable');
      }
    };
    load();
    const id = setInterval(load, pollMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [pollMs]);

  return { sale, clockOffset, error };
}

/** Current time on the server's clock, re-rendering every second. */
export function useServerNow(clockOffset: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return now + clockOffset;
}
