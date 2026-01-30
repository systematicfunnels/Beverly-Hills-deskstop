import { ipcMain, shell } from 'electron'
import { dbService } from './db/database'
import { projectService, Project } from './services/ProjectService'
import { unitService, Unit } from './services/UnitService'
import { maintenanceLetterService, MaintenanceLetter } from './services/MaintenanceLetterService'
import { paymentService, Payment } from './services/PaymentService'
import {
  maintenanceRateService,
  MaintenanceRate,
  MaintenanceSlab
} from './services/MaintenanceRateService'

export function registerIpcHandlers(): void {
  // Projects
  ipcMain.handle('get-projects', (): Project[] => {
    return projectService.getAll()
  })

  ipcMain.handle('get-project', (_, id: number): Project | undefined => {
    return projectService.getById(id)
  })

  ipcMain.handle('create-project', (_, project: Project): number => {
    return projectService.create(project)
  })

  ipcMain.handle('update-project', (_, id: number, project: Partial<Project>): boolean => {
    return projectService.update(id, project)
  })

  ipcMain.handle('delete-project', (_, id: number): boolean => {
    return projectService.delete(id)
  })

  ipcMain.handle('bulk-delete-projects', (_, ids: number[]): boolean => {
    return projectService.bulkDelete(ids)
  })

  ipcMain.handle(
    'get-dashboard-stats',
    (_, projectId?: number, financialYear?: string, unitType?: string, status?: string) => {
      return projectService.getDashboardStats(projectId, financialYear, unitType, status)
    }
  )

  // Units
  ipcMain.handle('get-units', (): Unit[] => {
    return unitService.getAll()
  })

  ipcMain.handle('get-units-by-project', (_, projectId: number): Unit[] => {
    return unitService.getByProject(projectId)
  })

  ipcMain.handle('create-unit', (_, unit: Unit): number => {
    return unitService.create(unit)
  })

  ipcMain.handle('update-unit', (_, id: number, unit: Partial<Unit>): boolean => {
    return unitService.update(id, unit)
  })

  ipcMain.handle('delete-unit', (_, id: number): boolean => {
    return unitService.delete(id)
  })

  ipcMain.handle('bulk-delete-units', (_, ids: number[]): boolean => {
    return unitService.bulkDelete(ids)
  })

  ipcMain.handle('bulk-create-units', (_, units: Unit[]): boolean => {
    return unitService.bulkCreate(units)
  })

  ipcMain.handle('import-ledger', (_, { projectId, rows }): Promise<boolean> => {
    return unitService.importLedger(projectId, rows)
  })

  // Maintenance Letters (formerly Invoices)
  ipcMain.handle('get-letters', (): MaintenanceLetter[] => {
    return maintenanceLetterService.getAll()
  })

  ipcMain.handle('get-letter', (_, id: number): MaintenanceLetter | undefined => {
    return maintenanceLetterService.getById(id)
  })

  ipcMain.handle(
    'create-batch-letters',
    (_, { projectId, financialYear, letterDate, dueDate, addOns }): boolean => {
      return maintenanceLetterService.createBatch(
        projectId,
        financialYear,
        letterDate,
        dueDate,
        addOns
      )
    }
  )

  ipcMain.handle('delete-letter', (_, id: number): boolean => {
    return maintenanceLetterService.delete(id)
  })

  ipcMain.handle('bulk-delete-letters', (_, ids: number[]): boolean => {
    return maintenanceLetterService.bulkDelete(ids)
  })

  ipcMain.handle('generate-letter-pdf', async (_, id: number): Promise<string> => {
    return await maintenanceLetterService.generatePdf(id)
  })

  ipcMain.handle('get-letter-addons', (_, id: number) => {
    return maintenanceLetterService.getAddOns(id)
  })

  ipcMain.handle('open-pdf', (_, filePath: string): void => {
    shell.openPath(filePath)
  })

  // Payments
  ipcMain.handle('get-payments', (): Payment[] => {
    return paymentService.getAll()
  })

  ipcMain.handle('create-payment', (_, payment: Payment): number => {
    return paymentService.create(payment)
  })

  ipcMain.handle('delete-payment', (_, id: number): boolean => {
    return paymentService.delete(id)
  })

  ipcMain.handle('bulk-delete-payments', (_, ids: number[]): boolean => {
    return paymentService.bulkDelete(ids)
  })

  ipcMain.handle('generate-receipt-pdf', async (_, id: number): Promise<string> => {
    return await paymentService.generateReceiptPdf(id)
  })

  // Maintenance Rates & Slabs
  ipcMain.handle('get-rates', (): MaintenanceRate[] => {
    return maintenanceRateService.getAll()
  })

  ipcMain.handle('get-rates-by-project', (_, projectId: number): MaintenanceRate[] => {
    return maintenanceRateService.getByProject(projectId)
  })

  ipcMain.handle('create-rate', (_, rate: MaintenanceRate): number => {
    return maintenanceRateService.create(rate)
  })

  ipcMain.handle('update-rate', (_, id: number, rate: Partial<MaintenanceRate>): boolean => {
    return maintenanceRateService.update(id, rate)
  })

  ipcMain.handle('delete-rate', (_, id: number): boolean => {
    return maintenanceRateService.delete(id)
  })

  ipcMain.handle('get-slabs', (_, rateId: number): MaintenanceSlab[] => {
    return maintenanceRateService.getSlabs(rateId)
  })

  ipcMain.handle('add-slab', (_, slab: MaintenanceSlab): number => {
    return maintenanceRateService.addSlab(slab)
  })

  ipcMain.handle('delete-slab', (_, id: number): boolean => {
    return maintenanceRateService.deleteSlab(id)
  })

  // Settings
  ipcMain.handle('get-settings', (): unknown[] => {
    return dbService.query('SELECT * FROM settings')
  })

  ipcMain.handle('update-setting', (_, key: string, value: string): unknown => {
    return dbService.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, value])
  })

  ipcMain.handle('delete-setting', (_, key: string): unknown => {
    return dbService.run('DELETE FROM settings WHERE key = ?', [key])
  })

  // Shell
  ipcMain.handle('show-item-in-folder', (_, path: string): void => {
    shell.showItemInFolder(path)
  })

  // Database Repair
  ipcMain.handle('database-repair', () => {
    const logs: string[] = []
    try {
      logs.push('Starting database check...')

      // 1. Check foreign key status
      const fkStatus = dbService.get('PRAGMA foreign_keys')
      logs.push(`Foreign Keys status: ${JSON.stringify(fkStatus)}`)

      // 2. Check for violations
      const violations = dbService.query('PRAGMA foreign_key_check')
      if (violations.length > 0) {
        logs.push(`Found ${violations.length} foreign key violations!`)
      } else {
        logs.push('No foreign key violations found.')
      }

      // 3. Log all table schemas for debugging
      const tables = dbService.query("SELECT name, sql FROM sqlite_master WHERE type='table'")
      logs.push('Table structures:')
      ;(tables as { name: string; sql: string }[]).forEach((t) => {
        logs.push(`- Table ${t.name}: ${t.sql}`)
        const fks = dbService.query(`PRAGMA foreign_key_list(${t.name})`)
        if ((fks as unknown[]).length > 0) {
          logs.push(`  FKs for ${t.name}: ${JSON.stringify(fks)}`)
        }
      })

      // 4. Try to fix orphaned records in payments (most common issue)
      logs.push('Checking for orphaned payments...')
      const orphanedPayments = dbService.query(
        'SELECT id FROM payments WHERE unit_id NOT IN (SELECT id FROM units)'
      )
      if ((orphanedPayments as unknown[]).length > 0) {
        logs.push(`Cleaning up ${(orphanedPayments as unknown[]).length} orphaned payments...`)
        dbService.run('DELETE FROM payments WHERE unit_id NOT IN (SELECT id FROM units)')
      }

      logs.push('Checking for orphaned maintenance letters...')
      const orphanedLetters = dbService.query(
        'SELECT id FROM maintenance_letters WHERE unit_id NOT IN (SELECT id FROM units)'
      )
      if ((orphanedLetters as unknown[]).length > 0) {
        logs.push(
          `Cleaning up ${(orphanedLetters as unknown[]).length} orphaned maintenance letters...`
        )
        dbService.run('DELETE FROM maintenance_letters WHERE unit_id NOT IN (SELECT id FROM units)')
      }

      // 5. Run deep cleanup methods (exposed from database.ts)
      logs.push('Running deep cleanup tasks...')
      dbService.cleanupOldTables()
      dbService.fixBrokenForeignKeys()
      dbService.cleanupOrphanData()
      logs.push('Deep cleanup tasks completed.')

      logs.push('Database check completed successfully.')
      return {
        success: true,
        violations,
        logs
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      logs.push(`FATAL ERROR during repair: ${message}`)
      console.error('Database repair failed:', error)
      return {
        success: false,
        violations: [],
        logs
      }
    }
  })
}
