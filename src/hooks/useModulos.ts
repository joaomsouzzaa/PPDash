import { useSyncExternalStore } from "react";
export type { ModuloKey } from "@/lib/modulos";

// Preferência PESSOAL de ocultar itens do menu (não é permissão; é só esconder
// da própria visão). As permissões vêm do plano/usuário via AuthContext.
const KEY = "itens_ocultos";

function lerOcultos(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(KEY) || "[]")); }
  catch { return new Set(); }
}

export function setItemOculto(key: string, oculto: boolean) {
  const s = lerOcultos();
  if (oculto) s.add(key); else s.delete(key);
  localStorage.setItem(KEY, JSON.stringify([...s]));
  window.dispatchEvent(new Event("modulos-changed"));
}

function subscribe(cb: () => void) {
  window.addEventListener("modulos-changed", cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener("modulos-changed", cb);
    window.removeEventListener("storage", cb);
  };
}
function getSnapshot() { return localStorage.getItem(KEY) || "[]"; }

/** Conjunto de itens ocultados manualmente (reativo). */
export function useItensOcultos(): Set<string> {
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return lerOcultos();
}
