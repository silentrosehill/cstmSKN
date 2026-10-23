export type UpdateStage =
  | "idle"
  | "checking"
  | "current"
  | "available"
  | "downloading"
  | "installing"
  | "restarting"
  | "restart-required"
  | "error";
export interface UpdateProgress {
  event: "Started" | "Progress" | "Finished";
  data?: { contentLength?: number; chunkLength?: number };
}
export interface AppUpdate {
  version: string;
  body?: string;
  download: (
    progress: (event: UpdateProgress) => void,
    options?: { timeout: number }
  ) => Promise<void>;
  install: () => Promise<void>;
  close: () => Promise<void>;
}
export interface UpdateState {
  stage: UpdateStage;
  version: string | null;
  notes: string;
  percent: number | null;
  error: string | null;
}
interface Dependencies {
  check: () => Promise<AppUpdate | null>;
  relaunch: () => Promise<void>;
  blockedReason: () => string | null;
}
const initial: UpdateState = {
  stage: "idle",
  version: null,
  notes: "",
  percent: null,
  error: null,
};
export const isUpdateBlocking = (stage: UpdateStage) =>
  ["downloading", "installing", "restarting", "restart-required"].includes(stage);
export class AppUpdateController {
  private state: UpdateState = { ...initial };
  private update: AppUpdate | null = null;
  private listeners = new Set<() => void>();
  private dependencies: Dependencies;
  constructor(dependencies: Dependencies) {
    this.dependencies = dependencies;
  }
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private set(next: Partial<UpdateState>) {
    this.state = { ...this.state, ...next };
    this.listeners.forEach((listener) => listener());
  }
  private async release(update: AppUpdate | null) {
    try {
      await update?.close();
    } catch {
      /* The installed resource may already have been released. */
    }
  }
  async check() {
    if (this.state.stage === "checking" || isUpdateBlocking(this.state.stage)) return;
    this.set({ ...initial, stage: "checking" });
    const previous = this.update;
    this.update = null;
    await this.release(previous);
    try {
      this.update = await this.dependencies.check();
      this.set(
        this.update
          ? { stage: "available", version: this.update.version, notes: this.update.body ?? "" }
          : { stage: "current" }
      );
    } catch {
      this.set({
        stage: "error",
        error: "Couldn’t check for updates. Check your connection and try again.",
      });
    }
  }
  async install() {
    if (this.state.stage !== "available" || !this.update) return;
    const blocked = this.dependencies.blockedReason();
    if (blocked) {
      this.set({ error: blocked });
      return;
    }
    const update = this.update;
    let downloaded = 0,
      total = 0;
    this.set({ stage: "downloading", percent: null, error: null });
    try {
      // Tauri verifies the signed download before install() can replace the bundle.
      await update.download(
        (event) => {
          if (event.event === "Started") {
            total = event.data?.contentLength ?? 0;
            downloaded = 0;
          }
          if (event.event === "Progress") downloaded += Math.max(0, event.data?.chunkLength ?? 0);
          this.set({
            percent: total > 0 ? Math.min(100, Math.round((downloaded / total) * 100)) : null,
          });
        },
        { timeout: 120000 }
      );
      this.set({ stage: "installing", percent: 100 });
      await update.install();
    } catch (error) {
      this.update = null;
      await this.release(update);
      const message = String(error).toLowerCase();
      this.set({
        stage: "error",
        percent: null,
        error:
          message.includes("signature") || message.includes("verification")
            ? "The update could not be verified. Try checking for updates again."
            : "The update couldn’t be installed. Try checking for updates again.",
      });
      return;
    }
    this.update = null;
    await this.release(update);
    await this.restart();
  }
  async restart() {
    if (!["installing", "restarting", "restart-required"].includes(this.state.stage)) return;
    this.set({ stage: "restarting", error: null });
    try {
      await this.dependencies.relaunch();
    } catch {
      this.set({
        stage: "restart-required",
        error: "The update is installed. Restart cstmSKN to finish.",
      });
    }
  }
}
