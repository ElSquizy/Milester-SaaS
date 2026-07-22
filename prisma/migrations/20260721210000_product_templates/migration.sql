-- Plantillas de producto: versiones comerciales + herencia común.
-- Aplicada directo sobre Turso (CREATE TABLE aditivo, sin rebuild).
CREATE TABLE "ProductTemplate" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "versions" TEXT NOT NULL DEFAULT '[]',
    "categoryIds" TEXT NOT NULL DEFAULT '[]',
    "tags" TEXT NOT NULL DEFAULT '[]',
    "descriptionTemplateId" INTEGER,
    "imageTemplateId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
