/**
 * The Daily Versus lineup: one pair a day, in this order, starting on
 * VERSUS_START and looping. Pairs are chosen rather than random so every
 * matchup is a real argument: same era, same lane. Artist ids are MusicBrainz
 * ids already cached in MULO's catalogue, with photos.
 */
export const VERSUS_START = "2026-09-17";

export type VersusPair = {
  left: string;
  right: string;
  /** The name of the clash, with some culture in it: "King of New York". */
  title: string;
  /** Plain context underneath: "New York, the 90s". */
  tagline: string;
  /** Names to show instead of the catalogue's, where it uses a stylised spelling. */
  leftName?: string;
  rightName?: string;
};

export const VERSUS_PAIRS: VersusPair[] = [
  { left: "f82bcf78-5b69-4622-a5ef-73800768d9ac", right: "cfbc0924-0035-4d6c-8197-f024653af823", title: "King of New York", tagline: "New York, the 90s", leftName: "Jay-Z" }, // Jay-Z vs Nas
  { left: "381086ea-f511-4aba-bdf9-71c753dc5077", right: "9fff2f8a-21e6-47de-a2b8-7f449929d43f", title: "Beef of the Decade", tagline: "Compton vs Toronto" }, // Kendrick Lamar vs Drake
  { left: "20244d07-534f-4eff-b4d4-930878889970", right: "122d63fc-8671-43e4-9752-34e846d62a9c", title: "Bad Blood", tagline: "Pop, 2010" }, // Taylor Swift vs Katy Perry
  { left: "39ab1aed-75e0-4140-bd47-540276886b60", right: "ba853904-ae25-4ebb-89d6-c44cfbd71bd2", title: "The Battle of Britpop", tagline: "Manchester vs London, 1995" }, // Oasis vs Blur
  { left: "859d0860-d480-4efd-970c-c05d5f1776b8", right: "73e5e69d-3554-40d8-8516-00cb38737a1c", title: "Pop Royalty", tagline: "Houston vs Barbados" }, // Beyoncé vs Rihanna
  { left: "5b11f4ce-a62d-471e-81fc-a69a8278c7da", right: "83b9cbe7-9857-49e2-ab8e-b57b01038103", title: "Kings of Grunge", tagline: "Seattle, 1991" }, // Nirvana vs Pearl Jam
  { left: "f27ec8db-af05-4f36-916e-3d57f91ecf5e", right: "070d193a-845c-479f-980e-bef15710653e", title: "Thriller vs Purple Rain", tagline: "The 80s" }, // Michael Jackson vs Prince
  { left: "381086ea-f511-4aba-bdf9-71c753dc5077", right: "875203e1-8e58-4b86-8dcb-7190faf411c5", title: "The Big Three", tagline: "Two of rap's big three" }, // Kendrick Lamar vs J. Cole
  { left: "b10bbbfc-cf9e-42e0-be17-e2c3e1d2600d", right: "b071f9fa-14b0-4217-8e97-eb41da73f598", title: "The Original Rivalry", tagline: "The 60s" }, // The Beatles vs The Rolling Stones
  { left: "f4abc0b5-3f7a-4eff-8f78-ac078dbce533", right: "6925db17-f35e-42f3-a4eb-84ee6bf5d4b0", title: "Bad Guy vs Good 4 U", tagline: "Gen Z pop" }, // Billie Eilish vs Olivia Rodrigo
  { left: "056e4f3e-d505-4dad-8ec1-d04f521cbb56", right: "860b2707-6153-4e3a-aa57-74d2b42c55b5", title: "Robots vs the Cross", tagline: "French touch" }, // Daft Punk vs Justice
  { left: "ada7a83c-e3e1-40f1-93f9-3e73dbc9298a", right: "f181961b-20f7-459e-89de-920ef03c7ed0", title: "Is This It?", tagline: "The indie rock revival" }, // Arctic Monkeys vs The Strokes
  { left: "164f0d73-1234-4e2c-8743-d77bf2191051", right: "9fff2f8a-21e6-47de-a2b8-7f449929d43f", title: "Chicago vs the 6", tagline: "The 2010s" }, // Ye vs Drake
  { left: "65f4f0c5-ef9e-490c-aee3-909e7ae6b2ab", right: "a9044915-8be3-4c7e-b11f-9e2d2ea0a91e", title: "Thrash's Oldest Grudge", tagline: "Thrash metal, the 80s" }, // Metallica vs Megadeth
  { left: "e520459c-dff4-491d-a6e4-c97be35e0044", right: "272989c8-5535-492d-a25c-9f58803e027f", title: "Blonde vs Ctrl", tagline: "Alternative R&B" }, // Frank Ocean vs SZA
  { left: "a74b1b7f-71a5-4011-9441-d0b5e4122711", right: "cc197bad-dc9c-440d-a5b5-d52ba2e14234", title: "OK Computer vs Parachutes", tagline: "British rock at the turn of the century" }, // Radiohead vs Coldplay
  { left: "1882fe91-cdd9-49c9-9956-8e06a3810bd4", right: "56a55378-f155-48de-80a5-d80104221267", title: "Espresso vs Pink Pony Club", tagline: "2024's breakouts" }, // Sabrina Carpenter vs Chappell Roan
  { left: "678d88b2-87b0-403b-b63d-5da7465aecc3", right: "83d91898-7763-47d7-b03b-b92132375c47", title: "Stairway vs The Wall", tagline: "70s rock" }, // Led Zeppelin vs Pink Floyd
  { left: "73fdb566-a9b1-494c-9f32-51768ec9fd27", right: "0febdcf7-4e1f-4661-9493-b40427de2c13", title: "Atlanta vs Shaolin", tagline: "90s rap groups" }, // OutKast vs Wu-Tang Clan
  { left: "084308bd-1654-436f-ba03-df6697104e19", right: "0743b15a-3c32-48c8-ad58-cb325350befa", title: "Kings of Pop-Punk", tagline: "The 90s and 2000s" }, // Green Day vs blink-182
  { left: "b7539c32-53e7-4908-bda3-81449c367da6", right: "8e494408-8620-4c6a-82c2-c2ca4a1e4f12", title: "Born to Die vs Melodrama", tagline: "Moody pop" }, // Lana Del Rey vs Lorde
  { left: "f6beac20-5dfe-4d1f-ae02-0b0a740aafd6", right: "e520459c-dff4-491d-a6e4-c97be35e0044", title: "Odd Future's Finest", tagline: "From the same crew" }, // Tyler, The Creator vs Frank Ocean
  { left: "cc2c9c3c-b7bc-4b8b-84d8-4fbd8779e493", right: "dfe9a7c4-8cf2-47f4-9dcb-d233c2b86ec3", title: "21 vs Back to Black", tagline: "British soul" }, // Adele vs Amy Winehouse
  { left: "f59c5520-5f46-4d2c-b2c4-822eabf53419", right: "8f9d6bb2-dba4-4cca-9967-cc02b9f4820c", title: "Kings of Nu Metal", tagline: "The turn of the century" }, // Linkin Park vs Limp Bizkit
  { left: "c8b03190-306c-4120-bb0b-6f2ebfc06ea9", right: "afb680f2-b6eb-4cd7-a70b-a63b25c763d5", title: "Starboy vs 24K Magic", tagline: "Pop and R&B, 2016" }, // The Weeknd vs Bruno Mars
  { left: "0383dadf-2a4e-4d10-a46a-e9e041da8eb3", right: "5441c29d-3602-4898-b1a1-b77fa23b8e50", title: "Under Pressure", tagline: "They made one together. Now pick one" }, // Queen vs David Bowie
  { left: "c07f0676-9143-4217-8a9f-4c26bd636f13", right: "516cef4d-0718-4007-9939-f9b38af3f784", title: "The Emo Throne", tagline: "Emo, 2006" }, // My Chemical Romance vs Fall Out Boy
  { left: "e4a51f17-a57b-47b1-b37b-f552d0f8e9e6", right: "2baf3276-ed6a-4349-8d2e-f4601e7b2167", title: "Utopia vs Whole Lotta Red", tagline: "Rage rap" }, // Travis Scott vs Playboi Carti
  { left: "d5d97b2b-b83b-4976-814a-056d9076c8c3", right: "382f1005-e9ab-4684-afd4-0bdae4ee37f2", title: "East vs West", tagline: "The 90s' biggest rivalry" }, // The Notorious B.I.G. vs 2Pac
  { left: "79239441-bfd5-4981-a70c-55c3f15c1287", right: "45a663b5-b1cb-4a91-bff6-2bef7bbfdd76", title: "Queen vs Princess of Pop", tagline: "Two eras of pop" }, // Madonna vs Britney Spears
  { left: "10adbe5e-a2c0-4bf3-8249-2b4cbf6e6ca8", right: "8f6bd1e4-fbe1-4f50-aa9b-94c450ec0f11", title: "Bristol's Finest", tagline: "Trip-hop" }, // Massive Attack vs Portishead
  { left: "b95ce3ff-3d05-4e87-9e01-c97b66af13d4", right: "164f0d73-1234-4e2c-8743-d77bf2191051", title: "Detroit vs Chicago", tagline: "2000s rap" }, // Eminem vs Ye
  { left: "63aa26c3-d59b-4da4-84ac-716b54f1ef4d", right: "c485632c-b784-4ee9-8ea1-c5fb365681fc", title: "Psych-Pop Kings", tagline: "Psychedelic pop" }, // Tame Impala vs MGMT
  { left: "6f1a58bf-9b1b-49cf-a44a-6cefad7ae04f", right: "f4fdbb4c-e4b7-47a0-b83b-d91bbfcfa387", title: "Levitating vs 7 Rings", tagline: "Pop now" }, // Dua Lipa vs Ariana Grande
  { left: "69ee3720-a7cb-4402-b48d-a02c366f2bcf", right: "40f5d9e4-2de7-4f2d-ad41-e31a9a9fea27", title: "Robert Smith vs Morrissey", tagline: "80s Britain" }, // The Cure vs The Smiths
  { left: "8bfac288-ccc5-448d-9573-c33ea2aa5c30", right: "67f66c07-6e61-4026-ade5-7e782fad3a5d", title: "Rock Radio Kings", tagline: "Alt rock, the 90s on" }, // Red Hot Chili Peppers vs Foo Fighters
  { left: "0d79fe8e-ba27-4859-bb8c-2f255f346853", right: "48646387-1664-4c9a-9139-9bfd091b823c", title: "ARMY vs BLINK", tagline: "K-pop's biggest" }, // BTS vs BLACKPINK
  { left: "bd13909f-1c29-4c27-a874-d4aaf27c5b1a", right: "f46bd570-5768-462e-b84c-c7c993bbf47e", title: "Rumours vs Hotel California", tagline: "70s California" }, // Fleetwood Mac vs Eagles
  { left: "4e4ebde4-0c56-4dec-844b-6c73adcdd92d", right: "61af87f4-16ee-4431-8504-cc06187079fb", title: "SoundCloud Legends", tagline: "The SoundCloud era" }, // Juice WRLD vs XXXTENTACION
  { left: "ca891d65-d9b0-4258-89f7-e6ba29d83767", right: "5182c1d9-c7d2-4dad-afa0-ccfeada921a8", title: "Metal Gods", tagline: "Heavy metal" }, // Iron Maiden vs Black Sabbath
  { left: "437a0e49-c6ae-42f6-a6c1-84f25ed366bc", right: "fa97dd36-1b82-43d7-a6e4-2adeafd59cef", title: "Cabin in the Woods", tagline: "Indie folk" }, // Bon Iver vs Fleet Foxes
  { left: "44cf61b8-5197-448a-b82b-cef6ee89fac5", right: "0103c1cc-4a09-4a5d-a344-56ad99a77193", title: "Pop-Punk Royalty", tagline: "2000s pop-punk" }, // Paramore vs Avril Lavigne
  { left: "1ee18fb3-18a6-4c7f-8ba0-bc41cdd0462e", right: "afdb7919-059d-43c1-b668-ba1d265e7e42", title: "Kings of Motown", tagline: "Soul" }, // Stevie Wonder vs Marvin Gaye
  { left: "7527f6c2-d762-4b88-b5e2-9244f1e34c46", right: "ac865b2e-bba8-4f5a-8756-dd40d5e39f46", title: "Sacramento vs Bakersfield", tagline: "Heavier nu metal" }, // Deftones vs Korn
  { left: "c85cfd6b-b1e9-4a50-bd55-eb725f04f7d5", right: "8dd98bdc-80ec-4e93-8509-2f46bafc09a7", title: "Festival Kings", tagline: "EDM" }, // Avicii vs Calvin Harris
  { left: "96855c21-b832-4366-ba12-0d2330c36a86", right: "fa58cf24-0e44-421d-8519-8bf461dcfaa5", title: "Saddest Song Wins", tagline: "Sad indie" }, // Phoebe Bridgers vs Mitski
  { left: "cc0b7089-c08d-4c10-b6b0-873582c17fd6", right: "a466c2a2-6517-42fb-a160-1087c3bafd9f", title: "Toxicity vs Iowa", tagline: "2000s metal" }, // System of a Down vs Slipknot
  { left: "72c536dc-7137-4477-a521-567eeb840fa8", right: "75167b8b-44e4-407b-9d35-effe87b223cf", title: "The Poets", tagline: "Songwriters" }, // Bob Dylan vs Neil Young
  { left: "b1e26560-60e5-4236-bbdb-9aa5a8d5ee19", right: "e4a51f17-a57b-47b1-b37b-f552d0f8e9e6", title: "Rockstar vs Sicko Mode", tagline: "Late 2010s" }, // Post Malone vs Travis Scott
  { left: "650e7db6-b795-4eb5-a702-5ea2fc46c848", right: "122d63fc-8671-43e4-9752-34e846d62a9c", title: "Poker Face vs Hot N Cold", tagline: "Pop, 2008" }, // Lady Gaga vs Katy Perry
];
