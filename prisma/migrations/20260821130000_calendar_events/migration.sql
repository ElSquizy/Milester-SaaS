-- Eventos manuales del calendario (lanzamientos, notas).
CREATE TABLE "CalendarEvent" ("id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, "title" TEXT NOT NULL, "date" DATETIME NOT NULL, "type" TEXT NOT NULL DEFAULT 'note', "note" TEXT, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL);
CREATE INDEX "CalendarEvent_date_idx" ON "CalendarEvent"("date");
