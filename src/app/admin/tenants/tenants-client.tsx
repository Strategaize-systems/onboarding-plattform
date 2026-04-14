"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChevronDown, ChevronRight, Pencil, Trash2, UserMinus, ShieldCheck } from "lucide-react";

interface TenantUser {
  id: string;
  email: string;
  role: string;
  confirmed: boolean;
  created_at: string;
}

interface MirrorNomination {
  id: string;
  name: string;
  email: string;
  respondent_layer: string;
  department: string;
  status: string;
  created_at: string;
}

interface MirrorRespondent {
  id: string;
  email: string;
  respondent_layer: string | null;
  blocks: string[];
  confirmed: boolean;
  created_at: string;
}

interface Tenant {
  id: string;
  name: string;
  language: string;
  created_at: string;
  owner_email: string | null;
  owner_confirmed: boolean;
  run_count: number;
}

const LANG_LABELS: Record<string, string> = { de: "DE", en: "EN", nl: "NL" };

export function TenantsClient({ email }: { email: string }) {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  // Create tenant state
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newLanguage, setNewLanguage] = useState<"de" | "en" | "nl">("de");
  const [creating, setCreating] = useState(false);

  // Invite state
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteTenantId, setInviteTenantId] = useState<string | null>(null);
  const [inviteTenantName, setInviteTenantName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [inviteRole, setInviteRole] = useState<"tenant_admin" | "tenant_member">("tenant_member");
  const [inviteBlocks, setInviteBlocks] = useState<string[]>([]);

  // Edit state
  const [editOpen, setEditOpen] = useState(false);
  const [editTenantId, setEditTenantId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editLanguage, setEditLanguage] = useState<"de" | "en" | "nl">("de");
  const [saving, setSaving] = useState(false);

  // Delete state
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteTenantId, setDeleteTenantId] = useState<string | null>(null);
  const [deleteTenantName, setDeleteTenantName] = useState("");
  const [deleting, setDeleting] = useState(false);

  // User list state
  const [expandedTenantId, setExpandedTenantId] = useState<string | null>(null);
  const [tenantUsers, setTenantUsers] = useState<TenantUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [removingUserId, setRemovingUserId] = useState<string | null>(null);

  // Mirror respondent + nominations state
  const [mirrorRespondents, setMirrorRespondents] = useState<MirrorRespondent[]>([]);
  const [mirrorNominations, setMirrorNominations] = useState<MirrorNomination[]>([]);
  const [mirrorLoading, setMirrorLoading] = useState(false);
  const [mirrorInviteOpen, setMirrorInviteOpen] = useState(false);
  const [mirrorInviteTenantId, setMirrorInviteTenantId] = useState<string | null>(null);
  const [mirrorInviteTenantName, setMirrorInviteTenantName] = useState("");
  const [mirrorEmail, setMirrorEmail] = useState("");
  const [mirrorLayer, setMirrorLayer] = useState<string>("key_staff");
  const [mirrorBlocks, setMirrorBlocks] = useState<string[]>([]);
  const [mirrorInviting, setMirrorInviting] = useState(false);

  const ALL_BLOCKS = ["A", "B", "C", "D", "E", "F", "G", "H", "I"];
  const LAYER_OPTIONS = [
    { value: "leadership_1", label: "Geschäftsführung / C-Level" },
    { value: "leadership_2", label: "Bereichsleitung / 2. Ebene" },
    { value: "key_staff", label: "Schlüsselmitarbeiter" },
  ];

  const loadTenants = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/tenants");
      if (res.ok) {
        const data = await res.json();
        setTenants(data.tenants ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTenants();
  }, [loadTenants]);

  async function loadUsers(tenantId: string) {
    setUsersLoading(true);
    try {
      const res = await fetch(`/api/admin/tenants/${tenantId}`);
      if (res.ok) {
        const data = await res.json();
        setTenantUsers(data.users ?? []);
      }
    } finally {
      setUsersLoading(false);
    }
  }

  function toggleUsers(tenantId: string) {
    if (expandedTenantId === tenantId) {
      setExpandedTenantId(null);
      return;
    }
    setExpandedTenantId(tenantId);
    loadUsers(tenantId);
    loadMirrorRespondents(tenantId);
  }

  // ─── Mirror Respondents ──────────────────────────────────────────────
  async function loadMirrorRespondents(tenantId: string) {
    setMirrorLoading(true);
    try {
      const res = await fetch(`/api/admin/tenants/${tenantId}/mirror-respondents`);
      if (res.ok) {
        const data = await res.json();
        setMirrorRespondents(data.respondents ?? []);
        setMirrorNominations(data.nominations ?? []);
      }
    } finally {
      setMirrorLoading(false);
    }
  }

  function inviteFromNomination(nom: MirrorNomination, tenantId: string, tenantName: string) {
    setMirrorInviteTenantId(tenantId);
    setMirrorInviteTenantName(tenantName);
    setMirrorEmail(nom.email);
    setMirrorLayer(nom.respondent_layer);
    setMirrorBlocks([]);
    setMirrorInviteOpen(true);
  }

  function openMirrorInvite(tenantId: string, tenantName: string) {
    setMirrorInviteTenantId(tenantId);
    setMirrorInviteTenantName(tenantName);
    setMirrorEmail("");
    setMirrorLayer("key_staff");
    setMirrorBlocks([]);
    setMirrorInviteOpen(true);
  }

  function toggleMirrorBlock(block: string) {
    setMirrorBlocks((prev) =>
      prev.includes(block) ? prev.filter((b) => b !== block) : [...prev, block]
    );
  }

  async function handleMirrorInvite() {
    if (!mirrorEmail.trim() || !mirrorInviteTenantId) return;
    setMirrorInviting(true);
    setMessage(null);

    try {
      const res = await fetch(`/api/admin/tenants/${mirrorInviteTenantId}/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: mirrorEmail.trim(),
          role: "mirror_respondent",
          respondentLayer: mirrorLayer,
          surveyType: "mirror",
          ...(mirrorBlocks.length > 0 ? { allowedBlocks: mirrorBlocks } : {}),
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setMessage({ text: data.message, type: "success" });
        setMirrorInviteOpen(false);
        loadMirrorRespondents(mirrorInviteTenantId);
      } else {
        const data = await res.json();
        setMessage({ text: data.error?.message ?? "Fehler beim Einladen", type: "error" });
      }
    } catch {
      setMessage({ text: "Netzwerkfehler", type: "error" });
    } finally {
      setMirrorInviting(false);
    }
  }

  // ─── Create ─────────────────────────────────────────────────────────
  async function handleCreateTenant() {
    if (!newName.trim()) return;
    setCreating(true);
    setMessage(null);

    try {
      const res = await fetch("/api/admin/tenants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), language: newLanguage }),
      });

      if (res.ok) {
        setMessage({ text: `Tenant "${newName.trim()}" erstellt`, type: "success" });
        setNewName("");
        setNewLanguage("de");
        setCreateOpen(false);
        await loadTenants();
      } else {
        const data = await res.json();
        setMessage({ text: data.error?.message ?? "Fehler beim Erstellen", type: "error" });
      }
    } catch {
      setMessage({ text: "Netzwerkfehler", type: "error" });
    } finally {
      setCreating(false);
    }
  }

  // ─── Edit ───────────────────────────────────────────────────────────
  function openEdit(tenant: Tenant) {
    setEditTenantId(tenant.id);
    setEditName(tenant.name);
    setEditLanguage((tenant.language ?? "de") as "de" | "en" | "nl");
    setEditOpen(true);
  }

  async function handleSaveEdit() {
    if (!editTenantId || !editName.trim()) return;
    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch(`/api/admin/tenants/${editTenantId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName.trim(), language: editLanguage }),
      });

      if (res.ok) {
        setMessage({ text: "Tenant aktualisiert", type: "success" });
        setEditOpen(false);
        await loadTenants();
      } else {
        const data = await res.json();
        setMessage({ text: data.error?.message ?? "Fehler beim Speichern", type: "error" });
      }
    } catch {
      setMessage({ text: "Netzwerkfehler", type: "error" });
    } finally {
      setSaving(false);
    }
  }

  // ─── Delete ─────────────────────────────────────────────────────────
  function openDelete(tenant: Tenant) {
    setDeleteTenantId(tenant.id);
    setDeleteTenantName(tenant.name);
    setDeleteConfirmOpen(true);
  }

  async function handleDeleteTenant() {
    if (!deleteTenantId) return;
    setDeleting(true);
    setMessage(null);

    try {
      const res = await fetch(`/api/admin/tenants/${deleteTenantId}`, {
        method: "DELETE",
      });

      if (res.ok) {
        const data = await res.json();
        setMessage({ text: data.message, type: "success" });
        setDeleteConfirmOpen(false);
        if (expandedTenantId === deleteTenantId) setExpandedTenantId(null);
        await loadTenants();
      } else {
        const data = await res.json();
        setMessage({ text: data.error?.message ?? "Fehler beim Löschen", type: "error" });
      }
    } catch {
      setMessage({ text: "Netzwerkfehler", type: "error" });
    } finally {
      setDeleting(false);
    }
  }

  // ─── Invite ─────────────────────────────────────────────────────────
  function toggleBlock(block: string) {
    setInviteBlocks((prev) =>
      prev.includes(block) ? prev.filter((b) => b !== block) : [...prev, block]
    );
  }

  function openInvite(tenantId: string, tenantName: string) {
    setInviteTenantId(tenantId);
    setInviteTenantName(tenantName);
    setInviteEmail("");
    // Default to admin if tenant has no owner yet
    const tenant = tenants.find((t) => t.id === tenantId);
    setInviteRole(!tenant?.owner_email ? "tenant_admin" : "tenant_member");
    setInviteBlocks([]);
    setInviteOpen(true);
  }

  async function handleInvite() {
    if (!inviteEmail.trim() || !inviteTenantId) return;
    setInviting(true);
    setMessage(null);

    try {
      const res = await fetch(`/api/admin/tenants/${inviteTenantId}/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: inviteEmail.trim(),
          role: inviteRole,
          ...(inviteRole === "tenant_member" && inviteBlocks.length > 0 ? { allowedBlocks: inviteBlocks } : {}),
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setMessage({ text: data.message, type: "success" });
        setInviteOpen(false);
        await loadTenants();
        if (expandedTenantId === inviteTenantId) loadUsers(inviteTenantId);
      } else {
        const data = await res.json();
        setMessage({ text: data.error?.message ?? "Fehler beim Einladen", type: "error" });
      }
    } catch {
      setMessage({ text: "Netzwerkfehler", type: "error" });
    } finally {
      setInviting(false);
    }
  }

  // ─── Remove User ────────────────────────────────────────────────────
  async function handleRemoveUser(tenantId: string, userId: string) {
    setRemovingUserId(userId);
    setMessage(null);

    try {
      const res = await fetch(`/api/admin/tenants/${tenantId}/users/${userId}`, {
        method: "DELETE",
      });

      if (res.ok) {
        const data = await res.json();
        setMessage({ text: data.message, type: "success" });
        await loadUsers(tenantId);
        await loadTenants();
      } else {
        const data = await res.json();
        setMessage({ text: data.error?.message ?? "Fehler beim Entfernen", type: "error" });
      }
    } catch {
      setMessage({ text: "Netzwerkfehler", type: "error" });
    } finally {
      setRemovingUserId(null);
    }
  }

  // ─── Render ─────────────────────────────────────────────────────────
  return (
    <div>
      <div>
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-3xl font-bold text-slate-900">Tenant-Verwaltung</h2>
            <p className="mt-1 text-sm text-slate-500">Unternehmen und Benutzer verwalten</p>
          </div>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button>Neuer Tenant</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Neuen Tenant erstellen</DialogTitle>
                <DialogDescription>
                  Erstellen Sie ein neues Unternehmen (Tenant) in der Plattform.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="tenant-name">Unternehmensname</Label>
                  <Input
                    id="tenant-name"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="z.B. Muster GmbH"
                    onKeyDown={(e) => e.key === "Enter" && handleCreateTenant()}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tenant-language">Sprache</Label>
                  <Select value={newLanguage} onValueChange={(v) => setNewLanguage(v as "de" | "en" | "nl")}>
                    <SelectTrigger id="tenant-language">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="de">Deutsch</SelectItem>
                      <SelectItem value="en">English</SelectItem>
                      <SelectItem value="nl">Nederlands</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateOpen(false)}>Abbrechen</Button>
                <Button onClick={handleCreateTenant} disabled={creating || !newName.trim()}>
                  {creating ? "Wird erstellt..." : "Erstellen"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {message && (
          <Alert variant={message.type === "error" ? "destructive" : "default"} className="mb-4">
            <AlertDescription>{message.text}</AlertDescription>
          </Alert>
        )}

        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
        ) : tenants.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              Noch keine Tenants erstellt. Klicken Sie auf &quot;Neuer Tenant&quot; um zu beginnen.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {tenants.map((tenant) => (
              <Collapsible
                key={tenant.id}
                open={expandedTenantId === tenant.id}
                onOpenChange={() => toggleUsers(tenant.id)}
              >
                <div className="relative overflow-hidden bg-white rounded-2xl border-2 border-slate-200 shadow-lg hover:shadow-xl transition-all duration-300">
                  <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-brand-primary-dark via-brand-primary to-brand-success-dark" />
                  <div className="px-6 pt-6 pb-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <h3 className="text-lg font-bold text-slate-900">{tenant.name}</h3>
                        <Badge variant="secondary" className="text-xs">
                          {LANG_LABELS[tenant.language] ?? tenant.language}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => openInvite(tenant.id, tenant.name)}>
                          Einladen
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => openEdit(tenant)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => openDelete(tenant)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                  <div className="px-6 pb-3">
                    <div className="flex gap-6 text-sm">
                      <span className="text-slate-500">
                        Owner: {tenant.owner_email ? (
                        <>
                          <span className="font-semibold text-slate-900">{tenant.owner_email}</span>
                          {tenant.owner_confirmed ? (
                            <Badge variant="default" className="ml-2 text-[10px] bg-brand-success">Aktiv</Badge>
                          ) : (
                            <Badge variant="outline" className="ml-2 text-[10px] text-amber-600 border-amber-300">Eingeladen</Badge>
                          )}
                        </>
                      ) : (
                        <span className="font-semibold text-amber-600">Kein Admin — User anzeigen für Details</span>
                      )}
                      </span>
                      <span className="text-slate-500">
                        <span className="font-bold text-brand-primary">{tenant.run_count}</span> Runs
                      </span>
                      <span className="text-slate-400">
                        Erstellt: {new Date(tenant.created_at).toLocaleDateString("de-DE")}
                      </span>
                    </div>
                  </div>
                  {/* User list toggle */}
                  <div className="px-6 pb-4">
                    <CollapsibleTrigger asChild>
                      <button className="flex items-center gap-1.5 text-xs font-semibold text-brand-primary hover:text-brand-primary-dark transition-colors">
                        {expandedTenantId === tenant.id ? (
                          <ChevronDown className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5" />
                        )}
                        User anzeigen
                      </button>
                    </CollapsibleTrigger>
                  </div>
                  <CollapsibleContent>
                    <div className="px-6 pb-5 border-t border-slate-100 pt-3">
                      <Tabs defaultValue="users">
                        <TabsList className="mb-3">
                          <TabsTrigger value="users">User ({tenantUsers.length})</TabsTrigger>
                          <TabsTrigger value="mirror">
                            <ShieldCheck className="h-3.5 w-3.5 mr-1.5" />
                            Mirror ({mirrorRespondents.length})
                          </TabsTrigger>
                        </TabsList>

                        {/* User Tab */}
                        <TabsContent value="users">
                          {usersLoading ? (
                            <Skeleton className="h-16 w-full" />
                          ) : tenantUsers.length === 0 ? (
                            <p className="text-sm text-slate-400 py-2">Keine User in diesem Tenant.</p>
                          ) : (
                            <div className="space-y-2">
                              {tenantUsers.map((user) => (
                                <div
                                  key={user.id}
                                  className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-2.5 border border-slate-200"
                                >
                                  <div className="flex items-center gap-3">
                                    <span className="text-sm font-medium text-slate-900">{user.email}</span>
                                    <Badge variant={user.role === "tenant_admin" ? "default" : "outline"} className="text-[10px]">
                                      {user.role === "tenant_admin" ? "Admin" : "Mitarbeiter"}
                                    </Badge>
                                    {user.confirmed ? (
                                      <Badge variant="default" className="text-[10px] bg-brand-success">Aktiv</Badge>
                                    ) : (
                                      <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300">Eingeladen</Badge>
                                    )}
                                  </div>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-red-500 hover:text-red-700 hover:bg-red-50"
                                    disabled={removingUserId === user.id}
                                    onClick={() => handleRemoveUser(tenant.id, user.id)}
                                  >
                                    <UserMinus className="h-4 w-4" />
                                  </Button>
                                </div>
                              ))}
                            </div>
                          )}
                        </TabsContent>

                        {/* Mirror Tab */}
                        <TabsContent value="mirror">
                          <div className="flex items-center justify-between mb-3">
                            <p className="text-xs text-slate-500">Vertrauliche Mirror-Teilnehmer für die Realitätserhebung</p>
                            <Button size="sm" variant="outline" onClick={() => openMirrorInvite(tenant.id, tenant.name)}>
                              Mirror einladen
                            </Button>
                          </div>
                          {mirrorLoading ? (
                            <Skeleton className="h-16 w-full" />
                          ) : mirrorRespondents.length === 0 ? (
                            <p className="text-sm text-slate-400 py-2">Keine Mirror-Teilnehmer. Klicken Sie &quot;Mirror einladen&quot; um zu beginnen.</p>
                          ) : (
                            <div className="space-y-2">
                              {mirrorRespondents.map((r) => (
                                <div
                                  key={r.id}
                                  className="flex items-center justify-between rounded-lg bg-amber-50/50 px-4 py-2.5 border border-amber-200"
                                >
                                  <div className="flex items-center gap-3">
                                    <span className="text-sm font-medium text-slate-900">{r.email}</span>
                                    <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-700">
                                      {r.respondent_layer ?? "—"}
                                    </Badge>
                                    {r.blocks.length > 0 && (
                                      <span className="text-[10px] text-slate-500">
                                        Blöcke: {r.blocks.join(", ")}
                                      </span>
                                    )}
                                    {r.confirmed ? (
                                      <Badge variant="default" className="text-[10px] bg-brand-success">Aktiv</Badge>
                                    ) : (
                                      <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300">Eingeladen</Badge>
                                    )}
                                  </div>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-red-500 hover:text-red-700 hover:bg-red-50"
                                    disabled={removingUserId === r.id}
                                    onClick={() => handleRemoveUser(tenant.id, r.id)}
                                  >
                                    <UserMinus className="h-4 w-4" />
                                  </Button>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Nominations from GF */}
                          {mirrorNominations.length > 0 && (
                            <div className="mt-4 pt-3 border-t border-amber-100">
                              <p className="text-xs font-semibold text-amber-700 mb-2">Vorschläge vom GF ({mirrorNominations.length})</p>
                              <div className="space-y-2">
                                {mirrorNominations.map((nom) => (
                                  <div
                                    key={nom.id}
                                    className="flex items-center justify-between rounded-lg bg-amber-50/30 px-4 py-2.5 border border-amber-100"
                                  >
                                    <div className="flex items-center gap-3">
                                      <span className="text-sm font-medium text-slate-900">{nom.name}</span>
                                      <span className="text-xs text-slate-500">{nom.email}</span>
                                      <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-700">
                                        {nom.respondent_layer}
                                      </Badge>
                                      <span className="text-[10px] text-slate-400">{nom.department}</span>
                                      {nom.status === "invited" && (
                                        <Badge variant="default" className="text-[10px] bg-brand-success">Eingeladen</Badge>
                                      )}
                                    </div>
                                    {nom.status !== "invited" && (
                                      <Button size="sm" variant="outline" className="text-xs" onClick={() => inviteFromNomination(nom, tenant.id, tenant.name)}>
                                        Einladen
                                      </Button>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </TabsContent>
                      </Tabs>
                    </div>
                  </CollapsibleContent>
                </div>
              </Collapsible>
            ))}
          </div>
        )}

        {/* Edit Tenant Dialog */}
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Tenant bearbeiten</DialogTitle>
              <DialogDescription>Name und Sprache des Tenants ändern.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="edit-name">Unternehmensname</Label>
                <Input
                  id="edit-name"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSaveEdit()}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-language">Sprache</Label>
                <Select value={editLanguage} onValueChange={(v) => setEditLanguage(v as "de" | "en" | "nl")}>
                  <SelectTrigger id="edit-language">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="de">Deutsch</SelectItem>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="nl">Nederlands</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditOpen(false)}>Abbrechen</Button>
              <Button onClick={handleSaveEdit} disabled={saving || !editName.trim()}>
                {saving ? "Wird gespeichert..." : "Speichern"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Tenant Confirmation */}
        <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Tenant &quot;{deleteTenantName}&quot; löschen?</AlertDialogTitle>
              <AlertDialogDescription>
                Alle Daten dieses Tenants werden unwiderruflich gelöscht: User, Runs, Antworten, Evidence, Checkpoints. Diese Aktion kann nicht rückgängig gemacht werden.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Abbrechen</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteTenant}
                disabled={deleting}
                className="bg-red-600 hover:bg-red-700"
              >
                {deleting ? "Wird gelöscht..." : "Endgültig löschen"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Invite Dialog */}
        <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>User einladen</DialogTitle>
              <DialogDescription>
                Senden Sie eine Einladung an einen User für &quot;{inviteTenantName}&quot;.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="invite-email">E-Mail-Adresse</Label>
                <Input
                  id="invite-email"
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="name@unternehmen.de"
                  onKeyDown={(e) => e.key === "Enter" && handleInvite()}
                />
              </div>
              <div className="space-y-2">
                <Label>Rolle</Label>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setInviteRole("tenant_admin")}
                    className={`flex-1 rounded-lg border-2 px-3 py-2 text-sm font-medium transition-all ${
                      inviteRole === "tenant_admin"
                        ? "border-brand-primary bg-brand-primary/5 text-brand-primary-dark"
                        : "border-slate-200 text-slate-500 hover:border-slate-300"
                    }`}
                  >
                    Administrator
                    <span className="block text-[10px] font-normal mt-0.5">Kann Mitarbeiter einladen</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setInviteRole("tenant_member")}
                    className={`flex-1 rounded-lg border-2 px-3 py-2 text-sm font-medium transition-all ${
                      inviteRole === "tenant_member"
                        ? "border-brand-primary bg-brand-primary/5 text-brand-primary-dark"
                        : "border-slate-200 text-slate-500 hover:border-slate-300"
                    }`}
                  >
                    Mitarbeiter
                    <span className="block text-[10px] font-normal mt-0.5">Zugriff auf bestimmte Blöcke</span>
                  </button>
                </div>
              </div>
              {inviteRole === "tenant_member" && (
                <div className="space-y-2">
                  <Label>Zugewiesene Blöcke</Label>
                  <p className="text-xs text-slate-500">Wählen Sie die Blöcke, auf die der Mitarbeiter Zugriff haben soll.</p>
                  <div className="flex flex-wrap gap-2">
                    {ALL_BLOCKS.map((block) => (
                      <button
                        key={block}
                        type="button"
                        onClick={() => toggleBlock(block)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                          inviteBlocks.includes(block)
                            ? "bg-gradient-to-r from-brand-primary-dark to-brand-primary text-white shadow-sm"
                            : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                        }`}
                      >
                        Block {block}
                      </button>
                    ))}
                  </div>
                  {inviteBlocks.length === 0 && (
                    <p className="text-xs text-amber-600">Mindestens einen Block auswählen</p>
                  )}
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setInviteOpen(false)}>Abbrechen</Button>
              <Button
                onClick={handleInvite}
                disabled={inviting || !inviteEmail.trim() || (inviteRole === "tenant_member" && inviteBlocks.length === 0)}
              >
                {inviting ? "Wird gesendet..." : "Einladung senden"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        {/* Mirror Invite Dialog */}
        <Dialog open={mirrorInviteOpen} onOpenChange={setMirrorInviteOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Mirror-Teilnehmer einladen</DialogTitle>
              <DialogDescription>
                Vertrauliche Einladung für &quot;{mirrorInviteTenantName}&quot;. Der Teilnehmer muss die Vertraulichkeits-Policy bestätigen.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="mirror-email">E-Mail-Adresse</Label>
                <Input
                  id="mirror-email"
                  type="email"
                  value={mirrorEmail}
                  onChange={(e) => setMirrorEmail(e.target.value)}
                  placeholder="name@unternehmen.de"
                  onKeyDown={(e) => e.key === "Enter" && handleMirrorInvite()}
                />
              </div>
              <div className="space-y-2">
                <Label>Organisationsebene</Label>
                <Select value={mirrorLayer} onValueChange={setMirrorLayer}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LAYER_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Zugewiesene Blöcke</Label>
                <p className="text-xs text-slate-500">Wählen Sie die Blöcke für die Mirror-Erhebung.</p>
                <div className="flex flex-wrap gap-2">
                  {ALL_BLOCKS.map((block) => (
                    <button
                      key={block}
                      type="button"
                      onClick={() => toggleMirrorBlock(block)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        mirrorBlocks.includes(block)
                          ? "bg-gradient-to-r from-amber-500 to-amber-600 text-white shadow-sm"
                          : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                      }`}
                    >
                      Block {block}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setMirrorInviteOpen(false)}>Abbrechen</Button>
              <Button
                onClick={handleMirrorInvite}
                disabled={mirrorInviting || !mirrorEmail.trim()}
              >
                {mirrorInviting ? "Wird gesendet..." : "Mirror-Einladung senden"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
