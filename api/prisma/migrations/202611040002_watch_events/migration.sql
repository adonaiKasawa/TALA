-- CreateTable
CREATE TABLE "WatchEvent" (
    "sessionId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "watchedMs" INTEGER NOT NULL,
    "positionMs" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WatchEvent_pkey" PRIMARY KEY ("sessionId","sequence")
);

-- AddForeignKey
ALTER TABLE "WatchEvent" ADD CONSTRAINT "WatchEvent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "WatchSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
