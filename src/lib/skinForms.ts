/**
 * Ultimate and Legendary skins whose catalog folder holds extra forms, e.g.
 * "skins/99/99007/99993/99993.fantome" for one of Elementalist Lux's elements.
 * Each form is a whole skin locked to that form, picked like a chroma.
 */
export interface FormInfo {
  id: string;
  parentId: string;
  /** "Elementalist Lux (Form 3)"; also the download's name, so the Library groups it under its skin. */
  name: string;
  parentName: string;
  image: string;
}

const CATALOG = "https://raw.githubusercontent.com/Alban1911/LeagueSkins/main/";

/** The few forms Riot's data names; the rest are numbered after the base form. */
const FORM_NAMES: Record<string, string> = {
  "147002": "Rising Star",
  "147003": "Superstar",
  "103086": "Immortalized",
  "145071": "Immortalized",
};

/**
 * Forms per parent skin id, from the catalog's file paths. A nested entry counts as a form
 * when it isn't a skin or chroma of its own and its parent is a real (non-default) skin.
 */
export function findSkinForms(
  repoPaths: Iterable<[string, string]>,
  skinIds: Record<string, string>,
  isChroma: (id: number) => boolean
): Map<string, FormInfo[]> {
  const ids = new Map<string, { id: string; path: string }[]>();
  for (const [id, path] of repoPaths) {
    const parts = path.split("/");
    if (parts.length !== 5 || parts[3] !== id) continue;
    const parentId = parts[2];
    if (id in skinIds || isChroma(Number(id))) continue;
    if (!(parentId in skinIds) || Number(parentId) % 1000 === 0) continue;
    const list = ids.get(parentId) ?? [];
    list.push({ id, path });
    ids.set(parentId, list);
  }
  const forms = new Map<string, FormInfo[]>();
  for (const [parentId, entries] of ids) {
    const parentName = skinIds[parentId];
    entries.sort((a, b) => Number(a.id) - Number(b.id));
    forms.set(
      parentId,
      entries.map(({ id, path }, i) => ({
        id,
        parentId,
        name: `${parentName} (${FORM_NAMES[id] ?? `Form ${i + 2}`})`,
        parentName,
        image: CATALOG + path.replace(/\.[^.]+$/, ".png"),
      }))
    );
  }
  return forms;
}
