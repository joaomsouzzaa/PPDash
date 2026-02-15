import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { SaleNotificationBanner } from "@/components/SaleNotificationBanner";
import Index from "./pages/Index";
import Integracoes from "./pages/Integracoes";
import VendasEventos from "./pages/VendasEventos";
import CadastroCidades from "./pages/CadastroCidades";
import DashboardGeral from "./pages/DashboardGeral";
import InsideSales from "./pages/InsideSales";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <SaleNotificationBanner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/vendas-eventos" element={<VendasEventos />} />
          <Route path="/eventos-geral" element={<DashboardGeral />} />
          <Route path="/integracoes" element={<Integracoes />} />
          <Route path="/inside-sales" element={<InsideSales />} />
          <Route path="/cadastro-cidades" element={<CadastroCidades />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
