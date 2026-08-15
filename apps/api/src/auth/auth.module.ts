import { Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { PassportModule } from '@nestjs/passport'
import { ConfigModule, ConfigService } from '@nestjs/config'

import { PrismaModule } from '../prisma/prisma.module'
import { AnalyticsModule } from '../analytics/analytics.module'

import { AuthService } from './auth.service'
import { AuthController } from './auth.controller'
import { JwtStrategy } from './jwt.strategy'
import { GoogleStrategy } from './google.strategy'
import { resolveJwtSecret } from './jwt-secret'

export const createJwtModuleOptions = (config: ConfigService) => ({
  secret: resolveJwtSecret(config),
  signOptions: { expiresIn: config.get('JWT_EXPIRES_IN') || '7d' },
})

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    AnalyticsModule,
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: createJwtModuleOptions,
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, GoogleStrategy],
  exports: [AuthService],
})
export class AuthModule {}
