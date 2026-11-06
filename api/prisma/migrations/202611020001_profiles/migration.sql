-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Profile" (
    "id" TEXT NOT NULL,
    "issuer" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "username" VARCHAR(30) NOT NULL,
    "displayName" VARCHAR(80) NOT NULL,
    "avatarUrl" VARCHAR(2048),
    "bio" VARCHAR(500) NOT NULL DEFAULT '',
    "links" JSONB NOT NULL DEFAULT '[]',
    "isPrivate" BOOLEAN NOT NULL DEFAULT false,
    "languages" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "country" CHAR(2),
    "interests" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "locale" VARCHAR(35) NOT NULL DEFAULT 'fr',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateBucket" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateBucket_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "Profile_username_key" ON "Profile"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Profile_issuer_subject_key" ON "Profile"("issuer", "subject");

-- CreateIndex
CREATE INDEX "RateBucket_expiresAt_idx" ON "RateBucket"("expiresAt");
