import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { SaleNotificationBanner } from "@/components/SaleNotificationBanner";
import { AuthProvider } from "@/contexts/AuthContext";
import { BrandingEffect } from "@/components/BrandingEffect";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Login from "./pages/Login";
import DefinirSenha from "./pages/DefinirSenha";
import Aguardando from "./pages/Aguardando";
import Index from "./pages/Index";
import Integracoes from "./pages/Integracoes";
import VendasEventos from "./pages/VendasEventos";
import CadastroCidades from "./pages/CadastroCidades";
import DashboardGeral from "./pages/DashboardGeral";
import InsideSales from "./pages/InsideSales";
import CadastroProdutos from "./pages/CadastroProdutos";
import LeadsInsideSales from "./pages/LeadsInsideSales";
import Notificacoes from "./pages/Notificacoes";
import Agentes from "./pages/Agentes";
import Chat from "./pages/Chat";
import Workflow from "./pages/Workflow";
import Designer from "./pages/Designer";
import ScrapingConteudos from "./pages/ScrapingConteudos";
import MetaAds from "./pages/MetaAds";
import AutoDmInstagram from "./pages/AutoDmInstagram";
import Modulos from "./pages/Modulos";
import Performance from "./pages/Performance";
import Campanhas from "./pages/Campanhas";
import Configuracoes from "./pages/Configuracoes";
import Equipe from "./pages/Equipe";
import Plano from "./pages/Plano";
import AdminSaaS from "./pages/AdminSaaS";
import NotFound from "./pages/NotFound";

// Auto-refresh: todas as queries re-buscam a cada 10 min (mesmo sem F5, e em background).
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchInterval: 10 * 60 * 1000,
      refetchIntervalInBackground: true,
      refetchOnWindowFocus: true,
      staleTime: 60 * 1000,
    },
  },
});

/** Atalho: rota protegida (autenticação + opcionalmente módulo/papel). */
const Priv = ({ children, ...rest }: React.ComponentProps<typeof ProtectedRoute>) => (
  <ProtectedRoute {...rest}>{children}</ProtectedRoute>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AuthProvider>
        <BrandingEffect />
        <SaleNotificationBanner />
        <BrowserRouter>
          <ErrorBoundary>
          <Routes>
            {/* Públicas */}
            <Route path="/login" element={<Login />} />
            <Route path="/definir-senha" element={<DefinirSenha />} />
            <Route path="/aguardando" element={<Aguardando />} />

            {/* Eventos */}
            <Route path="/" element={<Priv modulo="eventos.dashboard"><Index /></Priv>} />
            <Route path="/eventos-geral" element={<Priv modulo="eventos.resumo"><DashboardGeral /></Priv>} />
            <Route path="/vendas-eventos" element={<Priv modulo="eventos.vendas"><VendasEventos /></Priv>} />

            {/* Inside Sales */}
            <Route path="/inside-sales" element={<Priv modulo="inside.dashboard"><InsideSales /></Priv>} />
            <Route path="/leads" element={<Priv modulo="inside.leads"><LeadsInsideSales /></Priv>} />

            {/* Analytics */}
            <Route path="/performance" element={<Priv modulo="analytics.performance"><Performance /></Priv>} />
            <Route path="/campanhas" element={<Priv modulo="analytics.campanhas"><Campanhas /></Priv>} />

            {/* Growth */}
            <Route path="/notificacoes" element={<Priv modulo="growth.notificacoes"><Notificacoes /></Priv>} />
            <Route path="/agentes" element={<Priv modulo="growth.agentes"><Agentes /></Priv>} />
            <Route path="/chat" element={<Priv modulo="growth.chat"><Chat /></Priv>} />
            <Route path="/workflow" element={<Priv modulo="growth.workflow"><Workflow /></Priv>} />
            <Route path="/designer" element={<Priv modulo="growth.designer"><Designer /></Priv>} />
            <Route path="/scraping-conteudos" element={<Priv modulo="growth.scraping"><ScrapingConteudos /></Priv>} />
            <Route path="/meta-ads" element={<Priv modulo="growth.metaads"><MetaAds /></Priv>} />
            <Route path="/auto-dm" element={<Priv modulo="growth.autodm"><AutoDmInstagram /></Priv>} />

            {/* Configurações (apenas autenticação) */}
            <Route path="/integracoes" element={<Priv><Integracoes /></Priv>} />
            <Route path="/cadastro-cidades" element={<Priv><CadastroCidades /></Priv>} />
            <Route path="/cadastro-produtos" element={<Priv><CadastroProdutos /></Priv>} />
            <Route path="/modulos" element={<Priv><Modulos /></Priv>} />
            <Route path="/configuracoes" element={<Priv><Configuracoes /></Priv>} />

            {/* Admin do cliente (super admin gerencia tudo pelo Painel SaaS) */}
            <Route path="/equipe" element={<Priv papeis={["client_admin"]}><Equipe /></Priv>} />
            <Route path="/plano" element={<Priv papeis={["client_admin"]}><Plano /></Priv>} />

            {/* Super admin (dono do SaaS) */}
            <Route path="/admin" element={<Priv papeis={["super_admin"]}><AdminSaaS /></Priv>} />

            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
          </ErrorBoundary>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
