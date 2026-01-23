export const schema = `
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  address TEXT,
  city TEXT,
  state TEXT,
  pincode TEXT,
  status TEXT DEFAULT 'Active', -- Active, Inactive
  letterhead_path TEXT,
  bank_name TEXT,
  account_no TEXT,
  ifsc_code TEXT,
  qr_code_path TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS units (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  unit_number TEXT NOT NULL,
  unit_type TEXT DEFAULT 'Flat', -- Flat, Bungalow
  wing TEXT,
  area_sqft REAL NOT NULL,
  owner_name TEXT NOT NULL,
  contact_number TEXT,
  email TEXT,
  status TEXT DEFAULT 'Active', -- Active, Inactive
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS maintenance_rates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  financial_year TEXT NOT NULL, -- e.g. 2024-25
  rate_per_sqft REAL NOT NULL,
  billing_frequency TEXT DEFAULT 'YEARLY',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS maintenance_slabs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rate_id INTEGER NOT NULL,
  due_date DATE NOT NULL,
  discount_percentage REAL DEFAULT 0,
  is_early_payment BOOLEAN DEFAULT 0,
  FOREIGN KEY (rate_id) REFERENCES maintenance_rates(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS maintenance_letters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  unit_id INTEGER NOT NULL,
  financial_year TEXT NOT NULL,
  base_amount REAL NOT NULL,
  discount_amount REAL DEFAULT 0,
  final_amount REAL NOT NULL,
  due_date DATE,
  status TEXT DEFAULT 'Generated', -- Generated, Modified
  pdf_path TEXT,
  generated_date DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS add_ons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  letter_id INTEGER NOT NULL,
  addon_name TEXT NOT NULL,
  addon_amount REAL NOT NULL,
  remarks TEXT,
  FOREIGN KEY (letter_id) REFERENCES maintenance_letters(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  unit_id INTEGER NOT NULL,
  letter_id INTEGER,
  payment_date DATE NOT NULL,
  payment_amount REAL NOT NULL,
  payment_mode TEXT NOT NULL, -- Cash, Cheque, UPI
  cheque_number TEXT,
  remarks TEXT,
  payment_status TEXT DEFAULT 'Received', -- Received, Pending
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE CASCADE,
  FOREIGN KEY (letter_id) REFERENCES maintenance_letters(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS receipts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  payment_id INTEGER NOT NULL,
  receipt_number TEXT UNIQUE,
  receipt_date DATE NOT NULL,
  FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS excel_import_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER,
  file_name TEXT,
  import_date DATETIME DEFAULT CURRENT_TIMESTAMP,
  status TEXT, -- Success, Partial, Failed
  remarks TEXT,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);
`;
