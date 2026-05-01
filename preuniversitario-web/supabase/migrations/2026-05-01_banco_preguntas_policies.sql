alter table public.banco_preguntas enable row level security;

drop policy if exists "banco_preguntas_select_authenticated" on public.banco_preguntas;
create policy "banco_preguntas_select_authenticated"
on public.banco_preguntas
for select
to authenticated
using (true);

drop policy if exists "banco_preguntas_admin_write" on public.banco_preguntas;
create policy "banco_preguntas_admin_write"
on public.banco_preguntas
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());
