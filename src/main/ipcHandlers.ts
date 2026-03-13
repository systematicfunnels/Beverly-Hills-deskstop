import { dialog, ipcMain, shell } from 'electron'
import { dbService } from './db/database'
import {
  projectService,
  Project,
  ProjectSectorPaymentConfig,
  ProjectSetupSummary,
  StandardWorkbookProjectImportPayload,
  StandardWorkbookProjectImportResult
} from './services/ProjectService'
import { unitService, Unit } from './services/UnitService'
import { maintenanceLetterService, MaintenanceLetter } from './services/MaintenanceLetterService'
import { paymentService, Payment } from './services/PaymentService'
import {
  maintenanceRateService,
  MaintenanceRate,
  MaintenanceSlab
} from './services/MaintenanceRateService'
import {
  detailedMaintenanceLetterService,
  LetterCalculation
} from './services/DetailedMaintenanceLetterService'
import { dryRunService } from './services/DryRunService'
import { errorLogger, getSafeErrorMessage, ValidationError } from './utils/errorHandler'
import { workerPool, WorkerTask } from './utils/workerPool'
import { backupService } from './services/BackupService'
import { batchOperationsService } from './services/BatchOperationsService'
import {
  ProjectStatus,
  UnitStatus
} from './types/enums'

const isPositiveInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value > 0

const isNonNegativeNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0

const isPositiveNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0

const isIsoDate = (value: unknown): value is string =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)

const isFinancialYear = (value: unknown): value is string =>
  typeof value === 'string' && /^\d{4}-\d{2}$/.test(value)

const sanitizeText = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

// Enum validation helpers
const isValidProjectStatus = (value: unknown): value is ProjectStatus =>
  typeof value === 'string' && Object.values(ProjectStatus).includes(value as ProjectStatus)

const isValidUnitStatus = (value: unknown): value is UnitStatus =>
  typeof value === 'string' && Object.values(UnitStatus).includes(value as UnitStatus)

export function registerIpcHandlers(): void {
  // Projects
  ipcMain.handle('get-projects', (): Project[] => {
    return projectService.getAll()
  })

  ipcMain.handle('get-project', (_, id: number): Project | undefined => {
    return projectService.getById(id)
  })

  ipcMain.handle(
    'get-project-setup-summary',
    (_, projectId: number, financialYear?: string): ProjectSetupSummary => {
      if (!isPositiveInteger(projectId)) {
        throw new Error('Invalid project selected')
      }
      if (financialYear !== undefined && financialYear !== null && !isFinancialYear(financialYear)) {
        throw new Error('Invalid financial year format (expected YYYY-YY)')
      }
      return projectService.getSetupSummary(projectId, financialYear)
    }
  )

  ipcMain.handle(
    'get-project-setup-summaries',
    (_, financialYear?: string): ProjectSetupSummary[] => {
      if (financialYear !== undefined && financialYear !== null && !isFinancialYear(financialYear)) {
        throw new Error('Invalid financial year format (expected YYYY-YY)')
      }
      return projectService.getSetupSummaries(financialYear)
    }
  )

  ipcMain.handle('create-project', (_, project: Project): number => {
    if (!sanitizeText(project?.name)) {
      throw new Error('Project name is required')
    }
    return projectService.create(project)
  })

  ipcMain.handle(
    'import-standard-workbook-project',
    (_, payload: StandardWorkbookProjectImportPayload): StandardWorkbookProjectImportResult => {
      if (!payload || !sanitizeText(payload.project?.name)) {
        throw new Error('Project name is required for workbook import')
      }
      if (!Array.isArray(payload.rows)) {
        throw new Error('Invalid workbook import rows payload')
      }
      if (payload.sector_configs !== undefined && !Array.isArray(payload.sector_configs)) {
        throw new Error('Invalid workbook sector config payload')
      }
      return projectService.importStandardWorkbookProject(payload)
    }
  )

  ipcMain.handle('update-project', (_, id: number, project: Partial<Project>): boolean => {
    if (project.status !== undefined && !isValidProjectStatus(project.status)) {
      throw new Error(`Invalid project status. Expected: ${Object.values(ProjectStatus).join(', ')}`)
    }
    return projectService.update(id, project)
  })

  ipcMain.handle(
    'get-project-sector-configs',
    (_, projectId: number): ProjectSectorPaymentConfig[] => {
      if (!isPositiveInteger(projectId)) {
        throw new Error('Invalid project selected')
      }
      return projectService.getSectorPaymentConfigs(projectId)
    }
  )

  ipcMain.handle(
    'save-project-sector-configs',
    (_, projectId: number, configs: Partial<ProjectSectorPaymentConfig>[]): boolean => {
      if (!isPositiveInteger(projectId)) {
        throw new Error('Invalid project selected')
      }
      if (!Array.isArray(configs)) {
        throw new Error('Invalid sector payment configs payload')
      }

      const seenSectors = new Set<string>()
      for (const config of configs) {
        const hasAnyValue = [
          config.sector_code,
          config.qr_code_path
        ].some((value) => sanitizeText(value).length > 0)
        if (!hasAnyValue) continue

        const normalizedSector = sanitizeText(config.sector_code).toUpperCase()
        if (!normalizedSector) {
          throw new Error('Sector code is required for each sector payment config row')
        }
        if (seenSectors.has(normalizedSector)) {
          throw new Error(`Duplicate sector code: ${normalizedSector}`)
        }
        seenSectors.add(normalizedSector)
      }

      return projectService.saveSectorPaymentConfigs(projectId, configs)
    }
  )

  ipcMain.handle('get-project-charges-config', (_, projectId: number) => {
    if (!isPositiveInteger(projectId)) {
      throw new Error('Invalid project selected')
    }
    return projectService.getChargesConfig(projectId)
  })

  ipcMain.handle('save-project-charges-config', (_, config) => {
    if (!isPositiveInteger(config?.project_id)) {
      throw new Error('Invalid project selected')
    }
    if (!isNonNegativeNumber(config?.na_tax_rate_per_sqft)) {
      throw new Error('N.A. tax rate must be >= 0')
    }
    if (!isNonNegativeNumber(config?.solar_contribution)) {
      throw new Error('Solar contribution must be >= 0')
    }
    if (!isNonNegativeNumber(config?.cable_charges)) {
      throw new Error('Cable charges must be >= 0')
    }
    if (!isNonNegativeNumber(config?.penalty_percentage) || config?.penalty_percentage > 100) {
      throw new Error('Penalty percentage must be between 0 and 100')
    }
    if (!isNonNegativeNumber(config?.early_payment_discount_percentage) || config?.early_payment_discount_percentage > 100) {
      throw new Error('Early payment discount percentage must be between 0 and 100')
    }
    return projectService.saveChargesConfig(config)
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
    if (!isPositiveInteger(unit?.project_id)) {
      throw new Error('Invalid project selected for unit')
    }
    if (!sanitizeText(unit?.unit_number)) {
      throw new Error('Unit number is required')
    }
    if (!sanitizeText(unit?.owner_name)) {
      throw new Error('Owner name is required')
    }
    if (!isPositiveNumber(unit?.area_sqft)) {
      throw new Error('Area must be greater than 0')
    }
    return unitService.create(unit)
  })

  ipcMain.handle('update-unit', (_, id: number, unit: Partial<Unit>): boolean => {
    if (unit.status !== undefined && !isValidUnitStatus(unit.status)) {
      throw new Error(`Invalid unit status. Expected: ${Object.values(UnitStatus).join(', ')}`)
    }
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

  ipcMain.handle('import-ledger', (_, { projectId, rows }): boolean => {
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
    (_, { projectId, unitIds, financialYear, letterDate, dueDate, addOns }): boolean => {
      if (!isPositiveInteger(projectId)) {
        throw new Error('Invalid project selected')
      }
      if (!isFinancialYear(financialYear)) {
        throw new Error('Invalid financial year format (expected YYYY-YY)')
      }
      if (!isIsoDate(letterDate) || !isIsoDate(dueDate)) {
        throw new Error('Invalid letter/due date format (expected YYYY-MM-DD)')
      }
      if (unitIds !== undefined && !Array.isArray(unitIds)) {
        throw new Error('Invalid units selection')
      }
      if (Array.isArray(unitIds) && unitIds.some((id) => !isPositiveInteger(id))) {
        throw new Error('Invalid unit id in selection')
      }
      if (addOns !== undefined && !Array.isArray(addOns)) {
        throw new Error('Invalid add-ons payload')
      }
      if (
        Array.isArray(addOns) &&
        addOns.some(
          (addon) => !sanitizeText(addon?.addon_name) || !isNonNegativeNumber(addon?.addon_amount)
        )
      ) {
        throw new Error('Each add-on requires a valid name and non-negative amount')
      }

      return maintenanceLetterService.createBatch(
        projectId,
        financialYear,
        letterDate,
        dueDate,
        unitIds,
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

  ipcMain.handle('get-all-addons', () => {
    return maintenanceLetterService.getAllAddOns()
  })

  ipcMain.handle(
    'add-letter-addon',
    (
      _,
      params: {
        unit_id: number
        financial_year: string
        addon_name: string
        addon_amount: number
        remarks?: string
      }
    ): boolean => {
      return maintenanceLetterService.addAddOn(params)
    }
  )

  ipcMain.handle('delete-letter-addon', (_, id: number): boolean => {
    return maintenanceLetterService.deleteAddOn(id)
  })

  // Detailed Maintenance Letters
  ipcMain.handle(
    'generate-detailed-letter',
    async (_, projectId: number, unitId: number, financialYear: string): Promise<LetterCalculation> => {
      if (!isPositiveInteger(projectId)) {
        throw new Error('Invalid project selected')
      }
      if (!isPositiveInteger(unitId)) {
        throw new Error('Invalid unit selected')
      }
      if (!isFinancialYear(financialYear)) {
        throw new Error('Invalid financial year format (expected YYYY-YY)')
      }
      return await detailedMaintenanceLetterService.generateDetailedLetter(projectId, unitId, financialYear)
    }
  )

  ipcMain.handle(
    'generate-detailed-pdf',
    async (_, projectId: number, unitId: number, financialYear: string): Promise<string> => {
      if (!isPositiveInteger(projectId)) {
        throw new Error('Invalid project selected')
      }
      if (!isPositiveInteger(unitId)) {
        throw new Error('Invalid unit selected')
      }
      if (!isFinancialYear(financialYear)) {
        throw new Error('Invalid financial year format (expected YYYY-YY)')
      }
      return await detailedMaintenanceLetterService.generateDetailedPdf(projectId, unitId, financialYear)
    }
  )

  ipcMain.handle('open-pdf', (_, filePath: string): void => {
    shell.openPath(filePath)
  })

  ipcMain.handle(
    'select-local-file',
    async (
      _,
      options?: {
        title?: string
        filters?: { name: string; extensions: string[] }[]
      }
    ): Promise<string | null> => {
      const result = await dialog.showOpenDialog({
        title: sanitizeText(options?.title) || 'Select File',
        properties: ['openFile'],
        filters: Array.isArray(options?.filters) ? options.filters : undefined
      })

      if (result.canceled || result.filePaths.length === 0) {
        return null
      }

      return result.filePaths[0]
    }
  )

  // Payments
  ipcMain.handle('get-payments', (): Payment[] => {
    return paymentService.getAll()
  })

  ipcMain.handle('create-payment', (_, payment: Payment): number => {
    if (!isPositiveInteger(payment?.project_id) || !isPositiveInteger(payment?.unit_id)) {
      throw new Error('Invalid project or unit selected')
    }
    if (payment?.letter_id !== undefined && payment.letter_id !== null && !isPositiveInteger(payment.letter_id)) {
      throw new Error('Invalid maintenance letter selected')
    }
    if (!isIsoDate(payment?.payment_date)) {
      throw new Error('Invalid payment date format (expected YYYY-MM-DD)')
    }
    if (!isPositiveNumber(payment?.payment_amount)) {
      throw new Error('Payment amount must be greater than 0')
    }
    const mode = sanitizeText(payment?.payment_mode)
    if (!['Transfer', 'Cheque', 'Cash', 'UPI'].includes(mode)) {
      throw new Error('Invalid payment mode')
    }
    if (
      payment?.financial_year !== undefined &&
      payment.financial_year !== null &&
      !isFinancialYear(payment.financial_year)
    ) {
      throw new Error('Invalid financial year format (expected YYYY-YY)')
    }
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

  // Dry-run endpoints (preview before commit)
  ipcMain.handle(
    'dry-run-import',
    (_, projectId: number, rows: unknown[]) => {
      try {
        if (!isPositiveInteger(projectId)) {
          throw new ValidationError('Invalid project selected')
        }
        if (!Array.isArray(rows)) {
          throw new ValidationError('Invalid rows payload')
        }
        return dryRunService.previewImport(projectId, rows)
      } catch (error: unknown) {
        errorLogger.log(error as Error, { operation: 'dry-run-import' })
        throw new Error(getSafeErrorMessage(error))
      }
    }
  )

  ipcMain.handle(
    'dry-run-billing',
    (_, projectId: number, financialYear: string, unitIds?: number[]) => {
      try {
        if (!isPositiveInteger(projectId)) {
          throw new ValidationError('Invalid project selected')
        }
        if (!isFinancialYear(financialYear)) {
          throw new ValidationError('Invalid financial year format')
        }
        return dryRunService.previewBilling(projectId, financialYear, unitIds)
      } catch (error: unknown) {
        errorLogger.log(error as Error, { operation: 'dry-run-billing' })
        throw new Error(getSafeErrorMessage(error))
      }
    }
  )

  ipcMain.handle(
    'dry-run-payment',
    (_, unitId: number, projectId: number) => {
      try {
        if (!isPositiveInteger(unitId) || !isPositiveInteger(projectId)) {
          throw new ValidationError('Invalid unit or project')
        }
        return dryRunService.previewPayment(unitId, projectId)
      } catch (error: unknown) {
        errorLogger.log(error as Error, { operation: 'dry-run-payment' })
        throw new Error(getSafeErrorMessage(error))
      }
    }
  )

  // Worker/background task endpoints
  ipcMain.handle(
    'enqueue-worker-task',
    async (_, taskType: string, data: Record<string, unknown>) => {
      try {
        const taskId = `${taskType}_${Date.now()}_${Math.random().toString(36).slice(2)}`
        const task: WorkerTask = {
          id: taskId,
          type: taskType,
          data,
          priority: data.priority as number | undefined
        }
        await workerPool.enqueue(task)
        return { taskId, status: 'queued' }
      } catch (error: unknown) {
        errorLogger.log(error as Error, { operation: 'enqueue-worker-task' })
        throw new Error(getSafeErrorMessage(error))
      }
    }
  )

  ipcMain.handle('worker-task-status', (_, taskId: string) => {
    return workerPool.getStatus(taskId)
  })

  ipcMain.handle('worker-task-cancel', (_, taskId: string) => {
    workerPool.cancel(taskId)
    return { taskId, cancelled: true }
  })

  // Error logging (for renderer to send error logs)
  ipcMain.handle('get-error-logs', (_, limit: number = 100) => {
    return errorLogger.getLogs(limit)
  })

  ipcMain.handle('clear-error-logs', () => {
    errorLogger.clear()
    return { cleared: true }
  })

  // Backup & Restore endpoints
  ipcMain.handle('create-backup', async () => {
    try {
      const result = await backupService.createBackup()
      if (!result.success) {
        throw new Error(result.error)
      }
      return result
    } catch (error: unknown) {
      errorLogger.log(error as Error, { operation: 'create-backup' })
      throw new Error(getSafeErrorMessage(error))
    }
  })

  ipcMain.handle('restore-backup', async (_, backupPath: string) => {
    try {
      if (!backupPath) {
        throw new ValidationError('Backup path required')
      }
      const result = await backupService.restoreBackup(backupPath)
      if (!result.success) {
        throw new Error(result.error)
      }
      return result
    } catch (error: unknown) {
      errorLogger.log(error as Error, { operation: 'restore-backup', backupPath })
      throw new Error(getSafeErrorMessage(error))
    }
  })

  ipcMain.handle('list-backups', () => {
    return backupService.listBackups()
  })

  ipcMain.handle('start-auto-backup', (_, intervalDays: number = 7) => {
    backupService.startAutoBackup(intervalDays)
    return { enabled: true, intervalDays }
  })

  ipcMain.handle('stop-auto-backup', () => {
    backupService.stopAutoBackup()
    return { enabled: false }
  })

  ipcMain.handle('get-backup-config', () => {
    return backupService.getConfig()
  })

  // Batch operations endpoints
  ipcMain.handle('batch-create-payments', (_, payments: Payment[]) => {
    try {
      if (!Array.isArray(payments)) {
        throw new ValidationError('Invalid payments array')
      }
      return batchOperationsService.createBulkPayments(payments)
    } catch (error: unknown) {
      errorLogger.log(error as Error, { operation: 'batch-create-payments' })
      throw new Error(getSafeErrorMessage(error))
    }
  })

  ipcMain.handle('batch-delete-payments', (_, paymentIds: number[]) => {
    try {
      if (!Array.isArray(paymentIds)) {
        throw new ValidationError('Invalid payment IDs array')
      }
      return batchOperationsService.bulkDeletePayments(paymentIds)
    } catch (error: unknown) {
      errorLogger.log(error as Error, { operation: 'batch-delete-payments' })
      throw new Error(getSafeErrorMessage(error))
    }
  })
}
