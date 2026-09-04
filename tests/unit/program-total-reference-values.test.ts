import { describe, expect, it } from "vitest";

function annualShares(startSemester: 1 | 2, durationSemesters: number, semesterShares: number[]) {
  const startIndex = startSemester === 1 ? 0 : 1;
  const byYear: number[] = [];
  semesterShares.slice(0, durationSemesters).forEach((share, offset) => {
    const semesterIndex = startIndex + offset;
    const yearIndex = Math.floor(semesterIndex / 2);
    byYear[yearIndex] = (byYear[yearIndex] ?? 0) + share;
  });
  return byYear;
}

describe("referencia MEES de arancel total", () => {
  it("un programa de 4 semestres iniciado en 2S distribuye 25% / 50% / 25%", () => {
    const shares = annualShares(2, 4, [0.25, 0.25, 0.25, 0.25]);
    expect(shares).toEqual([0.25, 0.5, 0.25]);
    expect(shares.map((share) => 6_000_000 * share)).toEqual([1_500_000, 3_000_000, 1_500_000]);
  });
});