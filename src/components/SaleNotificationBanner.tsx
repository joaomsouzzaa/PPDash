import { useEffect, useState, useRef, useCallback } from "react";
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
  const audioUrlRef = useRef<string | null>(null);
  const [loadingSound, setLoadingSound] = useState(false);

  // Pre-generate drum sound on mount
  useEffect(() => {
    const generateDrumSound = async () => {
      setLoadingSound(true);
      try {
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-drum-sound`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
              Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            },
          }
        );

        if (response.ok) {
          const data = await response.json();
          if (data.audioContent) {
            audioUrlRef.current = `data:audio/mpeg;base64,${data.audioContent}`;
          }
        }
      } catch (err) {
        console.error("Failed to pre-generate drum sound:", err);
      } finally {
        setLoadingSound(false);
      }
    };

    generateDrumSound();
  }, []);

  const playDrumSound = useCallback(() => {
    if (audioUrlRef.current) {
      const audio = new Audio(audioUrlRef.current);
      audio.volume = 1.0;
      audio.play().catch(console.error);
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
