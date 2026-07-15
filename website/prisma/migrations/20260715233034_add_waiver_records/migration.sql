-- CreateTable
CREATE TABLE "WaiverPdf" (
    "signatureId" TEXT NOT NULL PRIMARY KEY,
    "data" BLOB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WaiverPdf_signatureId_fkey" FOREIGN KEY ("signatureId") REFERENCES "WaiverSignature" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_WaiverSignature" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "signedName" TEXT NOT NULL,
    "participantName" TEXT NOT NULL,
    "minorDob" TEXT,
    "guardianRelation" TEXT,
    "ipAddress" TEXT NOT NULL,
    "userAgent" TEXT,
    "consentEsign" BOOLEAN NOT NULL DEFAULT false,
    "pdfSha256" TEXT,
    "emailedAt" DATETIME,
    "signedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WaiverSignature_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "WaiverSignature_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "WaiverDocument" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_WaiverSignature" ("documentId", "guardianRelation", "id", "ipAddress", "minorDob", "participantName", "signedAt", "signedName", "userId", "version") SELECT "documentId", "guardianRelation", "id", "ipAddress", "minorDob", "participantName", "signedAt", "signedName", "userId", "version" FROM "WaiverSignature";
DROP TABLE "WaiverSignature";
ALTER TABLE "new_WaiverSignature" RENAME TO "WaiverSignature";
CREATE INDEX "WaiverSignature_userId_version_idx" ON "WaiverSignature"("userId", "version");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
