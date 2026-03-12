import { dbService } from '../db/database'
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'
import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import { projectService } from './ProjectService'

export interface MaintenanceLetter {
  id?: number
  project_id: number
  unit_id: number
  financial_year: string
  base_amount: number
  arrears?: number // Aligned with ER
  discount_amount: number
  final_amount: number
  is_paid?: boolean // Aligned with ER
  is_sent?: boolean // Aligned with ER
  due_date?: string
  status: string // Pending, Paid, Overdue, Generated (legacy)
  pdf_path?: string
  generated_date?: string
  unit_number?: string
  owner_name?: string
  project_name?: string
  letterhead_path?: string
  account_name?: string
  bank_name?: string
  account_no?: string
  ifsc_code?: string
  branch?: string
  branch_address?: string
  qr_code_path?: string
  sector_code?: string
  add_ons_total?: number
  unit_type?: string
}

export interface AddOn {
  id?: number
  letter_id: number
  addon_name: string
  addon_amount: number
  remarks?: string
}

class MaintenanceLetterService {
  private sanitizeFileNamePart(value: string): string {
    const sanitized = value.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim().replace(/\s+/g, '_')
    return sanitized || 'UNKNOWN'
  }

  private calculateAddOnsTotal(letterId: number): number {
    return dbService.get<{ total: number }>(
      'SELECT SUM(addon_amount) as total FROM add_ons WHERE letter_id = ?',
      [letterId]
    )?.total || 0
  }

  private syncMaintenanceLetterStatus(letterId: number): void {
    dbService.run(
      `UPDATE maintenance_letters
       SET
         status = CASE
           WHEN COALESCE(
             (
               SELECT SUM(p.payment_amount)
               FROM payments p
               WHERE p.letter_id = maintenance_letters.id
                  OR (
                    p.letter_id IS NULL
                    AND p.unit_id = maintenance_letters.unit_id
                    AND TRIM(COALESCE(p.financial_year, '')) = TRIM(maintenance_letters.financial_year)
                  )
             ),
             0
           ) + 0.01 >= maintenance_letters.final_amount THEN 'Paid'
           ELSE 'Pending'
         END,
         is_paid = CASE
           WHEN COALESCE(
             (
               SELECT SUM(p.payment_amount)
               FROM payments p
               WHERE p.letter_id = maintenance_letters.id
                  OR (
                    p.letter_id IS NULL
                    AND p.unit_id = maintenance_letters.unit_id
                    AND TRIM(COALESCE(p.financial_year, '')) = TRIM(maintenance_letters.financial_year)
                  )
             ),
             0
           ) + 0.01 >= maintenance_letters.final_amount THEN 1
           ELSE 0
         END
       WHERE id = ?`,
      [letterId]
    )
  }

  private syncAllMaintenanceLetterStatuses(): void {
    dbService.run(
      `UPDATE maintenance_letters
       SET
         status = CASE
           WHEN COALESCE(
             (
               SELECT SUM(p.payment_amount)
               FROM payments p
               WHERE p.letter_id = maintenance_letters.id
                  OR (
                    p.letter_id IS NULL
                    AND p.unit_id = maintenance_letters.unit_id
                    AND TRIM(COALESCE(p.financial_year, '')) = TRIM(maintenance_letters.financial_year)
                  )
             ),
             0
           ) + 0.01 >= maintenance_letters.final_amount THEN 'Paid'
           ELSE 'Pending'
         END,
         is_paid = CASE
           WHEN COALESCE(
             (
               SELECT SUM(p.payment_amount)
               FROM payments p
               WHERE p.letter_id = maintenance_letters.id
                  OR (
                    p.letter_id IS NULL
                    AND p.unit_id = maintenance_letters.unit_id
                    AND TRIM(COALESCE(p.financial_year, '')) = TRIM(maintenance_letters.financial_year)
                  )
             ),
             0
           ) + 0.01 >= maintenance_letters.final_amount THEN 1
           ELSE 0
         END`
    )
  }

  private ensureColumnExists(
    tableName: string,
    columnName: string,
    alterSql: string
  ): boolean {
    const getHasColumn = (): boolean => {
      const columns = dbService.query<{ name: string }>(`PRAGMA table_info(${tableName})`)
      return columns.some((column) => column.name === columnName)
    }

    if (getHasColumn()) return true

    try {
      dbService.run(alterSql)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      const lower = message.toLowerCase()
      if (!lower.includes('duplicate column name')) {
        console.error(`Failed to add ${tableName}.${columnName} column: ${message}`)
      }
    }

    return getHasColumn()
  }

  private ensureUnitsUnitTypeColumn(): boolean {
    return this.ensureColumnExists(
      'units',
      'unit_type',
      "ALTER TABLE units ADD COLUMN unit_type TEXT DEFAULT 'Bungalow'"
    )
  }

  private ensureMaintenanceRatesUnitTypeColumn(): boolean {
    return this.ensureColumnExists(
      'maintenance_rates',
      'unit_type',
      "ALTER TABLE maintenance_rates ADD COLUMN unit_type TEXT DEFAULT 'Bungalow'"
    )
  }

  public async generatePdf(letterId: number): Promise<string> {
    const letter = dbService.get<MaintenanceLetter>(
      `
      SELECT
        l.*,
        u.unit_number,
        u.owner_name,
        p.name as project_name,
        p.letterhead_path,
        CASE
          WHEN u.sector_code IS NOT NULL AND TRIM(u.sector_code) <> '' THEN UPPER(TRIM(u.sector_code))
          WHEN INSTR(TRIM(COALESCE(u.unit_number, '')), '-') > 0 THEN
            UPPER(TRIM(SUBSTR(TRIM(u.unit_number), 1, INSTR(TRIM(u.unit_number), '-') - 1)))
          WHEN INSTR(TRIM(COALESCE(u.unit_number, '')), '/') > 0 THEN
            UPPER(TRIM(SUBSTR(TRIM(u.unit_number), 1, INSTR(TRIM(u.unit_number), '/') - 1)))
          ELSE ''
        END as sector_code,
        COALESCE(psc.account_name, p.account_name) as account_name,
        COALESCE(psc.bank_name, p.bank_name) as bank_name,
        COALESCE(psc.account_no, p.account_no) as account_no,
        COALESCE(psc.ifsc_code, p.ifsc_code) as ifsc_code,
        COALESCE(psc.branch, p.branch) as branch,
        COALESCE(psc.branch_address, p.branch_address) as branch_address,
        COALESCE(psc.qr_code_path, p.qr_code_path) as qr_code_path
      FROM maintenance_letters l
      JOIN units u ON l.unit_id = u.id
      JOIN projects p ON l.project_id = p.id
      LEFT JOIN project_sector_payment_configs psc
        ON psc.project_id = p.id
       AND UPPER(TRIM(psc.sector_code)) = CASE
          WHEN u.sector_code IS NOT NULL AND TRIM(u.sector_code) <> '' THEN UPPER(TRIM(u.sector_code))
          WHEN INSTR(TRIM(COALESCE(u.unit_number, '')), '-') > 0 THEN
            UPPER(TRIM(SUBSTR(TRIM(u.unit_number), 1, INSTR(TRIM(u.unit_number), '-') - 1)))
          WHEN INSTR(TRIM(COALESCE(u.unit_number, '')), '/') > 0 THEN
            UPPER(TRIM(SUBSTR(TRIM(u.unit_number), 1, INSTR(TRIM(u.unit_number), '/') - 1)))
          ELSE ''
        END
      WHERE l.id = ?
    `,
      [letterId]
    )

    if (!letter) throw new Error('Maintenance Letter not found')

    const addOns = dbService.query<AddOn>('SELECT * FROM add_ons WHERE letter_id = ?', [letterId])

    const pdfDoc = await PDFDocument.create()
    const page = pdfDoc.addPage([595.28, 841.89]) // A4 size
    const { width, height } = page.getSize()
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
    const italicFont = await pdfDoc.embedFont(StandardFonts.HelveticaOblique)

    // Enhanced Header Design
    await this.drawEnhancedHeader(page, pdfDoc, letter, width, height, boldFont, italicFont)

    // Letter Details Section
    const detailsY = height - 150
    this.drawLetterDetails(page, letter, detailsY, boldFont, font, width)

    // Unit Information Section
    const unitInfoY = detailsY - 80
    this.drawUnitInformation(page, letter, unitInfoY, boldFont, font)

    // Financial Table Section
    const tableY = height - 320
    const tableData = this.prepareTableData(letter, addOns)
    const tableHeight = this.drawFinancialTable(page, tableData, tableY, boldFont, font, width)

    // Total Section
    const totalY = tableY - tableHeight - 20
    this.drawTotalSection(page, letter, totalY, boldFont, width)

    // Bank Details Section
    const bankY = totalY - 120
    await this.drawBankDetails(page, pdfDoc, letter, bankY, boldFont, font, width)

    // Footer Section
    this.drawFooter(page, letter, boldFont, font, italicFont, width)

    const pdfBytes = await pdfDoc.save()
    const pdfDir = path.join(app.getPath('userData'), 'maintenance_letters')
    if (!fs.existsSync(pdfDir)) fs.mkdirSync(pdfDir, { recursive: true })

    const safeUnitNumber = this.sanitizeFileNamePart(letter.unit_number || 'UNKNOWN')
    const fileName = `ML_${letter.id}_${safeUnitNumber}_Enhanced.pdf`
    const filePath = path.join(pdfDir, fileName)
    fs.writeFileSync(filePath, pdfBytes)

    dbService.run('UPDATE maintenance_letters SET pdf_path = ? WHERE id = ?', [filePath, letterId])
    return filePath
  }

  private async drawEnhancedHeader(page: any, pdfDoc: any, letter: MaintenanceLetter, width: number, height: number, boldFont: any, italicFont: any): Promise<void> {
    const letterheadPath = letter.letterhead_path ? path.resolve(letter.letterhead_path) : ''
    const letterheadExt = path.extname(letterheadPath).toLowerCase()
    const hasSupportedLetterhead =
      (letterheadExt === '.png' || letterheadExt === '.jpg' || letterheadExt === '.jpeg') &&
      fs.existsSync(letterheadPath)

    // Header Background
    page.drawRectangle({
      x: 0,
      y: height - 140,
      width: width,
      height: 140,
      color: rgb(0.05, 0.3, 0.2)
    })

    // Header Border
    page.drawRectangle({
      x: 0,
      y: height - 140,
      width: width,
      height: 140,
      color: rgb(0.08, 0.45, 0.3),
      border: true,
      borderWidth: 2
    })

    if (hasSupportedLetterhead) {
      try {
        const letterheadBytes = fs.readFileSync(letterheadPath)
        const letterheadImage =
          letterheadExt === '.png'
            ? await pdfDoc.embedPng(letterheadBytes)
            : await pdfDoc.embedJpg(letterheadBytes)
        page.drawImage(letterheadImage, {
          x: 20,
          y: height - 130,
          width: 120,
          height: 120
        })
      } catch (error) {
        console.error('Error embedding letterhead image:', error)
      }
    }

    // Header Text
    const projectName = letter.project_name || 'MAINTENANCE LETTER'
    page.drawText(projectName.toUpperCase(), {
      x: 160,
      y: height - 60,
      size: 28,
      font: boldFont,
      color: rgb(1, 1, 1)
    })

    page.drawText('RESIDENTIAL MAINTENANCE LETTER', {
      x: 160,
      y: height - 90,
      size: 14,
      font: italicFont,
      color: rgb(0.9, 0.95, 0.9)
    })

    // Header Decorative Elements
    page.drawLine({
      start: { x: 160, y: height - 105 },
      end: { x: width - 30, y: height - 105 },
      color: rgb(0.2, 0.6, 0.4),
      thickness: 1
    })

    // Header Icons
    page.drawCircle({
      x: width - 80,
      y: height - 80,
      size: 40,
      color: rgb(0.1, 0.5, 0.35)
    })

    page.drawText('Rs', {
      x: width - 95,
      y: height - 95,
      size: 30,
      font: boldFont,
      color: rgb(1, 1, 1)
    })
  }

  private drawLetterDetails(page: any, letter: MaintenanceLetter, y: number, boldFont: any, font: any, width: number): void {
    // Letter Details Box
    page.drawRectangle({
      x: 30,
      y: y - 60,
      width: width - 60,
      height: 60,
      color: rgb(0.95, 0.95, 0.95)
    })

    page.drawRectangle({
      x: 30,
      y: y - 60,
      width: width - 60,
      height: 60,
      color: rgb(0.8, 0.8, 0.8),
      border: true,
      borderWidth: 1
    })

    // Letter Details Content
    page.drawText('LETTER INFORMATION', {
      x: 40,
      y: y - 20,
      size: 12,
      font: boldFont,
      color: rgb(0.2, 0.2, 0.2)
    })

    page.drawText(`Letter No: ML-${letter.id}`, {
      x: 40,
      y: y - 40,
      size: 10,
      font: font,
      color: rgb(0.4, 0.4, 0.4)
    })

    page.drawText(`Generated: ${letter.generated_date?.split(' ')[0] || ''}`, {
      x: 200,
      y: y - 40,
      size: 10,
      font: font,
      color: rgb(0.4, 0.4, 0.4)
    })

    const dueDateColor = letter.due_date ? 
      (new Date(letter.due_date) < new Date() ? rgb(0.8, 0, 0) : rgb(0.2, 0.6, 0.2)) : 
      rgb(0.4, 0.4, 0.4)

    page.drawText(`Due Date: ${letter.due_date || 'N/A'}`, {
      x: 360,
      y: y - 40,
      size: 10,
      font: font,
      color: dueDateColor
    })

    // Status Badge
    const statusColor = letter.status === 'Paid' ? rgb(0.2, 0.6, 0.2) : 
                       letter.status === 'Overdue' ? rgb(0.8, 0, 0) : rgb(0.6, 0.6, 0.6)

    page.drawRectangle({
      x: width - 150,
      y: y - 50,
      width: 110,
      height: 25,
      color: statusColor
    })

    page.drawText(`Status: ${letter.status || 'Pending'}`, {
      x: width - 145,
      y: y - 45,
      size: 10,
      font: boldFont,
      color: rgb(1, 1, 1)
    })
  }

  private drawUnitInformation(page: any, letter: MaintenanceLetter, y: number, boldFont: any, font: any): void {
    // Unit Information Box
    page.drawRectangle({
      x: 30,
      y: y - 80,
      width: 350,
      height: 80,
      color: rgb(0.98, 0.98, 0.98)
    })

    page.drawRectangle({
      x: 30,
      y: y - 80,
      width: 350,
      height: 80,
      color: rgb(0.85, 0.85, 0.85),
      border: true,
      borderWidth: 1
    })

    // Unit Information Content
    page.drawText('BILLING INFORMATION', {
      x: 40,
      y: y - 20,
      size: 12,
      font: boldFont,
      color: rgb(0.2, 0.2, 0.2)
    })

    page.drawText('To:', {
      x: 40,
      y: y - 40,
      size: 10,
      font: boldFont,
      color: rgb(0.3, 0.3, 0.3)
    })

    page.drawText(`${letter.owner_name || 'N/A'}`, {
      x: 80,
      y: y - 40,
      size: 12,
      font: boldFont,
      color: rgb(0.1, 0.1, 0.1)
    })

    page.drawText('Unit No:', {
      x: 40,
      y: y - 60,
      size: 10,
      font: boldFont,
      color: rgb(0.3, 0.3, 0.3)
    })

    page.drawText(`${letter.unit_number || 'N/A'}`, {
      x: 120,
      y: y - 60,
      size: 11,
      font: font,
      color: rgb(0.2, 0.2, 0.2)
    })

    page.drawText('Financial Year:', {
      x: 200,
      y: y - 60,
      size: 10,
      font: boldFont,
      color: rgb(0.3, 0.3, 0.3)
    })

    page.drawText(`${letter.financial_year || 'N/A'}`, {
      x: 300,
      y: y - 60,
      size: 11,
      font: font,
      color: rgb(0.2, 0.2, 0.2)
    })
  }

  private prepareTableData(letter: MaintenanceLetter, addOns: AddOn[]): Array<{ desc: string; amt: number; type: 'base' | 'addon' | 'arrears' | 'discount' | 'total' }> {
    const items: Array<{ desc: string; amt: number; type: 'base' | 'addon' | 'arrears' | 'discount' | 'total' }> = []

    // Add Base Amount
    items.push({ desc: 'Annual Maintenance Charges', amt: letter.base_amount, type: 'base' })

    // Add Arrears or Advance
    if (letter.arrears && letter.arrears !== 0) {
      if (letter.arrears > 0) {
        items.push({ desc: 'Previous Arrears', amt: letter.arrears, type: 'arrears' })
      } else {
        items.push({ desc: 'Advance Payment / Credit', amt: letter.arrears, type: 'arrears' })
      }
    }

    // Add Add-ons
    addOns.forEach((addon) => {
      items.push({ desc: addon.addon_name, amt: addon.addon_amount, type: 'addon' })
    })

    // Add Discount
    if (letter.discount_amount > 0) {
      items.push({ desc: 'Early Payment Discount', amt: -letter.discount_amount, type: 'discount' })
    }

    return items
  }

  private drawFinancialTable(page: any, tableData: Array<{ desc: string; amt: number; type: string }>, y: number, boldFont: any, font: any, width: number): number {
    // Table Header
    page.drawRectangle({ x: 30, y: y, width: width - 60, height: 30, color: rgb(0.1, 0.5, 0.35) })
    page.drawRectangle({ x: 30, y: y, width: width - 60, height: 30, color: rgb(0.08, 0.45, 0.3), border: true, borderWidth: 1 })

    page.drawText('DESCRIPTION', {
      x: 40,
      y: y + 8,
      size: 11,
      font: boldFont,
      color: rgb(1, 1, 1)
    })

    page.drawText('AMOUNT (Rs.)', {
      x: width - 150,
      y: y + 8,
      size: 11,
      font: boldFont,
      color: rgb(1, 1, 1)
    })

    // Table Rows
    let currentY = y - 30
    let totalAmount = 0

    tableData.forEach((item, index) => {
      const rowHeight = 25

      // Row Background
      const rowColor = index % 2 === 0 ? rgb(0.98, 0.98, 0.98) : rgb(0.95, 0.95, 0.95)
      page.drawRectangle({ x: 30, y: currentY - rowHeight, width: width - 60, height: rowHeight, color: rowColor })

      // Row Border
      page.drawRectangle({ x: 30, y: currentY - rowHeight, width: width - 60, height: rowHeight, color: rgb(0.85, 0.85, 0.85), border: true, borderWidth: 0.5 })

      // Description
      const descColor = item.type === 'discount' ? rgb(0.8, 0, 0) : 
                       item.type === 'arrears' ? (item.amt > 0 ? rgb(0.6, 0.3, 0.1) : rgb(0.1, 0.5, 0.1)) :
                       rgb(0.2, 0.2, 0.2)

      page.drawText(item.desc, {
        x: 40,
        y: currentY - 18,
        size: 10,
        font: font,
        color: descColor
      })

      // Amount
      const amountText = item.amt.toFixed(2)
      const amountColor = item.type === 'discount' ? rgb(0.8, 0, 0) : rgb(0.1, 0.1, 0.1)

      page.drawText(amountText, {
        x: width - 150,
        y: currentY - 18,
        size: 10,
        font: font,
        color: amountColor
      })

      totalAmount += item.amt
      currentY -= rowHeight
    })

    // Total Row
    page.drawLine({ start: { x: 30, y: currentY - 5 }, end: { x: width - 30, y: currentY - 5 }, color: rgb(0.3, 0.3, 0.3), thickness: 1 })

    page.drawText('TOTAL AMOUNT PAYABLE', {
      x: 40,
      y: currentY - 20,
      size: 12,
      font: boldFont,
      color: rgb(0.1, 0.1, 0.1)
    })

    page.drawText(`Rs. ${totalAmount.toFixed(2)}`, {
      x: width - 150,
      y: currentY - 20,
      size: 14,
      font: boldFont,
      color: rgb(0.8, 0, 0)
    })

    return Math.abs(currentY - y) + 30
  }

  private drawTotalSection(page: any, letter: MaintenanceLetter, y: number, boldFont: any, width: number): void {
    // Total Section Box
    page.drawRectangle({
      x: 30,
      y: y - 40,
      width: width - 60,
      height: 40,
      color: rgb(0.95, 0.95, 0.95)
    })

    page.drawRectangle({
      x: 30,
      y: y - 40,
      width: width - 60,
      height: 40,
      color: rgb(0.8, 0.8, 0.8),
      border: true,
      borderWidth: 1
    })

    // Total Information
    page.drawText('PAYMENT SUMMARY', {
      x: 40,
      y: y - 15,
      size: 12,
      font: boldFont,
      color: rgb(0.2, 0.2, 0.2)
    })

    page.drawText(`Final Amount: Rs. ${letter.final_amount.toFixed(2)}`, {
      x: 200,
      y: y - 30,
      size: 11,
      font: boldFont,
      color: rgb(0.8, 0, 0)
    })
  }

  private async drawBankDetails(page: any, pdfDoc: any, letter: MaintenanceLetter, y: number, boldFont: any, font: any, width: number): Promise<void> {
    // Bank Details Box
    page.drawRectangle({
      x: 30,
      y: y - 120,
      width: width - 60,
      height: 120,
      color: rgb(0.98, 0.98, 0.98)
    })

    page.drawRectangle({
      x: 30,
      y: y - 120,
      width: width - 60,
      height: 120,
      color: rgb(0.85, 0.85, 0.85),
      border: true,
      borderWidth: 1
    })

    // Bank Details Content
    page.drawText('PAYMENT INSTRUCTIONS', {
      x: 40,
      y: y - 20,
      size: 12,
      font: boldFont,
      color: rgb(0.2, 0.2, 0.2)
    })

    page.drawText('Bank Name:', { x: 40, y: y - 45, size: 10, font: boldFont, color: rgb(0.3, 0.3, 0.3) })
    page.drawText(letter.bank_name || 'N/A', { x: 140, y: y - 45, size: 10, font: font, color: rgb(0.2, 0.2, 0.2) })

    page.drawText('Account Name:', { x: 40, y: y - 65, size: 10, font: boldFont, color: rgb(0.3, 0.3, 0.3) })
    page.drawText(letter.account_name || 'N/A', { x: 140, y: y - 65, size: 10, font: font, color: rgb(0.2, 0.2, 0.2) })

    page.drawText('Account No:', { x: 40, y: y - 85, size: 10, font: boldFont, color: rgb(0.3, 0.3, 0.3) })
    page.drawText(letter.account_no || 'N/A', { x: 140, y: y - 85, size: 10, font: font, color: rgb(0.2, 0.2, 0.2) })

    page.drawText('IFSC Code:', { x: 40, y: y - 105, size: 10, font: boldFont, color: rgb(0.3, 0.3, 0.3) })
    page.drawText(letter.ifsc_code || 'N/A', { x: 140, y: y - 105, size: 10, font: font, color: rgb(0.2, 0.2, 0.2) })

    if (letter.branch) {
      page.drawText('Branch:', { x: 320, y: y - 45, size: 10, font: boldFont, color: rgb(0.3, 0.3, 0.3) })
      page.drawText(letter.branch, { x: 400, y: y - 45, size: 10, font: font, color: rgb(0.2, 0.2, 0.2) })
    }

    if (letter.branch_address) {
      page.drawText('Branch Address:', { x: 320, y: y - 65, size: 10, font: boldFont, color: rgb(0.3, 0.3, 0.3) })
      page.drawText(letter.branch_address, { x: 400, y: y - 65, size: 10, font: font, color: rgb(0.2, 0.2, 0.2) })
    }

    // QR Code Section
    const qrPath = letter.qr_code_path ? path.resolve(letter.qr_code_path) : ''
    const qrExt = path.extname(qrPath).toLowerCase()
    const isSupportedQrImage = qrExt === '.png' || qrExt === '.jpg' || qrExt === '.jpeg'
    if (qrPath && isSupportedQrImage && fs.existsSync(qrPath)) {
      try {
        const qrImageBytes = fs.readFileSync(qrPath)
        const qrImage =
          qrExt === '.png' ? await pdfDoc.embedPng(qrImageBytes) : await pdfDoc.embedJpg(qrImageBytes)
        page.drawImage(qrImage, {
          x: width - 140,
          y: y - 110,
          width: 90,
          height: 90
        })
        page.drawText('SCAN TO PAY', {
          x: width - 135,
          y: y - 125,
          size: 10,
          font: boldFont,
          color: rgb(0.1, 0.5, 0.35)
        })
      } catch (error) {
        console.error('Error embedding QR image:', error)
      }
    }
  }

  private drawFooter(page: any, letter: MaintenanceLetter, boldFont: any, font: any, italicFont: any, width: number): void {
    // Footer Background
    page.drawRectangle({
      x: 0,
      y: 30,
      width: width,
      height: 80,
      color: rgb(0.05, 0.3, 0.2)
    })

    page.drawRectangle({
      x: 0,
      y: 30,
      width: width,
      height: 80,
      color: rgb(0.08, 0.45, 0.3),
      border: true,
      borderWidth: 2
    })

    // Footer Content
    page.drawText('Thank you for your prompt payment!', {
      x: 40,
      y: 80,
      size: 14,
      font: boldFont,
      color: rgb(1, 1, 1)
    })

    page.drawText('For any queries, please contact our office.', {
      x: 40,
      y: 60,
      size: 10,
      font: italicFont,
      color: rgb(0.9, 0.95, 0.9)
    })

    page.drawText('Office Hours: 10:00 AM - 6:00 PM (Mon-Sat)', {
      x: 40,
      y: 40,
      size: 9,
      font: font,
      color: rgb(0.8, 0.9, 0.8)
    })

    // Footer Decorative Elements
    page.drawLine({
      start: { x: 40, y: 95 },
      end: { x: 250, y: 95 },
      color: rgb(0.2, 0.6, 0.4),
      thickness: 1
    })

    // Page Number
    page.drawText(`Page 1 of 1`, {
      x: width - 100,
      y: 40,
      size: 9,
      font: font,
      color: rgb(0.8, 0.9, 0.8)
    })
  }

  public createBatch(
    projectId: number,
    financialYear: string,
    letterDate: string,
    dueDate: string,
    unitIds: number[] = [],
    addOns: { addon_name: string; addon_amount: number }[] = []
  ): boolean {
    const setupSummary = projectService.getSetupSummary(projectId, financialYear)
    if (!setupSummary.ready_for_letters) {
      throw new Error(`Project setup incomplete: ${setupSummary.blockers.join(' ')}`)
    }

    this.ensureUnitsUnitTypeColumn()
    const hasRatesUnitType = this.ensureMaintenanceRatesUnitTypeColumn()

    // 1. Check if the project has units
    let unitFilter = 'WHERE project_id = ?'
    const unitParams: (string | number | undefined | null)[] = [projectId]
    if (unitIds && unitIds.length > 0) {
      unitFilter += ` AND id IN (${unitIds.map(() => '?').join(',')})`
      unitParams.push(...unitIds)
    }

    const projectUnits = dbService.query(`SELECT id FROM units ${unitFilter}`, unitParams)
    if (projectUnits.length === 0) {
      throw new Error(
        `No units found matching criteria. Please add units before generating letters.`
      )
    }

    // 2. Check if a maintenance rate is defined for this project and year
    const rate = dbService.get(
      'SELECT id FROM maintenance_rates WHERE project_id = ? AND financial_year = ?',
      [projectId, financialYear]
    )
    if (!rate) {
      throw new Error(
        `No maintenance rate found for this Project and Financial Year (${financialYear}). Please go to 'Projects' page, click the 'Rates' button for your project, and add a rate for this financial year.`
      )
    }

    // Build the query based on whether we have unit types
    let querySql: string
    let queryParams: (string | number | undefined | null)[]

    if (hasRatesUnitType) {
      // Complex query with unit type matching
      let unitFilterClause = 'WHERE u.project_id = ?'
      const params: (string | number | undefined | null)[] = [projectId]
      
      if (unitIds && unitIds.length > 0) {
        unitFilterClause += ` AND u.id IN (${unitIds.map(() => '?').join(',')})`
        params.push(...unitIds)
      }

      querySql = `
        SELECT
          u.id,
          u.area_sqft,
          r.rate_per_sqft,
          COALESCE(
            (
              SELECT MAX(s.discount_percentage)
              FROM maintenance_slabs s
              WHERE s.rate_id = r.id AND s.is_early_payment = 1
            ),
            0
          ) as discount_percentage
        FROM units u
        JOIN maintenance_rates r ON r.id = COALESCE(
          (
            SELECT MAX(r2.id)
            FROM maintenance_rates r2
            WHERE r2.project_id = u.project_id
              AND r2.financial_year = ?
              AND r2.unit_type = CASE
                WHEN u.unit_type IS NULL OR TRIM(u.unit_type) = '' THEN 'Bungalow'
                WHEN LOWER(TRIM(u.unit_type)) = 'flat' THEN 'Bungalow'
                WHEN LOWER(TRIM(u.unit_type)) = 'plot' THEN 'Plot'
                WHEN LOWER(TRIM(u.unit_type)) = 'bungalow' THEN 'Bungalow'
                ELSE TRIM(u.unit_type)
              END
          ),
          (
            SELECT MAX(r3.id)
            FROM maintenance_rates r3
            WHERE r3.project_id = u.project_id
              AND r3.financial_year = ?
              AND r3.unit_type = 'All'
          )
        )
        ${unitFilterClause}
      `
      queryParams = [financialYear, financialYear, ...params]
    } else {
      // Simple query without unit type matching
      let unitFilterClause = 'WHERE u.project_id = ?'
      const params: (string | number | undefined | null)[] = [projectId]
      
      if (unitIds && unitIds.length > 0) {
        unitFilterClause += ` AND u.id IN (${unitIds.map(() => '?').join(',')})`
        params.push(...unitIds)
      }

      querySql = `
        SELECT
          u.id,
          u.area_sqft,
          r.rate_per_sqft,
          COALESCE(
            (
              SELECT MAX(s.discount_percentage)
              FROM maintenance_slabs s
              WHERE s.rate_id = r.id AND s.is_early_payment = 1
            ),
            0
          ) as discount_percentage
        FROM units u
        JOIN maintenance_rates r ON r.id = (
          SELECT MAX(r2.id)
          FROM maintenance_rates r2
          WHERE r2.project_id = u.project_id
            AND r2.financial_year = ?
        )
        ${unitFilterClause}
      `
      queryParams = [financialYear, ...params]
    }

    const units = dbService.query<{
      id: number
      area_sqft: number
      rate_per_sqft: number
      discount_percentage?: number
    }>(querySql, queryParams)

    if (units.length === 0) {
      let rateTypes = 'None'
      if (hasRatesUnitType) {
        const existingRates = dbService.query<{ unit_type: string | null }>(
          'SELECT unit_type FROM maintenance_rates WHERE project_id = ? AND financial_year = ?',
          [projectId, financialYear]
        )
        rateTypes = existingRates.map((r) => r.unit_type || '(blank)').join(', ') || 'None'
      } else {
        const rateCount =
          dbService.get<{ count: number }>(
            'SELECT COUNT(*) as count FROM maintenance_rates WHERE project_id = ? AND financial_year = ?',
            [projectId, financialYear]
          )?.count || 0
        rateTypes = rateCount > 0 ? 'Legacy rates (unit type unavailable)' : 'None'
      }

      throw new Error(
        `No units matched the available maintenance rates. Rates found for: ${rateTypes || 'None'}. Please ensure maintenance rates are set for all unit types used in the project (for example Plot, Bungalow, Garden).`
      )
    }

    return dbService.transaction(() => {
      const totalAddOns = addOns.reduce((sum, addon) => sum + addon.addon_amount, 0)
      for (const unit of units) {
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
          )?.total || 0

        const baseAmount = unit.area_sqft * unit.rate_per_sqft
        const discountAmount = (baseAmount * (unit.discount_percentage || 0)) / 100

        const arrears = previousOutstanding // Keep negative values to allow advance payments to reduce final amount
        const finalAmount = Math.max(0, baseAmount + arrears + totalAddOns - discountAmount)

        dbService.run(
          `
          INSERT INTO maintenance_letters (
            project_id, unit_id, financial_year, base_amount, arrears, discount_amount, 
            final_amount, due_date, status, is_paid, is_sent, generated_date
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Pending', 0, 0, ?)
          ON CONFLICT(unit_id, financial_year) DO UPDATE SET
            base_amount = excluded.base_amount,
            arrears = excluded.arrears,
            discount_amount = excluded.discount_amount,
            final_amount = excluded.final_amount,
            due_date = excluded.due_date,
            generated_date = excluded.generated_date,
            status = CASE
              WHEN COALESCE(
                (
                  SELECT SUM(payment_amount)
                  FROM payments
                  WHERE letter_id = maintenance_letters.id
                     OR (
                       letter_id IS NULL
                       AND unit_id = maintenance_letters.unit_id
                       AND TRIM(COALESCE(financial_year, '')) = TRIM(maintenance_letters.financial_year)
                     )
                ),
                0
              ) + 0.01 >= excluded.final_amount THEN 'Paid'
              ELSE 'Pending'
            END,
            is_paid = CASE
              WHEN COALESCE(
                (
                  SELECT SUM(payment_amount)
                  FROM payments
                  WHERE letter_id = maintenance_letters.id
                     OR (
                       letter_id IS NULL
                       AND unit_id = maintenance_letters.unit_id
                       AND TRIM(COALESCE(financial_year, '')) = TRIM(maintenance_letters.financial_year)
                     )
                ),
                0
              ) + 0.01 >= excluded.final_amount THEN 1
              ELSE 0
            END
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
            letterDate
          ]
        )

        const existing = dbService.get<{ id: number }>(
          'SELECT id FROM maintenance_letters WHERE unit_id = ? AND financial_year = ?',
          [unit.id, financialYear]
        )
        if (!existing) {
          throw new Error(`Failed to persist maintenance letter for unit ${unit.id}`)
        }
        const letterId = existing.id

        // Clear old add-ons if it was an update
        dbService.run('DELETE FROM add_ons WHERE letter_id = ?', [letterId])

        for (const addon of addOns) {
          dbService.run(
            `
            INSERT INTO add_ons (letter_id, addon_name, addon_amount)
            VALUES (?, ?, ?)
          `,
            [letterId, addon.addon_name, addon.addon_amount]
          )
        }

        this.syncMaintenanceLetterStatus(letterId)
      }
      return true
    })
  }

  public getAll(): MaintenanceLetter[] {
    this.syncAllMaintenanceLetterStatuses()
    return dbService.query<MaintenanceLetter>(`
      SELECT l.*, u.unit_number, u.owner_name, u.unit_type, p.name as project_name,
             COALESCE((SELECT SUM(addon_amount) FROM add_ons WHERE letter_id = l.id), 0) as add_ons_total
      FROM maintenance_letters l
      JOIN units u ON l.unit_id = u.id
      JOIN projects p ON l.project_id = p.id
      ORDER BY l.financial_year DESC, u.unit_number ASC
    `)
  }

  public getById(id: number): MaintenanceLetter | undefined {
    this.syncMaintenanceLetterStatus(id)
    return dbService.get<MaintenanceLetter>(
      `
      SELECT l.*, u.unit_number, u.owner_name, p.name as project_name,
             COALESCE((SELECT SUM(addon_amount) FROM add_ons WHERE letter_id = l.id), 0) as add_ons_total
      FROM maintenance_letters l
      JOIN units u ON l.unit_id = u.id
      JOIN projects p ON l.project_id = p.id
      WHERE l.id = ?
    `,
      [id]
    )
  }

  public getAddOns(letterId: number): AddOn[] {
    return dbService.query<AddOn>('SELECT * FROM add_ons WHERE letter_id = ?', [letterId])
  }

  public getAllAddOns(): (AddOn & {
    unit_id: number
    financial_year: string
    unit_number?: string
    owner_name?: string
    project_id?: number
  })[] {
    return dbService.query<
      AddOn & {
        unit_id: number
        financial_year: string
        unit_number?: string
        owner_name?: string
        project_id?: number
      }
    >(`
      SELECT a.*, l.unit_id, l.financial_year, l.project_id, u.unit_number, u.owner_name
      FROM add_ons a
      JOIN maintenance_letters l ON a.letter_id = l.id
      JOIN units u ON l.unit_id = u.id
    `)
  }

  public delete(id: number): boolean {
    try {
      const result = dbService.run('DELETE FROM maintenance_letters WHERE id = ?', [id])
      return result.changes > 0
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(`Error deleting maintenance letter ${id}:`, message)
      throw error
    }
  }

  public bulkDelete(ids: number[]): boolean {
    return dbService.transaction(() => {
      let allDeleted = true
      for (const id of ids) {
        if (!this.delete(id)) {
          allDeleted = false
        }
      }
      return allDeleted
    })
  }

  public addAddOn(params: {
    unit_id: number
    financial_year: string
    addon_name: string
    addon_amount: number
    remarks?: string
  }): boolean {
    return dbService.transaction(() => {
      // 1. Find the letter
      const letter = dbService.get<{
        id: number
        base_amount: number
        arrears: number
        discount_amount: number
      }>(
        'SELECT id, base_amount, arrears, discount_amount FROM maintenance_letters WHERE unit_id = ? AND financial_year = ?',
        [params.unit_id, params.financial_year]
      )

      if (!letter) {
        throw new Error(
          'Maintenance Letter not found for this Unit and Financial Year. Please generate the letter first.'
        )
      }

      // 2. Insert Add-on
      dbService.run(
        'INSERT INTO add_ons (letter_id, addon_name, addon_amount, remarks) VALUES (?, ?, ?, ?)',
        [letter.id, params.addon_name, params.addon_amount, params.remarks || '']
      )

      // 3. Recalculate Letter Total
      const addOnsTotal = this.calculateAddOnsTotal(letter.id)

      const finalAmount = Math.max(
        0,
        letter.base_amount + letter.arrears + addOnsTotal - letter.discount_amount
      )

      dbService.run('UPDATE maintenance_letters SET final_amount = ? WHERE id = ?', [
        finalAmount,
        letter.id
      ])
      this.syncMaintenanceLetterStatus(letter.id)

      return true
    })
  }

  public deleteAddOn(id: number): boolean {
    return dbService.transaction(() => {
      // 1. Get Add-on to find letter_id
      const addon = dbService.get<{ letter_id: number }>(
        'SELECT letter_id FROM add_ons WHERE id = ?',
        [id]
      )

      if (!addon) {
        throw new Error('Add-on not found')
      }

      // 2. Delete Add-on
      dbService.run('DELETE FROM add_ons WHERE id = ?', [id])

      // 3. Recalculate Letter Total
      const letter = dbService.get<{
        base_amount: number
        arrears: number
        discount_amount: number
      }>('SELECT base_amount, arrears, discount_amount FROM maintenance_letters WHERE id = ?', [
        addon.letter_id
      ])

      if (letter) {
        const addOnsTotal = this.calculateAddOnsTotal(addon.letter_id)

        const finalAmount = Math.max(
          0,
          letter.base_amount + letter.arrears + addOnsTotal - letter.discount_amount
        )

        dbService.run('UPDATE maintenance_letters SET final_amount = ? WHERE id = ?', [
          finalAmount,
          addon.letter_id
        ])
        this.syncMaintenanceLetterStatus(addon.letter_id)
      }

      return true
    })
  }
}

export const maintenanceLetterService = new MaintenanceLetterService()
