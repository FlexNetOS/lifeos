-- LifeOS migration 0059 — close the COW front-door ownership boundary.
-- Security-definer routines and their binding relation share the migrator
-- owner; envctl invokes the routines but receives no direct table mutation.

ALTER TABLE lifeos_runtime.cow_frontdoor_binding OWNER TO lifeos_migrator;
ALTER FUNCTION lifeos_runtime.cow_frontdoor_binding_report()
  OWNER TO lifeos_migrator;

REVOKE ALL ON lifeos_runtime.branch FROM lifeos_envctl;
REVOKE ALL ON lifeos_runtime.branch_pre_s16 FROM lifeos_envctl;
REVOKE ALL ON lifeos_runtime.cow_frontdoor_binding FROM lifeos_envctl;

GRANT EXECUTE ON FUNCTION
  lifeos_runtime.cow_frontdoor_branch_v2(uuid,uuid,uuid,text)
  TO lifeos_envctl, lifeos_runtime;
GRANT EXECUTE ON FUNCTION
  lifeos_runtime.cow_frontdoor_create_v2(
    uuid,text,text,jsonb,uuid,uuid,uuid,text
  ) TO lifeos_envctl, lifeos_runtime;
GRANT EXECUTE ON FUNCTION
  lifeos_runtime.cow_frontdoor_merge_v2(
    uuid,uuid,jsonb,uuid,uuid,text
  ) TO lifeos_envctl, lifeos_runtime;
GRANT EXECUTE ON FUNCTION
  lifeos_runtime.cow_frontdoor_promote_v2(
    uuid,uuid,jsonb,uuid,uuid,text
  ) TO lifeos_envctl, lifeos_runtime;
GRANT EXECUTE ON FUNCTION
  lifeos_runtime.cow_frontdoor_binding_report()
  TO lifeos_envctl, lifeos_runtime;
