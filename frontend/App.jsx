import Loading from "./Loading.jsx";
import { useEffect, useRef, useState } from "react";
import { modules, display } from "../public/schema.js";
import { useSession } from "./Session.jsx";
import RecordDialog from "./RecordDialog.jsx";
import Access from "./Access.jsx";
import Audit from "./Audit.jsx";
function Brand() {
  return (
    <div className="brand">
      <img src="/logo.webp" alt="Universidad Mariano Gálvez" />
      <div>
        <strong>SGAU</strong>
        <small>PORTAL ACADÉMICO</small>
      </div>
    </div>
  );
}
function Login({ login, message }) {
  const [username, setUsername] = useState(""),
    passwordInput = useRef(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const credentials = { username: username.trim(), password: passwordInput.current.value };
    passwordInput.current.value = "";
    try {
      await login(credentials);
    } catch (err) {
      setError(err.message);
    } finally {
      credentials.password = "";
      setBusy(false);
    }
  }
  return (
    <main className="login">
      <section className="login-story">
        <Brand />
        <div>
          <p className="eyebrow">COMUNIDAD · APRENDIZAJE · GESTIÓN</p>
          <h1>
            Tu comunidad.
            <br />
            <span>Un solo lugar.</span>
          </h1>
          <p>
            Un espacio para conectar la información académica y acompañar cada
            etapa de la vida escolar.
          </p>
        </div>
        <div className="story-footer">
          Sistema de Gestión Académica Universitaria
        </div>
        <div className="orbit" aria-hidden="true" />
      </section>
      <section className="login-panel">
        <div className="login-card">
          <p className="eyebrow">BIENVENIDO AL PORTAL</p>
          <h2>Continuemos aprendiendo.</h2>
          <p className="muted">Ingresa con tu cuenta institucional.</p>
          <form onSubmit={submit}>
            <label>
              Usuario
              <input
                name="username"
                autoComplete="username"
                required
                maxLength={200}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={busy}
              />
            </label>
            <label>
              Contraseña
              <input
                type="password"
                name="password"
                autoComplete="current-password"
                required
                maxLength={4000}
                ref={passwordInput}
                disabled={busy}
              />
            </label>
            {(error || message) && (
              <div className="error" role="alert">
                {error || message}
              </div>
            )}
            <button type="submit" disabled={busy}>
              {busy ? <Loading compact text="Verificando acceso…" /> : "Iniciar sesión →"}
            </button>
          </form>
          <div className="secure-note">
            Tu sesión se cerrará después de 60 segundos sin actividad. Mantén
            tus credenciales privadas.
          </div>
          <p className="login-small">
            ¿No tienes cuenta? Solicita al administrador que la cree para ti.
          </p>
        </div>
      </section>
    </main>
  );
}
function Home({ session, navigate }) {
  return (
    <>
      <section className="welcome">
        <div>
          <p className="eyebrow">TU ESPACIO ACADÉMICO</p>
          <h1>Hola, {session.username}.</h1>
          <p>
            Encuentra aquí los módulos disponibles para tu cuenta. Cada
            registro, en su lugar.
          </p>
        </div>
        <div className="welcome-badge">
          <strong>{Object.keys(session.permissions).length}</strong>
          <small>MÓDULOS DISPONIBLES</small>
        </div>
      </section>
      <div className="page-head">
        <div>
          <h2>¿Qué necesitas hacer hoy?</h2>
          <p className="muted">Selecciona un módulo para comenzar.</p>
        </div>
      </div>
      <div className="module-grid">
        {Object.entries(session.permissions).map(([key, p]) => (
          <button
            key={key}
            className="module-card"
            onClick={() => navigate(key)}
          >
            <span className="nav-mark">{modules[key].mark}</span>
            <h3>{modules[key].title}</h3>
            <small>
              {p.actions.length > 1
                ? "Consultar y gestionar"
                : "Consultar mis registros"}
            </small>
            <span className="arrow">Abrir módulo →</span>
          </button>
        ))}
      </div>
    </>
  );
}
function Records({ route, session, request, notify }) {
  const m = modules[route],
    [rows, setRows] = useState(null),
    [error, setError] = useState(""),
    [search, setSearch] = useState(""),
    [page, setPage] = useState(1),
    [revision, setRevision] = useState(0),
    [dialog, setDialog] = useState(null);
  useEffect(() => {
    let active = true;
    setRows(null);
    setError("");
    request(`/api/records/${route}`)
      .then((data) => {
        if (active) setRows(data);
      })
      .catch((err) => {
        if (active) setError(err.message);
      });
    return () => {
      active = false;
    };
  }, [route, revision, request]);
  const fields = m.fields.filter((f) => !["password", "rol"].includes(f.key));
  const filtered = (rows || []).filter((row) =>
      Object.entries(row)
        .filter(([k]) => k !== "_actions")
        .some(([, v]) =>
          String(v ?? "")
            .toLocaleLowerCase()
            .includes(search.toLocaleLowerCase()),
        ),
    ),
    pages = Math.max(1, Math.ceil(filtered.length / 10)),
    current = Math.min(page, pages);
  return (
    <>
      <div className="page-head">
        <div>
          <p className="eyebrow">{m.section}</p>
          <h1>{m.title}</h1>
          <p className="muted">
            Consulta y organiza la información de tu institución.
          </p>
        </div>
        <div className="actions">
          <button
            className="secondary"
            onClick={() => setRevision((v) => v + 1)}
          >
            Actualizar
          </button>
          {session.permissions[route].actions.includes("create") && (
            <button onClick={() => setDialog({ mode: "edit" })}>
              + Crear {m.singular}
            </button>
          )}
        </div>
      </div>
      <div className="panel">
        {error ? (
          <div className="loading-row">
            <p className="error" role="alert">
              {error}
            </p>
            <button onClick={() => setRevision((v) => v + 1)}>
              Reintentar
            </button>
          </div>
        ) : !rows ? (
          <div className="loading-row">
            <Loading text="Consultando registros…" />
          </div>
        ) : (
          <>
            <div className="toolbar">
              <input
                type="search"
                aria-label="Buscar registros"
                placeholder="Buscar en este listado…"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
              <span className="muted">Datos del servicio académico</span>
            </div>
            <div className="table-wrap">
              {!filtered.length ? (
                <div className="empty">
                  <h3>
                    {search ? "Sin coincidencias" : "Todavía no hay registros"}
                  </h3>
                  <p>
                    {search
                      ? "Prueba con otra búsqueda."
                      : "Los registros disponibles para tu cuenta aparecerán aquí."}
                  </p>
                </div>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>ID</th>
                      {fields.map((f) => (
                        <th key={f.key}>{f.label}</th>
                      ))}
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered
                      .slice((current - 1) * 10, current * 10)
                      .map((row) => (
                        <tr key={row[m.id]}>
                          <td>{display(row[m.id])}</td>
                          {fields.map((f) => (
                            <td key={f.key} title={display(row[f.key])}>
                              {f.type === "boolean" &&
                              typeof row[f.key] === "boolean" ? (
                                <span
                                  className={
                                    "badge" + (!row[f.key] ? " inactive" : "")
                                  }
                                >
                                  {display(row[f.key])}
                                </span>
                              ) : (
                                display(row[f.key])
                              )}
                            </td>
                          ))}
                          <td>
                            <button
                              className="secondary"
                              onClick={() => setDialog({ mode: "detail", row })}
                            >
                              Ver detalle
                            </button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="pagination">
              <span className="muted">
                {filtered.length} registros · Página {current} de {pages}
              </span>
              <div className="actions">
                <button
                  className="secondary"
                  disabled={current <= 1}
                  onClick={() => setPage(current - 1)}
                >
                  ← Anterior
                </button>
                <button
                  className="secondary"
                  disabled={current >= pages}
                  onClick={() => setPage(current + 1)}
                >
                  Siguiente →
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {dialog && (
        <RecordDialog
          route={route}
          initial={dialog}
          request={request}
          onClose={() => setDialog(null)}
          onSaved={(message) => {
            setDialog(null);
            notify(message);
            setRevision((v) => v + 1);
          }}
        />
      )}
    </>
  );
}
function Workspace({ auth, notify }) {
  const { session, seconds, logout, request } = auth,
    [route, setRoute] = useState("home");
  if (session.pendingAssignment) return (
    <div className="pending-shell">
      <header className="topbar">
        <Brand />
        <div className="identity"><strong>{session.username}</strong></div>
        <button className="secondary" onClick={logout}>Cerrar sesión</button>
      </header>
      <main className="pending-content">
        <h1>Pendiente de asignación</h1>
        <p>Tu cuenta está lista. El administrador debe asignarte tus registros para habilitar los módulos.</p>
        <img src="/pending.gif" alt="Animación de espera mientras se asigna tu cuenta" className="pending-image" />
      </main>
    </div>
  );
  return (
    <div className="shell">
      <aside className="sidebar">
        <Brand />
        <nav aria-label="Módulos">
          <button
            className={"nav-item" + (route === "home" ? " selected" : "")}
            onClick={() => setRoute("home")}
          >
            Inicio
          </button>
          {["Comunidad", "Académico", "Administración"].map((section) => {
            const entries = Object.entries(modules).filter(
              ([key, m]) => m.section === section && session.permissions[key],
            );
            return entries.length ? (
              <div key={section} className="nav-group">
                <div className="nav-label">{section}</div>
                {entries.map(([key, m]) => (
                  <button
                    key={key}
                    data-route={key}
                    className={"nav-item" + (route === key ? " selected" : "")}
                    onClick={() => setRoute(key)}
                  >
                    <span className="nav-mark">{m.mark}</span>
                    {m.title}
                  </button>
                ))}
              </div>
            ) : null;
          })}
          {session.profile === "Administrador" && (
            <button
              data-route="access"
              className={"nav-item" + (route === "access" ? " selected" : "")}
              onClick={() => setRoute("access")}
            >
              Vinculación de datos
            </button>
          )}
          {session.profile === "Administrador" && <button className="nav-item" onClick={() => setRoute("audit")}>Historial de operaciones</button>}
        </nav>
        <div className="sidebar-bottom">Portal académico</div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="identity">
            <span className="avatar">
              {session.username.slice(0, 2).toUpperCase()}
            </span>
            <div>
              <strong>{session.username}</strong>
              <p className="muted">{session.profile}</p>
            </div>
          </div>
          <div className="session-box">
            <span className={"timer" + (seconds <= 15 ? " warn" : "")}>
              Sesión · {seconds}s
            </span>
            <button className="secondary" onClick={logout}>
              Cerrar sesión
            </button>
          </div>
        </header>
        <main className="content">
          {route === "home" ? (
            <Home session={session} navigate={setRoute} />
          ) : route === "audit" ? (
            <Audit request={request} />
          ) : route === "access" ? (
            <Access request={request} notify={notify} />
          ) : (
            <Records
              key={route}
              route={route}
              session={session}
              request={request}
              notify={notify}
            />
          )}
        </main>
      </div>
    </div>
  );
}
export default function App() {
  const auth = useSession(),
    [notification, setNotification] = useState("");
  useEffect(() => {
    if (!notification) return;
    const timer = setTimeout(() => setNotification(""), 5000);
    return () => clearTimeout(timer);
  }, [notification]);
  useEffect(() => {
    if (!auth.session) setNotification("");
  }, [auth.session]);
  if (!auth.ready)
    return <div className="boot"><Loading text="Preparando el portal académico…" /></div>;
  return (
    <>
      {auth.session ? (
        <Workspace
          key={auth.session.csrf}
          auth={auth}
          notify={setNotification}
        />
      ) : (
        <Login login={auth.login} message={auth.message} />
      )}
      <div
        id="toast"
        role="status"
        aria-live="polite"
        className={notification ? "show" : ""}
      >
        {notification}
      </div>
    </>
  );
}
