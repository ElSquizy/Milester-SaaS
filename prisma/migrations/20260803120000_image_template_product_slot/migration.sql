-- Geometría del slot del producto por plantilla de imagen (defaults = layout histórico).
ALTER TABLE "ImageTemplate" ADD COLUMN "productX" INTEGER NOT NULL DEFAULT 177;
ALTER TABLE "ImageTemplate" ADD COLUMN "productY" INTEGER NOT NULL DEFAULT 224;
ALTER TABLE "ImageTemplate" ADD COLUMN "productW" INTEGER NOT NULL DEFAULT 670;
ALTER TABLE "ImageTemplate" ADD COLUMN "productH" INTEGER NOT NULL DEFAULT 670;
