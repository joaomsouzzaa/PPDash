import { Component, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

interface Props { children: ReactNode; }
interface State { erro: Error | null; }

/** Evita que um erro em uma página deixe o app inteiro em tela branca. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { erro: null };

  static getDerivedStateFromError(erro: Error): State {
    return { erro };
  }

  componentDidCatch(erro: Error) {
    console.error("[ErrorBoundary]", erro);
  }

  render() {
    if (this.state.erro) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6 text-center">
          <div className="max-w-md space-y-3">
            <p className="text-lg font-semibold">Algo deu errado nesta tela</p>
            <p className="text-sm text-muted-foreground break-words">{this.state.erro.message}</p>
            <div className="flex gap-2 justify-center">
              <Button onClick={() => { this.setState({ erro: null }); }}>Tentar novamente</Button>
              <Button variant="outline" onClick={() => { window.location.href = "/"; }}>Ir para o início</Button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
