import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback, Profile } from 'passport-google-oauth20';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor() {
    super({
      clientID: process.env.GOOGLE_CLIENT_ID || 'dummy',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || 'dummy',
      callbackURL:
        process.env.GOOGLE_CALLBACK_URL ||
        'http://localhost:3001/auth/google/callback',
      scope: ['email', 'profile'],
    });
  }

  validate(
    accessToken: string,
    refreshToken: string,
    profile: Profile,
    done: VerifyCallback,
  ): void {
    const { name, emails, id } = profile;
    const user = {
      provider: 'google' as const,
      providerId: id,
      email: emails?.[0]?.value ?? '',
      name: name
        ? `${name.givenName || ''} ${name.familyName || ''}`.trim()
        : 'Google User',
    };
    done(null, user);
  }

  authorizationParams(): { [key: string]: string } {
    return {
      prompt: 'select_account',
    };
  }
}
