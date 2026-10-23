export default function Loading({ text = "Cargando…", compact = false }) {
  return <span className={compact ? "cat-loading compact" : "cat-loading"} role="status">
    <img src="/loading-cat.gif" alt="" width={compact ? 40 : 112} height={compact ? 40 : 112} />
    <span>{text}</span>
  </span>;
}
