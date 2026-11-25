import { Link, useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Banknote, FileUp, FileWarning, Inbox, LayoutList, LogOut, Receipt, Scale, Tags, UserCog, Users } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { sairFn } from "@/lib/auth.functions";
import { useSessao } from "@/lib/auth";
import { PAPEIS, type Papel } from "@/lib/rotulos";

const NAV: { to: string; rotulo: string; icon: typeof LayoutList; papeis: Papel[] }[] = [
  { to: "/painel", rotulo: "Painel e busca", icon: LayoutList, papeis: ["cca", "cpma", "juridico", "gestao", "presidente", "homologador", "advogado"] },
  { to: "/cpma", rotulo: "CPMA · Recebimento", icon: Inbox, papeis: ["cpma"] },
  { to: "/juridico", rotulo: "Jurídico · Recebimento", icon: Scale, papeis: ["juridico"] },
  { to: "/julgamento", rotulo: "Julgamento e assinatura", icon: Scale, papeis: ["advogado", "presidente", "homologador"] },
  { to: "/classificacao-gru", rotulo: "GRUs: pago / recurso / não pago", icon: Banknote, papeis: ["juridico", "gestao"] },
  { to: "/divida-ativa", rotulo: "Dívida ativa", icon: FileWarning, papeis: ["juridico", "gestao"] },
  { to: "/importacao", rotulo: "Importação JR5260", icon: FileUp, papeis: ["cca"] },
  { to: "/fiscais", rotulo: "Fiscais", icon: Users, papeis: ["cpma", "admin"] },
  { to: "/especies", rotulo: "Espécies", icon: Tags, papeis: ["admin", "cpma", "cca"] },
  { to: "/usuarios", rotulo: "Usuários e perfis", icon: UserCog, papeis: ["admin"] },
  { to: "/parametros", rotulo: "Parâmetros (GRU)", icon: Receipt, papeis: ["admin"] },
];

export function AppShell({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { data: sessao, isLoading } = useSessao();
  const navigate = useNavigate();
  const papeis = sessao?.papeis ?? [];

  return (
    <div className="flex h-dvh overflow-hidden print:block print:h-auto print:overflow-visible">
      <aside className="flex w-60 shrink-0 flex-col overflow-y-auto bg-sidebar text-sidebar-foreground print:hidden">
        <div className="border-b border-sidebar-border px-5 py-5">
          <div className="text-xl font-bold tracking-tight">SAPP</div>
          <div className="text-xs opacity-70">IPEM-PE · protótipo</div>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {NAV.filter((n) => n.papeis.some((p) => papeis.includes(p))).map(({ to, rotulo, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className="flex items-center gap-2.5 rounded px-3 py-2 text-sm transition-colors hover:bg-sidebar-accent"
              activeProps={{ className: "bg-sidebar-accent text-sidebar-primary font-medium" }}
            >
              <Icon className="size-4" /> {rotulo}
            </Link>
          ))}
        </nav>
        <div className="border-t border-sidebar-border p-4 text-sm">
          <div className="truncate font-medium">{sessao?.nome}</div>
          <div className="mt-0.5 text-xs opacity-70">
            {papeis.map((p) => PAPEIS.find((x) => x.valor === p)?.rotulo).join(" · ") || "Sem perfil"}
          </div>
          <button
            className="mt-3 flex items-center gap-1.5 text-xs opacity-80 hover:opacity-100"
            onClick={async () => {
              await sairFn();
              queryClient.clear();
              navigate({ to: "/auth" });
            }}
          >
            <LogOut className="size-3.5" /> Sair
          </button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 overflow-y-auto print:overflow-visible">
        <div className="sticky top-0 z-10 border-b bg-warning px-6 py-1.5 text-xs text-warning-foreground print:hidden">
          Ambiente de testes — use somente dados fictícios. Nenhum processo real deve ser cadastrado.
        </div>
        <div className="p-6 lg:p-8">
          {isLoading ? null : papeis.length === 0 ? (
            <div className="max-w-lg rounded-lg border bg-card p-6">
              <h1 className="text-lg font-semibold">Aguardando liberação</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Sua conta foi criada, mas ainda não tem perfil de acesso. Peça ao administrador do SAPP para liberar o
                perfil do seu setor.
              </p>
            </div>
          ) : (
            children
          )}
        </div>
      </main>
    </div>
  );
}

export function Cabecalho({ titulo, sub, children }: { titulo: string; sub?: string; children?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{titulo}</h1>
        {sub && <p className="mt-1 text-sm text-muted-foreground">{sub}</p>}
      </div>
      {children}
    </div>
  );
}

export function SemPermissao() {
  return <p className="text-sm text-muted-foreground">Seu perfil não tem acesso a esta área.</p>;
}
