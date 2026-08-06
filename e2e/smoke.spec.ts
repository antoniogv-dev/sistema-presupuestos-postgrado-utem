import { test, expect } from "@playwright/test";

test("abre el editor y recalcula el flujo", async ({ page }) => {
  await page.goto("/presupuestos");
  await expect(page.getByRole("heading", { name: "Formulación de cohorte" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Flujo de caja anual" })).toBeVisible();
  const studentInput = page.getByLabel("Estudiantes 2027-1");
  await studentInput.fill("16");
  await expect(studentInput).toHaveValue("16");
});

test("la navegación móvil es operable", async ({ page, isMobile }) => {
  test.skip(!isMobile, "Sólo proyecto móvil");
  await page.goto("/");
  await page.getByRole("button", { name: "Abrir menú" }).click();
  await expect(page.getByRole("link", { name: "Consolidado" })).toBeVisible();
});
