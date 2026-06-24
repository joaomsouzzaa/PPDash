import { Heart, MessageCircle, Send, Bookmark, MoreHorizontal } from "lucide-react";

type Props = {
  imagens: string[];
  legenda?: string;
  username?: string;
  avatarUrl?: string | null;
};

// Preview de como o post vai sair no feed do Instagram (imagem + legenda + cabeçalho).
export function IgPostMockup({ imagens, legenda, username, avatarUrl }: Props) {
  const primeira = imagens[0];
  const nome = username || "sua_conta";
  return (
    <div className="w-full max-w-sm rounded-lg border border-border bg-card overflow-hidden text-card-foreground">
      {/* Cabeçalho */}
      <div className="flex items-center gap-2 px-3 py-2">
        <div className="h-8 w-8 rounded-full overflow-hidden bg-muted shrink-0">
          {avatarUrl ? <img src={avatarUrl} alt="" className="h-full w-full object-cover" /> : null}
        </div>
        <span className="text-sm font-semibold flex-1 truncate">{nome}</span>
        <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
      </div>

      {/* Mídia */}
      <div className="relative aspect-square bg-muted">
        {primeira ? (
          imagens.length && /\.(mp4|mov|webm)(\?|$)/i.test(primeira)
            ? <video src={primeira} className="h-full w-full object-cover" muted />
            : <img src={primeira} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="h-full w-full flex items-center justify-center text-xs text-muted-foreground">Sem arte anexada</div>
        )}
        {imagens.length > 1 && (
          <span className="absolute top-2 right-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] text-white">1/{imagens.length}</span>
        )}
      </div>

      {/* Ações */}
      <div className="flex items-center gap-3 px-3 pt-2">
        <Heart className="h-5 w-5" />
        <MessageCircle className="h-5 w-5" />
        <Send className="h-5 w-5" />
        <Bookmark className="h-5 w-5 ml-auto" />
      </div>

      {/* Legenda */}
      <div className="px-3 py-2 text-sm">
        {legenda ? (
          <p className="whitespace-pre-wrap"><span className="font-semibold mr-1">{nome}</span>{legenda}</p>
        ) : (
          <p className="text-muted-foreground italic">Adicione uma legenda…</p>
        )}
      </div>
    </div>
  );
}
