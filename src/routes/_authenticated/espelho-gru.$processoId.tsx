import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Printer } from "lucide-react";
import { useSessao } from "@/lib/auth";
import { obterEspelhoGruFn } from "@/lib/juridico.functions";
import { formatarDocumento } from "@/lib/documento";
import { dataBR } from "@/lib/rotulos";
import { brl } from "@/components/juridico/AcoesJulgamento";
import { Cabecalho, SemPermissao } from "@/components/AppShell";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/espelho-gru/$processoId")({
  head: () => ({ meta: [{ title: "Espelho da GRU — SAPP" }, { name: "description", content: "Resumo da GRU de multa para conferência e preenchimento da guia oficial." }] }),
  component: EspelhoGru,
});

function EspelhoGru() {
  const { processoId } = Route.useParams();
  const { data: sessao } = useSessao();
  const { data, isLoading } = useQuery({
    queryKey: ["espelho-gru", processoId],
    enabled: sessao?.tem("advogado", "gestao") ?? false,
    queryFn: () => obterEspelhoGruFn({ data: { processoId } }),
  });
  if (!sessao) return null;
  if (!sessao.tem("advogado", "gestao")) return <SemPermissao />;
  if (isLoading) return null;
  if (!data) return <p className="text-sm text-muted-foreground">GRU não encontrada para este processo.</p>;
  const { processo: p, gru, parametros } = data;
  const par = (k: string) => parametros.find((x) => x.chave === k)?.valor || "—";
  const linhas: [string, string][] = [
    ["Processo", p.numero],
    ["Nº do AI", p.numero_ai ?? "—"],
    ["Autuado (razão social)", p.proprietario ?? "—"],
    ["CPF/CNPJ", formatarDocumento(p.documento_autuado)],
    ["Nº da GRU registrada", gru.numero_gru],
    ["Vencimento", dataBR(gru.vencimento)],
    ["Valor da multa", brl(gru.valor)],
    [`Valor à vista (${gru.desconto_percentual}% de desconto)`, brl(gru.valor_com_desconto)],
    ["Código de recolhimento", par("gru_codigo_recolhimento")],
    ["Unidade gestora", par("gru_unidade_gestora")],
    ["Instruções", par("gru_instrucoes")],
  ];
  return (
    <>
      <Link to="/processos/$id" params={{ id: p.id }} search={{ area: "juridico" }} className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground print:hidden">
        <ArrowLeft className="size-4" /> Voltar ao processo
      </Link>
      <div className="print:hidden">
        <Cabecalho titulo="Espelho da GRU" sub="Resumo para conferência e preenchimento da guia oficial">
          <Button variant="outline" onClick={() => window.print()}><Printer /> Imprimir</Button>
        </Cabecalho>
      </div>
      <div className="hidden print:block"><div className="mb-2 text-base font-bold">IPEM-PE · Espelho da GRU — processo {p.numero}</div></div>
      <dl className="max-w-3xl divide-y rounded-lg border bg-card text-sm print:border-0">
        {linhas.map(([k, v]) => (
          <div key={k} className="grid grid-cols-3 gap-4 px-4 py-2"><dt className="text-muted-foreground print:text-black">{k}</dt><dd className="col-span-2 font-medium">{v}</dd></div>
        ))}
      </dl>
      <p className="mt-3 max-w-3xl text-xs text-muted-foreground print:text-black">Este espelho não é a guia oficial: serve para conferir os dados registrados no SAPP.</p>
    </>
  );
}
