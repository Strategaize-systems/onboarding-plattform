"use client";

import { useState, useTransition, useEffect } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { approveBridgeProposal } from "./actions";
import type { EditedProposalPayload } from "./action-helpers";
import type {
  BridgeProposalQuestion,
  BridgeProposalRow,
  EmployeeRow,
} from "./types";

interface Props {
  proposal: BridgeProposalRow;
  employees: EmployeeRow[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const UNASSIGNED_VALUE = "__none__";

function questionsToText(questions: BridgeProposalQuestion[] | unknown): string[] {
  if (!Array.isArray(questions)) return [];
  return questions.map((q) => {
    if (typeof q === "string") return q;
    if (q && typeof q === "object" && "text" in q && typeof (q as { text: unknown }).text === "string") {
      return (q as { text: string }).text;
    }
    return "";
  });
}

export function BridgeProposalEditDialog({ proposal, employees, open, onOpenChange }: Props) {
  const [pending, startTransition] = useTransition();
  const [title, setTitle] = useState(proposal.proposed_block_title);
  const [description, setDescription] = useState(proposal.proposed_block_description ?? "");
  const [questions, setQuestions] = useState<string[]>(questionsToText(proposal.proposed_questions));
  const [employeeId, setEmployeeId] = useState<string>(
    proposal.proposed_employee_user_id ?? UNASSIGNED_VALUE
  );
  const [roleHint, setRoleHint] = useState(proposal.proposed_employee_role_hint ?? "");

  // Reset Form-State, wenn der Dialog mit einem anderen Proposal neu geoeffnet wird
  useEffect(() => {
    if (open) {
      setTitle(proposal.proposed_block_title);
      setDescription(proposal.proposed_block_description ?? "");
      setQuestions(questionsToText(proposal.proposed_questions));
      setEmployeeId(proposal.proposed_employee_user_id ?? UNASSIGNED_VALUE);
      setRoleHint(proposal.proposed_employee_role_hint ?? "");
    }
  }, [open, proposal]);

  function updateQuestion(index: number, value: string) {
    setQuestions((prev) => prev.map((q, i) => (i === index ? value : q)));
  }

  function addQuestion() {
    setQuestions((prev) => [...prev, ""]);
  }

  function removeQuestion(index: number) {
    setQuestions((prev) => prev.filter((_, i) => i !== index));
  }

  function moveQuestion(index: number, dir: -1 | 1) {
    setQuestions((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function handleSaveAndApprove() {
    const trimmedTitle = title.trim();
    if (trimmedTitle.length === 0) {
      toast.error("Titel darf nicht leer sein.");
      return;
    }

    const cleanedQuestions = questions
      .map((q) => q.trim())
      .filter((q) => q.length > 0)
      .map((text) => ({ text }));

    const finalEmployeeId = employeeId === UNASSIGNED_VALUE ? null : employeeId;
    if (!finalEmployeeId) {
      toast.error("Bitte zuerst einen Mitarbeiter zuordnen.");
      return;
    }

    const payload: EditedProposalPayload = {
      proposed_block_title: trimmedTitle,
      proposed_block_description: description.trim() || null,
      proposed_questions: cleanedQuestions,
      proposed_employee_user_id: finalEmployeeId,
      proposed_employee_role_hint: roleHint.trim() || null,
    };

    startTransition(async () => {
      const result = await approveBridgeProposal(proposal.id, payload);
      if (!result.ok) {
        const msg =
          result.error === "no_employee_assigned"
            ? "Bitte einen Mitarbeiter zuordnen."
            : result.error === "invalid_status"
              ? "Proposal wurde bereits bearbeitet."
              : "Speichern fehlgeschlagen.";
        toast.error(msg);
        return;
      }
      toast.success("Proposal approved und Mitarbeiter-Aufgabe erstellt.");
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Vorschlag bearbeiten</DialogTitle>
          <DialogDescription>
            Anpassungen werden uebernommen, wenn du auf &quot;Speichern &amp; Approven&quot; klickst.
            Der Mitarbeiter erhaelt die finale Version.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="bp-title">Titel</Label>
            <Input
              id="bp-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={pending}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="bp-description">Beschreibung</Label>
            <Textarea
              id="bp-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              disabled={pending}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Fragen</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addQuestion}
                disabled={pending}
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                Hinzufuegen
              </Button>
            </div>
            {questions.length === 0 ? (
              <p className="text-sm text-slate-500">
                Noch keine Fragen. Mindestens eine Frage empfohlen.
              </p>
            ) : (
              <div className="space-y-2">
                {questions.map((q, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="mt-2 text-xs text-slate-400 w-6 text-right">{i + 1}.</span>
                    <Textarea
                      value={q}
                      onChange={(e) => updateQuestion(i, e.target.value)}
                      rows={2}
                      className="flex-1"
                      disabled={pending}
                    />
                    <div className="flex flex-col gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => moveQuestion(i, -1)}
                        disabled={pending || i === 0}
                        aria-label="Nach oben"
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => moveQuestion(i, 1)}
                        disabled={pending || i === questions.length - 1}
                        aria-label="Nach unten"
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeQuestion(i)}
                        disabled={pending}
                        aria-label="Loeschen"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-red-500" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="bp-employee">Mitarbeiter</Label>
            <Select value={employeeId} onValueChange={setEmployeeId} disabled={pending}>
              <SelectTrigger id="bp-employee">
                <SelectValue placeholder="Mitarbeiter auswaehlen" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNASSIGNED_VALUE}>Noch nicht zuordnen</SelectItem>
                {employees.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {employees.length === 0 && (
              <p className="text-xs text-slate-500">
                Noch keine Mitarbeiter angelegt. Lege zuerst unter &quot;Mitarbeiter&quot; einen an.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="bp-role">Rollen-Hinweis (optional)</Label>
            <Input
              id="bp-role"
              value={roleHint}
              onChange={(e) => setRoleHint(e.target.value)}
              placeholder="z.B. Buchhaltung, Vertrieb"
              disabled={pending}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Abbrechen
          </Button>
          <Button onClick={handleSaveAndApprove} disabled={pending}>
            {pending ? "Speichere…" : "Speichern & Approven"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
