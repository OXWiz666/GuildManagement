-- Perf: listFactionRoleAssignments filters by faction_id and sorts by
-- created_at desc; the only existing index was (faction_id, role), which
-- doesn't cover the sort. Additive only.

CREATE INDEX "faction_role_assignments_faction_id_created_at_idx"
  ON "faction_role_assignments"("faction_id", "created_at");
