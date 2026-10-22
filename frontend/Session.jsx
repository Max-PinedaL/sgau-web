import { useCallback, useEffect, useRef, useState } from "react";
export function useSession() {
  const [session, setSession] = useState(null),
    [ready, setReady] = useState(false),
    [message, setMessage] = useState(""),
    [seconds, setSeconds] = useState(60);
  const current = useRef(null),
    channel = useRef(null),
    expiry = useRef(0),
    checking = useRef(false);
  const clear = useCallback((text = "") => {
    current.current = null;
    expiry.current = 0;
    setSession(null);
    setMessage(text);
  }, []);
  const accept = useCallback((data) => {
    current.current = data;
    expiry.current = data.expiresAt;
    setSession(data);
    setMessage("");
  }, []);
  const request = useCallback(
    async (path, method = "GET", body) => {
      let response;
      try {
        response = await fetch(path, {
          method,
          credentials: "same-origin",
          headers: {
            ...(body ? { "Content-Type": "application/json" } : {}),
            ...(current.current
              ? { "X-CSRF-Token": current.current.csrf }
              : {}),
          },
          body: body ? JSON.stringify(body) : undefined,
        });
      } catch {
        throw new Error(
          "No hay conexión con el servidor web. Revisa que esté ejecutándose.",
        );
      }
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 401 && current.current) {
          clear(data.error);
          channel.current?.postMessage({ type: "logout" });
        }
        const error = new Error(
          data.error || "No se pudo completar la operación.",
        );
        error.status = response.status;
        throw error;
      }
      return data;
    },
    [clear],
  );
  const verify = useCallback(async () => {
    if (checking.current) return;
    checking.current = true;
    try {
      const data = await request("/api/session");
      if (current.current) expiry.current = data.expiresAt;
    } catch {
      if (current.current && Date.now() >= expiry.current)
        clear("No se pudo verificar la sesión. Inicia sesión nuevamente.");
    } finally {
      checking.current = false;
    }
  }, [request, clear]);
  useEffect(() => {
    let alive = true;
    request("/api/session")
      .then((data) => {
        if (alive) accept(data);
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setReady(true);
      });
    const bus =
      typeof BroadcastChannel === "function"
        ? new BroadcastChannel("sgau-session")
        : null;
    channel.current = bus;
    if (bus)
      bus.onmessage = async ({ data }) => {
        if (data.type === "logout")
          clear("La sesión se cerró en otra pestaña.");
        if (data.type === "activity" && current.current)
          expiry.current = Math.max(expiry.current, data.expiresAt);
        if (data.type === "login") {
          try {
            const next = await request("/api/session");
            if (alive) accept(next);
          } catch {
            if (alive) clear();
          }
        }
      };
    return () => {
      alive = false;
      bus?.close();
      channel.current = null;
    };
  }, [request, accept, clear]);
  useEffect(() => {
    if (!session) return;
    let last = performance.now(),
      sent = 0,
      pending = null,
      busy = false,
      alive = true;
    async function ping() {
      pending = null;
      if (!current.current || busy || !alive) return;
      if (Date.now() >= expiry.current) return verify();
      busy = true;
      sent = Date.now();
      try {
        const data = await request("/api/activity", "POST", {
          idleMs: Math.max(0, performance.now() - last),
        });
        if (alive && current.current) {
          expiry.current = data.expiresAt;
          channel.current?.postMessage({
            type: "activity",
            expiresAt: data.expiresAt,
          });
        }
      } catch {
      } finally {
        busy = false;
      }
    }
    function activity(e) {
      if (!e.isTrusted || document.hidden) return;
      last = performance.now();
      if (Date.now() >= expiry.current) {
        verify();
        return;
      }
      if (Date.now() - sent > 1000) ping();
      else if (!pending) pending = setTimeout(ping, 1000);
    }
    const events = [
      "pointerdown",
      "pointermove",
      "keydown",
      "scroll",
      "touchstart",
    ];
    events.forEach((e) =>
      document.addEventListener(e, activity, { capture: true, passive: true }),
    );
    function visibility() {
      if (!document.hidden) verify();
    }
    document.addEventListener("visibilitychange", visibility);
    const timer = setInterval(() => {
      const left = Math.max(0, Math.ceil((expiry.current - Date.now()) / 1000));
      setSeconds(left);
      if (!left) verify();
    }, 500);
    return () => {
      alive = false;
      clearTimeout(pending);
      clearInterval(timer);
      events.forEach((e) => document.removeEventListener(e, activity, true));
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [session, request, verify]);
  const login = async (credentials) => {
    try {
      const data = await request("/api/login", "POST", credentials);
      accept(data);
      setSeconds(60);
      channel.current?.postMessage({ type: "login" });
    } finally {
      credentials.password = "";
    }
  };
  const logout = async () => {
    try {
      await request("/api/logout", "POST", {});
    } catch {}
    clear("Sesión cerrada.");
    channel.current?.postMessage({ type: "logout" });
  };
  return { session, ready, message, seconds, request, login, logout };
}
