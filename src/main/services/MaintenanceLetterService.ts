import { dbService } from '../db/database'
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'
import fs from 'fs'
import path from 'path'
import { app } from 'electron'

export interface MaintenanceLetter {
  id: number;
  financial_year: string;
  base_amount: number;
  unit_number: string;
  owner_name: string;
  sector_code: string;
  area_sqft: number;
  project_name: string;
  due_date: string;
  generated_date: string;
  account_name: string;
  account_no: string;
  ifsc_code: string;
  bank_name: string;
  branch: string;
  branch_address: string;
  qr_code_path?: string;
}

export interface AddOn {
  id: number;
  letter_id: number;
  addon_name: string;
  addon_amount: number;
}

class MaintenanceLetterService {
  private readonly MARGIN = 40;
  private readonly COLORS = {
    NAVY: rgb(0.12, 0.24, 0.42),
    TEXT: rgb(0.2, 0.2, 0.2),
    GRAY: rgb(0.55, 0.55, 0.55),
    LINE: rgb(0.88, 0.88, 0.88),
    HEADER_BG: rgb(0.97, 0.97, 0.97),
    GOLD: rgb(0.75, 0.55, 0.2),
    RED: rgb(0.8, 0.1, 0.1)
  };

  public async generatePdf(letterId: number): Promise<string> {
    const letter = this.getLetterData(letterId);
    const addOns = dbService.query<AddOn>('SELECT * FROM add_ons WHERE letter_id = ?', [letterId]);

    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595.28, 841.89]);
    const { width, height } = page.getSize();
    
    const fonts = {
      regular: await pdfDoc.embedFont(StandardFonts.Helvetica),
      bold: await pdfDoc.embedFont(StandardFonts.HelveticaBold),
      italic: await pdfDoc.embedFont(StandardFonts.HelveticaOblique),
    };

    let currentY = height - this.MARGIN;

    // --- 1. PREMIUM HEADER (Society Official Details) ---
    const societyName = "BEVERLY HILLS";
    const societyWidth = fonts.bold.widthOfTextAtSize(societyName, 22);
    
    page.drawText(societyName, {
      x: (width - societyWidth) / 2,
      y: currentY,
      size: 22,
      font: fonts.bold,
      color: this.COLORS.NAVY
    });
    
    currentY -= 18;

    page.drawText(
      'Sector "A" Plot Owners Co-operative Housing Society Ltd.',
      {
        x: this.MARGIN,
        y: currentY,
        size: 10,
        font: fonts.bold
      }
    );
    
    currentY -= 12;
    
    page.drawText(
      'Regd No: TNA/SPR/HSG/OH/486/YEAR 2018 (Registered under The Maharashtra Co-operative Societies Act 1960)',
      {
        x: this.MARGIN,
        y: currentY,
        size: 8,
        font: fonts.regular,
        color: this.COLORS.GRAY
      }
    );
    
    currentY -= 10;
    
    page.drawText(
      'CTS. No. 170/6, 171/1, 171/2, 171/3, 171/4, 171/5, 171/6, 171/7, Kharade, Taluka Shahpur, Dist. Thane.',
      {
        x: this.MARGIN,
        y: currentY,
        size: 8,
        font: fonts.regular,
        color: this.COLORS.GRAY
      }
    );

    // Clean divider
    page.drawLine({
      start: { x: this.MARGIN, y: currentY - 10 },
      end: { x: width - this.MARGIN, y: currentY - 10 },
      thickness: 1,
      color: this.COLORS.LINE
    });

    // --- 2. RECIPIENT & DATE ---
    currentY -= 35;
    page.drawText('To,', { x: this.MARGIN, y: currentY, size: 10, font: fonts.regular });
    page.drawText(`Date: ${letter.generated_date}`, { x: width - this.MARGIN - 120, y: currentY, size: 10, font: fonts.regular });
    currentY -= 15;
    page.drawText(letter.owner_name.toUpperCase(), { x: this.MARGIN, y: currentY, size: 11, font: fonts.bold });
    currentY -= 30;

    // --- 3. PREMIUM SUBJECT BOX ---
    const subject = `MAINTENANCE LETTER FOR ${letter.financial_year.toUpperCase()}`;
    
    // Draw highlight box
    page.drawRectangle({
      x: this.MARGIN,
      y: currentY - 22,
      width: width - this.MARGIN * 2,
      height: 22,
      color: this.COLORS.HEADER_BG
    });

    const subWidth = fonts.bold.widthOfTextAtSize(subject, 11);
    page.drawText(subject, {
      x: (width - subWidth) / 2,
      y: currentY - 15,
      size: 11,
      font: fonts.bold
    });
    
    currentY -= 25;
    page.drawText(`Sector: ${letter.sector_code} | Plot No: ${letter.unit_number}`, { x: this.MARGIN, y: currentY, size: 10, font: fonts.bold });

    // --- 4. CALCULATION TABLE ---
    currentY -= 20;
    currentY = this.drawMaintenanceTable(page, letter, addOns, width, currentY, fonts);

    // --- 5. BANK DETAILS ---
    currentY -= 40;
    await this.drawBankSection(page, pdfDoc, letter, width, currentY, fonts);

    // --- 6. PREMIUM FOOTER ---
    page.drawLine({
      start: { x: this.MARGIN, y: 65 },
      end: { x: width - this.MARGIN, y: 65 },
      thickness: 1,
      color: this.COLORS.LINE
    });

    page.drawText(
      'This is a computer generated maintenance letter and does not require signature.',
      {
        x: this.MARGIN,
        y: 50,
        size: 8,
        font: fonts.italic,
        color: this.COLORS.GRAY
      }
    );

    const pdfBytes = await pdfDoc.save();
    const filePath = this.savePdfFile(letter, pdfBytes);
    
    // Update PDF path and generation timestamp
    dbService.run('UPDATE maintenance_letters SET pdf_path = ?, generated_date = ? WHERE id = ?', 
      [filePath, new Date().toISOString(), letterId]);
    return filePath;
  }

  private drawMaintenanceTable(page: any, letter: MaintenanceLetter, addOns: AddOn[], width: number, y: number, fonts: any) {
    const tableWidth = width - (this.MARGIN * 2);
    const headers = ['Particulars', 'Area Sqft', 'Rate', 'Amount', 'Before Due', 'After Due'];
    
    // Premium table header
    page.drawRectangle({
      x: this.MARGIN,
      y: y - 25,
      width: tableWidth,
      height: 25,
      color: this.COLORS.HEADER_BG
    });

    const columnX = [this.MARGIN + 5, this.MARGIN + 90, this.MARGIN + 175, this.MARGIN + 260, this.MARGIN + 345, this.MARGIN + 430];
    
    headers.forEach((h, i) => {
      page.drawText(h, {
        x: columnX[i],
        y: y - 16,
        size: 9,
        font: fonts.bold,
        color: this.COLORS.NAVY
      });
    });

    let currentY = y - 25;
    const rowHeight = 22;

    const discount = letter.base_amount * 0.10;
    const baseBefore = letter.base_amount - discount;
    
    this.drawTableRow(page, 'Current Maintenance', letter.area_sqft.toString(), '3.60', letter.base_amount, baseBefore, letter.base_amount, currentY, fonts, 0);
    currentY -= rowHeight;

    let totalBefore = baseBefore;
    let totalAfter = letter.base_amount;
    let rowIndex = 1;

    addOns.forEach(addon => {
        this.drawTableRow(page, addon.addon_name, '', '', addon.addon_amount, addon.addon_amount, addon.addon_amount, currentY, fonts, rowIndex);
        totalBefore += addon.addon_amount;
        totalAfter += addon.addon_amount;
        currentY -= rowHeight;
        rowIndex++;
    });

    const arrears = (letter as any).arrears || 0;
    if (arrears > 0) {
        this.drawTableRow(page, 'Previous Arrears', '', '', arrears, arrears, arrears, currentY, fonts, rowIndex);
        totalBefore += arrears;
        totalAfter += arrears;
        currentY -= rowHeight;
        rowIndex++;
    }

    currentY -= 5;
    page.drawLine({ start: { x: this.MARGIN, y: currentY }, end: { x: width - this.MARGIN, y: currentY }, thickness: 1.5, color: this.COLORS.NAVY });
    currentY -= 20;
    
    // Premium Total Payable Section
    page.drawRectangle({
      x: this.MARGIN,
      y: currentY - 20,
      width: width - this.MARGIN * 2,
      height: 25,
      color: rgb(0.96,0.96,0.96)
    });

    page.drawText('TOTAL PAYABLE', {
      x: this.MARGIN + 10,
      y: currentY - 14,
      size: 11,
      font: fonts.bold
    });

    page.drawText(`Rs. ${totalBefore.toLocaleString('en-IN')}`, {
      x: width - this.MARGIN - 140,
      y: currentY - 14,
      size: 13,
      font: fonts.bold,
      color: this.COLORS.GOLD
    });

    return currentY;
  }

  private drawTableRow(page: any, label: string, area: string, rate: string, amt: number, before: number, after: number, y: number, fonts: any, rowIndex: number) {
    // Zebra table rows (Premium Look)
    if (rowIndex % 2 === 0) {
      page.drawRectangle({
        x: this.MARGIN,
        y: y - 22,
        width: 515,
        height: 22,
        color: rgb(0.985, 0.985, 0.985)
      });
    }

    const size = 9;
    page.drawText(label, { x: this.MARGIN + 5, y: y - 15, size, font: fonts.regular });
    page.drawText(area, { x: this.MARGIN + 90, y: y - 15, size, font: fonts.regular });
    page.drawText(rate, { x: this.MARGIN + 175, y: y - 15, size, font: fonts.regular });
    page.drawText(amt.toLocaleString('en-IN'), { x: this.MARGIN + 260, y: y - 15, size, font: fonts.regular });
    page.drawText(before.toLocaleString('en-IN'), { x: this.MARGIN + 345, y: y - 15, size, font: fonts.bold });
    page.drawText(after.toLocaleString('en-IN'), { x: this.MARGIN + 430, y: y - 15, size, font: fonts.regular });
    page.drawLine({ start: { x: this.MARGIN, y: y - 22 }, end: { x: 555.28, y: y - 22 }, thickness: 0.5, color: this.COLORS.LINE });
  }

  private async drawBankSection(page: any, pdfDoc: PDFDocument, letter: MaintenanceLetter, width: number, y: number, fonts: any) {
    // Premium Bank Section Layout with visual separation
    page.drawRectangle({ x: this.MARGIN, y: y - 110, width: width - (this.MARGIN * 2), height: 110, color: this.COLORS.HEADER_BG });
    
    page.drawText('BANK DETAILS', { x: this.MARGIN + 10, y: y - 20, size: 10, font: fonts.bold });
    page.drawText('QR CODE', { x: width - this.MARGIN - 60, y: y - 20, size: 10, font: fonts.bold });

    // Add divider between bank details and QR code
    page.drawLine({
      start: { x: width - 140, y: y - 110 },
      end: { x: width - 140, y: y },
      thickness: 1,
      color: this.COLORS.LINE
    });

    const details = [
      ['Name:', letter.account_name],
      ['Account No:', letter.account_no],
      ['IFSC Code:', letter.ifsc_code],
      ['Bank Name:', letter.bank_name],
      ['Branch:', letter.branch]
    ];

    details.forEach((d, i) => {
      page.drawText(d[0], { x: this.MARGIN + 15, y: y - 40 - (i * 14), size: 9, font: fonts.bold });
      page.drawText(d[1], { x: this.MARGIN + 110, y: y - 40 - (i * 14), size: 9, font: fonts.regular });
    });

    if (letter.qr_code_path && fs.existsSync(letter.qr_code_path)) {
        try {
            const qrBytes = fs.readFileSync(letter.qr_code_path);
            const qrImg = await pdfDoc.embedPng(qrBytes);
            page.drawImage(qrImg, { x: width - this.MARGIN - 95, y: y - 100, width: 85, height: 85 });
        } catch (e) { console.error("QR Load failed", e); }
    }
  }

  private getLetterData(id: number): MaintenanceLetter {
    const data = dbService.get<MaintenanceLetter>(`
      SELECT l.*, u.unit_number, u.owner_name, u.area_sqft, u.sector_code, p.name as project_name,
             COALESCE(psc.bank_name, p.bank_name) as bank_name,
             COALESCE(psc.account_name, p.account_name) as account_name,
             COALESCE(psc.account_no, p.account_no) as account_no,
             COALESCE(psc.ifsc_code, p.ifsc_code) as ifsc_code,
             COALESCE(psc.branch, p.branch) as branch,
             COALESCE(psc.qr_code_path, p.qr_code_path) as qr_code_path
      FROM maintenance_letters l
      JOIN units u ON l.unit_id = u.id
      JOIN projects p ON l.project_id = p.id
      LEFT JOIN project_sector_payment_configs psc ON psc.project_id = p.id AND UPPER(TRIM(psc.sector_code)) = UPPER(TRIM(u.sector_code))
      WHERE l.id = ?`, [id]);
    if (!data) throw new Error('Letter record not found in database');
    return data;
  }

  private savePdfFile(letter: MaintenanceLetter, bytes: Uint8Array): string {
    const dir = path.join(app.getPath('userData'), 'maintenance_letters');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const safeUnit = letter.unit_number.replace(/[\/\\?%*:|"<>]/g, '-');
    const fileName = `ML_${letter.id}_${safeUnit}.pdf`;
    const fullPath = path.join(dir, fileName);
    fs.writeFileSync(fullPath, bytes);
    return fullPath;
  }

  // Missing methods that are needed by the application
  public getAll(): MaintenanceLetter[] {
    return dbService.query<MaintenanceLetter>(`
      SELECT l.*, u.unit_number, u.owner_name, u.sector_code, p.name as project_name
      FROM maintenance_letters l
      JOIN units u ON l.unit_id = u.id
      JOIN projects p ON l.project_id = p.id
      ORDER BY l.financial_year DESC, u.unit_number ASC
    `);
  }

  public getById(id: number): MaintenanceLetter | undefined {
    return dbService.get<MaintenanceLetter>(`
      SELECT l.*, u.unit_number, u.owner_name, u.sector_code, p.name as project_name
      FROM maintenance_letters l
      JOIN units u ON l.unit_id = u.id
      JOIN projects p ON l.project_id = p.id
      WHERE l.id = ?
    `, [id]);
  }

  public getAddOns(letterId: number): AddOn[] {
    return dbService.query<AddOn>('SELECT * FROM add_ons WHERE letter_id = ?', [letterId]);
  }

  public createBatch(
    projectId: number,
    financialYear: string,
    letterDate: string,
    dueDate: string,
    unitIds: number[] = [],
    addOns: { addon_name: string; addon_amount: number }[] = []
  ): boolean {
    // Basic validation
    if (!projectId || !financialYear) {
      throw new Error('Project ID and Financial Year are required');
    }

    // Check if project exists
    const project = dbService.get<{ id: number }>('SELECT id FROM projects WHERE id = ?', [projectId]);
    if (!project) {
      throw new Error('Project not found');
    }

    // Check if maintenance rate exists for this project and year
    const rate = dbService.get<{ id: number; rate_per_sqft: number }>(
      'SELECT id, rate_per_sqft FROM maintenance_rates WHERE project_id = ? AND financial_year = ?',
      [projectId, financialYear]
    );
    if (!rate) {
      throw new Error(`No maintenance rate found for Project ${projectId} and Financial Year ${financialYear}`);
    }

    // Get units for this project
    let unitFilter = 'WHERE project_id = ?';
    const unitParams: (string | number | undefined | null)[] = [projectId];
    if (unitIds && unitIds.length > 0) {
      unitFilter += ` AND id IN (${unitIds.map(() => '?').join(',')})`;
      unitParams.push(...unitIds);
    }

    const projectUnits = dbService.query<{ id: number; area_sqft: number }>(`SELECT id, area_sqft FROM units ${unitFilter}`, unitParams);
    if (projectUnits.length === 0) {
      throw new Error('No units found for this project');
    }

    return dbService.transaction(() => {
      const totalAddOns = addOns.reduce((sum, addon) => sum + addon.addon_amount, 0);
      for (const unit of projectUnits) {
        // Calculate Arrears from previous letters
        const previousOutstanding =
          dbService.get<{ total: number }>(
            `
          SELECT
            COALESCE(SUM(l.final_amount), 0) - COALESCE(
              (
                SELECT SUM(p.payment_amount)
                FROM payments p
                LEFT JOIN maintenance_letters ml ON ml.id = p.letter_id
                WHERE p.unit_id = ?
                  AND (
                    (p.financial_year IS NOT NULL AND p.financial_year < ?)
                    OR (p.financial_year IS NULL AND ml.financial_year < ?)
                  )
              ),
              0
            ) as total
          FROM maintenance_letters l
          WHERE l.unit_id = ? AND l.financial_year < ?
        `,
            [unit.id, financialYear, financialYear, unit.id, financialYear]
          )?.total || 0;

        const baseAmount = unit.area_sqft * (rate.rate_per_sqft || 0);
        const discountAmount = 0; // Simplified for now

        const arrears = previousOutstanding;
        const finalAmount = Math.max(0, baseAmount + arrears + totalAddOns - discountAmount);

        // Check if letter already exists and preserve payment status
        const existingLetter = dbService.get<{ id: number; is_paid: number; status: string }>(
          'SELECT id, is_paid, status FROM maintenance_letters WHERE unit_id = ? AND financial_year = ?',
          [unit.id, financialYear]
        );

        const preservePaymentStatus = existingLetter && existingLetter.is_paid === 1;
        const newStatus = preservePaymentStatus ? 'Paid' : 'Pending';
        const newIsPaid = preservePaymentStatus ? 1 : 0;

        dbService.run(
          `
          INSERT INTO maintenance_letters (
            project_id, unit_id, financial_year, base_amount, arrears, discount_amount, 
            final_amount, due_date, status, is_paid, is_sent, generated_date
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
          ON CONFLICT(unit_id, financial_year) DO UPDATE SET
            base_amount = excluded.base_amount,
            arrears = excluded.arrears,
            discount_amount = excluded.discount_amount,
            final_amount = excluded.final_amount,
            due_date = excluded.due_date,
            status = excluded.status,
            is_paid = excluded.is_paid,
            generated_date = excluded.generated_date
        `,
          [
            projectId,
            unit.id,
            financialYear,
            baseAmount,
            arrears,
            discountAmount,
            finalAmount,
            dueDate,
            newStatus,
            newIsPaid,
            letterDate
          ]
        );

        const existing = dbService.get<{ id: number }>(
          'SELECT id FROM maintenance_letters WHERE unit_id = ? AND financial_year = ?',
          [unit.id, financialYear]
        );
        if (!existing) {
          throw new Error(`Failed to persist maintenance letter for unit ${unit.id}`);
        }
        const letterId = existing.id;

        // Clear old add-ons if it was an update
        dbService.run('DELETE FROM add_ons WHERE letter_id = ?', [letterId]);

        for (const addon of addOns) {
          dbService.run(
            `
            INSERT INTO add_ons (letter_id, addon_name, addon_amount)
            VALUES (?, ?, ?)
          `,
            [letterId, addon.addon_name, addon.addon_amount]
          );
        }
      }
      return true;
    });
  }

  public delete(id: number): boolean {
    try {
      const result = dbService.run('DELETE FROM maintenance_letters WHERE id = ?', [id]);
      return result.changes > 0;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Error deleting maintenance letter ${id}:`, message);
      throw error;
    }
  }

  public bulkDelete(ids: number[]): boolean {
    return dbService.transaction(() => {
      let allDeleted = true;
      for (const id of ids) {
        if (!this.delete(id)) {
          allDeleted = false;
        }
      }
      return allDeleted;
    });
  }

  public addAddOn(params: {
    unit_id: number;
    financial_year: string;
    addon_name: string;
    addon_amount: number;
    remarks?: string;
  }): boolean {
    return dbService.transaction(() => {
      // 1. Find the letter
      const letter = dbService.get<{
        id: number;
        base_amount: number;
        arrears: number;
        discount_amount: number;
      }>(
        'SELECT id, base_amount, arrears, discount_amount FROM maintenance_letters WHERE unit_id = ? AND financial_year = ?',
        [params.unit_id, params.financial_year]
      );

      if (!letter) {
        throw new Error(
          'Maintenance Letter not found for this Unit and Financial Year. Please generate the letter first.'
        );
      }

      // 2. Insert Add-on
      dbService.run(
        'INSERT INTO add_ons (letter_id, addon_name, addon_amount, remarks) VALUES (?, ?, ?, ?)',
        [letter.id, params.addon_name, params.addon_amount, params.remarks || '']
      );

      // 3. Recalculate Letter Total
      const addOnsTotal = this.calculateAddOnsTotal(letter.id);

      const finalAmount = Math.max(
        0,
        letter.base_amount + letter.arrears + addOnsTotal - letter.discount_amount
      );

      dbService.run('UPDATE maintenance_letters SET final_amount = ? WHERE id = ?', [
        finalAmount,
        letter.id
      ]);

      return true;
    });
  }

  public deleteAddOn(id: number): boolean {
    return dbService.transaction(() => {
      // 1. Get Add-on to find letter_id
      const addon = dbService.get<{ letter_id: number }>(
        'SELECT letter_id FROM add_ons WHERE id = ?',
        [id]
      );

      if (!addon) {
        throw new Error('Add-on not found');
      }

      // 2. Delete Add-on
      dbService.run('DELETE FROM add_ons WHERE id = ?', [id]);

      // 3. Recalculate Letter Total
      const letter = dbService.get<{
        base_amount: number;
        arrears: number;
        discount_amount: number;
      }>('SELECT base_amount, arrears, discount_amount FROM maintenance_letters WHERE id = ?', [
        addon.letter_id
      ]);

      if (letter) {
        const addOnsTotal = this.calculateAddOnsTotal(addon.letter_id);

        const finalAmount = Math.max(
          0,
          letter.base_amount + letter.arrears + addOnsTotal - letter.discount_amount
        );

        dbService.run('UPDATE maintenance_letters SET final_amount = ? WHERE id = ?', [
          finalAmount,
          addon.letter_id
        ]);
      }

      return true;
    });
  }

  public getAllAddOns(): (AddOn & {
    unit_id: number;
    financial_year: string;
    unit_number?: string;
    owner_name?: string;
    project_id?: number;
  })[] {
    return dbService.query<
      AddOn & {
        unit_id: number;
        financial_year: string;
        unit_number?: string;
        owner_name?: string;
        project_id?: number;
      }
    >(`
      SELECT a.*, l.unit_id, l.financial_year, l.project_id, u.unit_number, u.owner_name
      FROM add_ons a
      JOIN maintenance_letters l ON a.letter_id = l.id
      JOIN units u ON l.unit_id = u.id
    `);
  }

  private calculateAddOnsTotal(letterId: number): number {
    try {
      const result = dbService.get<{ total: number }>(
        'SELECT SUM(addon_amount) as total FROM add_ons WHERE letter_id = ?',
        [letterId]
      );
      
      // Handle null/undefined results and negative values
      const total = result?.total;
      if (total === null || total === undefined) {
        return 0;
      }
      
      // Ensure we don't return negative values
      return Math.max(0, total);
    } catch (error) {
      console.error(`Error calculating add-ons total for letter ${letterId}:`, error);
      return 0;
    }
  }
}

export const maintenanceLetterService = new MaintenanceLetterService();