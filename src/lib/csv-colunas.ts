import type { Coluna } from "./csv";
import { formatarDocumento } from "./documento";
import { CANAL, dataBR, RESULTADO, SETOR, SITUACAO } from "./rotulos";
import type { ItemLista, LinhaGru, Processo } from "./tipos";

const doc = (v: string | null) => (v ? formatarDocumento(v) : "");

export const COLUNAS_PROCESSO: Coluna<Processo>[] = [
  { titulo: "Processo", valor: (p) => p.numero },
  { titulo: "AI", valor: (p) => p.numero_ai },
  { titulo: "Autuado", valor: (p) => p.proprietario },
  { titulo: "Nome fantasia", valor: (p) => p.nome_fantasia },
  { titulo: "CPF/CNPJ", valor: (p) => doc(p.documento_autuado) },
  { titulo: "Espécie", valor: (p) => p.especie },
  { titulo: "Bairro", valor: (p) => p.bairro },
  { titulo: "Abertura", valor: (p) => (p.abertura ? dataBR(p.abertura) : "") },
  { titulo: "Setor atual", valor: (p) => SETOR[p.setor_atual] },
  { titulo: "Situação", valor: (p) => SITUACAO[p.situacao] },
  { titulo: "Protocolo do Jurídico", valor: (p) => p.protocolo_juridico },
  { titulo: "Ciência da notificação", valor: (p) => (p.ciencia_em ? dataBR(p.ciencia_em) : "") },
  { titulo: "Prazo de defesa até", valor: (p) => (p.vencimento_defesa ? dataBR(p.vencimento_defesa) : "") },
  { titulo: "Defesa em", valor: (p) => (p.defesa_em ? dataBR(p.defesa_em) : "") },
  { titulo: "Atualizado em", valor: (p) => dataBR(p.updated_at, true) },
];

export const COLUNAS_GRU: Coluna<LinhaGru>[] = [
  { titulo: "Processo", valor: (l) => l.numero },
  { titulo: "AI", valor: (l) => l.numero_ai },
  { titulo: "Autuado", valor: (l) => l.proprietario },
  { titulo: "CPF/CNPJ", valor: (l) => doc(l.documento_autuado) },
  { titulo: "Situação", valor: (l) => SITUACAO[l.situacao] },
  { titulo: "GRU", valor: (l) => l.numero_gru },
  { titulo: "Vencimento", valor: (l) => dataBR(l.vencimento) },
  { titulo: "Valor da multa (R$)", valor: (l) => Number(l.valor).toFixed(2).replace(".", ",") },
  { titulo: "Valor à vista (R$)", valor: (l) => Number(l.valor_com_desconto).toFixed(2).replace(".", ",") },
  { titulo: "Pago em", valor: (l) => (l.pago_em ? dataBR(l.pago_em) : "") },
  { titulo: "Valor pago (R$)", valor: (l) => (l.valor_pago ? Number(l.valor_pago).toFixed(2).replace(".", ",") : "") },
  { titulo: "Recurso em", valor: (l) => (l.recurso_em ? dataBR(l.recurso_em) : "") },
];

export const COLUNAS_LISTA: Coluna<ItemLista>[] = [
  { titulo: "Processo", valor: (i) => i.numero },
  { titulo: "AI", valor: (i) => i.numero_ai },
  { titulo: "Razão social", valor: (i) => i.proprietario },
  { titulo: "Nome fantasia", valor: (i) => i.nome_fantasia },
  { titulo: "CPF/CNPJ", valor: (i) => doc(i.documento_autuado) },
  { titulo: "Bairro", valor: (i) => i.bairro },
  { titulo: "Canal", valor: (i) => CANAL[i.canal] },
  { titulo: "Saída", valor: (i) => dataBR(i.data_saida) },
  { titulo: "Desfecho", valor: (i) => RESULTADO[i.resultado] },
  { titulo: "Data do desfecho", valor: (i) => (i.data_resultado ? dataBR(i.data_resultado) : "") },
  { titulo: "Recebedor", valor: (i) => i.recebedor },
];
