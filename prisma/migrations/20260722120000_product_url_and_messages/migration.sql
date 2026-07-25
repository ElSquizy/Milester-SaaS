-- URL pública del producto (canonical_url de TN) + plantillas de mensaje para clientes.
-- Aplicada directo sobre Turso (ALTER aditivo + CREATE TABLE, sin rebuild).
ALTER TABLE "Product" ADD COLUMN "productUrl" TEXT;
CREATE TABLE "MessageTemplate" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
