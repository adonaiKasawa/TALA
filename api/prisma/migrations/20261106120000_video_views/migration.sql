ALTER TABLE "Video" ADD COLUMN "viewCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "WatchSession" ADD COLUMN "viewCounted" BOOLEAN NOT NULL DEFAULT false;
UPDATE "WatchSession" SET "viewCounted"=true WHERE "watchedMs">=2000;
UPDATE "Video" v SET "viewCount"=s.total FROM (SELECT "videoId",COUNT(*)::INTEGER AS total FROM "WatchSession" WHERE "viewCounted"=true GROUP BY "videoId") s WHERE s."videoId"=v.id;
