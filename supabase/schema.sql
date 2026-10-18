-- Cole no Supabase: SQL Editor > New query > Run  (pode rodar mais de uma vez)

-- ============ usuários e aprovação ============
create table if not exists public.usuarios (
  id        uuid primary key references auth.users(id) on delete cascade,
  email     text not null,
  nome      text,
  aprovado  boolean not null default false,
  admin     boolean not null default false,
  criado_em timestamptz not null default now()
);
alter table public.usuarios enable row level security;

create or replace function public.sou_aprovado() returns boolean
language sql security definer set search_path = public stable as
$$ select coalesce((select aprovado from public.usuarios where id = auth.uid()), false) $$;

create or replace function public.sou_admin() returns boolean
language sql security definer set search_path = public stable as
$$ select coalesce((select aprovado and admin from public.usuarios where id = auth.uid()), false) $$;

-- toda conta nova entra como "aguardando"; a PRIMEIRA conta criada vira administradora já liberada
create or replace function public.novo_usuario() returns trigger
language plpgsql security definer set search_path = public as $$
declare primeiro boolean;
begin
  select not exists (select 1 from public.usuarios) into primeiro;
  insert into public.usuarios (id, email, nome, aprovado, admin)
  values (new.id, new.email, coalesce(nullif(new.raw_user_meta_data->>'nome', ''), split_part(new.email, '@', 1)), primeiro, primeiro);
  return new;
end $$;

drop trigger if exists ao_criar_usuario on auth.users;
create trigger ao_criar_usuario after insert on auth.users
  for each row execute function public.novo_usuario();

-- contas que já existiam antes deste script: liberadas como administradoras
insert into public.usuarios (id, email, nome, aprovado, admin)
select id, email, split_part(email, '@', 1), true, true from auth.users
on conflict (id) do nothing;

revoke all on public.usuarios from anon;
grant select, update, delete on public.usuarios to authenticated;
drop policy if exists "ver proprio ou admin" on public.usuarios;
create policy "ver proprio ou admin" on public.usuarios for select to authenticated
  using (id = auth.uid() or public.sou_admin());
drop policy if exists "admin edita" on public.usuarios;
create policy "admin edita" on public.usuarios for update to authenticated
  using (public.sou_admin()) with check (public.sou_admin());
drop policy if exists "admin remove" on public.usuarios;
create policy "admin remove" on public.usuarios for delete to authenticated
  using (public.sou_admin() and id <> auth.uid());

-- ============ contas, titulares e adicionais ============
-- usuarios.aprovado = pode CRIAR uma conta própria (ser titular). Quem foi cadastrado como adicional por uma titular
-- entra direto na conta dela, sem precisar de liberação.
create table if not exists public.contas (
  id        uuid primary key default gen_random_uuid(),
  nome      text not null default 'Minha conta',
  seq       int  not null default 0,        -- quantas pessoas já passaram pela conta (gera a letra A, B, C…)
  criado_em timestamptz not null default now()
);
alter table public.contas enable row level security;

create table if not exists public.membros (
  id        uuid primary key default gen_random_uuid(),
  conta_id  uuid not null references public.contas(id) on delete cascade,
  user_id   uuid references auth.users(id) on delete set null,   -- vazio até a pessoa criar o login com o e-mail cadastrado
  pessoa    text not null,                  -- A, B, C… (identifica a pessoa dentro dos registros da conta)
  nome      text not null,
  email     text,
  papel     text not null default 'adicional' check (papel in ('titular', 'adicional')),
  apelido   text,                           -- como esta pessoa chama a conta (só ela vê): "Conta 1", "Conta da mãe"…
  criado_em timestamptz not null default now(),
  unique (conta_id, pessoa)
);
create unique index if not exists membros_conta_email  on public.membros (conta_id, lower(email)) where email is not null;
create unique index if not exists membros_conta_user   on public.membros (conta_id, user_id) where user_id is not null;
create unique index if not exists membros_conta_titular on public.membros (conta_id) where papel = 'titular';
create index if not exists membros_user on public.membros (user_id);
alter table public.membros enable row level security;

create or replace function public.sou_membro(c uuid) returns boolean
language sql security definer set search_path = public stable as
$$ select exists (select 1 from public.membros where conta_id = c and user_id = auth.uid()) $$;

create or replace function public.sou_titular(c uuid) returns boolean
language sql security definer set search_path = public stable as
$$ select exists (select 1 from public.membros where conta_id = c and user_id = auth.uid() and papel = 'titular') $$;

revoke all on public.contas, public.membros from anon;
revoke insert, update, delete on public.contas, public.membros from authenticated;
grant select on public.contas, public.membros to authenticated;
drop policy if exists "ver minhas contas" on public.contas;
create policy "ver minhas contas" on public.contas for select to authenticated using (public.sou_membro(id));
drop policy if exists "ver membros da conta" on public.membros;
create policy "ver membros da conta" on public.membros for select to authenticated using (public.sou_membro(conta_id));

-- ---- tudo que muda contas/membros passa por estas funções ----
-- cria a conta do usuário (ele vira titular, pessoa A). Só para quem foi liberado.
create or replace function public.criar_conta(p_nome text) returns uuid
language plpgsql security definer set search_path = public as $$
declare cid uuid; u public.usuarios;
begin
  select * into u from public.usuarios where id = auth.uid();
  if u.id is null or not u.aprovado then raise exception 'Sua conta ainda não foi liberada.'; end if;
  insert into public.contas (nome, seq) values (coalesce(nullif(trim(p_nome), ''), 'Minha conta'), 1) returning id into cid;
  insert into public.membros (conta_id, user_id, pessoa, nome, email, papel)
  values (cid, u.id, 'A', coalesce(nullif(u.nome, ''), split_part(u.email, '@', 1)), lower(u.email), 'titular');
  return cid;
end $$;

-- a titular cadastra um adicional (e-mail opcional). Se a pessoa já tem login, entra na hora; senão entra ao criar o login com esse e-mail.
create or replace function public.adicionar_membro(p_conta uuid, p_nome text, p_email text) returns public.membros
language plpgsql security definer set search_path = public as $$
declare c public.contas; m public.membros; em text := nullif(lower(trim(p_email)), ''); uid uuid;
begin
  if not public.sou_titular(p_conta) then raise exception 'Só a titular pode cadastrar pessoas.'; end if;
  if nullif(trim(p_nome), '') is null then raise exception 'Informe o nome.'; end if;
  select * into c from public.contas where id = p_conta for update;
  if c.seq >= 26 then raise exception 'Limite de pessoas da conta atingido.'; end if;
  if em is not null and exists (select 1 from public.membros where conta_id = p_conta and lower(email) = em) then
    raise exception 'Este e-mail já está nesta conta.';
  end if;
  if em is not null then select id into uid from auth.users where lower(email) = em and email_confirmed_at is not null; end if;
  update public.contas set seq = seq + 1 where id = p_conta;
  insert into public.membros (conta_id, user_id, pessoa, nome, email, papel)
  values (p_conta, uid, chr(65 + c.seq), trim(p_nome), em, 'adicional') returning * into m;
  return m;
end $$;

-- muda o nome de alguém; o e-mail só muda enquanto a pessoa ainda não entrou
create or replace function public.editar_membro(p_id uuid, p_nome text, p_email text) returns void
language plpgsql security definer set search_path = public as $$
declare m public.membros; em text := nullif(lower(trim(p_email)), ''); uid uuid;
begin
  select * into m from public.membros where id = p_id;
  if m.id is null or not public.sou_titular(m.conta_id) then raise exception 'Sem permissão.'; end if;
  if nullif(trim(p_nome), '') is null then raise exception 'Informe o nome.'; end if;
  if m.user_id is null and em is distinct from lower(m.email) then
    if em is not null and exists (select 1 from public.membros where conta_id = m.conta_id and lower(email) = em and id <> m.id) then
      raise exception 'Este e-mail já está nesta conta.';
    end if;
    if em is not null then select id into uid from auth.users where lower(email) = em and email_confirmed_at is not null; end if;
    update public.membros set nome = trim(p_nome), email = em, user_id = uid where id = p_id;
  else
    update public.membros set nome = trim(p_nome) where id = p_id;
  end if;
end $$;

create or replace function public.remover_membro(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare m public.membros;
begin
  select * into m from public.membros where id = p_id;
  if m.id is null or not public.sou_titular(m.conta_id) then raise exception 'Sem permissão.'; end if;
  if m.papel = 'titular' then raise exception 'A titular não pode ser removida.'; end if;
  delete from public.membros where id = p_id;
end $$;

create or replace function public.renomear_conta(p_conta uuid, p_nome text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.sou_titular(p_conta) then raise exception 'Só a titular pode renomear a conta.'; end if;
  update public.contas set nome = coalesce(nullif(trim(p_nome), ''), nome) where id = p_conta;
end $$;

-- o nome que cada um dá à conta (só aparece para quem deu)
create or replace function public.apelido_conta(p_conta uuid, p_apelido text) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.membros set apelido = nullif(trim(p_apelido), '') where conta_id = p_conta and user_id = auth.uid();
end $$;

-- ao entrar: liga o login às contas onde a titular cadastrou este e-mail (só vale com e-mail confirmado)
create or replace function public.reivindicar_convites() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update public.membros m set user_id = u.id from auth.users u
   where u.id = auth.uid() and u.email_confirmed_at is not null and m.user_id is null
     and m.email is not null and lower(m.email) = lower(u.email);
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.criar_conta(text), public.adicionar_membro(uuid, text, text), public.editar_membro(uuid, text, text),
  public.remover_membro(uuid), public.renomear_conta(uuid, text), public.apelido_conta(uuid, text), public.reivindicar_convites() from public, anon;
grant execute on function public.criar_conta(text), public.adicionar_membro(uuid, text, text), public.editar_membro(uuid, text, text),
  public.remover_membro(uuid), public.renomear_conta(uuid, text), public.apelido_conta(uuid, text), public.reivindicar_convites() to authenticated;

-- ============ dados do site (cada linha pertence a uma conta) ============
create table if not exists public.registros (
  colecao    text        not null,   -- gastos, inter, acertos, comprovantes, fixos, futuros, pontos, viagens, faturas, config
  id         text        not null,
  dados      jsonb       not null,
  atualizado timestamptz not null default now()
);
alter table public.registros add column if not exists conta_id uuid references public.contas(id) on delete cascade;

-- Migração (roda uma vez): tudo que já existia vira a "Conta 1": quem é A (titular) e B (adicional) vem da configuração salva.
do $$
declare cid uuid; cfg jsonb; ea text; eb text; na text; nb text; ta uuid; tb uuid; tem text;
begin
  if not exists (select 1 from public.registros where conta_id is null) then return; end if;
  select dados->'config' into cfg from public.registros where conta_id is null and colecao = 'config' and id = 'config' limit 1;
  ea := nullif(lower(coalesce(cfg->>'emailA', '')), ''); eb := nullif(lower(coalesce(cfg->>'emailB', '')), '');
  na := coalesce(nullif(cfg->>'nomeA', ''), 'Titular'); nb := coalesce(nullif(cfg->>'nomeB', ''), 'Adicional');
  select id into ta from public.usuarios where lower(email) = ea limit 1;
  if ta is null then select id into ta from public.usuarios where admin order by criado_em limit 1; end if;
  if ta is null then select id into ta from public.usuarios order by criado_em limit 1; end if;
  if ta is null then raise notice 'Nenhum usuário encontrado: dados antigos ficam sem conta.'; return; end if;
  select id into tb from public.usuarios where lower(email) = eb and id <> ta limit 1;
  if tb is null and eb is null and (select count(*) from public.usuarios where id <> ta) = 1 then
    select id into tb from public.usuarios where id <> ta;
  end if;
  if eb is null and tb is not null then select lower(email) into eb from public.usuarios where id = tb; end if;
  select lower(email) into tem from public.usuarios where id = ta;
  insert into public.contas (nome, seq) values ('Conta 1', 2) returning id into cid;
  insert into public.membros (conta_id, user_id, pessoa, nome, email, papel) values (cid, ta, 'A', na, coalesce(ea, tem), 'titular');
  insert into public.membros (conta_id, user_id, pessoa, nome, email, papel) values (cid, tb, 'B', nb, eb, 'adicional');
  update public.registros set conta_id = cid where conta_id is null;
  -- a conta antiga usava Inter e Loop: continuam assim (e já não precisa do assistente de configuração)
  update public.registros set dados = jsonb_set(dados, '{config}',
      '{"banco":"Inter","programa":"loop","configurado":true}'::jsonb || coalesce(dados->'config', '{}'::jsonb))
   where conta_id = cid and colecao = 'config' and id = 'config';
end $$;

-- chave primária passa a incluir a conta (duas contas podem ter registros com o mesmo id)
do $$
declare pk text;
begin
  if exists (select 1 from public.registros where conta_id is null) then return; end if;
  alter table public.registros alter column conta_id set not null;
  select conname into pk from pg_constraint where conrelid = 'public.registros'::regclass and contype = 'p' and array_length(conkey, 1) = 2;
  if pk is not null then
    execute format('alter table public.registros drop constraint %I', pk);
    alter table public.registros add primary key (conta_id, colecao, id);
  end if;
end $$;

alter table public.registros enable row level security;

revoke all on public.registros from anon;
grant select, insert, update, delete on public.registros to authenticated;

drop policy if exists "casal acessa" on public.registros;
drop policy if exists "aprovados acessam" on public.registros;
drop policy if exists "membros acessam" on public.registros;
create policy "membros acessam" on public.registros
  for all to authenticated using (public.sou_membro(conta_id)) with check (public.sou_membro(conta_id));

-- atualização ao vivo entre os celulares (ignora o erro se já estiver adicionada)
do $$ begin
  alter publication supabase_realtime add table public.registros;
exception when duplicate_object then null;
end $$;
