-- =============================================================================
-- ICE CREAM ERP — Schema Migration
-- Target: Self-hosted Supabase VPS (178.238.227.229)
-- Schema name: icecream_erp
-- Date: 2026-06-07
--
-- INSTRUCTIONS (run on the VPS via SSH):
--   ssh root@178.238.227.229
--   docker exec -i supabase-db psql -U postgres < /root/migrations/001_icecream_erp_schema.sql
--
-- ⚠️  SHARED SERVER WARNING — read robocore-docs/SHARED_DB_RULES.md before running.
-- This migration ONLY creates objects in the `icecream_erp` schema. It does NOT
-- touch public, auth, or any other project's schema.
-- =============================================================================

-- ─── STEP 1: Create schema ────────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS icecream_erp;

-- ─── STEP 2: Grant schema access ──────────────────────────────────────────────
GRANT USAGE ON SCHEMA icecream_erp TO anon, authenticated, service_role;

-- ─── STEP 3: Enums ────────────────────────────────────────────────────────────
CREATE TYPE icecream_erp.user_status AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');
CREATE TYPE icecream_erp.item_type AS ENUM ('RAW_MATERIAL', 'PACKAGING_MATERIAL', 'FINISHED_GOOD', 'WORK_IN_PROGRESS', 'CONSUMABLE', 'SPARE_PART');
CREATE TYPE icecream_erp.stock_movement_type AS ENUM (
  'PURCHASE_RECEIVE','PRODUCTION_ISSUE','PRODUCTION_OUTPUT','WIP_TRANSFER',
  'TRANSFER_OUT','TRANSFER_IN','SALES_ISSUE','RETURN_IN','ADJUSTMENT_IN',
  'ADJUSTMENT_OUT','DAMAGE','EXPIRY_WRITE_OFF','WASTAGE','SPILLAGE','MACHINE_LOSS','PACKAGING_LOSS'
);
CREATE TYPE icecream_erp.approval_status AS ENUM ('PENDING','APPROVED','REJECTED','ESCALATED');
CREATE TYPE icecream_erp.approval_level AS ENUM ('LEVEL1_SUPERVISOR','LEVEL2_MANAGER','LEVEL3_FINANCE_MANAGER','LEVEL4_MANAGING_DIRECTOR');
CREATE TYPE icecream_erp.po_status AS ENUM ('DRAFT','AWAITING_APPROVAL','LEVEL1_APPROVED','LEVEL2_APPROVED','APPROVED','SENT_TO_SUPPLIER','PARTIAL_RECEIVED','FULLY_RECEIVED','CANCELLED');
CREATE TYPE icecream_erp.grn_status AS ENUM ('DRAFT','RECEIVED','QUALITY_INSPECTION','QUALITY_PASSED','QUALITY_FAILED','POSTED','REJECTED');
CREATE TYPE icecream_erp.batch_status AS ENUM ('DRAFT','PLANNED','MATERIALS_REQUESTED','MATERIALS_APPROVED','IN_PROGRESS','WIP','QUALITY_CHECK','COMPLETED','CANCELLED');
CREATE TYPE icecream_erp.quality_status AS ENUM ('PENDING','PASSED','FAILED','CONDITIONAL_RELEASE','QUARANTINE');
CREATE TYPE icecream_erp.shift_type AS ENUM ('DAY','NIGHT');
CREATE TYPE icecream_erp.branch_status AS ENUM ('ACTIVE','INACTIVE','CLOSED');
CREATE TYPE icecream_erp.warehouse_type AS ENUM ('MAIN','BRANCH','COLD_ROOM');
CREATE TYPE icecream_erp.transfer_status AS ENUM ('DRAFT','IN_TRANSIT','COMPLETED','CANCELLED');
CREATE TYPE icecream_erp.sales_order_status AS ENUM ('DRAFT','CONFIRMED','CREDIT_CHECK','PICKING','DISPATCHED','DELIVERED','INVOICED','PARTIALLY_PAID','PAID','CANCELLED');
CREATE TYPE icecream_erp.invoice_status AS ENUM ('DRAFT','SENT','PARTIAL_PAID','PAID','OVERDUE','DISPUTED','CANCELLED');
CREATE TYPE icecream_erp.payment_method AS ENUM ('CASH','ECOCASH','CARD','BANK_TRANSFER','CREDIT','PETTY_CASH');
CREATE TYPE icecream_erp.employee_status AS ENUM ('ACTIVE','INACTIVE','ON_LEAVE','TERMINATED');
CREATE TYPE icecream_erp.leave_status AS ENUM ('PENDING','APPROVED','REJECTED','CANCELLED');
CREATE TYPE icecream_erp.maintenance_type AS ENUM ('PREVENTIVE','CORRECTIVE','BREAKDOWN','INSPECTION');
CREATE TYPE icecream_erp.maintenance_status AS ENUM ('SCHEDULED','IN_PROGRESS','COMPLETED','OVERDUE','CANCELLED');
CREATE TYPE icecream_erp.budget_status AS ENUM ('DRAFT','SUBMITTED','APPROVED','ACTIVE','CLOSED');
CREATE TYPE icecream_erp.account_type AS ENUM ('ASSET','LIABILITY','EQUITY','REVENUE','EXPENSE','COST_OF_SALES');
CREATE TYPE icecream_erp.wastage_type AS ENUM ('MATERIAL_WASTAGE','PRODUCT_LOSS','SPILLAGE','MACHINE_LOSS','PACKAGING_LOSS','QUALITY_REJECTION','EXPIRY_LOSS');
CREATE TYPE icecream_erp.transaction_status AS ENUM ('DRAFT','POSTED','APPROVED','LOCKED','VOIDED');
CREATE TYPE icecream_erp.recipe_status AS ENUM ('DRAFT','ACTIVE','INACTIVE');
CREATE TYPE icecream_erp.supplier_status AS ENUM ('ACTIVE','INACTIVE','BLACKLISTED');
CREATE TYPE icecream_erp.customer_status AS ENUM ('ACTIVE','INACTIVE','BLACKLISTED');

-- ─── STEP 4: Core Tables ──────────────────────────────────────────────────────

CREATE TABLE icecream_erp.organizations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  logo_url      TEXT,
  address       TEXT,
  phone         TEXT,
  email         TEXT,
  tax_number    TEXT,
  currency      TEXT NOT NULL DEFAULT 'USD',
  financial_year_start INT NOT NULL DEFAULT 1,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE icecream_erp.roles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES icecream_erp.organizations(id),
  name            TEXT NOT NULL,
  description     TEXT,
  is_system_role  BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id, name)
);

CREATE TABLE icecream_erp.user_accounts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id             TEXT UNIQUE NOT NULL,
  first_name          TEXT NOT NULL,
  last_name           TEXT NOT NULL,
  id_number           TEXT UNIQUE NOT NULL,
  email               TEXT UNIQUE NOT NULL,
  password_hash       TEXT NOT NULL,
  role_id             UUID NOT NULL REFERENCES icecream_erp.roles(id),
  organization_id     UUID NOT NULL REFERENCES icecream_erp.organizations(id),
  is_active           BOOLEAN NOT NULL DEFAULT true,
  failed_login_attempts INT NOT NULL DEFAULT 0,
  locked_until        TIMESTAMPTZ,
  last_login          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at          TIMESTAMPTZ
);

CREATE TABLE icecream_erp.branches (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES icecream_erp.organizations(id),
  code            TEXT NOT NULL,
  name            TEXT NOT NULL,
  address         TEXT,
  phone           TEXT,
  manager_id      UUID REFERENCES icecream_erp.user_accounts(id),
  status          icecream_erp.branch_status NOT NULL DEFAULT 'ACTIVE',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ
);

CREATE TABLE icecream_erp.warehouses (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES icecream_erp.organizations(id),
  branch_id       UUID REFERENCES icecream_erp.branches(id),
  code            TEXT NOT NULL,
  name            TEXT NOT NULL,
  type            icecream_erp.warehouse_type NOT NULL DEFAULT 'MAIN',
  address         TEXT,
  capacity_kg     NUMERIC(12,3),
  temperature_min NUMERIC(5,2),
  temperature_max NUMERIC(5,2),
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE icecream_erp.item_categories (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES icecream_erp.organizations(id),
  name            TEXT NOT NULL,
  description     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE icecream_erp.units_of_measure (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES icecream_erp.organizations(id),
  name            TEXT NOT NULL,
  abbreviation    TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE icecream_erp.items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES icecream_erp.organizations(id),
  code            TEXT NOT NULL,
  name            TEXT NOT NULL,
  description     TEXT,
  type            icecream_erp.item_type NOT NULL,
  category_id     UUID REFERENCES icecream_erp.item_categories(id),
  unit_id         UUID REFERENCES icecream_erp.units_of_measure(id),
  standard_cost   NUMERIC(15,4) NOT NULL DEFAULT 0,
  selling_price   NUMERIC(15,4),
  reorder_level   NUMERIC(12,3),
  reorder_qty     NUMERIC(12,3),
  shelf_life_days INT,
  requires_quality_check BOOLEAN NOT NULL DEFAULT false,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id, code)
);

CREATE TABLE icecream_erp.stock_balances (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES icecream_erp.organizations(id),
  item_id         UUID NOT NULL REFERENCES icecream_erp.items(id),
  warehouse_id    UUID NOT NULL REFERENCES icecream_erp.warehouses(id),
  quantity        NUMERIC(15,4) NOT NULL DEFAULT 0,
  reserved_qty    NUMERIC(15,4) NOT NULL DEFAULT 0,
  avg_cost        NUMERIC(15,4) NOT NULL DEFAULT 0,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(item_id, warehouse_id)
);

CREATE TABLE icecream_erp.stock_movements (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     UUID NOT NULL REFERENCES icecream_erp.organizations(id),
  item_id             UUID NOT NULL REFERENCES icecream_erp.items(id),
  warehouse_id        UUID NOT NULL REFERENCES icecream_erp.warehouses(id),
  movement_type       icecream_erp.stock_movement_type NOT NULL,
  quantity            NUMERIC(15,4) NOT NULL,
  unit_cost           NUMERIC(15,4),
  total_cost          NUMERIC(15,4),
  reference_type      TEXT,
  reference_id        UUID,
  batch_number        TEXT,
  expiry_date         DATE,
  notes               TEXT,
  created_by          UUID REFERENCES icecream_erp.user_accounts(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Suppliers ────────────────────────────────────────────────────────────────
CREATE TABLE icecream_erp.supplier_categories (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES icecream_erp.organizations(id),
  name            TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE icecream_erp.suppliers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES icecream_erp.organizations(id),
  code            TEXT NOT NULL,
  name            TEXT NOT NULL,
  contact_person  TEXT,
  email           TEXT,
  phone           TEXT,
  address         TEXT,
  category_id     UUID REFERENCES icecream_erp.supplier_categories(id),
  credit_limit    NUMERIC(15,2),
  credit_days     INT DEFAULT 30,
  payment_terms   TEXT,
  status          icecream_erp.supplier_status NOT NULL DEFAULT 'ACTIVE',
  rating          NUMERIC(3,1),
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id, code)
);

-- ─── Procurement ──────────────────────────────────────────────────────────────
CREATE TABLE icecream_erp.purchase_requisitions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES icecream_erp.organizations(id),
  pr_number       TEXT NOT NULL,
  requested_by    UUID REFERENCES icecream_erp.user_accounts(id),
  department      TEXT,
  required_date   DATE,
  status          TEXT NOT NULL DEFAULT 'DRAFT',
  priority        TEXT NOT NULL DEFAULT 'NORMAL',
  notes           TEXT,
  approved_by     UUID REFERENCES icecream_erp.user_accounts(id),
  approved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id, pr_number)
);

CREATE TABLE icecream_erp.purchase_requisition_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pr_id           UUID NOT NULL REFERENCES icecream_erp.purchase_requisitions(id) ON DELETE CASCADE,
  item_id         UUID NOT NULL REFERENCES icecream_erp.items(id),
  quantity        NUMERIC(15,4) NOT NULL,
  estimated_cost  NUMERIC(15,4),
  notes           TEXT
);

CREATE TABLE icecream_erp.purchase_orders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES icecream_erp.organizations(id),
  po_number       TEXT NOT NULL,
  supplier_id     UUID NOT NULL REFERENCES icecream_erp.suppliers(id),
  pr_id           UUID REFERENCES icecream_erp.purchase_requisitions(id),
  order_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  expected_date   DATE,
  status          icecream_erp.po_status NOT NULL DEFAULT 'DRAFT',
  subtotal        NUMERIC(15,2) NOT NULL DEFAULT 0,
  tax_amount      NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_amount    NUMERIC(15,2) NOT NULL DEFAULT 0,
  notes           TEXT,
  created_by      UUID REFERENCES icecream_erp.user_accounts(id),
  approved_by     UUID REFERENCES icecream_erp.user_accounts(id),
  approved_at     TIMESTAMPTZ,
  sent_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id, po_number)
);

CREATE TABLE icecream_erp.purchase_order_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id           UUID NOT NULL REFERENCES icecream_erp.purchase_orders(id) ON DELETE CASCADE,
  item_id         UUID NOT NULL REFERENCES icecream_erp.items(id),
  quantity        NUMERIC(15,4) NOT NULL,
  unit_price      NUMERIC(15,4) NOT NULL,
  tax_rate        NUMERIC(5,2) NOT NULL DEFAULT 0,
  line_total      NUMERIC(15,2) NOT NULL,
  received_qty    NUMERIC(15,4) NOT NULL DEFAULT 0
);

CREATE TABLE icecream_erp.goods_received_notes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES icecream_erp.organizations(id),
  grn_number      TEXT NOT NULL,
  po_id           UUID REFERENCES icecream_erp.purchase_orders(id),
  supplier_id     UUID NOT NULL REFERENCES icecream_erp.suppliers(id),
  warehouse_id    UUID NOT NULL REFERENCES icecream_erp.warehouses(id),
  received_date   DATE NOT NULL DEFAULT CURRENT_DATE,
  status          icecream_erp.grn_status NOT NULL DEFAULT 'DRAFT',
  delivery_note   TEXT,
  invoice_ref     TEXT,
  notes           TEXT,
  received_by     UUID REFERENCES icecream_erp.user_accounts(id),
  posted_at       TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id, grn_number)
);

CREATE TABLE icecream_erp.grn_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grn_id          UUID NOT NULL REFERENCES icecream_erp.goods_received_notes(id) ON DELETE CASCADE,
  item_id         UUID NOT NULL REFERENCES icecream_erp.items(id),
  po_item_id      UUID REFERENCES icecream_erp.purchase_order_items(id),
  ordered_qty     NUMERIC(15,4),
  received_qty    NUMERIC(15,4) NOT NULL,
  rejected_qty    NUMERIC(15,4) NOT NULL DEFAULT 0,
  unit_cost       NUMERIC(15,4) NOT NULL,
  batch_number    TEXT,
  expiry_date     DATE,
  quality_status  icecream_erp.quality_status NOT NULL DEFAULT 'PENDING',
  quality_notes   TEXT
);

-- ─── Recipes & Production ─────────────────────────────────────────────────────
CREATE TABLE icecream_erp.recipes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES icecream_erp.organizations(id),
  code            TEXT NOT NULL,
  name            TEXT NOT NULL,
  description     TEXT,
  finished_item_id UUID NOT NULL REFERENCES icecream_erp.items(id),
  batch_size      NUMERIC(12,3) NOT NULL,
  batch_unit_id   UUID REFERENCES icecream_erp.units_of_measure(id),
  expected_yield  NUMERIC(5,2) NOT NULL DEFAULT 100,
  status          icecream_erp.recipe_status NOT NULL DEFAULT 'DRAFT',
  version         INT NOT NULL DEFAULT 1,
  notes           TEXT,
  created_by      UUID REFERENCES icecream_erp.user_accounts(id),
  approved_by     UUID REFERENCES icecream_erp.user_accounts(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id, code, version)
);

CREATE TABLE icecream_erp.recipe_ingredients (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id       UUID NOT NULL REFERENCES icecream_erp.recipes(id) ON DELETE CASCADE,
  item_id         UUID NOT NULL REFERENCES icecream_erp.items(id),
  quantity        NUMERIC(15,4) NOT NULL,
  unit_id         UUID REFERENCES icecream_erp.units_of_measure(id),
  is_optional     BOOLEAN NOT NULL DEFAULT false,
  notes           TEXT,
  sort_order      INT NOT NULL DEFAULT 0
);

CREATE TABLE icecream_erp.production_batches (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     UUID NOT NULL REFERENCES icecream_erp.organizations(id),
  batch_number        TEXT NOT NULL,
  recipe_id           UUID NOT NULL REFERENCES icecream_erp.recipes(id),
  warehouse_id        UUID NOT NULL REFERENCES icecream_erp.warehouses(id),
  shift               icecream_erp.shift_type NOT NULL DEFAULT 'DAY',
  planned_date        DATE NOT NULL,
  start_time          TIMESTAMPTZ,
  end_time            TIMESTAMPTZ,
  planned_qty         NUMERIC(12,3) NOT NULL,
  actual_qty          NUMERIC(12,3),
  rejected_qty        NUMERIC(12,3) NOT NULL DEFAULT 0,
  wastage_qty         NUMERIC(12,3) NOT NULL DEFAULT 0,
  yield_percent       NUMERIC(5,2),
  status              icecream_erp.batch_status NOT NULL DEFAULT 'DRAFT',
  total_material_cost NUMERIC(15,2),
  total_labour_cost   NUMERIC(15,2),
  total_overhead_cost NUMERIC(15,2),
  cost_per_unit       NUMERIC(15,4),
  notes               TEXT,
  started_by          UUID REFERENCES icecream_erp.user_accounts(id),
  closed_by           UUID REFERENCES icecream_erp.user_accounts(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id, batch_number)
);

CREATE TABLE icecream_erp.batch_material_usage (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id        UUID NOT NULL REFERENCES icecream_erp.production_batches(id) ON DELETE CASCADE,
  item_id         UUID NOT NULL REFERENCES icecream_erp.items(id),
  standard_qty    NUMERIC(15,4) NOT NULL,
  actual_qty      NUMERIC(15,4) NOT NULL,
  variance_qty    NUMERIC(15,4),
  unit_cost       NUMERIC(15,4),
  total_cost      NUMERIC(15,2),
  notes           TEXT
);

CREATE TABLE icecream_erp.batch_worker_output (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id        UUID NOT NULL REFERENCES icecream_erp.production_batches(id) ON DELETE CASCADE,
  worker_id       UUID REFERENCES icecream_erp.user_accounts(id),
  worker_name     TEXT NOT NULL,
  cones_produced  INT NOT NULL DEFAULT 0,
  hours_worked    NUMERIC(5,2),
  productivity_score NUMERIC(5,2),
  notes           TEXT
);

CREATE TABLE icecream_erp.wastage_records (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES icecream_erp.organizations(id),
  batch_id        UUID REFERENCES icecream_erp.production_batches(id),
  item_id         UUID NOT NULL REFERENCES icecream_erp.items(id),
  warehouse_id    UUID NOT NULL REFERENCES icecream_erp.warehouses(id),
  wastage_type    icecream_erp.wastage_type NOT NULL,
  quantity        NUMERIC(15,4) NOT NULL,
  unit_cost       NUMERIC(15,4),
  total_cost      NUMERIC(15,2),
  reason          TEXT,
  recorded_by     UUID REFERENCES icecream_erp.user_accounts(id),
  recorded_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Quality Control ──────────────────────────────────────────────────────────
CREATE TABLE icecream_erp.quality_checks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES icecream_erp.organizations(id),
  reference_type  TEXT NOT NULL, -- 'GRN' | 'BATCH' | 'STOCK'
  reference_id    UUID NOT NULL,
  item_id         UUID NOT NULL REFERENCES icecream_erp.items(id),
  check_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  checked_by      UUID REFERENCES icecream_erp.user_accounts(id),
  status          icecream_erp.quality_status NOT NULL DEFAULT 'PENDING',
  temperature     NUMERIC(5,2),
  ph_level        NUMERIC(4,2),
  appearance      TEXT,
  taste_result    TEXT,
  microbial_test  TEXT,
  approved_qty    NUMERIC(15,4),
  rejected_qty    NUMERIC(15,4) NOT NULL DEFAULT 0,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Customers & Sales ────────────────────────────────────────────────────────
CREATE TABLE icecream_erp.customers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES icecream_erp.organizations(id),
  code            TEXT NOT NULL,
  name            TEXT NOT NULL,
  contact_person  TEXT,
  email           TEXT,
  phone           TEXT,
  address         TEXT,
  credit_limit    NUMERIC(15,2) NOT NULL DEFAULT 0,
  credit_days     INT NOT NULL DEFAULT 0,
  outstanding_balance NUMERIC(15,2) NOT NULL DEFAULT 0,
  status          icecream_erp.customer_status NOT NULL DEFAULT 'ACTIVE',
  created_by      UUID REFERENCES icecream_erp.user_accounts(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id, code)
);

CREATE TABLE icecream_erp.sales_orders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES icecream_erp.organizations(id),
  order_number    TEXT NOT NULL,
  customer_id     UUID REFERENCES icecream_erp.customers(id),
  branch_id       UUID REFERENCES icecream_erp.branches(id),
  warehouse_id    UUID NOT NULL REFERENCES icecream_erp.warehouses(id),
  order_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  delivery_date   DATE,
  status          icecream_erp.sales_order_status NOT NULL DEFAULT 'DRAFT',
  subtotal        NUMERIC(15,2) NOT NULL DEFAULT 0,
  discount_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  tax_amount      NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_amount    NUMERIC(15,2) NOT NULL DEFAULT 0,
  payment_method  icecream_erp.payment_method,
  notes           TEXT,
  created_by      UUID REFERENCES icecream_erp.user_accounts(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id, order_number)
);

CREATE TABLE icecream_erp.sales_order_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        UUID NOT NULL REFERENCES icecream_erp.sales_orders(id) ON DELETE CASCADE,
  item_id         UUID NOT NULL REFERENCES icecream_erp.items(id),
  batch_number    TEXT,
  quantity        NUMERIC(15,4) NOT NULL,
  unit_price      NUMERIC(15,4) NOT NULL,
  discount_pct    NUMERIC(5,2) NOT NULL DEFAULT 0,
  tax_rate        NUMERIC(5,2) NOT NULL DEFAULT 0,
  line_total      NUMERIC(15,2) NOT NULL,
  cogs            NUMERIC(15,2)
);

CREATE TABLE icecream_erp.invoices (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES icecream_erp.organizations(id),
  invoice_number  TEXT NOT NULL,
  order_id        UUID REFERENCES icecream_erp.sales_orders(id),
  customer_id     UUID REFERENCES icecream_erp.customers(id),
  invoice_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date        DATE,
  status          icecream_erp.invoice_status NOT NULL DEFAULT 'DRAFT',
  subtotal        NUMERIC(15,2) NOT NULL,
  tax_amount      NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_amount    NUMERIC(15,2) NOT NULL,
  paid_amount     NUMERIC(15,2) NOT NULL DEFAULT 0,
  balance_due     NUMERIC(15,2) NOT NULL,
  notes           TEXT,
  created_by      UUID REFERENCES icecream_erp.user_accounts(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id, invoice_number)
);

-- ─── Branch Operations ────────────────────────────────────────────────────────
CREATE TABLE icecream_erp.branch_sales (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES icecream_erp.organizations(id),
  branch_id       UUID NOT NULL REFERENCES icecream_erp.branches(id),
  sale_date       DATE NOT NULL DEFAULT CURRENT_DATE,
  shift           icecream_erp.shift_type NOT NULL DEFAULT 'DAY',
  item_id         UUID NOT NULL REFERENCES icecream_erp.items(id),
  quantity        NUMERIC(15,4) NOT NULL,
  unit_price      NUMERIC(15,4) NOT NULL,
  total_amount    NUMERIC(15,2) NOT NULL,
  payment_method  icecream_erp.payment_method NOT NULL DEFAULT 'CASH',
  served_by       UUID REFERENCES icecream_erp.user_accounts(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE icecream_erp.branch_shift_closes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES icecream_erp.organizations(id),
  branch_id       UUID NOT NULL REFERENCES icecream_erp.branches(id),
  shift_date      DATE NOT NULL,
  shift           icecream_erp.shift_type NOT NULL,
  opening_balance NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_sales     NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_expenses  NUMERIC(15,2) NOT NULL DEFAULT 0,
  closing_balance NUMERIC(15,2) NOT NULL DEFAULT 0,
  cash_counted    NUMERIC(15,2),
  variance        NUMERIC(15,2),
  status          TEXT NOT NULL DEFAULT 'OPEN',
  notes           TEXT,
  closed_by       UUID REFERENCES icecream_erp.user_accounts(id),
  approved_by     UUID REFERENCES icecream_erp.user_accounts(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(branch_id, shift_date, shift)
);

CREATE TABLE icecream_erp.stock_transfers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES icecream_erp.organizations(id),
  transfer_number TEXT NOT NULL,
  from_warehouse  UUID NOT NULL REFERENCES icecream_erp.warehouses(id),
  to_warehouse    UUID NOT NULL REFERENCES icecream_erp.warehouses(id),
  transfer_date   DATE NOT NULL DEFAULT CURRENT_DATE,
  status          icecream_erp.transfer_status NOT NULL DEFAULT 'DRAFT',
  notes           TEXT,
  requested_by    UUID REFERENCES icecream_erp.user_accounts(id),
  approved_by     UUID REFERENCES icecream_erp.user_accounts(id),
  approved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id, transfer_number)
);

CREATE TABLE icecream_erp.stock_transfer_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id     UUID NOT NULL REFERENCES icecream_erp.stock_transfers(id) ON DELETE CASCADE,
  item_id         UUID NOT NULL REFERENCES icecream_erp.items(id),
  quantity        NUMERIC(15,4) NOT NULL,
  unit_cost       NUMERIC(15,4),
  batch_number    TEXT
);

-- ─── HR & Payroll ─────────────────────────────────────────────────────────────
CREATE TABLE icecream_erp.employees (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES icecream_erp.organizations(id),
  branch_id       UUID REFERENCES icecream_erp.branches(id),
  employee_number TEXT NOT NULL,
  first_name      TEXT NOT NULL,
  last_name       TEXT NOT NULL,
  email           TEXT,
  phone           TEXT,
  department      TEXT,
  position        TEXT,
  shift           icecream_erp.shift_type,
  hire_date       DATE,
  basic_salary    NUMERIC(15,2),
  status          icecream_erp.employee_status NOT NULL DEFAULT 'ACTIVE',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id, employee_number)
);

CREATE TABLE icecream_erp.attendances (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES icecream_erp.organizations(id),
  employee_id     UUID NOT NULL REFERENCES icecream_erp.employees(id),
  attendance_date DATE NOT NULL,
  shift           icecream_erp.shift_type NOT NULL,
  clock_in        TIMESTAMPTZ,
  clock_out       TIMESTAMPTZ,
  hours_worked    NUMERIC(5,2),
  overtime_hours  NUMERIC(5,2) NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'PRESENT',
  notes           TEXT
);

CREATE TABLE icecream_erp.payroll_records (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES icecream_erp.organizations(id),
  employee_id     UUID NOT NULL REFERENCES icecream_erp.employees(id),
  pay_period_start DATE NOT NULL,
  pay_period_end  DATE NOT NULL,
  basic_salary    NUMERIC(15,2) NOT NULL,
  overtime_pay    NUMERIC(15,2) NOT NULL DEFAULT 0,
  allowances      NUMERIC(15,2) NOT NULL DEFAULT 0,
  deductions      NUMERIC(15,2) NOT NULL DEFAULT 0,
  tax_deduction   NUMERIC(15,2) NOT NULL DEFAULT 0,
  net_pay         NUMERIC(15,2) NOT NULL,
  status          icecream_erp.approval_status NOT NULL DEFAULT 'PENDING',
  approved_by     UUID REFERENCES icecream_erp.user_accounts(id),
  paid_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Finance & Accounting ─────────────────────────────────────────────────────
CREATE TABLE icecream_erp.accounts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES icecream_erp.organizations(id),
  code            TEXT NOT NULL,
  name            TEXT NOT NULL,
  type            icecream_erp.account_type NOT NULL,
  parent_id       UUID REFERENCES icecream_erp.accounts(id),
  is_active       BOOLEAN NOT NULL DEFAULT true,
  balance         NUMERIC(15,2) NOT NULL DEFAULT 0,
  description     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id, code)
);

CREATE TABLE icecream_erp.journal_entries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES icecream_erp.organizations(id),
  entry_number    TEXT NOT NULL,
  entry_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  description     TEXT NOT NULL,
  reference       TEXT,
  status          icecream_erp.transaction_status NOT NULL DEFAULT 'DRAFT',
  total_debit     NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_credit    NUMERIC(15,2) NOT NULL DEFAULT 0,
  created_by      UUID REFERENCES icecream_erp.user_accounts(id),
  approved_by     UUID REFERENCES icecream_erp.user_accounts(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id, entry_number)
);

CREATE TABLE icecream_erp.journal_lines (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id        UUID NOT NULL REFERENCES icecream_erp.journal_entries(id) ON DELETE CASCADE,
  account_id      UUID NOT NULL REFERENCES icecream_erp.accounts(id),
  debit           NUMERIC(15,2) NOT NULL DEFAULT 0,
  credit          NUMERIC(15,2) NOT NULL DEFAULT 0,
  description     TEXT,
  sort_order      INT NOT NULL DEFAULT 0
);

-- ─── Budgets ──────────────────────────────────────────────────────────────────
CREATE TABLE icecream_erp.budgets (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES icecream_erp.organizations(id),
  name            TEXT NOT NULL,
  department      TEXT NOT NULL,
  period_start    DATE NOT NULL,
  period_end      DATE NOT NULL,
  status          icecream_erp.budget_status NOT NULL DEFAULT 'DRAFT',
  total_budget    NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_actual    NUMERIC(15,2) NOT NULL DEFAULT 0,
  variance        NUMERIC(15,2) NOT NULL DEFAULT 0,
  notes           TEXT,
  approved_by     UUID REFERENCES icecream_erp.user_accounts(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE icecream_erp.budget_lines (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_id       UUID NOT NULL REFERENCES icecream_erp.budgets(id) ON DELETE CASCADE,
  account_id      UUID REFERENCES icecream_erp.accounts(id),
  description     TEXT NOT NULL,
  budgeted_amount NUMERIC(15,2) NOT NULL,
  actual_amount   NUMERIC(15,2) NOT NULL DEFAULT 0,
  variance        NUMERIC(15,2) NOT NULL DEFAULT 0,
  month           INT -- 1-12 for monthly breakdowns
);

-- ─── Maintenance ──────────────────────────────────────────────────────────────
CREATE TABLE icecream_erp.machines (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES icecream_erp.organizations(id),
  asset_number    TEXT NOT NULL,
  name            TEXT NOT NULL,
  description     TEXT,
  location        TEXT,
  purchase_date   DATE,
  purchase_cost   NUMERIC(15,2),
  status          TEXT NOT NULL DEFAULT 'OPERATIONAL',
  last_maintenance DATE,
  next_maintenance DATE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id, asset_number)
);

CREATE TABLE icecream_erp.maintenance_records (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES icecream_erp.organizations(id),
  machine_id      UUID NOT NULL REFERENCES icecream_erp.machines(id),
  maintenance_type icecream_erp.maintenance_type NOT NULL DEFAULT 'PREVENTIVE',
  scheduled_date  DATE,
  completed_date  DATE,
  status          icecream_erp.maintenance_status NOT NULL DEFAULT 'SCHEDULED',
  description     TEXT NOT NULL,
  technician      TEXT,
  downtime_hours  NUMERIC(5,2),
  cost            NUMERIC(15,2),
  parts_used      TEXT,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Audit Trail ─────────────────────────────────────────────────────────────
CREATE TABLE icecream_erp.audit_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES icecream_erp.organizations(id),
  user_id         UUID REFERENCES icecream_erp.user_accounts(id),
  action          TEXT NOT NULL,  -- CREATE | UPDATE | DELETE | APPROVE | POST
  table_name      TEXT NOT NULL,
  record_id       UUID,
  old_values      JSONB,
  new_values      JSONB,
  ip_address      TEXT,
  user_agent      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE icecream_erp.notifications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES icecream_erp.organizations(id),
  user_id         UUID REFERENCES icecream_erp.user_accounts(id),
  type            TEXT NOT NULL DEFAULT 'INFO',
  title           TEXT NOT NULL,
  message         TEXT NOT NULL,
  is_read         BOOLEAN NOT NULL DEFAULT false,
  reference_type  TEXT,
  reference_id    UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Indexes ─────────────────────────────────────────────────────────────────
CREATE INDEX idx_ice_items_org ON icecream_erp.items(organization_id);
CREATE INDEX idx_ice_stock_bal ON icecream_erp.stock_balances(item_id, warehouse_id);
CREATE INDEX idx_ice_stock_mov ON icecream_erp.stock_movements(organization_id, created_at);
CREATE INDEX idx_ice_po_org ON icecream_erp.purchase_orders(organization_id, status);
CREATE INDEX idx_ice_grn_org ON icecream_erp.goods_received_notes(organization_id, status);
CREATE INDEX idx_ice_batch_org ON icecream_erp.production_batches(organization_id, status);
CREATE INDEX idx_ice_so_org ON icecream_erp.sales_orders(organization_id, status);
CREATE INDEX idx_ice_branch_sales ON icecream_erp.branch_sales(branch_id, sale_date);
CREATE INDEX idx_ice_audit_org ON icecream_erp.audit_logs(organization_id, created_at);

-- ─── RLS: Enable on all tables ────────────────────────────────────────────────
ALTER TABLE icecream_erp.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE icecream_erp.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE icecream_erp.user_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE icecream_erp.branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE icecream_erp.warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE icecream_erp.item_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE icecream_erp.units_of_measure ENABLE ROW LEVEL SECURITY;
ALTER TABLE icecream_erp.items ENABLE ROW LEVEL SECURITY;
ALTER TABLE icecream_erp.stock_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE icecream_erp.stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE icecream_erp.supplier_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE icecream_erp.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE icecream_erp.purchase_requisitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE icecream_erp.purchase_requisition_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE icecream_erp.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE icecream_erp.purchase_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE icecream_erp.goods_received_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE icecream_erp.grn_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE icecream_erp.recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE icecream_erp.recipe_ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE icecream_erp.production_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE icecream_erp.batch_material_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE icecream_erp.batch_worker_output ENABLE ROW LEVEL SECURITY;
ALTER TABLE icecream_erp.wastage_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE icecream_erp.quality_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE icecream_erp.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE icecream_erp.sales_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE icecream_erp.sales_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE icecream_erp.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE icecream_erp.branch_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE icecream_erp.branch_shift_closes ENABLE ROW LEVEL SECURITY;
ALTER TABLE icecream_erp.stock_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE icecream_erp.stock_transfer_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE icecream_erp.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE icecream_erp.attendances ENABLE ROW LEVEL SECURITY;
ALTER TABLE icecream_erp.payroll_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE icecream_erp.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE icecream_erp.journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE icecream_erp.journal_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE icecream_erp.budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE icecream_erp.budget_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE icecream_erp.machines ENABLE ROW LEVEL SECURITY;
ALTER TABLE icecream_erp.maintenance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE icecream_erp.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE icecream_erp.notifications ENABLE ROW LEVEL SECURITY;

-- ─── RLS Policies: service_role full access, anon denied ─────────────────────
DO $$
DECLARE
  tbl TEXT;
  tables TEXT[] := ARRAY[
    'organizations','roles','user_accounts','branches','warehouses',
    'item_categories','units_of_measure','items','stock_balances','stock_movements',
    'supplier_categories','suppliers','purchase_requisitions','purchase_requisition_items',
    'purchase_orders','purchase_order_items','goods_received_notes','grn_items',
    'recipes','recipe_ingredients','production_batches','batch_material_usage',
    'batch_worker_output','wastage_records','quality_checks','customers',
    'sales_orders','sales_order_items','invoices','branch_sales','branch_shift_closes',
    'stock_transfers','stock_transfer_items','employees','attendances','payroll_records',
    'accounts','journal_entries','journal_lines','budgets','budget_lines',
    'machines','maintenance_records','audit_logs','notifications'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    EXECUTE format(
      'CREATE POLICY "service_role_full_access" ON icecream_erp.%I FOR ALL TO service_role USING (true) WITH CHECK (true)',
      tbl
    );
    EXECUTE format(
      'CREATE POLICY "deny_anon" ON icecream_erp.%I FOR ALL TO anon USING (false)',
      tbl
    );
  END LOOP;
END $$;

-- ─── Grant table + sequence access ───────────────────────────────────────────
GRANT ALL ON ALL TABLES IN SCHEMA icecream_erp TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA icecream_erp TO service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA icecream_erp TO authenticated;

-- ─── STEP 5: Add icecream_erp to pgrst.db_schemas safely ─────────────────────
-- Following SHARED_DB_RULES.md Rule 2 — additive only, never overwrites
DO $$
DECLARE
  v_current text;
  v_schema  text := 'icecream_erp';
BEGIN
  SELECT split_part(cfg, '=', 2) INTO v_current
  FROM pg_roles, unnest(rolconfig) AS cfg
  WHERE rolname = 'authenticator'
    AND cfg LIKE 'pgrst.db_schemas=%';

  IF v_current IS NULL OR v_current = '' THEN
    v_current := 'public,storage,graphql_public,robocore,robokorda,aura,smartschools,azim_motors';
  END IF;

  IF position(v_schema IN v_current) = 0 THEN
    EXECUTE format(
      'ALTER ROLE authenticator SET "pgrst.db_schemas" TO %L',
      v_current || ',' || v_schema
    );
    RAISE NOTICE 'pgrst.db_schemas updated to: %', v_current || ',' || v_schema;
    NOTIFY pgrst;
  ELSE
    RAISE NOTICE 'Schema % already present — no change needed', v_schema;
  END IF;
END $$;

-- ─── Done ─────────────────────────────────────────────────────────────────────
-- Verify: SELECT nspname FROM pg_namespace WHERE nspname = 'icecream_erp';
