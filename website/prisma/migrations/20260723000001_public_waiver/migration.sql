-- CreateTable
CREATE TABLE "PublicWaiverSignature" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "documentId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "signerEmail" TEXT NOT NULL,
    "signedName" TEXT NOT NULL,
    "participantName" TEXT NOT NULL,
    "minorDob" TEXT,
    "guardianRelation" TEXT,
    "ipAddress" TEXT NOT NULL,
    "userAgent" TEXT,
    "initials" TEXT,
    "participantType" TEXT,
    "participantDob" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "emergencyName" TEXT,
    "emergencyPhone" TEXT,
    "allergies" TEXT,
    "medical" TEXT,
    "mediaRelease" BOOLEAN NOT NULL DEFAULT true,
    "consentEsign" BOOLEAN NOT NULL DEFAULT false,
    "pdfSha256" TEXT,
    "pdfData" BLOB NOT NULL,
    "downloadToken" TEXT NOT NULL,
    "emailedAt" DATETIME,
    "signedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PublicWaiverSignature_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "WaiverDocument" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "PublicWaiverSignature_downloadToken_key" ON "PublicWaiverSignature"("downloadToken");

-- CreateIndex
CREATE INDEX "PublicWaiverSignature_signedAt_idx" ON "PublicWaiverSignature"("signedAt");
