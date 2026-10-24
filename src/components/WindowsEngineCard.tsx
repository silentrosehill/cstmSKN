import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getWindowsElevation, setWindowsElevation } from "../lib/commands";
import type { WindowsElevation } from "../lib/commands";
interface Engine {
  folder: string;
  source: string;
}
export default function WindowsEngineCard({
  native,
  active,
}: {
  native: boolean;
  active: boolean;
}) {
  const [engine, setEngine] = useState<Engine | null>(null);
  const [elevation, setElevation] = useState<WindowsElevation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (native) {
      void invoke<Engine>("get_windows_engine")
        .then(setEngine)
        .catch((e) => setError(String(e)));
      void getWindowsElevation()
        .then(setElevation)
        .catch((e) => setError(String(e)));
    }
  }, [native]);
  async function changeElevation() {
    if (!elevation) return;
    setError(null);
    setBusy(true);
    try {
      await setWindowsElevation(!elevation.optIn);
      setElevation(await getWindowsElevation());
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="software-update" aria-label="Windows patcher engine">
      <div className="software-update-row">
        <div className="software-update-title">
          <h2>Windows engine</h2>
          <p>{engine?.source ?? "LeagueToolkit"}</p>
        </div>
      </div>
      <div className="software-update-status">
        <p>
          Built into cstmSKN with LeagueToolkit components. No separate LTK Manager or DLL import is
          required. This integration is experimental and still needs in-game verification.
        </p>
        {engine && (
          <p className="truncate" title={engine.folder}>
            {engine.folder}
          </p>
        )}
        <div className="software-update-row mt-3">
          <div className="software-update-title">
            <h3>Run engine as administrator</h3>
            <p>
              Asks for admin permission each time the patcher starts; needed when League runs as
              administrator.
            </p>
            {elevation?.leagueRunsAsAdmin && (
              <p>League is set to run as administrator, so this is used automatically.</p>
            )}
          </div>
          <button
            className={`setting-switch ${elevation?.optIn ? "on" : ""}`}
            disabled={!native || active || busy || !elevation}
            role="switch"
            aria-checked={elevation?.optIn ?? false}
            aria-label="Run engine as administrator"
            onClick={() => void changeElevation()}
          >
            <span />
          </button>
        </div>
        {error && (
          <p className="update-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}
