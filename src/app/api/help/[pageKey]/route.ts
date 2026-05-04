// SLC-055 — Help-Markdown API.
//
// Liefert das page-spezifische Help-Markdown (SLC-050) fuer den
// "Diese Seite"-Tab im Learning Center (DEC-064 Variante 3).
// Wird vom client-side LearningCenterPanel via fetch() geholt.
//
// Help-Inhalte sind nicht-sensitiv und liegen statisch im Repo —
// keine Auth-Pruefung noetig, RLS unbeteiligt.

import { NextResponse } from "next/server";
import { loadHelpMarkdown, listAvailableHelpPages, type HelpPageKey } from "@/lib/help/load";

export const dynamic = "force-static";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ pageKey: string }> },
) {
  const { pageKey } = await params;
  const valid = listAvailableHelpPages();
  if (!valid.includes(pageKey as HelpPageKey)) {
    return NextResponse.json(
      { error: "unknown_page_key" },
      { status: 404 },
    );
  }
  const markdown = loadHelpMarkdown(pageKey as HelpPageKey);
  return new NextResponse(markdown, {
    status: 200,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=3600",
    },
  });
}
