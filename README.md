# Ficha de Partido — CUBA Rugby (estático)

Frontend estático (GitHub Pages) de la app **Ficha de Partido**: registra partidos
en vivo (cronómetro, score, incidencias) con autocompletado desde las planillas
PDF de URBA. **No usa Google Apps Script ni Drive** — habla directo con Supabase.

## Arquitectura

- `index.html` — toda la app (HTML/JS, un solo archivo). Se sirve con GitHub Pages.
- **Supabase Edge Functions** (en el repo `fichaPartido-gs/supabase/functions/`):
  - `parse-planilla` — recibe un PDF (upload), extrae texto sin OCR (`unpdf`),
    parsea y guarda partido+roster en la base.
  - `ficha-api` — capa de datos (partidos/eventos/roster) con la **service_role**
    key server-side; el navegador nunca toca la base directo (protege los DNI).
- **Postgres** (`fichaPartido-gs/supabase/schema.sql`): tablas `ficha_partido_*`.

## Config

En `index.html`, al inicio del `<script>`:
- `SB_URL` — URL del proyecto Supabase.
- `SB_ANON` — anon key (pública; protegida por RLS + Edge Functions). **Pegar la real.**
- `APP_PIN` — PIN de acceso (gate por los DNI de menores).

## Deploy

`git push` → GitHub Pages publica solo. Sin clasp, sin re-autorizar, sin scopes.

## Datos sensibles

Las planillas tienen DNI de menores. Se suben en runtime (no se versionan) y la
lectura del roster pasa siempre por `ficha-api` (service_role). PIN de acceso al abrir.
