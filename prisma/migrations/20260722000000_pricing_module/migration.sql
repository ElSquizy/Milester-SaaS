-- Módulo de precios por franjas + campañas modo costos.
-- Aplicada directo sobre Turso (ALTERs aditivos, sin rebuild).
ALTER TABLE "Product" ADD COLUMN "costUsdPromo" REAL;
ALTER TABLE "Settings" ADD COLUMN "pricing" TEXT NOT NULL DEFAULT '{}';
ALTER TABLE "Campaign" ADD COLUMN "mode" TEXT NOT NULL DEFAULT 'prices';
ALTER TABLE "CampaignItem" ADD COLUMN "promoCostUsd" REAL;
