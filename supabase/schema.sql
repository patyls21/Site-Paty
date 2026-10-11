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

-- ============ dados do site ============
create table if not exists public.registros (
  colecao    text        not null,   -- gastos, inter, acertos, comprovantes, fixos, futuros, pontos, viagens, faturas, config
  id         text        not null,
  dados      jsonb       not null,
  atualizado timestamptz not null default now(),
  primary key (colecao, id)
);
alter table public.registros enable row level security;

revoke all on public.registros from anon;
grant select, insert, update, delete on public.registros to authenticated;

drop policy if exists "casal acessa" on public.registros;
drop policy if exists "aprovados acessam" on public.registros;
create policy "aprovados acessam" on public.registros
  for all to authenticated using (public.sou_aprovado()) with check (public.sou_aprovado());

-- atualização ao vivo entre os celulares (ignora o erro se já estiver adicionada)
do $$ begin
  alter publication supabase_realtime add table public.registros;
exception when duplicate_object then null;
end $$;
