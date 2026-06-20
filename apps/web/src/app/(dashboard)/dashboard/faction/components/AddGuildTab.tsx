"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { factionApi, type FactionGuildSearchResult } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import Button from "@/components/ui/Button";
import Avatar from "@/components/ui/Avatar";
import { Skeleton } from "@/components/ui/Skeleton";

const MIN_QUERY_LENGTH = 2;
const SEARCH_DEBOUNCE_MS = 350;

export default function AddGuildTab() {
  const { addToast } = useToast();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FactionGuildSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [invitingId, setInvitingId] = useState<string | null>(null);
  const [invitedIds, setInvitedIds] = useState<Set<string>>(new Set());

  // Track the latest request so out-of-order responses are ignored
  const requestRef = useRef(0);

  const runSearch = useCallback(
    async (term: string) => {
      const trimmed = term.trim();
      if (trimmed.length < MIN_QUERY_LENGTH) {
        setResults([]);
        setHasSearched(false);
        setIsSearching(false);
        return;
      }

      const requestId = ++requestRef.current;
      setIsSearching(true);
      try {
        const result = await factionApi.searchGuilds(trimmed);
        if (requestId !== requestRef.current) return; // stale response
        if (result.success && result.data?.guilds) {
          setResults(result.data.guilds);
        } else {
          setResults([]);
          if (result.error?.message) addToast("error", result.error.message);
        }
      } catch {
        if (requestId === requestRef.current) setResults([]);
      } finally {
        if (requestId === requestRef.current) {
          setIsSearching(false);
          setHasSearched(true);
        }
      }
    },
    [addToast],
  );

  // Debounced live search
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) {
      requestRef.current++; // cancel any in-flight search
      setResults([]);
      setHasSearched(false);
      setIsSearching(false);
      return;
    }
    const handle = setTimeout(() => runSearch(trimmed), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [query, runSearch]);

  async function handleInvite(guild: FactionGuildSearchResult) {
    if (guild.isOwnGuild) {
      addToast("error", "You cannot invite a guild you already belong to");
      return;
    }
    if (invitedIds.has(guild.id)) return;

    setInvitingId(guild.id);
    try {
      const result = await factionApi.inviteGuild(guild.id);
      if (result.success && result.data) {
        const { notifiedLeaders } = result.data;
        addToast(
          "success",
          notifiedLeaders > 0
            ? `Invitation sent to ${guild.name} (${notifiedLeaders} leader${notifiedLeaders === 1 ? "" : "s"} notified)`
            : `${guild.name} invited — no active leaders to notify yet`,
        );
        setInvitedIds((prev) => new Set(prev).add(guild.id));
      } else {
        addToast("error", result.error?.message || "Failed to invite guild");
      }
    } catch (err: any) {
      addToast("error", err?.message || "An error occurred");
    } finally {
      setInvitingId(null);
    }
  }

  const trimmedLen = query.trim().length;
  const showHint = trimmedLen > 0 && trimmedLen < MIN_QUERY_LENGTH;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5 items-start">
      {/* Search + results */}
      <div className="space-y-4">
        <div className="relative">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
          </span>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a guild by name or slug..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-amber-500/40 transition-colors"
          />
          {isSearching && (
            <span className="absolute right-3.5 top-1/2 -translate-y-1/2 h-4 w-4 rounded-full border-2 border-amber-400/30 border-t-amber-400 animate-spin" />
          )}
        </div>

        {showHint && (
          <p className="text-[11px] text-white/35 px-1">Type at least {MIN_QUERY_LENGTH} characters to search.</p>
        )}

        {isSearching && results.length === 0 ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-[68px] rounded-xl" />)}
          </div>
        ) : hasSearched && results.length === 0 ? (
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-8 text-center">
            <h3 className="text-sm font-semibold text-white/80">No guilds found</h3>
            <p className="text-xs text-white/45 mt-1">Try a different name or slug.</p>
          </div>
        ) : results.length > 0 ? (
          <div className="space-y-2">
            {results.map((guild) => {
              const isInvited = invitedIds.has(guild.id);
              return (
                <div
                  key={guild.id}
                  className="rounded-xl border border-white/[0.06] bg-white/[0.025] px-4 py-3 flex items-center justify-between gap-4 hover:bg-white/[0.04] transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar name={guild.name} src={guild.avatarUrl} size="md" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-white truncate">{guild.name}</p>
                        {guild.isOwnGuild && (
                          <span className="px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider bg-white/[0.06] text-white/45 rounded">
                            Your guild
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-white/40 truncate">
                        @{guild.slug} · {guild.memberCount} member{guild.memberCount === 1 ? "" : "s"}
                        {guild.leaderName ? ` · Led by ${guild.leaderName}` : ""}
                      </p>
                    </div>
                  </div>

                  <Button
                    variant={isInvited ? "ghost" : "primary"}
                    size="sm"
                    disabled={guild.isOwnGuild || isInvited}
                    isLoading={invitingId === guild.id}
                    onClick={() => handleInvite(guild)}
                    className="shrink-0"
                  >
                    {isInvited ? "Invited ✓" : "Invite"}
                  </Button>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-8 text-center">
            <h3 className="text-sm font-semibold text-white/80">Search for a guild to invite</h3>
            <p className="text-xs text-white/45 mt-1">Results appear as you type.</p>
          </div>
        )}
      </div>

      {/* Side info panel */}
      <aside className="rounded-xl border border-amber-500/15 bg-amber-500/[0.04] p-5 space-y-3">
        <div className="flex items-center gap-2">
          <span className="h-7 w-7 rounded-lg bg-amber-500/15 text-amber-400 flex items-center justify-center">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
          </span>
          <h3 className="text-sm font-semibold text-white">Inviting a guild</h3>
        </div>
        <p className="text-[12px] text-white/55 leading-relaxed">
          Only <span className="text-amber-400 font-medium">Faction Leaders</span> can invite guilds into the faction.
          When you send an invitation, the target guild&apos;s leaders are notified instantly.
        </p>
        <ul className="text-[11px] text-white/45 space-y-1.5 list-disc list-inside">
          <li>You can&apos;t invite a guild you already belong to.</li>
          <li>Each guild can only be invited once per 24 hours.</li>
          <li>Guild leaders accept invitations from their notifications.</li>
        </ul>
      </aside>
    </div>
  );
}
