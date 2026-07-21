export const SLIP_REVIEWED_EVENT = 'payment.slip.reviewed';

export class SlipReviewedEvent {
  constructor(
    public readonly email: string,
    public readonly userName: string | null | undefined,
    public readonly status: 'Approved' | 'Rejected',
    public readonly quizTitle?: string | null,
    public readonly note?: string | null,
  ) {}
}
