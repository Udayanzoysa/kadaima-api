export const TEACHER_PAYOUT_EVENT = 'teacher.payout.updated';

export type TeacherPayoutNotifyStatus = 'Pending' | 'Approved' | 'Paid' | 'Held';

export class TeacherPayoutEvent {
  constructor(
    public readonly email: string,
    public readonly userName: string | null | undefined,
    public readonly status: TeacherPayoutNotifyStatus,
    public readonly amountLkr: number,
    public readonly periodLabel: string,
    public readonly attemptCount?: number | null,
    public readonly reference?: string | null,
    public readonly currency: string = 'LKR',
  ) {}
}
