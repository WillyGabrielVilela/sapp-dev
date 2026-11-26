import type { CanalNotificacao, Papel, Processo, ResultadoNotificacao, Situacao, SetorTecnico } from "./tipos";

export type { Papel, Processo, Situacao, SetorTecnico };

export const PAPEIS: { valor: Papel; rotulo: string }[] = [
  { valor: "cca", rotulo: "CCA" },
  { valor: "cpma", rotulo: "CPMA" },
  { valor: "juridico", rotulo: "Jurídico administrativo" },
  { valor: "advogado", rotulo: "Jurídico — advogado" },
  { valor: "homologador", rotulo: "Homologador" },
  { valor: "gestao", rotulo: "Gestão" },
  { valor: "admin", rotulo: "Administrador" },
];

/** Perfil em desuso: o Presidente não usa o sistema (os homologadores registram a assinatura). Mantido só para exibir contas antigas. */
export const ROTULO_PRESIDENTE = "Presidente (em desuso)";

export const SITUACAO: Record<Situacao, string> = {
  aguardando_cpma: "Aguardando recebimento (CPMA)",
  em_conferencia_cpma: "Em conferência e digitalização",
  pronto_juridico: "Pronto para o Jurídico",
  aguardando_juridico: "Aguardando recebimento (Jurídico)",
  recebido_juridico: "Recebido pelo Jurídico",
  aguardando_cca: "Devolvido — aguardando recebimento (CCA)",
  em_correcao_cca: "Em correção no CCA",
  protocolado_juridico: "Protocolado — aguardando notificação",
  notificacao_enviada: "Notificação enviada — aguardando entrega",
  notificacao_frustrada: "Notificação não entregue — reenviar",
  aguardando_defesa: "Aguardando defesa (prazo correndo)",
  com_defesa: "Com defesa — aguardando julgamento",
  sem_defesa: "Sem defesa — aguardando julgamento",
  julgamento_devolvido: "Devolvido ao julgamento",
  julgado: "Julgado — aguardando homologação",
  homologado: "Homologado — aguardando assinatura do Presidente",
  assinado_presidente: "Assinado — com a Ger. Jurídica para gerar a GRU",
  arquivado: "Arquivado",
  gru_gerada: "GRU registrada — a classificar (pago, recurso ou não pago)",
  pago: "Pago",
  em_recurso: "Em recurso — instância superior do Inmetro",
  nao_pago: "Não pago — em listagem de dívida ativa",
};

export const SETOR_TECNICO: Record<SetorTecnico, string> = {
  METROLOGIA: "Metrologia",
  QUALIDADE: "Qualidade",
  PRE_EMBALADOS: "Pré-embalados",
};

export const SETOR: Record<string, string> = { CCA: "CCA", CPMA: "CPMA", JURIDICO: "Jurídico" };

export const EVENTO: Record<string, string> = {
  IMPORTADO: "Importado",
  CONFERIDO: "Conferido",
  ENCAMINHADO: "Encaminhado",
  RECEBIDO: "Recebido",
  DIGITALIZADO: "Digitalização registrada",
  FISCAL_INFORMADO: "Fiscal informado",
  DEVOLVIDO: "Devolvido",
  OBSERVACAO: "Observação",
  CORRECAO: "Correção",
  PROTOCOLADO: "Protocolado",
  NOTIFICADO: "Notificação enviada",
  CIENCIA_REGISTRADA: "Ciência registrada",
  NOTIFICACAO_FRUSTRADA: "Notificação não entregue",
  DEFESA_REGISTRADA: "Defesa registrada",
  PRAZO_ENCERRADO: "Prazo de defesa encerrado",
  JULGADO: "Julgado",
  ASSINADO_PRESIDENTE: "Assinado pelo Presidente",
  HOMOLOGADO: "Homologado",
  GRU_REGISTRADA: "GRU registrada",
  PAGAMENTO_REGISTRADO: "Pagamento registrado",
  RECURSO_REGISTRADO: "Recurso registrado",
  CLASSIFICADO_NAO_PAGO: "Classificado como não pago",
};

export const CANAL: Record<CanalNotificacao, string> = {
  correios: "Correios",
  whatsapp: "WhatsApp institucional",
  doe: "Diário Oficial (DOE)",
  em_maos: "Entrega em mãos",
};

export const RESULTADO: Record<ResultadoNotificacao, string> = {
  pendente: "Aguardando desfecho",
  entregue: "Entregue",
  devolvido: "Devolvido",
  recusado: "Recusado",
  mudou_se: "Mudou-se",
};

/** Legenda curta das listas de saída (relatório 002/RC): E, D, R, M. */
export const RESULTADO_SIGLA: Record<ResultadoNotificacao, string> = {
  pendente: "—",
  entregue: "E",
  devolvido: "D",
  recusado: "R",
  mudou_se: "M",
};

export function dataBR(iso: string | null | undefined, comHora = false) {
  if (!iso) return "—";
  const d = new Date(iso.length === 10 ? iso + "T12:00:00" : iso);
  return comHora ? d.toLocaleString("pt-BR") : d.toLocaleDateString("pt-BR");
}

export function erroMsg(e: unknown) {
  if (e && typeof e === "object" && "message" in e) return String((e as { message: string }).message);
  return "Erro inesperado";
}

/** Repositório do SGI em que o processo deveria constar (para a auditoria do SGI sobre o SAPP). A CONFIRMAR com o Inmetro. */
export function sgiEsperado(situacao: Situacao): string {
  switch (situacao) {
    case "aguardando_cpma":
    case "em_conferencia_cpma":
    case "pronto_juridico":
    case "aguardando_juridico":
    case "aguardando_cca":
    case "em_correcao_cca":
      return "Processos cadastrados (digitalização pelo CPMA)";
    case "recebido_juridico":
    case "protocolado_juridico":
    case "notificacao_enviada":
    case "notificacao_frustrada":
      return "Processos analisados (visto pelo Jurídico → carta de autuação)";
    case "aguardando_defesa":
      return "Processos analisados — ciência registrada, em prazo de defesa";
    case "com_defesa":
    case "sem_defesa":
    case "julgamento_devolvido":
    case "julgado":
      return "Processos aptos para julgamento";
    case "homologado":
    case "assinado_presidente":
    case "arquivado":
    case "gru_gerada":
    case "pago":
    case "em_recurso":
    case "nao_pago":
      return "A definir com o Inmetro (pós-julgamento)";
  }
}
