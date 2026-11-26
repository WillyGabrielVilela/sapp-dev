import { Link, useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Banknote, FileUp, FileWarning, Gavel, Inbox, LayoutList, LogOut, Receipt, Scale, Stamp, Tags, UserCog, Users } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { sairFn } from "@/lib/auth.functions";
import { useSessao } from "@/lib/auth";
import { PAPEIS, ROTULO_PRESIDENTE, type Papel } from "@/lib/rotulos";

type Item = { to: string; rotulo: string; icon: typeof LayoutList; papeis: Papel[] };
/** Menu por área: cada setor/etapa tem a sua seção e só aparece para quem tem o perfil. */
const GRUPOS: { titulo: string | null; itens: Item[] }[] = [
  { titulo: null, itens: [{ to: "/painel", rotulo: "Painel e busca", icon: LayoutList, papeis: ["cca", "cpma", "juridico", "gestao", "presidente", "homologador", "advogado"] }] },
  { titulo: "CCA", itens: [{ to: "/importacao", rotulo: "Importação JR5260", icon: FileUp, papeis: ["cca"] }] },
  { titulo: "CPMA", itens: [{ to: "/cpma", rotulo: "Recebimento e fiscal", icon: Inbox, papeis: ["cpma"] }] },
  { titulo: "Jurídico administrativo", itens: [{ to: "/juridico", rotulo: "Protocolo, notificação e defesa", icon: Scale, papeis: ["juridico"] }] },
  {
    titulo: "Jurídico — advogados",
    itens: [
      { to: "/advogados", rotulo: "Julgamento e GRU", icon: Gavel, papeis: ["advogado"] },
      { to: "/classificacao-gru", rotulo: "GRUs: pago / recurso / não pago", icon: Banknote, papeis: ["advogado", "gestao"] },
      { to: "/divida-ativa", rotulo: "Dívida ativa", icon: FileWarning, papeis: ["advogado", "gestao"] },
    ],
  },
  { titulo: "Homologação", itens: [{ to: "/homologacao", rotulo: "Homologar e registrar assinatura", icon: Stamp, papeis: ["homologador"] }] },
  {
    titulo: "Cadastros e administração",
    itens: [
      { to: "/fiscais", rotulo: "Fiscais", icon: Users, papeis: ["cpma", "admin"] },
      { to: "/especies", rotulo: "Espécies", icon: Tags, papeis: ["admin", "cpma", "cca"] },
      { to: "/usuarios", rotulo: "Usuários e perfis", icon: UserCog, papeis: ["admin"] },
      { to: "/parametros", rotulo: "Parâmetros (GRU)", icon: Receipt, papeis: ["admin"] },
    ],
  },
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
        <nav className="flex-1 overflow-y-auto p-3">
          {GRUPOS.map((g) => {
            const itens = g.itens.filter((n) => n.papeis.some((p) => papeis.includes(p)));
            if (!itens.length) return null;
            return (
              <div key={g.titulo ?? "geral"} className="space-y-1 pb-2">
                {g.titulo && <div className="px-3 pb-0.5 pt-2 text-[11px] font-semibold uppercase tracking-wide opacity-60">{g.titulo}</div>}
                {itens.map(({ to, rotulo, icon: Icon }) => (
                  <Link
                    key={to}
                    to={to}
                    className="flex items-center gap-2.5 rounded px-3 py-2 text-sm transition-colors hover:bg-sidebar-accent"
                    activeProps={{ className: "bg-sidebar-accent text-sidebar-primary font-medium" }}
                  >
                    <Icon className="size-4" /> {rotulo}
                  </Link>
                ))}
              </div>
            );
          })}
        </nav>
        <div className="border-t border-sidebar-border p-4 text-sm">
          <div className="truncate font-medium">{sessao?.nome}</div>
          <div className="mt-0.5 text-xs opacity-70">
            {papeis.map((p) => (p === "presidente" ? ROTULO_PRESIDENTE : PAPEIS.find((x) => x.valor === p)?.rotulo)).join(" · ") || "Sem perfil"}
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
