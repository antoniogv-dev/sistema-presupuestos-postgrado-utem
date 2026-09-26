-- v13.1 · Corrección institucional del valor hora docente anual.
-- Base 2026 informada: $23.070. Proyección: reajuste anual de 5 %, redondeada al peso.
INSERT OR REPLACE INTO "AnnualParameter" ("id","parameterId","year","scope","amount") VALUES
  ('annual-direct_teaching_hour-2026','param-direct-hour',2026,'GENERAL',23070),
  ('annual-direct_teaching_hour-2027','param-direct-hour',2027,'GENERAL',24224),
  ('annual-direct_teaching_hour-2028','param-direct-hour',2028,'GENERAL',25435),
  ('annual-direct_teaching_hour-2029','param-direct-hour',2029,'GENERAL',26707),
  ('annual-direct_teaching_hour-2030','param-direct-hour',2030,'GENERAL',28042);
