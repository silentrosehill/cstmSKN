import { useState } from "react";
import { ImageOff } from "lucide-react";
import { loadingScreenUrl, splashUrl } from "../hooks/useChampions";

interface Props {
  championId: string;
  skinNum: number;
  alt: string;
}
function PortraitImage({ championId, skinNum, alt }: Props) {
  const [fallback, setFallback] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  if (failed)
    return (
      <span
        className="skin-portrait-placeholder"
        role="img"
        aria-label={`${alt} artwork unavailable`}
      >
        <ImageOff size={24} aria-hidden="true" />
      </span>
    );
  return (
    <img
      className={`skin-portrait-image ${fallback ? "is-fallback" : ""} ${loaded ? "is-loaded" : ""}`}
      src={fallback ? splashUrl(championId, skinNum) : loadingScreenUrl(championId, skinNum)}
      alt={alt}
      loading="lazy"
      decoding="async"
      draggable={false}
      onLoad={() => setLoaded(true)}
      onError={() => {
        setLoaded(false);
        if (fallback) setFailed(true);
        else setFallback(true);
      }}
    />
  );
}
export default function SkinPortrait(props: Props) {
  return <PortraitImage key={`${props.championId}-${props.skinNum}`} {...props} />;
}
