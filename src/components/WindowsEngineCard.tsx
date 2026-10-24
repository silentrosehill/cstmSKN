import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getWindowsElevation } from "../lib/commands";
import type { WindowsElevation } from "../lib/commands";
interface Engine { folder: string; source: string; }
export default function WindowsEngineCard({ native }: { native: boolean; active: boolean; }) {
  const [engine, setEngine] = useState<Engine | null>(null);
  const [elevation, setElevation] = useState<WindowsElevation | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (native) {
      void invoke<Engine>("get_windows_engine").then(setEngine).catch(e => setError(String(e)));
      void getWindowsElevation().then(setElevation).catch(e => setError(String(e)));
    }
  }, [native]);
  return <section className="software-update" aria-label="Windows patcher engine">
    <div className="software-update-row"><div className="software-update-title">
      <h2>Windows engine</h2><p>{engine?.source ?? "cstmSKN native injector"}</p>
    </div></div>
    <div className="software-update-status">
      <p>Source-built experimental injector. Apply selection builds an overlay and starts this engine. Use a fresh match when changing selections.</p>
      {engine && <p className="truncate" title={engine.folder}>{engine.folder}</p>}
      {elevation && <p className="mt-3">App and engine run as {elevation.appIsElevated ? "administrator" : "a standard user"}. If League runs elevated, restart cstmSKN using Run as administrator.</p>}
      <p>Unsigned preview. Windows code-integrity protection may block the DLL; in-game compatibility still needs testing.</p>
      {error && <p className="update-error" role="alert">{error}</p>}
    </div>
  </section>;
}
