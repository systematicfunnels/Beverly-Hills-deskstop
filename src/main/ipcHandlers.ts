import { ipcMain, shell } from 'electron';
import { dbService } from './db/database';
import { projectService, Project } from './services/ProjectService';
import { unitService, Unit } from './services/UnitService';
import { maintenanceLetterService } from './services/MaintenanceLetterService';
import { paymentService, Payment } from './services/PaymentService';
import { maintenanceRateService, MaintenanceRate, MaintenanceSlab } from './services/MaintenanceRateService';

export function registerIpcHandlers() {
  // Projects
  ipcMain.handle('get-projects', () => {
    return projectService.getAll();
  });

  ipcMain.handle('get-project', (_, id: number) => {
    return projectService.getById(id);
  });

  ipcMain.handle('create-project', (_, project: Project) => {
    return projectService.create(project);
  });

  ipcMain.handle('update-project', (_, id: number, project: Partial<Project>) => {
    return projectService.update(id, project);
  });

  ipcMain.handle('delete-project', (_, id: number) => {
    return projectService.delete(id);
  });

  ipcMain.handle('bulk-delete-projects', (_, ids: number[]) => {
    return projectService.bulkDelete(ids);
  });

  // Units
  ipcMain.handle('get-units', () => {
    return unitService.getAll();
  });

  ipcMain.handle('get-units-by-project', (_, projectId: number) => {
    return unitService.getByProject(projectId);
  });

  ipcMain.handle('create-unit', (_, unit: Unit) => {
    return unitService.create(unit);
  });

  ipcMain.handle('update-unit', (_, id: number, unit: Partial<Unit>) => {
    return unitService.update(id, unit);
  });

  ipcMain.handle('delete-unit', (_, id: number) => {
    return unitService.delete(id);
  });

  ipcMain.handle('bulk-delete-units', (_, ids: number[]) => {
    return unitService.bulkDelete(ids);
  });

  ipcMain.handle('bulk-create-units', (_, units: Unit[]) => {
    return unitService.bulkCreate(units);
  });

  // Maintenance Letters (formerly Invoices)
  ipcMain.handle('get-letters', () => {
    return maintenanceLetterService.getAll();
  });

  ipcMain.handle('get-letter', (_, id: number) => {
    return maintenanceLetterService.getById(id);
  });

  ipcMain.handle('create-batch-letters', (_, { projectId, financialYear, letterDate, dueDate, addOns }) => {
    return maintenanceLetterService.createBatch(projectId, financialYear, letterDate, dueDate, addOns);
  });

  ipcMain.handle('delete-letter', (_, id: number) => {
    return maintenanceLetterService.delete(id);
  });

  ipcMain.handle('bulk-delete-letters', (_, ids: number[]) => {
    return maintenanceLetterService.bulkDelete(ids);
  });

  ipcMain.handle('generate-letter-pdf', async (_, id: number) => {
    return await maintenanceLetterService.generatePdf(id);
  });

  ipcMain.handle('open-pdf', (_, filePath: string) => {
    shell.openPath(filePath);
  });

  // Payments
  ipcMain.handle('get-payments', () => {
    return paymentService.getAll();
  });

  ipcMain.handle('create-payment', (_, payment: Payment) => {
    return paymentService.create(payment);
  });

  ipcMain.handle('delete-payment', (_, id: number) => {
    return paymentService.delete(id);
  });

  ipcMain.handle('bulk-delete-payments', (_, ids: number[]) => {
    return paymentService.bulkDelete(ids);
  });

  ipcMain.handle('generate-receipt-pdf', async (_, id: number) => {
    return await paymentService.generateReceiptPdf(id);
  });

  // Maintenance Rates & Slabs
  ipcMain.handle('get-rates', () => {
    return maintenanceRateService.getAll();
  });

  ipcMain.handle('get-rates-by-project', (_, projectId: number) => {
    return maintenanceRateService.getByProject(projectId);
  });

  ipcMain.handle('create-rate', (_, rate: MaintenanceRate) => {
    return maintenanceRateService.create(rate);
  });

  ipcMain.handle('update-rate', (_, id: number, rate: Partial<MaintenanceRate>) => {
    return maintenanceRateService.update(id, rate);
  });

  ipcMain.handle('delete-rate', (_, id: number) => {
    return maintenanceRateService.delete(id);
  });

  ipcMain.handle('get-slabs', (_, rateId: number) => {
    return maintenanceRateService.getSlabs(rateId);
  });

  ipcMain.handle('add-slab', (_, slab: MaintenanceSlab) => {
    return maintenanceRateService.addSlab(slab);
  });

  ipcMain.handle('delete-slab', (_, id: number) => {
    return maintenanceRateService.deleteSlab(id);
  });

  // Settings
  ipcMain.handle('get-settings', () => {
    return dbService.query('SELECT * FROM settings');
  });

  ipcMain.handle('update-setting', (_, key: string, value: string) => {
    return dbService.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, value]);
  });

  // Shell
  ipcMain.handle('show-item-in-folder', (_, path: string) => {
    shell.showItemInFolder(path);
  });

  // Database Repair
  ipcMain.handle('database-repair', () => {
    const logs: string[] = [];
    try {
      logs.push('Starting database check...');
      
      // 1. Check foreign key status
      const fkStatus = dbService.get('PRAGMA foreign_keys');
      logs.push(`Foreign Keys status: ${JSON.stringify(fkStatus)}`);
      
      // 2. Check for violations
      const violations = dbService.query('PRAGMA foreign_key_check');
      if (violations.length > 0) {
        logs.push(`Found ${violations.length} foreign key violations!`);
      } else {
        logs.push('No foreign key violations found.');
      }
      
      // 3. Log all table schemas for debugging
      const tables = dbService.query("SELECT name, sql FROM sqlite_master WHERE type='table'");
      logs.push('Table structures:');
      (tables as any[]).forEach(t => {
        logs.push(`- Table ${t.name}: ${t.sql}`);
        const fks = dbService.query(`PRAGMA foreign_key_list(${t.name})`);
        if ((fks as any[]).length > 0) {
          logs.push(`  FKs for ${t.name}: ${JSON.stringify(fks)}`);
        }
      });

      // 4. Try to fix orphaned records in payments (most common issue)
      logs.push('Checking for orphaned payments...');
      const orphanedPayments = dbService.query('SELECT id FROM payments WHERE unit_id NOT IN (SELECT id FROM units)');
      if ((orphanedPayments as any[]).length > 0) {
        logs.push(`Cleaning up ${(orphanedPayments as any[]).length} orphaned payments...`);
        dbService.run('DELETE FROM payments WHERE unit_id NOT IN (SELECT id FROM units)');
      }

      logs.push('Checking for orphaned maintenance letters...');
      const orphanedLetters = dbService.query('SELECT id FROM maintenance_letters WHERE unit_id NOT IN (SELECT id FROM units)');
      if ((orphanedLetters as any[]).length > 0) {
        logs.push(`Cleaning up ${(orphanedLetters as any[]).length} orphaned maintenance letters...`);
        dbService.run('DELETE FROM maintenance_letters WHERE unit_id NOT IN (SELECT id FROM units)');
      }

      logs.push('Database check completed successfully.');
      return {
        success: true,
        violations,
        logs
      };
    } catch (error: any) {
      logs.push(`FATAL ERROR during repair: ${error.message}`);
      console.error('Database repair failed:', error);
      return {
        success: false,
        violations: [],
        logs
      };
    }
  });
}
