-- CreateEnum
CREATE TYPE "VideoStatus" AS ENUM ('draft', 'uploading', 'queued', 'analyzing', 'optimizing', 'transferring', 'mux_processing', 'ready', 'published', 'failed', 'rejected', 'deleted');

-- CreateEnum
CREATE TYPE "VideoVisibility" AS ENUM ('public', 'unlisted', 'private');

-- CreateTable
CREATE TABLE "Video" (
    "id" TEXT NOT NULL,
    "issuer" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "profileId" TEXT,
    "title" VARCHAR(140) NOT NULL,
    "description" VARCHAR(5000) NOT NULL DEFAULT '',
    "visibility" "VideoVisibility" NOT NULL DEFAULT 'private',
    "kind" TEXT NOT NULL DEFAULT 'short',
    "status" "VideoStatus" NOT NULL DEFAULT 'draft',
    "driver" TEXT NOT NULL,
    "isTest" BOOLEAN NOT NULL DEFAULT false,
    "expectedBytes" INTEGER NOT NULL,
    "uploadedBytes" INTEGER NOT NULL DEFAULT 0,
    "sourceHash" TEXT,
    "sourceBytes" INTEGER,
    "preparedBytes" INTEGER,
    "duration" DOUBLE PRECISION,
    "width" INTEGER,
    "height" INTEGER,
    "fps" DOUBLE PRECISION,
    "optimization" TEXT,
    "qualityScore" DOUBLE PRECISION,
    "thumbnailTime" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "thumbnailPending" BOOLEAN NOT NULL DEFAULT true,
    "errorCode" TEXT,
    "generation" INTEGER NOT NULL DEFAULT 1,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3),
    "leaseId" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "muxAttempt" TEXT NOT NULL,
    "muxCreationStarted" BOOLEAN NOT NULL DEFAULT false,
    "muxUploadId" TEXT,
    "muxAssetId" TEXT,
    "muxPlaybackId" TEXT,
    "uploadedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "temporaryCleanedAt" TIMESTAMP(3),
    "deletedCleanedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Video_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VideoWebhook" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VideoWebhook_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Video_muxAttempt_key" ON "Video"("muxAttempt");

-- CreateIndex
CREATE UNIQUE INDEX "Video_muxUploadId_key" ON "Video"("muxUploadId");

-- CreateIndex
CREATE UNIQUE INDEX "Video_muxAssetId_key" ON "Video"("muxAssetId");

-- CreateIndex
CREATE INDEX "Video_issuer_subject_createdAt_idx" ON "Video"("issuer", "subject", "createdAt");

-- CreateIndex
CREATE INDEX "Video_status_leaseUntil_idx" ON "Video"("status", "leaseUntil");

-- CreateIndex
CREATE INDEX "Video_visibility_status_publishedAt_idx" ON "Video"("visibility", "status", "publishedAt");

-- CreateIndex
CREATE INDEX "VideoWebhook_createdAt_idx" ON "VideoWebhook"("createdAt");

-- AddForeignKey
ALTER TABLE "Video" ADD CONSTRAINT "Video_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
