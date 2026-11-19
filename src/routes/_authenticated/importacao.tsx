import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Download, FileUp } from "lucide-react";
import { confirmarArquivoFn, corrigirItemFn, descartarItemFn, enviarArquivoFn, informarTotalFn, listarArquivosFn, listarItensFn } from "@/lib/importacao.functions";
import { useSessao } from "@/lib/auth";
import { Cabecalho, SemPermissao } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel } from "@/components/ui/alert-dialog";
import { avaliarTriagem } from "@/lib/triagem";
import { extrairPaginas, lerRelatorio, REGEX_NUMERO } from "@/lib/jr5260";
import { dataBR, erroMsg } from "@/lib/rotulos";

export const Route = createFileRoute("/_authenticated/importacao")({
  head: () => ({
    meta: [
      { title: "Importação JR5260 — SAPP" },
      { name: "description", content: "Importação e triagem do relatório de processos cadastrados do SGI." },
      { property: "og:title", content: "Importação JR5260 — SAPP" },
      { property: "og:description", content: "Importação e triagem do relatório do SGI." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Importacao,
});

function Importacao() {
  const { data: sessao } = useSessao();
  const qc = useQueryClient();
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const { data: arquivos = [] } = useQuery({
    queryKey: ["arquivos"],
    queryFn: () => listarArquivosFn(),
  });

  async function enviar(files: FileList | null) {
    if (!files || !sessao) return;
    setEnviando(true);
    for (const file of Array.from(files)) {
      try {
        let leitura;
        try {
          leitura = lerRelatorio(await extrairPaginas(file));
        } catch {
          leitura = { layoutReconhecido: false, temTexto: false, totalRodape: null, linhas: [], alertasGerais: ["PDF ilegível ou corrompido."] };
        }
        const invalido = !leitura.temTexto || !leitura.layoutReconhecido;
        const form = new FormData();
        form.append("arquivo", file);
        form.append("leitura", JSON.stringify(leitura));
        const { duplicado, arquivo: arq } = await enviarArquivoFn({ data: form });
        if (duplicado || !arq) {
          toast.error(`${file.name}: arquivo idêntico já foi enviado.`);
          continue;
        }
        toast[invalido ? "warning" : "success"](`${file.name}: ${invalido ? "marcado como inválido" : `${leitura.linhas.length} linhas lidas`}`);
        if (!invalido) setSelecionado(arq.id);
      } catch (e) {
        toast.error(`${file.name}: ${erroMsg(e)}`);
      }
    }
    setEnviando(false);
    qc.invalidateQueries({ queryKey: ["arquivos"] });
  }

  if (!sessao) return null;
  if (!sessao.tem("cca")) return <SemPermissao />;
  const arquivoSelecionado = arquivos.find((a) => a.id === selecionado);

  return (
    <>
      <Cabecalho titulo="Importação e triagem" sub="Envie o PDF do relatório JR5260 do SGI, confira as linhas e confirme o cadastro.">
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <a href="/exemplo-jr5260-ficticio.pdf" download>
              <Download /> PDF fictício de teste
            </a>
          </Button>
          <Button asChild disabled={enviando}>
            <label className="cursor-pointer">
              <FileUp /> {enviando ? "Lendo…" : "Enviar PDF"}
              <input type="file" accept="application/pdf" multiple hidden onChange={(e) => { enviar(e.target.files); e.target.value = ""; }} />
            </label>
          </Button>
        </div>
      </Cabecalho>

      <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
        <div className="space-y-2">
          {arquivos.map((a) => (
            <button
              key={a.id}
              onClick={() => setSelecionado(a.id)}
              className={`w-full rounded-lg border bg-card p-3 text-left text-sm ${selecionado === a.id ? "border-primary ring-1 ring-primary" : ""}`}
            >
              <div className="truncate font-medium">{a.nome}</div>
              <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                <span>{dataBR(a.enviado_em, true)}</span>
                <Badge variant={a.situacao === "invalido" ? "destructive" : a.situacao === "confirmado" ? "secondary" : "default"}>
                  {a.situacao === "em_triagem" ? "Em triagem" : a.situacao === "confirmado" ? "Confirmado" : "Inválido"}
                </Badge>
              </div>
            </button>
          ))}
          {!arquivos.length && <p className="text-sm text-muted-foreground">Nenhum arquivo enviado.</p>}
        </div>
         {arquivoSelecionado ? (
           <Triagem key={arquivoSelecionado.id} arquivo={arquivoSelecionado} usuarioId={sessao.id} />
        ) : (
          <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">Selecione um arquivo.</p>
        )}
      </div>
    </>
  );
}

type Arquivo = { id: string; nome: string; situacao: string; total_rodape: number | null; observacao: string | null };

function Triagem({ arquivo, usuarioId }: { arquivo: Arquivo; usuarioId: string }) {
  const qc = useQueryClient();
  const [itemDescarte, setItemDescarte] = useState<{ id: string; numero: string | null } | null>(null);
  const [conferenciaAberta, setConferenciaAberta] = useState(false);
  const [totalInformado, setTotalInformado] = useState("");
  const { data: itens = [], isPending: carregandoItens, error: erroItens } = useQuery({
    queryKey: ["itens", arquivo?.id],
    enabled: !!arquivo,
    queryFn: () => listarItensFn({ data: { arquivoId: arquivo.id } }),
  });

  const salvar = useMutation({
    mutationFn: async ({ id, campo, antigo, novo }: { id: string; campo: "especie" | "numero" | "abertura" | "proprietario"; antigo: string | null; novo: string }) => {
      if ((novo.trim() || null) === antigo) return;
      await corrigirItemFn({ data: { id, campo, valor: novo.trim() } });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["itens", arquivo.id] }),
    onError: (e) => toast.error(erroMsg(e)),
  });
  const descartar = useMutation({
    mutationFn: async (id: string) => {
      await descartarItemFn({ data: { id } });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["itens", arquivo.id] });
      setItemDescarte(null);
      toast.success("Linha descartada");
    },
    onError: (e) => toast.error(erroMsg(e)),
  });
  const informarTotal = useMutation({
    mutationFn: async (total: number) => {
      await informarTotalFn({ data: { arquivoId: arquivo.id, total } });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["arquivos"] });
      toast.success("Total registrado. Confira e confirme o encaminhamento.");
    },
    onError: (e) => toast.error(erroMsg(e)),
  });
  const confirmar = useMutation({
    mutationFn: async () => {
      return confirmarArquivoFn({ data: { arquivoId: arquivo.id } });
    },
    onSuccess: (n) => {
       setConferenciaAberta(false);
      toast.success(`${n} processos cadastrados e encaminhados ao CPMA`);
      qc.invalidateQueries();
    },
    onError: (e) => toast.error(erroMsg(e)),
  });

  if (!arquivo) return null;
  const editavel = arquivo.situacao === "em_triagem";
  const total = itens.length;
  const reconciliarTotal = arquivo.total_rodape === null || arquivo.total_rodape !== total;
   const { totalOk, pendentes, contagem, invalidos, bloqueado, podeIniciar } = avaliarTriagem(itens, arquivo.total_rodape);
   const ocupado = carregandoItens || !!erroItens || salvar.isPending || descartar.isPending || informarTotal.isPending || confirmar.isPending;

  return (
    <div className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-center gap-4 rounded-lg border bg-card p-4 text-sm">
        <div><span className="text-muted-foreground">Rodapé:</span> <strong>{arquivo.total_rodape ?? "—"}</strong></div>
        <div><span className="text-muted-foreground">Lidas:</span> <strong>{total}</strong></div>
        <div><span className="text-muted-foreground">Pendentes:</span> <strong>{pendentes.length}</strong></div>
        <div><span className="text-muted-foreground">Com erro:</span> <strong className={invalidos.length ? "text-destructive" : ""}>{invalidos.length}</strong></div>
        {editavel && (
          <>
          {reconciliarTotal && <Button variant="outline" disabled={ocupado || total === 0} onClick={() => { setTotalInformado(""); setConferenciaAberta(true); }}>Conferir total do PDF</Button>}
           <Button className="ml-auto whitespace-normal text-left" disabled={!podeIniciar || ocupado} onClick={() => setConferenciaAberta(true)}>
            Confirmar cadastro e encaminhar ao CPMA
          </Button>
          </>
        )}
      </div>
       {erroItens && <p role="alert" className="text-sm text-destructive">Não foi possível carregar as linhas: {erroMsg(erroItens)}</p>}
       <AlertDialog open={!!itemDescarte} onOpenChange={(aberto) => { if (!aberto && !descartar.isPending) setItemDescarte(null); }}>
         <AlertDialogContent className="max-w-[calc(100%-2rem)] sm:max-w-lg">
           <AlertDialogHeader>
             <AlertDialogTitle>Tem certeza que deseja descartar?</AlertDialogTitle>
             <AlertDialogDescription>
               A linha {itemDescarte?.numero || "sem número"} não será cadastrada nem encaminhada ao CPMA. O PDF original e o registro do descarte serão mantidos.
             </AlertDialogDescription>
           </AlertDialogHeader>
           <AlertDialogFooter>
             <AlertDialogCancel disabled={descartar.isPending}>Cancelar</AlertDialogCancel>
             <Button variant="destructive" disabled={descartar.isPending} onClick={() => { if (itemDescarte) descartar.mutate(itemDescarte.id); }}>
               {descartar.isPending ? "Descartando…" : "Sim, descartar"}
             </Button>
           </AlertDialogFooter>
         </AlertDialogContent>
       </AlertDialog>
       <AlertDialog open={conferenciaAberta} onOpenChange={(aberto) => { if (!ocupado) setConferenciaAberta(aberto); }}>
         <AlertDialogContent className="max-w-[calc(100%-2rem)] sm:max-w-lg">
           <AlertDialogHeader>
             <AlertDialogTitle>Confirmar cadastro e encaminhamento</AlertDialogTitle>
             <AlertDialogDescription>
               {reconciliarTotal
                 ? "O total lido está ausente ou divergente. Confira no PDF original e informe o total, incluindo as linhas descartadas. Se faltarem processos na tabela, não confirme."
                 : `${total} linhas conferidas: ${pendentes.length} pendentes e ${itens.filter((i) => i.situacao === "descartado").length} descartadas. Processos já cadastrados não serão duplicados.`}
             </AlertDialogDescription>
           </AlertDialogHeader>
           {reconciliarTotal ? (
             <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); informarTotal.mutate(Number(totalInformado)); }}>
               <div className="space-y-2">
                 <Label htmlFor="total-conferencia">Total de processos impresso no relatório</Label>
                 <Input id="total-conferencia" type="number" min={1} step={1} required value={totalInformado} onChange={(e) => setTotalInformado(e.target.value)} />
                 <p className="text-sm text-muted-foreground">Linhas lidas: {total}. O total informado ficará registrado no histórico.</p>
                 {totalInformado && Number(totalInformado) !== total && <p role="alert" className="text-sm text-destructive">O total informado difere das {total} linhas lidas. Confira o PDF antes de continuar.</p>}
               </div>
               <AlertDialogFooter>
                 <AlertDialogCancel disabled={ocupado}>Cancelar</AlertDialogCancel>
                 <Button type="submit" disabled={ocupado || !totalInformado || Number(totalInformado) !== total}>Registrar total</Button>
               </AlertDialogFooter>
             </form>
           ) : (
             <AlertDialogFooter>
               <AlertDialogCancel disabled={ocupado}>Cancelar</AlertDialogCancel>
               <Button disabled={ocupado || bloqueado} onClick={() => confirmar.mutate()}>{confirmar.isPending ? "Encaminhando…" : "Confirmar e encaminhar"}</Button>
             </AlertDialogFooter>
           )}
         </AlertDialogContent>
       </AlertDialog>
      {editavel && bloqueado && (
        <div className="rounded-lg border bg-card p-3 text-sm">
          <strong>Por que não dá para confirmar:</strong>{" "}
          {arquivo.total_rodape === null
            ? "o total do rodapé não foi lido do PDF. Use Conferir total do PDF."
            : !totalOk
              ? `o rodapé indica ${arquivo.total_rodape}, mas foram lidas ${total} linhas. Confira o total no PDF original.`
              : invalidos.length
                ? `${invalidos.length} linha(s) com número, data ou duplicidade a corrigir ou descartar.`
                : "não há linhas pendentes."}
        </div>
      )}
      {arquivo.observacao && (
        <div className="space-y-1 rounded-lg border border-warning bg-warning/40 p-3 text-sm text-warning-foreground">
          {arquivo.observacao.split("\n").filter((l) => !totalOk || !/Linhas lidas .* diferem|Rodapé 'Total de Processos' não encontrado|Totais conflitantes/.test(l)).map((l) => (
            <div key={l} className="flex gap-1.5"><AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> {l}</div>
          ))}
        </div>
      )}
      {!!itens.length && (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-2 py-2">Pág/Lin</th><th className="px-2 py-2">Esp.</th><th className="px-2 py-2">Processo</th>
                <th className="px-2 py-2">Abertura</th><th className="px-2 py-2">Proprietário</th><th className="px-2 py-2">Alertas</th><th />
              </tr>
            </thead>
            <tbody>
              {itens.map((i) => {
                const ed = editavel && i.situacao === "pendente";
                const cel = (campo: "especie" | "numero" | "abertura" | "proprietario", tipo = "text", cls = "") => (
                  <input
                    key={`${i.id}-${campo}-${i[campo]}`}
                    type={tipo}
                    disabled={!ed}
                    defaultValue={i[campo] ?? ""}
                    className={`w-full rounded border border-transparent bg-transparent px-1 py-0.5 hover:border-input focus:border-ring focus:outline-none disabled:hover:border-transparent ${cls}`}
                    onBlur={(e) => salvar.mutate({ id: i.id, campo, antigo: i[campo], novo: e.target.value })}
                  />
                );
                const erroNum = !i.numero || !REGEX_NUMERO.test(i.numero);
                return (
                  <tr key={i.id} className={`border-t ${i.situacao === "descartado" ? "opacity-40" : ""}`}>
                    <td className="px-2 py-1 text-xs text-muted-foreground">{i.pagina}/{i.linha}</td>
                    <td className="w-16 px-2 py-1">{cel("especie")}</td>
                    <td className="w-56 px-2 py-1">{cel("numero", "text", `num-processo ${erroNum ? "text-destructive" : ""}`)}</td>
                    <td className="w-36 px-2 py-1">{cel("abertura", "date", !i.abertura ? "text-destructive" : "")}</td>
                    <td className="px-2 py-1">{cel("proprietario")}</td>
                    <td className="px-2 py-1 text-xs text-warning-foreground">
                      {[...i.alertas, ...((contagem.get(i.numero ?? "") ?? 0) > 1 && !i.alertas.includes("Número duplicado no arquivo") ? ["Número duplicado no arquivo"] : [])].join("; ")}
                      {i.situacao !== "pendente" && <Badge variant="outline" className="ml-1">{i.situacao}</Badge>}
                    </td>
                    <td className="px-2 py-1">
                       {ed && <Button size="sm" variant="ghost" disabled={ocupado} onClick={() => setItemDescarte({ id: i.id, numero: i.numero })}>Descartar</Button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
