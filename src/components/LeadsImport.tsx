import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Upload, Download, Loader2, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { LEAD_CAMPOS_PADRAO } from "@/lib/leadFields";
import { normalizarTelefone } from "@/lib/telefone";

const IGNORAR = "__ignorar__";

// Campos padrão oferecidos no mapeamento (texto/data — os booleanos is_* ficam de fora p/ simplicidade).
const CAMPOS_IMPORTAVEIS = LEAD_CAMPOS_PADRAO.filter((f) => !f.key.startsWith("is_") && f.key !== "faturamento_venda" && f.key !== "data_venda_realizada");

const stripLower = (s: string) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

// Aliases p/ auto-mapear cabeçalhos comuns (inclui nomes de export do Meta/RD).
const ALIASES: Record<string, string> = {
  "primeiro nome": "nome", "first name": "nome", "first_name": "nome", "nome completo": "nome",
  "last name": "custom:sobrenome", "last_name": "custom:sobrenome", "sobrenome": "custom:sobrenome",
  "e mail": "email", "e-mail": "email", "mail": "email",
  "telefone": "telefone", "phone": "telefone", "celular": "telefone", "fone": "telefone",
  "whatsapp": "whatsapp", "numero do whatsapp": "whatsapp", "whatsapp number": "whatsapp",
  "cidade": "cidade", "city": "cidade",
  "estado": "custom:uf", "uf": "custom:uf", "state": "custom:uf", "uf estado": "custom:uf",
  "data": "data_lead", "data do lead": "data_lead", "created time": "data_lead", "created_time": "data_lead", "data de criacao": "data_lead",
  "origem": "utm_source", "utm source": "utm_source", "fonte": "utm_source",
  "midia": "utm_medium", "utm medium": "utm_medium",
  "campanha": "utm_campaign", "utm campaign": "utm_campaign", "nome da campanha": "utm_campaign",
  "utm content": "utm_content", "utm term": "utm_term",
  "tags": "tags", "etiquetas": "tags",
  "capacidade de investimento": "custom:capacidade_investimento", "investimento": "custom:capacidade_investimento",
  "instagram": "instagram", "situacao atual": "situacao_atual", "area de atuacao": "area_atuacao", "papel": "papel",
};

function parseCsvLine(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = ""; let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else { if (ch === '"') q = true; else if (ch === delim) { out.push(cur); cur = ""; } else cur += ch; }
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

function parseDate(raw: string): string | null {
  if (!raw) return null;
  const s = raw.trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:[ T](\d{1,2}):(\d{2}))?/);
  if (m) {
    const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    const dt = new Date(year, Number(m[2]) - 1, Number(m[1]), Number(m[4] || 0), Number(m[5] || 0));
    if (!isNaN(dt.getTime())) return dt.toISOString();
  }
  const dt = new Date(s);
  return isNaN(dt.getTime()) ? null : dt.toISOString();
}

interface CampoOpt { value: string; label: string; }

export function LeadsImport({ open, onOpenChange, onImported }: { open: boolean; onOpenChange: (v: boolean) => void; onImported: () => void; }) {
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapa, setMapa] = useState<Record<number, string>>({});
  const [customCampos, setCustomCampos] = useState<CampoOpt[]>([]);
  const [importing, setImporting] = useState(false);
  const [erro, setErro] = useState("");

  // Campos personalizados da org (para oferecer no mapeamento).
  useEffect(() => {
    if (!open) return;
    supabase.from("lead_campos").select("chave,label").eq("padrao", false).eq("excluido", false)
      .then(({ data }) => setCustomCampos(((data as any[]) ?? []).map((c) => ({ value: `custom:${c.chave}`, label: `${c.label} (personalizado)` }))));
  }, [open]);

  const opcoes: CampoOpt[] = useMemo(() => [
    ...CAMPOS_IMPORTAVEIS.map((f) => ({ value: f.key, label: f.label })),
    ...customCampos,
  ], [customCampos]);

  const reset = () => { setFileName(""); setHeaders([]); setRows([]); setMapa({}); setErro(""); };

  const onFile = async (file: File) => {
    setErro(""); setFileName(file.name);
    try {
      const text = (await file.text()).replace(/^﻿/, "");
      const linhas = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter((l) => l.trim() !== "");
      if (linhas.length < 2) { setErro("Arquivo sem linhas de dados."); setHeaders([]); setRows([]); return; }
      const delim = (linhas[0].match(/;/g) || []).length > (linhas[0].match(/,/g) || []).length ? ";" : ",";
      const hs = parseCsvLine(linhas[0], delim);
      const rs = linhas.slice(1).map((l) => parseCsvLine(l, delim));
      // Auto-mapeia por alias / label / key.
      const auto: Record<number, string> = {};
      hs.forEach((h, i) => {
        const n = stripLower(h);
        let alvo = ALIASES[n];
        if (!alvo) { const m = opcoes.find((o) => stripLower(o.label) === n || o.value === n); if (m) alvo = m.value; }
        auto[i] = alvo && opcoes.some((o) => o.value === alvo) ? alvo : IGNORAR;
      });
      setHeaders(hs); setRows(rs); setMapa(auto);
    } catch { setErro("Falha ao ler o arquivo. Salve como CSV e tente de novo."); }
  };

  const importar = async () => {
    const usados = Object.values(mapa).filter((v) => v && v !== IGNORAR);
    if (!usados.includes("email") && !usados.includes("telefone")) {
      setErro("Mapeie ao menos a coluna de E-mail ou Telefone (necessário para evitar duplicados).");
      return;
    }
    setImporting(true); setErro("");
    try {
      // Dedupe: e-mails e telefones já existentes na org (RLS já filtra por org).
      const { data: existentes } = await supabase.from("leads").select("email, telefone");
      const jaTem = new Set(((existentes as any[]) ?? []).map((l) => stripLower(l.email || "")).filter(Boolean));
      const jaTemTel = new Set(((existentes as any[]) ?? []).map((l) => normalizarTelefone(l.telefone)).filter(Boolean));

      const vistos = new Set<string>();
      const vistosTel = new Set<string>();
      const registros: any[] = [];
      let pulados = 0;
      for (const cells of rows) {
        const std: Record<string, any> = {};
        const custom: Record<string, any> = {};
        Object.entries(mapa).forEach(([idx, campo]) => {
          if (!campo || campo === IGNORAR) return;
          const val = (cells[Number(idx)] ?? "").trim();
          if (!val) return;
          if (campo === "data_lead") std.data_lead = parseDate(val) || undefined;
          else if (campo.startsWith("custom:")) custom[campo.slice(7)] = val;
          else std[campo] = val;
        });
        const email = stripLower(std.email || "");
        const tel = normalizarTelefone(std.telefone || "");
        // Dedup por telefone normalizado primeiro, depois por e-mail.
        if (tel && (jaTemTel.has(tel) || vistosTel.has(tel))) { pulados++; continue; }
        if (email && (jaTem.has(email) || vistos.has(email))) { pulados++; continue; }
        if (tel) vistosTel.add(tel);
        if (email) vistos.add(email);
        if (!std.nome && !std.email && !std.telefone) continue;
        registros.push({ ...std, custom, crm_origem: "csv_import", data_lead: std.data_lead || new Date().toISOString() });
      }

      if (!registros.length) { setErro(`Nada para importar (${pulados} duplicado(s) ignorado(s)).`); setImporting(false); return; }

      let inseridos = 0;
      for (let i = 0; i < registros.length; i += 500) {
        const chunk = registros.slice(i, i + 500);
        // upsert com ignoreDuplicates: rede de segurança do índice único (org_id, telefone_norm).
        const { error } = await supabase.from("leads").upsert(chunk as any, { onConflict: "org_id,telefone_norm", ignoreDuplicates: true });
        if (error) throw new Error(error.message);
        inseridos += chunk.length;
      }
      toast.success(`${inseridos} lead(s) importado(s)${pulados ? ` · ${pulados} duplicado(s) ignorado(s)` : ""}.`);
      onOpenChange(false); reset(); onImported();
    } catch (e) { setErro((e as Error).message); }
    setImporting(false);
  };

  const baixarModelo = () => {
    const cols = ["Nome", "Sobrenome", "E-mail", "Telefone", "WhatsApp", "Cidade", "UF/Estado", "Capacidade de investimento", "Data do lead", "UTM Source", "UTM Medium", "UTM Campaign", "Tags"];
    const exemplo = ["João", "Silva", "joao@email.com", "11999999999", "11999999999", "São Paulo", "SP", "entre R$ 80 mil e R$ 120 mil", "16/06/2026", "Facebook Ads", "cpc", "Minha Campanha", "SQL"];
    const blob = new Blob(["﻿" + cols.join(";") + "\n" + exemplo.join(";")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "modelo-importacao-leads.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!importing) { onOpenChange(v); if (!v) reset(); } }}>
      <DialogContent className="sm:max-w-3xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar leads (CSV)</DialogTitle>
          <DialogDescription>
            Para backfill de leads antigos. Baixe o modelo, preencha, suba o arquivo e confirme o mapeamento das colunas.
            A importação não dispara notificações e ignora e-mails duplicados.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={baixarModelo}>
            <Download className="mr-2 h-4 w-4" /> Baixar modelo de planilha
          </Button>
          <label className="inline-flex">
            <input type="file" accept=".csv,text/csv" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.currentTarget.value = ""; }} />
            <Button variant="outline" size="sm" asChild>
              <span className="cursor-pointer"><Upload className="mr-2 h-4 w-4" /> {fileName || "Selecionar arquivo CSV"}</span>
            </Button>
          </label>
        </div>

        {erro && <p className="text-sm text-destructive">{erro}</p>}

        {headers.length > 0 && (
          <>
            <div className="space-y-1.5">
              <p className="text-sm font-medium">Confirme o mapeamento ({rows.length} linha(s))</p>
              <div className="rounded-md border border-border divide-y">
                {headers.map((h, i) => (
                  <div key={i} className="flex items-center gap-3 px-3 py-2">
                    <div className="flex items-center gap-2 w-1/2 min-w-0">
                      <FileSpreadsheet className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="text-sm truncate" title={h}>{h || <em className="text-muted-foreground">(coluna sem nome)</em>}</span>
                      <span className="text-xs text-muted-foreground truncate">ex.: {rows[0]?.[i] || "—"}</span>
                    </div>
                    <span className="text-muted-foreground">→</span>
                    <Select value={mapa[i] ?? IGNORAR} onValueChange={(v) => setMapa((m) => ({ ...m, [i]: v }))}>
                      <SelectTrigger className="h-8 flex-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={IGNORAR}>(ignorar esta coluna)</SelectItem>
                        {opcoes.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">Prévia (3 primeiras linhas)</p>
              <div className="overflow-x-auto rounded-md border border-border">
                <Table>
                  <TableHeader><TableRow>{headers.map((h, i) => <TableHead key={i} className="whitespace-nowrap text-xs">{h}</TableHead>)}</TableRow></TableHeader>
                  <TableBody>
                    {rows.slice(0, 3).map((r, ri) => (
                      <TableRow key={ri}>{headers.map((_, ci) => <TableCell key={ci} className="whitespace-nowrap text-xs">{r[ci] || "—"}</TableCell>)}</TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={importing}>Cancelar</Button>
          <Button onClick={importar} disabled={importing || headers.length === 0}>
            {importing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />} Importar {rows.length ? `(${rows.length})` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
