-- LifeOS migration 0064 — close the keyed UI projection privilege boundary.

ALTER TABLE lifeos_runtime.ui_projection OWNER TO lifeos_migrator;
REVOKE ALL ON lifeos_runtime.ui_projection FROM PUBLIC;
REVOKE ALL ON lifeos_runtime.ui_projection FROM lifeos_envctl;
GRANT SELECT ON lifeos_runtime.ui_projection TO lifeos_runtime, lifeos_envctl;
GRANT INSERT, UPDATE ON lifeos_runtime.ui_projection TO lifeos_migrator;
