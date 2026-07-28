-- Security-definer lookup/write closure for the migrator-owned front door.
GRANT SELECT, INSERT, UPDATE ON lifeos_runtime.cow_frontdoor_binding
  TO lifeos_migrator;
