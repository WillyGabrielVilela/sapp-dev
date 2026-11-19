import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { cadastrarFn, cadastroAbertoFn, entrarFn } from "@/lib/auth.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar — SAPP" },
      { name: "description", content: "Acesso dos servidores autorizados ao SAPP." },
      { property: "og:title", content: "Entrar — SAPP" },
      { property: "og:description", content: "Acesso dos servidores autorizados ao SAPP." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [modo, setModo] = useState<"entrar" | "cadastrar">("entrar");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [nome, setNome] = useState("");
  const [carregando, setCarregando] = useState(false);
  const queryClient = useQueryClient();
  const { data: cadastroAberto } = useQuery({ queryKey: ["cadastro-aberto"], queryFn: () => cadastroAbertoFn() });

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setCarregando(true);
    try {
      if (modo === "entrar") await entrarFn({ data: { email, senha } });
      else await cadastrarFn({ data: { nome, email, senha } });
      queryClient.clear();
      navigate({ to: "/painel" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha no acesso");
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-sidebar px-4">
      <div className="w-full max-w-sm rounded-lg bg-card p-8 shadow-xl">
        <div className="mb-6">
          <div className="text-2xl font-bold tracking-tight text-primary">SAPP</div>
          <p className="text-sm text-muted-foreground">Sistema de Acompanhamento de Processos — IPEM-PE</p>
        </div>
        {(
          <form onSubmit={enviar} className="space-y-4">
            {modo === "cadastrar" && (
              <div className="space-y-1.5">
                <Label htmlFor="nome">Nome</Label>
                <Input id="nome" value={nome} onChange={(e) => setNome(e.target.value)} required />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="email">E-mail</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="senha">Senha</Label>
              <Input id="senha" type="password" minLength={8} value={senha} onChange={(e) => setSenha(e.target.value)} required />
            </div>
            <Button type="submit" className="w-full" disabled={carregando}>
              {modo === "entrar" ? "Entrar" : "Criar conta"}
            </Button>
            {(cadastroAberto || modo === "cadastrar") && (
            <button
              type="button"
              className="w-full text-center text-sm text-muted-foreground underline-offset-4 hover:underline"
              onClick={() => setModo(modo === "entrar" ? "cadastrar" : "entrar")}
            >
              {modo === "entrar" ? "Primeiro acesso? Criar conta" : "Já tenho conta"}
            </button>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
