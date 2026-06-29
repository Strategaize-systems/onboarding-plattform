// SLC-172 MT-1 /qa Live-Smoke — echter EU-Bedrock-Assess-Pfad (AC-172-6).
// Gated via RUN_BEDROCK_SMOKE=true. Ruft den GLEICHEN chatWithLLM + parseAmpel,
// die assessAnswerAmpel produktiv nutzt (Prompt 1:1 aus
// src/app/dashboard/stb/blueprint/actions.ts). Verifiziert: (a) chatWithLLM
// erreicht eu-central-1 Bedrock, (b) der Assess-Prompt liefert eine Ampel,
// die parseAmpel sauber aufloest, (c) eine solide Antwort -> green, eine klar
// problematische Antwort -> yellow/rot. Kein DB-/Auth-/Browser-Pfad (separat).
import { describe, it, expect } from "vitest";
import { chatWithLLM } from "@/lib/llm";
import { parseAmpel, type Ampel } from "@/lib/stb-vertikale/blueprint";

const RUN = process.env.RUN_BEDROCK_SMOKE === "true";

async function assess(unterbereich: string, frage: string, antwort: string): Promise<{ raw: string; ampel: Ampel }> {
  const raw = await chatWithLLM(
    [
      {
        role: "system",
        content:
          "Du bewertest EINE Selbstauskunft eines Steuerberaters zur eigenen " +
          "Kanzlei und stufst sie als Ampel ein: green (solide/kein Handlungs" +
          "bedarf), yellow (Luecke/Beobachtung), red (klarer Handlungsbedarf/" +
          "Risiko). Im Zweifel yellow. Antworte AUSSCHLIESSLICH mit JSON: " +
          '{"ampel":"green|yellow|red"} — keine Erklaerung.',
      },
      {
        role: "user",
        content: `Unterthema: ${unterbereich}\nFrage: ${frage}\nAntwort des StB: ${antwort}`,
      },
    ],
    { temperature: 0, maxTokens: 64 }
  );
  return { raw, ampel: parseAmpel(raw) };
}

describe.runIf(RUN)("Blueprint adaptive assess — live EU-Bedrock", () => {
  it("solide Kern-Antwort -> green (keine Vertiefung noetig)", async () => {
    const r = await assess(
      "f1_inhaberabhaengigkeit",
      "Wie stark haengt die Kanzlei am Inhaber?",
      "Die Kanzlei ist klar arbeitsteilig: drei eingearbeitete Teamleiter mit Mandatsverantwortung, dokumentierte Prozesse, Stellvertreterregelung greift seit Jahren, der Inhaber war zuletzt 4 Wochen abwesend ohne Probleme."
    );
    console.log("[GREEN-CASE]", JSON.stringify(r));
    expect(["green", "yellow", "red"]).toContain(r.ampel);
    expect(r.ampel).toBe("green");
  }, 60_000);

  it("klar problematische Kern-Antwort -> yellow/red (Vertiefung surfacet)", async () => {
    const r = await assess(
      "f1_inhaberabhaengigkeit",
      "Wie stark haengt die Kanzlei am Inhaber?",
      "Ohne mich laeuft gar nichts. Ich habe alle Mandantenbeziehungen, keine Stellvertretung, keine dokumentierten Prozesse, und wenn ich zwei Wochen ausfalle bricht der Laden zusammen."
    );
    console.log("[RED-CASE]", JSON.stringify(r));
    expect(["yellow", "red"]).toContain(r.ampel);
  }, 60_000);
});
