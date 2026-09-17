/**
 * Everything MULO hands out, in one list. Kept apart from the code that works
 * out who has earned what, so the badge board can be rendered anywhere,
 * including on the client, without dragging the database in with it.
 *
 * A locked badge shows its name and nothing else. Knowing that Box Set exists
 * but not what it takes is the point: it is a reason to keep digging.
 */

export type Badge = {
  slug: string;
  name: string;
  /** How it was earned, in plain words. Only ever shown for earned badges. */
  description: string;
};

export type BadgeGroup = {
  id: string;
  title: string;
  badges: Badge[];
};

export const BADGE_GROUPS: BadgeGroup[] = [
  {
    id: "starting-out",
    title: "Starting out",
    badges: [
      { slug: "first-spin", name: "First Spin", description: "Rated your first record" },
      {
        slug: "raised-on",
        name: "Raised On",
        description: "Picked the record you grew up on",
      },
      {
        slug: "on-the-record",
        name: "On the Record",
        description: "Wrote your first review",
      },
      { slug: "the-crew", name: "The Crew", description: "Following ten people" },
    ],
  },
  {
    id: "going-deep",
    title: "Going deep",
    badges: [
      {
        slug: "track-by-track",
        name: "Track by Track",
        description: "Rated every song on an album",
      },
      {
        slug: "no-skips",
        name: "No Skips",
        description: "Gave every song on an album eight or more",
      },
      {
        slug: "discography",
        name: "Discography",
        description: "Rated every album an artist has",
      },
      {
        slug: "box-set",
        name: "Box Set",
        description: "Rated an artist, every album of theirs and every song on them",
      },
      { slug: "century", name: "Century", description: "Rated a hundred albums" },
      { slug: "crate-digger", name: "Crate Digger", description: "Rated a hundred songs" },
    ],
  },
  {
    id: "range",
    title: "Range",
    badges: [
      { slug: "a-and-r", name: "A&R", description: "Rated twenty-five artists" },
      {
        slug: "time-traveller",
        name: "Time Traveller",
        description: "Rated albums from five different decades",
      },
      {
        slug: "omnivore",
        name: "Omnivore",
        description: "Rated albums from six different genres",
      },
      {
        slug: "the-whole-night",
        name: "The Whole Night",
        description: "Rated something between one and five in the morning",
      },
    ],
  },
  {
    id: "your-calls",
    title: "Your calls",
    badges: [
      { slug: "liner-notes", name: "Liner Notes", description: "Wrote ten reviews" },
      {
        slug: "certified",
        name: "Certified",
        description: "Handed out ten perfect scores",
      },
      { slug: "tough-crowd", name: "Tough Crowd", description: "Handed out a one" },
      { slug: "goat-status", name: "GOAT Status", description: "Crowned your GOAT" },
      {
        slug: "mixtape",
        name: "Mixtape",
        description: "Rated an album and a song inside the same month",
      },
    ],
  },
  {
    id: "the-crowd",
    title: "The crowd",
    badges: [
      {
        slug: "ringside",
        name: "Ringside",
        description: "Picked a side in ten Daily Versus",
      },
      { slug: "hot-take", name: "Hot Take", description: "Left a take on a Daily Versus" },
      { slug: "co-sign", name: "Co-sign", description: "Got ten loves on your ratings" },
      {
        slug: "day-ones",
        name: "Day Ones",
        description: "One of the first hundred people here",
      },
    ],
  },
];

export const SOLO_BADGES: Badge[] = BADGE_GROUPS.flatMap((group) => group.badges);

export type GenreTier = {
  slug: string;
  name: string;
  /** Albums rated in the genre to reach it. */
  need: number;
};

export type GenreFamily = {
  id: string;
  name: string;
  /**
   * Words that put a record in this family, matched whole word against the
   * genre tags MusicBrainz carries: rap catches "pop rap" and "gangsta rap",
   * but never "trap" on its own.
   */
  match: string[];
  /** Lowest first. Ten albums deep is a taste; a hundred is a life. */
  tiers: GenreTier[];
};

const LADDER = [10, 25, 50, 100];

function ladder(id: string, names: [string, string, string, string]): GenreTier[] {
  return names.map((name, i) => ({
    slug: `${id}-${i + 1}`,
    name,
    need: LADDER[i],
  }));
}

export const GENRE_FAMILIES: GenreFamily[] = [
  {
    id: "hip-hop",
    name: "Hip hop",
    match: ["hip", "hop", "rap", "trap", "drill", "grime"],
    tiers: ladder("hip-hop", ["Head Nod", "Cipher", "Crate Scholar", "Hip Hop Don"]),
  },
  {
    id: "pop",
    name: "Pop",
    match: ["pop"],
    tiers: ladder("pop", [
      "Chart Watcher",
      "Hook Collector",
      "Pop Historian",
      "Pop Royalty",
    ]),
  },
  {
    id: "rock",
    name: "Rock",
    match: ["rock", "grunge", "britpop", "shoegaze"],
    tiers: ladder("rock", [
      "Garage Regular",
      "Amp Stack",
      "Rock Historian",
      "Rock Immortal",
    ]),
  },
  {
    id: "soul",
    name: "R&B and soul",
    match: ["r&b", "rnb", "soul", "motown", "funk"],
    tiers: ladder("soul", ["Slow Jam", "Quiet Storm", "Soul Keeper", "Soul Royalty"]),
  },
  {
    id: "electronic",
    name: "Electronic",
    match: [
      "electronic",
      "electronica",
      "house",
      "techno",
      "edm",
      "dance",
      "ambient",
      "dubstep",
      "trance",
      "synthwave",
    ],
    tiers: ladder("electronic", ["Warehouse", "All Nighter", "Resident", "Headliner"]),
  },
  {
    id: "metal",
    name: "Metal",
    match: ["metal", "metalcore", "doom", "thrash"],
    tiers: ladder("metal", ["Headbanger", "Pit Regular", "Riff Scholar", "Metal God"]),
  },
  {
    id: "country",
    name: "Country",
    match: ["country", "bluegrass", "americana"],
    tiers: ladder("country", [
      "Porch Sitter",
      "Outlaw",
      "Nashville Scholar",
      "Country Legend",
    ]),
  },
  {
    id: "jazz",
    name: "Jazz",
    match: ["jazz", "bebop", "swing"],
    tiers: ladder("jazz", ["Blue Note", "Late Set", "Jazz Scholar", "Jazz Legend"]),
  },
  {
    id: "punk",
    name: "Punk",
    match: ["punk", "hardcore", "emo", "ska"],
    tiers: ladder("punk", ["Basement Show", "Zine Maker", "Punk Scholar", "Punk Lifer"]),
  },
  {
    id: "reggae",
    name: "Reggae",
    match: ["reggae", "dancehall", "dub", "afrobeats", "afrobeat"],
    tiers: ladder("reggae", ["Sound System", "Dub Plate", "Riddim Scholar", "Reggae Don"]),
  },
  {
    id: "folk",
    name: "Folk",
    match: ["folk", "acoustic", "blues"],
    tiers: ladder("folk", ["Open Mic", "Songcatcher", "Folk Scholar", "Folk Legend"]),
  },
  {
    id: "latin",
    name: "Latin",
    match: ["latin", "reggaeton", "salsa", "bossa", "cumbia", "bachata"],
    tiers: ladder("latin", ["Barrio", "Sonero", "Latin Scholar", "Latin Legend"]),
  },
];

/** Every badge there is, earned or not. */
export const BADGE_COUNT =
  SOLO_BADGES.length + GENRE_FAMILIES.reduce((sum, f) => sum + f.tiers.length, 0);

/** The words in a genre tag: "hip hop" reads as hip and hop. */
function words(genre: string): string[] {
  return genre
    .toLowerCase()
    .split(/[^a-z&]+/)
    .filter(Boolean);
}

/** Which families a record belongs to, from the genres MusicBrainz gave it. */
export function familiesFor(genres: string[]): string[] {
  const hit = new Set<string>();
  for (const genre of genres) {
    const parts = words(genre);
    for (const family of GENRE_FAMILIES) {
      if (parts.some((part) => family.match.includes(part))) hit.add(family.id);
    }
  }
  return [...hit];
}

/** The highest tier reached in a family, or null before the first one. */
export function tierFor(family: GenreFamily, rated: number): GenreTier | null {
  let reached: GenreTier | null = null;
  for (const tier of family.tiers) {
    if (rated >= tier.need) reached = tier;
  }
  return reached;
}
