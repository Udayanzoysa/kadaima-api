import { createHash, randomUUID } from 'crypto';

export function md5Upper(value: string): string {
  return createHash('md5').update(value, 'utf8').digest('hex').toUpperCase();
}

/** PayHere checkout hash: merchant_id + order_id + amount + currency + MD5(secret) */
export function payhereCheckoutHash(params: {
  merchantId: string;
  orderId: string;
  amount: string;
  currency: string;
  merchantSecret: string;
}): string {
  const secretHash = md5Upper(params.merchantSecret);
  return md5Upper(
    `${params.merchantId}${params.orderId}${params.amount}${params.currency}${secretHash}`,
  );
}

/** PayHere notify signature verification */
export function payhereNotifyHash(params: {
  merchantId: string;
  orderId: string;
  amount: string;
  currency: string;
  statusCode: string;
  merchantSecret: string;
}): string {
  const secretHash = md5Upper(params.merchantSecret);
  return md5Upper(
    `${params.merchantId}${params.orderId}${params.amount}${params.currency}${params.statusCode}${secretHash}`,
  );
}

export function formatPayHereAmount(amount: number | string): string {
  const n = typeof amount === 'string' ? Number(amount) : amount;
  if (!Number.isFinite(n)) return '0.00';
  return n.toFixed(2);
}

export function newPayHereOrderId(quizId: string): string {
  const short = quizId.replace(/-/g, '').slice(0, 8);
  return `QZ${short}${Date.now().toString(36)}${randomUUID().replace(/-/g, '').slice(0, 6)}`.slice(
    0,
    64,
  );
}

export function newSubscriptionOrderId(): string {
  return `SUB${Date.now().toString(36)}${randomUUID().replace(/-/g, '').slice(0, 10)}`.slice(
    0,
    64,
  );
}
