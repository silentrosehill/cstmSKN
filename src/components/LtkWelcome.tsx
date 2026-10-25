import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Download, Loader2, Check } from "lucide-react";
import type { LtkSetup } from "./LtkCompanionCard";

export default function LtkWelcome({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<LtkSetup | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  async function check() {
    setBusy(true); setMessage(null);
    try { setStatus(await invoke<LtkSetup>("get_ltk_companion")); }
    catch (e) { setMessage(String(e)); }
    finally { setBusy(false); }
  }
  useEffect(() => { dialog.current?.focus(); void check(); }, []);
  async function install() {
    setBusy(true); setMessage(null);
    try { setMessage(await invoke<string>("install_ltk_companion")); setStarted(true); }
    catch (e) { setMessage(String(e)); }
    finally { setBusy(false); }
  }
  return <div className="update-dialog-scrim" style={{ zIndex: 300 }}>
    <div ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="ltk-welcome-title"
      className="update-dialog" onKeyDown={event => {
        if (event.key === "Escape") onClose();
        if (event.key !== "Tab") return;
        const items = dialog.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)");
        if (!items?.length) { event.preventDefault(); return; }
        const first = items[0], last = items[items.length - 1];
        if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog.current)) { event.preventDefault(); first.focus(); }
      }}>
      <span className="update-dialog-icon">{status?.installed ? <Check size={25} /> : <Download size={25} />}</span>
      <h2 id="ltk-welcome-title">{status?.installed ? "You’re ready to apply skins" : "Set up skin patching"}</h2>
      <p>{status?.installed ? "Select your skins in cstmSKN and click Apply selection. LTK runs in the background." : "cstmSKN uses LTK to apply your skins. Install its official components once to get started."}</p>
      <p className="update-dialog-message" role="status">{busy ? "Checking installation…" : message ?? (started ? "Finish the Windows installer, then check installation here." : status && !status.installed ? status.message : status?.installed ? "Official LTK files verified." : "The official installer is included. Windows will ask you to approve installation.")}</p>
      {busy ? <Loader2 size={20} className="animate-spin" /> : status?.installed ?
        <button className="primary-button" onClick={onClose}>Continue to cstmSKN</button> : <>
          <button className="primary-button" onClick={() => void install()}>Install LTK Manager</button>
          <button className="quiet-button" onClick={() => void check()}>{started ? "Check installation" : "I already have LTK"}</button>
        </>}
      <button className="quiet-button" onClick={onClose}>{status?.installed ? "Close" : "Set up later"}</button>
    </div>
  </div>;
}
