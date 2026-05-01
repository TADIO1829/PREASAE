alter table public.simuladores
add column if not exists max_intentos integer check (max_intentos is null or max_intentos > 0);

alter table public.simulador_intentos
add column if not exists numero_intento integer not null default 1;

alter table public.entregas_actividades
add column if not exists simulador_intento_id bigint references public.simulador_intentos(id) on delete set null;
