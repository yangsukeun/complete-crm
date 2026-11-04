-- REVIEW ONLY. Not applied. Uses existing CRM server Prisma role; no public grants or new credentials.
BEGIN;
CREATE TABLE seoyoung_settlement_drafts (
 scope text NOT NULL CHECK(scope='logistics'),
 customer text NOT NULL CHECK(customer='seoyoung'),
 month text NOT NULL CHECK(month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
 version integer NOT NULL CHECK(version>0),
 status text NOT NULL CHECK(status IN ('draft','reviewed')),
 payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object'),
 updated_by text NOT NULL REFERENCES "User"(id),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(scope,customer,month)
);
CREATE TABLE seoyoung_settlement_events (
 actor text NOT NULL REFERENCES "User"(id),
 request_key uuid NOT NULL,
 hash text NOT NULL,
 scope text NOT NULL CHECK(scope='logistics'),
 customer text NOT NULL CHECK(customer='seoyoung'),
 month text NOT NULL,
 version integer NOT NULL,
 action text NOT NULL CHECK(action IN ('save','review')),
 state_hash text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(actor,request_key),
 UNIQUE(scope,customer,month,version),
 FOREIGN KEY(scope,customer,month) REFERENCES seoyoung_settlement_drafts(scope,customer,month)
);
ALTER TABLE seoyoung_settlement_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE seoyoung_settlement_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON seoyoung_settlement_drafts,seoyoung_settlement_events FROM PUBLIC;
-- No browser role policies. Check existing server role/table-owner operation in isolated DB first.
-- If the server role cannot access these tables, do not broaden grants automatically.
COMMIT;
