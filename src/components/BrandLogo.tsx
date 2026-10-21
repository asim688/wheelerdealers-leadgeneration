/**
 * Brand mark — renders the real logo image from `public/logo.jpeg`.
 *
 * The artwork sits on a white background, so on dark surfaces (`light`) we
 * present it inside a clean white badge; on light surfaces it renders plain.
 */
export default function BrandLogo({
  light = false,
  size = "md",
}: {
  /** Set when placed on a dark background (wraps the mark in a white badge). */
  light?: boolean;
  /** Visual size of the mark. */
  size?: "sm" | "md" | "lg";
}) {
  const height = size === "lg" ? "h-20" : size === "sm" ? "h-10" : "h-16";

  const img = (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/logo.jpeg"
      alt="The Wheeler Dealers"
      className={`${height} w-auto select-none object-contain`}
    />
  );

  if (light) {
    return (
      <span className="inline-flex items-center rounded-lg bg-white px-2.5 py-1.5 shadow-sm">
        {img}
      </span>
    );
  }

  return img;
}
