import { useEffect, useState, useRef } from "react";
import { X } from "lucide-react";

interface ToastProps {
  message: string;
  onClose: () => void;
  duration?: number;
}

export default function Toast({ message, onClose, duration = 4000 }: ToastProps) {
  const [visible, setVisible] = useState(false);

  const close = useRef(onClose);
  close.current = onClose;
  const exitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setVisible(true));

    const timer = setTimeout(() => {
      setVisible(false);
      exitTimer.current = setTimeout(() => close.current(), 200);
    }, duration);

    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
      if (exitTimer.current) clearTimeout(exitTimer.current);
    };
  }, [duration, message]);

  return (
    <div
      role="alert"
      className={[
        "fixed top-0 right-5 z-50",
        "flex items-center gap-3 rounded-lg py-3 pr-3 pl-4",
        "bg-charcoal-200 border-border border",
        "border-l-error border-l-2",
        "shadow-lg shadow-black/30",
        "transition-all duration-200 ease-out",
        visible ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
      ].join(" ")}
    >
      <span className="text-ink-secondary max-w-sm text-sm">{message}</span>
      <button
        aria-label="Dismiss notification"
        onClick={() => {
          setVisible(false);
          if (exitTimer.current) clearTimeout(exitTimer.current);
          exitTimer.current = setTimeout(() => close.current(), 200);
        }}
        className="text-ink-muted hover:text-ink shrink-0 cursor-pointer transition-colors"
      >
        <X size={14} strokeWidth={1.5} />
      </button>
    </div>
  );
}
