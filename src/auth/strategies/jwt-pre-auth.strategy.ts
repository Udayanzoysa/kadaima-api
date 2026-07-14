import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';

@Injectable()
export class JwtPreAuthStrategy extends PassportStrategy(
  Strategy,
  'jwt-pre-auth',
) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'fallback-secret', // Replace with environment variable in production
    });
  }

  async validate(payload: any) {
    if (payload.scope !== '2fa_pending') {
      throw new UnauthorizedException('Token is not a valid pre-auth token');
    }
    return { sub: payload.sub, scope: payload.scope };
  }
}
