import { useState } from "react";
import { Activity, Check, CircleAlert, Loader2, RefreshCw } from "lucide-react";
import type { PatcherHealth } from "../hooks/usePatcherHealth";
import { clearWorkDir } from "../lib/commands";
export default function PatcherHealthCard({
  health,
  native,
  active,
  onRetry,
  hasSelection,
}: {
  health: PatcherHealth;
  native: boolean;
  active: boolean;
  onRetry: () => void;
  hasSelection: boolean;
}) {
  const [repairing, setRepairing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const failed = health.checks.some((c) => c.state === "error");
  return (
    <section className="health-card">
      <div className="health-card-heading">
        <Activity size={20} />
        <div>
          <h2>Patcher health</h2>
          <p>
            {!native
              ? "Available in the Mac app."
              : health.checking
                ? "Checking…"
                : health.error
                  ? "Couldn’t complete the check."
                  : failed
                    ? "Some checks need attention."
                    : health.checks.length
                      ? "All checks passed."
                      : "Check your setup before playing."}
          </p>
        </div>
        <button
          className="quiet-button"
          disabled={!native || health.checking}
          onClick={() => void health.refresh()}
        >
          {health.checking ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <RefreshCw size={13} />
          )}
          Check again
        </button>
      </div>
      {native && (
        <div className="health-checks">
          {health.checks.map((check) => (
            <details key={check.id} className={check.state}>
              <summary>
                {check.state === "ok" ? <Check size={14} /> : <CircleAlert size={14} />}
                <span>{check.label}</span>
                <small>{check.state === "ok" ? "Passed" : "Needs attention"}</small>
              </summary>
              <p>{check.detail}</p>
            </details>
          ))}
        </div>
      )}
      {(health.error || error) && (
        <p role="alert" className="custom-error">
          {error ?? health.error}
        </p>
      )}
      {native && (
        <div className="health-actions">
          <span>Rebuild temporary patcher data if applying fails.</span>
          <button
            className="quiet-button"
            disabled={active || repairing}
            title={
              active
                ? "Stop the patcher before rebuilding."
                : "Keeps your downloaded skins and imported mods"
            }
            onClick={async () => {
              setRepairing(true);
              setError(null);
              try {
                await clearWorkDir();
                await health.refresh();
                if (hasSelection) onRetry();
              } catch (e) {
                setError(String(e));
              } finally {
                setRepairing(false);
              }
            }}
          >
            {repairing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
            {hasSelection ? "Rebuild & apply" : "Rebuild data"}
          </button>
        </div>
      )}
    </section>
  );
}
