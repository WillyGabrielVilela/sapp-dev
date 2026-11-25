// Tipos de domínio do SAPP (substituem os tipos gerados pelo Supabase).
// Devem acompanhar db/migrations/*.sql. Datas "date" chegam como "YYYY-MM-DD"; timestamps, como ISO 8601.

export type Papel = "cca" | "cpma" | "juridico" | "gestao" | "admin" | "presidente" | "homologador" | "advogado";
export type SetorCodigo = "CCA" | "CPMA" | "JURIDICO";
export type SetorTecnico = "METROLOGIA" | "QUALIDADE" | "PRE_EMBALADOS";

export type Situacao =
  | "aguardando_cpma"
  | "em_conferencia_cpma"
  | "pronto_juridico"
  | "aguardando_juridico"
  | "recebido_juridico"
  | "aguardando_cca"
  | "em_correcao_cca"
  | "protocolado_juridico"
  | "notificacao_enviada"
  | "notificacao_frustrada"
  | "aguardando_defesa"
  | "com_defesa"
  | "sem_defesa"
  | "julgamento_devolvido"
  | "julgado"
  | "assinado_presidente"
  | "homologado"
  | "arquivado"
  | "gru_gerada"
  | "pago"
  | "em_recurso"
  | "nao_pago";

export type TipoEvento =
  | "IMPORTADO"
  | "CONFERIDO"
  | "ENCAMINHADO"
  | "RECEBIDO"
  | "DIGITALIZADO"
  | "FISCAL_INFORMADO"
  | "DEVOLVIDO"
  | "OBSERVACAO"
  | "CORRECAO"
  | "PROTOCOLADO"
  | "NOTIFICADO"
  | "CIENCIA_REGISTRADA"
  | "NOTIFICACAO_FRUSTRADA"
  | "DEFESA_REGISTRADA"
  | "PRAZO_ENCERRADO"
  | "JULGADO"
  | "ASSINADO_PRESIDENTE"
  | "HOMOLOGADO"
  | "GRU_REGISTRADA"
  | "PAGAMENTO_REGISTRADO"
  | "RECURSO_REGISTRADO"
  | "CLASSIFICADO_NAO_PAGO";

export type CanalNotificacao = "correios" | "whatsapp" | "doe" | "em_maos";
export type ResultadoNotificacao = "pendente" | "entregue" | "devolvido" | "recusado" | "mudou_se";

export type Processo = {
  id: string;
  numero: string;
  abertura: string | null;
  especie: string | null;
  proprietario: string | null;
  setor_autuante: SetorTecnico | null;
  setor_atual: SetorCodigo;
  setor_destino: SetorCodigo | null;
  responsavel_atual: string | null;
  situacao: Situacao;
  fiscal_id: string | null;
  digitalizado_por: string | null;
  digitalizado_em: string | null;
  arquivo_id: string | null;
  created_at: string;
  updated_at: string;
  numero_ai: string | null;
  documento_autuado: string | null;
  nome_fantasia: string | null;
  bairro: string | null;
  protocolo_juridico: string | null;
  protocolado_em: string | null;
  protocolado_por: string | null;
  ciencia_em: string | null;
  vencimento_defesa: string | null;
  defesa_em: string | null;
};

export type Evento = {
  id: number;
  processo_id: string;
  tipo: TipoEvento;
  setor_origem: SetorCodigo | null;
  setor_destino: SetorCodigo | null;
  usuario_id: string;
  observacao: string | null;
  criado_em: string;
};

export type Fiscal = {
  id: string;
  nome: string;
  matricula: string;
  setor_tecnico: SetorTecnico;
  especies: string[];
  ativo: boolean;
  created_at: string;
};

export type Especie = { codigo: string; descricao: string; created_at: string };

export type ArquivoOriginal = {
  id: string;
  nome: string;
  sha256: string;
  caminho: string;
  layout: string | null;
  situacao: string;
  total_rodape: number | null;
  total_lido: number;
  observacao: string | null;
  enviado_por: string;
  enviado_em: string;
};

export type ItemImportado = {
  id: string;
  arquivo_id: string;
  pagina: number;
  linha: number;
  especie: string | null;
  numero: string | null;
  abertura: string | null;
  abertura_texto: string | null;
  proprietario: string | null;
  alertas: string[];
  situacao: string;
  processo_id: string | null;
  created_at: string;
};

export type Notificacao = {
  id: string;
  processo_id: string;
  lista_id: string;
  canal: CanalNotificacao;
  data_saida: string;
  resultado: ResultadoNotificacao;
  data_resultado: string | null;
  recebedor: string | null;
  observacao: string | null;
  criada_por: string;
  criada_em: string;
  resultado_por: string | null;
  resultado_em: string | null;
};

export type ListaSaida = {
  id: string;
  data: string;
  numero_dia: number;
  canal: CanalNotificacao;
  titulo: string | null;
  criada_por: string;
  criada_em: string;
};

export type ListaSaidaResumo = ListaSaida & { total: number; pendentes: number };

/** Linha da lista de saída: a notificação + os dados do processo que a lista impressa precisa mostrar. */
export type ItemLista = Notificacao & {
  numero: string;
  numero_ai: string | null;
  proprietario: string | null;
  nome_fantasia: string | null;
  documento_autuado: string | null;
  bairro: string | null;
};

export type Sessao = { id: string; email: string; nome: string; papeis: Papel[] };
export type UsuarioAdmin = { id: string; nome: string; email: string; papeis: Papel[] };

export type DecisaoJulgamento = "multa" | "arquivamento";
export type Julgamento = {
  processo_id: string;
  julgador_id: string;
  decisao: DecisaoJulgamento;
  valor_multa: string | null; // numeric chega como texto, ex.: "1234.50"
  fundamentacao: string;
  julgado_em: string;
  assinado_por: string | null;
  assinado_em: string | null;
  homologado_por: string | null;
  homologado_em: string | null;
};
export type JulgadorEspecies = { id: string; nome: string; email: string; especies: string[] }; // especies vazio = julga todas (padrão)

export type ResultadoLote = { feitos: number; falhas: { numero: string; motivo: string }[] };

export type Gru = {
  processo_id: string;
  numero_gru: string;
  valor: string; // numeric chega como texto
  desconto_percentual: number;
  valor_com_desconto: string;
  vencimento: string;
  emitida_em: string;
  emitida_por: string;
  pago_em: string | null;
  valor_pago: string | null;
  pago_com_desconto: boolean | null;
  pagamento_obs: string | null;
};
export type Recurso = { processo_id: string; data_recurso: string; observacao: string | null; registrado_em: string };
/** Linha da classificação das GRUs: processo + dados da guia. */
export type LinhaGru = {
  processo_id: string;
  numero: string;
  numero_ai: string | null;
  proprietario: string | null;
  documento_autuado: string | null;
  situacao: Situacao;
  numero_gru: string;
  valor: string;
  valor_com_desconto: string;
  vencimento: string;
  pago_em: string | null;
  valor_pago: string | null;
  recurso_em: string | null;
  atualizado_em: string;
};
export type Parametro = { chave: string; valor: string };
