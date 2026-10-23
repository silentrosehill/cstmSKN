import { useEffect, useState } from "react";
import { DEFAULT_RARITIES, ensureSkinMetadata } from "../lib/skinMetadata";
export function useSkinRarities() {
  const [rarities, setRarities] = useState(DEFAULT_RARITIES);
  useEffect(() => {
    let active = true;
    void ensureSkinMetadata().then((metadata) => {
      if (active) setRarities(metadata.rarities);
    });
    return () => {
      active = false;
    };
  }, []);
  return rarities;
}
