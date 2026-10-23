import type { LucideIcon } from "lucide-react";
const sources = import.meta.glob("../assets/symbols/*.png", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;
const apple = typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.platform);
export default function SystemIcon({
  name,
  fallback: Fallback,
  size = 18,
  className = "",
}: {
  name: string;
  fallback: LucideIcon;
  size?: number;
  className?: string;
}) {
  const source = sources[`../assets/symbols/${name}.png`];
  if (!apple || !source)
    return <Fallback size={size} strokeWidth={1.7} className={className} aria-hidden="true" />;
  return (
    <span
      className={`sf-symbol ${className}`}
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        WebkitMaskImage: `url("${source}")`,
        maskImage: `url("${source}")`,
      }}
    />
  );
}
