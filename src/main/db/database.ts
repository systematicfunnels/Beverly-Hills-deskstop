import Database from 'better-sqlite3';
import path from 'path';
import { app } from 'electron';
import { schema } from './schema';

class DatabaseService {
  private db: Database.Database;

  constructor() {
    const dbPath = app.isPackaged
      ? path.join(app.getPath('userData'), 'beverly-hills.db')
      : path.join(__dirname, '../../beverly-hills.db');

    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.init();
  }

  private init() {
    this.migrate();
    this.db.exec(schema);
    console.log('Database initialized');
  }

  private migrate() {
    try {
      // 1. Check if we need to migrate 'societies' table to 'projects'
      const societiesExist = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='societies'").get();
      const projectsExist = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='projects'").get();
      
      if (societiesExist && !projectsExist) {
        console.log('Renaming societies table to projects...');
        this.db.exec('ALTER TABLE societies RENAME TO projects');
      }

      // 2. Ensure projects table has new columns
      if (this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='projects'").get()) {
        const columns = this.db.prepare("PRAGMA table_info(projects)").all() as any[];
        if (!columns.some(c => c.name === 'address')) this.db.exec('ALTER TABLE projects ADD COLUMN address TEXT');
        if (!columns.some(c => c.name === 'city')) this.db.exec('ALTER TABLE projects ADD COLUMN city TEXT');
        if (!columns.some(c => c.name === 'state')) this.db.exec('ALTER TABLE projects ADD COLUMN state TEXT');
        if (!columns.some(c => c.name === 'pincode')) this.db.exec('ALTER TABLE projects ADD COLUMN pincode TEXT');
        if (!columns.some(c => c.name === 'status')) this.db.exec("ALTER TABLE projects ADD COLUMN status TEXT DEFAULT 'Active'");
      }

      // 3. Migrate 'units' table
      const unitsExist = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='units'").get();
      if (unitsExist) {
        const columns = this.db.prepare("PRAGMA table_info(units)").all() as any[];
        const hasProjectId = columns.some(c => c.name === 'project_id');
        const hasSocietyId = columns.some(c => c.name === 'society_id');

        if (hasSocietyId && !hasProjectId) {
          console.log('Renaming society_id column to project_id in units table...');
          try {
            this.db.exec('ALTER TABLE units RENAME COLUMN society_id TO project_id');
          } catch (e) {
            this.db.exec(`
              ALTER TABLE units ADD COLUMN project_id INTEGER;
              UPDATE units SET project_id = society_id;
            `);
          }
        }
        
        if (!columns.some(c => c.name === 'unit_type')) this.db.exec("ALTER TABLE units ADD COLUMN unit_type TEXT DEFAULT 'Flat'");
        if (!columns.some(c => c.name === 'status')) this.db.exec("ALTER TABLE units ADD COLUMN status TEXT DEFAULT 'Active'");
      }

      // 4. Migrate 'invoices' to 'maintenance_letters'
      const invoicesExist = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='invoices'").get();
      const lettersExist = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='maintenance_letters'").get();
      
      if (invoicesExist && !lettersExist) {
        console.log('Migrating invoices to maintenance_letters...');
        this.transaction(() => {
          this.db.exec(`
            CREATE TABLE IF NOT EXISTS maintenance_letters (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              project_id INTEGER NOT NULL,
              unit_id INTEGER NOT NULL,
              financial_year TEXT NOT NULL,
              base_amount REAL NOT NULL,
              discount_amount REAL DEFAULT 0,
              final_amount REAL NOT NULL,
              due_date DATE,
              status TEXT DEFAULT 'Generated',
              pdf_path TEXT,
              generated_date DATETIME DEFAULT CURRENT_TIMESTAMP,
              FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
              FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE CASCADE
            )
          `);
          
          this.db.exec(`
            INSERT OR IGNORE INTO maintenance_letters (id, project_id, unit_id, financial_year, base_amount, discount_amount, final_amount, due_date, status, pdf_path, generated_date)
            SELECT i.id, u.project_id, i.unit_id, (i.billing_year || '-' || SUBSTR((i.billing_year + 1), 3, 2)), i.amount_due, i.discount_amount, i.total_amount, i.due_date, 
                   CASE WHEN i.status = 'Paid' THEN 'Generated' ELSE 'Generated' END, i.pdf_path, i.created_at
            FROM invoices i
            JOIN units u ON i.unit_id = u.id
          `);

          // Migrate add-ons from extra_charges
          this.db.exec(`
            CREATE TABLE IF NOT EXISTS add_ons (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              letter_id INTEGER NOT NULL,
              addon_name TEXT NOT NULL,
              addon_amount REAL NOT NULL,
              remarks TEXT,
              FOREIGN KEY (letter_id) REFERENCES maintenance_letters(id) ON DELETE CASCADE
            )
          `);

          this.db.exec(`
            INSERT OR IGNORE INTO add_ons (letter_id, addon_name, addon_amount, remarks)
            SELECT id, COALESCE(extra_charges_desc, 'Extra Charges'), extra_charges, 'Migrated from invoices'
            FROM invoices
            WHERE extra_charges > 0
          `);

          this.db.exec('DROP TABLE invoices');
        });
      }

      // 5. Migrate 'payments'
      const paymentsExist = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='payments'").get();
      if (paymentsExist) {
        const columns = this.db.prepare("PRAGMA table_info(payments)").all() as any[];
        
        // If it's the old structure, migrate it
        if (columns.some(c => c.name === 'amount_paid')) {
          console.log('Migrating payments table...');
          this.transaction(() => {
            // Drop payments_new if it already exists from a failed attempt
            this.db.exec('DROP TABLE IF EXISTS payments_new');
            
            this.db.exec(`
              CREATE TABLE payments_new (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id INTEGER NOT NULL,
                unit_id INTEGER NOT NULL,
                letter_id INTEGER,
                payment_date DATE NOT NULL,
                payment_amount REAL NOT NULL,
                payment_mode TEXT NOT NULL,
                cheque_number TEXT,
                remarks TEXT,
                payment_status TEXT DEFAULT 'Received',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
                FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE CASCADE,
                FOREIGN KEY (letter_id) REFERENCES maintenance_letters(id) ON DELETE SET NULL
              )
            `);

            this.db.exec(`
              INSERT INTO payments_new (id, project_id, unit_id, letter_id, payment_date, payment_amount, payment_mode, cheque_number, remarks, created_at)
              SELECT p.id, u.project_id, p.unit_id, p.invoice_id, p.payment_date, p.amount_paid, p.payment_mode, p.reference_number, p.remarks, p.created_at
              FROM payments p
              JOIN units u ON p.unit_id = u.id
            `);

            // Migrate receipts - use IF NOT EXISTS
            this.db.exec(`
              CREATE TABLE IF NOT EXISTS receipts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                payment_id INTEGER NOT NULL,
                receipt_number TEXT UNIQUE,
                receipt_date DATE NOT NULL,
                FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE CASCADE
              )
            `);

            // Use INSERT OR IGNORE to avoid duplicate key errors
            this.db.exec(`
              INSERT OR IGNORE INTO receipts (payment_id, receipt_number, receipt_date)
              SELECT id, receipt_number, payment_date
              FROM payments
              WHERE receipt_number IS NOT NULL
            `);

            this.db.exec('DROP TABLE payments');
            this.db.exec('ALTER TABLE payments_new RENAME TO payments');
          });
        }
      }

      // 6. Ensure other new tables exist
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS maintenance_rates (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          project_id INTEGER NOT NULL,
          financial_year TEXT NOT NULL,
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

        CREATE TABLE IF NOT EXISTS excel_import_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          project_id INTEGER,
          file_name TEXT,
          import_date DATETIME DEFAULT CURRENT_TIMESTAMP,
          status TEXT,
          remarks TEXT,
          FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
        );
      `);

    } catch (error) {
      console.error('Error during database migration:', error);
    }
  }

  public getDb(): Database.Database {
    return this.db;
  }

  public query<T>(sql: string, params: any[] = []): T[] {
    return this.db.prepare(sql).all(...params) as T[];
  }

  public get<T>(sql: string, params: any[] = []): T | undefined {
    return this.db.prepare(sql).get(...params) as T | undefined;
  }

  public run(sql: string, params: any[] = []): Database.RunResult {
    return this.db.prepare(sql).run(...params);
  }

  public transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }
}

export const dbService = new DatabaseService();
