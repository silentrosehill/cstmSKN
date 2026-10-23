import { useEffect, useRef, useState } from "react";
import { Check, Loader2, X } from "lucide-react";
import { customTargets, type ChampionAssignments } from "../lib/selection";
import { MOD_CATEGORIES, modKind } from "../lib/mods";
import type { Champion, CustomMod, ModKind } from "../types";
import { modIcons } from "./Customs";
import { championAvatar } from "../hooks/useChampions";

export default function ImportReview({
  mod,
  champions,
  assignments,
  remaining,
  onKind,
  onAssign,
  onEnable,
  onClose,
}: {
  mod: CustomMod;
  champions: Champion[];
  assignments: ChampionAssignments;
  remaining: number;
  onKind: (name: string, kind: ModKind) => Promise<void>;
  onAssign: (name: string, champion: string) => void;
  onEnable: (mod: CustomMod) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const kind = modKind(mod);
  const Icon = modIcons[kind];
  const targets = customTargets(mod, champions, assignments);
  const automatic = customTargets(mod, champions, {});
  const needsChampion = ["skin", "voice"].includes(kind);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      className="import-review"
      ref={dialog}
      onCancel={(event) => {
        event.preventDefault();
        if (!saving) onClose();
      }}
      aria-labelledby="import-review-title"
    >
      <button
        className="dialog-close icon-button"
        aria-label="Close import review"
        disabled={saving}
        onClick={onClose}
      >
        <X size={16} />
      </button>
      <span className="review-mod-icon">
        <Icon size={32} strokeWidth={1.3} />
      </span>
      <span className="import-success">
        <Check size={12} />
        Imported
      </span>
      <h2 id="import-review-title">{mod.name}</h2>
      <label className="review-field">
        <span>Category</span>
        <select
          value={kind}
          disabled={saving}
          onChange={async (e) => {
            setSaving(true);
            setError(null);
            try {
              await onKind(mod.name, e.target.value as ModKind);
            } catch (e) {
              setError(String(e));
            } finally {
              setSaving(false);
            }
          }}
        >
          <option value="skin">Custom skin</option>
          {MOD_CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.singular}
            </option>
          ))}
        </select>
      </label>
      {needsChampion &&
        (automatic.length ? (
          <div className="review-champions">
            {targets.map((id) => {
              const champ = champions.find((c) => c.id.toLowerCase() === id);
              return (
                <span key={id}>
                  {champ && <img src={championAvatar(champ.id)} alt="" />}
                  {champ?.name ?? id}
                  <Check size={12} />
                </span>
              );
            })}
          </div>
        ) : (
          <label className="review-field">
            <span>Champion</span>
            <select
              value={assignments[mod.name] ?? ""}
              onChange={(e) => onAssign(mod.name, e.target.value)}
            >
              <option value="">Choose champion</option>
              {champions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        ))}
      {error && (
        <p role="alert" className="custom-error">
          {error}
        </p>
      )}
      <div className="review-actions">
        <button className="quiet-button" disabled={saving} onClick={onClose}>
          Keep disabled
        </button>
        <button
          className="primary-button"
          disabled={saving || (needsChampion && !targets.length)}
          onClick={() => {
            onEnable(mod);
            onClose();
          }}
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}Enable
          {remaining > 1 ? " & next" : ""}
        </button>
      </div>
      {remaining > 1 && <p className="review-remaining">{remaining} imports to review</p>}
    </dialog>
  );
}
