import { useState, useEffect } from "react";
import {
  LayoutDashboard,
  Plug,
  Filter,
  BarChart3,
  ShoppingCart,
  TrendingUp,
  Settings,
  LogOut,
  Moon,
  Sun,
  Users,
  CreditCard,
  MapPin,
  Package,
  ChevronDown,
  Bot,
  Sparkles,
  MessageSquare,
  KanbanSquare,
  Palette,
  LayoutGrid,
  Shield,
  Instagram,
  Megaphone,
  ClipboardList,
} from "lucide-react";
import { useItensOcultos } from "@/hooks/useModulos";
import { MODULOS_CATALOGO } from "@/lib/modulos";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { NavLink } from "@/components/NavLink";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";

const ICONS: Record<string, any> = {
  "eventos.dashboard": LayoutDashboard,
  "eventos.resumo": LayoutDashboard,
  "eventos.vendas": ShoppingCart,
  "inside.dashboard": LayoutDashboard,
  "inside.leads": Users,
  "analytics.performance": TrendingUp,
  "analytics.campanhas": BarChart3,
  "growth.notificacoes": Bot,
  "growth.agentes": Sparkles,
  "growth.chat": MessageSquare,
  "growth.workflow": KanbanSquare,
  "growth.designer": Palette,
  "growth.scraping": Instagram,
  "growth.metaads": Megaphone,
  "growth.autodm": MessageSquare,
  "growth.pesquisas": ClipboardList,
};

export function AppSidebar() {
  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem("theme");
    if (saved) return saved === "dark";
    return document.documentElement.classList.contains("dark");
  });

  // Seção "Configurações" começa minimizada; abre apenas ao clicar.
  const [settingsOpen, setSettingsOpen] = useState(false);
  const ocultos = useItensOcultos();
  const { modulosPermitidos, isSuperAdmin, isClientAdmin, signOut, marca } = useAuth();
  const navigate = useNavigate();
  const podeAdmin = isSuperAdmin || isClientAdmin;

  // Item visível = liberado pelo plano/usuário E não ocultado manualmente.
  const itemVisivel = (key: string) => (isSuperAdmin || modulosPermitidos.includes(key)) && !ocultos.has(key);

  const handleSair = async () => {
    await signOut();
    navigate("/login", { replace: true });
  };

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
    localStorage.setItem("theme", isDark ? "dark" : "light");
  }, [isDark]);

  return (
    <Sidebar>
      <SidebarHeader className="p-5 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className={`h-9 w-9 rounded-lg flex items-center justify-center overflow-hidden ${marca.logo ? "bg-sidebar-accent" : "bg-primary"}`}>
            {marca.logo
              ? <img src={marca.logo} alt="logo" className="h-full w-full object-contain" />
              : <BarChart3 className="h-5 w-5 text-primary-foreground" />}
          </div>
          <div>
            <h2 className="text-sm font-bold text-sidebar-accent-foreground tracking-tight">
              {marca.nome || "Scale Hacking"}
            </h2>
            <p className="text-xs text-sidebar-foreground">Dashboard</p>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2 py-4">
        {MODULOS_CATALOGO.map((mod) => {
          const itens = mod.itens.filter((it) => itemVisivel(it.key));
          if (itens.length === 0) return null;
          return (
            <SidebarGroup key={mod.key}>
              <SidebarGroupLabel className="text-xs uppercase tracking-wider text-sidebar-foreground/50 px-3 mb-1">
                {mod.nome}
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {itens.map((it) => {
                    const Icon = ICONS[it.key] || LayoutDashboard;
                    return (
                      <SidebarMenuItem key={it.key}>
                        <SidebarMenuButton asChild tooltip={it.nome}>
                          <NavLink
                            to={it.url}
                            end
                            className="hover:bg-sidebar-accent/80"
                            activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                          >
                            <Icon className="h-4 w-4" />
                            <span>{it.nome}</span>
                          </NavLink>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          );
        })}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-3 space-y-1">
        <button
          type="button"
          onClick={() => setSettingsOpen((o) => !o)}
          aria-expanded={settingsOpen}
          className="flex w-full items-center justify-between rounded-md px-3 py-1.5 text-xs uppercase tracking-wider text-sidebar-foreground/50 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground transition-colors"
        >
          <span>Configurações</span>
          <ChevronDown
            className={`h-3.5 w-3.5 transition-transform ${settingsOpen ? "" : "-rotate-90"}`}
          />
        </button>
        {settingsOpen && (
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="Módulos">
              <NavLink
                to="/modulos"
                end
                className="hover:bg-sidebar-accent/80"
                activeClassName="bg-sidebar-accent text-sidebar-accent-foreground"
              >
                <LayoutGrid className="h-4 w-4" />
                <span>Módulos</span>
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="Integrações">
              <NavLink
                to="/integracoes"
                end
                className="hover:bg-sidebar-accent/80"
                activeClassName="bg-sidebar-accent text-sidebar-accent-foreground"
              >
                <Plug className="h-4 w-4" />
                <span>Integrações</span>
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="Cadastro de Cidades">
              <NavLink
                to="/cadastro-cidades"
                end
                className="hover:bg-sidebar-accent/80"
                activeClassName="bg-sidebar-accent text-sidebar-accent-foreground"
              >
                <MapPin className="h-4 w-4" />
                <span>Cadastro de Cidades</span>
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="Canais de Aquisição">
              <NavLink
                to="/cadastro-produtos"
                end
                className="hover:bg-sidebar-accent/80"
                activeClassName="bg-sidebar-accent text-sidebar-accent-foreground"
              >
                <Package className="h-4 w-4" />
                <span>Canais de Aquisição</span>
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
          {isClientAdmin && (
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="Gerenciar Plano">
              <NavLink
                to="/plano"
                end
                className="hover:bg-sidebar-accent/80"
                activeClassName="bg-sidebar-accent text-sidebar-accent-foreground"
              >
                <CreditCard className="h-4 w-4" />
                <span>Gerenciar Plano</span>
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
          )}
          {isClientAdmin && (
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="Minha Equipe">
              <NavLink
                to="/equipe"
                end
                className="hover:bg-sidebar-accent/80"
                activeClassName="bg-sidebar-accent text-sidebar-accent-foreground"
              >
                <Users className="h-4 w-4" />
                <span>Minha Equipe</span>
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
          )}
          {isSuperAdmin && (
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="Painel SaaS">
              <NavLink
                to="/admin"
                end
                className="hover:bg-sidebar-accent/80"
                activeClassName="bg-sidebar-accent text-sidebar-accent-foreground"
              >
                <Shield className="h-4 w-4" />
                <span>Painel SaaS</span>
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
          )}
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="Configurações da Conta">
              <NavLink
                to="/configuracoes"
                end
                className="hover:bg-sidebar-accent/80"
                activeClassName="bg-sidebar-accent text-sidebar-accent-foreground"
              >
                <Settings className="h-4 w-4" />
                <span>Configurações da Conta</span>
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        )}

        <SidebarSeparator />

        <div className="flex items-center justify-between px-2">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton tooltip="Sair" className="hover:bg-sidebar-accent/80" onClick={handleSair}>
                <LogOut className="h-4 w-4" />
                <span>Sair</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            onClick={() => setIsDark(!isDark)}
            aria-label="Alternar tema"
          >
            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
