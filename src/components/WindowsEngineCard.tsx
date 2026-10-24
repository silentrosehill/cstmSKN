import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { FolderOpen } from "lucide-react";
import { openUrl } from "../lib/commands";
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
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (native)
      void invoke<Engine>("get_windows_engine")
        .then(setEngine)
        .catch((e) => setError(String(e)));
  }, [native]);
  async function choose(reset = false) {
    setError(null);
    setBusy(true);
    try {
      const path = reset
        ? null
        : await open({
            directory: true,
            multiple: false,
            title: "Choose the installed LTK Manager folder",
          });
      if (!reset && !path) return;
      setEngine(await invoke<Engine>("set_windows_engine", { path }));
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
        <button
          className="quiet-button"
          disabled={!native || active || busy}
          onClick={() => void choose()}
        >
          <FolderOpen size={13} /> Choose LTK folder
        </button>
      </div>
      <div className="software-update-status">
        <p>
          An installed LTK Manager engine is used in place, with its original files and publisher
          signatures. Otherwise, this preview uses its bundled unsigned engine.
        </p>
        {engine && (
          <p className="truncate" title={engine.folder}>
            {engine.folder}
          </p>
        )}
        <div className="mt-3 flex gap-3">
          <button
            className="quiet-button"
            onClick={() =>
              void openUrl("https://github.com/LeagueToolkit/ltk-manager/releases/latest").catch(
                (e) => setError(String(e))
              )
            }
          >
            Get LTK Manager
          </button>
          <button
            className="quiet-button"
            disabled={!native || active || busy}
            onClick={() => void choose(true)}
          >
            Detect automatically
          </button>
        </div>
        {active && <p>Stop the patcher to change its engine.</p>}
        {error && (
          <p className="update-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}
