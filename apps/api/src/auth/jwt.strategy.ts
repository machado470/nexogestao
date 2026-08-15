import { Injectable } from '@nestjs/common'
import { PassportStrategy } from '@nestjs/passport'
import { ExtractJwt, Strategy } from 'passport-jwt'
import { ConfigService } from '@nestjs/config'
import { resolveJwtSecret } from './jwt-secret'

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: resolveJwtSecret(config),
    })
  }

  async validate(payload: any) {
    return {
      sub: payload.sub,          // ✅ compat com MeController
      userId: payload.sub,       // ✅ compat futura
      role: payload.role,
      orgId: payload.orgId,
      personId: payload.personId ?? null,
    }
  }
}
