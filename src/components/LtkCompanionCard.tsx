import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
export interface LtkSetup { installed: boolean; message: string; }
export default function LtkCompanionCard({ native, active }: { native: boolean; active: boolean }) {
  const [status, setStatus] = useState<LtkSetup | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  async function check() {
    setBusy(true); setMessage(null);
    try { setStatus(await invoke<LtkSetup>("get_ltk_companion")); }
    catch (e) { setMessage(String(e)); }
    finally { setBusy(false); }
  }
  useEffect(() => { if (native) void check(); }, [native]);
  async function action(command: string) {
    setBusy(true); setMessage(null);
    try { setMessage(await invoke<string>(command)); }
    catch (e) { setMessage(String(e)); }
    finally { setBusy(false); }
  }
  return <section className="software-update" aria-label="LTK setup">
    <div className="software-update-row"><div className="software-update-title">
      <h2>LTK patcher</h2><p>Apply skins directly from cstmSKN.</p>
    </div></div>
    <div className="software-update-status">
      <p role="status">{busy ? "Checking LTK…" : message ?? status?.message ?? "Checking installation…"}</p>
      <div className="flex flex-wrap gap-2 mt-3">
        <button className="quiet-button" disabled={!native || busy || active} onClick={() => void action("install_ltk_companion")}>
          {status?.installed ? "Repair LTK installation" : "Install LTK Manager"}
        </button>
        <button className="quiet-button" disabled={!native || busy} onClick={() => void check()}>Check installation</button>
        {status?.installed && <button className="quiet-button" disabled={!native || busy} onClick={() => void action("open_ltk_companion")}>Open LTK Manager</button>}
      </div>
    </div>
  </section>;
}
