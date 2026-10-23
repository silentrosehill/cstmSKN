import { useEffect, useState } from "react";
import snapshot from "../data/champion-release-dates.json";
import { getCached, setCache } from "../lib/cache";
import type { ReleaseDates } from "../lib/championSort";
const KEY = "cstm:release-dates-v1";
const URL = "https://universe-meeps.leagueoflegends.com/v1/en_us/champion-browse/index.json";
let pending: Promise<ReleaseDates> | null = null;
export function useReleaseDates() {
  const [dates, setDates] = useState<ReleaseDates>(() => ({
    ...getCached<ReleaseDates>(KEY),
    ...snapshot,
  }));
  useEffect(() => {
    let active = true;
    if (!pending)
      pending = Promise.resolve(getCached<ReleaseDates>(KEY))
        .then(async (cached) => {
          if (cached) return { ...cached, ...snapshot };
          const response = await fetch(URL, { signal: AbortSignal.timeout(6000) });
          if (!response.ok) throw new Error("Release dates unavailable");
          const data = (await response.json()) as {
            champions?: { name: string; "release-date": string }[];
          };
          const dates: ReleaseDates = {};
          for (const champion of data.champions ?? []) {
            const day = champion["release-date"]?.slice(0, 10);
            if (day && /^\d{4}-\d{2}-\d{2}$/.test(day))
              dates[champion.name.toLowerCase().replace(/[^a-z0-9]/g, "")] = day;
          }
          const merged = { ...dates, ...snapshot };
          setCache(KEY, merged);
          return merged;
        })
        .catch(() => snapshot);
    void pending.then((dates) => {
      if (active) setDates(dates);
    });
    return () => {
      active = false;
    };
  }, []);
  return dates;
}
