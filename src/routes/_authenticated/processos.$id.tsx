import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, AlertTriangle, Inbox, UserRoundCheck } from "lucide-react";
import { obterProcessoFn, tramitarFn } from "@/lib/processos.functions";
import { listarFiscaisFn } from "@/lib/cadastros.functions";
import { AcoesJuridico } from "@/components/juridico/AcoesJuridico";
import { AcoesJulgamento, brl } from "@/components/juridico/AcoesJulgamento";
import { formatarDocumento } from "@/lib/documento";
import { usePerfis, useSessao } from "@/lib/auth";
import { Cabecalho } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { acoesCpma, etapaCpma, podeReceberNaArea, type AreaProcesso } from "@/lib/cpma";
import { CANAL, dataBR, erroMsg, EVENTO, RESULTADO, SETOR, SETOR_TECNICO, sgiEsperado, SITUACAO, type SetorTecnico } from "@/lib/rotulos";

export const Route = createFileRoute("/_authenticated/processos/$id")({
  validateSearch: (search: Record<string, unknown>): { area?: AreaProcesso } => {
    const area = search["area"];
    return area === "cpma" || area === "juridico" ? { area } : {};
  },
  head: () => ({
    meta: [
      { title: "Processo — SAPP" },
      { name: "description", content: "Situação, responsável e histórico do processo." },
      { property: "og:title", content: "Processo — SAPP" },
      { property: "og:description", content: "Situação, responsável e histórico do processo." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DetalheProcesso,
});

function DetalheProcesso() {
  const { id } = Route.useParams();
  const { area } = Route.useSearch();
  const qc = useQueryClient();
  const { data: sessao } = useSessao();
  const { data: perfis } = usePerfis();
  const [dialogo, setDialogo] = useState<null | "devolver" | "fiscal" | "encaminhar" | "corrigir" | "obs">(null);

  const { data: det, isLoading } = useQuery({
    queryKey: ["processo", id],
    queryFn: () => obterProcessoFn({ data: { id } }),
  });
  const p = det?.processo;
  const eventos = det?.eventos ?? [];
  const notificacoes = det?.notificacoes ?? [];
  const julgamento = det?.julgamento ?? null;
  const { data: fiscais = [] } = useQuery({ queryKey: ["fiscais"], queryFn: () => listarFiscaisFn() });

  const acao = useMutation({
    mutationFn: async (f: () => Promise<unknown>) => {
      await f();
    },
    onSuccess: async () => {
      toast.success("Registrado");
      setDialogo(null);
      await qc.invalidateQueries();
    },
    onError: (e) => toast.error(erroMsg(e)),
  });

  if (isLoading || !sessao) return null;
  if (!p) return <p className="text-sm text-muted-foreground">Processo não encontrado ou sem permissão de acesso.</p>;

  const fiscal = fiscais.find((f) => f.id === p.fiscal_id);
  const comSetor = !p.setor_destino;
  const podeReceber = podeReceberNaArea(p, sessao.papeis, area);
  const cpmaAtivo = area !== "juridico" && acoesCpma(p, sessao.papeis).informarFiscal;
  const etapa = area === "juridico" ? null : etapaCpma(p, sessao.papeis);
  const juridicoNoSetor = area !== "cpma" && sessao.tem("juridico") && p.setor_atual === "JURIDICO" && comSetor;
  const juridicoAtivo = juridicoNoSetor && p.situacao === "recebido_juridico"; // depois do protocolo não há devolução
  const ccaAtivo = sessao.tem("cca") && p.setor_atual === "CCA" && comSetor;
  const doSetorAtual = sessao.tem(p.setor_atual.toLowerCase() as "cca");
  const volta = area ?? (sessao.tem("cpma") ? "cpma" : sessao.tem("juridico") ? "juridico" : "painel");

  return (
    <>
      <Link to={volta === "cpma" ? "/cpma" : volta === "juridico" ? "/juridico" : "/painel"} className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> {volta === "cpma" ? "Voltar à CPMA" : volta === "juridico" ? "Voltar ao Jurídico" : "Voltar ao painel"}
      </Link>
      <Cabecalho titulo={p.numero}>
        <Badge className="text-sm">{SITUACAO[p.situacao]}</Badge>
      </Cabecalho>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div className="grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-2">
            {[
              ["Setor atual (com o processo)", SETOR[p.setor_atual] + (p.setor_destino ? ` — enviado ao ${SETOR[p.setor_destino]}, aguardando recebimento` : "")],
              ["Responsável atual", perfis?.get(p.responsavel_atual ?? "") ?? "—"],
              ["Setor autuante (lavrou o AI)", p.setor_autuante ? SETOR_TECNICO[p.setor_autuante] : "A informar pelo CPMA"],
              ["Fiscal do Termo de Ocorrência", fiscal ? `${fiscal.nome} (${fiscal.matricula})` : "A informar pelo CPMA"],
              ["Espécie", p.especie ?? "—"],
              ["Abertura", dataBR(p.abertura)],
              ["Proprietário", p.proprietario ?? "—"],
              ["Digitalização", p.digitalizado_em ? `${dataBR(p.digitalizado_em, true)} por ${perfis?.get(p.digitalizado_por ?? "") ?? "—"}` : "Não registrada"],
              ...(p.protocolo_juridico
                ? [
                    ["Protocolo do Jurídico", `${p.protocolo_juridico} · ${dataBR(p.protocolado_em, true)}`],
                    ["Nº do AI (auto de infração)", p.numero_ai ?? "Não informado"],
                    ["CPF/CNPJ do autuado", formatarDocumento(p.documento_autuado)],
                    ["Nome fantasia · Bairro", `${p.nome_fantasia ?? "—"} · ${p.bairro ?? "—"}`],
                  ]
                : []),
              ...(p.ciencia_em ? [["Ciência da notificação", dataBR(p.ciencia_em)], ["Prazo de defesa até", dataBR(p.vencimento_defesa)]] : []),
              ...(p.defesa_em ? [["Defesa protocolada em", dataBR(p.defesa_em)]] : []),
              ...(julgamento
                ? [
                    ["Decisão", julgamento.decisao === "multa" ? `Multa de ${brl(julgamento.valor_multa)}` : "Arquivamento"],
                    ["Julgado por", `${perfis?.get(julgamento.julgador_id) ?? "—"} · ${dataBR(julgamento.julgado_em, true)}`],
                    ["Fundamentação", julgamento.fundamentacao],
                    ["Assinatura do Presidente", julgamento.assinado_em ? `${perfis?.get(julgamento.assinado_por ?? "") ?? "—"} · ${dataBR(julgamento.assinado_em, true)}` : "Pendente"],
                    ["Homologação", julgamento.homologado_em ? `${perfis?.get(julgamento.homologado_por ?? "") ?? "—"} · ${dataBR(julgamento.homologado_em, true)}` : "Pendente"],
                  ]
                : []),
              ["No SGI deve constar em (conferir)", sgiEsperado(p.situacao)],
            ].map(([k, v]) => (
              <div key={k} className="bg-card p-4">
                <div className="text-xs text-muted-foreground">{k}</div>
                <div className="mt-0.5 font-medium">{v}</div>
              </div>
            ))}
          </div>

          {notificacoes.length > 0 && (
            <div className="rounded-lg border bg-card p-4">
              <h2 className="mb-2 font-semibold">Notificações</h2>
              <ul className="space-y-1 text-sm">
                {notificacoes.map((n) => (
                  <li key={n.id}>
                    <Link to="/listas-saida/$id" params={{ id: n.lista_id }} className="text-primary hover:underline">{dataBR(n.data_saida)} · {CANAL[n.canal]}</Link>
                    {" — "}{RESULTADO[n.resultado]}{n.data_resultado ? ` em ${dataBR(n.data_resultado)}` : ""}{n.recebedor ? ` (${n.recebedor})` : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="rounded-lg border bg-card p-4">
            <h2 className="mb-1 font-semibold">Próxima providência</h2>
            <p className="text-sm text-muted-foreground">{proxima(p)}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {podeReceber && (
                <Button disabled={acao.isPending} onClick={() => acao.mutate(() => tramitarFn({ data: { acao: "receber", processoId: p.id } }))}>
                  <Inbox /> {acao.isPending ? "Registrando…" : "Confirmar recebimento"}
                </Button>
              )}
              {etapa === "informarFiscal" && (
                <Button disabled={acao.isPending} onClick={() => setDialogo("fiscal")}>
                  <UserRoundCheck /> Informar fiscal
                </Button>
              )}
              {etapa === "digitalizar" && (
                <Button disabled={acao.isPending} onClick={() => acao.mutate(() => tramitarFn({ data: { acao: "digitalizacao", processoId: p.id } }))}>
                  Registrar digitalização
                </Button>
              )}
              {etapa === "encaminhar" && (
                <Button disabled={acao.isPending} onClick={() => setDialogo("encaminhar")}>
                  Encaminhar ao Jurídico
                </Button>
              )}
              {(cpmaAtivo || juridicoAtivo) && (
                <Button variant="outline" onClick={() => setDialogo("devolver")}>
                  Devolver ao {cpmaAtivo ? "CCA" : "CPMA"}
                </Button>
              )}
              {juridicoNoSetor && <AcoesJuridico p={p} notificacoes={notificacoes} />}
              {p.setor_atual === "JURIDICO" && comSetor && <AcoesJulgamento p={p} julgamento={julgamento} papeis={sessao.papeis} />}
              {ccaAtivo && <Button onClick={() => setDialogo("corrigir")}>Corrigir e reencaminhar ao CPMA</Button>}
              {doSetorAtual && (
                <Button variant="ghost" onClick={() => setDialogo("obs")}>
                  Adicionar observação
                </Button>
              )}
            </div>
          </div>
        </div>

        <div>
          <h2 className="mb-3 font-semibold">Histórico</h2>
          <ol className="relative space-y-4 border-l pl-5">
            {eventos.map((e) => (
              <li key={e.id} className="relative">
                <span className="absolute -left-[25px] top-1.5 size-2.5 rounded-full bg-primary" />
                <div className="text-sm font-medium">
                  {EVENTO[e.tipo]}
                  {e.setor_origem && e.setor_destino && (
                    <span className="font-normal text-muted-foreground"> · {SETOR[e.setor_origem]} → {SETOR[e.setor_destino]}</span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  {dataBR(e.criado_em, true)} · {perfis?.get(e.usuario_id) ?? "—"}
                </div>
                {e.observacao && <p className="mt-1 rounded bg-muted px-2 py-1 text-xs">{e.observacao}</p>}
              </li>
            ))}
          </ol>
        </div>
      </div>

      <DialogoTexto
        aberto={dialogo === "devolver"}
        titulo={`Devolver ao ${cpmaAtivo ? "CCA" : "CPMA"}`}
        rotulo="Justificativa (obrigatória)"
        obrigatorio
        fechar={() => setDialogo(null)}
        enviar={(t) => acao.mutate(() => tramitarFn({ data: { acao: "devolver", processoId: p.id, obs: t } }))}
      />
      <DialogoTexto
        aberto={dialogo === "encaminhar"}
        titulo="Encaminhar ao Jurídico"
        rotulo="Observação (opcional)"
        fechar={() => setDialogo(null)}
        enviar={(t) => acao.mutate(() => tramitarFn({ data: { acao: "encaminhar", processoId: p.id, obs: t } }))}
      />
      <DialogoTexto
        aberto={dialogo === "obs"}
        titulo="Adicionar observação"
        rotulo="Observação"
        obrigatorio
        fechar={() => setDialogo(null)}
        enviar={(t) => acao.mutate(() => tramitarFn({ data: { acao: "observacao", processoId: p.id, obs: t } }))}
      />
      {dialogo === "fiscal" && (
        <DialogoFiscal
          especie={p.especie}
          fiscais={fiscais.filter((f) => f.ativo)}
          atual={p.fiscal_id}
          setorAtual={p.setor_autuante}
          salvando={acao.isPending}
          fechar={() => setDialogo(null)}
          enviar={(fid, setor) =>
            acao.mutate(() => tramitarFn({ data: { acao: "fiscal", processoId: p.id, fiscalId: fid, setor } }))
          }
        />
      )}
      {dialogo === "corrigir" && (
        <DialogoCorrigir
          inicial={{ especie: p.especie ?? "", abertura: p.abertura ?? "", proprietario: p.proprietario ?? "" }}
          fechar={() => setDialogo(null)}
          enviar={(v) =>
            acao.mutate(() =>
              tramitarFn({ data: { acao: "reencaminhar", processoId: p.id, especie: v.especie, abertura: v.abertura, proprietario: v.proprietario, obs: v.obs } }),
            )
          }
        />
      )}
    </>
  );
}

function proxima(p: { situacao: string; digitalizado_em: string | null; fiscal_id: string | null; vencimento_defesa?: string | null }) {
  switch (p.situacao) {
    case "aguardando_cpma": return "O CPMA deve confirmar o recebimento.";
    case "em_conferencia_cpma": {
      return !p.fiscal_id ? "CPMA: informar o fiscal do Termo de Ocorrência." : "CPMA: registrar a digitalização.";
    }
    case "pronto_juridico": return "CPMA: encaminhar ao Jurídico.";
    case "aguardando_juridico": return "O Jurídico deve confirmar o recebimento.";
    case "recebido_juridico": return "Jurídico: protocolar o processo (informar AI, CPF/CNPJ, nome fantasia e bairro).";
    case "protocolado_juridico": return "Jurídico: incluir em uma lista de saída para notificar o autuado.";
    case "notificacao_enviada": return "Jurídico: registrar a entrega (data e quem recebeu) ou o motivo de não entrega. O prazo de defesa só corre depois disso.";
    case "notificacao_frustrada": return "Notificação não entregue. Corrija os dados se preciso e inclua em nova lista de saída (outro canal, se for o caso).";
    case "aguardando_defesa": return "Prazo de defesa correndo. Registre a defesa ou, vencido o prazo, encerre sem defesa.";
    case "com_defesa":
    case "sem_defesa": return "Aguardando julgamento pelo advogado da espécie (decisão, valor da multa e fundamentação).";
    case "julgamento_devolvido": return "Devolvido ao julgamento: o advogado da espécie deve rejulgar.";
    case "julgado": return "Julgado. Aguardando a assinatura do Presidente.";
    case "assinado_presidente": return "Assinado pelo Presidente. Aguardando a homologação.";
    case "homologado": return "Homologado. As próximas etapas (guia GRU, Correios, recurso, cobrança) ainda serão implementadas.";
    case "aguardando_cca": return "O CCA deve confirmar o recebimento da devolução.";
    case "em_correcao_cca": return "CCA: corrigir o cadastro e reencaminhar ao CPMA.";
    default: return "—";
  }
}

function DialogoTexto(props: { aberto: boolean; titulo: string; rotulo: string; obrigatorio?: boolean; fechar: () => void; enviar: (t: string) => void }) {
  const [t, setT] = useState("");
  return (
    <Dialog open={props.aberto} onOpenChange={(o) => !o && props.fechar()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{props.titulo}</DialogTitle></DialogHeader>
        <Label>{props.rotulo}</Label>
        <Textarea value={t} onChange={(e) => setT(e.target.value)} rows={4} />
        <DialogFooter>
          <Button disabled={props.obrigatorio && t.trim().length < 5} onClick={() => props.enviar(t)}>Confirmar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type Fiscal = { id: string; nome: string; matricula: string; setor_tecnico: SetorTecnico; especies: string[] };

function DialogoFiscal({ especie, fiscais, atual, setorAtual, salvando, fechar, enviar }: { especie: string | null; fiscais: Fiscal[]; atual: string | null; setorAtual: SetorTecnico | null; salvando: boolean; fechar: () => void; enviar: (id: string, s: SetorTecnico) => void }) {
  const [sel, setSel] = useState(atual ?? "");
  const [busca, setBusca] = useState("");
  const f = fiscais.find((x) => x.id === sel);
  const [setor, setSetor] = useState<SetorTecnico | "">(setorAtual ?? "");
  // Hipótese a validar: setor autuante = setor do fiscal. Sugerido, mas editável.
  const setorFinal = (setor || f?.setor_tecnico || "") as SetorTecnico | "";
  const ordenados = [...fiscais].filter((x) => `${x.nome} ${x.matricula}`.toLocaleLowerCase("pt-BR").includes(busca.trim().toLocaleLowerCase("pt-BR"))).sort((a, b) => Number(b.especies.includes(especie ?? "")) - Number(a.especies.includes(especie ?? "")));
  const fora = f && especie && !f.especies.includes(especie);
  return (
    <Dialog open onOpenChange={(o) => !o && !salvando && fechar()}>
      <DialogContent className="max-h-[90dvh] w-[calc(100%-2rem)] overflow-y-auto" onEscapeKeyDown={(e) => salvando && e.preventDefault()} onPointerDownOutside={(e) => salvando && e.preventDefault()}>
        <DialogHeader><DialogTitle>Fiscal do Termo de Ocorrência</DialogTitle></DialogHeader>
        <Input aria-label="Buscar fiscal" placeholder="Nome ou matrícula do fiscal" value={busca} disabled={salvando} onChange={(e) => setBusca(e.target.value)} />
        {!fiscais.length && <p className="text-sm text-muted-foreground">Nenhum fiscal ativo cadastrado. <Link to="/fiscais" className="text-primary underline">Cadastrar fiscal</Link></p>}
        {fiscais.length > 0 && !ordenados.length && <p className="text-sm text-muted-foreground">Nenhum fiscal encontrado.</p>}
        <RadioGroup aria-label="Fiscal do processo" value={sel} disabled={salvando} onValueChange={(id) => { setSel(id); }} className="max-h-64 overflow-y-auto">
          {ordenados.map((x) => (
            <label htmlFor={`fiscal-${x.id}`} key={x.id} className={`flex cursor-pointer items-start gap-3 rounded border p-3 text-sm ${sel === x.id ? "border-primary bg-muted" : ""}`}>
              <RadioGroupItem className="mt-1 shrink-0" id={`fiscal-${x.id}`} value={x.id} />
              <span className="min-w-0 break-words"><span className="block font-medium">{x.nome} ({x.matricula})</span><span className="text-xs text-muted-foreground">{SETOR_TECNICO[x.setor_tecnico]} · {x.especies.join(", ")}</span></span>
            </label>
          ))}
        </RadioGroup>
        {fora && (
          <p className="flex items-center gap-1.5 rounded bg-warning px-2 py-1.5 text-xs text-warning-foreground">
            <AlertTriangle className="size-3.5" /> Este fiscal não está cadastrado para a espécie {especie}. A escolha ficará registrada no histórico.
          </p>
        )}
        <Label htmlFor="setor-autuante">Setor autuante</Label>
        <select id="setor-autuante" disabled={salvando} className="h-9 rounded border bg-background px-2 text-sm" value={setorFinal} onChange={(e) => setSetor(e.target.value as SetorTecnico)}>
          <option value="">Selecione</option>
          {Object.entries(SETOR_TECNICO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <DialogFooter>
          <Button variant="outline" disabled={salvando} onClick={fechar}>Cancelar</Button>
          <Button disabled={salvando || !f || !setorFinal} onClick={() => { if (f && setorFinal) enviar(f.id, setorFinal); }}>{salvando ? "Salvando…" : "Salvar fiscal"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DialogoCorrigir({ inicial, fechar, enviar }: { inicial: { especie: string; abertura: string; proprietario: string }; fechar: () => void; enviar: (v: { especie: string; abertura: string; proprietario: string; obs: string }) => void }) {
  const [v, setV] = useState({ ...inicial, obs: "" });
  return (
    <Dialog open onOpenChange={(o) => !o && fechar()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Corrigir e reencaminhar ao CPMA</DialogTitle></DialogHeader>
        <Label>Espécie</Label>
        <Input value={v.especie} onChange={(e) => setV({ ...v, especie: e.target.value.toUpperCase() })} />
        <Label>Abertura</Label>
        <Input type="date" value={v.abertura} onChange={(e) => setV({ ...v, abertura: e.target.value })} />
        <Label>Proprietário</Label>
        <Input value={v.proprietario} onChange={(e) => setV({ ...v, proprietario: e.target.value })} />
        <Label>Observação</Label>
        <Textarea value={v.obs} onChange={(e) => setV({ ...v, obs: e.target.value })} />
        <DialogFooter><Button onClick={() => enviar(v)}>Salvar e reencaminhar</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
