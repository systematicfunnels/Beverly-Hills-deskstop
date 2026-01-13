import { dbService } from '../db/database';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import fs from 'fs';
import path from 'path';
import { app } from 'electron';

export interface Invoice {
  id?: number;
  unit_id: number;
  billing_month: number;
  billing_year: number;
  invoice_date: string;
  due_date?: string;
  amount_due: number;
  tax_amount: number;
  solar_charges: number;
  penalty_amount: number;
  previous_arrears: number;
  total_amount: number;
  status: string;
  pdf_path?: string;
  unit_number?: string;
  owner_name?: string;
  society_name?: string;
}

class InvoiceService {
  public async generateInvoicePdf(invoiceId: number): Promise<string> {
    const invoice = dbService.get<Invoice>(`
      SELECT i.*, u.unit_number, u.owner_name, s.name as society_name, s.bank_name, s.account_no, s.ifsc_code
      FROM invoices i
      JOIN units u ON i.unit_id = u.id
      JOIN societies s ON u.society_id = s.id
      WHERE i.id = ?
    `, [invoiceId]);

    if (!invoice) throw new Error('Invoice not found');

    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595.28, 841.89]); // A4 size
    const { width, height } = page.getSize();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // Header with "Letterhead" feel
    page.drawRectangle({
      x: 0,
      y: height - 100,
      width: width,
      height: 100,
      color: rgb(0.17, 0.48, 0.37), // Brand color #2D7A5E
    });

    page.drawText(invoice.society_name?.toUpperCase() || 'SOCIETY INVOICE', {
      x: 50,
      y: height - 50,
      size: 24,
      font: boldFont,
      color: rgb(1, 1, 1),
    });

    page.drawText('RESIDENTIAL MAINTENANCE BILL', {
      x: 50,
      y: height - 80,
      size: 12,
      font: font,
      color: rgb(0.9, 0.9, 0.9),
    });

    // Invoice details box
    const detailsY = height - 150;
    page.drawText(`INVOICE NO: INV-${invoice.id}`, { x: 400, y: detailsY, size: 10, font: boldFont });
    page.drawText(`DATE: ${invoice.invoice_date}`, { x: 400, y: detailsY - 15, size: 10, font });
    page.drawText(`DUE DATE: ${invoice.due_date || 'N/A'}`, { x: 400, y: detailsY - 30, size: 10, font, color: rgb(0.8, 0, 0) });

    // Resident Details
    page.drawText('BILL TO:', { x: 50, y: detailsY, size: 10, font: boldFont });
    page.drawText(`${invoice.owner_name}`, { x: 50, y: detailsY - 15, size: 12, font: boldFont });
    page.drawText(`Unit No: ${invoice.unit_number}`, { x: 50, y: detailsY - 30, size: 10, font });
    
    // Billing Period
    const monthName = new Intl.DateTimeFormat('en-US', { month: 'long' }).format(new Date(invoice.billing_year, invoice.billing_month - 1));
    page.drawText(`Billing Period: ${monthName} ${invoice.billing_year}`, { x: 50, y: detailsY - 50, size: 10, font: boldFont });

    // Table Header
    const tableY = height - 240;
    page.drawRectangle({ x: 50, y: tableY, width: 500, height: 25, color: rgb(0.17, 0.48, 0.37) });
    page.drawText('DESCRIPTION', { x: 60, y: tableY + 7, size: 10, font: boldFont, color: rgb(1, 1, 1) });
    page.drawText('AMOUNT (Rs.)', { x: 450, y: tableY + 7, size: 10, font: boldFont, color: rgb(1, 1, 1) });

    // Table Content
    let currentY = tableY - 25;
    const items = [
      { desc: 'Maintenance Charges', amt: invoice.amount_due },
      { desc: 'Tax', amt: invoice.tax_amount },
      { desc: 'Solar Charges', amt: invoice.solar_charges },
      { desc: 'Penalty', amt: invoice.penalty_amount },
      { desc: 'Previous Arrears', amt: invoice.previous_arrears },
    ];

    items.forEach(item => {
      page.drawText(item.desc, { x: 60, y: currentY, size: 10, font });
      page.drawText(item.amt.toFixed(2), { x: 450, y: currentY, size: 10, font });
      currentY -= 20;
    });

    // Total
    page.drawLine({ start: { x: 50, y: currentY + 10 }, end: { x: 550, y: currentY + 10 } });
    page.drawText('Total Amount Due', { x: 60, y: currentY - 5, size: 12, font: boldFont });
    page.drawText(`Rs. ${invoice.total_amount.toFixed(2)}`, { x: 450, y: currentY - 5, size: 12, font: boldFont });

    // Bank Details
    currentY -= 60;
    page.drawText('Bank Details for Payment:', { x: 50, y: currentY, size: 10, font: boldFont });
    page.drawText(`Bank: ${invoice['bank_name'] || 'N/A'}`, { x: 50, y: currentY - 15, size: 10, font });
    page.drawText(`A/C No: ${invoice['account_no'] || 'N/A'}`, { x: 50, y: currentY - 30, size: 10, font });
    page.drawText(`IFSC: ${invoice['ifsc_code'] || 'N/A'}`, { x: 50, y: currentY - 45, size: 10, font });

    const pdfBytes = await pdfDoc.save();
    const pdfDir = path.join(app.getPath('userData'), 'invoices');
    if (!fs.existsSync(pdfDir)) fs.mkdirSync(pdfDir);

    const fileName = `Invoice_${invoice.id}_${invoice.unit_number}.pdf`;
    const filePath = path.join(pdfDir, fileName);
    fs.writeFileSync(filePath, pdfBytes);

    dbService.run('UPDATE invoices SET pdf_path = ? WHERE id = ?', [filePath, invoiceId]);
    return filePath;
  }

  public createBatchInvoices(societyId: number, month: number, year: number, invoiceDate: string, dueDate: string): void {
    const units = dbService.query<any>(`
      SELECT u.*, s.base_rate, s.tax_percentage, s.solar_charges 
      FROM units u
      JOIN societies s ON u.society_id = s.id
      WHERE u.society_id = ?
    `, [societyId]);

    dbService.transaction(() => {
      for (const unit of units) {
        const amountDue = unit.area_sqft * unit.base_rate;
        const taxAmount = (amountDue * unit.tax_percentage) / 100;
        const solarCharges = unit.solar_charges;
        
        // Calculate previous arrears
        const lastInvoice = dbService.get<any>(`
          SELECT total_amount FROM invoices 
          WHERE unit_id = ? AND status = 'Unpaid' 
          ORDER BY billing_year DESC, billing_month DESC LIMIT 1
        `, [unit.id]);
        
        const previousArrears = lastInvoice ? lastInvoice.total_amount : 0;
        const totalAmount = amountDue + taxAmount + solarCharges + previousArrears;

        dbService.run(`
          INSERT INTO invoices (
            unit_id, billing_month, billing_year, invoice_date, due_date, 
            amount_due, tax_amount, solar_charges, previous_arrears, total_amount, status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Unpaid')
        `, [
          unit.id, month, year, invoiceDate, dueDate,
          amountDue, taxAmount, solarCharges, previousArrears, totalAmount
        ]);
      }
    });
  }

  public getAllInvoices(): Invoice[] {
    return dbService.query<Invoice>(`
      SELECT i.*, u.unit_number, u.owner_name, s.name as society_name
      FROM invoices i
      JOIN units u ON i.unit_id = u.id
      JOIN societies s ON u.society_id = s.id
      ORDER BY i.billing_year DESC, i.billing_month DESC, u.unit_number ASC
    `);
  }

  public delete(id: number): boolean {
    try {
      const result = dbService.run('DELETE FROM invoices WHERE id = ?', [id]);
      return result.changes > 0;
    } catch (error) {
      console.error(`Error deleting invoice ${id}:`, error);
      throw error;
    }
  }

  public bulkDelete(ids: number[]): void {
    dbService.transaction(() => {
      for (const id of ids) {
        this.delete(id);
      }
    });
  }
}

export const invoiceService = new InvoiceService();
