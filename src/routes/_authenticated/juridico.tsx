import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Eye, Inbox, ListPlus } from "lucide-react";
import { useSessao } from "@/lib/auth";
import { acoesJuridico } from "@/lib/cpma";
import { listarProcessosFn } from "@/lib/processos.functions";
import { criarListaFn, listarListasFn } from "@/lib/juridico.functions";
import { CANAL, dataBR, erroMsg, SITUACAO } from "@/lib/rotulos";
import type { CanalNotificacao, Processo } from "@/lib/tipos";
import { Cabecalho, SemPermissao } from "@/components/AppShell";
import { hojeISO } from "@/components/juridico/ResultadoDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/juridico")({
  head: () => ({ meta: [
    { title: "Jurídico — Protocolo e notificação | SAPP" },
    { name: "description", content: "Processos encaminhados pela CPMA ao Jurídico: recebimento, protocolo, listas de saída e prazo de defesa." },
    { property: "og:title", content: "Jurídico — Protocolo e notificação | SAPP" },
    { property: "og:description", content: "Fila do Jurídico: protocolo, notificação e prazo de defesa." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Juridico,
});

type Fila = { titulo: string; itens: Processo[]; seleciona?: boolean; botao: (p: Processo) => string };

function Juridico() {
  const { data: sessao } = useSessao();
  const [busca, setBusca] = useState("");
  const { data: processos = [], isLoading, error } = useQuery({
    queryKey: ["processos"],
    enabled: sessao?.tem("juridico") ?? false,
    queryFn: () => listarProcessosFn(),
  });
  const { data: listas = [] } = useQuery({ queryKey: ["listas"], enabled: sessao?.tem("juridico") ?? false, queryFn: () => listarListasFn() });
  if (!sessao) return null;
  if (!sessao.tem("juridico")) return <SemPermissao />;
  const por = (...s: Processo["situacao"][]) => processos.filter((p) => s.includes(p.situacao));
  const filas: Fila[] = [
    { titulo: "A receber (enviados pela CPMA)", itens: processos.filter((p) => acoesJuridico(p, sessao.papeis).receber), botao: () => "Receber processo" },
    { titulo: "A protocolar", itens: por("recebido_juridico"), botao: () => "Protocolar" },
    { titulo: "A notificar · protocolados e notificações não entregues", itens: por("protocolado_juridico", "notificacao_frustrada"), seleciona: true, botao: () => "Abrir processo" },
    { titulo: "Entregas a registrar (notificação enviada)", itens: por("notificacao_enviada"), botao: () => "Registrar entrega" },
    { titulo: "Prazo de defesa correndo (segue sozinho se vencer sem defesa)", itens: por("aguardando_defesa"), botao: () => "Abrir processo" },
    { titulo: "Com defesa ou sem defesa · aguardando julgamento dos advogados", itens: por("com_defesa", "sem_defesa", "julgamento_devolvido", "julgado", "homologado"), botao: () => "Abrir processo" },
    { titulo: "A gerar a GRU (assinados pelo Presidente) · fase 3", itens: por("assinado_presidente"), botao: () => "Abrir processo" },
  ];
  const termo = busca.trim().toLocaleLowerCase("pt-BR");
  const casa = (p: Processo) => !termo || p.numero.includes(termo) || (p.numero_ai ?? "").includes(termo) || (p.proprietario ?? "").toLocaleLowerCase("pt-BR").includes(termo);

  return <>
    <Cabecalho titulo="Jurídico" sub="Protocolo → notificação → ciência → prazo de defesa (a GRU, os Correios, o recurso e a cobrança virão nas próximas etapas)" />
    <Input className="mb-6 max-w-xl" aria-label="Buscar processo no Jurídico" placeholder="Buscar por nº do processo, nº do AI ou nome do autuado" value={busca} onChange={(e) => setBusca(e.target.value)} />
    {error ? <p role="alert" className="text-destructive">Não foi possível carregar os processos.</p> : isLoading ? <p className="text-muted-foreground">Carregando processos…</p> :
      <div className="space-y-8">
        {filas.map((f) => <FilaTabela key={f.titulo} fila={f} visiveis={f.itens.filter(casa)} papeis={sessao.papeis} />)}
        <section>
          <h2 className="mb-3 font-semibold">Listas de saída recentes ({listas.length})</h2>
          {!listas.length ? <p className="border-t py-4 text-sm text-muted-foreground">Nenhuma lista criada.</p> :
            <div className="tabela-rolavel rounded-md border"><table className="w-full text-left text-sm">
              <thead className="bg-muted text-muted-foreground"><tr><th className="p-3">Lista</th><th className="p-3">Canal</th><th className="p-3">Itens</th><th className="p-3">Sem desfecho</th></tr></thead>
              <tbody>{listas.slice(0, 20).map((l) => <tr key={l.id} className="border-t">
                <td className="p-3"><Link to="/listas-saida/$id" params={{ id: l.id }} className="text-primary hover:underline">{dataBR(l.data)} · nº {l.numero_dia}{l.titulo ? ` · ${l.titulo}` : ""}</Link></td>
                <td className="p-3">{CANAL[l.canal]}</td><td className="p-3">{l.total}</td><td className="p-3">{l.pendentes}</td>
              </tr>)}</tbody>
            </table></div>}
        </section>
      </div>}
  </>;
}

function FilaTabela({ fila, visiveis, papeis }: { fila: Fila; visiveis: Processo[]; papeis: Parameters<typeof acoesJuridico>[1] }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [canal, setCanal] = useState<CanalNotificacao>("correios");
  const [data, setData] = useState(hojeISO());
  const [titulo, setTitulo] = useState("");
  const criar = useMutation({
    mutationFn: () => criarListaFn({ data: { processoIds: [...sel], canal, data, titulo } }),
    onSuccess: async (id) => {
      toast.success("Lista de saída criada");
      setSel(new Set());
      await qc.invalidateQueries();
      navigate({ to: "/listas-saida/$id", params: { id } });
    },
    onError: (e) => toast.error(erroMsg(e)),
  });
  const marcados = visiveis.filter((p) => sel.has(p.id));
  const alternar = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  return <section>
    <h2 className="mb-3 font-semibold">{fila.titulo} ({visiveis.length})</h2>
    {fila.seleciona && marcados.length > 0 && (
      <div className="mb-3 flex flex-wrap items-end gap-3 rounded-lg border bg-card p-3 text-sm">
        <span className="font-medium">{marcados.length} selecionado(s)</span>
        <label className="grid gap-1">Canal
          <select className="h-9 rounded border bg-background px-2" value={canal} onChange={(e) => setCanal(e.target.value as CanalNotificacao)}>
            {Object.entries(CANAL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label className="grid gap-1">Data de saída<Input type="date" max={hojeISO()} value={data} onChange={(e) => setData(e.target.value)} /></label>
        <label className="grid gap-1">Título (opcional, ex.: bairro/roteiro)<Input value={titulo} onChange={(e) => setTitulo(e.target.value)} /></label>
        <Button disabled={criar.isPending || !data} onClick={() => criar.mutate()}><ListPlus /> Criar lista de saída</Button>
      </div>
    )}
    {!visiveis.length ? <p className="border-t py-4 text-sm text-muted-foreground">Nenhum processo nesta fila.</p> :
      <div className="tabela-rolavel rounded-md border"><table className="w-full text-left text-sm">
        <thead className="bg-muted text-muted-foreground"><tr>
          {fila.seleciona && <th className="w-10 p-3"><input type="checkbox" aria-label="Selecionar todos" checked={marcados.length === visiveis.length} onChange={(e) => setSel(e.target.checked ? new Set(visiveis.map((p) => p.id)) : new Set())} /></th>}
          <th className="p-3">Processo</th><th className="p-3">AI</th><th className="p-3">Autuado</th><th className="p-3">Bairro</th><th className="p-3">Situação</th><th className="p-3">Providência</th></tr></thead>
        <tbody>{visiveis.map((p) => {
          const { receber } = acoesJuridico(p, papeis);
          return <tr key={p.id} className="border-t">
            {fila.seleciona && <td className="p-3"><input type="checkbox" aria-label={`Selecionar ${p.numero}`} checked={sel.has(p.id)} onChange={() => alternar(p.id)} /></td>}
            <td className="p-3"><Link to="/processos/$id" params={{ id: p.id }} search={{ area: "juridico" }} className="num-processo whitespace-nowrap text-primary hover:underline">{p.numero}</Link></td>
            <td className="p-3">{p.numero_ai ?? "—"}</td>
            <td className="p-3">{p.proprietario ?? "—"}</td>
            <td className="p-3">{p.bairro ?? "—"}</td>
            <td className="p-3"><Badge variant="secondary">{SITUACAO[p.situacao]}</Badge>{p.vencimento_defesa && p.situacao === "aguardando_defesa" ? <span className="ml-2 text-xs text-muted-foreground">até {dataBR(p.vencimento_defesa)}</span> : null}</td>
            <td className="p-3"><Button asChild variant={receber ? "default" : "outline"} size="sm"><Link to="/processos/$id" params={{ id: p.id }} search={{ area: "juridico" }}>{receber ? <Inbox /> : <Eye />}{fila.botao(p)}</Link></Button></td>
          </tr>;
        })}</tbody>
      </table></div>}
  </section>;
}
