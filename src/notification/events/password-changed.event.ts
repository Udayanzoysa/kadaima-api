export const PASSWORD_CHANGED_EVENT = 'password.changed';

export type PasswordChangedReason = 'changed' | 'reset';

export class PasswordChangedEvent {
  constructor(
    public readonly userId: string,
    public readonly email: string,
    public readonly userName: string | null | undefined,
    public readonly reason: PasswordChangedReason,
  ) {}
}
