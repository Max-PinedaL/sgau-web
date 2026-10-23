import { modules, formFields } from "../public/schema.js";
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
export function allowed(s, route, action, row) {
  const m = modules[route];
  if (!m || (action === "update" && m.noUpdate) || !s.available.includes(route))
    return false;
  if (s.admin) return true;
  if (
    action !== "read" &&
    ["usuarios", "carreras", "colegiaturas"].includes(route)
  )
    return false;
  if (route === "inscripciones" && action !== "read") return false;
  if (action === "create") return route === "nota" &&
    s.available.includes("docentes") && s.available.includes("cursos") &&
    !!s.grants.docentes?.ids?.length && !!s.grants.cursos?.ids?.length &&
    s.grants.cursos?.actions?.includes("read") && s.grants.nota?.actions?.includes("read");
  const g = s.grants[route];
  if (!g || !g.actions?.includes(action)) return false;
  if (!row) return true;
  return (
    g.ids?.includes(Number(row[m.id])) ||
    (route === "inscripciones" &&
      g.studentIds?.includes(Number(row.estudianteId))) ||
    false
  );
}
export function sanitize(route, row) {
  const m = modules[route];
  const keys = [
    m.id,
    ...m.fields
      .filter((f) => !["password", "rol"].includes(f.key))
      .map((f) => f.key),
    "fechaCreacion",
    "fechaActualizacion",
  ];
  return Object.fromEntries(
    keys.filter((k) => Object.hasOwn(row, k)).map((k) => [k, row[k]]),
  );
}
export function validate(route, input, editing, actual) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new HttpError(400, "Datos no válidos.");
  const fields = formFields(route, editing),
    body = {};
  if (Object.keys(input).some((k) => !fields.some((f) => f.key === k)))
    throw new HttpError(400, "El formulario contiene campos no permitidos.");
  for (const f of fields) {
    let v = input[f.key];
    if (f.type === "password" && editing && (v === "" || v === undefined))
      continue;
    if (v === undefined || v === null || (typeof v === "string" && !v.trim()))
      throw new HttpError(400, `Completa ${f.label}.`);
    if (f.type === "boolean") {
      if (typeof v !== "boolean")
        throw new HttpError(400, `Selecciona ${f.label}.`);
    } else if (["integer", "id", "decimal"].includes(f.type)) {
      if (
        typeof v !== "number" ||
        !Number.isFinite(v) ||
        (f.type !== "decimal" && !Number.isSafeInteger(v)) ||
        (f.type === "id" && v <= 0) ||
        (f.key === "edad" && v < 0) ||
        (f.type === "integer" && (v < -2147483648 || v > 2147483647))
      )
        throw new HttpError(400, `Número no válido en ${f.label}.`);
    } else {
      const limit = route === "usuarios" ? ({ username: 50, email: 100, nombre: 60, apellido: 60 }[f.key] || 4000) : 4000;
      if (typeof v !== "string" || v.trim().length > limit)
        throw new HttpError(400, `Texto no válido en ${f.label}.`);
      if (f.type !== "password") v = v.trim();
      if (f.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v))
        throw new HttpError(400, "Correo no válido.");
      if (
        f.type === "role" &&
        !["ADMIN", "USER", "ESTUDIANTE", "DOCENTE"].includes(v)
      )
        throw new HttpError(400, "Rol no válido.");
    }
    if (f.key === "monto" && v < 0) throw new HttpError(400, "El monto no puede ser negativo.");
    body[f.key] = v;
  }
  if (
    !editing &&
    ["estudiantes", "docentes", "inscripciones", "colegiaturas"].includes(route)
  )
    body.activo = true;
  if (editing && route === "colegiaturas") {
    if (typeof actual?.activo !== "boolean")
      throw new HttpError(409, "Actualiza el registro para conocer su estado.");
    body.activo = actual.activo;
  }
  return body;
}
