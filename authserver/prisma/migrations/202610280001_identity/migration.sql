-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "role" TEXT NOT NULL DEFAULT 'user',
    "mfaSecret" TEXT,
    "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "mfaCounter" BIGINT NOT NULL DEFAULT 0,
    "recoveryCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountAction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalIdentity" (
    "provider" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "ExternalIdentity_pkey" PRIMARY KEY ("provider","subject")
);

-- CreateTable
CREATE TABLE "OidcArtifact" (
    "model" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "accountId" TEXT,
    "grantId" TEXT,
    "sessionUid" TEXT,
    "uid" TEXT,
    "userCode" TEXT,
    "expiresAt" TIMESTAMP(3),
    "consumedAt" TIMESTAMP(3),

    CONSTRAINT "OidcArtifact_pkey" PRIMARY KEY ("model","id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "event" TEXT NOT NULL,
    "detail" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateBucket" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateBucket_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "Mail" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "content" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Mail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FederationAttempt" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FederationAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "AccountAction_expiresAt_idx" ON "AccountAction"("expiresAt");

-- CreateIndex
CREATE INDEX "OidcArtifact_accountId_model_idx" ON "OidcArtifact"("accountId", "model");

-- CreateIndex
CREATE INDEX "OidcArtifact_grantId_idx" ON "OidcArtifact"("grantId");

-- CreateIndex
CREATE INDEX "OidcArtifact_sessionUid_idx" ON "OidcArtifact"("sessionUid");

-- CreateIndex
CREATE INDEX "OidcArtifact_uid_idx" ON "OidcArtifact"("uid");

-- CreateIndex
CREATE INDEX "OidcArtifact_userCode_idx" ON "OidcArtifact"("userCode");

-- CreateIndex
CREATE INDEX "OidcArtifact_expiresAt_idx" ON "OidcArtifact"("expiresAt");

-- CreateIndex
CREATE INDEX "AuditEvent_userId_createdAt_idx" ON "AuditEvent"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_createdAt_idx" ON "AuditEvent"("createdAt");

-- CreateIndex
CREATE INDEX "RateBucket_expiresAt_idx" ON "RateBucket"("expiresAt");

-- CreateIndex
CREATE INDEX "Mail_createdAt_idx" ON "Mail"("createdAt");

-- CreateIndex
CREATE INDEX "FederationAttempt_expiresAt_idx" ON "FederationAttempt"("expiresAt");

-- AddForeignKey
ALTER TABLE "AccountAction" ADD CONSTRAINT "AccountAction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalIdentity" ADD CONSTRAINT "ExternalIdentity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
