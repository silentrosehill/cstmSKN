export const CHANGELOG = [
  {
    version: "1.0.2",
    title: "Pick your form",
    changes: [
      "Ultimate and Legendary skins with multiple forms, like Elementalist Lux, let you pick a form in the gallery.",
      'Windows: works when League runs as administrator, and no more "session already in progress" error after a game.',
      "Windows: tells you when a newer version is available.",
    ],
  },
  {
    version: "1.0.1",
    title: "Steadier under the hood",
    changes: [
      "cstmSKN now also runs on Windows 11 x64 as a preview, with the same galleries, Library and Favorites.",
      "Large skins now finish downloading on slow connections.",
      'Imported mods are sorted by what they change, so a skin with "voice" in its name stays a skin.',
      "If macOS can't show the usual password prompt, cstmSKN asks with the standard system prompt instead of closing.",
      "The app's own program is now named cstmSKN, and Open at login follows the new name.",
      "Removed unused leftovers and tidied the code.",
    ],
  },
  {
    version: "0.1.24",
    title: "A smoother, safer cstmSKN",
    changes: [
      "A dedicated Changelog, with updates available even offline.",
      "More reliable downloads that preserve installed skins when interrupted.",
      "Safer library handling and clearer storage errors.",
      "More reliable patcher stopping and status checks.",
      "Better recovery from damaged settings and full browser storage.",
      "Faster installed-skin lookups and fewer duplicate catalog requests.",
      "Removed local build-machine paths and personal profile labels from this release.",
    ],
  },
  {
    version: "0.1.23",
    title: "Select from Favorites",
    changes: [
      "Select installed skins and custom mods directly from Favorites.",
      "Download and select missing skins without leaving your favorites.",
    ],
  },
  {
    version: "0.1.22",
    title: "Your Library, in decks",
    changes: [
      "Compact three-column champion decks with loading-screen portraits.",
      "Cycle downloaded skins with exposed cards, arrows, or your keyboard.",
      "Download only saves a skin without changing your selection.",
    ],
  },
  {
    version: "0.1.21",
    title: "The familiar sidebar",
    changes: ["Restored the previous sidebar appearance after the glass experiment."],
  },
  {
    version: "0.1.20",
    title: "A glass experiment",
    changes: ["Tried a clearer sidebar material, subsequently reverted in 0.1.21."],
  },
  {
    version: "0.1.19",
    title: "Make it yours",
    changes: [
      "Show, hide, and rearrange sidebar tabs with individual accent colors.",
      "Save favorites and named loadouts.",
      "Import voices, announcers, maps, and other packages in Game Mods.",
      "Review dropped imports and automatically detect their champion.",
      "Follow champion lock-in, trades, and rerolls from the League client.",
      "Check patcher health and rebuild temporary data from Settings.",
    ],
  },
  {
    version: "0.1.18",
    title: "Updates, inside the app",
    changes: ["Check for signed updates in Settings and install with Update & Restart."],
  },
] as const;
