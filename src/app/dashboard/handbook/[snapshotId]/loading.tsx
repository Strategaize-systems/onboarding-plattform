// SLC-051 MT-5 — Next.js Suspense-Fallback fuer den Reader.
//
// Next.js zeigt diese Datei automatisch als Suspense-Fallback an, sobald
// der User zu /dashboard/handbook/<id> navigiert (oder auf einen anderen
// Snapshot klickt). Sobald die Server-Component fertig geladen ist, wird
// der Skeleton nahtlos durch den echten Reader ersetzt.

import { ReaderSkeleton } from "@/components/handbook/reader-skeleton";

export default function HandbookReaderLoading() {
  return <ReaderSkeleton />;
}
