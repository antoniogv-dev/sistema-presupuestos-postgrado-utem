import type { InstitutionalParameters, ProgramType } from "@/lib/calculations/types";
import { institutionalParameters as defaultParameters } from "@/lib/demo-data";
import { getPrismaClient } from "@/lib/database/prisma";

export const PARAMETER_CODES = [
  "DIRECT_TEACHING_HOUR",
  "REPLACEMENT_TEACHING_HOUR",
  "MAINTENANCE_SCHOLARSHIP",
  "ANNUAL_ENROLLMENT",
  "ANNUAL_ADJUSTMENT",
  "PLANNING_HORIZON",
  "TUITION_TEMPLATE",
  "PROGRAM_DIRECTION",
  "PROGRAM_ASSISTANCE",
  "OPERATING_EXPENSES",
  "SOFTWARE_LICENSES",
  "DIFFUSION_ADMISSION",
  "CONGRESSES_INTERNSHIPS",
  "THESIS_GUIDANCE",
  "CENTRAL_OVERHEAD",
  "FACULTY_OVERHEAD",
  "BAD_DEBT",
] as const;

export type ParameterCode = typeof PARAMETER_CODES[number];
export const PARAMETER_SCOPES = ["GENERAL", "DOCTORADO", "MAGISTER_ACADEMICO", "MAGISTER_PROFESIONAL", "OTRO"] as const;
export type ParameterScope = typeof PARAMETER_SCOPES[number];

const programScopes: ProgramType[] = ["DOCTORADO", "MAGISTER_ACADEMICO", "MAGISTER_PROFESIONAL", "OTRO"];

function cloneDefaults(): InstitutionalParameters {
  return structuredClone(defaultParameters);
}

function setAnnual(target: Record<number, number>, year: number | null, amount: number) {
  if (year != null) target[year] = amount;
}

export async function getInstitutionalParametersFromDatabase(): Promise<InstitutionalParameters> {
  const result = cloneDefaults();
  const values = await getPrismaClient().annualParameter.findMany({
    include: { parameter: { select: { code: true } } },
    orderBy: [{ parameterId: "asc" }, { scope: "asc" }, { year: "asc" }],
  });

  for (const value of values) {
    const code = value.parameter.code as ParameterCode;
    const scope = value.scope as ParameterScope;
    const amount = Number(value.amount);
    const year = value.year;

    if (scope === "GENERAL") {
      switch (code) {
        case "DIRECT_TEACHING_HOUR": setAnnual(result.teachingHour, year, amount); break;
        case "REPLACEMENT_TEACHING_HOUR": result.replacementHour = amount; break;
        case "MAINTENANCE_SCHOLARSHIP": setAnnual(result.maintenanceScholarshipMonthly, year, amount); break;
        case "ANNUAL_ENROLLMENT": setAnnual(result.annualEnrollmentFee, year, amount); break;
        case "ANNUAL_ADJUSTMENT": result.annualAdjustmentRate = amount; break;
        case "PLANNING_HORIZON": result.planningHorizonYears = Math.max(1, Math.round(amount)); break;
      }
      continue;
    }

    if (!programScopes.includes(scope as ProgramType)) continue;
    const type = scope as ProgramType;
    const program = result.byProgramType[type];
    switch (code) {
      case "TUITION_TEMPLATE":
        setAnnual(result.tuitionTemplates[type], year, amount);
        if (type === "DOCTORADO") setAnnual(result.doctorateTuitionTemplate, year, amount);
        break;
      case "PROGRAM_DIRECTION": setAnnual(program.annualDirection, year, amount); break;
      case "PROGRAM_ASSISTANCE": setAnnual(program.annualAssistance, year, amount); break;
      case "OPERATING_EXPENSES": setAnnual(program.referenceOperational, year, amount); break;
      case "SOFTWARE_LICENSES": setAnnual(program.softwareLicenses, year, amount); break;
      case "DIFFUSION_ADMISSION": setAnnual(program.diffusionAdmission, year, amount); break;
      case "CONGRESSES_INTERNSHIPS": setAnnual(program.congressesInternships, year, amount); break;
      case "THESIS_GUIDANCE": setAnnual(program.thesisGuidancePerGraduatingStudent, year, amount); break;
      case "CENTRAL_OVERHEAD": program.centralOverheadRate = amount; break;
      case "FACULTY_OVERHEAD": program.facultyOverheadRate = amount; break;
      case "BAD_DEBT": program.badDebtRate = amount; break;
    }
  }

  return result;
}
