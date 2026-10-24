import {
  Swords,
  Layers,
  Package,
  Settings as SettingsIcon,
  CircleCheck,
  Sparkles,
  Star,
  SlidersHorizontal,
  History,
} from "lucide-react";
import type { TabId } from "./navigation";

export interface NavItem {
  id: TabId;
  label: string;
  icon: typeof Swords;
  symbol: string;
}

export const NAV_ITEMS: NavItem[] = [
  { id: "whats-new", label: "New Releases", icon: Sparkles, symbol: "new" },
  { id: "champions", label: "Champions", icon: Swords, symbol: "grid" },
  { id: "my-skins", label: "Library", icon: Layers, symbol: "library" },
  { id: "favorites", label: "Favorites", icon: Star, symbol: "star" },
  { id: "loadouts", label: "Loadouts", icon: SlidersHorizontal, symbol: "loadouts" },
  { id: "game-mods", label: "Game Mods", icon: SlidersHorizontal, symbol: "mods" },
  { id: "customs", label: "Custom skins", icon: Package, symbol: "custom" },
  { id: "enabled", label: "Enabled", icon: CircleCheck, symbol: "enabled" },
  { id: "changelog", label: "Changelog", icon: History, symbol: "history" },
  { id: "settings", label: "Settings", icon: SettingsIcon, symbol: "settings" },
];
