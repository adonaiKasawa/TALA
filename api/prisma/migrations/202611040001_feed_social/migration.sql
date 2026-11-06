-- AlterTable
ALTER TABLE "Video" ADD COLUMN     "hashtags" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "VideoReaction" (
    "profileId" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VideoReaction_pkey" PRIMARY KEY ("profileId","videoId","kind")
);

-- CreateTable
CREATE TABLE "CreatorRelation" (
    "fromId" TEXT NOT NULL,
    "toId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreatorRelation_pkey" PRIMARY KEY ("fromId","toId","kind")
);

-- CreateTable
CREATE TABLE "VideoComment" (
    "id" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "parentId" TEXT,
    "text" VARCHAR(1000) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VideoComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WatchSession" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "surface" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "watchedMs" INTEGER NOT NULL DEFAULT 0,
    "positionMs" INTEGER NOT NULL DEFAULT 0,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "replayCount" INTEGER NOT NULL DEFAULT 0,
    "lastEvent" TEXT NOT NULL DEFAULT 'impression',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WatchSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VideoCaption" (
    "videoId" TEXT NOT NULL,
    "language" VARCHAR(8) NOT NULL,
    "label" VARCHAR(60) NOT NULL,
    "content" TEXT NOT NULL,

    CONSTRAINT "VideoCaption_pkey" PRIMARY KEY ("videoId","language")
);

-- CreateIndex
CREATE INDEX "VideoReaction_videoId_kind_idx" ON "VideoReaction"("videoId", "kind");

-- CreateIndex
CREATE INDEX "CreatorRelation_toId_kind_idx" ON "CreatorRelation"("toId", "kind");

-- CreateIndex
CREATE INDEX "VideoComment_videoId_createdAt_id_idx" ON "VideoComment"("videoId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "WatchSession_profileId_updatedAt_id_idx" ON "WatchSession"("profileId", "updatedAt", "id");

-- CreateIndex
CREATE INDEX "WatchSession_createdAt_idx" ON "WatchSession"("createdAt");

-- AddForeignKey
ALTER TABLE "VideoReaction" ADD CONSTRAINT "VideoReaction_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoReaction" ADD CONSTRAINT "VideoReaction_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreatorRelation" ADD CONSTRAINT "CreatorRelation_fromId_fkey" FOREIGN KEY ("fromId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreatorRelation" ADD CONSTRAINT "CreatorRelation_toId_fkey" FOREIGN KEY ("toId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoComment" ADD CONSTRAINT "VideoComment_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoComment" ADD CONSTRAINT "VideoComment_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoComment" ADD CONSTRAINT "VideoComment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "VideoComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WatchSession" ADD CONSTRAINT "WatchSession_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WatchSession" ADD CONSTRAINT "WatchSession_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoCaption" ADD CONSTRAINT "VideoCaption_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Video" ALTER COLUMN "hashtags" SET NOT NULL;
CREATE INDEX "Video_hashtags_idx" ON "Video" USING GIN ("hashtags");
ALTER TABLE "VideoReaction" ADD CONSTRAINT "VideoReaction_kind_check" CHECK ("kind" IN ('like', 'save', 'not_interested'));
ALTER TABLE "CreatorRelation" ADD CONSTRAINT "CreatorRelation_kind_check" CHECK ("kind" IN ('follow', 'block', 'mute', 'restrict'));
ALTER TABLE "CreatorRelation" ADD CONSTRAINT "CreatorRelation_self_check" CHECK ("fromId" <> "toId");
UPDATE "Video" v SET "hashtags" = ARRAY(
  SELECT DISTINCT lower(m[1]) FROM regexp_matches(v."title" || ' ' || v."description", '#([[:alnum:]_]{1,60})', 'g') m LIMIT 30
) WHERE v."title" LIKE '%#%' OR v."description" LIKE '%#%';
