import { Controller } from '@nestjs/common';
import { Get, Post, Req, Res, Body } from '@nestjs/common';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { csrfToken, checkCsrf } from '../security/http-security.js';
import { page, form, input, escape } from '../interactions/pages.js';
import { ConfigService } from '../config/config.service.js';
import { CredentialsService } from './credentials.service.js';
import { OidcService } from '../oidc/oidc.service.js';
const email = z
  .email()
  .max(254)
  .transform((v) => v.toLowerCase());
const password = z.string().min(12).max(128);
const rawToken = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
@Controller('')
export class CredentialsController {
  constructor(
    private readonly config: ConfigService,
    private readonly credentials: CredentialsService,
    private readonly oidc: OidcService,
  ) {}
  private check(req: Request) {
    checkCsrf(req, this.config.value);
  }
  private csrf(req: Request, res: Response) {
    return csrfToken(req, res, this.config.value);
  }
  private async member(req: Request, admin = false) {
    if (
      !req.headers.authorization?.startsWith('Bearer ') &&
      !['GET', 'HEAD'].includes(req.method)
    )
      this.check(req);
    return this.oidc.authenticate(req, admin);
  }
  @Get('forgot-password') forgot(@Req() req: Request, @Res() res: Response) {
    res
      .type('html')
      .send(
        page(
          'Récupérer mon compte',
          form(
            '/account/password/request',
            this.csrf(req, res),
            input('email', 'Email', 'email'),
            'Envoyer le lien',
          ),
        ),
      );
  }
  @Post('account/password/request') resetRequest(
    @Req() req: Request,
    @Body() body: unknown,
  ) {
    this.check(req);
    return this.credentials.requestAction(
      z.object({ email }).parse(body).email,
      'reset',
    );
  }
  @Post('account/email/request') verifyRequest(
    @Req() req: Request,
    @Body() body: unknown,
  ) {
    this.check(req);
    return this.credentials.requestAction(
      z.object({ email }).parse(body).email,
      'verify',
    );
  }
  @Get('verify-email') verifyPage(@Req() req: Request, @Res() res: Response) {
    const value = rawToken.parse(req.query.token);
    res
      .type('html')
      .send(
        page(
          'Vérifier mon email',
          form(
            '/account/email/confirm',
            this.csrf(req, res),
            `<input type="hidden" name="token" value="${escape(value)}">`,
            'Vérifier mon adresse',
          ),
        ),
      );
  }
  @Get('reset-password') resetPage(@Req() req: Request, @Res() res: Response) {
    const value = rawToken.parse(req.query.token);
    res
      .type('html')
      .send(
        page(
          'Nouveau mot de passe',
          form(
            '/account/password/reset',
            this.csrf(req, res),
            `<input type="hidden" name="token" value="${escape(value)}">` +
              input('password', 'Nouveau mot de passe', 'password'),
            'Changer mon mot de passe',
          ),
        ),
      );
  }
  @Post('account/email/confirm') verifyEmail(
    @Req() req: Request,
    @Body() body: unknown,
  ) {
    this.check(req);
    return this.credentials.confirmAction(
      z.object({ token: rawToken }).parse(body).token,
      'verify',
    );
  }
  @Post('account/password/reset') resetPassword(
    @Req() req: Request,
    @Body() body: unknown,
  ) {
    this.check(req);
    const data = z.object({ token: rawToken, password }).parse(body);
    return this.credentials.confirmAction(data.token, 'reset', data.password);
  }
  @Post('account/password/change') async change(
    @Req() req: Request,
    @Body() body: unknown,
  ) {
    const { user, payload } = await this.member(req);
    const data = z
      .object({ currentPassword: z.string().max(128).optional(), password })
      .parse(body);
    return this.credentials.changePassword(
      user,
      data.currentPassword,
      data.password,
      payload,
    );
  }
  @Post('account/reauthenticate') async reauthenticate(
    @Req() req: Request,
    @Body() body: unknown,
  ) {
    const { user, payload } = await this.member(req);
    await this.credentials.recent(
      user,
      z.object({ password: z.string().max(128).optional() }).parse(body)
        .password,
      payload,
    );
    return { message: 'Identité confirmée.' };
  }
}
