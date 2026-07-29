-- The bridge delegates writes to the already accepted v2 security-definer
-- procedures.  Its read/lookup helper must share the migrator owner so the
-- preserved lineage can remain unexposed to direct envctl table writes.
ALTER FUNCTION lifeos_runtime.cow_frontdoor_branch_v2(uuid,uuid,uuid,text)
  OWNER TO lifeos_migrator;
ALTER FUNCTION lifeos_runtime.cow_frontdoor_create_v2(uuid,text,text,jsonb,uuid,uuid,uuid,text)
  OWNER TO lifeos_migrator;
ALTER FUNCTION lifeos_runtime.cow_frontdoor_merge_v2(uuid,uuid,jsonb,uuid,uuid,text)
  OWNER TO lifeos_migrator;
ALTER FUNCTION lifeos_runtime.cow_frontdoor_promote_v2(uuid,uuid,jsonb,uuid,uuid,text)
  OWNER TO lifeos_migrator;
