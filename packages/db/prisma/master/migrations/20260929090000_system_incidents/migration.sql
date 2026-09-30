CREATE TYPE "system_incident_status" AS ENUM ('open', 'proposed', 'audited', 'resolved', 'ignored');
CREATE TYPE "system_incident_severity" AS ENUM ('low', 'medium', 'high', 'critical');

CREATE TABLE "system_incidents" (
  "id" TEXT NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "status" "system_incident_status" NOT NULL DEFAULT 'open',
  "severity" "system_incident_severity" NOT NULL DEFAULT 'medium',
  "service" TEXT NOT NULL,
  "environment" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "stack" TEXT,
  "route" TEXT,
  "method" TEXT,
  "request_id" TEXT,
  "tenant_slug" TEXT,
  "context" JSONB,
  "occurrence_count" INTEGER NOT NULL DEFAULT 1,
  "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "next_review_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_notified_at" TIMESTAMP(3),
  "ai_summary" TEXT,
  "ai_proposal" JSONB,
  "ai_model" TEXT,
  "audit_decision" TEXT,
  "audit_notes" TEXT,
  "resolved_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "system_incidents_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "system_incidents_fingerprint_key" ON "system_incidents"("fingerprint");
CREATE INDEX "system_incidents_status_next_review_at_idx" ON "system_incidents"("status", "next_review_at");
CREATE INDEX "system_incidents_severity_last_seen_at_idx" ON "system_incidents"("severity", "last_seen_at");

CREATE TABLE "system_incident_events" (
  "id" TEXT NOT NULL,
  "incident_id" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "payload" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "system_incident_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "system_incident_events_incident_id_created_at_idx" ON "system_incident_events"("incident_id", "created_at");
ALTER TABLE "system_incident_events" ADD CONSTRAINT "system_incident_events_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "system_incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
