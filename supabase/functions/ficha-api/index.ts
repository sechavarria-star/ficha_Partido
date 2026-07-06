// ============================================================
// Edge Function: ficha-api
// Capa de datos para el frontend estático (GitHub Pages). Maneja partidos,
// eventos y roster en Postgres con la service_role key (server-side), así el
// navegador NUNCA toca la base directo y los DNI de menores quedan protegidos.
// El estático llama con la anon key (pasa verify_jwt) y un body { action, ... }.
// ============================================================
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function db(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

function partidoRow(p: any) {
  const row: Record<string, unknown> = {
    n_partido: String(p.nPartido || ""),
    rival: p.rival || "",
    fecha: p.fecha || null,
    cancha: p.cancha || null,
    camada: p.camada || null,
    cant_tiempos: p.cantT || 2,
    dur_tiempo: p.durT || 35,
    updated_at: new Date().toISOString(),
  };
  if (p.equipo) row.equipo = p.equipo;
  if (p.startTs) row.start_ts = p.startTs;
  return row;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

  try {
    const { action, ...args } = await req.json();
    const sb = db();

    switch (action) {
      case "getPartidos": {
        // Auto-finalizar partidos que arrancaron hace más de 2h (quedaron abiertos).
        const dosHorasAtras = Date.now() - 2 * 60 * 60 * 1000;
        await sb.from("ficha_partido_partidos")
          .update({ estado: "finalizado", updated_at: new Date().toISOString() })
          .neq("estado", "finalizado")
          .lt("start_ts", dosHorasAtras);

        // "Retomar" solo si el partido ARRANCÓ (start_ts no nulo) y fue hace <2h.
        // Así una planilla cargada pero nunca jugada no se ofrece como retomable.
        const { data, error } = await sb
          .from("ficha_partido_partidos")
          .select("n_partido,fecha,rival,camada")
          .neq("estado", "finalizado")
          .not("start_ts", "is", null)
          .gte("start_ts", dosHorasAtras)
          .order("updated_at", { ascending: false })
          .limit(10);
        if (error) return json({ error: error.message }, 500);
        return json({
          ok: true,
          partidos: (data || []).map((p) => ({
            id: String(p.n_partido), fecha: String(p.fecha || "").substring(0, 10),
            rival: String(p.rival || ""), camada: String(p.camada || ""),
          })),
        });
      }

      case "getPartido": {
        const id = String(args.id || "");
        const ev = await sb.from("ficha_partido_eventos")
          .select("periodo,minuto,tipo,jugador,puntos,equipo")
          .eq("n_partido", id).order("orden", { ascending: true });
        const pa = await sb.from("ficha_partido_partidos")
          .select("start_ts").eq("n_partido", id).maybeSingle();
        const ro = await sb.from("ficha_partido_roster")
          .select("dorsal,nombre,dni").eq("n_partido", id).order("dorsal", { ascending: true });
        return json({
          ok: true,
          eventos: (ev.data || []).map((e) => ({
            periodo: String(e.periodo || ""), minuto: String(e.minuto || ""), tipo: String(e.tipo || ""),
            jugador: String(e.jugador || ""), pts: Number(e.puntos || 0), equipo: String(e.equipo || "CUBA"),
          })),
          startTimestamp: pa.data?.start_ts ? Number(pa.data.start_ts) : null,
          jugadores: (ro.data || []).map((j) => ({ num: String(j.dorsal || ""), nom: String(j.nombre || ""), dni: String(j.dni || "") })),
        });
      }

      case "getRoster": {
        const ro = await sb.from("ficha_partido_roster")
          .select("dorsal,nombre,dni").eq("n_partido", String(args.id || "")).order("dorsal", { ascending: true });
        return json({ ok: true, jugadores: (ro.data || []).map((j) => ({ num: String(j.dorsal || ""), nom: String(j.nombre || ""), dni: String(j.dni || "") })) });
      }

      case "syncEventos": {
        const p = args.partido || {};
        const id = String(p.nPartido || "");
        if (!id) return json({ error: "sin nPartido" }, 400);
        const up = await sb.from("ficha_partido_partidos").upsert(partidoRow(p), { onConflict: "n_partido" });
        if (up.error) return json({ error: "partido: " + up.error.message }, 500);
        await sb.from("ficha_partido_eventos").delete().eq("n_partido", id);
        const eventos = (args.eventos || []) as any[];
        if (eventos.length) {
          const rows = eventos.map((e, i) => ({
            n_partido: id, periodo: e.periodo || "", minuto: e.minuto || "", tipo: e.tipo || "",
            jugador: e.jugador || "", puntos: e.pts || 0, equipo: e.equipo || "CUBA", orden: i,
          }));
          const ins = await sb.from("ficha_partido_eventos").insert(rows);
          if (ins.error) return json({ error: "eventos: " + ins.error.message }, 500);
        }
        return json({ ok: true });
      }

      case "syncRoster": {
        const id = String(args.nPartido || "");
        if (!id) return json({ error: "sin nPartido" }, 400);
        await sb.from("ficha_partido_roster").delete().eq("n_partido", id);
        const jug = (args.jugadores || []) as any[];
        if (jug.length) {
          const ins = await sb.from("ficha_partido_roster").insert(
            jug.map((j) => ({ n_partido: id, dorsal: j.num, nombre: j.nom, dni: j.dni || "" })),
          );
          if (ins.error) return json({ error: ins.error.message }, 500);
        }
        return json({ ok: true });
      }

      case "setTimestamp": {
        const id = String(args.nPartido || "");
        if (!id) return json({ error: "sin nPartido" }, 400);
        const up = await sb.from("ficha_partido_partidos")
          .upsert({ n_partido: id, start_ts: args.ts }, { onConflict: "n_partido" });
        if (up.error) return json({ error: up.error.message }, 500);
        return json({ ok: true });
      }

      case "finalizarPartido": {
        const id = String(args.nPartido || "");
        if (!id) return json({ error: "sin nPartido" }, 400);
        const up = await sb.from("ficha_partido_partidos")
          .update({ estado: "finalizado", updated_at: new Date().toISOString() })
          .eq("n_partido", id);
        if (up.error) return json({ error: up.error.message }, 500);
        return json({ ok: true });
      }

      case "getPlanillasFecha": {
        const fecha = String(args.fecha || "").substring(0, 10);
        if (!fecha) return json({ error: "sin fecha" }, 400);
        const pa = await sb.from("ficha_partido_partidos")
          .select("n_partido,equipo,rival,fecha,hora,camada,cancha")
          .eq("fecha", fecha);
        if (pa.error) return json({ error: pa.error.message }, 500);
        const partidos = pa.data || [];
        const ids = partidos.map((p) => p.n_partido);
        const rosterBy: Record<string, any[]> = {};
        if (ids.length) {
          const ro = await sb.from("ficha_partido_roster")
            .select("n_partido,dorsal,nombre,dni").in("n_partido", ids)
            .order("dorsal", { ascending: true });
          (ro.data || []).forEach((j) => {
            (rosterBy[j.n_partido] = rosterBy[j.n_partido] || []).push(
              { num: String(j.dorsal || ""), nom: String(j.nombre || ""), dni: String(j.dni || "") },
            );
          });
        }
        const equipos = partidos.map((p) => {
          const m = String(p.equipo || "").match(/([A-D])\s*$/i);
          return {
            equipoLetra: m ? m[1].toUpperCase() : "",
            nPartido: String(p.n_partido), rival: String(p.rival || ""),
            fecha: String(p.fecha || "").substring(0, 10), hora: String(p.hora || ""),
            camada: String(p.camada || ""), cancha: String(p.cancha || ""),
            jugadores: rosterBy[p.n_partido] || [], saved: true,
          };
        }).filter((e) => e.equipoLetra);
        equipos.sort((a, b) => a.equipoLetra.localeCompare(b.equipoLetra));
        return json({ ok: true, equipos });
      }

      case "getFechas": {
        const pa = await sb.from("ficha_partido_partidos").select("fecha").not("fecha", "is", null);
        if (pa.error) return json({ error: pa.error.message }, 500);
        const set = new Set(
          (pa.data || []).map((p) => String(p.fecha || "").substring(0, 10)).filter(Boolean),
        );
        return json({ ok: true, fechas: Array.from(set) });
      }

      default:
        return json({ error: "acción desconocida: " + action }, 400);
    }
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
