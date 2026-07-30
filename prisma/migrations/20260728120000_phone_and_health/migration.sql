-- Teléfono E.164 derivado + estado de salud de la API de TN.
ALTER TABLE "Customer" ADD COLUMN "phoneE164" TEXT;
ALTER TABLE "Settings" ADD COLUMN "tnApiError" TEXT;
ALTER TABLE "Settings" ADD COLUMN "tnApiErrorAt" DATETIME;
