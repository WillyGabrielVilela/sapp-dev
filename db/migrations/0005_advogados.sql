-- Perfil "advogado": quem julga. Por padrão julga TODAS as espécies; os homologadores (que também são
-- advogados) podem restringir cada advogado a certas espécies. Sem nenhuma espécie marcada = todas.
-- Atenção: quem hoje tem só o perfil "juridico" deixa de poder julgar até receber o perfil "advogado".

alter type app_role add value if not exists 'advogado';

create or replace function definir_especies_julgador(_user_id uuid, _especies text[]) returns void language plpgsql as $$
begin
  perform exigir_papel('homologador');
  if not has_role(_user_id, 'advogado') then raise exception 'Só usuários com o perfil Advogado julgam'; end if;
  if exists (select 1 from unnest(coalesce(_especies, '{}')) e where not exists (select 1 from especies where codigo = e)) then
    raise exception 'Espécie inexistente';
  end if;
  delete from julgadores_especies where usuario_id = _user_id;
  insert into julgadores_especies (usuario_id, especie) select distinct _user_id, e from unnest(coalesce(_especies, '{}')) e;
end $$;

create or replace function julgar_processo(_processo_id uuid, _decisao decisao_julgamento, _valor numeric, _fundamentacao text)
returns void language plpgsql as $$
declare p processos; fund text := trim(coalesce(_fundamentacao, ''));
begin
  perform exigir_papel('advogado');
  select * into p from processos where id = _processo_id for update;
  if p.id is null or p.setor_atual <> 'JURIDICO' or p.setor_destino is not null
     or p.situacao not in ('com_defesa', 'sem_defesa', 'julgamento_devolvido') then
    raise exception 'O processo não está apto para julgamento';
  end if;
  if p.especie is null then raise exception 'O processo não tem espécie: corrija antes de julgar'; end if;
  if exists (select 1 from julgadores_especies where usuario_id = app_uid())
     and not exists (select 1 from julgadores_especies where usuario_id = app_uid() and especie = p.especie) then
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
