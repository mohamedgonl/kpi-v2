import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { Resend } from 'resend';
import { DatabaseService } from '../../database/database.service';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

@Injectable()
export class AuthService {
  private resend: Resend;

  constructor(
    private readonly jwtService: JwtService,
    private readonly databaseService: DatabaseService,
    private readonly configService: ConfigService,
  ) {
    const resendApiKey = this.configService.get<string>('RESEND_API_KEY');
    this.resend = new Resend(resendApiKey);
  }

  async login(loginDto: LoginDto) {
    const { email, password } = loginDto;
    
    // Find user by email
    const result = await this.databaseService.query(
      'SELECT id, email, full_name, role, password_hash, is_active FROM users WHERE email = $1 AND is_active = TRUE',
      [email]
    );
    
    const user = result.rows[0];
    if (!user) {
      throw new UnauthorizedException('Email hoặc mật khẩu không chính xác');
    }

    // Compare passwords
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Email hoặc mật khẩu không chính xác');
    }

    // Update last_login_at
    await this.databaseService.query(
      'UPDATE users SET last_login_at = NOW() WHERE id = $1',
      [user.id]
    );

    // Generate JWT
    const payload = { sub: user.id, role: user.role, email: user.email };
    const accessToken = this.jwtService.sign(payload);

    // Remove password_hash from response
    delete user.password_hash;

    return {
      access_token: accessToken,
      user,
    };
  }

  async forgotPassword(forgotPasswordDto: ForgotPasswordDto) {
    const { email } = forgotPasswordDto;
    
    // Find user
    const result = await this.databaseService.query(
      'SELECT id, full_name FROM users WHERE email = $1 AND is_active = TRUE',
      [email]
    );
    
    const user = result.rows[0];
    
    // Always return success even if user not found (prevent email enumeration)
    if (!user) {
      return { message: 'Nếu email tồn tại trong hệ thống, hướng dẫn khôi phục mật khẩu sẽ được gửi đến bạn.' };
    }

    // Generate secure random token
    const token = crypto.randomBytes(48).toString('hex');
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1); // 1 hour expiration

    // Save token to database
    await this.databaseService.query(
      'INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)',
      [user.id, token, expiresAt]
    );

    // Send email using Resend
    const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:4200';
    const resetLink = `${frontendUrl}/reset-password?token=${token}`;
    
    // Lấy thông tin email người gửi từ biến môi trường, mặc định dùng email test
    const fromEmail = this.configService.get<string>('RESEND_FROM_EMAIL') || 'KPI System <onboarding@resend.dev>';

    try {
      await this.resend.emails.send({
        from: fromEmail,
        to: email, // Resend free tier might restrict to verified domains only
        subject: 'Yêu cầu khôi phục mật khẩu Hệ thống KPI',
        html: `
          <h3>Xin chào ${user.full_name},</h3>
          <p>Bạn đã yêu cầu khôi phục mật khẩu cho tài khoản hệ thống KPI.</p>
          <p>Vui lòng click vào link dưới đây để đặt lại mật khẩu của bạn (link có hiệu lực trong 1 giờ):</p>
          <p><a href="${resetLink}">Đặt lại mật khẩu</a></p>
          <p>Nếu bạn không yêu cầu thao tác này, vui lòng bỏ qua email này.</p>
        `,
      });
    } catch (error) {
      console.error('Failed to send email:', error);
      // We don't throw here to avoid leaking whether email sending failed or email didn't exist
    }

    return { message: 'Nếu email tồn tại trong hệ thống, hướng dẫn khôi phục mật khẩu sẽ được gửi đến bạn.' };
  }

  async resetPassword(resetPasswordDto: ResetPasswordDto) {
    const { token, newPassword } = resetPasswordDto;
    
    // Validate token
    const result = await this.databaseService.query(
      'SELECT id, user_id, expires_at FROM password_reset_tokens WHERE token = $1 AND used_at IS NULL',
      [token]
    );
    
    const tokenRecord = result.rows[0];
    
    if (!tokenRecord) {
      throw new BadRequestException('Token không hợp lệ hoặc đã được sử dụng');
    }
    
    if (new Date() > new Date(tokenRecord.expires_at)) {
      throw new BadRequestException('Token đã hết hạn');
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    const client = await this.databaseService.getClient();
    
    try {
      await client.query('BEGIN');
      
      await client.query(
        'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
        [hashedPassword, tokenRecord.user_id]
      );
      
      await client.query(
        'UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1',
        [tokenRecord.id]
      );
      
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    return { message: 'Đổi mật khẩu thành công' };
  }

  async getProfile(userId: string) {
    const result = await this.databaseService.query(
      'SELECT id, employee_code, full_name, email, phone, position, role, avatar_url, created_at FROM users WHERE id = $1',
      [userId]
    );
    
    const user = result.rows[0];
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    
    return user;
  }
}
