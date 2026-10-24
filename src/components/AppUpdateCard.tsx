import { ArrowDownToLine, CheckCircle2, Loader2, RefreshCw } from "lucide-react";
import type { AppUpdates } from "../hooks/useAppUpdates";
import { openUrl } from "../lib/commands";
import { version } from "../../package.json";
import SystemIcon from "./SystemIcon";
export default function AppUpdateCard({
  updates,
  native,
  blockedReason,
}: {
  updates: AppUpdates;
  native: boolean;
  blockedReason: string | null;
}) {
  const { state } = updates;
  if (/Win/.test(navigator.platform))
    return (
      <section className="software-update" aria-label="Software Update">
        <div className="software-update-row">
          <div className="software-update-title">
            <h2>Software Update</h2>
            <p>cstmSKN {version} · Windows preview</p>
          </div>
          <button
            className="quiet-button"
            onClick={() =>
              void openUrl("https://github.com/silentrosehill/cstmSKN/releases").catch(() => {})
            }
          >
            View Windows releases
          </button>
        </div>
        <div className="software-update-status">
          <p>Install preview updates from GitHub. Your library stays on this PC.</p>
        </div>
      </section>
    );
  const available = state.stage === "available";
  return (
    <section className="software-update" aria-label="Software Update">
      <div className="software-update-row">
        <span className="software-update-icon">
          <SystemIcon name="download" fallback={ArrowDownToLine} size={23} />
        </span>
        <div className="software-update-title">
          <h2>Software Update</h2>
          <p>cstmSKN {version}</p>
        </div>
        <button
          className={available ? "primary-button" : "quiet-button"}
          disabled={
            !native ||
            state.stage === "checking" ||
            updates.blocking ||
            (available && !!blockedReason)
          }
          onClick={() => {
            if (available) void updates.install();
            else void updates.check();
          }}
        >
          {state.stage === "checking" ? (
            <>
              <Loader2 size={13} className="animate-spin" /> Checking…
            </>
          ) : available ? (
            <>Update &amp; Restart</>
          ) : (
            <>
              <RefreshCw size={13} />
              Check for Updates
            </>
          )}
        </button>
      </div>
      <div className="software-update-status" aria-live="polite">
        {!native ? (
          <p>Open the desktop app to check for updates.</p>
        ) : state.stage === "current" ? (
          <p className="update-current">
            <CheckCircle2 size={13} />
            You’re up to date.
          </p>
        ) : available ? (
          <>
            <p>Version {state.version} is available.</p>
            {blockedReason && <p>{blockedReason}</p>}
            {state.notes && (
              <details>
                <summary>Release notes</summary>
                <p className="update-release-notes">{state.notes}</p>
              </details>
            )}
          </>
        ) : null}
        {state.error && (
          <p className="update-error" role="alert">
            {state.error}
          </p>
        )}
      </div>
    </section>
  );
}
