import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";

interface Props {
  titulo: string;
  descricao?: string;
  icone?: React.ReactNode;
  acoes?: React.ReactNode;
  children: React.ReactNode;
}

/** Casca padrão das páginas internas (sidebar + header). */
export function AppLayout({ titulo, descricao, icone, acoes, children }: Props) {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <main className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden">
          <header className="sticky top-0 z-10 flex items-center gap-4 border-b border-border bg-background/80 backdrop-blur-sm px-6 py-3">
            <SidebarTrigger />
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
                {icone}
                {titulo}
              </h1>
              {descricao && <p className="text-sm text-muted-foreground">{descricao}</p>}
            </div>
            {acoes}
          </header>
          <div className="p-6">{children}</div>
        </main>
      </div>
    </SidebarProvider>
  );
}
