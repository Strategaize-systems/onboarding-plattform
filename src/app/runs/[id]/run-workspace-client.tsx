"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useTranslations, useLocale } from "next-intl";
import Link from "next/link";
import { StatusBadge } from "@/components/status-badge";
import { ProgressIndicator } from "@/components/progress-indicator";
import { EventHistory } from "@/components/event-history";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown, ChevronRight, FileText, Menu, X, MessageCircle, Send, Sparkles, Loader2, Image, Mic, Square, ShieldCheck, Lock } from "lucide-react";
import { HelpButton } from "@/components/help-button";
import { LearningCenterPanel } from "@/components/learning-center/learning-center-panel";
import { RunMemoryView } from "@/components/learning-center/run-memory-view";
import { FreeformChat } from "@/components/freeform/freeform-chat";
import { MappingReview } from "@/components/freeform/mapping-review";
import { WorkspaceTabs, type WorkspaceTab } from "@/components/workspace/workspace-tabs";
import { FeedbackPanel } from "@/components/workspace/feedback-panel";

const EVIDENCE_LABEL_KEYS = ["policy", "process", "template", "contract", "financial", "legal", "system", "org", "kpi", "other"] as const;

const EVIDENCE_RELATION_KEYS = ["proof", "supports", "example", "supersedes"] as const;

interface Question {
  id: string;
  frage_id: string;
  block: string;
  ebene: string;
  unterbereich: string;
  fragetext: string;
  position: number;
  latest_answer: string | null;
  evidence_count: number;
}

interface Run {
  id: string;
  title: string;
  description: string | null;
  status: string;
  created_at: string;
  submitted_at: string | null;
  questions: Question[];
}

interface EvidenceItem {
  id: string;
  item_type: "file" | "note";
  label: string;
  file_name: string | null;
  file_size_bytes: number | null;
  file_mime_type: string | null;
  note_text: string | null;
  sha256: string | null;
  created_at: string;
  relation?: string | null;
}

interface Submission {
  id: string;
  run_id: string;
  block: string;
  snapshot_version: number;
  submitted_at: string;
  note: string | null;
}

export function RunWorkspaceClient({
  runId,
  isAdmin,
  isMirrorRespondent = false,
}: {
  runId: string;
  isAdmin: boolean;
  isMirrorRespondent?: boolean;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const [run, setRun] = useState<Run | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeQuestion, setActiveQuestion] = useState<string | null>(null);
  const [answerText, setAnswerText] = useState("");
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitNote, setSubmitNote] = useState("");
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [openBlocks, setOpenBlocks] = useState<Set<string>>(new Set());
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [learningCenterOpen, setLearningCenterOpen] = useState(false);

  // Unified Workspace tabs (V3.3, V3.4: feedback + locked tab support)
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("offen");
  const prevBlocksRef = useRef<Set<string>>(new Set());
  const tabInitRef = useRef(false);

  // Tab switch handler — collapses sidebar blocks when switching to "offen"
  function handleTabChange(tab: WorkspaceTab) {
    if (tab === "offen" && activeTab !== "offen") {
      // Save current block state before collapsing
      prevBlocksRef.current = new Set(openBlocks);
      setOpenBlocks(new Set());
    } else if (tab === "questionnaire" && activeTab === "offen") {
      // Restore previous block state when returning to questionnaire
      setOpenBlocks(prevBlocksRef.current.size > 0 ? new Set(prevBlocksRef.current) : new Set());
    }
    setActiveTab(tab);
  }

  // Free-Form state (V3.2)
  const [freeformPhase, setFreeformPhase] = useState<"chatting" | "mapping" | "review">("chatting");
  const [freeformConversationId, setFreeformConversationId] = useState<string | null>(null);
  const [mappingResult, setMappingResult] = useState<{ mappings: Array<{ questionId: string; questionText: string; block: string; draftText: string; confidence: "high" | "medium" | "low"; hasExistingAnswer: boolean }>; unmappedQuestions: Array<{ questionId: string; questionText: string; block: string }> } | null>(null);
  const [mappingLoading, setMappingLoading] = useState(false);
  const [mappingError, setMappingError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);

  // Evidence state
  const [evidenceItems, setEvidenceItems] = useState<EvidenceItem[]>([]);
  const [evidenceLoading, setEvidenceLoading] = useState(false);
  const [uploadLabel, setUploadLabel] = useState("");
  const [uploadRelation, setUploadRelation] = useState("supports");
  const [uploading, setUploading] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [noteLabel, setNoteLabel] = useState("");
  const [noteRelation, setNoteRelation] = useState("supports");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [eventKey, setEventKey] = useState(0);

  // Chat state
  const [chatMessages, setChatMessages] = useState<{ role: "user" | "assistant" | "summary"; text: string }[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatOpen, setChatOpen] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Voice recording state
  const whisperEnabled = process.env.NEXT_PUBLIC_WHISPER_ENABLED === "true";
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [micAvailable, setMicAvailable] = useState(true);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const MAX_RECORDING_SECONDS = 300; // 5 minutes

  const loadRun = useCallback(async () => {
    try {
      const endpoint = isAdmin
        ? `/api/admin/runs/${runId}`
        : `/api/tenant/runs/${runId}`;
      const res = await fetch(endpoint);
      if (res.ok) {
        const data = await res.json();
        setRun(data.run);
        // Auto-open the first block
        if (data.run?.questions?.length > 0) {
          const firstBlock = data.run.questions[0].block;
          setOpenBlocks(new Set([firstBlock]));
        }
      }
    } finally {
      setLoading(false);
    }
  }, [runId, isAdmin]);

  const loadSubmissions = useCallback(async (block?: string) => {
    if (isAdmin) return;
    try {
      const url = block
        ? `/api/tenant/runs/${runId}/submissions?block=${block}`
        : `/api/tenant/runs/${runId}/submissions`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setSubmissions(data.submissions ?? []);
      }
    } catch { /* ignore */ }
  }, [runId, isAdmin]);

  const loadEvidence = useCallback(async (questionId: string) => {
    setEvidenceLoading(true);
    try {
      const res = await fetch(
        `/api/tenant/runs/${runId}/evidence?question_id=${questionId}`
      );
      if (res.ok) {
        const data = await res.json();
        setEvidenceItems(data.evidence_items ?? []);
      }
    } finally {
      setEvidenceLoading(false);
    }
  }, [runId]);

  useEffect(() => { loadRun(); loadSubmissions(); }, [loadRun, loadSubmissions]);

  // V3.4: When run is locked, default to questionnaire tab (offen is disabled)
  useEffect(() => {
    if (run && run.status === "locked" && activeTab === "offen" && !tabInitRef.current) {
      tabInitRef.current = true;
      setActiveTab("questionnaire");
    }
  }, [run, activeTab]);

  useEffect(() => {
    if (activeQuestion && !isAdmin) {
      loadEvidence(activeQuestion);
    } else {
      setEvidenceItems([]);
    }
  }, [activeQuestion, isAdmin, loadEvidence]);

  // ─── Free-Form mapping phase: trigger mapping API ───────────────────
  useEffect(() => {
    if (activeTab !== "offen" || freeformPhase !== "mapping") return;
    if (mappingLoading || mappingResult || mappingError) return;
    if (!freeformConversationId) return;

    setMappingLoading(true);
    fetch(`/api/tenant/runs/${runId}/freeform/map`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId: freeformConversationId }),
    })
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          if (data?.mappings && Array.isArray(data.mappings)) {
            setMappingResult(data);
            setFreeformPhase("review");
          } else {
            setMappingError(t("freeform.mapping.error"));
          }
        } else {
          setMappingError(t("freeform.mapping.error"));
        }
      })
      .catch(() => {
        setMappingError(t("freeform.mapping.error"));
      })
      .finally(() => {
        setMappingLoading(false);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps — t excluded intentionally (unstable reference causes infinite re-renders)
  }, [activeTab, freeformPhase, mappingLoading, mappingResult, mappingError, freeformConversationId, runId]);

  function selectQuestion(q: Question) {
    // Stop any active recording when switching questions
    if (isRecording) stopRecording();
    setActiveQuestion(q.id);
    setAnswerText("");
    setChatInput("");
    setMessage(null);
    setSidebarOpen(false);
    setChatMessages([]);
    setChatOpen(false);
    loadSubmissions(q.block);
  }

  function toggleBlock(block: string) {
    setOpenBlocks((prev) => {
      const next = new Set(prev);
      if (next.has(block)) next.delete(block);
      else next.add(block);
      return next;
    });
  }

  async function sendChatMessage() {
    if (!chatInput.trim() || !activeQuestion || chatLoading) return;
    const messageText = chatInput.trim();
    const userMsg = { role: "user" as const, text: messageText };
    setChatMessages((prev) => [...prev, userMsg]);
    setChatInput("");
    setChatLoading(true);

    // Call local LLM via Ollama for follow-up response
    try {
      const res = await fetch(
        `/api/tenant/runs/${runId}/questions/${activeQuestion}/chat`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: messageText,
            chatHistory: chatMessages,
          }),
        }
      );
      if (res.ok) {
        const data = await res.json();
        setChatMessages((prev) => [
          ...prev,
          { role: "assistant" as const, text: data.response },
        ]);
      } else {
        setChatMessages((prev) => [
          ...prev,
          { role: "assistant" as const, text: t("ai.unavailable") },
        ]);
      }
    } catch {
      setChatMessages((prev) => [
        ...prev,
        { role: "assistant" as const, text: t("ai.connectionError") },
      ]);
    } finally {
      setChatLoading(false);
    }
  }

  // Voice recording functions
  async function startRecording() {
    // Check if mediaDevices API is available
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setMessage({ text: t("workspace.micNotAvailable"), type: "error" });
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setMicAvailable(true); // Reset on success (in case previous attempt failed)

      // Determine supported MIME type
      let mimeType = "audio/webm";
      if (typeof MediaRecorder !== "undefined") {
        if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
          mimeType = "audio/webm;codecs=opus";
        } else if (MediaRecorder.isTypeSupported("audio/webm")) {
          mimeType = "audio/webm";
        } else if (MediaRecorder.isTypeSupported("audio/mp4")) {
          mimeType = "audio/mp4";
        }
      }

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        transcribeRecording(audioBlob);
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingDuration(0);

      // Duration timer
      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration((prev) => {
          if (prev + 1 >= MAX_RECORDING_SECONDS) {
            stopRecording();
            return prev;
          }
          return prev + 1;
        });
      }, 1000);
    } catch (err) {
      const error = err as Error;
      if (error.name === "NotAllowedError" || error.name === "PermissionDeniedError") {
        setMessage({ text: t("workspace.micPermissionDenied"), type: "error" });
      } else if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") {
        setMessage({ text: t("workspace.micNotAvailable"), type: "error" });
        setMicAvailable(false);
      } else {
        setMessage({ text: t("workspace.micNotAvailable"), type: "error" });
      }
    }
  }

  function stopRecording() {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
  }

  async function transcribeRecording(audioBlob: Blob) {
    if (!activeQuestion) return;
    setIsTranscribing(true);
    try {
      const formData = new FormData();
      formData.append("audio", audioBlob, "recording.webm");
      const res = await fetch(
        `/api/tenant/runs/${runId}/questions/${activeQuestion}/transcribe`,
        { method: "POST", body: formData }
      );
      if (res.ok) {
        const data = await res.json();
        if (data.transcript?.trim()) {
          setChatInput((prev) => prev ? `${prev} ${data.transcript.trim()}` : data.transcript.trim());
        }
      } else {
        setMessage({ text: t("workspace.transcriptionFailed"), type: "error" });
      }
    } catch {
      setMessage({ text: t("workspace.transcriptionFailed"), type: "error" });
    } finally {
      setIsTranscribing(false);
    }
  }

  function formatDuration(seconds: number) {
    const m = Math.floor(seconds / 60).toString().padStart(2, "0");
    const s = (seconds % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  }

  async function generateAnswer() {
    if (!activeQuestion || !run) return;
    setGenerating(true);
    setMessage(null);
    try {
      const res = await fetch(
        `/api/tenant/runs/${runId}/questions/${activeQuestion}/generate-answer`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chatMessages,
            currentDraft: answerText || undefined,
          }),
        }
      );
      if (res.ok) {
        const data = await res.json();
        setChatMessages((prev) => [...prev, { role: "summary" as const, text: data.generatedAnswer }]);
        setMessage({ text: t("answer.summaryCreated"), type: "success" });
      } else {
        setMessage({ text: t("answer.generationError"), type: "error" });
      }
    } catch {
      setMessage({ text: t("common.networkError"), type: "error" });
    } finally {
      setGenerating(false);
    }
  }

  async function saveAnswer() {
    // Save chatInput (direct typing) or answerText (from summary) — chatInput has priority
    const textToSave = chatInput.trim() || answerText.trim();
    if (!activeQuestion || !textToSave || !run) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(
        `/api/tenant/runs/${runId}/questions/${activeQuestion}/events`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            client_event_id: crypto.randomUUID(),
            event_type: "answer_submitted",
            payload: { text: textToSave },
          }),
        }
      );
      if (res.ok) {
        setAnswerText("");
        setChatInput("");
        setEventKey((k) => k + 1);
        await loadRun();
        // Auto-dismiss success message after 3 seconds
        setMessage({ text: t("answer.saved"), type: "success" });
        setTimeout(() => setMessage(null), 3000);
      } else {
        const data = await res.json();
        setMessage({ text: data.error?.message ?? t("common.unknownError"), type: "error" });
      }
    } catch {
      setMessage({ text: t("common.networkError"), type: "error" });
    } finally {
      setSaving(false);
    }
  }

  async function handleFileUpload() {
    const file = fileInputRef.current?.files?.[0];
    if (!file || !activeQuestion || !uploadLabel) return;
    setUploading(true);
    setMessage(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("label", uploadLabel);
      formData.append("question_id", activeQuestion);
      formData.append("relation", uploadRelation);
      const res = await fetch(`/api/tenant/runs/${runId}/evidence`, {
        method: "POST",
        body: formData,
      });
      if (res.ok) {
        setMessage({ text: t("evidence.fileUploaded"), type: "success" });
        if (fileInputRef.current) fileInputRef.current.value = "";
        setUploadLabel("");
        setEventKey((k) => k + 1);
        await loadEvidence(activeQuestion);
        await loadRun();
      } else {
        const data = await res.json();
        setMessage({ text: data.error?.message ?? t("common.unknownError"), type: "error" });
      }
    } catch {
      setMessage({ text: t("common.networkError"), type: "error" });
    } finally {
      setUploading(false);
    }
  }

  async function handleNoteSubmit() {
    if (!noteText.trim() || !activeQuestion || !noteLabel) return;
    setUploading(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/tenant/runs/${runId}/evidence`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          item_type: "note",
          note_text: noteText,
          label: noteLabel,
          question_id: activeQuestion,
          relation: noteRelation,
        }),
      });
      if (res.ok) {
        setMessage({ text: t("evidence.noteAdded"), type: "success" });
        setNoteText("");
        setNoteLabel("");
        setEventKey((k) => k + 1);
        await loadEvidence(activeQuestion);
        await loadRun();
      } else {
        const data = await res.json();
        setMessage({ text: data.error?.message ?? t("common.unknownError"), type: "error" });
      }
    } catch {
      setMessage({ text: t("common.networkError"), type: "error" });
    } finally {
      setUploading(false);
    }
  }

  async function downloadEvidence(evidenceId: string) {
    try {
      const res = await fetch(
        `/api/tenant/runs/${runId}/evidence/${evidenceId}/download`
      );
      if (res.ok) {
        const data = await res.json();
        window.open(data.download_url, "_blank");
      }
    } catch {
      setMessage({ text: t("evidence.downloadFailed"), type: "error" });
    }
  }

  async function submitRun() {
    setSubmitting(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/tenant/runs/${runId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          block: activeQ?.block,
          ...(submitNote.trim() ? { note: submitNote.trim() } : {}),
        }),
      });
      if (res.ok) {
        setMessage({ text: t("submit.submitted", { block: activeQ?.block ?? "" }), type: "success" });
        setSubmitNote("");
        await loadRun();
        await loadSubmissions(activeQ?.block);
      } else {
        const data = await res.json();
        setMessage({ text: data.error?.message ?? t("common.unknownError"), type: "error" });
      }
    } catch {
      setMessage({ text: t("common.networkError"), type: "error" });
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 p-8">
        <Skeleton className="mb-4 h-8 w-64 rounded-xl" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }

  if (!run) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <p className="text-slate-500">{t("common.runNotFound")}</p>
      </div>
    );
  }

  // Group questions by block
  const blocks = Array.from(new Set(run.questions.map((q) => q.block))).sort();
  const questionsByBlock = new Map<string, Question[]>();
  blocks.forEach((b) => {
    questionsByBlock.set(b, run.questions.filter((q) => q.block === b));
  });

  const answered = run.questions.filter((q) => q.latest_answer).length;
  const total = run.questions.length;
  const isLocked = run.status === "locked";
  const isSubmittedOrLocked = run.status === "submitted" || run.status === "locked";
  const feedbackEnabled = !isMirrorRespondent && isSubmittedOrLocked;
  const disabledTabs: WorkspaceTab[] = [];
  if (!feedbackEnabled) disabledTabs.push("feedback");
  if (isLocked) disabledTabs.push("offen");
  const activeQ = run.questions.find((q) => q.id === activeQuestion);

  function formatFileSize(bytes: number | null) {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  // Group questions by unterbereich within a block
  function groupByUnterbereich(questions: Question[]) {
    const groups: { label: string; questions: Question[] }[] = [];
    let currentLabel = "";
    let currentGroup: Question[] = [];
    for (const q of questions) {
      if (q.unterbereich !== currentLabel) {
        if (currentGroup.length > 0) groups.push({ label: currentLabel, questions: currentGroup });
        currentLabel = q.unterbereich;
        currentGroup = [q];
      } else {
        currentGroup.push(q);
      }
    }
    if (currentGroup.length > 0) groups.push({ label: currentLabel, questions: currentGroup });
    return groups;
  }

  // ─── Sidebar: dark theme matching Figma mockup ─────────────────────────
  const sidebar = (
    <div className="flex h-full flex-col" style={{ background: "var(--gradient-sidebar)" }}>
      {/* Logo block — with rounded frame like Cockpit */}
      <div className="mx-3 mt-3 rounded-xl bg-gradient-to-b from-slate-800/80 to-slate-900/50 border border-white/[0.06] px-5 py-5 text-center">
        <div className="mx-auto w-fit rounded-2xl bg-white p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo-full.png" alt="StrategAIze" className="h-12 w-auto" />
        </div>
      </div>
      {/* Blueprint Assessment block */}
      <div className="mx-3 mt-2 rounded-xl bg-gradient-to-b from-slate-800/80 to-slate-900/50 border border-white/[0.06] px-5 py-4 text-center">
        <div className="text-sm font-bold text-white">Blueprint Assessment</div>
        <div className="text-[11px] text-slate-500 mt-0.5">{t("sidebar.subtitle")}</div>
      </div>
      <div className="h-3" />

      {/* Global collapse/expand */}
      <div className="px-3 pb-1">
        <button
          onClick={() => {
            const allOpen = openBlocks.size === blocks.length;
            setOpenBlocks(allOpen ? new Set() : new Set(blocks));
          }}
          className="w-full rounded-lg px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 hover:text-slate-300 hover:bg-white/[0.04] transition-colors text-center"
        >
          {openBlocks.size === blocks.length ? t("sidebar.collapseAll") : t("sidebar.expandAll")}
        </button>
      </div>

      {/* Block groups */}
      <div className="flex-1 overflow-y-auto px-3 py-1">
        {blocks.map((block) => {
          const questions = questionsByBlock.get(block) ?? [];
          const blockAnswered = questions.filter((q) => q.latest_answer).length;
          const isOpen = openBlocks.has(block);
          const hasActiveQuestion = questions.some((q) => q.id === activeQuestion);
          const untergruppen = groupByUnterbereich(questions);

          return (
            <div key={block} className="mb-1.5">
              <button
                onClick={() => toggleBlock(block)}
                className={`flex w-full items-center gap-3 rounded-xl px-4 py-3.5 text-left transition-all duration-200 ${
                  isOpen || hasActiveQuestion
                    ? "bg-gradient-to-r from-brand-primary to-brand-primary-dark text-white shadow-[0_8px_16px_-4px_rgba(68,84,184,0.35)]"
                    : "text-slate-300 hover:bg-white/[0.06]"
                }`}
              >
                <div
                  className={`h-2.5 w-2.5 flex-shrink-0 rounded-full ${
                    blockAnswered === questions.length && questions.length > 0
                      ? "bg-gradient-to-br from-brand-success-dark to-brand-success shadow-[0_0_8px_rgba(0,168,79,0.5)]"
                      : blockAnswered > 0
                        ? "bg-gradient-to-br from-brand-warning-dark to-brand-warning shadow-[0_0_8px_rgba(242,183,5,0.5)]"
                        : "bg-slate-600"
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold leading-snug">
                    Block {block}: {t(`blocks.${block}`)}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`text-[10px] uppercase tracking-wider font-semibold ${isOpen || hasActiveQuestion ? "text-white/50" : "text-slate-500"}`}>
                      {t("sidebar.analysis")}
                    </span>
                    <span className={`text-[10px] ${isOpen || hasActiveQuestion ? "text-white/30" : "text-slate-600"}`}>&bull;</span>
                    <span className={`text-[10px] tabular-nums font-bold ${isOpen || hasActiveQuestion ? "text-white/50" : "text-slate-500"}`}>
                      {blockAnswered}/{questions.length}
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
                      {/* Category label — colored like mockup */}
                      <div className="px-3 py-1.5">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-brand-primary">
                          {group.label}
                        </span>
                      </div>
                      {/* Questions */}
                      {group.questions.map((q) => {
                        const isActive = activeQuestion === q.id;
                        const hasAnswer = !!q.latest_answer;
                        return (
                          <button
                            key={q.id}
                            onClick={() => selectQuestion(q)}
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
                            <p className={`text-xs leading-snug line-clamp-2 flex-1 ${isActive ? "font-medium" : ""}`}>
                              {q.fragetext}
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

      {/* Abmelden */}
      <div className="border-t border-white/[0.06] px-4 py-4">
        <Link
          href="/dashboard"
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand-primary/20 to-brand-primary-dark/20 px-3 py-3 text-sm font-semibold text-slate-300 transition-all hover:from-brand-primary/30 hover:to-brand-primary-dark/30 hover:text-white"
        >
          {t("common.logout")}
        </Link>
      </div>
    </div>
  );

  // ─── Mapping/Review Overlay state (V3.3) ──────────────────────────
  const showMappingOverlay = freeformPhase === "mapping" || (freeformPhase === "review" && !!mappingResult);

  // ─── Unified Workspace (V3.3) ─────────────────────────────────────
  return (
    <>
    {/* Mapping/Review Overlay — rendered ON TOP of workspace so FreeformChat stays mounted */}
    {showMappingOverlay && (
      <div className="fixed inset-0 z-50 bg-white overflow-y-auto">
        {freeformPhase === "mapping" && (
          <div className="flex min-h-screen items-center justify-center">
            <div className="text-center max-w-md px-4">
              {mappingError ? (
                <>
                  <p className="text-sm text-red-600 mb-4">{mappingError}</p>
                  <Button
                    onClick={() => {
                      setMappingError(null);
                      setMappingResult(null);
                    }}
                    variant="outline"
                  >
                    {t("freeform.mapping.retry")}
                  </Button>
                  <Button
                    onClick={() => setFreeformPhase("chatting")}
                    variant="ghost"
                    className="ml-2"
                  >
                    {t("freeform.chat.endChatCancel")}
                  </Button>
                </>
              ) : (
                <>
                  <div className="mx-auto mb-6 h-12 w-12 rounded-full bg-brand-primary/10 flex items-center justify-center">
                    <Loader2 className="h-6 w-6 animate-spin text-brand-primary" />
                  </div>
                  <p className="text-lg font-bold text-slate-900 mb-2">{t("freeform.mapping.loading")}</p>
                  <p className="text-sm text-slate-500">{t("freeform.mapping.loadingDescription")}</p>
                </>
              )}
            </div>
          </div>
        )}
        {freeformPhase === "review" && mappingResult && (
          <MappingReview
            mappings={mappingResult.mappings}
            unmappedQuestions={mappingResult.unmappedQuestions}
            accepting={accepting}
            onBack={() => {
              // Return to chat — keep conversation state
              setFreeformPhase("chatting");
              setMappingResult(null);
              setMappingError(null);
            }}
            onAccept={async (drafts) => {
              if (!freeformConversationId || drafts.length === 0) return;
              setAccepting(true);
              try {
                const res = await fetch(`/api/tenant/runs/${runId}/freeform/accept`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    conversationId: freeformConversationId,
                    acceptedDrafts: drafts,
                  }),
                });
                if (res.ok) {
                  const data = await res.json();
                  setMessage({
                    text: t("freeform.review.success", { count: data.acceptedCount }),
                    type: "success",
                  });
                  // Clear freeform state, switch to questionnaire to show updated answers
                  setMappingResult(null);
                  setFreeformConversationId(null);
                  setFreeformPhase("chatting");
                  handleTabChange("questionnaire");
                  await loadRun();
                } else {
                  setMessage({ text: t("freeform.review.acceptError"), type: "error" });
                }
              } catch {
                setMessage({ text: t("common.networkError"), type: "error" });
              } finally {
                setAccepting(false);
              }
            }}
          />
        )}
      </div>
    )}
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      {/* Mobile sidebar toggle */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="fixed left-4 top-4 z-50 rounded-lg bg-white p-2 shadow-md lg:hidden"
      >
        {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
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
                {run.title}
              </h1>
              <div className="flex items-center gap-2.5 text-sm text-slate-600">
                {activeQ ? (
                  <>
                    <span className="font-semibold truncate">Block {activeQ.block}: {t(`blocks.${activeQ.block}`)}</span>
                    <span className="text-slate-300">&bull;</span>
                    <span className="font-medium truncate">{activeQ.unterbereich}</span>
                  </>
                ) : (
                  <span className="text-slate-400">{t("workspace.selectQuestion")}</span>
                )}
              </div>
            </div>

            {/* CENTER: Dual Progress */}
            <div className="flex-1 max-w-sm space-y-2.5 hidden md:block">
              {/* Gesamt */}
              <div className="flex items-center gap-4">
                <div className="w-16 text-right">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{t("progress.total")}</span>
                </div>
                <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-brand-success-dark to-brand-success transition-all duration-700 ease-out"
                    style={{ width: `${total > 0 ? Math.round((answered / total) * 100) : 0}%` }}
                  />
                </div>
                <div className="w-12 text-right">
                  <span className="text-sm font-bold text-slate-900 tabular-nums">
                    {total > 0 ? Math.round((answered / total) * 100) : 0}%
                  </span>
                </div>
              </div>
              {/* Block */}
              {(() => {
                const currentBlock = activeQ?.block;
                if (!currentBlock) return null;
                const blockQuestions = questionsByBlock.get(currentBlock) ?? [];
                const blockAnswered = blockQuestions.filter((q) => q.latest_answer).length;
                const blockTotal = blockQuestions.length;
                const blockPercent = blockTotal > 0 ? Math.round((blockAnswered / blockTotal) * 100) : 0;
                return (
                  <div className="flex items-center gap-4">
                    <div className="w-16 text-right">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{t("progress.block")}</span>
                    </div>
                    <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-brand-primary to-brand-primary-dark transition-all duration-700 ease-out"
                        style={{ width: `${blockPercent}%` }}
                      />
                    </div>
                    <div className="w-12 text-right">
                      <span className="text-sm font-bold text-slate-900 tabular-nums">{blockPercent}%</span>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* RIGHT: Status + Action — same size, horizontal */}
            <div className="flex items-center gap-3 flex-shrink-0">
              <div className="px-4 py-2.5 rounded-lg bg-gradient-to-r from-amber-400 to-amber-500 text-white shadow-md text-xs font-bold uppercase tracking-wider flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-white/80 animate-pulse" />
                {run.status === "collecting" ? t("status.collecting") : run.status === "submitted" ? t("status.submitted") : t("status.locked")}
              </div>
              {!isAdmin && !isLocked && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button
                      disabled={submitting || answered === 0}
                      className="px-4 py-2.5 rounded-lg bg-gradient-to-r from-brand-success-dark to-brand-success text-white shadow-md text-xs font-bold uppercase tracking-wider disabled:opacity-50 hover:shadow-lg hover:scale-[1.02] transition-all flex items-center gap-2"
                    >
                      {submitting ? t("submit.blockLoading") : t("submit.block", { block: activeQ?.block ?? "" })}
                    </button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{t("submit.dialogTitle", { block: activeQ?.block ?? "" })}</AlertDialogTitle>
                      <AlertDialogDescription>
                        {t("submit.dialogAnswered", { answered, total })}
                        {total - answered > 0 && (
                          <> {t("submit.dialogRemaining", { remaining: total - answered })}</>
                        )}
                        {" "}{t("submit.dialogInfo")}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <div className="py-2">
                      <Label htmlFor="submit-note">{t("submit.noteLabel")}</Label>
                      <Textarea
                        id="submit-note"
                        value={submitNote}
                        onChange={(e) => setSubmitNote(e.target.value)}
                        placeholder={t("submit.notePlaceholder")}
                        rows={3}
                        className="mt-1"
                      />
                    </div>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                      <AlertDialogAction onClick={submitRun}>
                        {t("common.confirmSubmit")}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          </div>
        </header>

        {/* Tab Navigation (V3.3, V3.4: auch bei locked sichtbar) */}
        {!isAdmin && (
          <WorkspaceTabs activeTab={activeTab} onChange={handleTabChange} disabledTabs={disabledTabs} />
        )}

        {/* Mirror confidentiality banner */}
        {isMirrorRespondent && (
          <div className="flex-shrink-0 px-6 pt-3">
            <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
              <ShieldCheck className="h-4 w-4 flex-shrink-0" />
              {t("mirror.confidentialityBanner")}
            </div>
          </div>
        )}

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

        {/* ─── Tab: Offen (Free-Form Chat) ─── */}
        <div className={`flex-1 overflow-hidden ${activeTab === "offen" && !isAdmin && !isLocked ? "flex flex-col" : "hidden"}`}>
          <FreeformChat
            runId={runId}
            conversationId={freeformConversationId}
            onConversationCreated={(id) => setFreeformConversationId(id)}
            onEndChat={() => setFreeformPhase("mapping")}
          />
        </div>

        {/* ─── Tab: Feedback (V3.4) ─── */}
        <div className={`flex-1 overflow-hidden ${activeTab === "feedback" && !isAdmin ? "flex flex-col" : "hidden"}`}>
          {feedbackEnabled ? (
            <FeedbackPanel runId={runId} />
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center px-4">
                <div className="mx-auto mb-4 h-16 w-16 rounded-2xl bg-slate-100 flex items-center justify-center">
                  <Lock className="h-8 w-8 text-slate-300" />
                </div>
                <p className="text-lg font-bold text-slate-400 mb-2">{t("workspace.tabs.feedback")}</p>
                <p className="text-sm text-slate-400">{t("workspace.tabs.feedbackLocked")}</p>
              </div>
            </div>
          )}
        </div>

        {/* ─── Tab: Frage für Frage (Questionnaire) ─── */}
        <div className={`flex-1 overflow-y-auto px-6 py-4 ${activeTab === "questionnaire" || isAdmin ? "" : "hidden"}`}>
          {activeQ ? (
            <div className="mx-auto max-w-6xl w-full space-y-3">
              {/* ── Kompakte Fragekarte ── */}
              <div className="relative bg-white rounded-2xl border-2 border-slate-200 shadow-lg overflow-hidden">
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-brand-primary-dark via-brand-primary to-brand-success-dark" />
                <div className="relative px-6 py-4 flex items-center gap-4">
                  <div className="inline-flex items-center px-3 py-1.5 rounded-lg bg-gradient-to-r from-brand-primary-dark to-brand-primary text-white shadow-md">
                    <span className="text-xs font-bold">{activeQ.frage_id}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-base font-bold text-slate-900 leading-snug">
                      {activeQ.fragetext}
                    </h2>
                    <div className="flex items-center gap-2 mt-1 text-xs text-slate-400">
                      <span>{activeQ.unterbereich}</span>
                      <span>&bull;</span>
                      <span className="font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 uppercase text-[10px]">{activeQ.ebene}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Side-by-side: Antwort (2/3) + Verlauf (1/3) — tall to fill viewport ── */}
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-3" style={{ height: "calc(100vh - 260px)" }}>

              {/* ── Integrierter Chat + Antwort-Bereich (2/3 Breite) ── */}
              <div className="xl:col-span-2 bg-white rounded-2xl border-2 border-slate-200 shadow-lg overflow-hidden flex flex-col">
                {/* Header */}
                <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/50">
                  <label className="text-sm font-bold text-slate-900 uppercase tracking-wide flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-gradient-to-r from-brand-primary-dark to-brand-primary" />
                    {t("workspace.yourAnswer")}
                    {chatMessages.length > 0 && (
                      <span className="ml-2 text-xs font-semibold px-2 py-0.5 rounded-full bg-brand-primary/10 text-brand-primary">
                        {t("workspace.messagesCount", { count: chatMessages.length })}
                      </span>
                    )}
                  </label>
                </div>

                {/* Chat messages — scrollable area above fixed input */}
                <div className="flex-1 overflow-y-auto">
                  {chatMessages.length > 0 ? (
                    <div className="px-5 py-3 space-y-2">
                      {chatMessages.map((msg, i) => (
                        <div key={i}>
                          {msg.role === "summary" ? (
                            <div className="rounded-xl border border-brand-success/30 bg-emerald-50/50 px-4 py-3">
                              <div className="flex items-center gap-2 mb-2">
                                <Sparkles className="h-3.5 w-3.5 text-brand-success-dark" />
                                <span className="text-[10px] font-bold uppercase tracking-wider text-brand-success-dark">{t("ai.summary")}</span>
                              </div>
                              <p className="text-xs leading-relaxed text-slate-800 whitespace-pre-wrap">{msg.text}</p>
                              <div className="mt-3 flex items-center gap-2">
                                <button
                                  onClick={() => {
                                    setAnswerText(msg.text);
                                    setMessage({ text: t("answer.summaryAccepted"), type: "success" });
                                    setTimeout(() => setMessage(null), 4000);
                                  }}
                                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-brand-success-dark to-brand-success text-white text-xs font-bold shadow-sm hover:shadow-md transition-all"
                                >
                                  <span>&#10003;</span>
                                  {t("ai.accept")}
                                </button>
                                <button
                                  onClick={generateAnswer}
                                  disabled={generating}
                                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-500 hover:text-brand-primary transition-all"
                                >
                                  {t("ai.regenerate")}
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                              <div
                                className={`max-w-[75%] rounded-xl px-3 py-2 text-xs leading-relaxed ${
                                  msg.role === "user"
                                    ? "bg-brand-primary text-white rounded-br-sm"
                                    : "bg-slate-100 text-slate-700 rounded-bl-sm"
                                }`}
                              >
                                {msg.text}
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                      {/* Loading indicator while LLM responds */}
                      {chatLoading && (
                        <div className="flex justify-start">
                          <div className="bg-slate-100 rounded-xl px-4 py-3 flex items-center gap-2">
                            <Loader2 className="h-3.5 w-3.5 text-brand-primary animate-spin" />
                            <span className="text-xs text-slate-500">{t("ai.thinking")}</span>
                          </div>
                        </div>
                      )}
                      <div ref={chatEndRef} />
                    </div>
                  ) : (
                    <div className="flex-1 flex items-center justify-center py-8">
                      <p className="text-xs text-slate-400">{t("workspace.emptyState")}</p>
                    </div>
                  )}
                </div>

                {/* Fixed input area — always at bottom, 4 rows */}
                {!isAdmin && !isLocked && (
                  <div className="flex-shrink-0 px-5 py-3 border-t border-slate-200 bg-white">
                    {/* Recording indicator */}
                    {isRecording && (
                      <div className="flex items-center gap-2 mb-2 px-2 py-1.5 rounded-lg bg-red-50 border border-red-200">
                        <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                        <span className="text-xs font-medium text-red-600">{t("workspace.recording")}</span>
                        <span className="text-xs font-mono text-red-500 ml-auto">{formatDuration(recordingDuration)}</span>
                      </div>
                    )}
                    {isTranscribing && (
                      <div className="flex items-center gap-2 mb-2 px-2 py-1.5 rounded-lg bg-brand-primary/5 border border-brand-primary/20">
                        <Loader2 className="h-3 w-3 animate-spin text-brand-primary" />
                        <span className="text-xs font-medium text-brand-primary">{t("workspace.transcribing")}</span>
                      </div>
                    )}
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
                        placeholder={t("workspace.inputPlaceholder")}
                        rows={4}
                        className="flex-1 px-3 py-2 rounded-lg border border-slate-200 text-sm leading-relaxed focus:border-brand-primary focus:outline-none transition-colors resize-none"
                      />
                      {/* Mic + Send stacked vertically */}
                      <div className="flex flex-col gap-1.5 flex-shrink-0 self-end">
                        {whisperEnabled && (
                          <button
                            onClick={isRecording ? stopRecording : startRecording}
                            disabled={isTranscribing}
                            title={isRecording ? t("workspace.stopRecording") : t("workspace.startRecording")}
                            className={`p-2.5 rounded-lg transition-all disabled:opacity-50 ${
                              isRecording
                                ? "bg-red-500 text-white hover:bg-red-600 animate-pulse"
                                : "bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200"
                            }`}
                          >
                            {isTranscribing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : isRecording ? <Square className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
                          </button>
                        )}
                        <button
                          onClick={sendChatMessage}
                          disabled={!chatInput.trim() || chatLoading}
                          className="p-2.5 rounded-lg bg-brand-primary text-white disabled:opacity-50 hover:bg-brand-primary-dark transition-all"
                        >
                          {chatLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Action bar */}
                {!isAdmin && !isLocked && (
                  <div className="px-6 py-4 border-t-2 border-slate-100 bg-slate-50/30">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-500 tabular-nums">
                        {answerText ? t("workspace.charCount", { length: answerText.length }) : chatInput.trim() ? t("workspace.textCharCount", { length: chatInput.trim().length }) : t("workspace.noAnswer")}
                      </span>
                      <div className="flex items-center gap-3">
                        {chatMessages.length >= 2 && (
                          <button
                            onClick={generateAnswer}
                            disabled={generating}
                            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 border-brand-success/30 text-sm font-bold text-brand-success-dark hover:bg-brand-success/5 transition-all disabled:opacity-50"
                          >
                            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                            {generating ? t("ai.working") : t("ai.generateSummary")}
                          </button>
                        )}
                        <button
                          onClick={saveAnswer}
                          disabled={saving || (!answerText.trim() && !chatInput.trim())}
                          className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-brand-primary-dark via-brand-primary to-brand-primary-dark text-white font-bold shadow-xl shadow-brand-primary/30 hover:shadow-2xl hover:scale-[1.02] transition-all disabled:opacity-50 disabled:hover:scale-100 flex items-center gap-2"
                        >
                          {saving ? t("answer.saving") : t("answer.save")}
                          {!saving && <span>&#10003;</span>}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

              </div>

              {/* ── Antwort-Verlauf (1/3 Breite, rechte Spalte) — fills height ── */}
              {!isAdmin && activeQuestion && (
                <div className="xl:col-span-1 bg-white rounded-2xl border-2 border-slate-200 shadow-lg overflow-hidden flex flex-col">
                  <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/50 flex-shrink-0">
                    <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wide flex items-center gap-2">
                      <div className="w-6 h-6 rounded-md bg-gradient-to-br from-slate-600 to-slate-700 flex items-center justify-center">
                        <FileText className="h-3 w-3 text-white" />
                      </div>
                      {t("evidence.historyTitle")}
                    </h3>
                  </div>
                  <div className="flex-1 overflow-y-auto">
                    <div className="p-4">
                      <EventHistory
                        key={`${activeQuestion}-${eventKey}`}
                        runId={runId}
                        questionId={activeQuestion}
                      />
                    </div>
                  </div>
                </div>
              )}
              </div> {/* end grid */}

              {/* ── KI Memory (V2.2) ── */}
              <RunMemoryView runId={runId} />

              {/* ── Evidence + Checkpoints Grid (Style Guide 14.6) ── */}
              {!isAdmin && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* LEFT: Evidence / Nachweise */}
                  <div className="bg-white rounded-2xl border-2 border-slate-200 shadow-lg overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/50">
                      <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-primary-dark to-brand-primary flex items-center justify-center shadow-md">
                          <FileText className="h-4 w-4 text-white" />
                        </div>
                        {t("evidence.title")}
                        <span className="ml-auto text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-200 text-slate-600">
                          {evidenceItems.filter((e) => e.item_type === "file").length}
                        </span>
                      </h3>
                    </div>
                    <div className="p-5 space-y-3">
                      {evidenceLoading ? (
                        <Skeleton className="h-16 w-full rounded-xl" />
                      ) : evidenceItems.filter((e) => e.item_type === "file").length > 0 ? (
                        evidenceItems.filter((e) => e.item_type === "file").map((item) => {
                          const ext = item.file_name?.split(".").pop()?.toLowerCase() ?? "";
                          const mime = item.file_mime_type ?? "";
                          const isPdf = ext === "pdf" || mime === "application/pdf";
                          const isDocx = ext === "docx" || mime.includes("wordprocessingml");
                          const isExcel = ext === "xlsx" || ext === "xls" || mime.includes("spreadsheet") || mime.includes("ms-excel");
                          const isImage = mime.startsWith("image/");

                          const iconBg = isPdf
                            ? "from-red-600 to-red-700"
                            : isDocx
                            ? "from-blue-600 to-blue-700"
                            : isExcel
                            ? "from-emerald-600 to-emerald-700"
                            : isImage
                            ? "from-violet-500 to-violet-600"
                            : "from-slate-500 to-slate-600";

                          const iconLabel = isPdf ? "PDF" : isDocx ? "DOCX" : isExcel ? (ext === "xls" ? "XLS" : "XLSX") : isImage ? null : ext.toUpperCase() || "FILE";

                          return (
                            <div
                              key={item.id}
                              className="group flex items-center justify-between p-4 rounded-xl bg-slate-50 border border-slate-200 hover:border-slate-300 hover:shadow-md transition-all"
                            >
                              <div className="flex items-center gap-4">
                                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${iconBg} flex items-center justify-center text-white shadow-lg`}>
                                  {isImage ? (
                                    <Image className="h-5 w-5" />
                                  ) : (
                                    <span className="text-xs font-bold">{iconLabel}</span>
                                  )}
                                </div>
                                <div>
                                  <div className="text-sm font-semibold text-slate-900">{item.file_name}</div>
                                  <div className="flex items-center gap-2 text-xs text-slate-500">
                                    <span>{formatFileSize(item.file_size_bytes)}</span>
                                    <span>&bull;</span>
                                    <span>{new Date(item.created_at).toLocaleDateString(locale)}</span>
                                    <span>&bull;</span>
                                    <span className="font-medium">{item.label}</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <p className="text-sm text-slate-400 py-3 text-center">{t("evidence.empty")}</p>
                      )}

                      {/* Upload — compact */}
                      {!isLocked && (
                        <>
                          <Separator className="my-3" />
                          <div className="space-y-2">
                            <div className="grid grid-cols-1 gap-2">
                              <Input
                                ref={fileInputRef}
                                type="file"
                                accept=".pdf,.docx,.xlsx,.xls,.png,.jpg,.jpeg"
                                disabled={uploading}
                              />
                              <Select value={uploadLabel} onValueChange={setUploadLabel}>
                                <SelectTrigger><SelectValue placeholder={t("evidence.categoryPlaceholder")} /></SelectTrigger>
                                <SelectContent>
                                  {EVIDENCE_LABEL_KEYS.map((key) => (
                                    <SelectItem key={key} value={key}>{t(`evidence.labels.${key}`)}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <Button
                              onClick={handleFileUpload}
                              disabled={uploading || !uploadLabel || !fileInputRef.current?.files?.length}
                              size="sm"
                              className="w-full"
                            >
                              {uploading ? t("evidence.uploading") : t("evidence.uploadFile")}
                            </Button>
                          </div>
                          <Separator className="my-3" />
                          <div className="space-y-2">
                            <Textarea
                              value={noteText}
                              onChange={(e) => setNoteText(e.target.value)}
                              placeholder={t("evidence.noteInputPlaceholder")}
                              rows={2}
                              disabled={uploading}
                            />
                            <div className="flex gap-2">
                              <Select value={noteLabel} onValueChange={setNoteLabel}>
                                <SelectTrigger><SelectValue placeholder={t("evidence.categoryPlaceholder")} /></SelectTrigger>
                                <SelectContent>
                                  {EVIDENCE_LABEL_KEYS.map((key) => (
                                    <SelectItem key={key} value={key}>{t(`evidence.labels.${key}`)}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <Button
                                onClick={handleNoteSubmit}
                                disabled={uploading || !noteText.trim() || !noteLabel}
                                size="sm"
                                variant="outline"
                              >
                                {t("evidence.saveNote")}
                              </Button>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* RIGHT: Eingereichte Checkpoints — real data from API */}
                  <div className="bg-white rounded-2xl border-2 border-slate-200 shadow-lg overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/50">
                      <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-success-dark to-brand-success flex items-center justify-center shadow-md">
                          <FileText className="h-4 w-4 text-white" />
                        </div>
                        {t("checkpoints.title")}
                        <span className="ml-auto text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-200 text-slate-600">
                          {submissions.length}
                        </span>
                      </h3>
                    </div>
                    <div className="p-5 space-y-3">
                      {submissions.length > 0 ? (
                        submissions.map((sub, idx) => {
                          const subBlock = sub.block ?? activeQ?.block;
                          const blockQs = subBlock ? (questionsByBlock.get(subBlock) ?? []) : [];
                          const blockAns = blockQs.filter((q) => q.latest_answer).length;
                          return (
                            <div key={sub.id} className="p-4 rounded-xl bg-slate-50 border border-slate-200 hover:border-slate-300 hover:shadow-md transition-all">
                              <div className="flex items-center gap-2 mb-2 flex-wrap">
                                <span className="text-xs font-bold text-slate-600">
                                  {new Date(sub.submitted_at).toLocaleString(locale)}
                                </span>
                                <span className="text-xs font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                                  v{sub.snapshot_version}
                                </span>
                                {sub.block && sub.block !== "ALL" && (
                                  <span className="text-xs font-bold px-2 py-0.5 rounded-lg bg-gradient-to-r from-brand-primary-dark to-brand-primary text-white shadow-sm">
                                    Block {sub.block}
                                  </span>
                                )}
                                {idx === 0 && (
                                  <span className="ml-auto text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700">
                                    {t("checkpoints.current")}
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-slate-500">
                                {t("checkpoints.progress", { answered: blockAns, total: blockQs.length, block: subBlock ?? "" })}
                              </div>
                              {sub.note && (
                                <p className="text-xs text-slate-500 mt-1 line-clamp-2 italic">{sub.note}</p>
                              )}
                            </div>
                          );
                        })
                      ) : (
                        <div className="py-6 text-center">
                          <p className="text-sm text-slate-400">{t("checkpoints.emptyTitle")}</p>
                          <p className="text-xs text-slate-400 mt-1">{t("checkpoints.emptyInstructions")}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100">
                  <FileText className="h-8 w-8 text-slate-300" />
                </div>
                <p className="text-lg font-semibold text-slate-400">
                  {t("workspace.noSelectionTitle")}
                </p>
                <p className="mt-1 text-sm text-slate-400">
                  {t("workspace.noSelectionInstructions")}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Learning Center */}
      <HelpButton onClick={() => setLearningCenterOpen(true)} />
      <LearningCenterPanel
        open={learningCenterOpen}
        onOpenChange={setLearningCenterOpen}
        isMirror={isMirrorRespondent}
      />
    </div>
    </>
  );
}
