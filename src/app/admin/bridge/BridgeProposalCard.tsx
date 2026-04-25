"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { approveBridgeProposal, rejectBridgeProposal } from "./actions";
import { BridgeProposalEditDialog } from "./BridgeProposalEditDialog";
import type {
  BridgeProposalQuestion,
  BridgeProposalRow,
  EmployeeRow,
} from "./types";

interface Props {
  proposal: BridgeProposalRow;
  employees: EmployeeRow[];
}

function statusVariant(status: BridgeProposalRow["status"]) {
  if (status === "approved" || status === "spawned") return "default" as const;
  if (status === "rejected") return "destructive" as const;
  return "secondary" as const;
}

function statusLabel(status: BridgeProposalRow["status"]): string {
  switch (status) {
    case "proposed":
      return "Vorgeschlagen";
    case "edited":
      return "Bearbeitet";
    case "approved":
      return "Approved";
    case "spawned":
      return "Aufgabe erstellt";
    case "rejected":
      return "Abgelehnt";
  }
}

function questionsCount(questions: BridgeProposalQuestion[] | unknown): number {
  if (!Array.isArray(questions)) return 0;
  return questions.length;
}

export function BridgeProposalCard({ proposal, employees }: Props) {
  const [pending, startTransition] = useTransition();
  const [editOpen, setEditOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  const employee = employees.find((e) => e.id === proposal.proposed_employee_user_id);
  const employeeLabel = employee
    ? employee.email
    : proposal.proposed_employee_role_hint
      ? `Rolle: ${proposal.proposed_employee_role_hint}`
      : "Noch nicht zugeordnet";

  const isFinal = proposal.status === "rejected" || proposal.status === "spawned";
  const canApproveDirectly =
    !!proposal.proposed_employee_user_id &&
    (proposal.status === "proposed" || proposal.status === "edited");

  function handleQuickApprove() {
    if (!proposal.proposed_employee_user_id) {
      toast.error("Bitte zuerst einen Mitarbeiter zuordnen.");
      return;
    }
    startTransition(async () => {
      const result = await approveBridgeProposal(proposal.id);
      if (!result.ok) {
        toast.error(
          result.error === "no_employee_assigned"
            ? "Bitte einen Mitarbeiter zuordnen."
            : "Approve fehlgeschlagen."
        );
        return;
      }
      toast.success("Proposal approved und Mitarbeiter-Aufgabe erstellt.");
    });
  }

  function handleReject() {
    const trimmed = rejectReason.trim();
    if (trimmed.length === 0) {
      toast.error("Bitte einen Ablehnungsgrund angeben.");
      return;
    }
    startTransition(async () => {
      const result = await rejectBridgeProposal(proposal.id, trimmed);
      if (!result.ok) {
        toast.error(
          result.error === "already_spawned"
            ? "Diese Aufgabe wurde bereits erstellt."
            : "Ablehnen fehlgeschlagen."
        );
        return;
      }
      toast.success("Vorschlag abgelehnt.");
      setRejectOpen(false);
      setRejectReason("");
    });
  }

  const modeBadge =
    proposal.proposal_mode === "template"
      ? { label: `Template${proposal.source_subtopic_key ? ` · ${proposal.source_subtopic_key}` : ""}`, variant: "outline" as const }
      : { label: "Free-Form", variant: "outline" as const };

  return (
    <Card className="flex flex-col">
      <CardHeader className="space-y-2">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <Badge variant={modeBadge.variant} className="text-xs">
            {modeBadge.label}
          </Badge>
          <Badge variant={statusVariant(proposal.status)} className="text-xs">
            {statusLabel(proposal.status)}
          </Badge>
        </div>
        <CardTitle className="text-base leading-snug">
          {proposal.proposed_block_title}
        </CardTitle>
      </CardHeader>

      <CardContent className="flex-1 space-y-3 text-sm">
        {proposal.proposed_block_description && (
          <p className="text-slate-600 leading-relaxed">
            {proposal.proposed_block_description}
          </p>
        )}

        <div className="text-xs text-slate-500 space-y-1">
          <div>
            <span className="font-medium text-slate-700">Mitarbeiter: </span>
            <span>{employeeLabel}</span>
          </div>
          <div>
            <span className="font-medium text-slate-700">Fragen: </span>
            <span>{questionsCount(proposal.proposed_questions)}</span>
          </div>
        </div>

        {proposal.status === "spawned" && proposal.approved_capture_session_id && (
          <Link
            href={`/admin/session/${proposal.approved_capture_session_id}`}
            className="text-xs text-brand-primary underline"
          >
            Zur Mitarbeiter-Aufgabe →
          </Link>
        )}

        {proposal.status === "rejected" && proposal.reject_reason && (
          <p className="text-xs text-slate-500 italic">
            Grund: {proposal.reject_reason}
          </p>
        )}
      </CardContent>

      {!isFinal && (
        <div className="border-t border-slate-100 px-6 py-3 flex flex-wrap gap-2 justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setEditOpen(true)}
            disabled={pending}
          >
            Bearbeiten
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setRejectOpen(true)}
            disabled={pending}
          >
            Ablehnen
          </Button>
          <Button
            size="sm"
            onClick={handleQuickApprove}
            disabled={pending || !canApproveDirectly}
            title={
              canApproveDirectly
                ? "Mit aktuellen Werten approven"
                : "Mitarbeiter zuordnen via Bearbeiten"
            }
          >
            Approven
          </Button>
        </div>
      )}

      <BridgeProposalEditDialog
        proposal={proposal}
        employees={employees}
        open={editOpen}
        onOpenChange={setEditOpen}
      />

      <AlertDialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Vorschlag ablehnen?</AlertDialogTitle>
            <AlertDialogDescription>
              Der Vorschlag wird als abgelehnt markiert und kein Mitarbeiter erhaelt eine Aufgabe.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label htmlFor={`reject-reason-${proposal.id}`}>Grund</Label>
            <Textarea
              id={`reject-reason-${proposal.id}`}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Warum ist dieser Vorschlag nicht relevant?"
              rows={3}
              disabled={pending}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={pending}
              onClick={() => setRejectReason("")}
            >
              Abbrechen
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleReject();
              }}
              disabled={pending}
            >
              Ablehnen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
