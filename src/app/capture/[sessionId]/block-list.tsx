"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  deriveBlockStatus,
  type BlockCheckpointInput,
  type BlockStatus,
} from "@/lib/capture/derive-block-status";
import type { TemplateBlock } from "@/lib/db/template-queries";
import { useLocale } from "next-intl";

interface Props {
  blocks: TemplateBlock[];
  checkpointsByBlock: Record<string, BlockCheckpointInput[]>;
  kuBlockKeys: string[];
  sessionId: string;
}

const STATUS_CONFIG: Record<
  BlockStatus,
  { label: string; color: string; bg: string }
> = {
  open: {
    label: "Offen",
    color: "text-muted-foreground",
    bg: "bg-muted",
  },
  submitted: {
    label: "Eingereicht",
    color: "text-blue-700 dark:text-blue-400",
    bg: "bg-blue-100 dark:bg-blue-900/30",
  },
  reviewed: {
    label: "Ausgewertet",
    color: "text-amber-700 dark:text-amber-400",
    bg: "bg-amber-100 dark:bg-amber-900/30",
  },
  finalized: {
    label: "Finalisiert",
    color: "text-green-700 dark:text-green-400",
    bg: "bg-green-100 dark:bg-green-900/30",
  },
};

export function BlockList({
  blocks,
  checkpointsByBlock,
  kuBlockKeys,
  sessionId,
}: Props) {
  const locale = useLocale();
  const sortedBlocks = [...blocks].sort((a, b) => a.order - b.order);
  const kuSet = new Set(kuBlockKeys);

  return (
    <div className="space-y-3">
      {sortedBlocks.map((block) => {
        const checkpoints = checkpointsByBlock[block.key] ?? [];
        const status = deriveBlockStatus(checkpoints, kuSet.has(block.key));
        const config = STATUS_CONFIG[status];
        const title =
          typeof block.title === "object"
            ? (block.title as Record<string, string>)[locale] ??
              (block.title as Record<string, string>)["de"] ??
              block.key
            : block.title;

        return (
          <Card key={block.id} className="hover:border-primary/30 transition-colors">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">
                  <span className="text-muted-foreground mr-2">
                    Block {block.key}
                  </span>
                  {title}
                </CardTitle>
                <span
                  className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${config.bg} ${config.color}`}
                >
                  {config.label}
                </span>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <p className="text-sm text-muted-foreground">
                {block.questions.length} Fragen
              </p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
