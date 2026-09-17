import { coverSrc } from "@/lib/cover-url";

/**
 * An album cover pressed onto vinyl, drawn in CSS so it appears straight
 * away. The saved avatar is the same idea drawn as an image by
 * /records/[mbid].
 */
export default function RecordDisc({
  cover,
  className = "h-40 w-40",
  spinning = false,
}: {
  cover: string | null;
  /** Size, plus anything else the disc needs. */
  className?: string;
  spinning?: boolean;
}) {
  const src = coverSrc(cover, 250);

  return (
    <span
      aria-hidden="true"
      className={`relative block shrink-0 overflow-hidden rounded-full bg-[#15151b] shadow-[0_18px_50px_-12px_rgba(0,0,0,0.9)] ${
        spinning ? "record-spin" : ""
      } ${className}`}
    >
      {src && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="absolute inset-0 h-full w-full object-cover" />
      )}
      {/* Grooves. */}
      <span
        className="absolute inset-0 rounded-full"
        style={{
          background:
            "repeating-radial-gradient(circle at center, rgba(0,0,0,0.2) 0 1px, transparent 1px 6px)",
        }}
      />
      {/* Light catching the vinyl. */}
      <span
        className="absolute inset-0 rounded-full"
        style={{
          background:
            "linear-gradient(135deg, rgba(255,255,255,0.26) 0%, transparent 34%, transparent 64%, rgba(255,255,255,0.14) 100%)",
        }}
      />
      <span className="absolute inset-0 rounded-full shadow-[inset_0_0_0_5px_rgba(11,11,14,0.9)]" />
      {/* Centre label and spindle hole. */}
      <span className="absolute left-1/2 top-1/2 flex h-[21%] w-[21%] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white/40 bg-black/55">
        <span className="h-1/4 w-1/4 rounded-full bg-bg" />
      </span>
    </span>
  );
}
