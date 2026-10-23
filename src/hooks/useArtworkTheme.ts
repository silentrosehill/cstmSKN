import { useEffect } from "react";
import { artworkTheme, paletteFromPixels, type ImagePalette } from "../lib/artworkColors";
const palettes = new Map<string, Promise<ImagePalette>>();
function loadPalette(src: string): Promise<ImagePalette> {
  let cached = palettes.get(src);
  if (!cached) {
    cached = new Promise<ImagePalette>((resolve, reject) => {
      const image = new Image();
      image.crossOrigin = "anonymous";
      image.decoding = "async";
      image.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = 64;
          canvas.height = 40;
          const context = canvas.getContext("2d", { willReadFrequently: true });
          if (!context) throw new Error("Canvas unavailable");
          context.drawImage(image, 0, 0, 64, 40);
          resolve(paletteFromPixels(context.getImageData(0, 0, 64, 40).data));
        } catch (error) {
          reject(error);
        }
      };
      image.onerror = () => reject(new Error("Artwork unavailable"));
      image.src = src;
    });
    palettes.set(src, cached);
    if (palettes.size > 80) palettes.delete(palettes.keys().next().value!);
    void cached.catch(() => {
      if (palettes.get(src) === cached) palettes.delete(src);
    });
  }
  return cached;
}
export function useArtworkTheme(src: string | null, mode: string) {
  useEffect(() => {
    let active = true;
    const root = document.documentElement;
    if (!src) {
      delete root.dataset.artwork;
      return;
    }
    void loadPalette(src)
      .then((palette) => {
        if (!active) return;
        for (const [key, value] of Object.entries(artworkTheme(palette, mode)))
          root.style.setProperty(key, value);
        root.dataset.artwork = "true";
      })
      .catch(() => {
        if (active) delete root.dataset.artwork;
      });
    return () => {
      active = false;
    };
  }, [src, mode]);
  useEffect(
    () => () => {
      delete document.documentElement.dataset.artwork;
    },
    []
  );
}
