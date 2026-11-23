CREATE TABLE IF NOT EXISTS organizations (
  id serial PRIMARY KEY,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  contact_email text,
  contact_mobile text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id serial PRIMARY KEY,
  organization_id integer NOT NULL UNIQUE REFERENCES organizations(id),
  plan_id text NOT NULL,
  status text NOT NULL,
  billing_cycle text NOT NULL DEFAULT 'annual',
  trial_ends_at timestamptz,
  current_period_start timestamptz NOT NULL DEFAULT now(),
  current_period_end timestamptz,
  canceled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS subscription_invoices (
  id serial PRIMARY KEY,
  organization_id integer NOT NULL REFERENCES organizations(id),
  invoice_number text NOT NULL UNIQUE,
  amount_paise integer NOT NULL,
  currency text NOT NULL DEFAULT 'INR',
  status text NOT NULL DEFAULT 'pending',
  description text NOT NULL,
  issued_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz
);

CREATE TABLE IF NOT EXISTS subscription_plan_requests (
  id serial PRIMARY KEY,
  organization_id integer NOT NULL REFERENCES organizations(id),
  requested_by integer NOT NULL,
  requested_plan_id text NOT NULL,
  billing_cycle text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by integer
);

CREATE TABLE IF NOT EXISTS subscription_usage_alerts (
  id serial PRIMARY KEY,
  organization_id integer NOT NULL REFERENCES organizations(id),
  month_key text NOT NULL,
  alert_type text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT subscription_usage_alerts_org_month_type_unique
    UNIQUE (organization_id, month_key, alert_type)
);

INSERT INTO organizations (name, slug, contact_email)
SELECT
  COALESCE(
    (SELECT facility_name FROM system_settings ORDER BY id LIMIT 1),
    'Concept Trunk Interiors'
  ),
  'default',
  (SELECT contact_email FROM system_settings ORDER BY id LIMIT 1)
ON CONFLICT (slug) DO NOTHING;

ALTER TABLE users ADD COLUMN IF NOT EXISTS organization_id integer;
ALTER TABLE visitors ADD COLUMN IF NOT EXISTS organization_id integer;
ALTER TABLE blacklist ADD COLUMN IF NOT EXISTS organization_id integer;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS organization_id integer;
ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS organization_id integer;
ALTER TABLE visitor_audit_log ADD COLUMN IF NOT EXISTS organization_id integer;
ALTER TABLE visitor_gadgets ADD COLUMN IF NOT EXISTS organization_id integer;

UPDATE users
SET organization_id = (SELECT id FROM organizations WHERE slug = 'default')
WHERE organization_id IS NULL;

UPDATE visitors
SET organization_id = (SELECT id FROM organizations WHERE slug = 'default')
WHERE organization_id IS NULL;

UPDATE blacklist
SET organization_id = (SELECT id FROM organizations WHERE slug = 'default')
WHERE organization_id IS NULL;

UPDATE notifications n
SET organization_id = COALESCE(
  (SELECT u.organization_id FROM users u WHERE u.id = n.user_id),
  (SELECT id FROM organizations WHERE slug = 'default')
)
WHERE organization_id IS NULL;

UPDATE system_settings
SET organization_id = (SELECT id FROM organizations WHERE slug = 'default')
WHERE organization_id IS NULL;

UPDATE visitor_audit_log a
SET organization_id = COALESCE(
  (SELECT v.organization_id FROM visitors v WHERE v.id = a.visitor_id),
  (SELECT id FROM organizations WHERE slug = 'default')
)
WHERE organization_id IS NULL;

UPDATE visitor_gadgets g
SET organization_id = COALESCE(
  (SELECT v.organization_id FROM visitors v WHERE v.id = g.visitor_id),
  (SELECT id FROM organizations WHERE slug = 'default')
)
WHERE organization_id IS NULL;

CREATE SEQUENCE IF NOT EXISTS system_settings_id_seq;
SELECT setval(
  'system_settings_id_seq',
  GREATEST(COALESCE((SELECT MAX(id) FROM system_settings), 0) + 1, 1),
  false
);
ALTER TABLE system_settings ALTER COLUMN id SET DEFAULT nextval('system_settings_id_seq');
ALTER SEQUENCE system_settings_id_seq OWNED BY system_settings.id;

CREATE UNIQUE INDEX IF NOT EXISTS system_settings_organization_id_unique
  ON system_settings (organization_id);
CREATE INDEX IF NOT EXISTS visitors_org_created_idx
  ON visitors (organization_id, created_at);
CREATE INDEX IF NOT EXISTS subscription_invoices_org_issued_idx
  ON subscription_invoices (organization_id, issued_at);

ALTER TABLE visitors ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE blacklist ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE notifications ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE system_settings ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE visitor_audit_log ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE visitor_gadgets ALTER COLUMN organization_id SET NOT NULL;

DO $migration$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_organization_id_organizations_id_fk') THEN
    ALTER TABLE users ADD CONSTRAINT users_organization_id_organizations_id_fk
      FOREIGN KEY (organization_id) REFERENCES organizations(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'visitors_organization_id_organizations_id_fk') THEN
    ALTER TABLE visitors ADD CONSTRAINT visitors_organization_id_organizations_id_fk
      FOREIGN KEY (organization_id) REFERENCES organizations(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'blacklist_organization_id_organizations_id_fk') THEN
    ALTER TABLE blacklist ADD CONSTRAINT blacklist_organization_id_organizations_id_fk
      FOREIGN KEY (organization_id) REFERENCES organizations(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notifications_organization_id_organizations_id_fk') THEN
    ALTER TABLE notifications ADD CONSTRAINT notifications_organization_id_organizations_id_fk
      FOREIGN KEY (organization_id) REFERENCES organizations(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'system_settings_organization_id_organizations_id_fk') THEN
    ALTER TABLE system_settings ADD CONSTRAINT system_settings_organization_id_organizations_id_fk
      FOREIGN KEY (organization_id) REFERENCES organizations(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'visitor_audit_log_organization_id_organizations_id_fk') THEN
    ALTER TABLE visitor_audit_log ADD CONSTRAINT visitor_audit_log_organization_id_organizations_id_fk
      FOREIGN KEY (organization_id) REFERENCES organizations(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'visitor_gadgets_organization_id_organizations_id_fk') THEN
    ALTER TABLE visitor_gadgets ADD CONSTRAINT visitor_gadgets_organization_id_organizations_id_fk
      FOREIGN KEY (organization_id) REFERENCES organizations(id);
  END IF;
END
$migration$;

INSERT INTO system_settings (organization_id)
SELECT id FROM organizations WHERE slug = 'default'
ON CONFLICT (organization_id) DO NOTHING;

INSERT INTO subscriptions (
  organization_id,
  plan_id,
  status,
  billing_cycle,
  current_period_start,
  current_period_end
)
SELECT id, 'business', 'active', 'annual', now(), now() + interval '1 year'
FROM organizations
WHERE slug = 'default'
ON CONFLICT (organization_id) DO NOTHING;