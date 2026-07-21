export const USER_INVITE_EVENT = 'user.invite';

export class UserInviteEvent {
  constructor(
    public readonly userId: string,
    public readonly email: string,
    public readonly userName: string | null | undefined,
    public readonly invitedByName?: string | null,
  ) {}
}
