export const CHANGELOG = [
  { version: "0.2.0-alpha.1", title: "Hello, Windows", changes: [
    "The first Windows 11 x64 preview, with the same galleries, Library, and Favorites.",
    "Windows game detection, remembered installation folders, and custom imports.",
    "Mica styling and a familiar Windows installer. Preview updates are available on GitHub."
  ] },
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
