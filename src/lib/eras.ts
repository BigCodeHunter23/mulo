/**
 * Raised On: the decades, the scenes that defined them, and five records from
 * each. Somebody picks the record they grew up on, and it becomes their
 * picture until they add a photo. Album ids are MusicBrainz release groups
 * already in MULO's catalogue. Anyone can pick from any decade.
 */

export type EraAlbum = { mbid: string; title: string; artist: string; year: number; cover: string | null };

export type Scene = { id: string; name: string; artists: string[]; albums: EraAlbum[] };

export type Era = { id: string; label: string; blurb: string; scenes: Scene[] };

export const ERAS: Era[] = [
  {
    id: "60s",
    label: "The 60s",
    blurb: "Beatlemania, Motown and the summer of love",
    scenes: [
      {
        id: "british-invasion",
        name: "British Invasion",
        artists: ["The Beatles", "The Rolling Stones", "The Who"],
        albums: [
          { mbid: "72d15666-99a7-321e-b1f3-a3f8c09dff9f", title: "Revolver", artist: "The Beatles", year: 1966, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/72d15666-99a7-321e-b1f3-a3f8c09dff9f/500.jpg" },
          { mbid: "9162580e-5df4-32de-80cc-f45a8d8a9b1d", title: "Abbey Road", artist: "The Beatles", year: 1969, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/9162580e-5df4-32de-80cc-f45a8d8a9b1d/500.jpg" },
          { mbid: "784c0edd-0f37-33a2-9ca5-dff87b4f999c", title: "Let It Bleed", artist: "The Rolling Stones", year: 1969, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/784c0edd-0f37-33a2-9ca5-dff87b4f999c/500.jpg" },
          { mbid: "00c3da9f-309b-3f78-ba23-6a753fd6313d", title: "My Generation", artist: "The Who", year: 1965, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/00c3da9f-309b-3f78-ba23-6a753fd6313d/500.jpg" },
          { mbid: "4516a30e-939c-3b2b-a8ea-f94ae418d3a6", title: "The Kinks Are the Village Green Preservation Society", artist: "The Kinks", year: 1968, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/4516a30e-939c-3b2b-a8ea-f94ae418d3a6/500.jpg" },
        ],
      },
      {
        id: "motown-soul",
        name: "Motown and soul",
        artists: ["Aretha Franklin", "Otis Redding", "The Supremes"],
        albums: [
          { mbid: "7d8f07a7-4c64-3afb-8daf-8f1d4df89a78", title: "I Never Loved a Man the Way I Love You", artist: "Aretha Franklin", year: 1967, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/7d8f07a7-4c64-3afb-8daf-8f1d4df89a78/500.jpg" },
          { mbid: "2c8fd4f3-1523-3604-97dd-18ba222e2f3b", title: "Otis Blue / Otis Redding Sings Soul", artist: "Otis Redding", year: 1965, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/2c8fd4f3-1523-3604-97dd-18ba222e2f3b/500.jpg" },
          { mbid: "87a0f11f-2c56-37af-a05b-a3efcd2f98f0", title: "Where Did Our Love Go", artist: "The Supremes", year: 1964, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/87a0f11f-2c56-37af-a05b-a3efcd2f98f0/500.jpg" },
          { mbid: "37b80fea-0129-3546-9ffe-00a719ee9e61", title: "I Put a Spell on You", artist: "Nina Simone", year: 1965, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/37b80fea-0129-3546-9ffe-00a719ee9e61/500.jpg" },
          { mbid: "9e46abfc-1267-350f-b2d3-600ec3fc7d85", title: "Ain’t That Good News", artist: "Sam Cooke", year: 1964, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/9e46abfc-1267-350f-b2d3-600ec3fc7d85/500.jpg" },
        ],
      },
      {
        id: "psychedelic-rock",
        name: "Psychedelic rock",
        artists: ["Jimi Hendrix", "The Doors", "Jefferson Airplane"],
        albums: [
          { mbid: "da40e720-2097-3730-8a7f-0c2ddbff4a96", title: "Are You Experienced", artist: "The Jimi Hendrix Experience", year: 1967, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/da40e720-2097-3730-8a7f-0c2ddbff4a96/500.jpg" },
          { mbid: "8ebffd15-06c3-3b88-a761-ec18c5513287", title: "The Doors", artist: "The Doors", year: 1967, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/8ebffd15-06c3-3b88-a761-ec18c5513287/500.jpg" },
          { mbid: "e6440cd2-5e8e-367d-bc49-cc042b5ef524", title: "Surrealistic Pillow", artist: "Jefferson Airplane", year: 1967, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/e6440cd2-5e8e-367d-bc49-cc042b5ef524/500.jpg" },
          { mbid: "bbd66e31-ac27-3432-81a7-0d4b4b4c5de5", title: "Disraeli Gears", artist: "Cream", year: 1967, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/bbd66e31-ac27-3432-81a7-0d4b4b4c5de5/500.jpg" },
          { mbid: "6792b6d1-4e65-3c3c-9d20-d08aa1dcfc60", title: "The Piper at the Gates of Dawn", artist: "Pink Floyd", year: 1967, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/6792b6d1-4e65-3c3c-9d20-d08aa1dcfc60/500.jpg" },
        ],
      },
      {
        id: "folk",
        name: "Folk and protest songs",
        artists: ["Bob Dylan", "Simon & Garfunkel", "Joni Mitchell"],
        albums: [
          { mbid: "169b62aa-c3a5-3ed9-bed1-cc47c4bc51ad", title: "The Freewheelin’ Bob Dylan", artist: "Bob Dylan", year: 1963, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/169b62aa-c3a5-3ed9-bed1-cc47c4bc51ad/500.jpg" },
          { mbid: "fb48b1dc-412f-36aa-8820-1023c08c46c6", title: "Highway 61 Revisited", artist: "Bob Dylan", year: 1965, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/fb48b1dc-412f-36aa-8820-1023c08c46c6/500.jpg" },
          { mbid: "f4a26672-dcd8-342d-ad09-2b612d91c9fb", title: "Bookends", artist: "Simon & Garfunkel", year: 1968, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/f4a26672-dcd8-342d-ad09-2b612d91c9fb/500.jpg" },
          { mbid: "e0f5f627-ce00-3ed1-a3d4-8e19440b7acf", title: "Clouds", artist: "Joni Mitchell", year: 1969, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/e0f5f627-ce00-3ed1-a3d4-8e19440b7acf/500.jpg" },
          { mbid: "34291a49-8df9-304e-bd39-16b11d829d5f", title: "Songs of Leonard Cohen", artist: "Leonard Cohen", year: 1967, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/34291a49-8df9-304e-bd39-16b11d829d5f/500.jpg" },
        ],
      },
      {
        id: "sunshine-pop",
        name: "Sunshine pop",
        artists: ["The Beach Boys", "The Mamas & the Papas", "The Byrds"],
        albums: [
          { mbid: "fdd96703-7b21-365e-bdea-38029fbeb84e", title: "Pet Sounds", artist: "The Beach Boys", year: 1966, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/fdd96703-7b21-365e-bdea-38029fbeb84e/500.jpg" },
          { mbid: "6399b0c8-a1a0-3674-92b5-585a574fdf20", title: "If You Can Believe Your Eyes and Ears", artist: "The Mamas & the Papas", year: 1966, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/6399b0c8-a1a0-3674-92b5-585a574fdf20/500.jpg" },
          { mbid: "2b83d3e4-d461-31d6-9e2a-c99b69421e28", title: "Mr. Tambourine Man", artist: "The Byrds", year: 1965, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/2b83d3e4-d461-31d6-9e2a-c99b69421e28/500.jpg" },
          { mbid: "9a4a9ebf-f4f7-3dba-9b80-0b274cbc80f9", title: "Odessey and Oracle", artist: "The Zombies", year: 1968, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/9a4a9ebf-f4f7-3dba-9b80-0b274cbc80f9/500.jpg" },
          { mbid: "c7035bc6-6101-326f-992c-401d451c1716", title: "Forever Changes", artist: "Love", year: 1967, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/c7035bc6-6101-326f-992c-401d451c1716/500.jpg" },
        ],
      },
    ],
  },
  {
    id: "70s",
    label: "The 70s",
    blurb: "Stadium rock, disco and the birth of punk",
    scenes: [
      {
        id: "classic-rock",
        name: "Classic rock",
        artists: ["Led Zeppelin", "Pink Floyd", "Queen"],
        albums: [
          { mbid: "2e61da88-39e9-3473-81d2-c964cb394952", title: "[Led Zeppelin IV]", artist: "Led Zeppelin", year: 1971, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/2e61da88-39e9-3473-81d2-c964cb394952/500.jpg" },
          { mbid: "f5093c06-23e3-404f-aeaa-40f72885ee3a", title: "The Dark Side of the Moon", artist: "Pink Floyd", year: 1973, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/f5093c06-23e3-404f-aeaa-40f72885ee3a/500.jpg" },
          { mbid: "6b47c9a0-b9e1-3df9-a5e8-50a6ce0dbdbd", title: "A Night at the Opera", artist: "Queen", year: 1975, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/6b47c9a0-b9e1-3df9-a5e8-50a6ce0dbdbd/500.jpg" },
          { mbid: "416bb5e5-c7d1-3977-8fd7-7c9daf6c2be6", title: "Rumours", artist: "Fleetwood Mac", year: 1977, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/416bb5e5-c7d1-3977-8fd7-7c9daf6c2be6/500.jpg" },
          { mbid: "836f349a-0434-3e8b-a0bc-261f77a9f99c", title: "Hotel California", artist: "Eagles", year: 1976, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/836f349a-0434-3e8b-a0bc-261f77a9f99c/500.jpg" },
        ],
      },
      {
        id: "soul-funk",
        name: "Soul and funk",
        artists: ["Stevie Wonder", "Marvin Gaye", "Earth, Wind & Fire"],
        albums: [
          { mbid: "c1fa4d2c-ec62-37d5-b01d-6df7f8fd2c90", title: "What’s Going On", artist: "Marvin Gaye", year: 1971, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/c1fa4d2c-ec62-37d5-b01d-6df7f8fd2c90/500.jpg" },
          { mbid: "ea88b09b-fd34-33cf-a3e5-25a3a2fb4c6f", title: "Songs in the Key of Life", artist: "Stevie Wonder", year: 1976, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/ea88b09b-fd34-33cf-a3e5-25a3a2fb4c6f/500.jpg" },
          { mbid: "e9845207-8ae3-36db-b0e1-2efcdb46687d", title: "That’s the Way of the World", artist: "Earth, Wind & Fire", year: 1975, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/e9845207-8ae3-36db-b0e1-2efcdb46687d/500.jpg" },
          { mbid: "cb69bfc6-a15c-34cd-b1af-76b6481bf09a", title: "Mothership Connection", artist: "Parliament", year: 1975, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/cb69bfc6-a15c-34cd-b1af-76b6481bf09a/500.jpg" },
          { mbid: "3f68cf91-b4f0-39ef-8318-93dc064a53ba", title: "Superfly", artist: "Curtis Mayfield", year: 1972, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/3f68cf91-b4f0-39ef-8318-93dc064a53ba/500.jpg" },
        ],
      },
      {
        id: "disco",
        name: "Disco",
        artists: ["Donna Summer", "Chic", "ABBA"],
        albums: [
          { mbid: "f7568cc7-4c09-3a47-abbc-593e7aaac7d6", title: "Bad Girls", artist: "Donna Summer", year: 1979, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/f7568cc7-4c09-3a47-abbc-593e7aaac7d6/500.jpg" },
          { mbid: "db46b19c-0e97-30de-ba53-7e823104d14a", title: "C’est Chic", artist: "Chic", year: 1978, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/db46b19c-0e97-30de-ba53-7e823104d14a/500.jpg" },
          { mbid: "e464e167-83ab-3b59-88bd-262cf552056e", title: "Arrival", artist: "ABBA", year: 1976, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/e464e167-83ab-3b59-88bd-262cf552056e/500.jpg" },
          { mbid: "ee749c63-5699-38e0-b565-7e84414648d9", title: "Off the Wall", artist: "Michael Jackson", year: 1979, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/ee749c63-5699-38e0-b565-7e84414648d9/500.jpg" },
          { mbid: "4d9d85b2-ebf8-3693-9f8f-fc6b701b5926", title: "Spirits Having Flown", artist: "Bee Gees", year: 1979, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/4d9d85b2-ebf8-3693-9f8f-fc6b701b5926/500.jpg" },
        ],
      },
      {
        id: "punk",
        name: "Punk",
        artists: ["Ramones", "Sex Pistols", "The Clash"],
        albums: [
          { mbid: "7de1e321-4a53-3feb-b83e-f1dab88bf952", title: "Ramones", artist: "Ramones", year: 1976, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/7de1e321-4a53-3feb-b83e-f1dab88bf952/500.jpg" },
          { mbid: "e959a4b3-6306-3c45-9df6-e7241dae9ea3", title: "Never Mind the Bollocks Here’s the Sex Pistols", artist: "Sex Pistols", year: 1977, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/e959a4b3-6306-3c45-9df6-e7241dae9ea3/500.jpg" },
          { mbid: "8d73e45e-7ca1-3cb4-ae28-6da76196c17c", title: "London Calling", artist: "The Clash", year: 1979, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/8d73e45e-7ca1-3cb4-ae28-6da76196c17c/500.jpg" },
          { mbid: "ff8f533c-3cb3-3877-9209-11f433edaad2", title: "Horses", artist: "Patti Smith", year: 1975, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/ff8f533c-3cb3-3877-9209-11f433edaad2/500.jpg" },
          { mbid: "2b9f99d8-becf-3fc3-86a6-2bdd4cef93fe", title: "Marquee Moon", artist: "Television", year: 1977, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/2b9f99d8-becf-3fc3-86a6-2bdd4cef93fe/500.jpg" },
        ],
      },
      {
        id: "songwriters-glam",
        name: "Singer-songwriters and glam",
        artists: ["Joni Mitchell", "Elton John", "David Bowie"],
        albums: [
          { mbid: "42d725fb-a8b7-388c-8866-3b02789af326", title: "Blue", artist: "Joni Mitchell", year: 1971, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/42d725fb-a8b7-388c-8866-3b02789af326/500.jpg" },
          { mbid: "6e4f39e6-3403-39d7-81c6-8e61a990d509", title: "Tapestry", artist: "Carole King", year: 1971, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/6e4f39e6-3403-39d7-81c6-8e61a990d509/500.jpg" },
          { mbid: "80df0f1b-4ce7-348a-aa1b-0d31ebff111a", title: "Goodbye Yellow Brick Road", artist: "Elton John", year: 1973, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/80df0f1b-4ce7-348a-aa1b-0d31ebff111a/500.jpg" },
          { mbid: "6c9ae3dd-32ad-472c-96be-69d0a3536261", title: "The Rise and Fall of Ziggy Stardust and the Spiders From Mars", artist: "David Bowie", year: 1972, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/6c9ae3dd-32ad-472c-96be-69d0a3536261/500.jpg" },
          { mbid: "39b22944-7503-3937-8bba-09b17281cc6a", title: "Born to Run", artist: "Bruce Springsteen", year: 1975, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/39b22944-7503-3937-8bba-09b17281cc6a/500.jpg" },
        ],
      },
      {
        id: "reggae",
        name: "Reggae",
        artists: ["Bob Marley & The Wailers", "Peter Tosh", "Toots & the Maytals"],
        albums: [
          { mbid: "c5650313-60f3-34d3-92e4-300545133792", title: "Exodus", artist: "Bob Marley & The Wailers", year: 1977, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/c5650313-60f3-34d3-92e4-300545133792/500.jpg" },
          { mbid: "63a3ac2f-5d63-3132-98d3-b00385d9a3a2", title: "Catch a Fire", artist: "The Wailers", year: 1973, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/63a3ac2f-5d63-3132-98d3-b00385d9a3a2/500.jpg" },
          { mbid: "3f4929bc-c88d-3f41-910b-5c1c308da8f2", title: "Legalize It", artist: "Peter Tosh", year: 1976, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/3f4929bc-c88d-3f41-910b-5c1c308da8f2/500.jpg" },
          { mbid: "dc7f2fc9-19ff-33e9-aa0d-3c81f91ca633", title: "Funky Kingston", artist: "Toots & the Maytals", year: 1973, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/dc7f2fc9-19ff-33e9-aa0d-3c81f91ca633/500.jpg" },
          { mbid: "2b649670-7d2d-3287-9b40-5b88fb4e1f35", title: "Marcus Garvey", artist: "Burning Spear", year: 1975, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/2b649670-7d2d-3287-9b40-5b88fb4e1f35/500.jpg" },
        ],
      },
    ],
  },
  {
    id: "80s",
    label: "The 80s",
    blurb: "MTV, synths and hip hop's first wave",
    scenes: [
      {
        id: "pop-icons",
        name: "Pop icons",
        artists: ["Michael Jackson", "Madonna", "Prince"],
        albums: [
          { mbid: "f32fab67-77dd-3937-addc-9062e28e4c37", title: "Thriller", artist: "Michael Jackson", year: 1982, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/f32fab67-77dd-3937-addc-9062e28e4c37/500.jpg" },
          { mbid: "1f75a8df-176c-3d23-8f1f-b0c8935682ec", title: "Like a Prayer", artist: "Madonna", year: 1989, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/1f75a8df-176c-3d23-8f1f-b0c8935682ec/500.jpg" },
          { mbid: "d230d994-b6ab-31a0-b3e7-c6ede8307a95", title: "Purple Rain", artist: "Prince and The Revolution", year: 1984, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/d230d994-b6ab-31a0-b3e7-c6ede8307a95/500.jpg" },
          { mbid: "131d12c0-e720-31df-a2f9-d9abd868ceaf", title: "Whitney Houston", artist: "Whitney Houston", year: 1985, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/131d12c0-e720-31df-a2f9-d9abd868ceaf/500.jpg" },
          { mbid: "46d415e9-39b7-3978-9e3d-d9d8a32c6751", title: "She’s So Unusual", artist: "Cyndi Lauper", year: 1983, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/46d415e9-39b7-3978-9e3d-d9d8a32c6751/500.jpg" },
        ],
      },
      {
        id: "hip-hop-first-wave",
        name: "Hip hop's first wave",
        artists: ["Run-DMC", "Public Enemy", "Beastie Boys"],
        albums: [
          { mbid: "a209c0a5-e9b2-37ff-a76d-df5bc405a0e8", title: "Raising Hell", artist: "Run-DMC", year: 1986, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/a209c0a5-e9b2-37ff-a76d-df5bc405a0e8/500.jpg" },
          { mbid: "57f5e7c8-2a6e-34a0-b4cd-0e77695bc36f", title: "Licensed to Ill", artist: "Beastie Boys", year: 1986, cover: "https://coverartarchive.org/release-group/57f5e7c8-2a6e-34a0-b4cd-0e77695bc36f/front-500" },
          { mbid: "01921d99-9d15-3fce-8734-46e58327cfb7", title: "It Takes a Nation of Millions to Hold Us Back", artist: "Public Enemy", year: 1988, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/01921d99-9d15-3fce-8734-46e58327cfb7/500.jpg" },
          { mbid: "e124668d-731c-3d2f-bd38-facf91df5e27", title: "Paid in Full", artist: "Eric B. & Rakim", year: 1987, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/e124668d-731c-3d2f-bd38-facf91df5e27/500.jpg" },
          { mbid: "fed1608d-80b7-38d2-aeb8-c6357f0d4c23", title: "Straight Outta Compton", artist: "N.W.A", year: 1988, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/fed1608d-80b7-38d2-aeb8-c6357f0d4c23/500.jpg" },
        ],
      },
      {
        id: "synth-pop",
        name: "New wave and synth-pop",
        artists: ["Depeche Mode", "Duran Duran", "Tears for Fears"],
        albums: [
          { mbid: "e59021bd-1710-3c13-9449-b78560039592", title: "Music for the Masses", artist: "Depeche Mode", year: 1987, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/e59021bd-1710-3c13-9449-b78560039592/500.jpg" },
          { mbid: "16cc9dfc-594d-3fb9-b789-3e1bfcb6f9f8", title: "Power, Corruption & Lies", artist: "New Order", year: 1983, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/16cc9dfc-594d-3fb9-b789-3e1bfcb6f9f8/500.jpg" },
          { mbid: "3c638420-8208-3c01-b723-f061b10e3f3a", title: "Rio", artist: "Duran Duran", year: 1982, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/3c638420-8208-3c01-b723-f061b10e3f3a/500.jpg" },
          { mbid: "475946e9-4b00-3f7c-9bd7-c11f55740262", title: "Songs From the Big Chair", artist: "Tears for Fears", year: 1985, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/475946e9-4b00-3f7c-9bd7-c11f55740262/500.jpg" },
          { mbid: "e8e7999e-0b87-3298-947d-2ad22717fc27", title: "Dare", artist: "The Human League", year: 1981, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/e8e7999e-0b87-3298-947d-2ad22717fc27/500.jpg" },
        ],
      },
      {
        id: "arena-rock",
        name: "Arena rock and metal",
        artists: ["Guns N' Roses", "Bon Jovi", "Metallica"],
        albums: [
          { mbid: "a0b94d0a-210b-4b15-bd1d-93be2196c14a", title: "Appetite for Destruction", artist: "Guns N' Roses", year: 1987, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/a0b94d0a-210b-4b15-bd1d-93be2196c14a/500.jpg" },
          { mbid: "f07346e6-c889-33b8-83c8-ad987d7b14f6", title: "Slippery When Wet", artist: "Bon Jovi", year: 1986, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/f07346e6-c889-33b8-83c8-ad987d7b14f6/500.jpg" },
          { mbid: "3d00fb45-f8ab-3436-a8e1-b4bfc4d66913", title: "Master of Puppets", artist: "Metallica", year: 1986, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/3d00fb45-f8ab-3436-a8e1-b4bfc4d66913/500.jpg" },
          { mbid: "d3bc1a64-7561-3787-b680-0003aa50f8f1", title: "Back in Black", artist: "AC/DC", year: 1980, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/d3bc1a64-7561-3787-b680-0003aa50f8f1/500.jpg" },
          { mbid: "12fa3845-7c62-36e5-a8da-8be137155a72", title: "Hysteria", artist: "Def Leppard", year: 1987, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/12fa3845-7c62-36e5-a8da-8be137155a72/500.jpg" },
        ],
      },
      {
        id: "college-rock",
        name: "Post-punk and college rock",
        artists: ["The Cure", "The Smiths", "R.E.M."],
        albums: [
          { mbid: "d8dde278-482c-3cc8-a530-fea70476f3a5", title: "The Queen Is Dead", artist: "The Smiths", year: 1986, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/d8dde278-482c-3cc8-a530-fea70476f3a5/500.jpg" },
          { mbid: "494bf606-d2f7-36d0-8340-eadad8601d2b", title: "Disintegration", artist: "The Cure", year: 1989, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/494bf606-d2f7-36d0-8340-eadad8601d2b/500.jpg" },
          { mbid: "6f3e9fa6-be7a-3de8-a2b2-2072ece8a54d", title: "The Joshua Tree", artist: "U2", year: 1987, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/6f3e9fa6-be7a-3de8-a2b2-2072ece8a54d/500.jpg" },
          { mbid: "1aa41b19-5a72-341b-bd91-4cf61d1dab6b", title: "Doolittle", artist: "Pixies", year: 1989, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/1aa41b19-5a72-341b-bd91-4cf61d1dab6b/500.jpg" },
          { mbid: "de790d3d-a35c-364c-a8fb-adfb73084a45", title: "Murmur", artist: "R.E.M.", year: 1983, cover: "https://coverartarchive.org/release-group/de790d3d-a35c-364c-a8fb-adfb73084a45/front-500" },
        ],
      },
    ],
  },
  {
    id: "90s",
    label: "The 90s",
    blurb: "Golden-era rap, grunge, Britpop and rave",
    scenes: [
      {
        id: "golden-era",
        name: "Golden-era hip hop",
        artists: ["Nas", "Wu-Tang Clan", "The Notorious B.I.G."],
        albums: [
          { mbid: "28298e2c-4d70-3eed-a0f5-a3280c662b3d", title: "Illmatic", artist: "Nas", year: 1994, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/28298e2c-4d70-3eed-a0f5-a3280c662b3d/500.jpg" },
          { mbid: "610fb60f-900a-3c42-ac7d-f6b6aa8035f9", title: "Enter the Wu‐Tang (36 Chambers)", artist: "Wu-Tang Clan", year: 1993, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/610fb60f-900a-3c42-ac7d-f6b6aa8035f9/500.jpg" },
          { mbid: "5afcfeac-118a-35e6-af0d-35ec9003354d", title: "Ready to Die", artist: "The Notorious B.I.G.", year: 1994, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/5afcfeac-118a-35e6-af0d-35ec9003354d/500.jpg" },
          { mbid: "c3733436-fcba-3c08-b082-d548df5c5139", title: "The Low End Theory", artist: "A Tribe Called Quest", year: 1991, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/c3733436-fcba-3c08-b082-d548df5c5139/500.jpg" },
          { mbid: "a7f852ba-08bc-36f1-92f3-4dc127f4b70a", title: "Reasonable Doubt", artist: "JAY-Z", year: 1996, cover: "https://coverartarchive.org/release-group/a7f852ba-08bc-36f1-92f3-4dc127f4b70a/front-500" },
        ],
      },
      {
        id: "west-coast-south",
        name: "West Coast and the South",
        artists: ["Dr. Dre", "2Pac", "OutKast"],
        albums: [
          { mbid: "ad444843-7160-33d7-b0c9-fc99f2c14a99", title: "The Chronic", artist: "Dr. Dre", year: 1992, cover: "https://coverartarchive.org/release-group/ad444843-7160-33d7-b0c9-fc99f2c14a99/front-500" },
          { mbid: "649762c9-8785-3d9c-803d-2f0496f168e5", title: "Doggystyle", artist: "Snoop Doggy Dogg", year: 1993, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/649762c9-8785-3d9c-803d-2f0496f168e5/500.jpg" },
          { mbid: "e2621417-9236-36b4-9f9e-376c416dc4b0", title: "All Eyez on Me", artist: "2Pac", year: 1996, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/e2621417-9236-36b4-9f9e-376c416dc4b0/500.jpg" },
          { mbid: "eb655897-6cc5-3fc1-b9ed-5008eb80c682", title: "Aquemini", artist: "OutKast", year: 1998, cover: "https://coverartarchive.org/release-group/eb655897-6cc5-3fc1-b9ed-5008eb80c682/front-500" },
          { mbid: "f7e8792d-4aaf-389c-b0e5-a4bbae2bacdf", title: "AmeriKKKa’s Most Wanted", artist: "Ice Cube", year: 1990, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/f7e8792d-4aaf-389c-b0e5-a4bbae2bacdf/500.jpg" },
        ],
      },
      {
        id: "rnb-neo-soul",
        name: "R&B and neo-soul",
        artists: ["TLC", "Aaliyah", "Lauryn Hill"],
        albums: [
          { mbid: "3d886c06-a4c7-3431-be87-2b2940f07acd", title: "CrazySexyCool", artist: "TLC", year: 1994, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/3d886c06-a4c7-3431-be87-2b2940f07acd/500.jpg" },
          { mbid: "776a71f8-2071-3743-aab4-83436df1b366", title: "One in a Million", artist: "Aaliyah", year: 1996, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/776a71f8-2071-3743-aab4-83436df1b366/500.jpg" },
          { mbid: "49acb129-7958-3132-988c-bb85955b1c3c", title: "My Life", artist: "Mary J. Blige", year: 1994, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/49acb129-7958-3132-988c-bb85955b1c3c/500.jpg" },
          { mbid: "a4591f67-48d9-36ae-bc68-2deb954d0a15", title: "Brown Sugar", artist: "D'Angelo", year: 1995, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/a4591f67-48d9-36ae-bc68-2deb954d0a15/500.jpg" },
          { mbid: "8691d12c-abd8-385c-b1eb-d841190124f7", title: "The Miseducation of Lauryn Hill", artist: "Lauryn Hill", year: 1998, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/8691d12c-abd8-385c-b1eb-d841190124f7/500.jpg" },
        ],
      },
      {
        id: "pop",
        name: "Pop, boy bands and girl groups",
        artists: ["Spice Girls", "Backstreet Boys", "Britney Spears"],
        albums: [
          { mbid: "4180845c-8700-3fda-af8f-0b9f3a932009", title: "Spice", artist: "Spice Girls", year: 1996, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/4180845c-8700-3fda-af8f-0b9f3a932009/500.jpg" },
          { mbid: "a8fb6ac6-a659-320f-8736-87b52ad65e3a", title: "Millennium", artist: "Backstreet Boys", year: 1999, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/a8fb6ac6-a659-320f-8736-87b52ad65e3a/500.jpg" },
          { mbid: "faeb8741-2ca0-3ca6-8a1a-70bab1e67c82", title: "…Baby One More Time", artist: "Britney Spears", year: 1999, cover: "https://coverartarchive.org/release-group/faeb8741-2ca0-3ca6-8a1a-70bab1e67c82/front-500" },
          { mbid: "bf0126a1-b79c-3c9c-a892-f4bf4fac2bb0", title: "Daydream", artist: "Mariah Carey", year: 1995, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/bf0126a1-b79c-3c9c-a892-f4bf4fac2bb0/500.jpg" },
          { mbid: "ee3d18ed-d6a8-37c7-a964-41bbdb6d59f1", title: "Jagged Little Pill", artist: "Alanis Morissette", year: 1995, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/ee3d18ed-d6a8-37c7-a964-41bbdb6d59f1/500.jpg" },
        ],
      },
      {
        id: "grunge",
        name: "Grunge and alternative",
        artists: ["Nirvana", "Pearl Jam", "Radiohead"],
        albums: [
          { mbid: "1b022e01-4da6-387b-8658-8678046e4cef", title: "Nevermind", artist: "Nirvana", year: 1991, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/1b022e01-4da6-387b-8658-8678046e4cef/500.jpg" },
          { mbid: "cea5d18a-1924-3cda-bebc-38933834b25d", title: "Ten", artist: "Pearl Jam", year: 1991, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/cea5d18a-1924-3cda-bebc-38933834b25d/500.jpg" },
          { mbid: "8300fe9c-0022-3c55-8a3e-8dc61f282e8c", title: "Superunknown", artist: "Soundgarden", year: 1994, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/8300fe9c-0022-3c55-8a3e-8dc61f282e8c/500.jpg" },
          { mbid: "b1392450-e666-3926-a536-22c65f834433", title: "OK Computer", artist: "Radiohead", year: 1997, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/b1392450-e666-3926-a536-22c65f834433/500.jpg" },
          { mbid: "1af599c9-0b44-3a5a-a06b-39e8db6b2b4e", title: "Mellon Collie and the Infinite Sadness", artist: "The Smashing Pumpkins", year: 1995, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/1af599c9-0b44-3a5a-a06b-39e8db6b2b4e/500.jpg" },
        ],
      },
      {
        id: "britpop",
        name: "Britpop",
        artists: ["Oasis", "Blur", "Pulp"],
        albums: [
          { mbid: "cc7e6348-cc55-31fa-aeb2-748a46a81cb3", title: "(What’s the Story) Morning Glory?", artist: "Oasis", year: 1995, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/cc7e6348-cc55-31fa-aeb2-748a46a81cb3/500.jpg" },
          { mbid: "451dca98-c118-32e1-9244-c47ca9c3c0f9", title: "Definitely Maybe", artist: "Oasis", year: 1994, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/451dca98-c118-32e1-9244-c47ca9c3c0f9/500.jpg" },
          { mbid: "67461c8e-d864-3910-9bf4-39e44357aac9", title: "Parklife", artist: "Blur", year: 1994, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/67461c8e-d864-3910-9bf4-39e44357aac9/500.jpg" },
          { mbid: "88f69eab-8f07-343b-847c-b944ad33dfcf", title: "Different Class", artist: "Pulp", year: 1995, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/88f69eab-8f07-343b-847c-b944ad33dfcf/500.jpg" },
          { mbid: "3dd0c8e4-af53-3605-9c20-f27c7635fb60", title: "Urban Hymns", artist: "The Verve", year: 1997, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/3dd0c8e4-af53-3605-9c20-f27c7635fb60/500.jpg" },
        ],
      },
      {
        id: "rave-trance",
        name: "Rave, trance and big beat",
        artists: ["The Prodigy", "Daft Punk", "Robert Miles"],
        albums: [
          { mbid: "ac9138ce-6331-3f8d-86d7-69f13e4ab4f4", title: "The Fat of the Land", artist: "The Prodigy", year: 1997, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/ac9138ce-6331-3f8d-86d7-69f13e4ab4f4/500.jpg" },
          { mbid: "00054665-89fa-33d5-a8f0-1728ea8c32c3", title: "Homework", artist: "Daft Punk", year: 1997, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/00054665-89fa-33d5-a8f0-1728ea8c32c3/500.jpg" },
          { mbid: "8c605cec-ace8-3950-bfc9-875a4a88a285", title: "Dreamland", artist: "Robert Miles", year: 1996, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/8c605cec-ace8-3950-bfc9-875a4a88a285/500.jpg" },
          { mbid: "1bb277e1-20ed-399f-99f2-c97aea745092", title: "Reverence", artist: "Faithless", year: 1996, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/1bb277e1-20ed-399f-99f2-c97aea745092/500.jpg" },
          { mbid: "69f4aa7f-d760-3890-bd2a-902fb9abe40b", title: "Dig Your Own Hole", artist: "The Chemical Brothers", year: 1997, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/69f4aa7f-d760-3890-bd2a-902fb9abe40b/500.jpg" },
        ],
      },
    ],
  },
  {
    id: "00s",
    label: "The 2000s",
    blurb: "Blog-era rap, the indie revival and pop-punk",
    scenes: [
      {
        id: "rap",
        name: "Rap's big era",
        artists: ["Eminem", "50 Cent", "Kanye West"],
        albums: [
          { mbid: "b0fa91c8-0996-38f1-ab84-797f58d7c4eb", title: "The Marshall Mathers LP", artist: "Eminem", year: 2000, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/b0fa91c8-0996-38f1-ab84-797f58d7c4eb/500.jpg" },
          { mbid: "f624ead2-e4ba-4e52-bea5-4362b1c67b14", title: "Get Rich or Die Tryin’", artist: "50 Cent", year: 2003, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/f624ead2-e4ba-4e52-bea5-4362b1c67b14/500.jpg" },
          { mbid: "8a01217e-6947-3927-a39b-6691104694f1", title: "The College Dropout", artist: "Kanye West", year: 2004, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/8a01217e-6947-3927-a39b-6691104694f1/500.jpg" },
          { mbid: "11ae8c9c-27c1-3308-9761-edb87c8f54ea", title: "The Blueprint", artist: "JAY-Z", year: 2001, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/11ae8c9c-27c1-3308-9761-edb87c8f54ea/500.jpg" },
          { mbid: "cb688885-74b2-4e9b-a18c-6102866151f2", title: "Tha Carter III", artist: "Lil Wayne", year: 2008, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/cb688885-74b2-4e9b-a18c-6102866151f2/500.jpg" },
        ],
      },
      {
        id: "rnb-pop",
        name: "R&B and pop royalty",
        artists: ["Beyoncé", "Usher", "Rihanna"],
        albums: [
          { mbid: "f639ba46-b371-3262-b494-5f2dbee36f5c", title: "Dangerously in Love", artist: "Beyoncé", year: 2003, cover: "https://coverartarchive.org/release-group/f639ba46-b371-3262-b494-5f2dbee36f5c/front-500" },
          { mbid: "0ee013ee-5f59-35d5-b6b8-26a0cb3e4372", title: "Confessions", artist: "Usher", year: 2004, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/0ee013ee-5f59-35d5-b6b8-26a0cb3e4372/500.jpg" },
          { mbid: "7e48f018-b774-32e6-a68b-b42db04535c0", title: "Good Girl Gone Bad", artist: "Rihanna", year: 2007, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/7e48f018-b774-32e6-a68b-b42db04535c0/500.jpg" },
          { mbid: "5701e04b-efc2-3429-b8af-c6596f1d08cf", title: "Songs in A Minor", artist: "Alicia Keys", year: 2001, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/5701e04b-efc2-3429-b8af-c6596f1d08cf/500.jpg" },
          { mbid: "00de8e96-b902-3d80-b980-1298937b0b2a", title: "FutureSex/LoveSounds", artist: "Justin Timberlake", year: 2006, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/00de8e96-b902-3d80-b980-1298937b0b2a/500.jpg" },
        ],
      },
      {
        id: "indie",
        name: "Indie rock revival",
        artists: ["The Strokes", "Arctic Monkeys", "The White Stripes"],
        albums: [
          { mbid: "efea26d1-a016-30f6-b8e2-bc8c02336b0a", title: "Is This It", artist: "The Strokes", year: 2001, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/efea26d1-a016-30f6-b8e2-bc8c02336b0a/500.jpg" },
          { mbid: "6c9c4985-3628-3070-b956-b538f30c9bea", title: "Whatever People Say I Am, That’s What I’m Not", artist: "Arctic Monkeys", year: 2005, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/6c9c4985-3628-3070-b956-b538f30c9bea/500.jpg" },
          { mbid: "d85b9684-4277-3565-b89b-115c8b4b7fd3", title: "Elephant", artist: "The White Stripes", year: 2003, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/d85b9684-4277-3565-b89b-115c8b4b7fd3/500.jpg" },
          { mbid: "e8e2d824-dd32-3b24-9c7c-24619fbe86a9", title: "Fever to Tell", artist: "Yeah Yeah Yeahs", year: 2003, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/e8e2d824-dd32-3b24-9c7c-24619fbe86a9/500.jpg" },
          { mbid: "05affa96-5959-32da-8d75-1c9eb985ca59", title: "Funeral", artist: "Arcade Fire", year: 2004, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/05affa96-5959-32da-8d75-1c9eb985ca59/500.jpg" },
        ],
      },
      {
        id: "pop-punk-emo",
        name: "Pop-punk and emo",
        artists: ["Green Day", "My Chemical Romance", "Paramore"],
        albums: [
          { mbid: "de9bf827-a9b0-348b-a7c9-556c03c3fb07", title: "American Idiot", artist: "Green Day", year: 2004, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/de9bf827-a9b0-348b-a7c9-556c03c3fb07/500.jpg" },
          { mbid: "bcba43e7-2f72-3b60-b234-577e77fd2d9e", title: "The Black Parade", artist: "My Chemical Romance", year: 2006, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/bcba43e7-2f72-3b60-b234-577e77fd2d9e/500.jpg" },
          { mbid: "e848562f-a802-355c-a52c-90ba6aaa91d1", title: "From Under the Cork Tree", artist: "Fall Out Boy", year: 2005, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/e848562f-a802-355c-a52c-90ba6aaa91d1/500.jpg" },
          { mbid: "ebd19544-9af0-317a-a2d3-f0c57ddd79f7", title: "RIOT!", artist: "Paramore", year: 2007, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/ebd19544-9af0-317a-a2d3-f0c57ddd79f7/500.jpg" },
          { mbid: "0837aca2-319e-3f2f-a2d3-c525802068d6", title: "Let Go", artist: "Avril Lavigne", year: 2002, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/0837aca2-319e-3f2f-a2d3-c525802068d6/500.jpg" },
        ],
      },
      {
        id: "nu-metal",
        name: "Nu metal",
        artists: ["Linkin Park", "System of a Down", "Slipknot"],
        albums: [
          { mbid: "b5b4bb4b-8ba5-3acf-88cb-4cae2699d8da", title: "Hybrid Theory", artist: "Linkin Park", year: 2000, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/b5b4bb4b-8ba5-3acf-88cb-4cae2699d8da/500.jpg" },
          { mbid: "f50fbcb4-bfcd-3784-b4c9-44f4793e66b2", title: "Toxicity", artist: "System of a Down", year: 2001, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/f50fbcb4-bfcd-3784-b4c9-44f4793e66b2/500.jpg" },
          { mbid: "082c68eb-d993-36cf-9b32-6663cba2d052", title: "Iowa", artist: "Slipknot", year: 2001, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/082c68eb-d993-36cf-9b32-6663cba2d052/500.jpg" },
          { mbid: "a7d33e96-8e09-3aff-8629-44812a1b8489", title: "White Pony", artist: "Deftones", year: 2000, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/a7d33e96-8e09-3aff-8629-44812a1b8489/500.jpg" },
          { mbid: "2187d248-1a3b-35d0-a4ec-bead586ff547", title: "Fallen", artist: "Evanescence", year: 2003, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/2187d248-1a3b-35d0-a4ec-bead586ff547/500.jpg" },
        ],
      },
      {
        id: "pop-soul",
        name: "Pop and the soul revival",
        artists: ["Lady Gaga", "Amy Winehouse", "Kelly Clarkson"],
        albums: [
          { mbid: "e5495719-b3ad-3eea-a533-fb70af43c23d", title: "The Fame", artist: "Lady Gaga", year: 2008, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/e5495719-b3ad-3eea-a533-fb70af43c23d/500.jpg" },
          { mbid: "6eac2e57-ee50-36f8-b0c4-c4c847a2c098", title: "Back to Black", artist: "Amy Winehouse", year: 2006, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/6eac2e57-ee50-36f8-b0c4-c4c847a2c098/500.jpg" },
          { mbid: "add6cf16-f4c1-3d50-9b28-633b35ca8189", title: "In the Zone", artist: "Britney Spears", year: 2003, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/add6cf16-f4c1-3d50-9b28-633b35ca8189/500.jpg" },
          { mbid: "0d0ddce6-a611-3dc0-923c-60ac3da72ad8", title: "Breakaway", artist: "Kelly Clarkson", year: 2003, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/0d0ddce6-a611-3dc0-923c-60ac3da72ad8/500.jpg" },
          { mbid: "9796da06-2d59-3176-8598-2105f31ee54a", title: "19", artist: "Adele", year: 2008, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/9796da06-2d59-3176-8598-2105f31ee54a/500.jpg" },
        ],
      },
      {
        id: "trance-electro",
        name: "Trance and electro",
        artists: ["Daft Punk", "Tiësto", "deadmau5"],
        albums: [
          { mbid: "48117b90-a16e-34ca-a514-19c702df1158", title: "Discovery", artist: "Daft Punk", year: 2001, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/48117b90-a16e-34ca-a514-19c702df1158/500.jpg" },
          { mbid: "8e3f9a94-7ccf-3091-98ab-e7d84181ccf8", title: "In My Memory", artist: "Tiësto", year: 2001, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/8e3f9a94-7ccf-3091-98ab-e7d84181ccf8/500.jpg" },
          { mbid: "b4a2060a-aa07-3d86-a9f2-eb7610555d7d", title: "76", artist: "Armin van Buuren", year: 2003, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/b4a2060a-aa07-3d86-a9f2-eb7610555d7d/500.jpg" },
          { mbid: "867d4882-4e8e-3acd-8134-66f19bcca915", title: "✝", artist: "Justice", year: 2007, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/867d4882-4e8e-3acd-8134-66f19bcca915/500.jpg" },
          { mbid: "638a007a-8423-40d6-a97c-f819d320d33c", title: "for lack of a better name", artist: "deadmau5", year: 2009, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/638a007a-8423-40d6-a97c-f819d320d33c/500.jpg" },
        ],
      },
    ],
  },
  {
    id: "10s",
    label: "The 2010s",
    blurb: "Streaming, SoundCloud rap and the pop reset",
    scenes: [
      {
        id: "rap",
        name: "Rap takes over",
        artists: ["Kendrick Lamar", "Drake", "Travis Scott"],
        albums: [
          { mbid: "499c19c8-0dab-4824-884b-6191d145e95b", title: "good kid, m.A.A.d city", artist: "Kendrick Lamar", year: 2012, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/499c19c8-0dab-4824-884b-6191d145e95b/500.jpg" },
          { mbid: "d9103c72-3807-4378-9ce7-b6f3e8fdd547", title: "To Pimp a Butterfly", artist: "Kendrick Lamar", year: 2015, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/d9103c72-3807-4378-9ce7-b6f3e8fdd547/500.jpg" },
          { mbid: "47809021-4515-4215-beea-db3f5dfb6267", title: "Take Care", artist: "Drake", year: 2011, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/47809021-4515-4215-beea-db3f5dfb6267/500.jpg" },
          { mbid: "5d6e21e1-deb5-428e-bb42-c2a567f3619b", title: "My Beautiful Dark Twisted Fantasy", artist: "Kanye West", year: 2010, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/5d6e21e1-deb5-428e-bb42-c2a567f3619b/500.jpg" },
          { mbid: "c0704c7d-dc5b-43cd-b372-8056a3bf7bb2", title: "ASTROWORLD", artist: "Travis Scott", year: 2018, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/c0704c7d-dc5b-43cd-b372-8056a3bf7bb2/500.jpg" },
        ],
      },
      {
        id: "soundcloud-trap",
        name: "SoundCloud and trap",
        artists: ["Future", "Migos", "Juice WRLD"],
        albums: [
          { mbid: "9ac43ae5-c0de-42f6-8365-b68de4966833", title: "DS2", artist: "Future", year: 2015, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/9ac43ae5-c0de-42f6-8365-b68de4966833/500.jpg" },
          { mbid: "5611e7a8-3b0d-48a1-820e-45b94229f653", title: "Culture", artist: "Migos", year: 2017, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/5611e7a8-3b0d-48a1-820e-45b94229f653/500.jpg" },
          { mbid: "8bd7dded-24ea-488c-a3e3-3c7158ea12ee", title: "Goodbye & Good Riddance", artist: "Juice WRLD", year: 2018, cover: "https://coverartarchive.org/release-group/8bd7dded-24ea-488c-a3e3-3c7158ea12ee/front-500" },
          { mbid: "4609ccc4-45e4-49b9-9a1e-a98962a5a923", title: "17", artist: "XXXTENTACION", year: 2017, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/4609ccc4-45e4-49b9-9a1e-a98962a5a923/500.jpg" },
          { mbid: "f7479a73-66a7-41be-9f77-9e70828a5809", title: "Die Lit", artist: "Playboi Carti", year: 2018, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/f7479a73-66a7-41be-9f77-9e70828a5809/500.jpg" },
        ],
      },
      {
        id: "alt-rnb",
        name: "Alternative R&B",
        artists: ["Frank Ocean", "The Weeknd", "SZA"],
        albums: [
          { mbid: "f8f4167d-897c-4b25-a171-638374d1dfa4", title: "channel ORANGE", artist: "Frank Ocean", year: 2012, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/f8f4167d-897c-4b25-a171-638374d1dfa4/500.jpg" },
          { mbid: "0da340a0-6ad7-4fc2-a272-6f94393a7831", title: "Blonde", artist: "Frank Ocean", year: 2016, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/0da340a0-6ad7-4fc2-a272-6f94393a7831/500.jpg" },
          { mbid: "ceaa5c39-91c7-4c8a-886c-85b11fa8a1f6", title: "Starboy", artist: "The Weeknd", year: 2016, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/ceaa5c39-91c7-4c8a-886c-85b11fa8a1f6/500.jpg" },
          { mbid: "8f892c1b-0709-4cf4-9711-493892a9eb9b", title: "Ctrl", artist: "SZA", year: 2017, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/8f892c1b-0709-4cf4-9711-493892a9eb9b/500.jpg" },
          { mbid: "c1f22e07-7bdf-4a4f-8b50-7747c1091ef6", title: "Lemonade", artist: "Beyoncé", year: 2016, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/c1f22e07-7bdf-4a4f-8b50-7747c1091ef6/500.jpg" },
        ],
      },
      {
        id: "pop",
        name: "Pop in the streaming era",
        artists: ["Taylor Swift", "Adele", "Ariana Grande"],
        albums: [
          { mbid: "4d9ec1c2-58ec-48a4-aa0a-916718adead0", title: "1989", artist: "Taylor Swift", year: 2014, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/4d9ec1c2-58ec-48a4-aa0a-916718adead0/500.jpg" },
          { mbid: "e4174758-d333-4a8e-a31f-dd0edd51518e", title: "21", artist: "Adele", year: 2011, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/e4174758-d333-4a8e-a31f-dd0edd51518e/500.jpg" },
          { mbid: "485d3241-ef02-49a4-88df-a03eaa86d9cd", title: "thank u, next", artist: "Ariana Grande", year: 2019, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/485d3241-ef02-49a4-88df-a03eaa86d9cd/500.jpg" },
          { mbid: "668e80e0-b35e-4471-9788-0a3d797fe42c", title: "Melodrama", artist: "Lorde", year: 2017, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/668e80e0-b35e-4471-9788-0a3d797fe42c/500.jpg" },
          { mbid: "72375978-a9a1-4254-b957-85565c716b7e", title: "WHEN WE ALL FALL ASLEEP, WHERE DO WE GO?", artist: "Billie Eilish", year: 2019, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/72375978-a9a1-4254-b957-85565c716b7e/500.jpg" },
        ],
      },
      {
        id: "indie-psych",
        name: "Indie and psych",
        artists: ["Tame Impala", "Arctic Monkeys", "Lana Del Rey"],
        albums: [
          { mbid: "08aa7a6c-3e43-4459-87b2-e47faf3a088a", title: "Currents", artist: "Tame Impala", year: 2015, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/08aa7a6c-3e43-4459-87b2-e47faf3a088a/500.jpg" },
          { mbid: "a348ba2f-f8b3-4686-b928-e63d8d94d543", title: "AM", artist: "Arctic Monkeys", year: 2013, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/a348ba2f-f8b3-4686-b928-e63d8d94d543/500.jpg" },
          { mbid: "4b16a1bc-8644-48ae-9b3e-8ae36aa30cfc", title: "Born to Die", artist: "Lana Del Rey", year: 2012, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/4b16a1bc-8644-48ae-9b3e-8ae36aa30cfc/500.jpg" },
          { mbid: "eb143c5a-9a85-4bce-a78c-f7faf72c0169", title: "Modern Vampires of the City", artist: "Vampire Weekend", year: 2013, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/eb143c5a-9a85-4bce-a78c-f7faf72c0169/500.jpg" },
          { mbid: "2cb36662-3560-4b90-a0a5-7924ac039490", title: "Bon Iver, Bon Iver", artist: "Bon Iver", year: 2011, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/2cb36662-3560-4b90-a0a5-7924ac039490/500.jpg" },
        ],
      },
      {
        id: "edm",
        name: "EDM and dance",
        artists: ["Avicii", "Calvin Harris", "Disclosure"],
        albums: [
          { mbid: "61180839-f4a7-407f-b86f-24c48eef4066", title: "True", artist: "Avicii", year: 2013, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/61180839-f4a7-407f-b86f-24c48eef4066/500.jpg" },
          { mbid: "98432828-5764-4892-9e3f-9c674cf70acb", title: "18 Months", artist: "Calvin Harris", year: 2012, cover: "https://coverartarchive.org/release-group/98432828-5764-4892-9e3f-9c674cf70acb/front-500" },
          { mbid: "aa997ea0-2936-40bd-884d-3af8a0e064dc", title: "Random Access Memories", artist: "Daft Punk", year: 2013, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/aa997ea0-2936-40bd-884d-3af8a0e064dc/500.jpg" },
          { mbid: "cefd427e-185e-4a94-a6a9-a03d8a53b60a", title: "Settle", artist: "Disclosure", year: 2013, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/cefd427e-185e-4a94-a6a9-a03d8a53b60a/500.jpg" },
          { mbid: "8a24ae64-e344-43ef-bbe0-d9880c6629ad", title: "Flume", artist: "Flume", year: 2012, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/8a24ae64-e344-43ef-bbe0-d9880c6629ad/500.jpg" },
        ],
      },
    ],
  },
  {
    id: "20s",
    label: "The 2020s",
    blurb: "TikTok hits, global pop and the dance comeback",
    scenes: [
      {
        id: "pop",
        name: "Pop now",
        artists: ["Taylor Swift", "Olivia Rodrigo", "Sabrina Carpenter"],
        albums: [
          { mbid: "f1d08326-c23b-4b43-be3b-20b33ab10bf6", title: "folklore", artist: "Taylor Swift", year: 2020, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/f1d08326-c23b-4b43-be3b-20b33ab10bf6/500.jpg" },
          { mbid: "2ae2e504-7116-4b4f-b632-9748bb18ccd2", title: "SOUR", artist: "Olivia Rodrigo", year: 2021, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/2ae2e504-7116-4b4f-b632-9748bb18ccd2/500.jpg" },
          { mbid: "d712ba0e-25fa-4c03-aecd-ec0c100deba5", title: "Harry’s House", artist: "Harry Styles", year: 2022, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/d712ba0e-25fa-4c03-aecd-ec0c100deba5/500.jpg" },
          { mbid: "c8bea388-c195-4177-bf9b-7469f6e695a1", title: "Short n’ Sweet", artist: "Sabrina Carpenter", year: 2024, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/c8bea388-c195-4177-bf9b-7469f6e695a1/500.jpg" },
          { mbid: "eda0f5d3-44eb-42cf-bcfd-5c9f93e05c7a", title: "The Rise and Fall of a Midwest Princess", artist: "Chappell Roan", year: 2023, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/eda0f5d3-44eb-42cf-bcfd-5c9f93e05c7a/500.jpg" },
        ],
      },
      {
        id: "rap",
        name: "Rap now",
        artists: ["Kendrick Lamar", "Travis Scott", "Tyler, The Creator"],
        albums: [
          { mbid: "6bd70eee-bd46-4738-851a-f50c19d8d6db", title: "Mr. Morale & the Big Steppers", artist: "Kendrick Lamar", year: 2022, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/6bd70eee-bd46-4738-851a-f50c19d8d6db/500.jpg" },
          { mbid: "32cb822c-a14e-49ce-a169-f209c5f31e0f", title: "GNX", artist: "Kendrick Lamar", year: 2024, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/32cb822c-a14e-49ce-a169-f209c5f31e0f/500.jpg" },
          { mbid: "eac07d92-86b1-4fa7-906d-ec3177f8ebc2", title: "UTOPIA", artist: "Travis Scott", year: 2023, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/eac07d92-86b1-4fa7-906d-ec3177f8ebc2/500.jpg" },
          { mbid: "c65de046-7a48-4269-b4e5-4db0ed328f47", title: "CALL ME IF YOU GET LOST", artist: "Tyler, The Creator", year: 2021, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/c65de046-7a48-4269-b4e5-4db0ed328f47/500.jpg" },
          { mbid: "6c90cb91-e615-4545-854b-6d6f10c5cb6d", title: "Planet Her", artist: "Doja Cat", year: 2021, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/6c90cb91-e615-4545-854b-6d6f10c5cb6d/500.jpg" },
        ],
      },
      {
        id: "rnb",
        name: "R&B now",
        artists: ["SZA", "The Weeknd", "Brent Faiyaz"],
        albums: [
          { mbid: "1646286a-d0ad-4288-bfab-34b0fb7b22c1", title: "SOS", artist: "SZA", year: 2022, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/1646286a-d0ad-4288-bfab-34b0fb7b22c1/500.jpg" },
          { mbid: "78570bea-2a26-467c-a3db-c52723ceb394", title: "After Hours", artist: "The Weeknd", year: 2020, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/78570bea-2a26-467c-a3db-c52723ceb394/500.jpg" },
          { mbid: "52859a02-4538-4e5c-b484-7d179f4c6ff6", title: "WASTELAND", artist: "Brent Faiyaz", year: 2022, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/52859a02-4538-4e5c-b484-7d179f4c6ff6/500.jpg" },
          { mbid: "334ee344-e32f-4e83-a6d6-704161e52768", title: "Still Over It", artist: "Summer Walker", year: 2021, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/334ee344-e32f-4e83-a6d6-704161e52768/500.jpg" },
          { mbid: "2c82c3a9-b669-43c2-915e-7dd9d0f5ceb7", title: "JAGUAR II", artist: "Victoria Monét", year: 2023, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/2c82c3a9-b669-43c2-915e-7dd9d0f5ceb7/500.jpg" },
        ],
      },
      {
        id: "global",
        name: "Global pop",
        artists: ["Bad Bunny", "Rosalía", "BLACKPINK"],
        albums: [
          { mbid: "e992b449-141b-4aea-b07b-9b2a478a8570", title: "Un verano sin ti", artist: "Bad Bunny", year: 2022, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/e992b449-141b-4aea-b07b-9b2a478a8570/500.jpg" },
          { mbid: "e20e0bc0-4660-461b-8ac7-14ad2459cda6", title: "YHLQMDLG", artist: "Bad Bunny", year: 2020, cover: "https://coverartarchive.org/release-group/e20e0bc0-4660-461b-8ac7-14ad2459cda6/front-500" },
          { mbid: "f455f658-dd55-4790-8cd3-99c7c273018a", title: "MOTOMAMI", artist: "ROSALÍA", year: 2022, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/f455f658-dd55-4790-8cd3-99c7c273018a/500.jpg" },
          { mbid: "8240b45e-5e5c-4c47-a96c-0a0d2c556c08", title: "THE ALBUM", artist: "BLACKPINK", year: 2020, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/8240b45e-5e5c-4c47-a96c-0a0d2c556c08/500.jpg" },
          { mbid: "1ad23c12-6833-40b7-8e3d-aaf4eaaaceda", title: "Love, Damini", artist: "Burna Boy", year: 2022, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/1ad23c12-6833-40b7-8e3d-aaf4eaaaceda/500.jpg" },
        ],
      },
      {
        id: "indie-alt",
        name: "Indie and alt",
        artists: ["Phoebe Bridgers", "boygenius", "Mitski"],
        albums: [
          { mbid: "cf75fd5a-ca84-4371-94d7-27410360f06b", title: "Punisher", artist: "Phoebe Bridgers", year: 2020, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/cf75fd5a-ca84-4371-94d7-27410360f06b/500.jpg" },
          { mbid: "1339f18d-220a-4405-8ae9-e52993b1ef70", title: "the record", artist: "boygenius", year: 2023, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/1339f18d-220a-4405-8ae9-e52993b1ef70/500.jpg" },
          { mbid: "242741bf-182e-45d9-9276-5af8d1b31ad9", title: "The Land Is Inhospitable and So Are We", artist: "Mitski", year: 2023, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/242741bf-182e-45d9-9276-5af8d1b31ad9/500.jpg" },
          { mbid: "92b095c1-3bbf-456f-9425-2078ad4e9504", title: "Romance", artist: "Fontaines D.C.", year: 2024, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/92b095c1-3bbf-456f-9425-2078ad4e9504/500.jpg" },
          { mbid: "c6fc678e-e987-45c5-811c-e2bd09c8b902", title: "The Slow Rush", artist: "Tame Impala", year: 2020, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/c6fc678e-e987-45c5-811c-e2bd09c8b902/500.jpg" },
        ],
      },
      {
        id: "dance",
        name: "The dance comeback",
        artists: ["Dua Lipa", "Charli xcx", "Beyoncé"],
        albums: [
          { mbid: "aa366795-92d7-4d67-91fa-6741f82a4858", title: "Future Nostalgia", artist: "Dua Lipa", year: 2020, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/aa366795-92d7-4d67-91fa-6741f82a4858/500.jpg" },
          { mbid: "e0fdb431-0109-420d-8a37-f99eaeb4d671", title: "BRAT", artist: "Charli xcx", year: 2024, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/e0fdb431-0109-420d-8a37-f99eaeb4d671/500.jpg" },
          { mbid: "2c385052-5083-43a2-b1e5-36566d2ae3c0", title: "RENAISSANCE", artist: "Beyoncé", year: 2022, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/2c385052-5083-43a2-b1e5-36566d2ae3c0/500.jpg" },
          { mbid: "48282ba2-a382-45ff-81bf-670565dd65de", title: "ten days", artist: "Fred again..", year: 2024, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/48282ba2-a382-45ff-81bf-670565dd65de/500.jpg" },
          { mbid: "cb7c65af-9ead-4b6c-bfac-87e8736d2cab", title: "I Hear You", artist: "Peggy Gou", year: 2024, cover: "https://pxoxsrzwswilmfxnjhas.supabase.co/storage/v1/object/public/covers/cb7c65af-9ead-4b6c-bfac-87e8736d2cab/500.jpg" },
        ],
      },
    ],
  },
];
