-- KRWMP Portal - Remove sort_order from Issue & Solution Library
-- Apply this if the previous issue/solution library migration was already run.

ALTER TABLE public.issue_categories
  DROP COLUMN IF EXISTS sort_order;

ALTER TABLE public.specific_issues
  DROP COLUMN IF EXISTS sort_order;
