export const TEACHER_ACTIVATED_EVENT = 'teacher.profile.activated';

export class TeacherActivatedEvent {
  constructor(
    public readonly userId: string,
    public readonly email: string,
    public readonly userName: string | null | undefined,
    public readonly publicPagePath: string | null | undefined,
  ) {}
}
