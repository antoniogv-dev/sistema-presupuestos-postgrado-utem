-- v10.26: malla curricular por programa, importable y editable.
CREATE TABLE IF NOT EXISTS "ProgramCourse" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "programId" TEXT NOT NULL,
  "code" TEXT,
  "name" TEXT NOT NULL,
  "semester" INTEGER NOT NULL,
  "kind" TEXT NOT NULL CHECK ("kind" IN ('OBLIGATORIA','ELECTIVA','ESPECIALIZACION','COMPETENCIA_GENERICA')),
  "weeks" INTEGER NOT NULL DEFAULT 18,
  "sections" INTEGER NOT NULL DEFAULT 1 CHECK (
    "sections" >= 1 AND ("kind" NOT IN ('OBLIGATORIA','COMPETENCIA_GENERICA') OR "sections" = 1)
  ),
  "theoryWeeklyHours" DECIMAL NOT NULL DEFAULT 0,
  "laboratoryWeeklyHours" DECIMAL NOT NULL DEFAULT 0,
  "workshopWeeklyHours" DECIMAL NOT NULL DEFAULT 0,
  "directWeeklyHours" DECIMAL NOT NULL DEFAULT 0,
  "autonomousWeeklyHours" DECIMAL NOT NULL DEFAULT 0,
  "teachingMode" TEXT NOT NULL DEFAULT 'SINCRONICA' CHECK ("teachingMode" IN ('PRESENCIAL','SINCRONICA','ASINCRONICA')),
  "asynchronousRateFactor" DECIMAL NOT NULL DEFAULT 0.5,
  "sharedWithProgramIds" JSON NOT NULL DEFAULT '[]',
  "allocationRate" DECIMAL NOT NULL DEFAULT 1,
  "sctCredits" DECIMAL NOT NULL DEFAULT 0,
  "prerequisites" TEXT,
  "position" INTEGER NOT NULL DEFAULT 0,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProgramCourse_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "ProgramCourse_programId_semester_position_idx" ON "ProgramCourse"("programId", "semester", "position");
CREATE INDEX IF NOT EXISTS "ProgramCourse_programId_kind_idx" ON "ProgramCourse"("programId", "kind");
