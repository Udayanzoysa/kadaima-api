export const USER_WELCOME_EVENT = 'user.welcome';

export type WelcomeAccountType = 'student' | 'teacher' | 'admin' | 'member';

export class UserWelcomeEvent {
  constructor(
    public readonly userId: string,
    public readonly email: string,
    public readonly userName: string | null | undefined,
    public readonly accountType: WelcomeAccountType,
  ) {}
}
