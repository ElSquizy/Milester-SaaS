-- Umbrales de segmentación de clientes (JSON en Settings).
ALTER TABLE "Settings" ADD COLUMN "segmentConfig" TEXT NOT NULL DEFAULT '{}';
