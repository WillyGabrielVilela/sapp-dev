import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Banknote, FileWarning } from "lucide-react";
import { useSessao } from "@/lib/auth";
import { listarProcessosFn } from "@/lib/processos.functions";
import { minhasEspeciesFn } from "@/lib/julgamento.functions";
import type { Processo } from "@/lib/tipos";
import { Cabecalho, SemPermissao } from "@/components/AppShell";
import { TabelaProcessos } from "@/components/juridico/TabelaProcessos";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/advogados")({
  head: () => ({ meta: [{ title: "Jurídico — Advogados | SAPP" }, { name: "description", content: "Julgamento, multa, GRU e classificação (pago, recurso, não pago)." }] }),
  component: Advogados,
});

function Advogados() {
  const { data: sessao } = useSessao();
  const habilitado = sessao?.tem("advogado") ?? false;
  const { data: processos = [], isLoading, error } = useQuery({ queryKey: ["processos"], enabled: habilitado, queryFn: () => listarProcessosFn() });
  const { data: minhas = [] } = useQuery({ queryKey: ["minhas-especies"], enabled: habilitado, queryFn: () => minhasEspeciesFn() });
  if (!sessao) return null;
  if (!habilitado) return <SemPermissao />;
  const por = (...s: Processo["situacao"][]) => processos.filter((p) => s.includes(p.situacao));
  const aJulgar = por("com_defesa", "sem_defesa", "julgamento_devolvido");
  const meus = aJulgar.filter((p) => p.especie && (!minhas.length || minhas.includes(p.especie)));
  const fora = aJulgar.filter((p) => !p.especie || (minhas.length > 0 && !minhas.includes(p.especie)));
  return (
    <>
      <Cabecalho titulo="Jurídico — Advogados" sub="Julgar, atribuir a multa e registrar a GRU. Depois: classificar a GRU (pago, em recurso, não pago).">
        <Button asChild variant="outline"><Link to="/classificacao-gru"><Banknote /> Classificação das GRUs</Link></Button>
        <Button asChild variant="outline"><Link to="/divida-ativa"><FileWarning /> Dívida ativa</Link></Button>
      </Cabecalho>
      {error ? <p role="alert" className="text-destructive">Não foi possível carregar os processos.</p> : isLoading ? <p className="text-muted-foreground">Carregando processos…</p> : (
        <div className="space-y-8">
          {minhas.length > 0 && fora.length > 0 && (
            <p className="rounded border bg-warning px-3 py-2 text-sm text-warning-foreground">
              Você só está designado para as espécies {minhas.join(", ")}. Há {fora.length} processo(s) aguardando julgamento de outras espécies
              ({[...new Set(fora.map((p) => p.especie ?? "sem espécie"))].join(", ")}). Peça a um homologador para liberar.
            </p>
          )}
          <TabelaProcessos titulo={`A julgar · ${minhas.length ? `espécies ${minhas.join(", ")}` : "todas as espécies"}`} itens={meus} botao="Julgar" csv="a-julgar" />
          <TabelaProcessos titulo="A gerar a GRU (assinados pelo Presidente)" itens={por("assinado_presidente")} botao="Registrar GRU" csv="a-gerar-gru" />
          <TabelaProcessos titulo="Julgados · em homologação ou aguardando o registro da assinatura (acompanhamento)" itens={por("julgado", "homologado")} botao="Abrir" csv="julgados-em-homologacao" />
        </div>
      )}
    </>
  );
}
