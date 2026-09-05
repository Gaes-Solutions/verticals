-- Procedencia del consentimiento PHR. Solo `patient_portal` desbloquea lectura
-- cross-tenant; `tenant_attested` limita la lectura a los registros propios.
CREATE TYPE "ConsentGrantedVia" AS ENUM ('patient_portal', 'tenant_attested');

-- Los consentimientos existentes son indistinguibles entre paciente y clínica,
-- por lo que se backfillan al valor seguro (deny cross-tenant); el paciente
-- re-autoriza vía portal para recuperar acceso cross-tenant.
ALTER TABLE "patient_consents"
  ADD COLUMN "granted_via" "ConsentGrantedVia" NOT NULL DEFAULT 'tenant_attested';

-- Los inserts nuevos fijan el valor explícitamente; el default vuelve al de schema.
ALTER TABLE "patient_consents"
  ALTER COLUMN "granted_via" SET DEFAULT 'patient_portal';
