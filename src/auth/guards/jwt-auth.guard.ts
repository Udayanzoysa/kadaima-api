import {
  Injectable,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext) {
    return super.canActivate(context);
  }

  handleRequest(err: any, user: any, info: any) {
    if (err || !user)
      throw new UnauthorizedException('Valid authorization session required.');

    // Explicitly reject users inside the 2FA onboarding limbo
    if (user.scope === '2fa_pending') {
      throw new UnauthorizedException(
        'Two-Factor Verification step must be solved first.',
      );
    }
    return user;
  }
}
