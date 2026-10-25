import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface Companion { enabled: boolean; running: boolean; message: string; }

export default function LtkCompanionCard({ native, active }: { native: boolean; active: boolean }) {
  const [status, setStatus] = useState<Companion | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [installerMessage, setInstallerMessage] = useState<string | null>(null);
  useEffect(() => {
    if (!native) return;
    let disposed = false;
    const refresh = () => {
      void invoke<Companion>("get_ltk_companion").then(value => {
        if (!disposed) setStatus(value);
      }).catch(e => { if (!disposed) setError(String(e)); });
    };
    refresh();
    const timer = window.setInterval(refresh, 2000);
    return () => { disposed = true; window.clearInterval(timer); };
  }, [native]);
  async function change(enabled: boolean) {
    setBusy(true); setError(null); setInstallerMessage(null);
    try { setStatus(await invoke<Companion>("set_ltk_companion", { enabled })); }
    catch (e) { setError(String(e)); }
    finally { setBusy(false); }
  }
  async function install() {
    setBusy(true); setError(null); setInstallerMessage(null);
    try { setInstallerMessage(await invoke<string>("install_ltk_companion")); }
    catch (e) { setError(String(e)); }
    finally { setBusy(false); }
  }
  return <section className="software-update" aria-label="LTK background companion">
    <div className="software-update-row">
      <div className="software-update-title"><h2>LTK companion</h2><p>Launch official LTK Manager in the system tray.</p></div>
      <input type="checkbox" role="switch" aria-label="Launch LTK Manager in the background"
        checked={status?.enabled ?? true} disabled={!native || busy || active || !status}
        onChange={event => void change(event.target.checked)} />
    </div>
    <div className="software-update-status">
      <p>{busy ? "Preparing LTK companion…" : installerMessage ?? status?.message ?? "Checking LTK Manager…"}</p>
      <p>LTK uses its own skin selections. Quit it from its tray before using cstmSKN’s experimental engine.</p>
      <details><summary>Setup and background behavior</summary>
        <p>The complete official LTK Manager 1.30.4 installer is included. Install it here and complete setup once. Its signed files stay unchanged and its tray icon remains available.</p>
        <p>Turning this off prevents future launches and leaves a running companion open. Windows prompts and manually opened LTK windows remain visible. Apply and Stop control cstmSKN’s experimental engine only.</p>
      </details>
      <div className="flex gap-2 mt-3"><button type="button" className="quiet-button" disabled={!native || busy || active}
        onClick={() => void install()}>Install LTK Manager</button>
      {status?.enabled && <button type="button" className="quiet-button" disabled={!native || busy || active}
        onClick={() => void change(true)}>Retry background launch</button>}</div>
      {error && <p className="update-error" role="alert">{error}</p>}
    </div>
  </section>;
}
