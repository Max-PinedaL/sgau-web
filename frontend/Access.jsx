import Loading from "./Loading.jsx";
import { useEffect, useState } from "react";
export default function Access({ request, notify }) {
  const [data, setData] = useState(null),
    [error, setError] = useState(""),
    [revision, setRevision] = useState(0),
    [busy, setBusy] = useState(false),
    [username, setUsername] = useState(""),
    [profile, setProfile] = useState("ESTUDIANTE"),
    [person, setPerson] = useState(""),
    [courses, setCourses] = useState([]),
    [notes, setNotes] = useState([]),
    [canEdit, setCanEdit] = useState(false);
  useEffect(() => {
    let active = true;
    setError("");
    Promise.all([request("/api/records/usuarios"), request("/api/access"), request("/api/records/estudiantes"), request("/api/records/docentes"), request("/api/records/cursos"), request("/api/records/nota")])
      .then(([users, assignments, estudiantes, docentes, cursos, notas]) => {
        if (active) setData({ users, assignments, estudiantes, docentes, cursos, notas });
      })
      .catch((err) => {
        if (active) setError(err.message);
      });
    return () => {
      active = false;
    };
  }, [revision, request]);
  function select(name) {
    setUsername(name);
    const a = data.assignments[name];
    setProfile(a?.label === "Docente" ? "DOCENTE" : "ESTUDIANTE");
    setPerson(
      String(
        a?.modules?.estudiantes?.ids?.[0] ||
          a?.modules?.docentes?.ids?.[0] ||
          "",
      ),
    );
    setCourses(a?.modules?.cursos?.ids || []);
    setNotes(a?.modules?.nota?.ids || []);
    setCanEdit(a?.modules?.docentes?.actions?.includes("update") || false);
  }
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await request("/api/access", "POST", {
        username,
        profile,
        personId: Number(person),
        courseIds: profile === "DOCENTE" ? courses : [],
        noteIds: profile === "DOCENTE" ? notes : [],
        canEdit: profile === "DOCENTE" && canEdit,
      });
      notify(
        "Vinculación guardada. La cuenta deberá iniciar sesión de nuevo.",
      );
      setRevision((v) => v + 1);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  const courseNames = (data?.cursos || []).filter((c) => courses.includes(c.id)).map((c) => c.nombre);
  const availableNotes = (data?.notas || []).filter((n) => courseNames.includes(n.curso));
  return (
    <>
      <div className="page-head">
        <div>
          <p className="eyebrow">ADMINISTRACIÓN</p>
          <h1>Vinculación de datos</h1>
          <p className="muted">Cada cuenta, únicamente sus registros.</p>
        </div>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!data ? (
        error ? (
          <button onClick={() => setRevision((v) => v + 1)}>Reintentar</button>
        ) : (
          <Loading />
        )
      ) : (
        <form className="access-grid" onSubmit={save}>
          <label>
            Cuenta de usuario
            <select
              aria-label="Cuenta de usuario"
              required
              value={username}
              onChange={(e) => select(e.target.value)}
              disabled={busy}
            >
              <option value="">Selecciona una cuenta</option>
              {data.users.map((u) => (
                <option key={u.id} value={u.username}>
                  {u.username} · {u.nombre} {u.apellido}
                </option>
              ))}
            </select>
          </label>
          <label>
            Tipo de registro a vincular
            <select
              value={profile}
              onChange={(e) => { setProfile(e.target.value); setPerson(""); setCourses([]); setNotes([]); setCanEdit(false); }}
              disabled={busy}
            >
              <option value="ESTUDIANTE">Estudiante</option>
              <option value="DOCENTE">Docente</option>
            </select>
          </label>
          <label>
            {profile === "DOCENTE" ? "Docente existente" : "Estudiante existente"}
            <select
              required
              value={person}
              onChange={(e) => setPerson(e.target.value)}
              disabled={busy || !username}
            >
              <option value="">Selecciona un registro</option>
              {(profile === "DOCENTE" ? data.docentes : data.estudiantes).filter((p) => p.activo === true).map((p) => {
                const route = profile === "DOCENTE" ? "docentes" : "estudiantes";
                const linked = Object.entries(data.assignments).some(([account, a]) => account !== username && a.modules?.[route]?.ids?.includes(p.id));
                return <option key={p.id} value={p.id} disabled={linked}>
                  {[p.nombre, p.apellido].filter(Boolean).join(" ") || "Sin nombre"} · ID {p.id}{linked ? " · Ya vinculado" : ""}
                </option>;
              })}
            </select>
          </label>
          {profile === "DOCENTE" && (
            <>
              <fieldset className="assignment-list" disabled={busy || !username}>
                <legend>Cursos asignados</legend>
                <p className="muted">Selecciona uno o varios cursos.</p>
                {!data.cursos.length && <p>No hay cursos disponibles.</p>}
                {data.cursos.filter((course) => course.activo === true).map((course) => (
                  <label className="checks" key={course.id}>
                    <input type="checkbox" checked={courses.includes(course.id)} onChange={(e) => {
                      const next = e.target.checked ? [...courses, course.id] : courses.filter((id) => id !== course.id);
                      setCourses(next);
                      const names = data.cursos.filter((c) => next.includes(c.id)).map((c) => c.nombre);
                      setNotes((old) => old.filter((id) => data.notas.some((n) => n.id === id && names.includes(n.curso))));
                    }} />
                    {course.nombre || "Sin nombre"} · ID {course.id}
                  </label>
                ))}
              </fieldset>
              <fieldset className="assignment-list" disabled={busy || !username}>
                <legend>Notas asignadas</legend>
                <p className="muted">Solo aparecen notas de los cursos seleccionados.</p>
                {!availableNotes.length && <p>{courses.length ? "No hay notas disponibles para estos cursos." : "Selecciona primero un curso."}</p>}
                {availableNotes.map((note) => (
                  <label className="checks" key={note.id}>
                    <input type="checkbox" checked={notes.includes(note.id)} onChange={(e) => setNotes((old) => e.target.checked ? [...old, note.id] : old.filter((id) => id !== note.id))} />
                    {note.descripcion || "Sin descripción"} · {note.curso} · Valor: {note.valor ?? "—"} · ID {note.id}
                  </label>
                ))}
              </fieldset>
              <label className="checks">
                <input
                  type="checkbox"
                  checked={canEdit}
                  onChange={(e) => setCanEdit(e.target.checked)}
                  disabled={busy}
                />
                Permitir editar su ficha docente y eliminar sus notas asignadas
              </label>
            </>
          )}

          <button disabled={busy} type="submit">
            {busy ? <Loading compact text="Guardando…" /> : "Guardar vinculación"}
          </button>
        </form>
      )}
    </>
  );
}
