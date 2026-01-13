import { ipcMain, shell } from 'electron';
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
    return unitService.getAll();
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

  // Shell
  ipcMain.handle('show-item-in-folder', (_, path: string) => {
    shell.showItemInFolder(path);
  });
}
