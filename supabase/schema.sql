-- ============================================================
-- Ficha de Partido CUBA — schema Supabase (Postgres)
-- Correr en el SQL Editor del proyecto Supabase.
-- Las tablas reemplazan a las hojas Fichas/Planillas/Rosters.
-- Apps Script escribe con la service_role key (server-side), así que se deja
-- RLS activado SIN policies públicas: el navegador nunca toca estas tablas.
-- ============================================================

create table if not exists partidos (
  n_partido    text primary key,            -- N° de partido URBA (o id generado para manuales)
  equipo       text,                          -- 'CUBA A'..'CUBA D'
  rival        text,
  fecha        date,
  hora         text,
  camada       text,                          -- M13/M14/M15
  cancha       text,                          -- Local/Visitante/Neutral
  cant_tiempos int  default 2,
  dur_tiempo   int  default 35,
  start_ts     bigint,                        -- timestamp de arranque del cronómetro (ms)
  estado       text default 'en_curso',       -- en_curso / finalizado
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

create table if not exists roster (
  id        bigint generated always as identity primary key,
  n_partido text references partidos(n_partido) on delete cascade,
  dorsal    text,
  nombre    text,
  dni       text
);
create index if not exists roster_partido_idx on roster(n_partido);

create table if not exists eventos (
  id         bigint generated always as identity primary key,
  n_partido  text references partidos(n_partido) on delete cascade,
  periodo    text,                            -- 1T/2T/3T
  minuto     text,                            -- mm:ss
  tipo       text,                            -- Try, Conversion, Penal, Cambio, Tarjeta...
  jugador    text,
  puntos     int  default 0,
  equipo     text default 'CUBA',             -- CUBA / RIVAL
  orden      int,                             -- orden de carga dentro del partido
  created_at timestamptz default now()
);
create index if not exists eventos_partido_idx on eventos(n_partido);

alter table partidos enable row level security;
alter table roster   enable row level security;
alter table eventos  enable row level security;
-- (sin policies: solo la service_role key, usada por Apps Script, accede)
