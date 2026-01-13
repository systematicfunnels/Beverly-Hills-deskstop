export const schema = `
CREATE TABLE IF NOT EXISTS societies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  letterhead_path TEXT,
  bank_name TEXT,
  account_no TEXT,
  ifsc_code TEXT,
  qr_code_path TEXT,
  base_rate REAL DEFAULT 0,
  tax_percentage REAL DEFAULT 0,
  solar_charges REAL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS units (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  society_id INTEGER NOT NULL,
  unit_number TEXT NOT NULL,
  wing TEXT,
  area_sqft REAL NOT NULL,
  owner_name TEXT NOT NULL,
  contact_number TEXT,
  email TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (society_id) REFERENCES societies(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  unit_id INTEGER NOT NULL,
  billing_month INTEGER NOT NULL,
  billing_year INTEGER NOT NULL,
  invoice_date DATE NOT NULL,
  due_date DATE,
  amount_due REAL NOT NULL,
  tax_amount REAL DEFAULT 0,
  solar_charges REAL DEFAULT 0,
  penalty_amount REAL DEFAULT 0,
  previous_arrears REAL DEFAULT 0,
  total_amount REAL NOT NULL,
  status TEXT DEFAULT 'Unpaid', -- Unpaid, Paid, Partially Paid, Cancelled
  pdf_path TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  unit_id INTEGER NOT NULL,
  invoice_id INTEGER,
  payment_date DATE NOT NULL,
  amount_paid REAL NOT NULL,
  payment_mode TEXT NOT NULL,
  reference_number TEXT,
  receipt_number TEXT UNIQUE,
  remarks TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE CASCADE,
  FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);
`;
