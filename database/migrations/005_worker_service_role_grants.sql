-- Keep the privileged service role limited to the tables used by the gateway.
-- Supabase roles bypassing RLS still need PostgreSQL object privileges.
grant usage on schema public to service_role;

grant select on table
  public.organisations,
  public.user_organisations
to service_role;

grant select, insert on table
  public.evidence_packages,
  public.assets,
  public.saved_views
to service_role;

grant select, insert, update on table
  public.tracked_transactions,
  public.indexed_events,
  public.indexed_evidence,
  public.indexed_determinations,
  public.indexed_effects,
  public.indexed_agreements,
  public.indexed_organisations,
  public.index_failures,
  public.notifications,
  public.decision_exports
to service_role;
