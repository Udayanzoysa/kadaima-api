import { SetMetadata } from '@nestjs/common';
import { Action, Subject } from '@prisma/client';

export interface PolicyHandler {
  action: Action;
  subject: Subject;
}

export const CHECK_POLICIES_KEY = 'check_policies';
export const CheckPolicies = (...handlers: PolicyHandler[]) =>
  SetMetadata(CHECK_POLICIES_KEY, handlers);
