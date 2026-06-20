"use client";

import { useState } from "react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import GuildAvatar from "./GuildAvatar";
import {
  type DirectoryGuild,
  searchGuilds,
  validateGuildQuery,
  looksLikeInviteCode,
  formatCp,
  STATUS_META,
  MY_FACTION,
} from "../factionStubs";

interface FindGuildTabProps {
  onInvite: (guild: DirectoryGuild) => void;
}

export default function FindGuildTab({ onInvite }: FindGuildTabProps) {
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<DirectoryGuild[] | null>(null);
  const [lastQuery, setLastQuery] = useState("");

  const factionFull = MY_FACTION.memberGuildCount >= MY_FACTION.capacity;

  async function handleSearch(e?: React.FormEvent) {
    e?.preventDefault();
    const validation = validateGuildQuery(query);
    if (!validation.valid) {
      setError(validation.error);
      setResults(null);
      return;
    }
    setError(null);
    setIsSearching(true);
    setLastQuery(validation.normalized);
    try {
      const found = await searchGuilds(validation.normalized);
      setResults(found);
    } finally {
      setIsSearching(false);
    }
  }

  function reset() {
    setQuery("");
    setError(null);
    setResults(null);
    setLastQuery("");
  }

  return (
    <div className="space-y-5">
      {/* Search panel */}
      <Card>
        <div className="flex items-start justify-between gap-4 mb-4 flex-wrap">
          <div>
            <h2 className="text-base font-semibold text-white tracking-tight">
              Find a guild to invite
            </h2>
            <p className="text-sm text-white/45 mt-1 leading-relaxed max-w-lg">
              Search by guild name, leader, or paste an exact invite code (e.g.{" "}
              <span className="font-mono text-white/70">IRON-7K2</span>) to invite
              a guild into {MY_FACTION.name}.
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/[0.08] text-[11px] text-white/60 font-medium">
            <span
              className={`h-1.5 w-1.5 rounded-full ${factionFull ? "bg-red-400" : "bg-emerald-400"}`}
            />
            {MY_FACTION.memberGuildCount}/{MY_FACTION.capacity} slots used
          </span>
        </div>

        <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
            <input
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                if (error) setError(null);
              }}
              placeholder="Guild name or invite code…"
              maxLength={40}
              className={`w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/[0.04] border text-sm text-white placeholder:text-white/35 focus:outline-none focus:bg-white/[0.05] transition-colors ${
                error
                  ? "border-red-500/50 focus:border-red-500/60"
                  : "border-white/[0.08] focus:border-white/25"
              }`}
            />
          </div>
          <div className="flex gap-2">
            <Button type="submit" variant="primary" size="md" isLoading={isSearching}>
              Search
            </Button>
            {(results || error) && (
              <Button type="button" variant="ghost" size="md" onClick={reset}>
                Clear
              </Button>
            )}
          </div>
        </form>

        {/* Validation error */}
        {error && (
          <p className="mt-2.5 flex items-center gap-1.5 text-xs text-red-400 animate-slide-down">
            <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            {error}
          </p>
        )}

        {/* Hint when the query is an invite code */}
        {!error && query.trim().length >= 2 && looksLikeInviteCode(query) && (
          <p className="mt-2.5 flex items-center gap-1.5 text-xs text-emerald-300/80">
            <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 6L9 17l-5-5" />
            </svg>
            Looks like an invite code — we&apos;ll match it exactly.
          </p>
        )}
      </Card>

      {/* Results */}
      {isSearching ? (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <Card key={i} padding="sm">
              <div className="flex items-center gap-3">
                <Skeleton className="h-11 w-11 rounded-xl" />
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-56" />
                </div>
                <Skeleton className="h-8 w-24 rounded-lg" />
              </div>
            </Card>
          ))}
        </div>
      ) : results === null ? (
        <EmptyHint />
      ) : results.length === 0 ? (
        <NoResults query={lastQuery} onClear={reset} />
      ) : (
        <div className="space-y-3">
          <p className="text-[11px] uppercase tracking-[0.18em] text-white/40 px-1">
            {results.length} {results.length === 1 ? "guild" : "guilds"} found
          </p>
          {results.map((guild) => (
            <GuildResultCard
              key={guild.id}
              guild={guild}
              factionFull={factionFull}
              onInvite={() => onInvite(guild)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Result card ────────────────────────────────────────────────
function GuildResultCard({
  guild,
  factionFull,
  onInvite,
}: {
  guild: DirectoryGuild;
  factionFull: boolean;
  onInvite: () => void;
}) {
  const meta = STATUS_META[guild.status];
  const canInvite = meta.canInvite && !factionFull;

  return (
    <Card padding="sm" hover className="animate-scale-in">
      <div className="flex items-center gap-4 flex-wrap sm:flex-nowrap">
        <GuildAvatar name={guild.name} avatarUrl={guild.avatarUrl} size="md" />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-white truncate">{guild.name}</p>
            <span
              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${meta.tone}`}
            >
              {meta.label}
            </span>
          </div>
          <div className="flex items-center gap-x-3 gap-y-1 mt-1 flex-wrap text-[11px] text-white/45">
            <span className="inline-flex items-center gap-1">
              <Dot /> {guild.memberCount} members
            </span>
            <span className="inline-flex items-center gap-1">
              <Dot /> {formatCp(guild.totalCp)} CP
            </span>
            <span className="inline-flex items-center gap-1">
              <Dot /> {guild.region}
            </span>
            <span className="inline-flex items-center gap-1">
              <Dot /> Led by {guild.leaderName}
            </span>
            <span className="font-mono text-white/35">{guild.inviteCode}</span>
          </div>
        </div>

        <div className="shrink-0">
          {canInvite ? (
            <Button variant="primary" size="sm" onClick={onInvite}>
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Invite guild
            </Button>
          ) : (
            <Button variant="secondary" size="sm" disabled>
              {factionFull && meta.canInvite ? "Faction full" : "Unavailable"}
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

function Dot() {
  return <span className="h-1 w-1 rounded-full bg-white/25" />;
}

// ─── States ─────────────────────────────────────────────────────
function EmptyHint() {
  return (
    <Card>
      <div className="text-center py-10">
        <div className="mx-auto mb-4 h-12 w-12 rounded-xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center">
          <svg className="h-6 w-6 text-white/35" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
        </div>
        <p className="text-sm text-white/45">Search for a guild to get started</p>
        <p className="text-xs text-white/30 mt-1">
          Results show eligibility before you send an invite.
        </p>
      </div>
    </Card>
  );
}

function NoResults({ query, onClear }: { query: string; onClear: () => void }) {
  return (
    <Card>
      <div className="text-center py-10">
        <div className="mx-auto mb-4 h-12 w-12 rounded-xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center">
          <svg className="h-6 w-6 text-white/35" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="11" cy="11" r="8" />
            <line x1="8" y1="11" x2="14" y2="11" />
          </svg>
        </div>
        <p className="text-sm text-white/45">
          No guilds match &ldquo;<span className="text-white/70">{query}</span>&rdquo;
        </p>
        <p className="text-xs text-white/30 mt-1">
          Double-check the name or invite code and try again.
        </p>
        <button
          onClick={onClear}
          className="mt-3 text-white text-xs hover:text-white/85 transition-colors cursor-pointer"
        >
          Clear search
        </button>
      </div>
    </Card>
  );
}
