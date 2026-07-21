-- Columna GENERADA (VIRTUAL) para ordenar alfabéticamente sin distinguir
-- mayúsculas. SQLite ordena TEXT en binario, así que "eFootball", "inFAMOUS" y
-- "theHunter" caían después de la Z. La calcula la base sola: nunca se escribe.
-- Se aplicó directo sobre Turso (ALTER aditivo, sin rebuild de tabla).
ALTER TABLE "Product" ADD COLUMN "nameSort" TEXT GENERATED ALWAYS AS (lower(name)) VIRTUAL;
CREATE INDEX "Product_nameSort_idx" ON "Product"("nameSort");
