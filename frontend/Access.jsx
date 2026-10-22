import { useEffect, useState } from "react";
export default function Access({ request, notify }) {
  const [data, setData] = useState(null),
    [error, setError] = useState(""),
    [revision, setRevision] = useState(0),
    [busy, setBusy] = useState(false),
    [username, setUsername] = useState(""),
    [profile, setProfile] = useState("ESTUDIANTE"),
    [person, setPerson] = useState(""),
    [courses, setCourses] = useState(""),
    [notes, setNotes] = useState(""),
    [canEdit, setCanEdit] = useState(false);
  useEffect(() => {
    let active = true;
    setError("");
    Promise.all([request("/api/records/usuarios"), request("/api/access"), request("/api/records/estudiantes"), request("/api/records/docentes")])
      .then(([users, assignments, estudiantes, docentes]) => {
        if (active) setData({ users, assignments, estudiantes, docentes });
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
    setCourses((a?.modules?.cursos?.ids || []).join(", "));
    setNotes((a?.modules?.nota?.ids || []).join(", "));
    setCanEdit(a?.modules?.docentes?.actions?.includes("update") || false);
  }
  async function save(e) {
    e.preventDefault();
    const parse = (v) =>
      v.trim() ? v.split(",").map((x) => Number(x.trim())) : [];
    setBusy(true);
    setError("");
    try {
      await request("/api/access", "POST", {
        username,
        profile,
        personId: Number(person),
        courseIds: profile === "DOCENTE" ? parse(courses) : [],
        noteIds: profile === "DOCENTE" ? parse(notes) : [],
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
          <div className="spinner" />
        )
      ) : (
        <form className="access-grid" onSubmit={save}>
          <label>
            Cuenta del backend
            <select
              aria-label="Cuenta del backend"
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
              onChange={(e) => { setProfile(e.target.value); setPerson(""); setCourses(""); setNotes(""); setCanEdit(false); }}
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
              {(profile === "DOCENTE" ? data.docentes : data.estudiantes).map((p) => {
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
              <label>
                IDs de cursos asignados
                <input
                  placeholder="Ejemplo: 2, 5"
                  value={courses}
                  onChange={(e) => setCourses(e.target.value)}
                  disabled={busy}
                />
              </label>
              <label>
                IDs de notas asignadas
                <input
                  placeholder="Ejemplo: 12, 18"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  disabled={busy}
                />
              </label>
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
          <p className="notice">
            El rol se administra en Usuarios y no cambia al vincular datos.
            El servicio actual no devuelve el rol de las cuentas: selecciona el tipo de registro que corresponda al rol existente.
            Esta pantalla solo guarda los vínculos y permisos del portal.
          </p>
          <button disabled={busy} type="submit">
            {busy ? "Guardando…" : "Guardar vinculación"}
          </button>
        </form>
      )}
    </>
  );
}
