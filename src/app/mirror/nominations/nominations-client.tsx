"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations, useLocale } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Pencil, Trash2, ShieldCheck, Menu, X } from "lucide-react";
import { DashboardSidebar } from "@/components/dashboard-sidebar";
import { HelpButton } from "@/components/help-button";
import { LearningCenterPanel } from "@/components/learning-center/learning-center-panel";

interface Nomination {
  id: string;
  name: string;
  email: string;
  respondent_layer: string;
  department: string;
  status: string;
  created_at: string;
}

const LAYER_OPTIONS = [
  { value: "leadership_1", labelKey: "layerL1" },
  { value: "leadership_2", labelKey: "layerL2" },
  { value: "key_staff", labelKey: "layerKS" },
];

interface Profile {
  id: string;
  tenant_id: string | null;
  email: string;
  role: string;
}

export function NominationsClient({ tenantId, profile }: { tenantId: string; profile: Profile }) {
  const t = useTranslations("mirror.nominations");
  const locale = useLocale();
  const [nominations, setNominations] = useState<Nomination[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [learningCenterOpen, setLearningCenterOpen] = useState(false);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [layer, setLayer] = useState("key_staff");
  const [department, setDepartment] = useState("");
  const [saving, setSaving] = useState(false);

  const loadNominations = useCallback(async () => {
    try {
      const res = await fetch("/api/tenant/mirror/nominations");
      if (res.ok) {
        const data = await res.json();
        setNominations(data.nominations ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadNominations();
  }, [loadNominations]);

  function openAdd() {
    setEditId(null);
    setName("");
    setEmail("");
    setLayer("key_staff");
    setDepartment("");
    setDialogOpen(true);
  }

  function openEdit(nom: Nomination) {
    setEditId(nom.id);
    setName(nom.name);
    setEmail(nom.email);
    setLayer(nom.respondent_layer);
    setDepartment(nom.department);
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!name.trim() || !email.trim() || !department.trim()) return;
    setSaving(true);
    setMessage(null);

    try {
      const url = editId
        ? `/api/tenant/mirror/nominations/${editId}`
        : "/api/tenant/mirror/nominations";
      const method = editId ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          respondent_layer: layer,
          department: department.trim(),
        }),
      });

      if (res.ok) {
        setMessage({ text: editId ? t("updated") : t("created"), type: "success" });
        setDialogOpen(false);
        loadNominations();
      } else {
        const data = await res.json();
        setMessage({ text: data.error?.message ?? t("error"), type: "error" });
      }
    } catch {
      setMessage({ text: t("networkError"), type: "error" });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setMessage(null);
    try {
      const res = await fetch(`/api/tenant/mirror/nominations/${id}`, { method: "DELETE" });
      if (res.ok) {
        setMessage({ text: t("deleted"), type: "success" });
        loadNominations();
      } else {
        const data = await res.json();
        setMessage({ text: data.error?.message ?? t("error"), type: "error" });
      }
    } catch {
      setMessage({ text: t("networkError"), type: "error" });
    }
  }

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      {/* Mobile toggle */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="fixed left-4 top-4 z-50 rounded-lg bg-white p-2 shadow-md lg:hidden"
      >
        {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/30 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside className={`fixed inset-y-0 left-0 z-40 w-[280px] transform transition-transform duration-300 lg:relative lg:translate-x-0 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <DashboardSidebar profile={profile} activePage="nominations" />
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden lg:ml-0">
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl px-6 py-8">
            {/* Header */}
            <div className="flex items-center gap-3 mb-2">
              <ShieldCheck className="h-5 w-5 text-amber-600" />
              <h1 className="text-2xl font-bold text-slate-900 pl-10 lg:pl-0">{t("title")}</h1>
            </div>
            <p className="text-sm text-slate-500 mb-6">{t("subtitle")}</p>

        {message && (
          <Alert variant={message.type === "error" ? "destructive" : "default"} className="mb-4">
            <AlertDescription>{message.text}</AlertDescription>
          </Alert>
        )}

        {/* Add Button */}
        <div className="flex justify-end mb-4">
          <Button onClick={openAdd}>
            <Plus className="h-4 w-4 mr-2" />
            {t("add")}
          </Button>
        </div>

        {/* List */}
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 w-full rounded-xl" />
            ))}
          </div>
        ) : nominations.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <ShieldCheck className="h-10 w-10 text-slate-300 mb-3" />
              <p className="text-sm text-slate-500">{t("empty")}</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {nominations.map((nom) => (
              <div
                key={nom.id}
                className="flex items-center justify-between rounded-xl bg-white px-5 py-4 border border-slate-200 shadow-sm"
              >
                <div className="flex items-center gap-4">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">{nom.name}</div>
                    <div className="text-xs text-slate-500">{nom.email}</div>
                  </div>
                  <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-700">
                    {t(nom.respondent_layer === "leadership_1" ? "layerL1" : nom.respondent_layer === "leadership_2" ? "layerL2" : "layerKS")}
                  </Badge>
                  <span className="text-xs text-slate-400">{nom.department}</span>
                  {nom.status === "invited" && (
                    <Badge variant="default" className="text-[10px] bg-brand-success">{t("statusInvited")}</Badge>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {nom.status !== "invited" && (
                    <>
                      <Button variant="ghost" size="sm" onClick={() => openEdit(nom)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => handleDelete(nom.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Add/Edit Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editId ? t("editTitle") : t("addTitle")}</DialogTitle>
              <DialogDescription>{t("dialogDescription")}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>{t("fieldName")}</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t("fieldNamePlaceholder")}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("fieldEmail")}</Label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t("fieldEmailPlaceholder")}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("fieldLayer")}</Label>
                <Select value={layer} onValueChange={setLayer}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LAYER_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{t(opt.labelKey)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t("fieldDepartment")}</Label>
                <Input
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  placeholder={t("fieldDepartmentPlaceholder")}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>{t("cancel")}</Button>
              <Button onClick={handleSave} disabled={saving || !name.trim() || !email.trim() || !department.trim()}>
                {saving ? t("saving") : editId ? t("save") : t("create")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
          </div>
        </div>

        {/* Help */}
        <HelpButton onClick={() => setLearningCenterOpen(true)} />
        <LearningCenterPanel
          open={learningCenterOpen}
          onOpenChange={setLearningCenterOpen}
          isMirror={false}
        />
      </div>
    </div>
  );
}
