import { Check, History } from "lucide-react";
import { CHANGELOG } from "../data/changelog";
import { version } from "../../package.json";
import SystemIcon from "./SystemIcon";

export default function Changelog() {
  return (
    <div className="changelog-view">
      <div className="changelog-intro">
        <div className="changelog-emblem">
          <SystemIcon name="history" fallback={History} size={25} />
        </div>
        <div>
          <h2>Always getting better.</h2>
          <p>What’s changed in cstmSKN.</p>
        </div>
        <span className="changelog-version">Version {version}</span>
      </div>
      <div className="changelog-timeline">
        {CHANGELOG.map((release) => (
          <article className="changelog-release" key={release.version}>
            <div className="changelog-marker" />
            <div className="changelog-release-header">
              <span>v{release.version}</span>
              {release.version === version && (
                <small>
                  <Check size={12} /> Installed
                </small>
              )}
            </div>
            <h3>{release.title}</h3>
            <ul>
              {release.changes.map((change) => (
                <li key={change}>{change}</li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </div>
  );
}
