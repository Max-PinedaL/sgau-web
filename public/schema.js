const field = (key, label, type = "text") => ({ key, label, type });
const name = () => [field("nombre", "Nombre"), field("apellido", "Apellido")];
const active = field("activo", "Estado del registro", "boolean");
export const modules = {
  usuarios: {
    title: "Usuarios",
    singular: "usuario",
    mark: "US",
    section: "Administración",
    id: "id",
    fields: [
      ...name(),
      field("username", "Usuario"),
      field("email", "Correo", "email"),
      field("rol", "Rol", "role"),
      field("password", "Contraseña", "password"),
      active,
    ],
    note: "Las cuentas son independientes de estudiantes y docentes. Al editar, selecciona el rol; una contraseña vacía conserva la anterior.",
  },
  estudiantes: {
    title: "Estudiantes",
    singular: "estudiante",
    mark: "ES",
    section: "Comunidad",
    id: "id",
    fields: [
      ...name(),
      field("carnet", "Carnet"),
      field("edad", "Edad", "integer"),
      field("grado", "Grado"),
      active,
    ],
    note: "El estado se consulta, pero el endpoint de edición no lo modifica.",
  },
  docentes: {
    title: "Docentes",
    singular: "docente",
    mark: "DO",
    section: "Comunidad",
    id: "id",
    soft: true,
    fields: [
      ...name(),
      field("email", "Correo", "email"),
      field("telefono", "Teléfono", "tel"),
      field("materia", "Materia"),
      active,
    ],
    note: "Dar de baja retira al docente del listado sin borrar su registro.",
  },
  carreras: {
    title: "Carreras",
    singular: "carrera",
    mark: "CA",
    section: "Académico",
    id: "idCarrera",
    soft: true,
    fields: [field("nombre", "Nombre")],
    note: "Catálogo de carreras. La baja retira el registro del listado.",
  },
  cursos: {
    title: "Cursos",
    singular: "curso",
    mark: "CU",
    section: "Académico",
    id: "id",
    fields: [
      field("nombre", "Nombre"),
      field("descripcion", "Descripción"),
      active,
    ],
    note: "Catálogo de cursos. Las inscripciones se gestionan en su propio módulo.",
  },
  inscripciones: {
    title: "Inscripciones",
    singular: "inscripción",
    mark: "IN",
    section: "Académico",
    id: "id",
    soft: true,
    fields: [
      field("estudianteId", "Estudiante", "id"),
      field("cursoId", "Curso", "id"),
      field("fechaInscripcion", "Fecha de inscripción", "date"),
      field("estado", "Estado de inscripción"),
      { ...active, label: "Vigencia del registro" },
    ],
    note: "El servidor asigna la fecha de inscripción y el estado inicial ACTIVA.",
  },
  colegiaturas: {
    title: "Colegiaturas",
    singular: "colegiatura",
    mark: "CO",
    section: "Administración",
    id: "idColegiatura",
    soft: true,
    fields: [
      field("descripcion", "Descripción"),
      field("monto", "Monto", "decimal"),
      active,
    ],
    note: "El servicio actual descarta la descripción. Este catálogo no registra pagos ni saldos individuales.",
  },
  nota: {
    title: "Notas",
    singular: "nota",
    mark: "NO",
    section: "Académico",
    id: "id",
    noUpdate: true,
    fields: [
      field("descripcion", "Descripción"),
      field("valor", "Valor", "integer"),
      field("curso", "Curso"),
    ],
    note: "El backend guarda un valor entero y el nombre del curso; no vincula la nota con un estudiante ni permite editarla.",
  },
};
export function formFields(route, editing) {
  return modules[route].fields.filter(
    (f) =>
      !(f.key === "activo" && !["usuarios", "cursos"].includes(route)) &&
      !(
        route === "inscripciones" &&
        (f.key === "fechaInscripcion" || (!editing && f.key === "estado"))
      ) &&
      !(route === "colegiaturas" && f.key === "descripcion"),
  );
}
export function titleOf(route, row) {
  return (
    [row.nombre, row.apellido].filter(Boolean).join(" ") ||
    row.descripcion ||
    `${modules[route].title} #${row[modules[route].id]}`
  );
}
export function display(v) {
  return v === true
    ? "Activo"
    : v === false
      ? "Inactivo"
      : v === null || v === undefined || v === ""
        ? "—"
        : String(v);
}
