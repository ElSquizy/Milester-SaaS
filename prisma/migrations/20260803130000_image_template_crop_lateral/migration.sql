-- Recorte lateral de la imagen del producto por plantilla (fracción por lado).
ALTER TABLE "ImageTemplate" ADD COLUMN "cropLateral" REAL NOT NULL DEFAULT 0;
