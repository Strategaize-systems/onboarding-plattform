"use client";

import { TopicCard } from "./topic-card";
import type { MeetingGuideTopic } from "@/types/meeting-guide";

interface Props {
  topics: MeetingGuideTopic[];
  templateBlocks: Array<{ key: string; title: string }>;
  onUpdate: (index: number, topic: MeetingGuideTopic) => void;
  onDelete: (index: number) => void;
  onMove: (index: number, direction: "up" | "down") => void;
}

export function TopicList({
  topics,
  templateBlocks,
  onUpdate,
  onDelete,
  onMove,
}: Props) {
  return (
    <div className="space-y-3">
      {topics.map((topic, index) => (
        <TopicCard
          key={topic.key}
          topic={topic}
          index={index}
          isFirst={index === 0}
          isLast={index === topics.length - 1}
          templateBlocks={templateBlocks}
          onUpdate={(updated) => onUpdate(index, updated)}
          onDelete={() => onDelete(index)}
          onMoveUp={() => onMove(index, "up")}
          onMoveDown={() => onMove(index, "down")}
        />
      ))}
    </div>
  );
}
