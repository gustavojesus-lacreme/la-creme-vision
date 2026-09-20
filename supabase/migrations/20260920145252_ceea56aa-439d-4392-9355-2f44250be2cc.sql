create type public.app_role as enum ('admin', 'user');

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role app_role not null,
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;
create policy "Users can read own roles" on public.user_roles for select to authenticated using (auth.uid() = user_id);

create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  )
$$;

alter table public.appointments alter column status set default 'agendado';
update public.appointments set status = 'agendado' where status = 'confirmado';

create policy "Admins can view all appointments" on public.appointments for select to authenticated using (public.has_role(auth.uid(), 'admin'));
create policy "Admins can update appointments" on public.appointments for update to authenticated using (public.has_role(auth.uid(), 'admin'));

insert into public.user_roles (user_id, role)
values ('c00d8c03-b99b-4e54-bdc2-1ade71ebc683', 'admin')
on conflict (user_id, role) do nothing;