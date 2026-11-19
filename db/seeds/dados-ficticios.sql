-- Dados fictícios SOMENTE para desenvolvimento/testes. Não rode em produção.
insert into especies (codigo, descricao) values ('CT',''),('BO',''),('DI','') on conflict do nothing;
insert into fiscais (nome, matricula, setor_tecnico, especies) values
 ('Ana Fictícia Souza','F-0001','METROLOGIA','{CT}'),
 ('Bruno Exemplo Lima','F-0002','QUALIDADE','{BO,DI}'),
 ('Carla Teste Rocha','F-0003','PRE_EMBALADOS','{DI}')
on conflict (matricula) do nothing;
