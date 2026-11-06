"use client";
import { useState, type ReactNode } from "react";
export function ActionForm({
  children,
  label,
  action,
  danger = false,
}: {
  children?: ReactNode;
  label: string;
  action: (form: FormData) => Promise<void | false>;
  danger?: boolean;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [done, setDone] = useState(false);
  async function submit(form: FormData) {
    setBusy(true);
    setError("");
    setDone(false);
    try {
      if ((await action(form)) !== false) setDone(true);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Cette action n’a pas abouti.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={event => { event.preventDefault(); void submit(new FormData(event.currentTarget)); }} className="action-form">
      {children}
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
      {done && (
        <p role="status" className="notice">
          Opération effectuée.
        </p>
      )}
      <button disabled={busy} className={"button " + (danger ? "danger" : "")}>
        {busy ? "Un instant…" : label}
      </button>
    </form>
  );
}
