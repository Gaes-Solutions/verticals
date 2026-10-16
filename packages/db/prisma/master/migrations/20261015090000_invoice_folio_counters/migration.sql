-- Atomic annual folios, initialized from the greatest historical suffix (not row count).
CREATE TABLE "invoice_folio_counters" (
  "year" INTEGER PRIMARY KEY,
  "value" INTEGER NOT NULL CHECK ("value" > 0)
);
INSERT INTO "invoice_folio_counters" ("year", "value")
SELECT substring(invoice_number from 5 for 4)::integer,
       max(substring(invoice_number from 10)::integer)
FROM invoices WHERE invoice_number ~ '^INV-[0-9]{4}-[0-9]{1,9}$'
GROUP BY substring(invoice_number from 5 for 4)::integer;

ALTER TABLE invoices ADD COLUMN billing_cycle_key TEXT;
CREATE UNIQUE INDEX invoices_billing_cycle_key_key ON invoices (billing_cycle_key);
