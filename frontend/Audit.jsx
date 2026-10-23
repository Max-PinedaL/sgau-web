import { useEffect, useState } from "react";
export default function Audit({ request }) {
  const [rows, setRows] = useState(null), [error, setError] = useState(""), [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setError("");
    request("/api/audit").then((data) => { if (active) setRows(data); }).catch((err) => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [request, revision]);
  return <>
    <div className="page-head"><h1>Historial de operaciones</h1><button onClick={() => setRevision((v) => v + 1)}>Actualizar</button></div>

    {error && <p className="error" role="alert">{error}</p>}
    {!rows ? <p>Cargando…</p> : !rows.length ? <p>Todavía no hay operaciones registradas.</p> : <div className="table-wrap"><table><thead><tr>{["Fecha", "Usuario", "Método", "Operación", "Resultado", "Código"].map((label) => <th key={label}>{label}</th>)}</tr></thead><tbody>{rows.map((row, i) => <tr key={i}><td>{new Date(row.at).toLocaleString()}</td><td>{row.actor}</td><td>{row.method}</td><td>{row.path}</td><td>{row.result}</td><td>{row.status}</td></tr>)}</tbody></table></div>}
  </>;
}
