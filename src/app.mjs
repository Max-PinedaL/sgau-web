import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { modules } from "../public/schema.js";
import { HttpError, allowed, sanitize, validate } from "./policy.mjs";
const TTL = 60000;
const assets = {
  "/": ["../dist/index.html", "text/html"],
  "/style.css": ["style.css", "text/css"],
  "/schema.js": ["schema.js", "text/javascript"],
  "/logo.webp": ["logo.webp", "image/webp"],
  "/pending.gif": ["pending.gif", "image/gif"],
  "/loading-cat.gif": ["loading-cat.gif", "image/gif"],
};
export function createApp({
  origin,
  backend,
  secure = false,
  loadAccess = async () => ({}),
  saveAssignment = async () => {
    throw new HttpError(503, "Persistencia de asignaciones no configurada.");
  },
  fetcher = fetch,
  now = Date.now,
}) {
  const audit = [];
  let noteLinkQueue = Promise.resolve();
  const pendingEnrollments = new Set();
  const sessions = new Map(),
    attempts = new Map();
  const cookie = (v) =>
    `sgau_session=${v}; Path=/; HttpOnly; SameSite=Strict${secure ? "; Secure" : ""}${v ? "" : "; Max-Age=0"}`;
  const timer = setInterval(() => {
    for (const [k, s] of sessions)
      if (now() >= s.expires || now() >= s.tokenExpires) sessions.delete(k);
    for (const [k, a] of attempts) if (now() > a.until) attempts.delete(k);
  }, 10000);
  timer.unref();
  async function upstream(path, token, method = "GET", body) {
    let res;
    try {
      res = await fetcher(new URL(path, backend), {
        method,
        headers: {
          Accept: "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(12000),
        redirect: "error",
      });
    } catch {
      throw new HttpError(
        502,
        "No se pudo conectar con el servicio. Revisa la conexión y reintenta. Si estabas guardando, actualiza el listado antes de repetir.",
      );
    }
    let data = null;
    if (res.status !== 204) {
      try {
        data = await res.json();
      } catch {
        if (res.ok)
          throw new HttpError(
            502,
            "El servicio devolvió una respuesta inesperada.",
          );
      }
    }
    return { status: res.status, ok: res.ok, data };
  }
  function checked(res) {
    if (res.ok) return res.data;
    const messages = {
      400: "El servicio rechazó los datos. Revisa el formulario.",
      401: "Tu sesión venció. Inicia sesión nuevamente.",
      403: "No tienes permiso para esta operación.",
      404: "El registro ya no está disponible.",
      409: "Hay un conflicto con los datos. Actualiza el listado.",
    };
    throw new HttpError(
      res.status >= 500 ? 502 : res.status,
      messages[res.status] || "No se pudo completar la operación.",
    );
  }
  async function list(s, route) {
    const data = checked(await upstream(route, s.token));
    if (!Array.isArray(data))
      throw new HttpError(502, "El listado tiene un formato inesperado.");
    return data.filter((x) => x && typeof x === "object");
  }
  function info(s) {
    const permissions = {};
    for (const route of Object.keys(modules))
      if (allowed(s, route, "read"))
        permissions[route] = {
          actions: ["read", "create", "update", "delete"].filter((a) =>
            allowed(s, route, a),
          ),
        };
    return {
      username: s.username,
      profile: s.admin ? "Administrador" : Object.keys(permissions).length ? s.label : "Pendiente de asignación",
      pendingAssignment: !s.admin && !Object.keys(permissions).length,
      csrf: s.csrf,
      expiresAt: s.expires,
      permissions,
    };
  }
  async function bodyOf(req) {
    if (!req.headers["content-type"]?.startsWith("application/json"))
      throw new HttpError(415, "Se requiere JSON.");
    let body = "";
    for await (const chunk of req) {
      body += chunk;
      if (Buffer.byteLength(body) > 32768)
        throw new HttpError(413, "Solicitud demasiado grande.");
    }
    try {
      return JSON.parse(body || "{}");
    } catch {
      throw new HttpError(400, "JSON no válido.");
    }
  }
  return async function app(req, res) {
    let currentSession = null;
    let enrollmentKey = null;
    let operationSucceeded = false;
    const auditPath = new URL(req.url, origin).pathname;
    res.once("finish", () => {
      if (enrollmentKey) pendingEnrollments.delete(enrollmentKey);
      if (!["GET", "HEAD"].includes(req.method) && /^\/api\/(?:access|records\/[a-z]+(?:\/[0-9]+)?)$/.test(auditPath)) {
        audit.unshift({ at: new Date(now()).toISOString(), actor: currentSession?.username || "Sin sesión", method: req.method, path: auditPath, status: res.statusCode, result: operationSucceeded ? "Completada" : res.statusCode >= 500 ? "No confirmado; revisar listado" : "Rechazada" });
        if (audit.length > 500) audit.length = 500;
      }
    });
    const send = (code, data) => {
      if (
        code < 400 &&
        currentSession &&
        (now() >= currentSession.expires ||
          now() >= currentSession.tokenExpires)
      ) {
        code = 401;
        data = { error: "Tu sesión venció. Inicia sesión nuevamente." };
        sessions.delete(sid);
        res.setHeader("Set-Cookie", cookie(""));
      }
      res.writeHead(code, {
        "Content-Type": "application/json; charset=utf-8",
      });
      res.end(JSON.stringify(data));
    };
    const sid = (req.headers.cookie || "")
      .split(";")
      .map((x) => x.trim())
      .find((x) => x.startsWith("sgau_session="))
      ?.slice(13);
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; object-src 'none'; frame-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    );
    if (secure) res.setHeader("Strict-Transport-Security", "max-age=31536000");
    try {
      const path = new URL(req.url, origin).pathname;
      const publicNavigation = req.method === "GET" && path === "/" &&
        req.headers["sec-fetch-mode"] === "navigate" &&
        req.headers["sec-fetch-dest"] === "document";
      if (
        req.headers.host !== new URL(origin).host ||
        (req.headers["sec-fetch-site"] === "cross-site" && !publicNavigation) ||
        (!["GET", "HEAD"].includes(req.method) && req.headers.origin !== origin)
      )
        throw new HttpError(403, "Origen no permitido.");
      const built = path.match(/^\/assets\/([a-zA-Z0-9_.-]+\.(?:js|css))$/);
      if (built && req.method === "GET") {
        let content;
        try {
          content = await readFile(
            new URL(`../dist/assets/${built[1]}`, import.meta.url),
          );
        } catch {
          throw new HttpError(
            404,
            "Archivo no disponible. Ejecuta npm run build.",
          );
        }
        res.writeHead(200, {
          "Content-Type": built[1].endsWith(".css")
            ? "text/css; charset=utf-8"
            : "text/javascript; charset=utf-8",
        });
        return res.end(content);
      }
      if (assets[path] && req.method === "GET") {
        const [file, type] = assets[path];
        res.writeHead(200, { "Content-Type": `${type}; charset=utf-8` });
        return res.end(
          await readFile(new URL(`../public/${file}`, import.meta.url)),
        );
      }
      if (path === "/api/login" && req.method === "POST") {
        const ip = req.socket.remoteAddress;
        let rate = attempts.get(ip);
        if (!rate || now() > rate.until)
          rate = { count: 0, until: now() + 300000 };
        attempts.set(ip, rate);
        if (++rate.count > 10)
          throw new HttpError(
            429,
            "Demasiados intentos. Espera cinco minutos.",
          );
        const input = await bodyOf(req);
        if (
          typeof input.username !== "string" ||
          !input.username.trim() ||
          input.username.length > 200 ||
          typeof input.password !== "string" ||
          !input.password ||
          input.password.length > 4000
        )
          throw new HttpError(400, "Completa usuario y contraseña.");
        let login;
        try {
          login = await upstream("auth/login", null, "POST", {
            username: input.username.trim(),
            password: input.password,
          });
        } finally {
          input.password = "";
        }
        if ([400, 401, 403].includes(login.status))
          throw new HttpError(401, "Usuario o contraseña incorrectos.");
        const data = checked(login);
        if (typeof data?.token !== "string")
          throw new HttpError(502, "El login no devolvió un token válido.");
        let claims;
        try {
          claims = JSON.parse(
            Buffer.from(data.token.split(".")[1], "base64url").toString(),
          );
        } catch {
          throw new HttpError(502, "Token inesperado.");
        }
        if (
          typeof claims.sub !== "string" ||
          !Number.isFinite(claims.exp) ||
          claims.exp * 1000 <= now()
        )
          throw new HttpError(401, "El servicio devolvió una sesión vencida.");
        const probes = await Promise.all(
          Object.keys(modules).map(async (route) => {
            const probe = await upstream(route, data.token);
            if (probe.status === 403) return null;
            const rows = checked(probe);
            if (!Array.isArray(rows))
              throw new HttpError(
                502,
                "No se pudieron verificar los permisos.",
              );
            return route;
          }),
        );
        const available = probes.filter(Boolean),
          admin = ["carreras", "colegiaturas", "usuarios"].every((r) =>
            available.includes(r),
          );
        const access = await loadAccess(),
          assigned = Object.hasOwn(access, claims.sub)
            ? access[claims.sub]
            : null;
        const s = {
          token: data.token,
          tokenExpires: claims.exp * 1000,
          username: claims.sub,
          admin,
          available,
          grants: assigned?.modules || {},
          label: assigned?.label || "Acceso asignado",
          expires: now() + TTL,
          csrf: randomBytes(24).toString("hex"),
        };
        if (sid) sessions.delete(sid);
        const id = randomBytes(32).toString("hex");
        sessions.set(id, s);
        res.setHeader("Set-Cookie", cookie(id));
        return send(200, info(s));
      }
      const s = sessions.get(sid);
      if (!s || now() >= s.expires || now() >= s.tokenExpires) {
        sessions.delete(sid);
        res.setHeader("Set-Cookie", cookie(""));
        throw new HttpError(
          401,
          "Tu sesión se cerró por inactividad o vencimiento. Inicia sesión nuevamente.",
        );
      }
      currentSession = s;
      if (
        !["GET", "HEAD"].includes(req.method) &&
        req.headers["x-csrf-token"] !== s.csrf
      )
        throw new HttpError(
          403,
          "Verificación de seguridad fallida. Recarga la página.",
        );
      if (path === "/api/session" && req.method === "GET")
        return send(200, info(s));
      if (path === "/api/activity" && req.method === "POST") {
        const activity = await bodyOf(req);
        const idleMs = activity.idleMs ?? 0;
        if (!Number.isFinite(idleMs) || idleMs < 0 || idleMs >= TTL)
          throw new HttpError(400, "Actividad no válida.");
        s.expires = Math.min(now() + TTL - idleMs, s.tokenExpires);
        return send(200, { expiresAt: s.expires });
      }
      if (path === "/api/logout" && req.method === "POST") {
        sessions.delete(sid);
        res.setHeader("Set-Cookie", cookie(""));
        return send(200, { ok: true });
      }
      if (s.admin) {
        const verified = await upstream("carreras", s.token);
        if (verified.status === 403) {
          sessions.delete(sid);
          throw new HttpError(
            401,
            "Tus permisos cambiaron. Inicia sesión nuevamente.",
          );
        }
        checked(verified);
      }
      if (path === "/api/audit" && req.method === "GET") {
        if (!s.admin) throw new HttpError(403, "Solo un administrador puede consultar la bitácora.");
        return send(200, audit);
      }
      if (path === "/api/access") {
        if (!s.admin)
          throw new HttpError(
            403,
            "Solo un administrador puede asignar accesos.",
          );
        if (req.method === "GET") return send(200, await loadAccess());
        if (req.method !== "POST")
          throw new HttpError(405, "Operación no disponible.");
        const input = await bodyOf(req);
        if (
          typeof input.username !== "string" ||
          !["ESTUDIANTE", "DOCENTE"].includes(input.profile) ||
          !Number.isSafeInteger(input.personId) ||
          input.personId <= 0 ||
          typeof input.canEdit !== "boolean"
        )
          throw new HttpError(400, "Completa una cuenta, perfil e ID válidos.");
        for (const key of ["courseIds", "noteIds"])
          if (
            !Array.isArray(input[key]) ||
            input[key].some((id) => !Number.isSafeInteger(id) || id <= 0)
          )
            throw new HttpError(
              400,
              "Los IDs deben ser números enteros positivos separados por comas.",
            );
        if (input.username === s.username)
          throw new HttpError(
            400,
            "No puedes vincular tu propia cuenta desde esta pantalla.",
          );
        const user = (await list(s, "usuarios")).find(
          (u) => u.username === input.username,
        );
        if (user?.activo === false) throw new HttpError(409, "No puedes vincular una cuenta inactiva.");
        if (!user)
          throw new HttpError(404, "La cuenta no existe en el backend.");
        const student = input.profile === "ESTUDIANTE",
          personRoute = student ? "estudiantes" : "docentes";
        const people = await list(s, personRoute);
        if (!people.some((p) => p.id === input.personId && p.activo === true))
          throw new HttpError(
            400,
            "El estudiante o docente indicado no existe o no está disponible.",
          );
        const grants = {};
        if (student) {
          grants.estudiantes = { ids: [input.personId], actions: ["read"] };
          grants.inscripciones = {
            studentIds: [input.personId],
            actions: ["read"],
          };
        } else {
          const courses = await list(s, "cursos");
          if (input.courseIds.some((id) => !courses.some((c) => c.id === id && c.activo === true)))
            throw new HttpError(400, "Un curso asignado no existe.");
          const notes = await list(s, "nota"),
            names = courses
              .filter((c) => input.courseIds.includes(c.id))
              .map((c) => c.nombre);
          if (
            input.noteIds.some(
              (id) =>
                !notes.some((n) => n.id === id && names.includes(n.curso)),
            )
          )
            throw new HttpError(
              400,
              "Cada nota debe existir y corresponder a un curso asignado.",
            );
          grants.docentes = {
            ids: [input.personId],
            actions: input.canEdit ? ["read", "update"] : ["read"],
          };
          grants.cursos = { ids: input.courseIds, actions: ["read"] };
          grants.nota = {
            ids: input.noteIds,
            actions: input.canEdit ? ["read", "delete"] : ["read"],
          };
        }
        const old = await loadAccess();
        if (
          Object.entries(old).some(
            ([username, a]) =>
              username !== input.username &&
              a.modules?.[personRoute]?.ids?.includes(input.personId),
          )
        )
          throw new HttpError(
            409,
            "Este registro ya está vinculado a otra cuenta.",
          );
        for (const [key, item] of sessions)
          if (item.username === input.username) sessions.delete(key);
        try {
          await saveAssignment(input.username, {
            label: student ? "Estudiante" : "Docente",
            modules: grants,
          });
        } catch {
          throw new HttpError(
            500,
            "No se pudo guardar la vinculación en el portal. Reintenta; la cuenta y su rol no fueron modificados.",
          );
        }
        operationSucceeded = true;
        return send(200, { ok: true });
      }
      const match = path.match(
        /^\/api\/records\/([a-z]+)(?:\/([1-9][0-9]*))?$/,
      );
      if (!match) throw new HttpError(404, "Ruta no disponible.");
      const [, route, id] = match,
        action = {
          GET: "read",
          POST: "create",
          PUT: "update",
          DELETE: "delete",
        }[req.method];
      if (!action || !allowed(s, route, action))
        throw new HttpError(403, "No tienes permiso para esta operación.");
      if (
        (["PUT", "DELETE"].includes(req.method) && !id) ||
        (req.method === "POST" && id)
      )
        throw new HttpError(405, "Operación no disponible.");
      let actual;
      if (id) {
        actual = (await list(s, route)).find(
          (row) => String(row[modules[route].id]) === id,
        );
        if (!actual || !allowed(s, route, action, actual))
          throw new HttpError(404, "Registro no disponible para tu cuenta.");
      }
      if (req.method === "GET") {
        const rows = id ? [actual] : await list(s, route);
        const safe = rows
          .filter((row) => allowed(s, route, "read", row))
          .map((row) => ({
            ...sanitize(route, row),
            _actions: ["update", "delete"].filter((a) =>
              allowed(s, route, a, row),
            ),
          }));
        return send(200, id ? safe[0] : safe);
      }
      let body;
      if (req.method !== "DELETE") {
        body = validate(route, await bodyOf(req), !!id, actual);
        if (
          actual &&
          route === "inscripciones" &&
          (body.estudianteId !== actual.estudianteId ||
            body.cursoId !== actual.cursoId)
        )
          throw new HttpError(
            403,
            "No puedes cambiar la asignación de esta inscripción.",
          );
        if (!s.admin && route === "nota" && req.method !== "POST")
          throw new HttpError(403, "Operación no disponible.");
      }
      if (actual?.activo === false) throw new HttpError(409, "El registro está inactivo. No se puede modificar desde esta operación.");
      if (route === "inscripciones" && body) {
        const key = `${body.estudianteId}:${body.cursoId}`;
        if (pendingEnrollments.has(key)) throw new HttpError(409, "Ya hay una inscripción para este estudiante y curso en proceso. Actualiza el listado.");
        pendingEnrollments.add(key);
        enrollmentKey = key;
        const [students, courses, enrollments] = await Promise.all([list(s, "estudiantes"), list(s, "cursos"), list(s, "inscripciones")]);
        if (!students.some((p) => p.id === body.estudianteId && p.activo === true)) throw new HttpError(400, "Selecciona un estudiante existente y activo.");
        if (!courses.some((c) => c.id === body.cursoId && c.activo === true)) throw new HttpError(400, "Selecciona un curso existente y activo.");
        if (enrollments.some((e) => String(e.id) !== id && e.activo !== false && e.estudianteId === body.estudianteId && e.cursoId === body.cursoId)) throw new HttpError(409, "El estudiante ya tiene una inscripción vigente en este curso.");
      }
      let noteCourseId = null;
      if (route === "nota" && body) {
        const courses = await list(s, "cursos");
        const matches = courses.filter((c) => c.nombre === body.curso && c.activo === true);
        if (matches.length !== 1 || !allowed(s, "cursos", "read", matches[0])) throw new HttpError(400, "Selecciona un curso activo asignado con nombre único.");
        noteCourseId = matches[0].id;
      }
      if (req.method === "DELETE" && ["estudiantes", "cursos"].includes(route)) {
        const enrollments = await list(s, "inscripciones");
        const field = route === "estudiantes" ? "estudianteId" : "cursoId";
        if (enrollments.some((e) => String(e[field]) === id && e.activo !== false)) throw new HttpError(409, "No se puede dar de baja un registro con inscripciones vigentes.");
      }
      if (now() >= s.expires || !sessions.has(sid))
        throw new HttpError(401, "Tu sesión venció.");
      const result = checked(
        await upstream(route + (id ? `/${id}` : ""), s.token, req.method, body),
      );
      operationSucceeded = true;
      let message;
      if (route === "nota" && req.method === "POST" && !s.admin) {
        const link = noteLinkQueue.then(async () => {
          if (!Number.isSafeInteger(result?.id) || result.id <= 0) throw new Error("Missing note ID");
          const assignments = await loadAccess();
          const assignment = assignments[s.username];
          if (!assignment?.modules?.cursos?.ids?.includes(noteCourseId) ||
              !assignment.modules.nota?.actions?.includes("read") ||
              !assignment.modules.docentes?.ids?.some((id) => s.grants.docentes?.ids?.includes(id))) throw new Error("Assignment changed");
          const grants = structuredClone(assignment.modules);
          grants.nota.ids = [...new Set([...(grants.nota.ids || []), result.id])];
          await saveAssignment(s.username, { ...assignment, modules: grants });
          for (const session of sessions.values()) if (session.username === s.username) session.grants = structuredClone(grants);
        });
        noteLinkQueue = link.catch(() => {});
        try { await link; } catch {
          message = "La nota fue creada, pero no se pudo vincular a tu cuenta. No vuelvas a crearla; solicita al administrador que la vincule.";
        }
      }
      if (route === "usuarios" && actual) {
        for (const [key, item] of sessions)
          if (item.username === actual.username) sessions.delete(key);
      }
      return send(200, {
        ok: true,
        ...(message ? { message } : {}),
        record:
          result && typeof result === "object" ? sanitize(route, result) : null,
      });
    } catch (error) {
      if (error.status === 401) {
        sessions.delete(sid);
        res.setHeader("Set-Cookie", cookie(""));
      }
      send(error.status || 500, {
        error: error.status
          ? error.message
          : "No se pudo completar la operación. Revisa la configuración del servidor.",
      });
    }
  };
}
