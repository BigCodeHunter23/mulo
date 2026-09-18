/**
 * Links out to the big streaming services, so a record you've just found can
 * be played in full in the app you already pay for. Each opens a search there
 * rather than an exact page: no accounts or approvals needed, and a search for
 * artist and title almost always lands on the record at the top.
 */
const SERVICES = [
  { name: "Spotify", url: (q: string) => `https://open.spotify.com/search/${encodeURIComponent(q)}` },
  { name: "Apple Music", url: (q: string) => `https://music.apple.com/search?term=${encodeURIComponent(q)}` },
  { name: "YouTube Music", url: (q: string) => `https://music.youtube.com/search?q=${encodeURIComponent(q)}` },
] as const;

export default function ListenOn({
  artist,
  title,
  className = "",
}: {
  artist: string | null;
  title: string;
  className?: string;
}) {
  const query = artist ? `${artist} ${title}` : title;
  return (
    <div className={`flex flex-wrap items-center justify-center gap-1.5 sm:justify-start ${className}`}>
      <span className="mr-1 text-xs text-text-muted">Listen on</span>
      {SERVICES.map((service) => (
        <a
          key={service.name}
          href={service.url(query)}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-full border border-border-strong px-3 py-1 text-xs font-medium text-text-secondary transition-colors hover:border-accent hover:text-accent"
        >
          {service.name}
        </a>
      ))}
    </div>
  );
}
