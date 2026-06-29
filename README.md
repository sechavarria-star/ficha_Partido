# Ficha de Partido — CUBA Rugby

Web app (Google Apps Script) para registrar partidos en vivo (cronómetro, score,
incidencias: tries, tarjetas, cambios) con **autocompletado desde las planillas
PDF de URBA**.

## Componentes

- **`Código.js` / `Ficha Partido CUBA.html`** — la web app de Apps Script
  (container-bound a un Google Sheet). Deploy con `clasp`.
- **`supabase/functions/parse-planilla/`** — Edge Function que extrae el texto
  del PDF **sin OCR** (`unpdf`) y devuelve la planilla parseada. Reemplaza al OCR
  de Drive: ~segundos en vez de ~1-2 min, sin rate limit.
- **`supabase/schema.sql`** — tablas Postgres (partidos/roster/eventos) que
  reemplazan a las hojas de cálculo.

## Deploy de la Edge Function

Desde el dashboard de Supabase → **Edge Functions → Create function** →
nombre `parse-planilla` → pegar `supabase/functions/parse-planilla/index.ts` →
Deploy. (O `supabase functions deploy parse-planilla` con la CLI.)

## Conectar Apps Script a la Edge Function

En el editor del script, ejecutar UNA vez:

```js
configSupabase("https://<proyecto>.supabase.co/functions/v1/parse-planilla", "<ANON_KEY>")
```

Queda en `ScriptProperties` (no en el código). Si no se configura, `cargarPlanillas`
usa el OCR de Drive como fallback.

## Datos sensibles

Las planillas PDF contienen nombres y DNI de menores: **no se versionan** (ver
`.gitignore`) y el repo es **privado**.
