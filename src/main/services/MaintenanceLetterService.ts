import { dbService } from '../db/database';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import fs from 'fs';
import path from 'path';
import { app } from 'electron';

export interface MaintenanceLetter {
  id?: number;
  project_id: number;
  unit_id: number;
  financial_year: string;
  base_amount: number;
  discount_amount: number;
  final_amount: number;
  due_date?: string;
  status: string; // Generated, Modified
  pdf_path?: string;
  generated_date?: string;
  unit_number?: string;
  owner_name?: string;
  project_name?: string;
  bank_name?: string;
  account_no?: string;
  ifsc_code?: string;
}

export interface AddOn {
  id?: number;
  letter_id: number;
  addon_name: string;
  addon_amount: number;
  remarks?: string;
}

class MaintenanceLetterService {
  public async generatePdf(letterId: number): Promise<string> {
    const letter = dbService.get<MaintenanceLetter>(`
      SELECT l.*, u.unit_number, u.owner_name, p.name as project_name, p.bank_name, p.account_no, p.ifsc_code
      FROM maintenance_letters l
      JOIN units u ON l.unit_id = u.id
      JOIN projects p ON l.project_id = p.id
      WHERE l.id = ?
    `, [letterId]);

    if (!letter) throw new Error('Maintenance Letter not found');

    const addOns = dbService.query<AddOn>('SELECT * FROM add_ons WHERE letter_id = ?', [letterId]);

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

    page.drawText(letter.project_name?.toUpperCase() || 'MAINTENANCE LETTER', {
      x: 50,
      y: height - 50,
      size: 24,
      font: boldFont,
      color: rgb(1, 1, 1),
    });

    page.drawText('RESIDENTIAL MAINTENANCE LETTER', {
      x: 50,
      y: height - 80,
      size: 12,
      font: font,
      color: rgb(0.9, 0.9, 0.9),
    });

    // Letter details box
    const detailsY = height - 150;
    page.drawText(`LETTER NO: ML-${letter.id}`, { x: 400, y: detailsY, size: 10, font: boldFont });
    page.drawText(`DATE: ${letter.generated_date?.split(' ')[0] || ''}`, { x: 400, y: detailsY - 15, size: 10, font });
    page.drawText(`DUE DATE: ${letter.due_date || 'N/A'}`, { x: 400, y: detailsY - 30, size: 10, font, color: rgb(0.8, 0, 0) });

    // Unit Details
    page.drawText('TO:', { x: 50, y: detailsY, size: 10, font: boldFont });
    page.drawText(`${letter.owner_name}`, { x: 50, y: detailsY - 15, size: 12, font: boldFont });
    page.drawText(`Unit No: ${letter.unit_number}`, { x: 50, y: detailsY - 30, size: 10, font });
    
    // Billing Period
    page.drawText(`Financial Year: ${letter.financial_year}`, { x: 50, y: detailsY - 50, size: 10, font: boldFont });

    // Table Header
    const tableY = height - 260;
    page.drawRectangle({ x: 50, y: tableY, width: 500, height: 25, color: rgb(0.17, 0.48, 0.37) });
    page.drawText('DESCRIPTION', { x: 60, y: tableY + 7, size: 10, font: boldFont, color: rgb(1, 1, 1) });
    page.drawText('AMOUNT (Rs.)', { x: 450, y: tableY + 7, size: 10, font: boldFont, color: rgb(1, 1, 1) });

    // Table Content
    let currentY = tableY - 25;
    const items = [
      { desc: 'Annual Maintenance Charges', amt: letter.base_amount },
    ];

    addOns.forEach(addon => {
      items.push({ desc: addon.addon_name, amt: addon.addon_amount });
    });

    if (letter.discount_amount > 0) {
      items.push({ desc: 'Early Payment Discount', amt: -letter.discount_amount });
    }

    items.forEach(item => {
      page.drawText(item.desc, { x: 60, y: currentY, size: 10, font });
      page.drawText(item.amt.toFixed(2), { x: 450, y: currentY, size: 10, font });
      currentY -= 20;
    });

    // Total
    page.drawLine({ start: { x: 50, y: currentY + 10 }, end: { x: 550, y: currentY + 10 } });
    page.drawText('Total Amount Payable', { x: 60, y: currentY - 5, size: 12, font: boldFont });
    page.drawText(`Rs. ${letter.final_amount.toFixed(2)}`, { x: 450, y: currentY - 5, size: 12, font: boldFont });

    // Bank Details
    currentY -= 60;
    page.drawText('Bank Details for Payment:', { x: 50, y: currentY, size: 10, font: boldFont });
    page.drawText(`Bank: ${letter.bank_name || 'N/A'}`, { x: 50, y: currentY - 15, size: 10, font });
    page.drawText(`A/C No: ${letter.account_no || 'N/A'}`, { x: 50, y: currentY - 30, size: 10, font });
    page.drawText(`IFSC: ${letter.ifsc_code || 'N/A'}`, { x: 50, y: currentY - 45, size: 10, font });

    const pdfBytes = await pdfDoc.save();
    const pdfDir = path.join(app.getPath('userData'), 'maintenance_letters');
    if (!fs.existsSync(pdfDir)) fs.mkdirSync(pdfDir);

    const fileName = `ML_${letter.id}_${letter.unit_number}.pdf`;
    const filePath = path.join(pdfDir, fileName);
    fs.writeFileSync(filePath, pdfBytes);

    dbService.run('UPDATE maintenance_letters SET pdf_path = ? WHERE id = ?', [filePath, letterId]);
    return filePath;
  }

  public createBatch(
    projectId: number, 
    financialYear: string,
    letterDate: string, 
    dueDate: string, 
    addOns: { name: string, amount: number }[] = []
  ): void {
    const units = dbService.query<any>(`
      SELECT u.*, r.rate_per_sqft, s.discount_percentage, s.due_date as discount_due_date
      FROM units u
      JOIN maintenance_rates r ON u.project_id = r.project_id
      LEFT JOIN maintenance_slabs s ON r.id = s.rate_id AND s.is_early_payment = 1
      WHERE u.project_id = ? AND r.financial_year = ?
    `, [projectId, financialYear]);

    if (units.length === 0) {
      throw new Error(`No maintenance rate found for Project ${projectId} and Financial Year ${financialYear}`);
    }

    dbService.transaction(() => {
      for (const unit of units) {
        const baseAmount = unit.area_sqft * unit.rate_per_sqft;
        const discountAmount = (baseAmount * (unit.discount_percentage || 0)) / 100;
        let totalAddOns = 0;
        addOns.forEach(a => totalAddOns += a.amount);
        
        const finalAmount = baseAmount + totalAddOns - discountAmount;

        const result = dbService.run(`
          INSERT INTO maintenance_letters (
            project_id, unit_id, financial_year, base_amount, discount_amount, 
            final_amount, due_date, status, generated_date
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 'Generated', ?)
        `, [
          projectId, unit.id, financialYear, baseAmount, discountAmount, 
          finalAmount, dueDate, letterDate
        ]);

        const letterId = result.lastInsertRowid as number;

        for (const addon of addOns) {
          dbService.run(`
            INSERT INTO add_ons (letter_id, addon_name, addon_amount)
            VALUES (?, ?, ?)
          `, [letterId, addon.name, addon.amount]);
        }
      }
    });
  }

  public getAll(): MaintenanceLetter[] {
    return dbService.query<MaintenanceLetter>(`
      SELECT l.*, u.unit_number, u.owner_name, p.name as project_name
      FROM maintenance_letters l
      JOIN units u ON l.unit_id = u.id
      JOIN projects p ON l.project_id = p.id
      ORDER BY l.financial_year DESC, u.unit_number ASC
    `);
  }

  public getById(id: number): MaintenanceLetter | undefined {
    return dbService.get<MaintenanceLetter>(`
      SELECT l.*, u.unit_number, u.owner_name, p.name as project_name
      FROM maintenance_letters l
      JOIN units u ON l.unit_id = u.id
      JOIN projects p ON l.project_id = p.id
      WHERE l.id = ?
    `, [id]);
  }

  public delete(id: number): boolean {
    try {
      const result = dbService.run('DELETE FROM maintenance_letters WHERE id = ?', [id]);
      return result.changes > 0;
    } catch (error) {
      console.error(`Error deleting maintenance letter ${id}:`, error);
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

export const maintenanceLetterService = new MaintenanceLetterService();
