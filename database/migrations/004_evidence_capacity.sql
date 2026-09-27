alter table evidence_packages
  add column if not exists package_bytes integer check (package_bytes between 1 and 4096),
  add column if not exists fact_count integer check (fact_count between 1 and 10);

comment on column evidence_packages.package_bytes is 'Canonical committed evidence object byte size; the EvidenceRegistry enforces this admission allocation. NULL denotes a legacy row.';
comment on column evidence_packages.fact_count is 'Number of canonical evidence facts; the EvidenceRegistry enforces this admission allocation. NULL denotes a legacy row.';
