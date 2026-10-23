import { writeFile } from "node:fs/promises";
import { parseSkinMetadata } from "../src/lib/skinRarity.ts";
const source = "https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/skins.json";
const response = await fetch(source, { signal: AbortSignal.timeout(15000) });
if (!response.ok) throw new Error(`Skin metadata HTTP ${response.status}`);
const { rarities } = parseSkinMetadata(await response.json());
await writeFile(new URL("../src/data/skin-rarities.json", import.meta.url), JSON.stringify(rarities) + "\n");
console.log(`Saved ${Object.keys(rarities).length} skin and chroma tiers from client data`);
