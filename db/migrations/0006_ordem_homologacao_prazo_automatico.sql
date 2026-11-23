-- 1) Ordem das etapas confirmada pelo IPEM-PE (igual ao rascunho do fluxograma):
--    advogado julga → homologador homologa → Presidente assina → volta à Gerência Jurídica (gera a GRU, fase 3).
--    (A 0004 tinha implementado Presidente antes do homologador; aqui a ordem é corrigida.)
-- 2) Prazo de defesa vencido sem defesa segue sozinho para "sem defesa" (execução automática, ver
--    encerrar_prazos_vencidos). Uma defesa que chegue depois ainda pode ser registrada, marcada como fora do prazo.
-- 3) Arquivamento assinado pelo Presidente encerra o processo ("arquivado"): não há GRU.

alter type situacao_processo add value if not exists 'arquivado';

-- Ajuste dos processos que já estavam no meio do fluxo na ordem antiga.
-- Antigo "assinado_presidente" (assinado, sem homologar) → volta para homologação.
insert into eventos (processo_id, tipo, setor_origem, usuario_id, observacao)
select id, 'OBSERVACAO', 'JURIDICO', '00000000-0000-0000-0000-000000000000',
       'Ordem das etapas ajustada: o processo volta para a homologação (agora antes da assinatura do Presidente)'
  from processos where situacao = 'assinado_presidente';
update julgamentos set assinado_por = null, assinado_em = null
 where processo_id in (select id from processos where situacao = 'assinado_presidente');
update processos set situacao = 'julgado' where situacao = 'assinado_presidente';
-- Antigo "homologado" (assinado e homologado) → concluído: com a Ger. Jurídica para gerar a GRU.
update processos set situacao = 'assinado_presidente' where situacao = 'homologado';

create or replace function homologar_processo(_processo_id uuid, _obs text default null) returns void language plpgsql as $$
declare p processos; j julgamentos;
begin
  perform exigir_papel('homologador');
  select * into p from processos where id = _processo_id for update;
  if p.id is null or p.situacao <> 'julgado' then raise exception 'O processo não está aguardando homologação'; end if;
  select * into j from julgamentos where processo_id = _processo_id;
  if j.julgador_id = app_uid() then raise exception 'Quem julgou o processo não pode homologá-lo'; end if;
  update julgamentos set homologado_por = app_uid(), homologado_em = now() where processo_id = _processo_id;
  update processos set situacao = 'homologado', updated_at = now() where id = _processo_id;
  perform _evento(_processo_id, 'HOMOLOGADO', 'JURIDICO', null, nullif(trim(_obs), ''));
end $$;

create or replace function assinar_presidente(_processo_id uuid, _obs text default null) returns void language plpgsql as $$
declare p processos; j julgamentos;
begin
  perform exigir_papel('presidente');
  select * into p from processos where id = _processo_id for update;
  if p.id is null or p.situacao <> 'homologado' then
    raise exception 'O processo só pode ser assinado pelo Presidente depois da homologação';
  end if;
  select * into j from julgamentos where processo_id = _processo_id;
  update julgamentos set assinado_por = app_uid(), assinado_em = now() where processo_id = _processo_id;
  update processos set updated_at = now(),
    situacao = case when j.decisao = 'arquivamento' then 'arquivado'::situacao_processo else 'assinado_presidente'::situacao_processo end
   where id = _processo_id;
  perform _evento(_processo_id, 'ASSINADO_PRESIDENTE', 'JURIDICO', null,
    coalesce(nullif(trim(_obs), '') || '. ', '')
    || (case when j.decisao = 'arquivamento' then 'Arquivamento: processo encerrado, sem GRU.'
             else 'Retorna à Gerência Jurídica para gerar a GRU.' end));
end $$;

-- Homologador (antes de homologar) ou Presidente (antes de assinar) devolvem ao advogado, com justificativa.
create or replace function devolver_julgamento(_processo_id uuid, _obs text) returns void language plpgsql as $$
declare p processos;
begin
  if _obs is null or length(trim(_obs)) < 5 then raise exception 'A devolução exige uma justificativa'; end if;
  select * into p from processos where id = _processo_id for update;
  if p.id is null then raise exception 'Processo não encontrado'; end if;
  if p.situacao = 'julgado' then perform exigir_papel('homologador');
  elsif p.situacao = 'homologado' then perform exigir_papel('presidente');
  else raise exception 'O processo não está em etapa de homologação ou assinatura'; end if;
  update julgamentos set assinado_por = null, assinado_em = null, homologado_por = null, homologado_em = null
   where processo_id = _processo_id;
  update processos set situacao = 'julgamento_devolvido', updated_at = now() where id = _processo_id;
  perform _evento(_processo_id, 'DEVOLVIDO', 'JURIDICO', 'JURIDICO', 'Devolvido ao julgamento: ' || trim(_obs));
end $$;

-- Defesa que chega depois do encerramento automático ainda é registrada (até haver julgamento).
create or replace function registrar_defesa(_processo_id uuid, _data date, _obs text default null) returns void language plpgsql as $$
declare p processos; fora boolean;
begin
  perform exigir_papel('juridico');
  select * into p from processos where id = _processo_id for update;
  if p.id is null or p.situacao not in ('aguardando_defesa', 'sem_defesa') then
    raise exception 'O processo não está no prazo de defesa';
  end if;
  if _data is null or _data > hoje() then raise exception 'Informe a data de protocolo da defesa (não pode ser futura)'; end if;
  if _data < p.ciencia_em then raise exception 'A defesa não pode ser anterior à ciência (%)', _dmy(p.ciencia_em); end if;
  fora := _data > p.vencimento_defesa;
  update processos set defesa_em = _data, situacao = 'com_defesa', updated_at = now() where id = _processo_id;
  perform _evento(_processo_id, 'DEFESA_REGISTRADA', 'JURIDICO', null,
    'Defesa protocolada em ' || _dmy(_data) || (case when fora then ' — FORA DO PRAZO (venceu em ' || _dmy(p.vencimento_defesa) || ')' else '' end)
    || coalesce('. ' || nullif(trim(_obs), ''), ''));
end $$;

-- Passado o prazo sem defesa, o processo segue sozinho. Registrado no histórico como ação do "Sistema"
-- (id fixo 00000000-0000-0000-0000-000000000000). Chamada pelo servidor sempre que processos são listados/abertos.
create function encerrar_prazos_vencidos() returns int language plpgsql as $$
declare n int;
begin
  with v as (
    update processos set situacao = 'sem_defesa', updated_at = now()
     where situacao = 'aguardando_defesa' and vencimento_defesa < hoje()
    returning id, vencimento_defesa
  ), i as (
    insert into eventos (processo_id, tipo, setor_origem, usuario_id, observacao)
    select id, 'PRAZO_ENCERRADO', 'JURIDICO', '00000000-0000-0000-0000-000000000000',
           'Prazo de defesa encerrado em ' || _dmy(vencimento_defesa) || ' sem defesa (automático)'
      from v
    returning 1
  )
  select count(*) into n from i;
  return n;
end $$;
