import { Controller, Get, Post, Patch, Body, UseGuards, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService, AuthRequestMeta } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { RegisterAccountDto } from './dto/register-account.dto';
import { LoginDto } from './dto/login.dto';
import { GoogleAuthDto } from './dto/google-auth.dto';
import { Verify2FaDto } from './dto/verify-2fa.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ValidateResetTokenDto } from './dto/validate-reset-token.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@ApiTags('Identity & Access Management')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  private requestMeta(req: any): AuthRequestMeta {
    const forwarded = req.headers?.['x-forwarded-for'];
    const ip =
      typeof forwarded === 'string' && forwarded.length > 0
        ? forwarded.split(',')[0].trim()
        : req.ip ?? req.socket?.remoteAddress ?? null;
    return { ip, userAgent: req.headers?.['user-agent'] ?? null };
  }

  @Post('register')
  @ApiOperation({
    summary: 'Onboards a new Tenant Workspace alongside its Admin Account',
  })
  @ApiResponse({
    status: 201,
    description:
      'Workspace and master database profile generated successfully.',
  })
  async register(@Body() dto: RegisterDto, @Req() req: any) {
    return this.authService.register(dto, this.requestMeta(req));
  }

  @Post('register/student')
  @ApiOperation({ summary: 'Register a student account in the default LMS workspace' })
  registerStudent(@Body() dto: RegisterAccountDto, @Req() req: any) {
    return this.authService.registerStudent(dto, this.requestMeta(req));
  }

  @Post('register/teacher')
  @ApiOperation({ summary: 'Register a teacher account with quiz management access' })
  registerTeacher(@Body() dto: RegisterAccountDto, @Req() req: any) {
    return this.authService.registerTeacher(dto, this.requestMeta(req));
  }

  @Post('login')
  @ApiOperation({ summary: 'Standard baseline user login endpoint' })
  @ApiResponse({
    status: 200,
    description:
      'Returns either system API session payload or steps into 2FA challenge mode.',
  })
  async login(@Body() dto: LoginDto, @Req() req: any) {
    return this.authService.login(dto, this.requestMeta(req));
  }

  @Post('google')
  @Throttle({ default: { limit: 20, ttl: 900_000 } })
  @ApiOperation({
    summary: 'Sign in or register with a Google ID token (GIS)',
  })
  @ApiResponse({
    status: 200,
    description: 'Returns accessToken, or requires2FA like email login.',
  })
  loginWithGoogle(@Body() dto: GoogleAuthDto, @Req() req: any) {
    return this.authService.loginWithGoogle(dto, this.requestMeta(req));
  }

  @Post('forgot-password')
  @Throttle({ default: { limit: 5, ttl: 900_000 } })
  @ApiOperation({
    summary: 'Request a password reset code via email or SMS (anti-enumeration)',
  })
  @ApiResponse({
    status: 200,
    description: 'Always returns a generic success message.',
  })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Post('validate-reset-token')
  @Throttle({ default: { limit: 20, ttl: 900_000 } })
  @ApiOperation({
    summary: 'Validate a password-reset link/code without consuming it',
  })
  validateResetToken(@Body() dto: ValidateResetTokenDto) {
    return this.authService.validateResetToken(dto);
  }

  @Post('reset-password')
  @Throttle({ default: { limit: 10, ttl: 900_000 } })
  @ApiOperation({ summary: 'Verify OTP/link token and set a new password' })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @Post('2fa/verify')
  @UseGuards(AuthGuard('jwt-pre-auth')) // Validates ONLY the short-lived '2fa_pending' signature
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Submits the 6-digit TOTP token to clear pending 2FA challenges',
  })
  async verify2Fa(@Req() req: any, @Body() dto: Verify2FaDto) {
    return this.authService.verifyTwoFactor(req.user.sub, dto.token, this.requestMeta(req));
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Validate session and return the current user profile' })
  getMe(@Req() req: any) {
    return this.authService.getMe(req.user.id);
  }

  @Patch('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update the current user profile (name / phone / school)' })
  updateMe(@Req() req: any, @Body() dto: UpdateProfileDto) {
    return this.authService.updateProfile(req.user.id, dto);
  }

  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Change the current user password (requires current password)' })
  changePassword(@Req() req: any, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(req.user.id, dto);
  }
}
