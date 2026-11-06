-- AlterTable
ALTER TABLE "Profile" ADD COLUMN     "discoveryResetAt" TIMESTAMP(3),
ADD COLUMN     "suspended" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "verifiedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Video" ADD COLUMN     "allowDownload" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "category" VARCHAR(60) NOT NULL DEFAULT '',
ADD COLUMN     "challengeId" TEXT,
ADD COLUMN     "country" CHAR(2),
ADD COLUMN     "language" VARCHAR(35) NOT NULL DEFAULT 'und',
ADD COLUMN     "pinnedRank" INTEGER,
ADD COLUMN     "replyToCommentId" TEXT,
ADD COLUMN     "soundId" TEXT,
ADD COLUMN     "trial" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "VideoComment" ADD COLUMN     "pinned" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "WatchSession" ADD COLUMN     "features" JSONB;

-- CreateTable
CREATE TABLE "AccountState" (
    "issuer" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'viewer',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "sequence" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "AccountState_pkey" PRIMARY KEY ("issuer","subject")
);

-- CreateTable
CREATE TABLE "IdentitySync" (
    "issuer" TEXT NOT NULL,
    "sequence" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "IdentitySync_pkey" PRIMARY KEY ("issuer")
);

-- CreateTable
CREATE TABLE "Collection" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "videos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Collection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Repost" (
    "profileId" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Repost_pkey" PRIMARY KEY ("profileId","videoId")
);

-- CreateTable
CREATE TABLE "CommentLike" (
    "profileId" TEXT NOT NULL,
    "commentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommentLike_pkey" PRIMARY KEY ("profileId","commentId")
);

-- CreateTable
CREATE TABLE "VerificationRequest" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "reason" VARCHAR(2000) NOT NULL,
    "proofUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reviewReason" TEXT,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VerificationRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sound" (
    "id" TEXT NOT NULL,
    "label" VARCHAR(120) NOT NULL,
    "creatorSubject" TEXT NOT NULL,
    "creatorIssuer" TEXT NOT NULL,
    "reuseAllowed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Sound_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Challenge" (
    "id" TEXT NOT NULL,
    "slug" VARCHAR(60) NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "description" VARCHAR(2000) NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Challenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedSnapshot" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "videos" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeedSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecommendationModel" (
    "id" TEXT NOT NULL,
    "weights" JSONB NOT NULL,
    "metrics" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "trainedUntil" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecommendationModel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessAudit" (
    "id" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "detail" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BusinessAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Collection_profileId_name_key" ON "Collection"("profileId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationRequest_profileId_key" ON "VerificationRequest"("profileId");

-- CreateIndex
CREATE UNIQUE INDEX "Challenge_slug_key" ON "Challenge"("slug");

-- CreateIndex
CREATE INDEX "FeedSnapshot_expiresAt_idx" ON "FeedSnapshot"("expiresAt");

-- CreateIndex
CREATE INDEX "Video_language_category_country_publishedAt_idx" ON "Video"("language", "category", "country", "publishedAt");

-- AddForeignKey
ALTER TABLE "Video" ADD CONSTRAINT "Video_soundId_fkey" FOREIGN KEY ("soundId") REFERENCES "Sound"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Video" ADD CONSTRAINT "Video_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "Challenge"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Video" ADD CONSTRAINT "Video_replyToCommentId_fkey" FOREIGN KEY ("replyToCommentId") REFERENCES "VideoComment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Collection" ADD CONSTRAINT "Collection_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Repost" ADD CONSTRAINT "Repost_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Repost" ADD CONSTRAINT "Repost_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommentLike" ADD CONSTRAINT "CommentLike_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommentLike" ADD CONSTRAINT "CommentLike_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "VideoComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationRequest" ADD CONSTRAINT "VerificationRequest_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedSnapshot" ADD CONSTRAINT "FeedSnapshot_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Extend the existing relation policy without modifying an applied migration.
ALTER TABLE "CreatorRelation" DROP CONSTRAINT "CreatorRelation_kind_check";
ALTER TABLE "CreatorRelation" ADD CONSTRAINT "CreatorRelation_kind_check" CHECK ("kind" IN ('follow', 'follow_request', 'block', 'mute', 'restrict'));
CREATE UNIQUE INDEX "Video_one_pin_rank" ON "Video"("profileId", "pinnedRank") WHERE "pinnedRank" IS NOT NULL;
CREATE UNIQUE INDEX "VideoComment_one_pin" ON "VideoComment"("videoId") WHERE "pinned" = true;
ALTER TABLE "Video" ADD CONSTRAINT "Video_pin_rank_check" CHECK ("pinnedRank" IS NULL OR "pinnedRank" BETWEEN 1 AND 3);
CREATE UNIQUE INDEX "RecommendationModel_one_active" ON "RecommendationModel" ("active") WHERE "active" = true;
