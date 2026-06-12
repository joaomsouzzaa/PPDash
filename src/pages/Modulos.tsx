import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { LayoutGrid } from "lucide-react";
import { MODULOS_CATALOGO } from "@/lib/modulos";
import { useItensOcultos, setItemOculto } from "@/hooks/useModulos";
import { useAuth } from "@/contexts/AuthContext";

export default function Modulos() {
  const ocultos = useItensOcultos();
  const { modulosPermitidos, isSuperAdmin } = useAuth();
  const liberado = (key: string) => isSuperAdmin || modulosPermitidos.includes(key);

  return (
    <AppLayout
      titulo="Módulos"
      descricao="Mostre ou oculte itens do menu lateral"
      icone={<LayoutGrid className="h-5 w-5 text-primary" />}
    >
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {MODULOS_CATALOGO.map((mod) => {
          const itens = mod.itens.filter((it) => liberado(it.key));
          if (itens.length === 0) return null;
          const todosVisiveis = itens.every((it) => !ocultos.has(it.key));
          return (
            <Card key={mod.key}>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 border-b py-3">
                <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  {mod.nome}
                </CardTitle>
                <Switch
                  checked={todosVisiveis}
                  onCheckedChange={(v) => itens.forEach((it) => setItemOculto(it.key, !v))}
                  title="Ativar/desativar o módulo inteiro"
                />
              </CardHeader>
              <CardContent className="divide-y p-0">
                {itens.map((it) => (
                  <div key={it.key} className="flex items-center justify-between gap-4 px-4 py-3">
                    <Label className="font-normal">{it.nome}</Label>
                    <Switch
                      checked={!ocultos.has(it.key)}
                      onCheckedChange={(v) => setItemOculto(it.key, !v)}
                    />
                  </div>
                ))}
              </CardContent>
            </Card>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground mt-4">
        Itens desativados somem do seu menu (preferência pessoal). Isso não altera as permissões do plano.
      </p>
    </AppLayout>
  );
}
