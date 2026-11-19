-- SAPP · esquema base (PostgreSQL 13+, sem dependência de Supabase/Lovable).
--
-- Consolida as migrações 0000–0003 do esquema anterior. Diferenças:
--  * auth.users + profiles  →  public.usuarios (login próprio) + public.sessoes
--  * auth.uid()             →  public.app_uid(), lido de set_config('app.user_id', …) por transação
--  * sem RLS, sem GRANT para roles do Supabase: o navegador NÃO acessa o banco; só o servidor do SAPP,
--    que valida o perfil (papel) em cada operação. As regras de tramitação continuam nas funções SQL.
--  * funções deixam de ser SECURITY DEFINER (não há mais um papel "authenticated" separado do dono).

create type app_role as enum ('cca','cpma','juridico','gestao','admin');
create type setor as enum ('CCA','CPMA','JURIDICO');
create type setor_tecnico as enum ('METROLOGIA','QUALIDADE','PRE_EMBALADOS');
create type situacao_processo as enum (
  'aguardando_cpma','em_conferencia_cpma','pronto_juridico','aguardando_juridico',
  'recebido_juridico','aguardando_cca','em_correcao_cca'
);
create type tipo_evento as enum (
  'IMPORTADO','CONFERIDO','ENCAMINHADO','RECEBIDO','DIGITALIZADO','FISCAL_INFORMADO',
  'DEVOLVIDO','OBSERVACAO','CORRECAO'
);

-- ===== usuário corrente (definido pelo servidor em cada transação) =====
create function app_uid() returns uuid language sql stable as $$
  select nullif(current_setting('app.user_id', true), '')::uuid
$$;

-- ===== usuários e sessões =====
create table usuarios (
  id uuid primary key default gen_random_uuid(),
  nome text not null default '',
  email text not null,
  senha_hash text not null,
  ativo boolean not null default true,
  falhas_login int not null default 0,
  bloqueado_ate timestamptz,
  ultimo_acesso timestamptz,
  created_at timestamptz not null default now()
);
create unique index usuarios_email_uq on usuarios (lower(email));

create table sessoes (
  token_hash text primary key,            -- SHA-256 do token do cookie; o token em si nunca é guardado
  usuario_id uuid not null references usuarios(id) on delete cascade,
  criada_em timestamptz not null default now(),
  expira_em timestamptz not null
);
create index sessoes_usuario_idx on sessoes (usuario_id);
create index sessoes_expira_idx on sessoes (expira_em);

create table user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references usuarios(id) on delete cascade,
  role app_role not null,
  unique (user_id, role)
);

create function has_role(_user_id uuid, _role app_role) returns boolean
language sql stable as $$
  select exists (select 1 from user_roles where user_id = _user_id and role = _role)
$$;

create function has_any_role(_user_id uuid, _roles app_role[]) returns boolean
language sql stable as $$
  select exists (select 1 from user_roles where user_id = _user_id and role = any(_roles))
$$;

create function exigir_papel(_role app_role) returns void language plpgsql as $$
begin
  if app_uid() is null or not has_role(app_uid(), _role) then
    raise exception 'Permissão negada';
  end if;
end $$;

-- O primeiro usuário cadastrado vira administrador (trava para evitar dois "primeiros" simultâneos).
create function criar_usuario(_nome text, _email text, _senha_hash text) returns uuid
language plpgsql as $$
declare uid uuid;
begin
  perform pg_advisory_xact_lock(hashtext('sapp:criar_usuario'));
  if exists (select 1 from usuarios where lower(email) = lower(_email)) then
    raise exception 'Este e-mail já está cadastrado';
  end if;
  insert into usuarios (nome, email, senha_hash) values (coalesce(_nome, ''), _email, _senha_hash)
  returning id into uid;
  if not exists (select 1 from user_roles where role = 'admin') then
    insert into user_roles (user_id, role) values (uid, 'admin');
  end if;
  return uid;
end $$;

create function definir_papeis(_user_id uuid, _roles app_role[]) returns void language plpgsql as $$
begin
  perform exigir_papel('admin');
  if _user_id = app_uid() and not ('admin' = any(_roles)) then
    raise exception 'Você não pode remover seu próprio papel de administrador';
  end if;
  delete from user_roles where user_id = _user_id;
  insert into user_roles (user_id, role) select _user_id, unnest(_roles);
end $$;

create function listar_usuarios()
returns table(id uuid, nome text, email text, papeis app_role[]) language sql stable as $$
  select u.id, u.nome, u.email, coalesce(array_agg(ur.role) filter (where ur.role is not null), '{}')
  from usuarios u left join user_roles ur on ur.user_id = u.id
  where has_role(app_uid(), 'admin')
  group by u.id order by u.nome;
$$;

-- ===== cadastros de apoio =====
create table especies (
  codigo text primary key,
  descricao text not null default '',
  created_at timestamptz not null default now()
);

-- fiscais nunca são excluídos, apenas inativados
create table fiscais (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  matricula text not null unique,
  setor_tecnico setor_tecnico not null,
  especies text[] not null default '{}',
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

-- ===== importação do JR5260 =====
create table arquivos_originais (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  sha256 text not null unique,
  caminho text not null,                       -- chave no armazenamento (disco local ou bucket S3)
  layout text,
  situacao text not null default 'em_triagem', -- em_triagem | confirmado | invalido
  total_rodape int,
  total_lido int not null default 0,
  observacao text,
  enviado_por uuid not null,
  enviado_em timestamptz not null default now()
);

create table itens_importados (
  id uuid primary key default gen_random_uuid(),
  arquivo_id uuid not null references arquivos_originais(id),
  pagina int not null,
  linha int not null,
  especie text,
  numero text,
  abertura date,
  abertura_texto text,
  proprietario text,
  alertas text[] not null default '{}',
  situacao text not null default 'pendente',   -- pendente | confirmado | descartado
  processo_id uuid,
  created_at timestamptz not null default now()
);
create index itens_arquivo_idx on itens_importados (arquivo_id, pagina, linha);

-- ===== processos (escrita somente pelas funções de tramitação) =====
create table processos (
  id uuid primary key default gen_random_uuid(),
  numero text not null unique,
  abertura date,
  especie text,
  proprietario text,
  setor_autuante setor_tecnico,
  setor_atual setor not null,
  setor_destino setor,
  responsavel_atual uuid,
  situacao situacao_processo not null,
  fiscal_id uuid references fiscais(id),
  digitalizado_por uuid,
  digitalizado_em timestamptz,
  arquivo_id uuid references arquivos_originais(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index processos_setor_idx on processos (setor_atual, setor_destino);
create index processos_situacao_idx on processos (situacao);
create index processos_updated_idx on processos (updated_at desc);

-- ===== trilha de auditoria (somente inclusão) =====
create table eventos (
  id bigint generated always as identity primary key,
  processo_id uuid not null references processos(id),
  tipo tipo_evento not null,
  setor_origem setor,
  setor_destino setor,
  usuario_id uuid not null,
  observacao text,
  criado_em timestamptz not null default now()
);
create index eventos_processo_idx on eventos (processo_id, criado_em);

create function bloquear_alteracao() returns trigger language plpgsql as $$
begin raise exception 'Registros de histórico não podem ser editados nem apagados'; end $$;
create trigger eventos_imutaveis before update or delete on eventos
  for each row execute function bloquear_alteracao();

create table correcoes (
  id bigint generated always as identity primary key,
  item_id uuid references itens_importados(id),
  processo_id uuid references processos(id),
  campo text not null,
  valor_antigo text,
  valor_novo text,
  usuario_id uuid not null,
  criado_em timestamptz not null default now()
);
create trigger correcoes_imutaveis before update or delete on correcoes
  for each row execute function bloquear_alteracao();

create table acesso_logs (
  id bigint generated always as identity primary key,
  processo_id uuid not null references processos(id),
  usuario_id uuid not null,
  criado_em timestamptz not null default now()
);
create trigger acessos_imutaveis before update or delete on acesso_logs
  for each row execute function bloquear_alteracao();

-- ===== triagem do JR5260 =====
create function corrigir_item(_item_id uuid, _campo text, _valor text) returns void language plpgsql as $$
declare i record; v text := nullif(trim(_valor), ''); antigo text;
begin
  perform exigir_papel('cca');
  select * into i from itens_importados where id = _item_id for update;
  if i is null or i.situacao <> 'pendente' then raise exception 'A linha não está pendente'; end if;
  if (select situacao from arquivos_originais where id = i.arquivo_id) <> 'em_triagem' then
    raise exception 'Arquivo não está em triagem';
  end if;
  if _campo = 'especie' then antigo := i.especie;
  elsif _campo = 'numero' then antigo := i.numero;
  elsif _campo = 'abertura' then antigo := i.abertura::text;
  elsif _campo = 'proprietario' then antigo := i.proprietario;
  else raise exception 'Campo não editável: %', _campo; end if;
  if antigo is not distinct from v then return; end if;

  if _campo = 'especie' then update itens_importados set especie = v where id = _item_id;
  elsif _campo = 'numero' then update itens_importados set numero = v where id = _item_id;
  elsif _campo = 'abertura' then update itens_importados set abertura = v::date where id = _item_id;
  else update itens_importados set proprietario = v where id = _item_id; end if;

  insert into correcoes (item_id, campo, valor_antigo, valor_novo, usuario_id)
  values (_item_id, _campo, antigo, v, app_uid());
end $$;

create function descartar_item(_item_id uuid) returns void language plpgsql as $$
declare i record;
begin
  perform exigir_papel('cca');
  select * into i from itens_importados where id = _item_id for update;
  if i is null or i.situacao <> 'pendente' then raise exception 'A linha não está pendente'; end if;
  if (select situacao from arquivos_originais where id = i.arquivo_id) <> 'em_triagem' then
    raise exception 'Arquivo não está em triagem';
  end if;
  update itens_importados set situacao = 'descartado' where id = _item_id;
  insert into correcoes (item_id, campo, valor_antigo, valor_novo, usuario_id)
  values (_item_id, 'situacao', 'pendente', 'descartado', app_uid());
end $$;

create function informar_total_rodape(_arquivo_id uuid, _total int) returns void language plpgsql as $$
declare a record; lidos integer;
begin
  perform exigir_papel('cca');
  if _total is null or _total < 1 then raise exception 'Informe um total válido'; end if;
  select * into a from arquivos_originais where id = _arquivo_id for update;
  if not found or a.situacao <> 'em_triagem' then raise exception 'Arquivo não está em triagem'; end if;
  select count(*) into lidos from itens_importados where arquivo_id = _arquivo_id;
  if _total <> lidos then
    raise exception 'O total informado deve conferir com todas as linhas lidas, incluindo descartadas';
  end if;
  if a.total_rodape = lidos then raise exception 'O total do rodapé já confere com as linhas lidas'; end if;
  update arquivos_originais set total_rodape = _total,
    observacao = coalesce(observacao || E'\n', '') || 'Total conferido manualmente pelo CCA: ' || _total
  where id = _arquivo_id;
  insert into correcoes (campo, valor_antigo, valor_novo, usuario_id)
  values ('total_rodape:' || _arquivo_id, a.total_rodape::text, _total::text, app_uid());
end $$;

-- ===== tramitação (regras no banco) =====
create function _evento(_p uuid, _t tipo_evento, _o setor, _d setor, _obs text) returns void language sql as $$
  insert into eventos (processo_id, tipo, setor_origem, setor_destino, usuario_id, observacao)
  values (_p, _t, _o, _d, app_uid(), _obs);
$$;

-- CCA confirma os itens do arquivo e encaminha ao CPMA
create function confirmar_arquivo(_arquivo_id uuid) returns int language plpgsql as $$
declare a record; i record; pid uuid; n int := 0;
begin
  perform exigir_papel('cca');
  select * into a from arquivos_originais where id = _arquivo_id for update;
  if a is null or a.situacao <> 'em_triagem' then raise exception 'Arquivo não está em triagem'; end if;
  if a.total_rodape is null or a.total_rodape <> (select count(*) from itens_importados where arquivo_id = _arquivo_id) then
    raise exception 'Quantidade de linhas lidas difere do total do rodapé';
  end if;
  if exists (select 1 from itens_importados where arquivo_id = _arquivo_id and situacao = 'pendente'
     and (numero is null or numero !~ '^\d{5}\.\d{6}/\d{4}-\d{2}$' or abertura is null)) then
    raise exception 'Há itens com número ou data inválidos. Corrija ou descarte antes de confirmar';
  end if;
  if exists (select numero from itens_importados where arquivo_id = _arquivo_id and situacao = 'pendente'
     group by numero having count(*) > 1) then
    raise exception 'Há números duplicados no arquivo. Descarte as duplicatas';
  end if;
  for i in select * from itens_importados where arquivo_id = _arquivo_id and situacao = 'pendente' order by pagina, linha loop
    if exists (select 1 from processos where numero = i.numero) then
      update itens_importados set situacao = 'descartado', alertas = array_append(alertas, 'Já cadastrado na base') where id = i.id;
      continue;
    end if;
    insert into processos (numero, abertura, especie, proprietario, setor_atual, setor_destino, situacao, arquivo_id, responsavel_atual)
    values (i.numero, i.abertura, i.especie, i.proprietario, 'CCA', 'CPMA', 'aguardando_cpma', _arquivo_id, app_uid())
    returning id into pid;
    perform _evento(pid, 'IMPORTADO', null, 'CCA', 'Arquivo ' || a.nome || ' — pág. ' || i.pagina || ', linha ' || i.linha);
    perform _evento(pid, 'CONFERIDO', 'CCA', null, null);
    perform _evento(pid, 'ENCAMINHADO', 'CCA', 'CPMA', null);
    update itens_importados set situacao = 'confirmado', processo_id = pid where id = i.id;
    n := n + 1;
  end loop;
  update arquivos_originais set situacao = 'confirmado' where id = _arquivo_id;
  return n;
end $$;

create function receber_processo(_processo_id uuid) returns void language plpgsql as $$
declare p record; meu setor;
begin
  select * into p from processos where id = _processo_id for update;
  if p is null or p.setor_destino is null then raise exception 'Processo não está aguardando recebimento'; end if;
  meu := p.setor_destino;
  if app_uid() is null or not has_role(app_uid(), lower(meu::text)::app_role) then
    raise exception 'Permissão negada: só o setor de destino (%) confirma o recebimento', meu;
  end if;
  update processos set
    setor_atual = meu, setor_destino = null, responsavel_atual = app_uid(), updated_at = now(),
    situacao = case meu when 'CPMA' then 'em_conferencia_cpma'::situacao_processo
                        when 'JURIDICO' then 'recebido_juridico'::situacao_processo
                        else 'em_correcao_cca'::situacao_processo end
  where id = _processo_id;
  perform _evento(_processo_id, 'RECEBIDO', p.setor_atual, meu, null);
end $$;

create function _exige_cpma_com_processo(_processo_id uuid) returns processos language plpgsql as $$
declare p processos;
begin
  perform exigir_papel('cpma');
  select * into p from processos where id = _processo_id for update;
  if p.id is null or p.setor_atual <> 'CPMA' or p.setor_destino is not null then
    raise exception 'O processo precisa estar recebido pelo CPMA';
  end if;
  return p;
end $$;

create function _atualiza_pronto(_processo_id uuid) returns void language sql as $$
  update processos set situacao = case when digitalizado_em is not null and fiscal_id is not null
    then 'pronto_juridico'::situacao_processo else 'em_conferencia_cpma'::situacao_processo end, updated_at = now()
  where id = _processo_id;
$$;

create function registrar_digitalizacao(_processo_id uuid) returns void language plpgsql as $$
declare p processos;
begin
  p := _exige_cpma_com_processo(_processo_id);
  if p.digitalizado_em is not null then raise exception 'Digitalização já registrada'; end if;
  update processos set digitalizado_por = app_uid(), digitalizado_em = now() where id = _processo_id;
  perform _evento(_processo_id, 'DIGITALIZADO', 'CPMA', null, null);
  perform _atualiza_pronto(_processo_id);
end $$;

create function informar_fiscal(_processo_id uuid, _fiscal_id uuid, _setor_autuante setor_tecnico)
returns void language plpgsql as $$
declare p processos; f record; obs text;
begin
  p := _exige_cpma_com_processo(_processo_id);
  select * into f from fiscais where id = _fiscal_id;
  if f is null or not f.ativo then raise exception 'Fiscal inexistente ou inativo'; end if;
  obs := 'Fiscal: ' || f.nome || ' (' || f.matricula || ')';
  if p.especie is not null and not (p.especie = any(f.especies)) then
    obs := obs || ' — ATENÇÃO: fiscal não cadastrado para a espécie ' || p.especie;
  end if;
  if p.fiscal_id is not null then obs := obs || ' — substitui fiscal anterior'; end if;
  update processos set fiscal_id = _fiscal_id, setor_autuante = _setor_autuante where id = _processo_id;
  perform _evento(_processo_id, 'FISCAL_INFORMADO', 'CPMA', null, obs || '; setor autuante: ' || _setor_autuante);
  perform _atualiza_pronto(_processo_id);
end $$;

create function encaminhar_juridico(_processo_id uuid, _obs text default null) returns void language plpgsql as $$
declare p processos;
begin
  p := _exige_cpma_com_processo(_processo_id);
  if p.digitalizado_em is null then raise exception 'Registre a digitalização antes de encaminhar'; end if;
  if p.fiscal_id is null then raise exception 'Informe o fiscal do Termo de Ocorrência antes de encaminhar'; end if;
  update processos set setor_destino = 'JURIDICO', situacao = 'aguardando_juridico', updated_at = now() where id = _processo_id;
  perform _evento(_processo_id, 'ENCAMINHADO', 'CPMA', 'JURIDICO', nullif(trim(_obs), ''));
end $$;

create function devolver_processo(_processo_id uuid, _obs text) returns void language plpgsql as $$
declare p processos; dest setor;
begin
  if _obs is null or length(trim(_obs)) < 5 then raise exception 'A devolução exige uma justificativa'; end if;
  select * into p from processos where id = _processo_id for update;
  if p.id is null or p.setor_destino is not null then raise exception 'O processo precisa estar recebido pelo setor'; end if;
  if p.setor_atual = 'CPMA' and has_role(app_uid(), 'cpma') then dest := 'CCA';
  elsif p.setor_atual = 'JURIDICO' and has_role(app_uid(), 'juridico') then dest := 'CPMA';
  else raise exception 'Permissão negada para devolver este processo'; end if;
  update processos set setor_destino = dest, updated_at = now(),
    situacao = case dest when 'CCA' then 'aguardando_cca'::situacao_processo else 'aguardando_cpma'::situacao_processo end
  where id = _processo_id;
  perform _evento(_processo_id, 'DEVOLVIDO', p.setor_atual, dest, trim(_obs));
end $$;

-- CCA corrige e reencaminha após devolução
create function reencaminhar_cca(_processo_id uuid, _especie text, _abertura date, _proprietario text, _obs text)
returns void language plpgsql as $$
declare p processos;
begin
  perform exigir_papel('cca');
  select * into p from processos where id = _processo_id for update;
  if p.id is null or p.setor_atual <> 'CCA' or p.setor_destino is not null then raise exception 'Processo não está com o CCA'; end if;
  if p.especie is distinct from _especie then
    insert into correcoes (processo_id, campo, valor_antigo, valor_novo, usuario_id) values (_processo_id, 'especie', p.especie, _especie, app_uid());
    perform _evento(_processo_id, 'CORRECAO', 'CCA', null, 'Espécie: ' || coalesce(p.especie, '—') || ' → ' || coalesce(_especie, '—'));
  end if;
  if p.abertura is distinct from _abertura then
    insert into correcoes (processo_id, campo, valor_antigo, valor_novo, usuario_id) values (_processo_id, 'abertura', p.abertura::text, _abertura::text, app_uid());
    perform _evento(_processo_id, 'CORRECAO', 'CCA', null, 'Abertura corrigida');
  end if;
  if p.proprietario is distinct from _proprietario then
    insert into correcoes (processo_id, campo, valor_antigo, valor_novo, usuario_id) values (_processo_id, 'proprietario', p.proprietario, _proprietario, app_uid());
    perform _evento(_processo_id, 'CORRECAO', 'CCA', null, 'Proprietário corrigido');
  end if;
  update processos set especie = _especie, abertura = _abertura, proprietario = _proprietario,
    setor_destino = 'CPMA', situacao = 'aguardando_cpma', updated_at = now() where id = _processo_id;
  perform _evento(_processo_id, 'ENCAMINHADO', 'CCA', 'CPMA', nullif(trim(_obs), ''));
end $$;

create function adicionar_observacao(_processo_id uuid, _obs text) returns void language plpgsql as $$
declare p processos;
begin
  if _obs is null or length(trim(_obs)) = 0 then raise exception 'Observação vazia'; end if;
  select * into p from processos where id = _processo_id;
  if p.id is null then raise exception 'Processo não encontrado'; end if;
  if app_uid() is null or not has_role(app_uid(), lower(p.setor_atual::text)::app_role) then
    raise exception 'Só o setor atual registra observações';
  end if;
  perform _evento(_processo_id, 'OBSERVACAO', p.setor_atual, null, trim(_obs));
end $$;
