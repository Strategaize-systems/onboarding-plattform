"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Menu,
  X,
  Send,
  Sparkles,
  Loader2,
  Check,
} from "lucide-react";
import type { TemplateBlock, TemplateQuestion } from "@/lib/db/template-queries";
import { saveAnswer } from "./actions";

interface Props {
  sessionId: string;
  activeBlockKey: string;
  templateName: string;
  blocks: TemplateBlock[];
  savedAnswers: Record<string, string>;
  locale: string;
}

export function QuestionnaireWorkspace({
  sessionId,
  activeBlockKey,
  templateName,
  blocks,
  savedAnswers,
  locale,
}: Props) {
  // All questions from all blocks — flattened for counting
  const allQuestions = blocks.flatMap((b) =>
    b.questions.map((q) => ({ ...q, blockKey: b.key }))
  );

  // Current block
  const activeBlock = blocks.find((b) => b.key === activeBlockKey);
  const activeQuestions = activeBlock
    ? [...activeBlock.questions].sort((a, b) => a.position - b.position)
    : [];

  // Local answer state — ALL answers across blocks
  const [answers, setAnswers] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const q of allQuestions) {
      const key = `${q.blockKey}.${q.id}`;
      initial[key] = savedAnswers[key] ?? "";
    }
    return initial;
  });

  // Active question selection
  const [activeQuestionId, setActiveQuestionId] = useState<string | null>(
    activeQuestions[0]?.id ?? null
  );

  // Sidebar state
  const [openBlocks, setOpenBlocks] = useState<Set<string>>(
    new Set([activeBlockKey])
  );
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Save state
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [message, setMessage] = useState<{
    text: string;
    type: "success" | "error";
  } | null>(null);

  // Chat state
  const [chatMessages, setChatMessages] = useState<
    { role: "user" | "assistant"; text: string }[]
  >([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Debounce timer
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);

  // ─── Derived state ──────────────────────────────────────────────
  const activeQ = activeQuestions.find((q) => q.id === activeQuestionId);
  const answerKey = activeQ ? `${activeBlockKey}.${activeQ.id}` : "";
  const answerText = answerKey ? answers[answerKey] ?? "" : "";

  // Progress: gesamt
  const totalQuestions = allQuestions.length;
  const totalAnswered = allQuestions.filter(
    (q) => (answers[`${q.blockKey}.${q.id}`] ?? "").trim().length > 0
  ).length;
  const totalPercent =
    totalQuestions > 0 ? Math.round((totalAnswered / totalQuestions) * 100) : 0;

  // Progress: block
  const blockQuestions = activeQuestions;
  const blockAnswered = blockQuestions.filter(
    (q) =>
      (answers[`${activeBlockKey}.${q.id}`] ?? "").trim().length > 0
  ).length;
  const blockTotal = blockQuestions.length;
  const blockPercent =
    blockTotal > 0 ? Math.round((blockAnswered / blockTotal) * 100) : 0;

  // ─── Autosave ───────────────────────────────────────────────────
  const doSave = useCallback(
    async (key: string, value: string) => {
      const [bk, qId] = key.split(".");
      setSaving(true);
      setSaved(false);
      try {
        const result = await saveAnswer(sessionId, bk, qId, value);
        if (result?.error) {
          setMessage({ text: result.error, type: "error" });
        } else {
          setSaved(true);
          setTimeout(() => setSaved(false), 2000);
        }
      } catch {
        setMessage({ text: "Speichern fehlgeschlagen", type: "error" });
      } finally {
        setSaving(false);
      }
    },
    [sessionId]
  );

  function handleAnswerChange(value: string) {
    if (!answerKey) return;
    setAnswers((prev) => ({ ...prev, [answerKey]: value }));
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      doSave(answerKey, value);
    }, 500);
  }

  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, []);

  // ─── Question selection ─────────────────────────────────────────
  function selectQuestion(q: TemplateQuestion) {
    setActiveQuestionId(q.id);
    setChatMessages([]);
    setChatInput("");
    setMessage(null);
    setSidebarOpen(false);
  }

  function toggleBlock(blockKey: string) {
    setOpenBlocks((prev) => {
      const next = new Set(prev);
      if (next.has(blockKey)) next.delete(blockKey);
      else next.add(blockKey);
      return next;
    });
  }

  // ─── Chat ───────────────────────────────────────────────────────
  async function sendChatMessage() {
    if (!chatInput.trim() || !activeQ || chatLoading) return;
    const messageText = chatInput.trim();
    setChatMessages((prev) => [...prev, { role: "user", text: messageText }]);
    setChatInput("");
    setChatLoading(true);

    try {
      const res = await fetch("/api/chat/block", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          blockKey: activeBlockKey,
          questionId: activeQ.id,
          message: messageText,
          chatHistory: chatMessages,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setChatMessages((prev) => [
          ...prev,
          { role: "assistant", text: data.response },
        ]);
      } else {
        setChatMessages((prev) => [
          ...prev,
          { role: "assistant", text: "KI-Antwort konnte nicht geladen werden." },
        ]);
      }
    } catch {
      setChatMessages((prev) => [
        ...prev,
        { role: "assistant", text: "Verbindungsfehler." },
      ]);
    } finally {
      setChatLoading(false);
      setTimeout(() => {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 50);
    }
  }

  // ─── Group questions by unterbereich (for sidebar) ──────────────
  function groupByUnterbereich(questions: TemplateQuestion[]) {
    const groups: { label: string; questions: TemplateQuestion[] }[] = [];
    let currentLabel = "";
    let currentGroup: TemplateQuestion[] = [];
    for (const q of [...questions].sort((a, b) => a.position - b.position)) {
      if (q.unterbereich !== currentLabel) {
        if (currentGroup.length > 0)
          groups.push({ label: currentLabel, questions: currentGroup });
        currentLabel = q.unterbereich;
        currentGroup = [q];
      } else {
        currentGroup.push(q);
      }
    }
    if (currentGroup.length > 0)
      groups.push({ label: currentLabel, questions: currentGroup });
    return groups;
  }

  // ─── Block title helper ─────────────────────────────────────────
  function blockTitle(block: TemplateBlock): string {
    if (typeof block.title === "object") {
      return (
        (block.title as Record<string, string>)[locale] ??
        (block.title as Record<string, string>)["de"] ??
        Object.values(block.title as Record<string, string>)[0] ??
        block.key
      );
    }
    return block.key;
  }

  // ─── Sidebar ────────────────────────────────────────────────────
  const sortedBlocks = [...blocks].sort((a, b) => a.order - b.order);

  const sidebar = (
    <div
      className="flex h-full flex-col"
      style={{ background: "var(--gradient-sidebar)" }}
    >
      {/* Logo block */}
      <div className="mx-3 mt-3 rounded-xl bg-gradient-to-b from-slate-800/80 to-slate-900/50 border border-white/[0.06] px-5 py-5 text-center">
        <div className="mx-auto w-fit rounded-2xl bg-white p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/logo-full.png"
            alt="StrategAIze"
            className="h-12 w-auto"
          />
        </div>
      </div>
      {/* Template title */}
      <div className="mx-3 mt-2 rounded-xl bg-gradient-to-b from-slate-800/80 to-slate-900/50 border border-white/[0.06] px-5 py-4 text-center">
        <div className="text-sm font-bold text-white">{templateName}</div>
        <div className="text-[11px] text-slate-500 mt-0.5">
          Exit-Readiness Assessment
        </div>
      </div>
      <div className="h-3" />

      {/* Expand/Collapse all */}
      <div className="px-3 pb-1">
        <button
          onClick={() => {
            const allOpen = openBlocks.size === sortedBlocks.length;
            setOpenBlocks(
              allOpen ? new Set() : new Set(sortedBlocks.map((b) => b.key))
            );
          }}
          className="w-full rounded-lg px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 hover:text-slate-300 hover:bg-white/[0.04] transition-colors text-center"
        >
          {openBlocks.size === sortedBlocks.length
            ? "Alle einklappen"
            : "Alle aufklappen"}
        </button>
      </div>

      {/* Block navigation */}
      <div className="flex-1 overflow-y-auto px-3 py-1">
        {sortedBlocks.map((block) => {
          const bQuestions = [...block.questions].sort(
            (a, b) => a.position - b.position
          );
          const bAnswered = bQuestions.filter(
            (q) =>
              (answers[`${block.key}.${q.id}`] ?? "").trim().length > 0
          ).length;
          const isOpen = openBlocks.has(block.key);
          const isActiveBlock = block.key === activeBlockKey;
          const hasActiveQuestion = bQuestions.some(
            (q) => q.id === activeQuestionId
          );
          const untergruppen = groupByUnterbereich(bQuestions);

          return (
            <div key={block.key} className="mb-1.5">
              <button
                onClick={() => toggleBlock(block.key)}
                className={`flex w-full items-center gap-3 rounded-xl px-4 py-3.5 text-left transition-all duration-200 ${
                  isOpen || hasActiveQuestion
                    ? "bg-gradient-to-r from-brand-primary to-brand-primary-dark text-white shadow-[0_8px_16px_-4px_rgba(68,84,184,0.35)]"
                    : "text-slate-300 hover:bg-white/[0.06]"
                }`}
              >
                <div
                  className={`h-2.5 w-2.5 flex-shrink-0 rounded-full ${
                    bAnswered === bQuestions.length && bQuestions.length > 0
                      ? "bg-gradient-to-br from-brand-success-dark to-brand-success shadow-[0_0_8px_rgba(0,168,79,0.5)]"
                      : bAnswered > 0
                        ? "bg-gradient-to-br from-brand-warning-dark to-brand-warning shadow-[0_0_8px_rgba(242,183,5,0.5)]"
                        : "bg-slate-600"
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold leading-snug">
                    Block {block.key}: {blockTitle(block)}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span
                      className={`text-[10px] uppercase tracking-wider font-semibold ${isOpen || hasActiveQuestion ? "text-white/50" : "text-slate-500"}`}
                    >
                      Analyse
                    </span>
                    <span
                      className={`text-[10px] ${isOpen || hasActiveQuestion ? "text-white/30" : "text-slate-600"}`}
                    >
                      &bull;
                    </span>
                    <span
                      className={`text-[10px] tabular-nums font-bold ${isOpen || hasActiveQuestion ? "text-white/50" : "text-slate-500"}`}
                    >
                      {bAnswered}/{bQuestions.length}
                    </span>
                  </div>
                </div>
                {isOpen ? (
                  <ChevronDown className="h-4 w-4 flex-shrink-0 text-white/40" />
                ) : (
                  <ChevronRight className="h-4 w-4 flex-shrink-0 text-slate-600" />
                )}
              </button>

              {isOpen && (
                <div className="py-2 pl-3">
                  {untergruppen.map((group) => (
                    <div key={group.label} className="mb-2">
                      <div className="px-3 py-1.5">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-brand-primary">
                          {group.label.replace(
                            /^Block\s+\w+\s*\/\s*\w+\s*/,
                            ""
                          )}
                        </span>
                      </div>
                      {group.questions.map((q) => {
                        const isActive =
                          activeQuestionId === q.id && isActiveBlock;
                        const hasAnswer =
                          (
                            answers[`${block.key}.${q.id}`] ?? ""
                          ).trim().length > 0;
                        return (
                          <button
                            key={q.id}
                            onClick={() => {
                              if (block.key !== activeBlockKey) {
                                // Navigate to different block
                                window.location.href = `/capture/${sessionId}/block/${block.key}`;
                              } else {
                                selectQuestion(q);
                              }
                            }}
                            className={`group flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-all duration-150 ${
                              isActive
                                ? "bg-brand-primary/20 text-white"
                                : "text-slate-400 hover:bg-white/[0.04] hover:text-slate-300"
                            }`}
                          >
                            <div
                              className={`h-2 w-2 flex-shrink-0 rounded-full ${
                                hasAnswer
                                  ? "bg-brand-success shadow-[0_0_6px_rgba(0,168,79,0.5)]"
                                  : "bg-slate-600"
                              }`}
                            />
                            <p
                              className={`text-xs leading-snug line-clamp-2 flex-1 ${isActive ? "font-medium" : ""}`}
                            >
                              {q.text}
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Back to overview */}
      <div className="border-t border-white/[0.06] px-4 py-4">
        <Link
          href={`/capture/${sessionId}`}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand-primary/20 to-brand-primary-dark/20 px-3 py-3 text-sm font-semibold text-slate-300 transition-all hover:from-brand-primary/30 hover:to-brand-primary-dark/30 hover:text-white"
        >
          Zurück zur Übersicht
        </Link>
      </div>
    </div>
  );

  // ─── Main content ───────────────────────────────────────────────
  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      {/* Mobile sidebar toggle */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="fixed left-4 top-4 z-50 rounded-lg bg-white p-2 shadow-md lg:hidden"
      >
        {sidebarOpen ? (
          <X className="h-5 w-5" />
        ) : (
          <Menu className="h-5 w-5" />
        )}
      </button>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-[280px] transform transition-transform duration-300 lg:relative lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {sidebar}
      </aside>

      {/* Main area */}
      <div className="flex flex-1 flex-col overflow-hidden lg:ml-0">
        {/* Header — Dual Progress */}
        <header className="flex-shrink-0 bg-white/95 backdrop-blur-xl border-b border-slate-200/60 shadow-sm">
          <div className="flex items-center justify-between gap-8 px-8 py-5">
            {/* LEFT: Title + Breadcrumb */}
            <div className="flex-shrink-0 min-w-0 pl-10 lg:pl-0">
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight mb-1 truncate">
                {templateName}
              </h1>
              <div className="flex items-center gap-2.5 text-sm text-slate-600">
                {activeQ ? (
                  <>
                    <span className="font-semibold truncate">
                      Block {activeBlockKey}:{" "}
                      {activeBlock ? blockTitle(activeBlock) : ""}
                    </span>
                    <span className="text-slate-300">&bull;</span>
                    <span className="font-medium truncate">
                      {activeQ.unterbereich.replace(
                        /^Block\s+\w+\s*\/\s*\w+\s*/,
                        ""
                      )}
                    </span>
                  </>
                ) : (
                  <span className="text-slate-400">Frage auswählen</span>
                )}
              </div>
            </div>

            {/* CENTER: Dual Progress */}
            <div className="flex-1 max-w-sm space-y-2.5 hidden md:block">
              {/* Gesamt */}
              <div className="flex items-center gap-4">
                <div className="w-16 text-right">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    Gesamt
                  </span>
                </div>
                <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-brand-success-dark to-brand-success transition-all duration-700 ease-out"
                    style={{ width: `${totalPercent}%` }}
                  />
                </div>
                <div className="w-12 text-right">
                  <span className="text-sm font-bold text-slate-900 tabular-nums">
                    {totalPercent}%
                  </span>
                </div>
              </div>
              {/* Block */}
              <div className="flex items-center gap-4">
                <div className="w-16 text-right">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    Block
                  </span>
                </div>
                <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-brand-primary to-brand-primary-dark transition-all duration-700 ease-out"
                    style={{ width: `${blockPercent}%` }}
                  />
                </div>
                <div className="w-12 text-right">
                  <span className="text-sm font-bold text-slate-900 tabular-nums">
                    {blockPercent}%
                  </span>
                </div>
              </div>
            </div>

            {/* RIGHT: Status */}
            <div className="flex items-center gap-3 flex-shrink-0">
              <div className="px-4 py-2.5 rounded-lg bg-gradient-to-r from-amber-400 to-amber-500 text-white shadow-md text-xs font-bold uppercase tracking-wider flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-white/80 animate-pulse" />
                In Bearbeitung
              </div>
            </div>
          </div>
        </header>

        {/* Message bar */}
        {message && (
          <div className="flex-shrink-0 px-6 pt-3">
            <Alert
              variant={message.type === "error" ? "destructive" : "default"}
            >
              <AlertDescription>{message.text}</AlertDescription>
            </Alert>
          </div>
        )}

        {/* Content area */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {activeQ ? (
            <div className="mx-auto max-w-6xl w-full space-y-3">
              {/* Question card */}
              <div className="relative bg-white rounded-2xl border-2 border-slate-200 shadow-lg overflow-hidden">
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-brand-primary-dark via-brand-primary to-brand-success-dark" />
                <div className="relative px-6 py-4 flex items-center gap-4">
                  <div className="inline-flex items-center px-3 py-1.5 rounded-lg bg-gradient-to-r from-brand-primary-dark to-brand-primary text-white shadow-md">
                    <span className="text-xs font-bold">
                      {activeQ.frage_id}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-base font-bold text-slate-900 leading-snug">
                      {activeQ.text}
                    </h2>
                    <div className="flex items-center gap-2 mt-1 text-xs text-slate-400">
                      <span>
                        {activeQ.unterbereich.replace(
                          /^Block\s+\w+\s*\/\s*\w+\s*/,
                          ""
                        )}
                      </span>
                      <span>&bull;</span>
                      <span className="font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 uppercase text-[10px]">
                        {activeQ.ebene}
                      </span>
                      {activeQ.deal_blocker && (
                        <>
                          <span>&bull;</span>
                          <span className="font-bold px-1.5 py-0.5 rounded bg-red-50 text-red-500 uppercase text-[10px]">
                            Deal-Blocker
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Side-by-side: Chat+Answer (2/3) + Info (1/3) */}
              <div
                className="grid grid-cols-1 xl:grid-cols-3 gap-3"
                style={{ height: "calc(100vh - 260px)" }}
              >
                {/* Chat + Answer area (2/3) */}
                <div className="xl:col-span-2 bg-white rounded-2xl border-2 border-slate-200 shadow-lg overflow-hidden flex flex-col">
                  {/* Header */}
                  <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/50">
                    <label className="text-sm font-bold text-slate-900 uppercase tracking-wide flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-gradient-to-r from-brand-primary-dark to-brand-primary" />
                      Ihre Antwort
                      {chatMessages.length > 0 && (
                        <span className="ml-2 text-xs font-semibold px-2 py-0.5 rounded-full bg-brand-primary/10 text-brand-primary">
                          {chatMessages.length} Nachrichten
                        </span>
                      )}
                      {/* Save indicator */}
                      {saving && (
                        <Loader2 className="ml-auto h-3.5 w-3.5 text-slate-400 animate-spin" />
                      )}
                      {saved && (
                        <Check className="ml-auto h-3.5 w-3.5 text-green-500" />
                      )}
                    </label>
                  </div>

                  {/* Chat messages — scrollable */}
                  <div className="flex-1 overflow-y-auto">
                    {chatMessages.length > 0 ? (
                      <div className="px-5 py-3 space-y-2">
                        {chatMessages.map((msg, i) => (
                          <div
                            key={i}
                            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                          >
                            <div
                              className={`max-w-[75%] rounded-xl px-3 py-2 text-xs leading-relaxed ${
                                msg.role === "user"
                                  ? "bg-brand-primary text-white rounded-br-sm"
                                  : "bg-slate-100 text-slate-700 rounded-bl-sm"
                              }`}
                            >
                              {msg.text}
                              {msg.role === "assistant" && (
                                <div className="mt-2 pt-2 border-t border-slate-200/50">
                                  <button
                                    onClick={() =>
                                      handleAnswerChange(msg.text)
                                    }
                                    className="text-[10px] font-medium text-brand-primary hover:text-brand-primary-dark transition-colors"
                                  >
                                    Als Antwort übernehmen
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                        {chatLoading && (
                          <div className="flex justify-start">
                            <div className="bg-slate-100 rounded-xl px-4 py-3 flex items-center gap-2">
                              <Loader2 className="h-3.5 w-3.5 text-brand-primary animate-spin" />
                              <span className="text-xs text-slate-500">
                                Denkt nach...
                              </span>
                            </div>
                          </div>
                        )}
                        <div ref={chatEndRef} />
                      </div>
                    ) : (
                      <div className="flex-1 flex items-center justify-center py-8">
                        <p className="text-xs text-slate-400">
                          Stellen Sie dem KI-Assistenten Fragen oder
                          beantworten Sie die Frage direkt unten.
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Input area */}
                  <div className="flex-shrink-0 px-5 py-3 border-t border-slate-200 bg-white">
                    <div className="flex items-end gap-2">
                      <textarea
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            sendChatMessage();
                          }
                        }}
                        placeholder="Frage an den KI-Assistenten stellen..."
                        rows={4}
                        className="flex-1 px-3 py-2 rounded-lg border border-slate-200 text-sm leading-relaxed focus:border-brand-primary focus:outline-none transition-colors resize-none"
                      />
                      <div className="flex flex-col gap-1.5 flex-shrink-0 self-end">
                        <button
                          onClick={sendChatMessage}
                          disabled={!chatInput.trim() || chatLoading}
                          className="p-2.5 rounded-lg bg-brand-primary text-white disabled:opacity-50 hover:bg-brand-primary-dark transition-all"
                        >
                          {chatLoading ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Send className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Action bar */}
                  <div className="px-6 py-4 border-t-2 border-slate-100 bg-slate-50/30">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-500 tabular-nums">
                        {answerText
                          ? `${answerText.length} Zeichen`
                          : "Noch keine Antwort"}
                      </span>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => {
                            if (!answerText.trim()) return;
                            handleAnswerChange(answerText);
                          }}
                          disabled={saving || !answerText.trim()}
                          className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-brand-primary-dark via-brand-primary to-brand-primary-dark text-white font-bold shadow-xl shadow-brand-primary/30 hover:shadow-2xl hover:scale-[1.02] transition-all disabled:opacity-50 disabled:hover:scale-100 flex items-center gap-2"
                        >
                          {saving ? "Speichert..." : "Speichern"}
                          {!saving && <span>&#10003;</span>}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right column — answer preview + info */}
                <div className="xl:col-span-1 bg-white rounded-2xl border-2 border-slate-200 shadow-lg overflow-hidden flex flex-col">
                  <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/50 flex-shrink-0">
                    <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wide flex items-center gap-2">
                      <div className="w-6 h-6 rounded-md bg-gradient-to-br from-slate-600 to-slate-700 flex items-center justify-center">
                        <FileText className="h-3 w-3 text-white" />
                      </div>
                      Aktuelle Antwort
                    </h3>
                  </div>
                  <div className="flex-1 overflow-y-auto p-4">
                    {answerText.trim() ? (
                      <div className="space-y-3">
                        <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                          {answerText}
                        </p>
                        <div className="text-xs text-slate-400 tabular-nums">
                          {answerText.length} Zeichen
                        </div>
                      </div>
                    ) : (
                      <div className="py-6 text-center">
                        <p className="text-sm text-slate-400">
                          Noch keine Antwort
                        </p>
                        <p className="text-xs text-slate-400 mt-1">
                          Nutzen Sie den KI-Assistenten oder
                          beantworten Sie direkt.
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Direct answer input (alternative to chat) */}
                  <div className="flex-shrink-0 px-4 py-3 border-t border-slate-200">
                    <textarea
                      value={answerText}
                      onChange={(e) => handleAnswerChange(e.target.value)}
                      placeholder="Direkte Antwort eingeben..."
                      rows={4}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm leading-relaxed focus:border-brand-primary focus:outline-none transition-colors resize-none"
                    />
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100">
                  <FileText className="h-8 w-8 text-slate-300" />
                </div>
                <p className="text-lg font-semibold text-slate-400">
                  Frage auswählen
                </p>
                <p className="mt-1 text-sm text-slate-400">
                  Wählen Sie eine Frage in der Seitenleiste aus.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
