import Database from 'better-sqlite3'
import path from 'path'
import { app } from 'electron'
import { schema } from './schema'

class DatabaseService {
  private db: Database.Database

  constructor() {
    const dbPath = app.isPackaged
      ? path.join(app.getPath('userData'), 'beverly-hills.db')
      : path.join(__dirname, '../../beverly-hills.db')

    this.db = new Database(dbPath)
    this.db.pragma('journal_mode = WAL')

    // Step 1: Disable foreign keys during initialization and migration
    this.db.pragma('foreign_keys = OFF')

    this.init()

    // Step 2: Clean up any leftover _old tables from previous failed runs/migrations
    this.cleanupOldTables()

    // Step 3: Check for and fix broken foreign key references
    this.fixBrokenForeignKeys()

    // Step 4: Clean up orphans and enforce project_id constraints
    this.cleanupOrphanData()

    // Step 5: Enable foreign keys only after data integrity is verified
    this.db.pragma('foreign_keys = ON')

    // Diagnostic check
    const violations = this.db.pragma('foreign_key_check') as unknown[]
    if (violations && violations.length > 0) {
      console.error(
        '[DATABASE] Foreign key violations detected after initialization:',
        JSON.stringify(violations, null, 2)
      )
    }
  }

  private cleanupOldTables(): void {
    try {
      const tables = this.db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%_old'")
        .all() as { name: string }[]
      for (const table of tables) {
        console.log(`[DATABASE] Dropping leftover table: ${table.name}`)
        this.db.exec(`DROP TABLE IF EXISTS ${table.name}`)
      }
    } catch (e) {
      console.error('[DATABASE] Error cleaning up old tables:', e)
    }
  }

  private fixBrokenForeignKeys(): void {
    try {
      // List of all tables in dependency order (top-down)
      const allTables = [
        'projects',
        'units',
        'maintenance_rates',
        'maintenance_slabs',
        'maintenance_letters',
        'add_ons',
        'payments',
        'receipts',
        'excel_import_log',
        'settings'
      ]

      let needsRebuild = false
      const tablesWithOldReferences: string[] = []

      for (const tableName of allTables) {
        const tableInfo = this.db
          .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?")
          .get(tableName) as { sql: string } | undefined
        if (tableInfo) {
          const sql = tableInfo.sql.toLowerCase()
          console.log(`[DATABASE] Checking table ${tableName} schema: ${sql.substring(0, 100)}...`)
          // Check for any references to "_old" tables or the old "societies" name
          if (
            sql.includes('references societies') ||
            sql.includes('references "societies"') ||
            sql.includes('references `societies`') ||
            sql.includes('_old')
          ) {
            console.warn(`[DATABASE] Table ${tableName} has broken references: ${sql}`)
            needsRebuild = true
            tablesWithOldReferences.push(tableName)
          }
        }
      }

      if (needsRebuild) {
        console.warn(
          `[DATABASE] Detected broken foreign key references in tables: ${tablesWithOldReferences.join(', ')}. Performing a full schema rebuild...`
        )

        // Step 2a: Disable foreign keys BEFORE rebuilding
        this.db.pragma('foreign_keys = OFF')

        this.transaction(() => {
          // 1. Rename all existing tables to _old
          for (const tableName of allTables) {
            const tableExists = this.db
              .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
              .get(tableName)
            if (tableExists) {
              this.db.exec(`DROP TABLE IF EXISTS ${tableName}_old`)
              this.db.exec(`ALTER TABLE ${tableName} RENAME TO ${tableName}_old`)
            }
          }

          // 2. Create fresh tables from schema
          this.db.exec(schema)

          // 3. Copy data back for each table
          for (const tableName of allTables) {
            const oldTableExists = this.db
              .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
              .get(`${tableName}_old`)
            if (oldTableExists) {
              try {
                // Get columns that exist in both old and new tables
                const newColumns = (
                  this.db.prepare(`PRAGMA table_info(${tableName})`).all() as { name: string }[]
                ).map((c) => c.name)
                const oldColumns = (
                  this.db.prepare(`PRAGMA table_info(${tableName}_old)`).all() as { name: string }[]
                ).map((c) => c.name)
                const commonColumns = newColumns.filter((c) => oldColumns.includes(c))

                if (commonColumns.length > 0) {
                  const colList = commonColumns.join(', ')
                  this.db.exec(
                    `INSERT INTO ${tableName} (${colList}) SELECT ${colList} FROM ${tableName}_old`
                  )
                  console.log(`[DATABASE] Restored data for ${tableName}`)
                }
              } catch (e: unknown) {
                const message = e instanceof Error ? e.message : String(e)
                console.error(`[DATABASE] Failed to restore data for ${tableName}:`, message)
              }
            }
          }

          // 4. Drop all _old tables
          for (const tableName of allTables) {
            this.db.exec(`DROP TABLE IF EXISTS ${tableName}_old`)
          }
        })

        // Step 2b: Re-enable foreign keys AFTER rebuilding
        this.db.pragma('foreign_keys = ON')

        console.log('[DATABASE] Full schema rebuild completed successfully.')
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e)
      console.error('[DATABASE] Error during schema rebuild:', message)
    }
  }

  private cleanupOrphanData(): void {
    try {
      this.transaction(() => {
        // 1. Delete maintenance letters without valid units or projects
        this.db.exec(`
          DELETE FROM maintenance_letters 
          WHERE unit_id NOT IN (SELECT id FROM units)
          OR project_id NOT IN (SELECT id FROM projects)
        `)

        // 2. Delete add-ons without valid letters
        this.db.exec(`
          DELETE FROM add_ons 
          WHERE letter_id NOT IN (SELECT id FROM maintenance_letters)
        `)

        // 3. Delete payments without valid units or projects
        this.db.exec(`
          DELETE FROM payments 
          WHERE unit_id NOT IN (SELECT id FROM units)
          OR project_id NOT IN (SELECT id FROM projects)
        `)

        // 4. Clean up unit project_id references (the root cause of many FK issues)
        this.db.exec(`
          DELETE FROM units 
          WHERE project_id NOT IN (SELECT id FROM projects)
        `)
      })
      console.log('[DATABASE] Orphan data cleanup completed')
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e)
      console.error('[DATABASE] Error cleaning orphan data:', message)
    }
  }

  private init(): void {
    this.migrate()
    this.db.exec(schema)

    console.log('Database initialized')
  }

  private migrate(): void {
    try {
      // 1. Check if we need to migrate 'societies' table to 'projects'
      const societiesExist = this.db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='societies'")
        .get()
      const projectsExist = this.db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='projects'")
        .get()

      if (societiesExist && !projectsExist) {
        console.log('Renaming societies table to projects...')
        this.db.exec('ALTER TABLE societies RENAME TO projects')
      }

      // 2. Ensure projects table has new columns
      if (
        this.db
          .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='projects'")
          .get()
      ) {
        const columns = this.db.prepare('PRAGMA table_info(projects)').all() as { name: string }[]
        if (!columns.some((c) => c.name === 'location'))
          this.db.exec('ALTER TABLE projects ADD COLUMN location TEXT')
        if (!columns.some((c) => c.name === 'total_units'))
          this.db.exec('ALTER TABLE projects ADD COLUMN total_units INTEGER')
        if (!columns.some((c) => c.name === 'address'))
          this.db.exec('ALTER TABLE projects ADD COLUMN address TEXT')
        if (!columns.some((c) => c.name === 'city'))
          this.db.exec('ALTER TABLE projects ADD COLUMN city TEXT')
        if (!columns.some((c) => c.name === 'state'))
          this.db.exec('ALTER TABLE projects ADD COLUMN state TEXT')
        if (!columns.some((c) => c.name === 'pincode'))
          this.db.exec('ALTER TABLE projects ADD COLUMN pincode TEXT')
        if (!columns.some((c) => c.name === 'status'))
          this.db.exec("ALTER TABLE projects ADD COLUMN status TEXT DEFAULT 'Active'")
      }

      // 2.1 Ensure maintenance_rates table has new columns
      if (
        this.db
          .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='maintenance_rates'")
          .get()
      ) {
        const columns = this.db.prepare('PRAGMA table_info(maintenance_rates)').all() as {
          name: string
        }[]
        if (!columns.some((c) => c.name === 'unit_type'))
          this.db.exec("ALTER TABLE maintenance_rates ADD COLUMN unit_type TEXT DEFAULT 'Flat'")
      }

      // 2.2 Ensure maintenance_letters table has new columns
      if (
        this.db
          .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='maintenance_letters'")
          .get()
      ) {
        const columns = this.db.prepare('PRAGMA table_info(maintenance_letters)').all() as {
          name: string
        }[]
        if (!columns.some((c) => c.name === 'arrears'))
          this.db.exec('ALTER TABLE maintenance_letters ADD COLUMN arrears REAL DEFAULT 0')
        if (!columns.some((c) => c.name === 'is_paid'))
          this.db.exec('ALTER TABLE maintenance_letters ADD COLUMN is_paid BOOLEAN DEFAULT 0')
        if (!columns.some((c) => c.name === 'is_sent'))
          this.db.exec('ALTER TABLE maintenance_letters ADD COLUMN is_sent BOOLEAN DEFAULT 0')
          
        // Add unique index for granularity enforcement
        this.db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_unit_fy ON maintenance_letters(unit_id, financial_year)')
      }

      // 3. Migrate 'units' table
      const unitsExist = this.db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='units'")
        .get()
      if (unitsExist) {
        const columns = this.db.prepare('PRAGMA table_info(units)').all() as { name: string }[]
        const hasProjectId = columns.some((c) => c.name === 'project_id')
        const hasSocietyId = columns.some((c) => c.name === 'society_id')

        if (hasSocietyId && !hasProjectId) {
          console.log('Renaming society_id column to project_id in units table...')
          try {
            this.db.exec('ALTER TABLE units RENAME COLUMN society_id TO project_id')
          } catch (e) {
            this.db.exec(`
              ALTER TABLE units ADD COLUMN project_id INTEGER;
              UPDATE units SET project_id = society_id;
            `)
          }
        }

        if (!columns.some((c) => c.name === 'unit_type'))
          this.db.exec("ALTER TABLE units ADD COLUMN unit_type TEXT DEFAULT 'Flat'")
        if (!columns.some((c) => c.name === 'status'))
          this.db.exec("ALTER TABLE units ADD COLUMN status TEXT DEFAULT 'Active'")
      }

      // 4. Migrate 'payments' table
      const paymentsExist = this.db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='payments'")
        .get()
      if (paymentsExist) {
        const columns = this.db.prepare('PRAGMA table_info(payments)').all() as { name: string }[]
        if (!columns.some((c) => c.name === 'reference_number'))
          this.db.exec('ALTER TABLE payments ADD COLUMN reference_number TEXT')
        if (!columns.some((c) => c.name === 'financial_year')) {
          this.db.exec('ALTER TABLE payments ADD COLUMN financial_year TEXT')
          // Try to backfill from maintenance_letters if linked
          this.db.exec(`
            UPDATE payments 
            SET financial_year = (SELECT financial_year FROM maintenance_letters WHERE id = payments.letter_id)
            WHERE letter_id IS NOT NULL
          `)
        }
      }

      // 5. Migrate 'invoices' to 'maintenance_letters'
      const invoicesExist = this.db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='invoices'")
        .get()
      const lettersExist = this.db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='maintenance_letters'")
        .get()

      if (invoicesExist && !lettersExist) {
        console.log('Migrating invoices to maintenance_letters...')
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
          `)

          this.db.exec(`
            INSERT OR IGNORE INTO maintenance_letters (id, project_id, unit_id, financial_year, base_amount, discount_amount, final_amount, due_date, status, pdf_path, generated_date)
            SELECT i.id, u.project_id, i.unit_id, (i.billing_year || '-' || SUBSTR((i.billing_year + 1), 3, 2)), i.amount_due, i.discount_amount, i.total_amount, i.due_date, 
                   CASE WHEN i.status = 'Paid' THEN 'Generated' ELSE 'Generated' END, i.pdf_path, i.created_at
            FROM invoices i
            JOIN units u ON i.unit_id = u.id
          `)

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
          `)

          this.db.exec(`
            INSERT OR IGNORE INTO add_ons (letter_id, addon_name, addon_amount, remarks)
            SELECT id, COALESCE(extra_charges_desc, 'Extra Charges'), extra_charges, 'Migrated from invoices'
            FROM invoices
            WHERE extra_charges > 0
          `)

          this.db.exec('DROP TABLE invoices')
        })
      }

      // 5. Migrate 'payments'
      const paymentsExistCheck = this.db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='payments'")
        .get()
      if (paymentsExistCheck) {
        const columns = this.db.prepare('PRAGMA table_info(payments)').all() as { name: string }[]

        // If it's the old structure, migrate it
        if (columns.some((c) => c.name === 'amount_paid')) {
          console.log('Migrating payments table...')
          this.transaction(() => {
            // Drop payments_new if it already exists from a failed attempt
            this.db.exec('DROP TABLE IF EXISTS payments_new')

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
            `)

            this.db.exec(`
              INSERT INTO payments_new (id, project_id, unit_id, letter_id, payment_date, payment_amount, payment_mode, cheque_number, remarks, created_at)
              SELECT p.id, u.project_id, p.unit_id, p.invoice_id, p.payment_date, p.amount_paid, p.payment_mode, p.reference_number, p.remarks, p.created_at
              FROM payments p
              JOIN units u ON p.unit_id = u.id
            `)

            // Migrate receipts - use IF NOT EXISTS
            this.db.exec(`
              CREATE TABLE IF NOT EXISTS receipts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                payment_id INTEGER NOT NULL,
                receipt_number TEXT UNIQUE,
                receipt_date DATE NOT NULL,
                FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE CASCADE
              )
            `)

            // Use INSERT OR IGNORE to avoid duplicate key errors
            this.db.exec(`
              INSERT OR IGNORE INTO receipts (payment_id, receipt_number, receipt_date)
              SELECT id, receipt_number, payment_date
              FROM payments
              WHERE receipt_number IS NOT NULL
            `)

            this.db.exec('DROP TABLE payments')
            this.db.exec('ALTER TABLE payments_new RENAME TO payments')
          })
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
      `)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      console.error('[DATABASE] Migration failed:', message)
    }
  }

  public getDb(): Database.Database {
    return this.db
  }

  public query<T>(sql: string, params: unknown[] = []): T[] {
    return this.db.prepare(sql).all(...params) as T[]
  }

  public get<T>(sql: string, params: unknown[] = []): T | undefined {
    return this.db.prepare(sql).get(...params) as T | undefined
  }

  public run(sql: string, params: unknown[] = []): Database.RunResult {
    return this.db.prepare(sql).run(...params)
  }

  public transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)()
  }
}

export const dbService = new DatabaseService()
