import type { Skin } from "../types/index.ts";

export async function downloadChoice(
  skin: Skin,
  url: string,
  selectAfter: boolean,
  download: (url: string, champion: string, name: string) => Promise<boolean>,
  select: (skin: Skin, enabled: boolean) => void
): Promise<boolean> {
  const success = await download(url, skin.championName, skin.name);
  if (success && selectAfter) select(skin, true);
  return success;
}
