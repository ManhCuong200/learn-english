import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, Profile } from 'passport-facebook';

@Injectable()
export class FacebookStrategy extends PassportStrategy(Strategy, 'facebook') {
  constructor() {
    super({
      clientID: process.env.FACEBOOK_APP_ID || 'dummy',
      clientSecret: process.env.FACEBOOK_APP_SECRET || 'dummy',
      callbackURL:
        process.env.FACEBOOK_CALLBACK_URL ||
        'http://localhost:3001/auth/facebook/callback',
      scope: ['email', 'public_profile'],
      profileFields: ['id', 'emails', 'name', 'displayName'],
    });
  }

  validate(
    accessToken: string,
    refreshToken: string,
    profile: Profile,
    done: (error: any, user: any, info?: any) => void,
  ): void {
    const { id, emails, name, displayName } = profile;

    let userEmail = '';
    if (emails && emails.length > 0) {
      userEmail = emails[0].value;
    }

    let userName = displayName || 'Facebook User';
    if (!displayName && name) {
      userName = `${name.givenName || ''} ${name.familyName || ''}`.trim();
    }

    const user = {
      provider: 'facebook',
      providerId: id,
      email: userEmail,
      name: userName,
    };

    done(null, user);
  }
}
