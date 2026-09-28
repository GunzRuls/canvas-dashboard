"use client";

import { useEffect, useState } from "react";

// Shows "Update to x.y.z" in the top bar when a newer release is on GitHub (installed app only).
export default function UpdateNotice() {
  const [update, setUpdate] = useState(null);
  const [state, setState] = useState("idle"); // idle | installing | started | error
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/update")
      .then((r) => r.json())
      .then((data) => data.available && setUpdate(data))
      .catch(() => {});
  }, []);

  if (!update) return null;

  async function install() {
    if (!window.confirm(`Update School Dashboard to ${update.latest}? It closes, updates, and opens again. Your settings are kept.`)) return;
    setState("installing");
    try {
      const res = await fetch("/api/update", { method: "POST" });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Update failed.");
      setState("started");
    } catch (err) {
      setError(err.message);
      setState("error");
    }
  }

  const pill = "rounded-full px-3.5 py-1.5 text-sm font-bold";
  const colors = { background: "var(--green-bg)", color: "var(--green-fg)" };

  if (state === "started") {
    return (
      <span className={pill} style={colors}>
        Updating… the dashboard reopens when it&apos;s done. You can close this window.
      </span>
    );
  }

  return (
    <span className="flex items-center gap-2">
      <button
        onClick={install}
        disabled={state === "installing"}
        title={`You have ${update.current}.`}
        className={`${pill} transition-opacity disabled:opacity-60`}
        style={colors}
      >
        {state === "installing" ? "Downloading update…" : `Update to ${update.latest}`}
      </button>
      {state === "error" && (
        <span className="text-xs font-bold" style={{ color: "var(--red-fg)" }}>
          {error}{" "}
          <a href={update.notesUrl} target="_blank" rel="noreferrer" className="underline">
            Download it yourself
          </a>
        </span>
      )}
    </span>
  );
}
