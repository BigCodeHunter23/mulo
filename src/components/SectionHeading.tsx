/**
 * The section headings from the mockups: large condensed type sitting on a
 * navy rule that runs the width of the content.
 */
export default function SectionHeading({
  children,
  action,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="mulo-rule mb-4 flex items-end justify-between gap-4 pb-1">
      <h2 className="font-display text-2xl font-bold leading-none text-mulo-navy">
        {children}
      </h2>
      {action}
    </div>
  );
}
