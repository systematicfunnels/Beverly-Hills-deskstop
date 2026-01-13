import { ipcMain, shell } from 'electron';
import { dbService } from './db/database';
import { societyService, Society } from './services/SocietyService';
import { unitService, Unit } from './services/UnitService';
import { invoiceService } from './services/InvoiceService';
import { paymentService, Payment } from './services/PaymentService';

export function registerIpcHandlers() {
  // Societies
  ipcMain.handle('get-societies', () => {
    return societyService.getAll();
  });

  ipcMain.handle('get-society', (_, id: number) => {
    return societyService.getById(id);
  });

  ipcMain.handle('create-society', (_, society: Society) => {
    return societyService.create(society);
  });

  ipcMain.handle('update-society', (_, id: number, society: Partial<Society>) => {
    return societyService.update(id, society);
  });

  ipcMain.handle('delete-society', (_, id: number) => {
    return societyService.delete(id);
  });

  // Units
  ipcMain.handle('get-units', () => {
    try {
      // Debug: Check database structure
      const fkStatus = dbService.get('PRAGMA foreign_keys');
      console.log('Foreign Keys status:', JSON.stringify(fkStatus, null, 2));
      
      const tables = dbService.query("SELECT name FROM sqlite_master WHERE type='table'");
      console.log('Tables in DB:', JSON.stringify(tables, null, 2));

      // Force enable FK if it's OFF for some reason
      if ((fkStatus as any).foreign_keys === 0) {
        console.warn('WARNING: Foreign keys were OFF. Enabling them now.');
        dbService.run('PRAGMA foreign_keys = ON');
      }
      
      const invoicesFk = dbService.query('PRAGMA foreign_key_list(invoices)');
      const paymentsFk = dbService.query('PRAGMA foreign_key_list(payments)');
      console.log('Invoices FK:', JSON.stringify(invoicesFk, null, 2));
      console.log('Payments FK:', JSON.stringify(paymentsFk, null, 2));
      
      // Check for any other tables that might have FKs
      for (const table of tables as any[]) {
        const fks = dbService.query(`PRAGMA foreign_key_list(${table.name})`);
        if ((fks as any[]).length > 0) {
          console.log(`Foreign keys for ${table.name}:`, JSON.stringify(fks, null, 2));
        }
        const sql = dbService.get<{sql: string}>(`SELECT sql FROM sqlite_master WHERE name = ?`, [table.name])?.sql;
        console.log(`SQL for ${table.name}:`, sql);
      }
      
      // Check for triggers
      const triggers = dbService.query("SELECT name, tbl_name FROM sqlite_master WHERE type='trigger'");
      if (triggers.length > 0) {
        console.log('Triggers in DB:', JSON.stringify(triggers, null, 2));
      }
      
      // Check for foreign key violations
      const violations = dbService.query('PRAGMA foreign_key_check');
      if (violations.length > 0) {
        console.log('Foreign key violations found:', JSON.stringify(violations, null, 2));
      }
      
      return unitService.getAll();
    } catch (error) {
      console.error('Error in get-units handler:', error);
      throw error;
    }
  });

  ipcMain.handle('get-units-by-society', (_, societyId: number) => {
    return unitService.getBySociety(societyId);
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

  // Invoices
  ipcMain.handle('get-invoices', () => {
    return invoiceService.getAllInvoices();
  });

  ipcMain.handle('create-batch-invoices', (_, societyId: number, month: number, year: number, date: string, dueDate: string) => {
    return invoiceService.createBatchInvoices(societyId, month, year, date, dueDate);
  });

  ipcMain.handle('delete-invoice', (_, id: number) => {
    return invoiceService.delete(id);
  });

  ipcMain.handle('bulk-delete-invoices', (_, ids: number[]) => {
    return invoiceService.bulkDelete(ids);
  });

  ipcMain.handle('generate-invoice-pdf', (_, invoiceId: number) => {
    return invoiceService.generateInvoicePdf(invoiceId);
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

  // Shell
  ipcMain.handle('show-item-in-folder', (_, path: string) => {
    shell.showItemInFolder(path);
  });
}
