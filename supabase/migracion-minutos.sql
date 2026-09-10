-- ============================================================
-- Consolidación de minutos en Supabase (2026-08-30)
-- Tablas para que Supabase sea la ÚNICA fuente de minutos/resultados.
-- El tablero minutos-gs pasa a leer de acá (lectura pública, SIN DNI).
-- Escritura: solo la service_role key (Edge Function ficha-api / syncParticipaciones).
-- Correr en el SQL Editor del proyecto Supabase.
-- ============================================================

-- Minutos + puntos por jugador y por partido (equivale a la pestaña PARTICIPACIONES).
create table if not exists ficha_partido_participaciones (
  id         bigint generated always as identity primary key,
  n_partido  text not null,
  fecha      date,
  equipo     text,                     -- 'CUBA A'..'CUBA D'
  dorsal     int,
  jugador    text,
  minutos    int  default 0,
  puntos     int  default 0,
  origen     text default 'vivo',       -- 'pdf' (lector de fichas) | 'vivo' (Ficha en vivo)
  created_at timestamptz default now()
);
create index if not exists ficha_partido_participaciones_idx on ficha_partido_participaciones(n_partido);
create index if not exists ficha_partido_participaciones_jug on ficha_partido_participaciones(jugador);

-- Resultado por partido (equivale a la pestaña PARTIDOS).
create table if not exists ficha_partido_resultados (
  n_partido  text primary key,
  fecha      date,
  local      text,
  visitante  text,
  resultado  text,                      -- "CUBA A 24 - RIVAL 17"
  origen     text default 'vivo',
  created_at timestamptz default now()
);

alter table ficha_partido_participaciones enable row level security;
alter table ficha_partido_resultados      enable row level security;

-- Lectura PÚBLICA (solo nombres+minutos+puntos, sin DNI: misma exposición que el
-- dashboard público de siempre). Así minutos-gs lee directo por PostgREST con la anon key.
drop policy if exists ficha_partido_participaciones_read on ficha_partido_participaciones;
create policy ficha_partido_participaciones_read
  on ficha_partido_participaciones for select using (true);

drop policy if exists ficha_partido_resultados_read on ficha_partido_resultados;
create policy ficha_partido_resultados_read
  on ficha_partido_resultados for select using (true);

-- Escritura: NO se crea policy de insert/update/delete → anon no puede escribir,
-- solo la service_role (server-side, en la Edge Function).

-- 2026-09-10: tries por equipo, para que minutos-gs calcule el punto bonus
-- ofensivo (4+ tries / diferencia de 3+ tries, regla URBA). La Ficha ya
-- calculaba el bonus en vivo (badge ámbar) pero nunca lo guardaba; ahora
-- manda tries_cuba/tries_rival en syncParticipaciones. Null en partidos
-- viejos (no hay forma de recuperar el dato) y en clientes previos a esto.
alter table ficha_partido_resultados
  add column if not exists tries_cuba  integer,
  add column if not exists tries_rival integer;

-- 2026-09-10 (2): bonus YA RESUELTO por la Ficha (misma fórmula de updateScore,
-- una sola fuente de verdad) en vez de que minutos-gs recalcule con tries_cuba/
-- tries_rival. Boolean nullable: null = no informado (partido viejo o cliente
-- desactualizado), NO se interpreta como "sin bonus".
alter table ficha_partido_resultados
  add column if not exists bonus_ofensivo  boolean,
  add column if not exists bonus_defensivo boolean;
