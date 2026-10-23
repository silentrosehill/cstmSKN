import snapshot from "../data/skin-rarities.json";
import { getCached, getStale, setCache } from "./cache";
import { parseSkinMetadata, type SkinMetadata } from "./skinRarity";
export const DEFAULT_RARITIES = snapshot as SkinMetadata["rarities"];
const KEY = "cstm:skin-metadata-v1";
const URL =
  "https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/skins.json";
let pending: Promise<SkinMetadata> | null = null;
export function ensureSkinMetadata(): Promise<SkinMetadata> {
  if (pending) return pending;
  const cached = getCached<SkinMetadata>(KEY);
  if (cached) return Promise.resolve(cached);
  pending = fetch(URL, { signal: AbortSignal.timeout(12000) })
    .then(async (response) => {
      if (!response.ok) throw new Error(`Skin metadata HTTP ${response.status}`);
      const metadata = parseSkinMetadata(await response.json());
      setCache(KEY, metadata);
      return metadata;
    })
    .catch(() => getStale<SkinMetadata>(KEY) ?? { rarities: DEFAULT_RARITIES, chromas: {} })
    .finally(() => {
      pending = null;
    });
  return pending;
}
