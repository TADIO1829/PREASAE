alter table public.lecciones
add column if not exists descripcion text,
add column if not exists fecha_entrega timestamptz,
add column if not exists created_at timestamptz not null default timezone('utc', now()),
add column if not exists updated_at timestamptz not null default timezone('utc', now());

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists lecciones_set_updated_at on public.lecciones;

create trigger lecciones_set_updated_at
before update on public.lecciones
for each row
execute function public.set_updated_at();
