import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Database } from '../database/database.service.js';
import type { Principal } from '../auth/auth.metadata.js';
import type { Profile } from '../generated/prisma/client.js';
import type { CreateProfile, UpdateProfile } from './profile.schema.js';

@Injectable()
export class ProfilesService {
  constructor(private readonly db: Database) {}

  private identity(actor: Principal) {
    return { issuer: actor.issuer, subject: actor.subject };
  }
  private own(profile: Profile) {
    return {
      id: profile.id,
      username: profile.username,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl,
      bio: profile.bio,
      links: profile.links,
      isPrivate: profile.isPrivate,
      preferences: {
        languages: profile.languages,
        country: profile.country,
        interests: profile.interests,
        locale: profile.locale,
      },
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
    };
  }
  private conflict(error: unknown): never {
    if ((error as { code?: string }).code === 'P2002')
      throw new ConflictException(
        'Un profil existe deja pour ce compte ou ce pseudonyme est indisponible.',
      );
    if ((error as { code?: string }).code === 'P2025')
      throw new NotFoundException('Profil introuvable.');
    throw error;
  }
  async me(actor: Principal) {
    const profile = await this.db.profile.findUnique({
      where: { issuer_subject: this.identity(actor) },
    });
    if (!profile)
      throw new NotFoundException('Complete ton profil pour continuer.');
    return this.own(profile);
  }
  async create(actor: Principal, data: CreateProfile) {
    try {
      const profile = await this.db.profile.create({
        data: { ...data, ...this.identity(actor) },
      });
      return this.own(profile);
    } catch (error) {
      return this.conflict(error);
    }
  }
  async update(actor: Principal, data: UpdateProfile) {
    try {
      const profile = await this.db.profile.update({
        where: { issuer_subject: this.identity(actor) },
        data,
      });
      return this.own(profile);
    } catch (error) {
      return this.conflict(error);
    }
  }
  async remove(actor: Principal) {
    // This deletes the business profile, not the credentials owned by the AuthServer.
    await this.db.$transaction([
      this.db.video.updateMany({
        where: { ...this.identity(actor), status: { not: 'deleted' } },
        data: { status: 'deleted', publishedAt: null },
      }),
      this.db.videoReaction.deleteMany({
        where: { video: this.identity(actor) },
      }),
      this.db.videoComment.deleteMany({
        where: { video: this.identity(actor) },
      }),
      this.db.videoCaption.deleteMany({
        where: { video: this.identity(actor) },
      }),
      this.db.watchSession.deleteMany({
        where: { video: this.identity(actor) },
      }),
      this.db.profile.deleteMany({ where: this.identity(actor) }),
    ]);
    return { message: 'Profil supprime.' };
  }
  async byUsername(username: string, actor?: Principal) {
    const profile = await this.db.profile.findUnique({ where: { username } });
    if (!profile) throw new NotFoundException('Profil introuvable.');
    if (profile.suspended) throw new NotFoundException('Profil indisponible.');
    const owner =
      actor?.issuer === profile.issuer && actor?.subject === profile.subject;
    if (actor && !owner) {
      const viewer = await this.db.profile.findUnique({
        where: { issuer_subject: this.identity(actor) },
      });
      if (
        viewer &&
        (await this.db.creatorRelation.count({
          where: {
            kind: 'block',
            OR: [
              { fromId: viewer.id, toId: profile.id },
              { fromId: profile.id, toId: viewer.id },
            ],
          },
        }))
      )
        throw new NotFoundException('Profil indisponible.');
    }
    if (owner) return this.own(profile);
    const summary = {
      id: profile.id,
      username: profile.username,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl,
      isPrivate: profile.isPrivate,
      verified: !!profile.verifiedAt,
    };
    const follower = actor
      ? await this.db.creatorRelation.count({
          where: {
            toId: profile.id,
            kind: 'follow',
            from: this.identity(actor),
          },
        })
      : 0;
    return profile.isPrivate && !follower
      ? summary
      : { ...summary, bio: profile.bio, links: profile.links };
  }
}
