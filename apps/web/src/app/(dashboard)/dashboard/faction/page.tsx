"use client";

import { Children, useState, type ReactNode } from "react";
import { useAuth } from "@/lib/auth-context";
import {
  factionApi,
  type FactionAnnouncementData,
  type FactionEventData,
  type FactionMemberData,
} from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import Button from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import DashboardDecor from "@/components/dashboard/DashboardDecor";
import { ModuleHeader } from "@/components/dashboard/DashboardHelpers";
import { useQuery, queryClient } from "@/lib/query";
import FactionOverviewTab from "./components/FactionOverviewTab";
import FactionMembersTab from "./components/FactionMembersTab";
import JoinFactionTab from "./components/JoinFactionTab";
import FactionGuildsTab from "./components/FactionGuildsTab";
import FactionAuditLogTab from "./components/FactionAuditLogTab";
import FactionSettingsTab from "./components/FactionSettingsTab";
import FactionInventoryTab from "./components/FactionInventoryTab";
import FactionInventoryRequestsTab from "./components/FactionInventoryRequestsTab";

type FactionTab = "OVERVIEW" | "ANNOUNCEMENTS" | "EVENTS" | "GUILD_MEMBERS" | "INVENTORY" | "ITEM_REQUESTS" | "JOIN_FACTION" | "AUDIT_LOG" | "SETTINGS";

export default function FactionPage() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const activeGuild = user?.guilds?.[0];
  const [activeTab, setActiveTab] = useState<FactionTab>("OVERVIEW");
  const [announcementForm, setAnnouncementForm] = useState({ title: "", body: "", priority: "NORMAL" });
  const [eventForm, setEventForm] = useState({ title: "", description: "", startsAt: "", endsAt: "", location: "" });
  const [isSaving, setIsSaving] = useState(false);

  const canManage = activeGuild?.role === "FACTION_LEADER" || activeGuild?.role === "ADMIN";
  const isGuildLeader = activeGuild?.role === "GUILD_LEADER";
  const canLeaveFaction =
    activeGuild?.role === "GUILD_LEADER" ||
    activeGuild?.role === "FACTION_LEADER" ||
    activeGuild?.role === "ADMIN";

  const { data: announcementsRaw, isLoading: isLoadingAnnouncements } = useQuery<FactionAnnouncementData[]>(
    "faction_announcements",
    async () => {
      const result = await factionApi.getAnnouncements();
      return result.success && result.data?.announcements ? result.data.announcements : [];
    },
    { persist: true, staleTime: 30000 },
  );

  const { data: eventsRaw, isLoading: isLoadingEvents } = useQuery<FactionEventData[]>(
    "faction_events",
    async () => {
      const result = await factionApi.getEvents();
      return result.success && result.data?.events ? result.data.events : [];
    },
    { persist: true, staleTime: 30000 },
  );

  // Same query key as FactionMembersTab — shares its cache, just for the tab count badge.
  const { data: membersRaw } = useQuery<FactionMemberData[]>(
    canManage ? "faction_members" : "faction_members_locked",
    async () => {
      if (!canManage) return [];
      const result = await factionApi.getMembers();
      return result.success && result.data?.members ? result.data.members : [];
    },
    { persist: true, staleTime: 30000 },
  );

  const announcements = announcementsRaw || [];
  const events = eventsRaw || [];
  const members = membersRaw || [];

  async function createAnnouncement() {
    if (!announcementForm.title.trim() || !announcementForm.body.trim()) return;
    setIsSaving(true);
    try {
      const result = await factionApi.createAnnouncement(announcementForm);
      if (result.success) {
        addToast("success", "Faction announcement posted");
        setAnnouncementForm({ title: "", body: "", priority: "NORMAL" });
        queryClient.invalidateQueries("faction_announcements");
      } else {
        addToast("error", result.error?.message || "Failed to post announcement");
      }
    } finally {
      setIsSaving(false);
    }
  }

  async function createEvent() {
    if (!eventForm.title.trim() || !eventForm.startsAt) return;
    setIsSaving(true);
    try {
      const result = await factionApi.createEvent({
        ...eventForm,
        endsAt: eventForm.endsAt || null,
      });
      if (result.success) {
        addToast("success", "Faction event created");
        setEventForm({ title: "", description: "", startsAt: "", endsAt: "", location: "" });
        queryClient.invalidateQueries("faction_events");
      } else {
        addToast("error", result.error?.message || "Failed to create event");
      }
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteAnnouncement(id: string) {
    const result = await factionApi.deleteAnnouncement(id);
    if (result.success) {
      queryClient.invalidateQueries("faction_announcements");
      addToast("success", "Announcement archived");
    }
  }

  async function deleteEvent(id: string) {
    const result = await factionApi.deleteEvent(id);
    if (result.success) {
      queryClient.invalidateQueries("faction_events");
      addToast("success", "Event archived");
    }
  }

  if (!user || !activeGuild) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-white/40">No active guild selected</p>
      </div>
    );
  }

  const tabs: Array<{ id: FactionTab; label: string; count?: number }> = [
    { id: "OVERVIEW", label: "Overview" },
    { id: "ANNOUNCEMENTS", label: "Announcement", count: announcements.length },
    { id: "EVENTS", label: "Events", count: events.length },
    ...(canManage ? [{ id: "GUILD_MEMBERS" as FactionTab, label: "Guild Members", count: members.length }] : []),
    { id: "INVENTORY", label: "Inventory" },
    ...(isGuildLeader || canManage ? [{ id: "ITEM_REQUESTS" as FactionTab, label: "Item Requests" }] : []),
    ...(canManage ? [{ id: "AUDIT_LOG" as FactionTab, label: "Audit Log" }] : []),
    ...(canManage ? [{ id: "SETTINGS" as FactionTab, label: "Settings" }] : []),
    ...(isGuildLeader ? [{ id: "JOIN_FACTION" as FactionTab, label: "Join a Faction" }] : []),
  ];

  return (
    <div className="relative max-w-7xl mx-auto w-full">
      <DashboardDecor />
      <div className="relative z-10 space-y-6 text-white/85">
        <ModuleHeader
          eyebrow="Faction"
          title="Faction Command"
          description="Shared announcements, event planning, and cross-guild visibility."
        />

        <div className="inline-flex flex-wrap items-center glass-subtle border border-white/[0.06] rounded-xl p-1 gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-[13px] font-semibold rounded-lg transition-all cursor-pointer focus-ring ${
                activeTab === tab.id
                  ? "bg-amber-500/10 border border-amber-500/25 text-amber-400"
                  : "text-white/45 hover:text-white/75 border border-transparent hover:bg-white/[0.03]"
              }`}
            >
              {tab.label}
              {typeof tab.count === "number" && (
                <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-white/5 text-white/45">
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {activeTab === "OVERVIEW" && (
          <FactionOverviewTab canManage={canManage} canLeaveFaction={canLeaveFaction} />
        )}

        {activeTab === "ANNOUNCEMENTS" && (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-5 items-start">
            <ContentList loading={isLoadingAnnouncements} empty="No announcements posted">
              {announcements.map((item) => (
                <PanelRow key={item.id} title={item.title} meta={`${item.priority} - ${new Date(item.createdAt).toLocaleDateString()}`}>
                  <p className="text-sm text-white/55 leading-relaxed">{item.body}</p>
                  {canManage && (
                    <button onClick={() => deleteAnnouncement(item.id)} className="mt-3 text-[11px] text-red-300 hover:text-red-200 cursor-pointer">
                      Archive
                    </button>
                  )}
                </PanelRow>
              ))}
            </ContentList>
            {canManage && (
              <FormPanel title="New announcement">
                <Field label="Title" value={announcementForm.title} onChange={(value) => setAnnouncementForm((prev) => ({ ...prev, title: value }))} />
                <label className="block">
                  <span className="block text-[10px] uppercase tracking-[0.16em] text-white/45 mb-2">Body</span>
                  <textarea
                    value={announcementForm.body}
                    onChange={(event) => setAnnouncementForm((prev) => ({ ...prev, body: event.target.value }))}
                    rows={5}
                    className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-sm text-white focus:outline-none focus:border-amber-500/35 resize-none"
                  />
                </label>
                <label className="block">
                  <span className="block text-[10px] uppercase tracking-[0.16em] text-white/45 mb-2">Priority</span>
                  <select
                    value={announcementForm.priority}
                    onChange={(event) => setAnnouncementForm((prev) => ({ ...prev, priority: event.target.value }))}
                    className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-sm text-white focus:outline-none focus:border-amber-500/35"
                  >
                    <option className="bg-[#101014]" value="NORMAL">Normal</option>
                    <option className="bg-[#101014]" value="HIGH">High</option>
                    <option className="bg-[#101014]" value="URGENT">Urgent</option>
                  </select>
                </label>
                <Button variant="secondary" size="sm" onClick={createAnnouncement} isLoading={isSaving}>
                  Post announcement
                </Button>
              </FormPanel>
            )}
          </div>
        )}

        {activeTab === "EVENTS" && (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-5 items-start">
            <ContentList loading={isLoadingEvents} empty="No faction events scheduled">
              {events.map((event) => (
                <PanelRow key={event.id} title={event.title} meta={`${new Date(event.startsAt).toLocaleString()}${event.location ? ` - ${event.location}` : ""}`}>
                  {event.description && <p className="text-sm text-white/55 leading-relaxed">{event.description}</p>}
                  {canManage && (
                    <button onClick={() => deleteEvent(event.id)} className="mt-3 text-[11px] text-red-300 hover:text-red-200 cursor-pointer">
                      Archive
                    </button>
                  )}
                </PanelRow>
              ))}
            </ContentList>
            {canManage && (
              <FormPanel title="New event">
                <Field label="Title" value={eventForm.title} onChange={(value) => setEventForm((prev) => ({ ...prev, title: value }))} />
                <Field label="Location" value={eventForm.location} onChange={(value) => setEventForm((prev) => ({ ...prev, location: value }))} />
                <Field label="Starts at" type="datetime-local" value={eventForm.startsAt} onChange={(value) => setEventForm((prev) => ({ ...prev, startsAt: value }))} />
                <Field label="Ends at" type="datetime-local" value={eventForm.endsAt} onChange={(value) => setEventForm((prev) => ({ ...prev, endsAt: value }))} />
                <label className="block">
                  <span className="block text-[10px] uppercase tracking-[0.16em] text-white/45 mb-2">Description</span>
                  <textarea
                    value={eventForm.description}
                    onChange={(event) => setEventForm((prev) => ({ ...prev, description: event.target.value }))}
                    rows={4}
                    className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-sm text-white focus:outline-none focus:border-amber-500/35 resize-none"
                  />
                </label>
                <Button variant="secondary" size="sm" onClick={createEvent} isLoading={isSaving}>
                  Create event
                </Button>
              </FormPanel>
            )}
          </div>
        )}

        {activeTab === "GUILD_MEMBERS" && (
          <div className="space-y-6">
            <FactionMembersTab canManage={canManage} />
            <FactionGuildsTab canManage={canManage} />
          </div>
        )}

        {activeTab === "INVENTORY" && <FactionInventoryTab canManage={canManage} />}

        {activeTab === "ITEM_REQUESTS" && (
          <FactionInventoryRequestsTab canManage={canManage} isGuildLeader={isGuildLeader} guildId={activeGuild.guildId} />
        )}

        {activeTab === "AUDIT_LOG" && <FactionAuditLogTab canView={canManage} />}

        {activeTab === "SETTINGS" && <FactionSettingsTab canManage={canManage} />}

        {activeTab === "JOIN_FACTION" && activeGuild && <JoinFactionTab guildId={activeGuild.guildId} />}
      </div>
    </div>
  );
}

function ContentList({ children, loading, empty }: { children: ReactNode; loading: boolean; empty: string }) {
  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((item) => <Skeleton key={item} className="h-28 rounded-xl" />)}
      </div>
    );
  }
  return <div className="space-y-2">{Children.count(children) > 0 ? children : <EmptyPanel title={empty} body="Faction leaders can add one from the panel." />}</div>;
}

function PanelRow({ title, meta, children }: { title: string; meta: string; children: ReactNode }) {
  return (
    <article className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-4">
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-white truncate">{title}</h3>
          <p className="text-[11px] text-white/35 mt-1">{meta}</p>
        </div>
      </div>
      {children}
    </article>
  );
}

function FormPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <aside className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-4 space-y-4">
      <h3 className="text-sm font-semibold text-white">{title}</h3>
      {children}
    </aside>
  );
}

function Field({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-[0.16em] text-white/45 mb-2">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-sm text-white focus:outline-none focus:border-amber-500/35"
      />
    </label>
  );
}

function EmptyPanel({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-8 text-center">
      <h3 className="text-sm font-semibold text-white/80">{title}</h3>
      <p className="text-xs text-white/45 mt-1">{body}</p>
    </div>
  );
}
