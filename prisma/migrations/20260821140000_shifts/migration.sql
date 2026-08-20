-- Turnos por fecha (horarios del equipo).
CREATE TABLE "Shift" ("id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, "employeeId" INTEGER NOT NULL, "date" DATETIME NOT NULL, "start" TEXT NOT NULL, "end" TEXT NOT NULL, "note" TEXT, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL, CONSTRAINT "Shift_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE CASCADE ON UPDATE CASCADE);
CREATE INDEX "Shift_date_idx" ON "Shift"("date");
CREATE INDEX "Shift_employeeId_idx" ON "Shift"("employeeId");
