export const PAYMENT_PAID_EVENT = 'payment.paid';

export class PaymentPaidEvent {
  constructor(
    public readonly email: string,
    public readonly userName: string | null | undefined,
    public readonly purpose: string,
    public readonly amountLkr: number,
    public readonly orderId: string,
    public readonly quizTitle?: string | null,
    public readonly currency: string = 'LKR',
  ) {}
}
