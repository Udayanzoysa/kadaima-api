import { Controller, Post, Body, UseGuards, Req } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { RegisterAccountDto } from './dto/register-account.dto';
import { LoginDto } from './dto/login.dto';
import { Verify2FaDto } from './dto/verify-2fa.dto';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';

@ApiTags('Identity & Access Management')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('register')
  @ApiOperation({
    summary: 'Onboards a new Tenant Workspace alongside its Admin Account',
  })
  @ApiResponse({
    status: 201,
    description:
      'Workspace and master database profile generated successfully.',
  })
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('register/student')
  @ApiOperation({ summary: 'Register a student account in the default LMS workspace' })
  registerStudent(@Body() dto: RegisterAccountDto) {
    return this.authService.registerStudent(dto);
  }

  @Post('register/teacher')
  @ApiOperation({ summary: 'Register a teacher account with quiz management access' })
  registerTeacher(@Body() dto: RegisterAccountDto) {
    return this.authService.registerTeacher(dto);
  }

  @Post('login')
  @ApiOperation({ summary: 'Standard baseline user login endpoint' })
  @ApiResponse({
    status: 200,
    description:
      'Returns either system API session payload or steps into 2FA challenge mode.',
  })
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('2fa/verify')
  @UseGuards(AuthGuard('jwt-pre-auth')) // Validates ONLY the short-lived '2fa_pending' signature
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Submits the 6-digit TOTP token to clear pending 2FA challenges',
  })
  async verify2Fa(@Req() req: any, @Body() dto: Verify2FaDto) {
    return this.authService.verifyTwoFactor(req.user.sub, dto.token);
  }
}
