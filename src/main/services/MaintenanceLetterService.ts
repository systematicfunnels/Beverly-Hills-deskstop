import { dbService } from '../db/database'
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'
import fs from 'fs'
import path from 'path'
import { app } from 'electron'

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
  status: string // Generated, Modified
  pdf_path?: string
  generated_date?: string
  unit_number?: string
  owner_name?: string
  project_name?: string
  bank_name?: string
  account_no?: string
  ifsc_code?: string
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
  public async generatePdf(letterId: number): Promise<string> {
    const letter = dbService.get<MaintenanceLetter>(
      `
      SELECT l.*, u.unit_number, u.owner_name, p.name as project_name, p.bank_name, p.account_no, p.ifsc_code
      FROM maintenance_letters l
      JOIN units u ON l.unit_id = u.id
      JOIN projects p ON l.project_id = p.id
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

    // Header with "Letterhead" feel
    page.drawRectangle({
      x: 0,
      y: height - 100,
      width: width,
      height: 100,
      color: rgb(0.17, 0.48, 0.37) // Brand color #2D7A5E
    })

    page.drawText(letter.project_name?.toUpperCase() || 'MAINTENANCE LETTER', {
      x: 50,
      y: height - 50,
      size: 24,
      font: boldFont,
      color: rgb(1, 1, 1)
    })

    page.drawText('RESIDENTIAL MAINTENANCE LETTER', {
      x: 50,
      y: height - 80,
      size: 12,
      font: font,
      color: rgb(0.9, 0.9, 0.9)
    })

    // Letter details box
    const detailsY = height - 150
    page.drawText(`LETTER NO: ML-${letter.id}`, { x: 400, y: detailsY, size: 10, font: boldFont })
    page.drawText(`DATE: ${letter.generated_date?.split(' ')[0] || ''}`, {
      x: 400,
      y: detailsY - 15,
      size: 10,
      font
    })
    page.drawText(`DUE DATE: ${letter.due_date || 'N/A'}`, {
      x: 400,
      y: detailsY - 30,
      size: 10,
      font,
      color: rgb(0.8, 0, 0)
    })

    // Unit Details
    page.drawText('TO:', { x: 50, y: detailsY, size: 10, font: boldFont })
    page.drawText(`${letter.owner_name}`, { x: 50, y: detailsY - 15, size: 12, font: boldFont })
    page.drawText(`Unit No: ${letter.unit_number}`, { x: 50, y: detailsY - 30, size: 10, font })

    // Billing Period
    page.drawText(`Financial Year: ${letter.financial_year}`, {
      x: 50,
      y: detailsY - 50,
      size: 10,
      font: boldFont
    })

    // Table Header
    const tableY = height - 260
    page.drawRectangle({ x: 50, y: tableY, width: 500, height: 25, color: rgb(0.17, 0.48, 0.37) })
    page.drawText('DESCRIPTION', {
      x: 60,
      y: tableY + 7,
      size: 10,
      font: boldFont,
      color: rgb(1, 1, 1)
    })
    page.drawText('AMOUNT (Rs.)', {
      x: 450,
      y: tableY + 7,
      size: 10,
      font: boldFont,
      color: rgb(1, 1, 1)
    })

    // Table Content
    let currentY = tableY - 25
    const items: { desc: string; amt: number }[] = []

    // Add Base Amount
    items.push({ desc: 'Annual Maintenance Charges', amt: letter.base_amount })

    // Add Arrears or Advance
    if (letter.arrears && letter.arrears !== 0) {
      if (letter.arrears > 0) {
        items.push({ desc: 'Previous Arrears', amt: letter.arrears })
      } else {
        items.push({ desc: 'Advance Payment / Credit', amt: letter.arrears })
      }
    }

    addOns.forEach((addon) => {
      items.push({ desc: addon.addon_name, amt: addon.addon_amount })
    })

    if (letter.discount_amount > 0) {
      items.push({ desc: 'Early Payment Discount', amt: -letter.discount_amount })
    }

    items.forEach((item) => {
      page.drawText(item.desc, { x: 60, y: currentY, size: 10, font })
      page.drawText(item.amt.toFixed(2), { x: 450, y: currentY, size: 10, font })
      currentY -= 20
    })

    // Total
    page.drawLine({ start: { x: 50, y: currentY + 10 }, end: { x: 550, y: currentY + 10 } })
    page.drawText('Total Amount Payable', { x: 60, y: currentY - 5, size: 12, font: boldFont })
    page.drawText(`Rs. ${letter.final_amount.toFixed(2)}`, {
      x: 450,
      y: currentY - 5,
      size: 12,
      font: boldFont
    })

    // Bank Details
    currentY -= 60
    page.drawText('Bank Details for Payment:', { x: 50, y: currentY, size: 10, font: boldFont })
    page.drawText(`Bank: ${letter.bank_name || 'N/A'}`, { x: 50, y: currentY - 15, size: 10, font })
    page.drawText(`A/C No: ${letter.account_no || 'N/A'}`, {
      x: 50,
      y: currentY - 30,
      size: 10,
      font
    })
    page.drawText(`IFSC: ${letter.ifsc_code || 'N/A'}`, { x: 50, y: currentY - 45, size: 10, font })

    // Add UPI Scanner
    const upiPath =
      'c:\\Users\\heman_naocpgi\\Documents\\Beverly-Hills-deskstop\\resources\\UPI.jpeg'
    if (fs.existsSync(upiPath)) {
      try {
        const upiImageBytes = fs.readFileSync(upiPath)
        const upiImage = await pdfDoc.embedJpg(upiImageBytes)
        // Draw image (100x100) to the right of bank details
        page.drawImage(upiImage, {
          x: 400,
          y: currentY - 80,
          width: 100,
          height: 100
        })
        page.drawText('Scan to Pay', {
          x: 420,
          y: currentY - 95,
          size: 10,
          font: boldFont
        })
      } catch (error) {
        console.error('Error embedding UPI image:', error)
      }
    }

    const pdfBytes = await pdfDoc.save()
    const pdfDir = path.join(app.getPath('userData'), 'maintenance_letters')
    if (!fs.existsSync(pdfDir)) fs.mkdirSync(pdfDir)

    const fileName = `ML_${letter.id}_${letter.unit_number}.pdf`
    const filePath = path.join(pdfDir, fileName)
    fs.writeFileSync(filePath, pdfBytes)

    dbService.run('UPDATE maintenance_letters SET pdf_path = ? WHERE id = ?', [filePath, letterId])
    return filePath
  }

  public createBatch(
    projectId: number,
    financialYear: string,
    letterDate: string,
    dueDate: string,
    addOns: { addon_name: string; addon_amount: number }[] = []
  ): boolean {
    // 1. Check if the project has units
    const projectUnits = dbService.query('SELECT id FROM units WHERE project_id = ?', [projectId])
    if (projectUnits.length === 0) {
      throw new Error(`Project has no units. Please add units before generating letters.`)
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

    const units = dbService.query<{
      id: number
      area_sqft: number
      rate_per_sqft: number
      discount_percentage?: number
    }>(
      `
      SELECT u.*, r.rate_per_sqft, s.discount_percentage, s.due_date as discount_due_date
      FROM units u
      JOIN maintenance_rates r ON u.project_id = r.project_id AND u.unit_type = r.unit_type
      LEFT JOIN maintenance_slabs s ON r.id = s.rate_id AND s.is_early_payment = 1
      WHERE u.project_id = ? AND r.financial_year = ?
    `,
      [projectId, financialYear]
    )

    if (units.length === 0) {
      // Diagnostic check: do rates exist for these unit types?
      const existingRates = dbService.query<{ unit_type: string }>(
        'SELECT unit_type FROM maintenance_rates WHERE project_id = ? AND financial_year = ?',
        [projectId, financialYear]
      )
      const rateTypes = existingRates.map((r) => r.unit_type).join(', ')

      throw new Error(
        `No units matched the available maintenance rates. Rates found for: ${rateTypes || 'None'}. Please ensure maintenance rates are set for all unit types (Flat, Bungalow, etc.).`
      )
    }

    return dbService.transaction(() => {
      for (const unit of units) {
        // Calculate Arrears from previous letters
        const previousOutstanding =
          dbService.get<{ total: number }>(
            `
          SELECT SUM(final_amount) - COALESCE((SELECT SUM(payment_amount) FROM payments WHERE unit_id = ?), 0) as total
          FROM maintenance_letters 
          WHERE unit_id = ? AND financial_year < ?
        `,
            [unit.id, unit.id, financialYear]
          )?.total || 0

        const baseAmount = unit.area_sqft * unit.rate_per_sqft
        const discountAmount = (baseAmount * (unit.discount_percentage || 0)) / 100
        let totalAddOns = 0
        addOns.forEach((a) => (totalAddOns += a.addon_amount))

        const arrears = previousOutstanding // Keep negative values to allow advance payments to reduce final amount
        const finalAmount = Math.max(0, baseAmount + arrears + totalAddOns - discountAmount)

        // Use INSERT INTO ... ON CONFLICT to preserve ID if possible
        const result = dbService.run(
          `
          INSERT INTO maintenance_letters (
            project_id, unit_id, financial_year, base_amount, arrears, discount_amount, 
            final_amount, due_date, status, is_paid, is_sent, generated_date
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Generated', 0, 0, ?)
          ON CONFLICT(unit_id, financial_year) DO UPDATE SET
            base_amount = excluded.base_amount,
            arrears = excluded.arrears,
            discount_amount = excluded.discount_amount,
            final_amount = excluded.final_amount,
            due_date = excluded.due_date,
            generated_date = excluded.generated_date,
            status = 'Generated'
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

        let letterId = result.lastInsertRowid as number

        // If it was an update, lastInsertRowid might not be the existing ID
        if (result.changes === 1 && result.lastInsertRowid === 0) {
          const existing = dbService.get<{ id: number }>(
            'SELECT id FROM maintenance_letters WHERE unit_id = ? AND financial_year = ?',
            [unit.id, financialYear]
          )
          letterId = existing!.id
        }

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
      }
      return true
    })
  }

  public getAll(): MaintenanceLetter[] {
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
}

export const maintenanceLetterService = new MaintenanceLetterService()
