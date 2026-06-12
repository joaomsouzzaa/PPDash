import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { X, PartyPopper } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SaleNotification {
  id: string;
  nome: string;
  valor: number;
  cidade: string | null;
  produto: string | null;
}

export function SaleNotificationBanner() {
  const [notification, setNotification] = useState<SaleNotification | null>(null);
  const [visible, setVisible] = useState(false);

  // Som de "caixa registradora" sintetizado no navegador (Web Audio API).
  // Sem dependência externa: não precisa de ElevenLabs nem chamada de rede.
  const playDrumSound = useCallback(() => {
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx();
      // duas notas curtas e brilhantes (cha-ching!)
      const notas = [
        { freq: 1318.5, start: 0.0, dur: 0.18 }, // Mi6
        { freq: 1760.0, start: 0.08, dur: 0.35 }, // Lá6
      ];
      notas.forEach(({ freq, start, dur }) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "triangle";
        osc.frequency.value = freq;
        const t0 = ctx.currentTime + start;
        gain.gain.setValueAtTime(0.0001, t0);
        gain.gain.exponentialRampToValueAtTime(0.6, t0 + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t0);
        osc.stop(t0 + dur + 0.02);
      });
      setTimeout(() => ctx.close(), 700);
    } catch (err) {
      console.error("Falha ao tocar o som de venda:", err);
    }
  }, []);

  const dismiss = useCallback(() => {
    setVisible(false);
    setTimeout(() => setNotification(null), 500);
  }, []);

  // Auto-dismiss after 8 seconds
  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(dismiss, 8000);
    return () => clearTimeout(timer);
  }, [visible, dismiss]);

  // Listen for new sales via Realtime
  useEffect(() => {
    const channel = supabase
      .channel("new-sales-notification")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "vendas",
        },
        (payload) => {
          const row = payload.new as any;
          if (row.status === "aprovada") {
            setNotification({
              id: row.id,
              nome: row.nome_comprador || "Cliente",
              valor: Number(row.valor) || 0,
              cidade: row.cidade,
              produto: row.produto,
            });
            setVisible(true);
            playDrumSound();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [playDrumSound]);

  if (!notification) return null;

  return (
    <div
      className={`fixed top-6 left-1/2 -translate-x-1/2 z-50 transition-all duration-500 ${
        visible
          ? "opacity-100 translate-y-0 scale-100"
          : "opacity-0 -translate-y-4 scale-95 pointer-events-none"
      }`}
    >
      <div className="bg-gradient-to-r from-emerald-500 to-green-600 text-white rounded-2xl shadow-2xl px-8 py-5 flex items-center gap-5 min-w-[400px] max-w-[600px]">
        <div className="flex-shrink-0 bg-white/20 rounded-full p-3 animate-bounce">
          <PartyPopper className="h-8 w-8" />
        </div>
        <div className="flex-1">
          <p className="text-lg font-bold">🎉 Nova Venda!</p>
          <p className="text-sm opacity-90">
            <span className="font-semibold">{notification.nome}</span> comprou
            {notification.produto ? ` "${notification.produto}"` : ""}
            {notification.cidade ? ` em ${notification.cidade}` : ""}
          </p>
          <p className="text-2xl font-black mt-1">
            R$ {notification.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="text-white/80 hover:text-white hover:bg-white/20 flex-shrink-0"
          onClick={dismiss}
        >
          <X className="h-5 w-5" />
        </Button>
      </div>
    </div>
  );
}
