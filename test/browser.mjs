import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fixture } from "./support.mjs";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const cleanups = [];
const f = await fixture({ after: (fn) => cleanups.push(fn) });
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 950 },
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(f.origin);
  await page.route("**/api/login", (route) => route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: "Acceso rechazado de prueba" }) }), { times: 1 });
  await page.getByLabel("Usuario", { exact: true }).fill("admin");
  await page.getByLabel("Contraseña", { exact: true }).fill("test-only");
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await page.getByRole("alert").waitFor();
  assert.equal(await page.getByLabel("Contraseña", { exact: true }).inputValue(), "");
  await page.getByLabel("Usuario", { exact: true }).fill("admin");
  await page.getByLabel("Contraseña", { exact: true }).fill("test-only");
  assert.equal(await page.getByLabel("Contraseña", { exact: true }).getAttribute("value"), null);
  assert.equal((await page.content()).includes("test-only"), false);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await page.getByRole("heading", { name: "Hola, admin." }).waitFor();
  assert.equal(await page.locator(".module-card").count(), 8);
  assert.equal(await page.evaluate(() => document.cookie), "");
  assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0);
  assert.ok((await page.context().cookies()).find((c) => c.name === "sgau_session").httpOnly);
  const sessionData = await page.evaluate(async () => (await fetch("/api/session")).json());
  assert.equal(sessionData.token, undefined);
  assert.equal(sessionData.password, undefined);
  await page.getByRole("button", { name: "US Usuarios", exact: true }).click();
  await page.getByRole("button", { name: "+ Crear usuario" }).click();
  assert.equal(
    await page.getByLabel("Rol", { exact: true }).inputValue(),
    "ESTUDIANTE",
  );
  await page.getByLabel("Nombre", { exact: true }).fill("Nueva");
  await page.getByLabel("Apellido", { exact: true }).fill("Prueba");
  await page.getByLabel("Usuario", { exact: true }).fill("new-student");
  await page.getByLabel("Correo", { exact: true }).fill("new@example.test");
  await page.getByLabel("Contraseña", { exact: true }).fill("test-only");
  assert.equal(await page.getByLabel("Contraseña", { exact: true }).getAttribute("value"), null);
  assert.equal((await page.content()).includes("test-only"), false);
  await page.route("**/api/records/usuarios", (route) => route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ error: "Guardado rechazado de prueba" }) }), { times: 1 });
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await page.getByRole("alert").waitFor();
  assert.equal(await page.getByLabel("Contraseña", { exact: true }).inputValue(), "");
  await page.getByLabel("Contraseña", { exact: true }).fill("test-only");
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await page
    .getByRole("status")
    .filter({ hasText: "Datos guardados correctamente." })
    .waitFor();
  assert.equal(f.writes.at(-1).body.rol, "ESTUDIANTE");
  for (const name of [
    "ES Estudiantes",
    "DO Docentes",
    "CA Carreras",
    "CU Cursos",
    "IN Inscripciones",
    "CO Colegiaturas",
    "NO Notas",
  ]) {
    await page.getByRole("button", { name, exact: true }).click();
    await page.locator("tbody tr").first().waitFor();
  }
  await page
    .getByRole("button", { name: "Ver detalle", exact: true })
    .first()
    .click();
  assert.equal(
    await page.getByRole("button", { name: "Editar", exact: true }).count(),
    0,
  );
  await page.getByRole("button", { name: "Cerrar", exact: true }).click();
  await page
    .getByRole("button", { name: "CO Colegiaturas", exact: true })
    .click();
  await page.getByRole("button", { name: "+ Crear colegiatura" }).click();
  assert.equal(
    await page.getByLabel("Descripción", { exact: true }).count(),
    0,
  );
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  await page
    .getByRole("button", { name: "Vinculación de datos", exact: true })
    .click();
  await page.getByLabel("Cuenta del backend").waitFor();
  assert.equal(await page.locator("select").count(), 3);
  await page.getByLabel("Cuenta del backend").selectOption("student");
  assert.ok((await page.getByLabel("Estudiante existente").innerText()).includes("Propio Prueba"));
  await page.getByLabel("Estudiante existente").selectOption("7");
  const beforeLink = f.writes.length;
  await page.getByRole("button", { name: "Guardar vinculación" }).click();
  await page.getByRole("status").filter({ hasText: "Vinculación guardada." }).waitFor();
  assert.equal(f.writes.length, beforeLink);
  await page.getByRole("button", { name: "Inicio", exact: true }).click();
  if (process.env.QA_DIR)
    await page.screenshot({
      path: process.env.QA_DIR + "/sgau-web-inicio.png",
      fullPage: true,
    });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  );
  if (process.env.QA_DIR)
    await page.screenshot({
      path: process.env.QA_DIR + "/sgau-web-movil.png",
      fullPage: true,
    });
  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  await page.getByLabel("Usuario", { exact: true }).fill("student");
  await page.getByLabel("Contraseña", { exact: true }).fill("test-only");
  assert.equal(await page.getByLabel("Contraseña", { exact: true }).getAttribute("value"), null);
  assert.equal((await page.content()).includes("test-only"), false);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await page.getByRole("heading", { name: "Hola, student." }).waitFor();
  assert.equal(await page.locator(".module-card").count(), 2);
  await page.locator("button[data-route=estudiantes]").click();
  await page.locator("tbody tr").waitFor();
  assert.equal(await page.locator("tbody tr").count(), 1);
  assert.equal(
    await page.getByRole("button", { name: "+ Crear estudiante" }).count(),
    0,
  );
  f.advance(60000);
  await page.evaluate(async () => {
    await fetch("/api/session");
  });
  await page.reload();
  await page.getByRole("button", { name: "Iniciar sesión" }).waitFor();
  await page.getByLabel("Usuario", { exact: true }).fill("unknown");
  await page.getByLabel("Contraseña", { exact: true }).fill("test-only");
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await page.getByRole("heading", { name: "Pendiente de asignación" }).waitFor();
  assert.equal(await page.locator(".module-card").count(), 0);
  assert.equal(await page.getByRole("navigation").count(), 0);
  const picture = page.locator("img.pending-image");
  await picture.waitFor();
  await picture.evaluate((img) => img.decode());
  assert.ok(await picture.evaluate((img) => img.naturalWidth > 0));
  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  await page.getByRole("button", { name: "Iniciar sesión" }).waitFor();
  assert.deepEqual(errors, []);
  console.log(
    "Interfaz verificada: 8 módulos, creación, campos, permisos, sesión y vista móvil.",
  );
} finally {
  await browser.close();
  for (const close of cleanups) await close();
}
