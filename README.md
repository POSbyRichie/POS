# Antigravity Enterprise Offline-First POS

A resilient, local-first Point of Sale (POS) Progressive Web Application built with React, TypeScript, Vite, Dexie (IndexedDB), and Supabase.

## Architecture

```
GitHub
   ↓ (Continuous Deployment & Actions CI)
Netlify
   ↓ (Hosts PWA & Edge Client)
Production POS (Service Worker + Dexie IndexedDB)
   ↓ (Bidirectional Real-Time & Offline Sync)
Supabase (PostgreSQL 15 + RLS + PostgREST)
```

## Features

- **Offline-First Resilience**: Transactions, inventory movements, customer loyalty, and receipts are stored locally in IndexedDB first, guaranteeing 100% checkout uptime with or without internet connectivity.
- **Idempotent Synchronization Subsystem**: Deterministic 8-step pipeline with exponential backoff, dead-letter error handling, and server-side idempotency keys.
- **Multi-Terminal Inventory Reconciliation**: Event-sourced inventory movement delta reconciliation that detects concurrent offline oversells rather than relying on naive last-write-wins stock updates.
- **Full Cash Management**: Comprehensive shift lifecycle with float tracking, itemized non-sale cash movements (`PAY_IN`, `PAY_OUT`, `SAFE_DROP`), and end-of-shift drawer variance reconciliation.
- **Financial-Grade Loyalty Audit Trail**: Immutable transaction ledgers (`LOYALTY TRANSACTION`) for every points change.
- **9-Category Analytics & Reports**: Real-time sales, product performance, cashier audits, payment method distribution, and P&L reporting.
- **Offline Multi-Register Receipt Numbering**: Device-scoped, chronological, collision-proof receipt formatting (`CR-YYYYMMDD-XXXXXX`).

## Tech Stack

- **Frontend**: React 18, TypeScript, Tailwind CSS, Lucide React
- **Storage**: Dexie.js (IndexedDB wrapper) with ACID transactions
- **Backend / Cloud Database**: Supabase (PostgreSQL 15, RLS security policies, stored procedures)
- **Deployment**: Netlify (Edge CDN, Single-Page App rewrites, security headers, Workbox PWA caching)
- **Testing**: Vitest (18 suites, 104 unit & integration tests)

## Getting Started

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Run test suite (104 tests)
npm test

# Build for production
npm run build
```
