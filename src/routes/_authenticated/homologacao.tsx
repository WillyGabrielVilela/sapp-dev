import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useSessao } from "@/lib/auth";
import { listarProcessosFn } from "@/lib/processos.functions";
import { assinarLoteFn, homologarLoteFn } from "@/lib/julgamento.functions";
import type { Processo } from "@/lib/tipos";
import { Cabecalho, SemPermissao } from "@/components/AppShell";
import { DistribuicaoEspecies } from "@/components/juridico/DistribuicaoEspecies";
import { TabelaProcessos } from "@/components/juridico/TabelaProcessos";

export const Route = createFileRoute("/_authenticated/homologacao")({
  head: () => ({ meta: [{ title: "Homologação | SAPP" }, { name: "description", content: "Homologação das decisões e registro da assinatura do Presidente." }] }),
  component: Homologacao,
});

function Homologacao() {
  const { data: sessao } = useSessao();
  const habilitado = sessao?.tem("homologador") ?? false;
  const { data: processos = [], isLoading, error } = useQuery({ queryKey: ["processos"], enabled: habilitado, queryFn: () => listarProcessosFn() });
  if (!sessao) return null;
  if (!habilitado) return <SemPermissao />;
  const por = (...s: Processo["situacao"][]) => processos.filter((p) => s.includes(p.situacao));
  return (
    <>
      <Cabecalho titulo="Homologação" sub="Homologar as decisões dos advogados e registrar a assinatura do Presidente (que não usa o sistema)." />
      {error ? <p role="alert" className="text-destructive">Não foi possível carregar os processos.</p> : isLoading ? <p className="text-muted-foreground">Carregando processos…</p> : (
        <div className="space-y-8">
          <TabelaProcessos titulo="Aguardando homologação" itens={por("julgado")} botao="Homologar" csv="aguardando-homologacao"
            lote={{ rotulo: "Homologar", acao: (processoIds, obs) => homologarLoteFn({ data: { processoIds, obs } }) }} />
          <TabelaProcessos titulo="Homologados · registrar a assinatura do Presidente" itens={por("homologado")} botao="Registrar assinatura" csv="aguardando-assinatura-presidente"
            lote={{ rotulo: "Registrar assinatura", comData: { rotulo: "Data em que o Presidente assinou" }, acao: (processoIds, obs, data) => assinarLoteFn({ data: { processoIds, obs, ...(data ? { data } : {}) } }) }} />
          <DistribuicaoEspecies />
          <TabelaProcessos titulo="Assinados · seguem para os advogados (GRU)" itens={por("assinado_presidente", "gru_gerada", "em_recurso", "pago", "nao_pago", "arquivado")} botao="Abrir" csv="concluidos-homologacao" />
        </div>
      )}
    </>
  );
}
