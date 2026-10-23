import Loading from "./Loading.jsx";
import { useEffect, useRef, useState } from "react";
import { modules, formFields, titleOf, display } from "../public/schema.js";
export default function RecordDialog({
  route,
  initial,
  request,
  onClose,
  onSaved,
}) {
  const m = modules[route],
    dialog = useRef(null),
    passwordInput = useRef(null),
    [mode, setMode] = useState(initial.mode),
    [row] = useState(initial.row || null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [options, setOptions] = useState({});
  const fields = formFields(route, !!row);
  const [values, setValues] = useState(() =>
    Object.fromEntries(
      fields.filter((f) => f.type !== "password").map((f) => [
        f.key,
        f.type === "boolean"
            ? String(row?.[f.key] ?? true)
            : f.type === "role"
              ? row
                ? ""
                : "ESTUDIANTE"
              : String(row?.[f.key] ?? ""),
      ]),
    ),
  );
  useEffect(() => {
    const d = dialog.current;
    d.showModal();
    return () => {
      if (d.open) d.close();
    };
  }, []);
  useEffect(() => {
    let active = true;
    if (mode === "edit")
      for (const related of route === "inscripciones"
        ? ["estudiantes", "cursos"]
        : route === "nota"
          ? ["cursos"]
          : []) {
        request(`/api/records/${related}`)
          .then((data) => {
            if (active) setOptions((old) => ({ ...old, [related]: data }));
          })
          .catch((err) => { if (active) setError(err.message); });
      }
    return () => {
      active = false;
    };
  }, [route, mode, request]);
  async function save(e) {
    e.preventDefault();
    const payload = {};
    for (const f of fields) {
      const value = f.type === "password" ? passwordInput.current.value : values[f.key];
      if (f.type === "password" && row && !value) continue;
      payload[f.key] =
        f.type === "boolean"
          ? value === "true"
          : ["integer", "id", "decimal"].includes(f.type)
            ? value.trim()
              ? Number(value)
              : null
            : value;
    }
    if (passwordInput.current) passwordInput.current.value = "";
    setBusy(true);
    setError("");
    try {
      const result = await request(
        `/api/records/${route}${row ? "/" + row[m.id] : ""}`,
        row ? "PUT" : "POST",
        payload,
      );
      onSaved(result.message || "Datos guardados correctamente.");
    } catch (err) {
      setError(err.message);
    } finally {
      if (payload.password) payload.password = "";
      setBusy(false);
    }
  }
  async function remove() {
    setBusy(true);
    setError("");
    try {
      await request(`/api/records/${route}/${row[m.id]}`, "DELETE");
      onSaved("Operación completada.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  const title =
    mode === "delete"
      ? m.soft
        ? "Dar de baja"
        : "Eliminar registro"
      : mode === "edit"
        ? `${row ? "Editar" : "Crear"} ${m.singular}`
        : titleOf(route, row);
  return (
    <dialog
      ref={dialog}
      aria-labelledby="dialog-title"
      onCancel={(e) => {
        if (busy) e.preventDefault();
        else onClose();
      }}
    >
      <div className="dialog-head">
        <div>
          <p className="eyebrow">{m.title}</p>
          <h2 id="dialog-title">{title}</h2>
        </div>
        <button
          type="button"
          className="secondary"
          disabled={busy}
          onClick={onClose}
          aria-label="Cerrar ventana"
        >
          ✕
        </button>
      </div>
      <div className="dialog-body">
        {mode === "detail" && (
          <>
            <dl className="details">
              {Object.entries(row)
                .filter(([key]) => !key.startsWith("_"))
                .map(([key, value]) => (
                  <div key={key}>
                    <dt>
                      {m.fields.find((f) => f.key === key)?.label ||
                        {
                          [m.id]: "ID",
                          fechaCreacion: "Creación",
                          fechaActualizacion: "Actualización",
                        }[key] ||
                        key}
                    </dt>
                    <dd>{display(value)}</dd>
                  </div>
                ))}
            </dl>
            <div className="dialog-foot">
              {row._actions.includes("update") && (
                <button onClick={() => setMode("edit")}>Editar</button>
              )}
              {row._actions.includes("delete") && (
                <button className="danger" onClick={() => setMode("delete")}>
                  {m.soft ? "Dar de baja" : "Eliminar"}
                </button>
              )}
              <button className="secondary" onClick={onClose}>
                Cerrar
              </button>
            </div>
          </>
        )}
        {mode === "delete" && (
          <>
            <p>
              {titleOf(route, row)} (ID {row[m.id]})
            </p>
            <p className="muted">
              {m.soft
                ? "El registro dejará de aparecer en el listado. La app no ofrece reactivación."
                : "El registro se eliminará. Esta acción no se puede deshacer."}
            </p>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <div className="dialog-foot">
              <button
                disabled={busy}
                className="secondary"
                onClick={() => setMode("detail")}
              >
                Cancelar
              </button>
              <button disabled={busy} className="danger" onClick={remove}>
                {busy ? <Loading compact text="Procesando…" /> : "Confirmar"}
              </button>
            </div>
          </>
        )}
        {mode === "edit" && (
          <form onSubmit={save}>
            <div className="form-grid">
              {fields.map((f) => {
                const related =
                  route === "inscripciones"
                    ? f.key === "estudianteId"
                      ? "estudiantes"
                      : f.key === "cursoId"
                        ? "cursos"
                        : null
                    : route === "nota" && f.key === "curso"
                      ? "cursos"
                      : null;
                const common = {
                  name: f.key,
                  "aria-label": f.label,
                  required: !(row && f.type === "password"),
                  ...(f.type === "password" ? { ref: passwordInput } : {
                    value: values[f.key],
                    onChange: (e) => setValues((old) => ({ ...old, [f.key]: e.target.value })),
                  }),
                  disabled: busy || (route === "inscripciones" && !!row && ["estudianteId", "cursoId"].includes(f.key)),
                };
                return (
                  <label key={f.key}>
                    {f.label}
                    {related ? (
                      <select {...common} disabled={common.disabled || !options[related]}>
                        <option value="">{options[related] ? "Selecciona un registro" : "Cargando registros…"}</option>
                        {(options[related] || []).filter((item) => item.activo === true).map((item) => (
                          <option key={item[modules[related].id]} value={route === "nota" ? item.nombre : item[modules[related].id]}>
                            {titleOf(related, item)} · ID {item[modules[related].id]}
                          </option>
                        ))}
                      </select>
                    ) : ["boolean", "role"].includes(f.type) ? (
                      <select {...common}>
                        {(f.type === "boolean"
                          ? [
                              ["true", "Activo"],
                              ["false", "Inactivo"],
                            ]
                          : [
                              ["", "Selecciona un rol"],
                              ["ESTUDIANTE", "Estudiante"],
                              ["DOCENTE", "Docente"],
                              ["USER", "Usuario"],
                              ["ADMIN", "Administrador"],
                            ]
                        ).map(([v, label]) => (
                          <option key={v} value={v}>
                            {label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        {...common}
                        type={
                          ["integer", "id", "decimal"].includes(f.type)
                            ? "number"
                            : ["password", "email", "tel"].includes(f.type)
                              ? f.type
                              : "text"
                        }
                        step={f.type === "decimal" ? "any" : "1"}
                        min={
                          f.type === "id" ? 1 : f.key === "edad" ? 0 : undefined
                        }
                        maxLength={4000}
                        autoComplete={
                          f.type === "password" ? "new-password" : undefined
                        }
                        list={
                          related && options[related]
                            ? `options-${f.key}`
                            : undefined
                        }
                      />
                    )}{" "}
                    {f.type === "password" && row && (
                      <small>Vacía para conservar la contraseña actual.</small>
                    )}
                  </label>
                );
              })}
            </div>
      
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <div className="dialog-foot">
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={onClose}
              >
                Cancelar
              </button>
              <button disabled={busy} type="submit">
                {busy ? <Loading compact text="Guardando…" /> : "Guardar"}
              </button>
            </div>
          </form>
        )}
      </div>
    </dialog>
  );
}
