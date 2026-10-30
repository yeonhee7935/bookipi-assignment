import { ApiError, type Api, type PurchaseResult } from './api';
import { formatTime } from './time';

export interface Feedback {
  tone: 'success' | 'info' | 'error';
  title: string;
  detail?: string;
  /** Seconds before the user should try again (server asked us to back off). */
  retryAfter?: number;
  /** Whether the user now owns an item. Drives UI state; never derived from the display text. */
  owned?: boolean;
}

const DEFAULT_RETRY_AFTER = 2;

const resultFeedback: Record<PurchaseResult, Feedback> = {
  SUCCESS: { tone: 'success', title: "You're in!", detail: 'Your lifetime seat is secured.', owned: true },
  ALREADY_PURCHASED: {
    tone: 'info',
    title: 'Already yours',
    detail: 'This account already holds a lifetime seat. One per account.',
    owned: true,
  },
  SOLD_OUT: { tone: 'error', title: 'Sold out', detail: 'Every seat has been claimed.' },
  NOT_STARTED: { tone: 'info', title: 'Not open yet', detail: 'The drop has not started.' },
  ENDED: { tone: 'error', title: 'Drop ended', detail: 'The sale window has closed.' },
  NO_SALE: { tone: 'info', title: 'No drop scheduled', detail: 'There is no sale to join right now.' },
};

function purchasedFeedback(purchasedAt: string | null): Feedback {
  const at = purchasedAt ? ` at ${formatTime(new Date(purchasedAt))}` : '';
  return { tone: 'success', title: 'Seat confirmed', detail: `Your lifetime seat was secured${at}.`, owned: true };
}

/**
 * Attempts a purchase. If the outcome is unknown (network error, 5xx), the request may
 * still have gone through — e.g. the server committed the reservation and died before
 * answering. Purchases are idempotent per user, so instead of guessing we ask the
 * source of truth whether this user now owns an item.
 */
export async function attemptPurchase(api: Api, userId: string): Promise<Feedback> {
  try {
    return resultFeedback[(await api.purchase(userId)).result];
  } catch (error) {
    if (error instanceof ApiError && error.status === 400) {
      return { tone: 'error', title: 'Invalid user ID', detail: 'Use letters, numbers and . _ @ + - only.' };
    }
    const lookup = await api.getPurchase(userId).catch(() => null);
    if (lookup?.purchased) return purchasedFeedback(lookup.purchasedAt);

    const retryAfter = (error instanceof ApiError && error.retryAfter) || DEFAULT_RETRY_AFTER;
    return { tone: 'error', title: 'High demand', detail: 'We could not complete your request. Please try again.', retryAfter };
  }
}

export async function checkPurchase(api: Api, userId: string): Promise<Feedback> {
  try {
    const { purchased, purchasedAt } = await api.getPurchase(userId);
    return purchased
      ? purchasedFeedback(purchasedAt)
      : { tone: 'info', title: 'No order found', detail: `There is no purchase for “${userId}”.`, owned: false };
  } catch {
    return { tone: 'error', title: 'Could not check', detail: 'Please try again in a moment.', retryAfter: DEFAULT_RETRY_AFTER };
  }
}
