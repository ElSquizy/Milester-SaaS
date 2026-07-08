-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Settings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "storeId" TEXT,
    "accessToken" TEXT,
    "appId" TEXT,
    "clientSecret" TEXT,
    "oauthState" TEXT,
    "anthropicApiKey" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Settings" ("accessToken", "anthropicApiKey", "createdAt", "id", "storeId", "updatedAt") SELECT "accessToken", "anthropicApiKey", "createdAt", "id", "storeId", "updatedAt" FROM "Settings";
DROP TABLE "Settings";
ALTER TABLE "new_Settings" RENAME TO "Settings";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
