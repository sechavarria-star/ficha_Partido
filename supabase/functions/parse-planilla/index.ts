// ============================================================
// Edge Function: parse-planilla
// Recibe un PDF (cuerpo binario) de una planilla URBA, extrae su capa de
// texto SIN OCR (unpdf/pdf.js) y devuelve la planilla parseada en JSON.
// Reemplaza al OCR de Drive: ~1-2 s por PDF, sin rate limit.
// ============================================================
import { extractText, getDocumentProxy } from "https://esm.sh/unpdf@0.12.1";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

interface Jugador { num: string; nom: string; dni: string; }
interface Planilla {
  nPartido: string; equipoLetra: string; rival: string;
  fecha: string; hora: string; camada: string; cancha: string;
  jugadores: Jugador[];
}

function firstNonEmptyLine(s: string): string {
  for (const line of String(s).split("\n")) {
    const t = line.trim();
    if (t) return t;
  }
  return "";
}

// Nombre de equipo después de un marcador, acotado por anclas de fin.
// Robusto tanto a texto con saltos de línea (OCR) como casi sin ellos (unpdf).
function teamAfter(text: string, startRe: RegExp, endRes: RegExp[]): string {
  const p = text.split(startRe);
  if (p.length < 2) return "";
  let seg = p[1];
  let cut = seg.length;
  for (const e of endRes) {
    const mm = seg.match(e);
    if (mm && mm.index !== undefined && mm.index < cut) cut = mm.index;
  }
  return firstNonEmptyLine(seg.slice(0, cut)).trim();
}

const END_LOCAL = [/Visitante\s+Puntos/i];
const END_VISIT = [/Indicar/i, /Informaci[oó]n/i, /Pos\s*Dor/i, /Local\s+Puntos/i];

function limpiarRival(s: string): string {
  return String(s).replace(/CUBA\s+[A-D]\b/gi, "").replace(/\s{2,}/g, " ").trim();
}

// Guarda partido + roster en la base (service_role, bypass RLS). Idempotente:
// upsert del partido por n_partido y reemplazo del roster.
async function guardarEnBase(p: Planilla): Promise<{ saved: boolean; error?: string }> {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return { saved: false, error: "Sin SUPABASE_URL/SERVICE_ROLE_KEY" };
  try {
    const sb = createClient(url, key);
    const up = await sb.from("ficha_partido_partidos").upsert({
      n_partido: p.nPartido,
      equipo: "CUBA " + p.equipoLetra,
      rival: p.rival,
      fecha: p.fecha || null,
      hora: p.hora,
      camada: p.camada,
      cancha: p.cancha,
      updated_at: new Date().toISOString(),
    }, { onConflict: "n_partido" });
    if (up.error) return { saved: false, error: up.error.message };

    await sb.from("ficha_partido_roster").delete().eq("n_partido", p.nPartido);
    if (p.jugadores.length) {
      const ins = await sb.from("ficha_partido_roster").insert(
        p.jugadores.map((j) => ({ n_partido: p.nPartido, dorsal: j.num, nombre: j.nom, dni: j.dni })),
      );
      if (ins.error) return { saved: false, error: ins.error.message };
    }
    return { saved: true };
  } catch (e) {
    return { saved: false, error: String((e as Error)?.message ?? e) };
  }
}

// Mismo parser que el de Apps Script (parsePlanilla_), validado contra los PDF reales.
export function parsePlanilla(text: string): Planilla {
  const res: Planilla = { nPartido: "", equipoLetra: "", rival: "", fecha: "", hora: "", camada: "", cancha: "", jugadores: [] };

  const mNum = text.match(/partido[^0-9]{0,15}?(\d{4,})/i);
  if (mNum) res.nPartido = mNum[1];

  const mCuba = text.match(/\bCUBA\s+([A-D])\b/i);
  if (mCuba) res.equipoLetra = mCuba[1].toUpperCase();

  const localTeam = teamAfter(text, /Local\s+Puntos/i, END_LOCAL);
  const visitTeam = teamAfter(text, /Visitante\s+Puntos/i, END_VISIT);

  const cubaEnLocal = /CUBA/i.test(localTeam);
  const cubaEnVisit = /CUBA/i.test(visitTeam);
  let cubaLocal: boolean;
  if (cubaEnLocal && !cubaEnVisit) cubaLocal = true;
  else if (cubaEnVisit && !cubaEnLocal) cubaLocal = false;
  else { const mLV = text.match(/equipo\s+(LOCAL|VISITANTE)/i); cubaLocal = mLV ? /LOCAL/i.test(mLV[1]) : true; }
  res.cancha = cubaLocal ? "Local" : "Visitante";

  let rival = limpiarRival(cubaLocal ? visitTeam : localTeam);
  if (!rival) rival = limpiarRival(cubaLocal ? localTeam : visitTeam);
  res.rival = rival;

  const mFecha = text.match(/(\d{4}-\d{2}-\d{2})/);
  if (mFecha) res.fecha = mFecha[1];
  const mHora = text.match(/\d{4}-\d{2}-\d{2}\s+(\d{1,2}:\d{2})/);
  if (mHora) res.hora = mHora[1];
  const mCam = text.match(/Menores de\s+(\d{2})/i);
  if (mCam) res.camada = "M" + mCam[1];

  const flat = text.replace(/\r/g, " ").replace(/\n/g, " ");
  const re = /(\d{1,2})\s+(?:✖\s*)?([A-Za-zÀ-ſ'’.\-]+(?:\s+[A-Za-zÀ-ſ'’.\-]+)*\s*,\s*[A-Za-zÀ-ſ'’.\-]+(?:\s+[A-Za-zÀ-ſ'’.\-]+)*)\s+(\d{6,9})/g;
  let m: RegExpExecArray | null;
  const seen: Record<string, boolean> = {};
  while ((m = re.exec(flat)) !== null) {
    const dni = m[3];
    if (seen[dni]) continue;
    seen[dni] = true;
    res.jugadores.push({ num: m[1].replace(/^0+/, "") || "0", nom: m[2].replace(/\s+/g, " ").trim(), dni });
  }
  return res;
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

  try {
    const buf = new Uint8Array(await req.arrayBuffer());
    if (!buf.length) return json({ error: "PDF vacío" }, 400);
    const pdf = await getDocumentProxy(buf);
    const { text } = await extractText(pdf, { mergePages: true });
    const planilla = parsePlanilla(text as string);

    // Persistir en la base si se reconoció el partido.
    let saved = false, saveError: string | undefined;
    if (planilla.nPartido && planilla.equipoLetra) {
      const r = await guardarEnBase(planilla);
      saved = r.saved; saveError = r.error;
    }
    return json({ ...planilla, saved, saveError });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
