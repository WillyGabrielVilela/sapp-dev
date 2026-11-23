import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Eye } from "lucide-react";
import { useSessao } from "@/lib/auth";
import { listarProcessosFn } from "@/lib/processos.functions";
import { minhasEspeciesFn } from "@/lib/julgamento.functions";
import { dataBR, SITUACAO } from "@/lib/rotulos";
import type { Processo } from "@/lib/tipos";
import { Cabecalho, SemPermissao } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/julgamento")({
  head: () => ({ meta: [{ title: "Julgamento, assinatura e homologação | SAPP" }, { name: "description", content: "Filas de julgamento por espécie, assinatura do Presidente e homologação." }] }),
  component: Julgamento,
});

function Julgamento() {
  const { data: sessao } = useSessao();
  const habilitado = sessao?.tem("juridico", "presidente", "homologador") ?? false;
  const { data: processos = [], isLoading, error } = useQuery({ queryKey: ["processos"], enabled: habilitado, queryFn: () => listarProcessosFn() });
  const { data: minhas = [] } = useQuery({ queryKey: ["minhas-especies"], enabled: sessao?.tem("juridico") ?? false, queryFn: () => minhasEspeciesFn() });
  if (!sessao) return null;
  if (!habilitado) return <SemPermissao />;
  const por = (...s: Processo["situacao"][]) => processos.filter((p) => s.includes(p.situacao));
  return (
    <>
      <Cabecalho titulo="Julgamento, assinatura e homologação" sub="Julgamento (advogado da espécie) → assinatura do Presidente → homologação" />
      {error ? <p role="alert" className="text-destructive">Não foi possível carregar os processos.</p> : isLoading ? <p className="text-muted-foreground">Carregando processos…</p> : (
        <div className="space-y-8">
          {sessao.tem("juridico") && (
            <>
              {!minhas.length && <p className="rounded border bg-warning px-3 py-2 text-sm text-warning-foreground">Você ainda não foi designado para nenhuma espécie. Peça ao administrador (Usuários e perfis).</p>}
              <Tabela titulo={`A julgar · minhas espécies (${minhas.join(", ") || "nenhuma"})`} itens={por("com_defesa", "sem_defesa", "julgamento_devolvido").filter((p) => p.especie && minhas.includes(p.especie))} botao="Julgar" />
            </>
          )}
          {sessao.tem("presidente") && <Tabela titulo="Aguardando assinatura do Presidente" itens={por("julgado")} botao="Assinar" />}
          {sessao.tem("homologador") && <Tabela titulo="Aguardando homologação" itens={por("assinado_presidente")} botao="Homologar" />}
          <Tabela titulo="Homologados (aguardam a etapa da GRU)" itens={por("homologado")} botao="Abrir" />
        </div>
      )}
    </>
  );
}

function Tabela({ titulo, itens, botao }: { titulo: string; itens: Processo[]; botao: string }) {
  return (
    <section>
      <h2 className="mb-3 font-semibold">{titulo} ({itens.length})</h2>
      {!itens.length ? <p className="border-t py-4 text-sm text-muted-foreground">Nenhum processo nesta fila.</p> : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted text-muted-foreground"><tr><th className="p-3">Processo</th><th className="p-3">Espécie</th><th className="p-3">Autuado</th><th className="p-3">Situação</th><th className="p-3">Atualizado</th><th className="p-3" /></tr></thead>
            <tbody>{itens.map((p) => (
              <tr key={p.id} className="border-t">
                <td className="p-3"><Link to="/processos/$id" params={{ id: p.id }} search={{ area: "juridico" }} className="num-processo whitespace-nowrap text-primary hover:underline">{p.numero}</Link></td>
                <td className="p-3">{p.especie ?? "—"}</td><td className="p-3">{p.proprietario ?? "—"}</td>
                <td className="p-3"><Badge variant="secondary">{SITUACAO[p.situacao]}</Badge></td>
                <td className="p-3">{dataBR(p.updated_at, true)}</td>
                <td className="p-3"><Button asChild size="sm" variant="outline"><Link to="/processos/$id" params={{ id: p.id }} search={{ area: "juridico" }}><Eye />{botao}</Link></Button></td>
              </tr>))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
