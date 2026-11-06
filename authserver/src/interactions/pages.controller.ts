import { Controller } from '@nestjs/common';
import { Get, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { csrfToken } from '../security/http-security.js';
import { page, css, form, input, escape } from './pages.js';
import { ConfigService } from '../config/config.service.js';

@Controller('')
export class PagesController {
  constructor(private readonly config: ConfigService) {}
  private csrf(req: Request, res: Response) {
    return csrfToken(req, res, this.config.value);
  }
  @Get('identity.css') stylesheet(@Res() res: Response) {
    res.type('css').send(css);
  }
  @Get('account/csrf') csrfEndpoint(@Req() req: Request, @Res() res: Response) {
    res.json({ csrf: this.csrf(req, res) });
  }
  @Get('verify-email/request') verifyRequest(
    @Req() req: Request,
    @Res() res: Response,
  ) {
    res
      .type('html')
      .send(
        page(
          'Vérifier votre adresse email',
          form(
            '/account/email/request',
            this.csrf(req, res),
            input('email', 'Votre adresse email', 'email'),
            'Renvoyer le lien de vérification',
          ),
        ),
      );
  }
  @Get() home(@Req() req: Request, @Res() res: Response) {
    this.csrf(req, res);
    res
      .type('html')
      .send(
        page(
          'Votre compte TALA',
          `<p>Un seul compte pour retrouver votre espace sur le web et sur mobile.</p><nav><a class="button" href="${escape(this.config.value.AUTH_WEB_ORIGIN)}">Ouvrir mon espace</a><a href="/register">Créer un compte</a><a href="/forgot-password">Mot de passe oublié</a><a href="/verify-email/request">Vérifier mon email</a></nav>`,
        ),
      );
  }
}
