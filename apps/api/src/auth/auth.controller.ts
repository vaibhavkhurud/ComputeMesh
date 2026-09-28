import { Controller, Post, Body, Get, UseGuards, Req, HttpCode, HttpStatus, UsePipes, HttpException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto, LoginDto, RefreshDto, registerSchema, loginSchema, refreshSchema } from './dto/auth.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { Request } from 'express';
import { ZodValidationPipe } from '@computemesh/validation';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @UsePipes(new ZodValidationPipe(registerSchema))
  register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @HttpCode(HttpStatus.OK)
  @Post('login')
  @UsePipes(new ZodValidationPipe(loginSchema))
  login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  @UsePipes(new ZodValidationPipe(refreshSchema))
  refresh(@Body() refreshDto: RefreshDto) {
    return this.authService.refresh(refreshDto.refreshToken);
  }

  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @Post('logout')
  logout(@Req() req: Request) {
    const reqAny = req as any;
    const user = reqAny.user;
    if (!user || !user.sessionId || !user.sub) {
      throw new HttpException('Invalid session context', HttpStatus.UNAUTHORIZED);
    }
    return this.authService.logout(user.sessionId, user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  getProfile(@Req() req: Request) {
    const reqAny = req as any;
    return reqAny.user;
  }
}
