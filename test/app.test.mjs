import { request as httpRequest } from "node:http";
import test from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./support.mjs";
import { modules } from "../public/schema.js";
import { validate } from "../src/policy.mjs";
test("login keeps JWT out of browser and sets HttpOnly session", async (t) => {
  const f = await fixture(t),
    r = await f.login();
  assert.equal(r.status, 200);
  assert.equal(r.data.token, undefined);
  assert.equal(Object.keys(r.data.permissions).length, 8);
  assert.match(
    r.response.headers.get("set-cookie"),
    /HttpOnly; SameSite=Strict/,
  );
  assert.equal((await f.call("/api/session")).status, 200);
});
test("student receives only assigned records and modules", async (t) => {
  const f = await fixture(t),
    r = await f.login("student");
  assert.deepEqual(Object.keys(r.data.permissions), [
    "estudiantes",
    "inscripciones",
  ]);
  const list = await f.call("/api/records/estudiantes");
  assert.deepEqual(
    list.data.map((x) => x.id),
    [7],
  );
  assert.equal((await f.call("/api/records/estudiantes/8")).status, 404);
  assert.equal((await f.call("/api/records/usuarios")).status, 403);
  assert.deepEqual(
    (await f.call("/api/records/inscripciones")).data.map((x) => x.id),
    [10],
  );
});
test("forged mutation cannot override student permissions", async (t) => {
  const f = await fixture(t);
  await f.login("student");
  for (const method of ["POST", "PUT", "DELETE"])
    assert.equal(
      (await f.call("/api/records/estudiantes/7", method, { rol: "ADMIN" }))
        .status,
      403,
    );
  assert.equal(f.writes.length, 0);
});
test("teacher edits assigned record but cannot edit another or notes", async (t) => {
  const f = await fixture(t);
  await f.login("teacher");
  assert.equal(
    (
      await f.call("/api/records/docentes/3", "PUT", {
        nombre: "Docente",
        apellido: "Prueba",
        email: "doc@example.test",
        telefono: "12345678",
        materia: "Matemática",
      })
    ).status,
    200,
  );
  assert.equal((await f.call("/api/records/docentes/4", "DELETE")).status, 403);
  assert.equal((await f.call("/api/records/nota/12", "PUT", {})).status, 403);
  assert.equal((await f.call("/api/records/nota/12", "DELETE")).status, 200);
});
test("session expires at 60 seconds even with reads", async (t) => {
  const f = await fixture(t);
  await f.login();
  f.advance(59000);
  assert.equal((await f.call("/api/records/cursos")).status, 200);
  f.advance(1000);
  assert.equal((await f.call("/api/session")).status, 401);
  assert.equal((await f.call("/api/activity", "POST", {})).status, 401);
});
test("explicit activity renews session and logout invalidates it", async (t) => {
  const f = await fixture(t);
  await f.login();
  f.advance(50000);
  assert.equal((await f.call("/api/activity", "POST", {})).status, 200);
  f.advance(20000);
  assert.equal((await f.call("/api/session")).status, 200);
  assert.equal((await f.call("/api/logout", "POST", {})).status, 200);
  assert.equal((await f.call("/api/session")).status, 401);
});
test("rejects CSRF and foreign origins", async (t) => {
  const f = await fixture(t);
  await f.login();
  assert.equal(
    (await f.call("/api/activity", "POST", {}, { "X-CSRF-Token": "wrong" }))
      .status,
    403,
  );
  assert.equal(
    (await f.call("/api/activity", "POST", {}, { Origin: "https://evil.test" }))
      .status,
    403,
  );
});
test("unassigned valid user enters pending dashboard without academic access", async (t) => {
  const f = await fixture(t);
  const result = await f.login("unknown");
  assert.equal(result.status, 200);
  assert.equal(result.data.pendingAssignment, true);
  assert.deepEqual(result.data.permissions, {});
  assert.equal((await f.call("/api/session")).data.pendingAssignment, true);
  for (const route of Object.keys(modules)) {
    assert.equal((await f.call(`/api/records/${route}`)).status, 403);
    assert.equal((await f.call(`/api/records/${route}`, "POST", {})).status, 403);
  }
  assert.equal((await f.call("/api/access")).status, 403);
  f.advance(60000);
  assert.equal((await f.call("/api/session")).status, 401);
});
test("upstream failure does not grant permissions", async (t) => {
  const f = await fixture(t, { failure: "carreras" });
  assert.equal((await f.login()).status, 502);
});
test("config is not exposed as a static asset", async (t) => {
  const f = await fixture(t);
  assert.notEqual((await f.call("/config/access.json")).status, 200);
  await f.login("student");
  assert.equal((await f.call("/api/access")).status, 403);
});
test("all admin modules support listing and reject empty forms", async (t) => {
  const f = await fixture(t);
  await f.login();
  for (const key of Object.keys(modules)) {
    assert.equal((await f.call("/api/records/" + key)).status, 200);
    assert.equal((await f.call("/api/records/" + key, "POST", {})).status, 400);
  }
  assert.equal(f.writes.length, 0);
});
test("administrator links records without writing users or changing roles", async (t) => {
  const f = await fixture(t);
  await f.login();
  delete f.assignments.teacher;
  const r = await f.call("/api/access", "POST", {
    username: "student",
    profile: "DOCENTE",
    personId: 3,
    courseIds: [2],
    noteIds: [12],
    canEdit: true,
  });
  assert.equal(r.status, 200);
  assert.equal(f.writes.length, 0);
  assert.deepEqual(f.assignments.student.modules.cursos.ids, [2]);
});
test("assignment rejects missing people and unrelated notes", async (t) => {
  const f = await fixture(t);
  await f.login();
  assert.equal(
    (
      await f.call("/api/access", "POST", {
        username: "student",
        profile: "DOCENTE",
        personId: 3,
        courseIds: [],
        noteIds: [12],
        canEdit: false,
      })
    ).status,
    400,
  );
  assert.equal(f.writes.length, 0);
});
test("no password or extra fields can leak from response", async (t) => {
  const f = await fixture(t);
  await f.login();
  const data = await f.call("/api/records/usuarios");
  assert.ok(data.data.every((x) => !Object.hasOwn(x, "password")));
});
test("contract-specific payloads preserve backend rules", () => {
  assert.deepEqual(
    validate("inscripciones", { estudianteId: 7, cursoId: 2 }, false),
    { estudianteId: 7, cursoId: 2, activo: true },
  );
  assert.deepEqual(
    validate("colegiaturas", { monto: 0 }, true, { activo: false }),
    { monto: 0, activo: false },
  );
  assert.throws(() =>
    validate("colegiaturas", { monto: 500, descripcion: "Descartada" }, false),
  );
  assert.throws(() =>
    validate("nota", { descripcion: " ", valor: 70, curso: "Curso" }, false),
  );
  assert.throws(() =>
    validate(
      "nota",
      { descripcion: "Parcial", valor: 1.5, curso: "Curso" },
      false,
    ),
  );
});

test("cannot inject administrator fields into a student payload", async (t) => {
  const f = await fixture(t);
  await f.login();
  const result = await f.call("/api/records/estudiantes", "POST", {
    nombre: "A",
    apellido: "B",
    carnet: "7",
    edad: 18,
    grado: "Primero",
    rol: "ADMIN",
  });
  assert.equal(result.status, 400);
  assert.equal(f.writes.length, 0);
});

test("an enrollment edit cannot move a record to another student", async (t) => {
  const f = await fixture(t);
  f.assignments.student.modules.inscripciones.actions.push("update");
  await f.login("student");
  const result = await f.call("/api/records/inscripciones/10", "PUT", {
    estudianteId: 8,
    cursoId: 2,
    estado: "ACTIVA",
  });
  assert.equal(result.status, 403);
  assert.equal(f.writes.length, 0);
});

test("one person cannot be linked to two accounts", async (t) => {
  const f = await fixture(t);
  await f.login();
  const result = await f.call("/api/access", "POST", {
    username: "student",
    profile: "DOCENTE",
    personId: 3,
    courseIds: [2],
    noteIds: [12],
    canEdit: true,
  });
  assert.equal(result.status, 409);
  assert.equal(f.writes.length, 0);
});

test("delayed activity uses the real idle duration", async (t) => {
  const f = await fixture(t);
  await f.login();
  f.advance(10000);
  await f.call("/api/activity", "POST", { idleMs: 1000 });
  f.advance(59000);
  assert.equal((await f.call("/api/session")).status, 401);
});

test("production cookie and security headers protect browser session", async (t) => {
  const f = await fixture(t, { secure: true });
  const r = await f.login();
  assert.equal(r.status, 200);
  assert.match(r.response.headers.get("set-cookie"), /HttpOnly; SameSite=Strict; Secure/);
  assert.equal(r.response.headers.get("cache-control"), "no-store");
  assert.equal(r.response.headers.get("x-frame-options"), "DENY");
  assert.match(r.response.headers.get("content-security-policy"), /object-src 'none'/);
  assert.equal(r.response.headers.get("strict-transport-security"), "max-age=31536000");
});

test("external links can open login without allowing cross-site API requests", async (t) => {
  const f = await fixture(t);
  const headers = { "Sec-Fetch-Site": "cross-site", "Sec-Fetch-Mode": "navigate", "Sec-Fetch-Dest": "document", Origin: "https://dashboard.render.com" };
  const navigate = (extra) => new Promise((resolve, reject) => {
    const req = httpRequest(f.origin + "/", { headers: extra }, (res) => {
      res.resume();
      res.on("end", () => resolve(res.statusCode));
    });
    req.on("error", reject);
    req.end();
  });
  assert.equal(await navigate(headers), 200);
  assert.equal(await navigate({ ...headers, "Sec-Fetch-Dest": "iframe" }), 403);
  assert.equal(await navigate({ ...headers, "Sec-Fetch-Mode": "cors" }), 403);
  await f.login();
  assert.equal((await f.call("/api/session", "GET", undefined, headers)).status, 403);
  assert.equal((await f.call("/api/logout", "POST", {}, headers)).status, 403);
});


