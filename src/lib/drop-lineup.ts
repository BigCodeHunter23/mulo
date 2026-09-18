/**
 * The Drop's lineup: one album a week, in this order, looping.
 *
 * Hand-picked rather than worked out, so a week's album can never change under
 * people halfway through it, and so it can be curated. Hip hop and R&B
 * alternate with rock, pop and electronic, across the decades, so no scene
 * waits long for its turn. Every album here is already in the catalogue with
 * its cover and tracklist.
 *
 * Reordering or swapping changes future weeks only if it's done beyond the
 * current one — see `DROP_START` in drop.ts.
 */
export type DropAlbum = { mbid: string; title: string; artist: string };

export const DROP_LINEUP: DropAlbum[] = [
  { mbid: "499c19c8-0dab-4824-884b-6191d145e95b", title: "good kid, m.A.A.d city", artist: "Kendrick Lamar" },
  { mbid: "b1392450-e666-3926-a536-22c65f834433", title: "OK Computer", artist: "Radiohead" },
  { mbid: "0da340a0-6ad7-4fc2-a272-6f94393a7831", title: "Blonde", artist: "Frank Ocean" },
  { mbid: "48117b90-a16e-34ca-a514-19c702df1158", title: "Discovery", artist: "Daft Punk" },
  { mbid: "28298e2c-4d70-3eed-a0f5-a3280c662b3d", title: "Illmatic", artist: "Nas" },
  { mbid: "416bb5e5-c7d1-3977-8fd7-7c9daf6c2be6", title: "Rumours", artist: "Fleetwood Mac" },
  { mbid: "c0704c7d-dc5b-43cd-b372-8056a3bf7bb2", title: "ASTROWORLD", artist: "Travis Scott" },
  { mbid: "1b022e01-4da6-387b-8658-8678046e4cef", title: "Nevermind", artist: "Nirvana" },
  { mbid: "8691d12c-abd8-385c-b1eb-d841190124f7", title: "The Miseducation of Lauryn Hill", artist: "Lauryn Hill" },
  { mbid: "08aa7a6c-3e43-4459-87b2-e47faf3a088a", title: "Currents", artist: "Tame Impala" },
  { mbid: "5d6e21e1-deb5-428e-bb42-c2a567f3619b", title: "My Beautiful Dark Twisted Fantasy", artist: "Kanye West" },
  { mbid: "aa366795-92d7-4d67-91fa-6741f82a4858", title: "Future Nostalgia", artist: "Dua Lipa" },
  { mbid: "5afcfeac-118a-35e6-af0d-35ec9003354d", title: "Ready to Die", artist: "The Notorious B.I.G." },
  { mbid: "f5093c06-23e3-404f-aeaa-40f72885ee3a", title: "The Dark Side of the Moon", artist: "Pink Floyd" },
  { mbid: "1646286a-d0ad-4288-bfab-34b0fb7b22c1", title: "SOS", artist: "SZA" },
  { mbid: "efea26d1-a016-30f6-b8e2-bc8c02336b0a", title: "Is This It", artist: "The Strokes" },
  { mbid: "fa64febd-61e0-346e-aaa2-04564ed4f0a3", title: "Speakerboxxx / The Love Below", artist: "OutKast" },
  { mbid: "6eac2e57-ee50-36f8-b0c4-c4c847a2c098", title: "Back to Black", artist: "Amy Winehouse" },
  { mbid: "1b4bb003-db4c-4858-84ec-817aaca09501", title: "Man on the Moon: The End of Day", artist: "Kid Cudi" },
  { mbid: "f32fab67-77dd-3937-addc-9062e28e4c37", title: "Thriller", artist: "Michael Jackson" },
  { mbid: "0f1b9e07-b38b-4bba-9794-55e0924d7177", title: "IGOR", artist: "Tyler, The Creator" },
  { mbid: "f113fa38-7908-3ec9-8145-d2455e78a8b2", title: "Favourite Worst Nightmare", artist: "Arctic Monkeys" },
  { mbid: "ab570ccb-b06b-3746-8147-4903163ba895", title: "Madvillainy", artist: "Madvillain" },
  { mbid: "4b16a1bc-8644-48ae-9b3e-8ae36aa30cfc", title: "Born to Die", artist: "Lana Del Rey" },
  { mbid: "47809021-4515-4215-beea-db3f5dfb6267", title: "Take Care", artist: "Drake" },
  { mbid: "6f9f6899-c0d3-311d-ae87-a10ae6bc53a9", title: "Mezzanine", artist: "Massive Attack" },
];
