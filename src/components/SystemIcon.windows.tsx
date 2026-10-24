import type { LucideIcon } from "lucide-react";
export default function SystemIcon({ fallback: Icon, size = 18, className = "" }: {
  name: string; fallback: LucideIcon; size?: number; className?: string;
}) { return <Icon size={size} strokeWidth={1.7} className={className} aria-hidden="true" />; }
