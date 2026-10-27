-- Applied with Supabase migration create_logistics_sales_server_storage on 2026-10-27.
-- Recorded source only; do not rerun against existing tables.
BEGIN;
CREATE TABLE public.logistics_sales_records (
 id TEXT PRIMARY KEY, scope TEXT NOT NULL CHECK(scope='logistics'),
 kind TEXT NOT NULL CHECK(kind IN ('inquiry','quote','contract','client','invoice','receipt')),
 parent_id TEXT REFERENCES public.logistics_sales_records(id) ON DELETE RESTRICT,
 version INTEGER NOT NULL CHECK(version>0), data JSONB NOT NULL,
 CHECK(jsonb_typeof(data)='object'),
 CHECK(data->>'status' IN ('active','cancelled'))
);
CREATE INDEX logistics_sales_parent ON public.logistics_sales_records(parent_id);
CREATE INDEX logistics_sales_scope_kind ON public.logistics_sales_records(scope,kind);
CREATE UNIQUE INDEX logistics_sales_client_key ON public.logistics_sales_records((data->>'customerKey')) WHERE kind='client';
CREATE UNIQUE INDEX logistics_sales_contract_source ON public.logistics_sales_records(parent_id) WHERE kind='contract';
CREATE UNIQUE INDEX logistics_sales_invoice_reference ON public.logistics_sales_records(parent_id,(data->>'reference')) WHERE kind='invoice';
CREATE UNIQUE INDEX logistics_sales_receipt_reference ON public.logistics_sales_records((data->>'reference')) WHERE kind='receipt';
CREATE INDEX logistics_sales_invoice_month ON public.logistics_sales_records((data->>'month')) WHERE kind='invoice';
CREATE TABLE public.logistics_sales_commands (
 id TEXT PRIMARY KEY, actor TEXT NOT NULL, request_key TEXT NOT NULL, hash TEXT NOT NULL,
 command JSONB NOT NULL, before JSONB NOT NULL, result JSONB NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(actor,request_key)
);
CREATE INDEX logistics_sales_commands_actor_time ON public.logistics_sales_commands(actor,created_at);
ALTER TABLE public.logistics_sales_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.logistics_sales_commands ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.logistics_sales_records,public.logistics_sales_commands FROM PUBLIC,anon,authenticated;
-- No FORCE RLS, no change to existing objects/service_role or employee roles.
COMMIT;
