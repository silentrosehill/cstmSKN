import { useEffect, useRef } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import type { AppUpdates } from "../hooks/useAppUpdates";
export default function AppUpdateDialog({ updates }: { updates: AppUpdates }) {
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    dialog.current?.focus();
  }, []);
  const { stage, percent, version, error } = updates.state;
  const title =
    stage === "downloading"
      ? "Downloading update"
      : stage === "installing"
        ? "Installing update"
        : stage === "restart-required"
          ? "Ready to restart"
          : "Restarting cstmSKN";
  return (
    <div className="update-dialog-scrim">
      <div
        className="update-dialog"
        ref={dialog}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="update-dialog-title"
      >
        <span className="update-dialog-icon">
          <RefreshCw size={25} className={stage === "restart-required" ? "" : "animate-spin"} />
        </span>
        <h2 id="update-dialog-title">{title}</h2>
        <p>cstmSKN {version}</p>
        {stage === "downloading" || stage === "installing" ? (
          <>
            <progress aria-label={title} max={100} value={percent ?? undefined} />
            <span className="update-progress-label">
              {stage === "installing"
                ? "Finishing up…"
                : percent === null
                  ? "Connecting…"
                  : `${percent}%`}
            </span>
          </>
        ) : stage === "restarting" ? (
          <Loader2 size={18} className="animate-spin" />
        ) : (
          <>
            <p className="update-dialog-message">{error}</p>
            <button className="primary-button" onClick={() => void updates.restart()}>
              Restart cstmSKN
            </button>
          </>
        )}
      </div>
    </div>
  );
}
