import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval,
  isSameDay, isSameMonth, addMonths, parseISO,
} from "date-fns";
import { ptBR } from "date-fns/locale";

type Tarefa = {
  id: string; titulo: string; coluna_id: string | null; prioridade: string;
  data_vencimento: string | null;
};
type IgPostCal = {
  id: string; tarefa_id: string | null; tipo: string; status: string;
  publish_at: string | null; published_at: string | null; midias: string[];
};
type IgConta = { id: string; ig_user_id: string; ig_username: string | null };

const prioClasse: Record<string, string> = {
  urgente: "bg-red-500/15 text-red-500 border-red-500/30",
  alta: "bg-amber-500/15 text-amber-500 border-amber-500/30",
  normal: "bg-blue-500/15 text-blue-500 border-blue-500/30",
  baixa: "bg-muted text-muted-foreground border-border",
};
const statusClasse = (s: string) =>
  s === "publicado" ? "text-green-500" : s === "falhou" ? "text-destructive" : "text-amber-500";
const ehVideo = (u: string) => /\.(mp4|mov|webm)(\?|$)/i.test(u);

type Props = {
  tarefas: Tarefa[];
  posts: IgPostCal[];
  contas: IgConta[];
  onAbrir: (t: Tarefa) => void;
};

export function WorkflowCalendar({ tarefas, posts, onAbrir }: Props) {
  const [mes, setMes] = useState(() => startOfMonth(new Date()));

  const dias = useMemo(() => {
    const inicio = startOfWeek(startOfMonth(mes), { locale: ptBR });
    const fim = endOfWeek(endOfMonth(mes), { locale: ptBR });
    return eachDayOfInterval({ start: inicio, end: fim });
  }, [mes]);

  // data efetiva do post = agendamento ou publicação
  const dataPost = (p: IgPostCal) =>
    p.publish_at ? parseISO(p.publish_at) : p.published_at ? parseISO(p.published_at) : null;

  const tarefaPorId = useMemo(() => {
    const m = new Map<string, Tarefa>();
    tarefas.forEach((t) => m.set(t.id, t));
    return m;
  }, [tarefas]);

  // tarefas que já têm post não aparecem como chip simples
  const comPost = useMemo(() => new Set(posts.map((p) => p.tarefa_id).filter(Boolean) as string[]), [posts]);

  const hoje = new Date();
  const diasSemana = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold capitalize">
          {mes.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
        </h2>
        <div className="flex items-center gap-1">
          <button onClick={() => setMes((m) => addMonths(m, -1))} className="h-8 w-8 flex items-center justify-center rounded-md border border-border hover:bg-accent/60"><ChevronLeft className="h-4 w-4" /></button>
          <button onClick={() => setMes(startOfMonth(new Date()))} className="px-3 h-8 text-sm rounded-md border border-border hover:bg-accent/60">Hoje</button>
          <button onClick={() => setMes((m) => addMonths(m, 1))} className="h-8 w-8 flex items-center justify-center rounded-md border border-border hover:bg-accent/60"><ChevronRight className="h-4 w-4" /></button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-px rounded-md border border-border bg-border overflow-hidden">
        {diasSemana.map((d) => (
          <div key={d} className="bg-background px-2 py-1.5 text-center text-xs font-medium text-muted-foreground">{d}</div>
        ))}
        {dias.map((dia) => {
          const postsDoDia = posts.filter((p) => { const d = dataPost(p); return d && isSameDay(d, dia); });
          const tarefasDoDia = tarefas.filter((t) =>
            !comPost.has(t.id) && t.data_vencimento && isSameDay(parseISO(t.data_vencimento + "T00:00:00"), dia),
          );
          const foraDoMes = !isSameMonth(dia, mes);
          return (
            <div key={dia.toISOString()} className={`bg-background min-h-[112px] p-1.5 flex flex-col gap-1 ${foraDoMes ? "opacity-40" : ""}`}>
              <span className={`text-xs ${isSameDay(dia, hoje) ? "h-5 w-5 flex items-center justify-center rounded-full bg-accent text-accent-foreground font-semibold" : "text-muted-foreground"}`}>
                {dia.getDate()}
              </span>

              {postsDoDia.map((p) => {
                const t = p.tarefa_id ? tarefaPorId.get(p.tarefa_id) : undefined;
                const thumb = p.midias?.[0];
                return (
                  <button
                    key={p.id}
                    onClick={() => t && onAbrir(t)}
                    className="flex items-center gap-1.5 text-left rounded-md border border-border bg-card p-1 hover:bg-accent/60"
                    title={t?.titulo}
                  >
                    <div className="h-8 w-8 shrink-0 rounded overflow-hidden bg-muted">
                      {thumb ? (
                        ehVideo(thumb)
                          ? <video src={thumb} className="h-full w-full object-cover" muted />
                          : <img src={thumb} alt="" className="h-full w-full object-cover" />
                      ) : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] truncate leading-tight">{t?.titulo || "Post"}</p>
                      <p className={`text-[10px] leading-tight ${statusClasse(p.status)}`}>{p.tipo} · {p.status}</p>
                    </div>
                  </button>
                );
              })}

              {tarefasDoDia.map((t) => (
                <button
                  key={t.id}
                  onClick={() => onAbrir(t)}
                  className={`text-left text-[11px] truncate rounded-md border px-1.5 py-1 hover:opacity-80 ${prioClasse[t.prioridade] || prioClasse.normal}`}
                  title={t.titulo}
                >
                  {t.titulo}
                </button>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
