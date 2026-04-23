create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.perfiles
    where id = auth.uid()
      and rol = 'admin'
  );
$$;

create or replace function public.is_own_profile(profile_id uuid)
returns boolean
language sql
stable
as $$
  select auth.uid() = profile_id;
$$;

alter table public.cursos enable row level security;
alter table public.perfiles enable row level security;
alter table public.lecciones enable row level security;
alter table public.leccion_contenidos enable row level security;
alter table public.entregas_actividades enable row level security;
alter table public.simuladores enable row level security;
alter table public.simulador_preguntas enable row level security;
alter table public.simulador_intentos enable row level security;

drop policy if exists "cursos_select_authenticated" on public.cursos;
create policy "cursos_select_authenticated"
on public.cursos
for select
to authenticated
using (true);

drop policy if exists "cursos_admin_write" on public.cursos;
create policy "cursos_admin_write"
on public.cursos
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "perfiles_select_own_or_admin" on public.perfiles;
create policy "perfiles_select_own_or_admin"
on public.perfiles
for select
to authenticated
using (public.is_admin() or public.is_own_profile(id));

drop policy if exists "perfiles_insert_own_student" on public.perfiles;
create policy "perfiles_insert_own_student"
on public.perfiles
for insert
to authenticated
with check (
  public.is_own_profile(id)
  and (
    rol = 'estudiante'
    or public.is_admin()
  )
);

drop policy if exists "perfiles_update_own_or_admin" on public.perfiles;
create policy "perfiles_update_own_or_admin"
on public.perfiles
for update
to authenticated
using (public.is_admin() or public.is_own_profile(id))
with check (public.is_admin() or public.is_own_profile(id));

drop policy if exists "lecciones_select_authenticated" on public.lecciones;
create policy "lecciones_select_authenticated"
on public.lecciones
for select
to authenticated
using (true);

drop policy if exists "lecciones_admin_write" on public.lecciones;
create policy "lecciones_admin_write"
on public.lecciones
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "contenidos_select_authenticated" on public.leccion_contenidos;
create policy "contenidos_select_authenticated"
on public.leccion_contenidos
for select
to authenticated
using (true);

drop policy if exists "contenidos_admin_write" on public.leccion_contenidos;
create policy "contenidos_admin_write"
on public.leccion_contenidos
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "entregas_select_own_or_admin" on public.entregas_actividades;
create policy "entregas_select_own_or_admin"
on public.entregas_actividades
for select
to authenticated
using (public.is_admin() or estudiante_id = auth.uid());

drop policy if exists "entregas_insert_own" on public.entregas_actividades;
create policy "entregas_insert_own"
on public.entregas_actividades
for insert
to authenticated
with check (estudiante_id = auth.uid());

drop policy if exists "entregas_update_own_or_admin" on public.entregas_actividades;
create policy "entregas_update_own_or_admin"
on public.entregas_actividades
for update
to authenticated
using (public.is_admin() or estudiante_id = auth.uid())
with check (public.is_admin() or estudiante_id = auth.uid());

drop policy if exists "entregas_delete_own_or_admin" on public.entregas_actividades;
create policy "entregas_delete_own_or_admin"
on public.entregas_actividades
for delete
to authenticated
using (public.is_admin() or estudiante_id = auth.uid());

drop policy if exists "simuladores_select_authenticated" on public.simuladores;
create policy "simuladores_select_authenticated"
on public.simuladores
for select
to authenticated
using (true);

drop policy if exists "simuladores_admin_write" on public.simuladores;
create policy "simuladores_admin_write"
on public.simuladores
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "simulador_preguntas_select_authenticated" on public.simulador_preguntas;
create policy "simulador_preguntas_select_authenticated"
on public.simulador_preguntas
for select
to authenticated
using (true);

drop policy if exists "simulador_preguntas_admin_write" on public.simulador_preguntas;
create policy "simulador_preguntas_admin_write"
on public.simulador_preguntas
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "simulador_intentos_select_own_or_admin" on public.simulador_intentos;
create policy "simulador_intentos_select_own_or_admin"
on public.simulador_intentos
for select
to authenticated
using (public.is_admin() or estudiante_id = auth.uid());

drop policy if exists "simulador_intentos_insert_own" on public.simulador_intentos;
create policy "simulador_intentos_insert_own"
on public.simulador_intentos
for insert
to authenticated
with check (estudiante_id = auth.uid());

drop policy if exists "simulador_intentos_update_admin_only" on public.simulador_intentos;
create policy "simulador_intentos_update_admin_only"
on public.simulador_intentos
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "simulador_intentos_delete_admin_only" on public.simulador_intentos;
create policy "simulador_intentos_delete_admin_only"
on public.simulador_intentos
for delete
to authenticated
using (public.is_admin());

drop policy if exists "storage_select_archivos" on storage.objects;
create policy "storage_select_archivos"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'archivos'
  and (
    public.is_admin()
    or split_part(name, '/', 2) in ('lecciones', 'contenidos')
    or (
      split_part(name, '/', 1) = auth.uid()::text
      and split_part(name, '/', 2) = 'entregas'
    )
  )
);

drop policy if exists "storage_insert_archivos" on storage.objects;
create policy "storage_insert_archivos"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'archivos'
  and split_part(name, '/', 1) = auth.uid()::text
  and (
    (public.is_admin() and split_part(name, '/', 2) in ('lecciones', 'contenidos'))
    or split_part(name, '/', 2) = 'entregas'
  )
);

drop policy if exists "storage_update_archivos" on storage.objects;
create policy "storage_update_archivos"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'archivos'
  and split_part(name, '/', 1) = auth.uid()::text
  and (
    (public.is_admin() and split_part(name, '/', 2) in ('lecciones', 'contenidos'))
    or split_part(name, '/', 2) = 'entregas'
  )
)
with check (
  bucket_id = 'archivos'
  and split_part(name, '/', 1) = auth.uid()::text
  and (
    (public.is_admin() and split_part(name, '/', 2) in ('lecciones', 'contenidos'))
    or split_part(name, '/', 2) = 'entregas'
  )
);

drop policy if exists "storage_delete_archivos" on storage.objects;
create policy "storage_delete_archivos"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'archivos'
  and (
    public.is_admin()
    or (
      split_part(name, '/', 1) = auth.uid()::text
      and split_part(name, '/', 2) = 'entregas'
    )
  )
);
