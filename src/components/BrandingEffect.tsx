import { useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";

/** Atualiza o título e o favicon da aba do navegador conforme a marca da organização. */
export function BrandingEffect() {
  const { marca } = useAuth();
  useEffect(() => {
    document.title = marca.nome || "Scale Hacking";
    if (marca.logo) {
      let link = document.querySelector("link[rel~='icon']") as HTMLLinkElement | null;
      if (!link) {
        link = document.createElement("link");
        link.rel = "icon";
        document.head.appendChild(link);
      }
      link.href = marca.logo;
    }
  }, [marca]);
  return null;
}
