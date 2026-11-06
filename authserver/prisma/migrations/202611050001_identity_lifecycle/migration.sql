-- AlterTable
ALTER TABLE "User" ADD COLUMN     "phone" TEXT;
-- Preserve the publishing capabilities of legacy accounts; new accounts start as viewers.
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'viewer';
UPDATE "User" SET "role" = 'creator' WHERE "role" = 'user';

-- CreateTable
CREATE TABLE "IdentityEvent" (
    "sequence" BIGSERIAL NOT NULL,
    "subject" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdentityEvent_pkey" PRIMARY KEY ("sequence")
);

-- CreateTable
CREATE TABLE "PhoneChallenge" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "delivery" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "PhoneChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PhoneChallenge_expiresAt_idx" ON "PhoneChallenge"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- Bootstrap existing account states for the first API consumer.
INSERT INTO "IdentityEvent" ("subject", "kind", "role", "active")
SELECT "id", 'state', "role", "active" FROM "User" ORDER BY "createdAt", "id";
