-- SAPP · Jurídico, fase 2A: julgamento → assinatura do Presidente → homologação.
--
-- Regras confirmadas pelo IPEM-PE:
--  * advogados julgam por espécie; o advogado decide e atribui o valor da multa;
--  * o Presidente assina; a homologação só acontece depois da assinatura do Presidente
--    (por usuários com essa atribuição) — nesta ordem, que difere do rascunho do fluxograma;
--  * sem defesa e com defesa seguem o mesmo caminho de julgamento (premissa, a confirmar).
-- Fica de fora (próximas fases): guia GRU (30% de desconto à vista), Correios, recurso à instância
-- superior do Inmetro (prazo ainda indefinido) e dívida ativa.

alter type app_role add value if not exists 'presidente';
alter type app_role add value if not exists 'homologador';

alter type situacao_processo add value if not exists 'julgamento_devolvido';
alter type situacao_processo add value if not exists 'julgado';
alter type situacao_processo add value if not exists 'assinado_presidente';
alter type situacao_processo add value if not exists 'homologado';

alter type tipo_evento add value if not exists 'JULGADO';
alter type tipo_evento add value if not exists 'ASSINADO_PRESIDENTE';
alter type tipo_evento add value if not exists 'HOMOLOGADO';

create type decisao_julgamento as enum ('multa', 'arquivamento');

-- "Divide por espécie": quais espécies cada advogado julga
create table julgadores_especies (
  usuario_id uuid not null references usuarios(id) on delete cascade,
  especie text not null,
  primary key (usuario_id, especie)
);

-- uma linha por processo (vigente). O histórico completo, inclusive revisões, fica em eventos (imutável).
create table julgamentos (
  processo_id uuid primary key references processos(id),
  julgador_id uuid not null,
  decisao decisao_julgamento not null,
  valor_multa numeric(12, 2),
  fundamentacao text not null,
  julgado_em timestamptz not null default now(),
  assinado_por uuid,
  assinado_em timestamptz,
  homologado_por uuid,
  homologado_em timestamptz,
  constraint julgamento_valor_confere check (
    (decisao = 'multa' and valor_multa is not null and valor_multa > 0)
    or (decisao = 'arquivamento' and valor_multa is null))
);

create function _brl(_v numeric) returns text language sql immutable as $$
  select 'R$ ' || replace(to_char(_v, 'FM999999990.00'), '.', ',')
$$;

create function definir_especies_julgador(_user_id uuid, _especies text[]) returns void language plpgsql as $$
begin
  perform exigir_papel('admin');
  if not has_role(_user_id, 'juridico') then raise exception 'Só usuários com o perfil Jurídico julgam'; end if;
  if exists (select 1 from unnest(_especies) e where not exists (select 1 from especies where codigo = e)) then
    raise exception 'Espécie inexistente';
  end if;
  delete from julgadores_especies where usuario_id = _user_id;
  insert into julgadores_especies (usuario_id, especie) select distinct _user_id, e from unnest(_especies) e;
end $$;

create function julgar_processo(_processo_id uuid, _decisao decisao_julgamento, _valor numeric, _fundamentacao text)
returns void language plpgsql as $$
declare p processos; fund text := trim(coalesce(_fundamentacao, ''));
begin
  perform exigir_papel('juridico');
  select * into p from processos where id = _processo_id for update;
  if p.id is null or p.setor_atual <> 'JURIDICO' or p.setor_destino is not null
     or p.situacao not in ('com_defesa', 'sem_defesa', 'julgamento_devolvido') then
    raise exception 'O processo não está apto para julgamento';
  end if;
  if p.especie is null then raise exception 'O processo não tem espécie: corrija antes de julgar'; end if;
  if not exists (select 1 from julgadores_especies where usuario_id = app_uid() and especie = p.especie) then
    raise exception 'Você não está designado para julgar a espécie %', p.especie;
  end if;
  if length(fund) < 10 then raise exception 'Informe a fundamentação da decisão'; end if;
  if _decisao = 'multa' and (_valor is null or _valor <= 0) then raise exception 'Informe o valor da multa'; end if;
  if _decisao = 'arquivamento' and _valor is not null then raise exception 'Arquivamento não tem valor de multa'; end if;

  insert into julgamentos (processo_id, julgador_id, decisao, valor_multa, fundamentacao)
  values (_processo_id, app_uid(), _decisao, _valor, fund)
  on conflict (processo_id) do update set julgador_id = app_uid(), decisao = excluded.decisao,
    valor_multa = excluded.valor_multa, fundamentacao = excluded.fundamentacao, julgado_em = now(),
    assinado_por = null, assinado_em = null, homologado_por = null, homologado_em = null;
  update processos set situacao = 'julgado', updated_at = now() where id = _processo_id;
  perform _evento(_processo_id, 'JULGADO', 'JURIDICO', null,
    (case _decisao when 'multa' then 'Decisão: multa de ' || _brl(_valor) else 'Decisão: arquivamento' end)
    || '. Fundamentação: ' || fund);
end $$;

create function assinar_presidente(_processo_id uuid, _obs text default null) returns void language plpgsql as $$
declare p processos;
begin
  perform exigir_papel('presidente');
  select * into p from processos where id = _processo_id for update;
  if p.id is null or p.situacao <> 'julgado' then raise exception 'O processo não está aguardando a assinatura do Presidente'; end if;
  update julgamentos set assinado_por = app_uid(), assinado_em = now() where processo_id = _processo_id;
  update processos set situacao = 'assinado_presidente', updated_at = now() where id = _processo_id;
  perform _evento(_processo_id, 'ASSINADO_PRESIDENTE', 'JURIDICO', null, nullif(trim(_obs), ''));
end $$;

create function homologar_processo(_processo_id uuid, _obs text default null) returns void language plpgsql as $$
declare p processos; j julgamentos;
begin
  perform exigir_papel('homologador');
  select * into p from processos where id = _processo_id for update;
  if p.id is null or p.situacao <> 'assinado_presidente' then
    raise exception 'O processo só pode ser homologado depois da assinatura do Presidente';
  end if;
  select * into j from julgamentos where processo_id = _processo_id;
  if j.julgador_id = app_uid() then raise exception 'Quem julgou o processo não pode homologá-lo'; end if;
  update julgamentos set homologado_por = app_uid(), homologado_em = now() where processo_id = _processo_id;
  update processos set situacao = 'homologado', updated_at = now() where id = _processo_id;
  perform _evento(_processo_id, 'HOMOLOGADO', 'JURIDICO', null, nullif(trim(_obs), ''));
end $$;

-- Presidente (antes de assinar) ou homologador (antes de homologar) devolvem ao julgador, com justificativa.
create function devolver_julgamento(_processo_id uuid, _obs text) returns void language plpgsql as $$
declare p processos;
begin
  if _obs is null or length(trim(_obs)) < 5 then raise exception 'A devolução exige uma justificativa'; end if;
  select * into p from processos where id = _processo_id for update;
  if p.id is null then raise exception 'Processo não encontrado'; end if;
  if p.situacao = 'julgado' then perform exigir_papel('presidente');
  elsif p.situacao = 'assinado_presidente' then perform exigir_papel('homologador');
  else raise exception 'O processo não está em etapa de assinatura ou homologação'; end if;
  update julgamentos set assinado_por = null, assinado_em = null where processo_id = _processo_id;
  update processos set situacao = 'julgamento_devolvido', updated_at = now() where id = _processo_id;
  perform _evento(_processo_id, 'DEVOLVIDO', 'JURIDICO', 'JURIDICO', 'Devolvido ao julgamento: ' || trim(_obs));
end $$;
