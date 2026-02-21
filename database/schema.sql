-- FXMARK Global schema (PostgreSQL)
-- Core tables: users, wallets, ledger, orders, positions, pamm, ib, tickets

-- Users
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  salt VARCHAR(255) NOT NULL,
  role VARCHAR(50) DEFAULT 'client',
  kyc_status VARCHAR(50) DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Wallets
CREATE TABLE IF NOT EXISTS wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  currency VARCHAR(10) NOT NULL DEFAULT 'USD',
  balance DECIMAL(20, 4) NOT NULL DEFAULT 0,
  locked DECIMAL(20, 4) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ledger (double-entry)
CREATE TABLE IF NOT EXISTS ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL,
  debit DECIMAL(20, 4) NOT NULL DEFAULT 0,
  credit DECIMAL(20, 4) NOT NULL DEFAULT 0,
  currency VARCHAR(10) NOT NULL,
  reference VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add more tables as needed: orders, positions, pamm_managers, pamm_allocations, ib_hierarchy, tickets, etc.
