import { createServer } from "node:http";
import { once } from "node:events";
import { createApp } from "../src/app.mjs";
import { modules } from "../public/schema.js";
const records = {
  usuarios: [
    {
      id: 1,
      username: "admin",
      nombre: "Admin",
      apellido: "Prueba",
      email: "admin@example.test",
      password: "synthetic-private-hash",
      activo: true,
    },
    {
      id: 2,
      username: "student",
      nombre: "Alumno",
      apellido: "Prueba",
      email: "student@example.test",
      activo: true,
    },
  ],
  estudiantes: [
    {
      id: 7,
      nombre: "Propio",
      apellido: "Prueba",
      carnet: "A7",
      edad: 18,
      grado: "Primero",
      activo: true,
    },
    {
      id: 8,
      nombre: "Ajeno",
      apellido: "Prueba",
      carnet: "A8",
      edad: 18,
      grado: "Primero",
      activo: true,
    },
  ],
  docentes: [
    {
      id: 3,
      nombre: "Docente",
      apellido: "Prueba",
      email: "doc@example.test",
      telefono: "12345678",
      materia: "Matemática",
      activo: true,
    },
  ],
  carreras: [{ idCarrera: 1, nombre: "Sistemas" }],
  cursos: [
    { id: 2, nombre: "Matemática", descripcion: "Curso", activo: true },
  ],
  inscripciones: [
    { id: 10, estudianteId: 7, cursoId: 2, estado: "ACTIVA", activo: true },
    { id: 11, estudianteId: 8, cursoId: 2, estado: "ACTIVA", activo: true },
  ],
  colegiaturas: [
    { idColegiatura: 1, descripcion: null, monto: 500, activo: true },
  ],
  nota: [{ id: 12, descripcion: "Parcial", valor: 80, curso: "Matemática" }],
};
export async function fixture(t, options = {}) {
  let clock = Date.now(),
    handler;
  const writes = [],
    assignments = {
      student: {
        label: "Estudiante",
        modules: {
          estudiantes: { ids: [7], actions: ["read"] },
          inscripciones: { studentIds: [7], actions: ["read"] },
        },
      },
      teacher: {
        label: "Docente",
        modules: {
          docentes: { ids: [3], actions: ["read", "update"] },
          cursos: { ids: [2], actions: ["read"] },
          nota: { ids: [12], actions: ["read", "delete"] },
        },
      },
    };
  const fetcher = async (url, init) => {
    const route = new URL(url).pathname.replace("/api/", "");
    if (route === "auth/login") {
      const input = JSON.parse(init.body);
      const claims = Buffer.from(
        JSON.stringify({
          sub: input.username,
          exp: Math.floor(clock / 1000) + 3600,
        }),
      ).toString("base64url");
      return Response.json({ token: `test.${claims}.test` });
    }
    const token = init.headers.Authorization.slice(7),
      user = JSON.parse(Buffer.from(token.split(".")[1], "base64url")).sub;
    const key = route.split("/")[0],
      id = route.split("/")[1];
    const available =
      user === "admin"
        ? Object.keys(modules)
        : user === "teacher"
          ? ["docentes", "cursos", "nota"]
          : ["estudiantes", "inscripciones"];
    if (!available.includes(key)) return Response.json({}, { status: 403 });
    if (options.failure === key) return Response.json({}, { status: 500 });
    if (init.method !== "GET") {
      writes.push({
        route,
        method: init.method,
        body: init.body ? JSON.parse(init.body) : null,
      });
      return init.method === "DELETE"
        ? new Response(null, { status: 204 })
        : Response.json({
            id: Number(id || 99),
            ...(init.body ? JSON.parse(init.body) : {}),
          });
    }
    return Response.json(records[key]);
  };
  const server = createServer((req, res) => handler(req, res));
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const origin = `http://127.0.0.1:${server.address().port}`;
  handler = createApp({
    origin,
    backend: "https://backend.test/api/",
    secure: options.secure || false,
    fetcher,
    now: () => clock,
    loadAccess: async () => assignments,
    saveAssignment: async (user, value) => {
      assignments[user] = value;
    },
  });
  t.after(
    () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(resolve);
      }),
  );
  let cookie = "",
    csrf = "";
  const call = async (path, method = "GET", body, extra = {}) => {
    const response = await fetch(origin + path, {
      method,
      headers: {
        Origin: origin,
        ...(cookie ? { Cookie: cookie } : {}),
        ...(csrf ? { "X-CSRF-Token": csrf } : {}),
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...extra,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const set = response.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0];
    let data;
    try {
      data = await response.json();
    } catch {
      data = null;
    }
    if (data?.csrf) csrf = data.csrf;
    return { status: response.status, data, response };
  };
  return {
    origin,
    call,
    writes,
    assignments,
    advance: (ms) => (clock += ms),
    login: (user = "admin") =>
      call("/api/login", "POST", { username: user, password: "test-only" }),
    getCookie: () => cookie,
  };
}
