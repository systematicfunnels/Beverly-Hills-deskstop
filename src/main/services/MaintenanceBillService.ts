import { dbService } from '../db/database'
import { PDFDocument, rgb, StandardFonts, PDFPage, PDFFont } from 'pdf-lib'
import fs from 'fs'
import path from 'path'
import { app } from 'electron'

export interface MaintenanceBill {
  id?: number
  project_id: number
  unit_id: number
  year: string
  maintenance: number
  na_tax: number
  rd_na: number
  cable: number
  other_charges: number
  penalty: number
  discount: number
  year_total: number
  due_date?: string
  status: string // Generated, Modified, Paid
  pdf_path?: string
  generated_date?: string
  unit_number?: string
  plot?: string
  bungalow?: string
  owner_name?: string
  project_name?: string
  bank_name?: string
  account_no?: string
  ifsc_code?: string
}

class MaintenanceBillService {
  public async generatePdf(billId: number): Promise<string> {
    const bill = dbService.get<
      MaintenanceBill & { letterhead_path?: string; qr_code_path?: string }
    >(
      `
      SELECT l.*, u.unit_number, u.owner_name, u.plot, u.bungalow, p.name as project_name, p.bank_name, p.account_no, p.ifsc_code, p.letterhead_path, p.qr_code_path
      FROM unit_maintenance_bills l
      JOIN units u ON l.unit_id = u.id
      JOIN projects p ON l.project_id = p.id
      WHERE l.id = ?
    `,
      [billId]
    )

    if (!bill) throw new Error('Maintenance Bill not found')

    const pdfDoc = await PDFDocument.create()
    const page = pdfDoc.addPage([595.28, 841.89]) // A4 size
    const { width, height } = page.getSize()
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

    // Header with "Letterhead" feel
    if (bill.letterhead_path) {
      try {
        const letterheadBytes = await fs.promises.readFile(bill.letterhead_path)
        const letterheadImage = await pdfDoc.embedPng(letterheadBytes)
        page.drawImage(letterheadImage, {
          x: 0,
          y: height - 100,
          width: width,
          height: 100
        })
      } catch (e) {
        console.error('Failed to embed letterhead', e)
        this.drawDefaultHeader(
          page,
          width,
          height,
          bill.project_name || 'MAINTENANCE BILL',
          boldFont,
          font
        )
      }
    } else {
      this.drawDefaultHeader(
        page,
        width,
        height,
        bill.project_name || 'MAINTENANCE BILL',
        boldFont,
        font
      )
    }

    // Premium Tag
    page.drawRectangle({
      x: width - 120,
      y: height - 40,
      width: 100,
      height: 20,
      color: rgb(0.85, 0.65, 0.13) // Gold color
    })
    page.drawText('PREMIUM SYSTEM', {
      x: width - 110,
      y: height - 33,
      size: 8,
      font: boldFont,
      color: rgb(1, 1, 1)
    })

    // QR Code support
    if (bill.qr_code_path) {
      try {
        const qrBytes = await fs.promises.readFile(bill.qr_code_path)
        const qrImage = await pdfDoc.embedPng(qrBytes)
        page.drawImage(qrImage, {
          x: 450,
          y: height - 200,
          width: 80,
          height: 80
        })
        page.drawText('Scan to Pay', { x: 460, y: height - 215, size: 8, font })
      } catch (e) {
        console.error('Failed to embed QR code', e)
      }
    }

    // Bill details box
    const detailsY = height - 150
    page.drawText(`BILL NO: MB-${bill.id}`, { x: 50, y: detailsY - 60, size: 10, font: boldFont })
    page.drawText(`DATE: ${bill.generated_date?.split(' ')[0] || ''}`, {
      x: 50,
      y: detailsY - 75,
      size: 10,
      font
    })
    page.drawText(`DUE DATE: ${bill.due_date || 'N/A'}`, {
      x: 50,
      y: detailsY - 90,
      size: 10,
      font,
      color: rgb(0.8, 0, 0)
    })

    // Unit Details
    page.drawText('TO:', { x: 300, y: detailsY - 60, size: 10, font: boldFont })
    page.drawText(`${bill.owner_name}`, { x: 300, y: detailsY - 75, size: 12, font: boldFont })
    page.drawText(`Unit No: ${bill.unit_number}`, { x: 300, y: detailsY - 90, size: 10, font })
    if (bill.plot)
      page.drawText(`Plot: ${bill.plot}`, { x: 300, y: detailsY - 105, size: 10, font })
    if (bill.bungalow)
      page.drawText(`Bungalow: ${bill.bungalow}`, { x: 300, y: detailsY - 120, size: 10, font })

    // Billing Period
    page.drawText(`Financial Year: ${bill.year}`, {
      x: 50,
      y: detailsY - 120,
      size: 10,
      font: boldFont
    })

    // Table Header
    const tableY = height - 320
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
    const items = [{ desc: 'Annual Maintenance Charges', amt: bill.maintenance }]

    if (bill.na_tax > 0) items.push({ desc: 'NA Tax', amt: bill.na_tax })
    if (bill.rd_na > 0) items.push({ desc: 'Rd & NA Charges', amt: bill.rd_na })
    if (bill.cable > 0) items.push({ desc: 'Cable Charges', amt: bill.cable })
    if (bill.other_charges > 0) items.push({ desc: 'Other Charges', amt: bill.other_charges })
    if (bill.penalty > 0) items.push({ desc: 'Penalty/Interest', amt: bill.penalty })
    if (bill.discount > 0) items.push({ desc: 'Early Payment Discount', amt: -bill.discount })

    items.forEach((item) => {
      page.drawText(item.desc, { x: 60, y: currentY, size: 10, font })
      page.drawText(item.amt.toFixed(2), { x: 450, y: currentY, size: 10, font })
      currentY -= 20
    })

    // Total
    page.drawLine({ start: { x: 50, y: currentY + 10 }, end: { x: 550, y: currentY + 10 } })
    page.drawText('Total Amount Payable', { x: 60, y: currentY - 5, size: 12, font: boldFont })
    page.drawText(`Rs. ${bill.year_total.toFixed(2)}`, {
      x: 450,
      y: currentY - 5,
      size: 12,
      font: boldFont
    })

    // Amount in Words (simple placeholder for now)
    currentY -= 30
    page.drawText(`Amount in words: Rupees ${this.numberToWords(bill.year_total)} Only`, {
      x: 60,
      y: currentY,
      size: 9,
      font
    })

    // Digital Signature Section
    currentY -= 60
    const signatureY = currentY

    page.drawText('Digitally Signed By:', { x: 400, y: signatureY + 35, size: 9, font })
    page.drawText('AUTHORIZED SIGNATORY', { x: 400, y: signatureY - 25, size: 10, font: boldFont })
    page.drawText('BEVERLY HILLS MANAGEMENT', {
      x: 400,
      y: signatureY - 40,
      size: 8,
      font: boldFont,
      color: rgb(0.17, 0.48, 0.37)
    })

    // Bank Details
    currentY = signatureY
    page.drawText('Bank Details for Payment:', {
      x: 50,
      y: currentY + 35,
      size: 10,
      font: boldFont
    })
    page.drawText(`Bank: ${bill.bank_name || 'N/A'}`, { x: 50, y: currentY + 20, size: 9, font })
    page.drawText(`A/C No: ${bill.account_no || 'N/A'}`, { x: 50, y: currentY + 5, size: 9, font })
    page.drawText(`IFSC: ${bill.ifsc_code || 'N/A'}`, { x: 50, y: currentY - 10, size: 9, font })

    // Footer
    page.drawText(
      'Note: This is a computer-generated document and does not require a physical signature.',
      {
        x: width / 2 - 180,
        y: 30,
        size: 8,
        font,
        color: rgb(0.5, 0.5, 0.5)
      }
    )

    const pdfBytes = await pdfDoc.save()
    const pdfDir = path.join(app.getPath('userData'), 'maintenance_bills')

    try {
      await fs.promises.access(pdfDir)
    } catch {
      await fs.promises.mkdir(pdfDir, { recursive: true })
    }

    const unitNum = bill.unit_number || 'UNKNOWN'
    const fileName = `MB_${bill.id}_${unitNum.replace(/\s+/g, '_')}.pdf`
    const filePath = path.join(pdfDir, fileName)
    await fs.promises.writeFile(filePath, pdfBytes)

    dbService.run('UPDATE unit_maintenance_bills SET pdf_path = ? WHERE id = ?', [filePath, billId])
    return filePath
  }

  private drawDefaultHeader(
    page: PDFPage,
    width: number,
    height: number,
    projectName: string,
    boldFont: PDFFont,
    font: PDFFont
  ): void {
    page.drawRectangle({
      x: 0,
      y: height - 100,
      width: width,
      height: 100,
      color: rgb(0.17, 0.48, 0.37) // Brand color #2D7A5E
    })

    page.drawText(projectName.toUpperCase(), {
      x: 50,
      y: height - 50,
      size: 24,
      font: boldFont,
      color: rgb(1, 1, 1)
    })

    page.drawText('RESIDENTIAL MAINTENANCE BILL', {
      x: 50,
      y: height - 80,
      size: 12,
      font: font,
      color: rgb(0.9, 0.9, 0.9)
    })
  }

  private numberToWords(num: number): string {
    // Basic implementation for now
    const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine']
    const tens = [
      '',
      '',
      'Twenty',
      'Thirty',
      'Forty',
      'Fifty',
      'Sixty',
      'Seventy',
      'Eighty',
      'Ninety'
    ]
    const teens = [
      'Ten',
      'Eleven',
      'Twelve',
      'Thirteen',
      'Fourteen',
      'Fifteen',
      'Sixteen',
      'Seventeen',
      'Eighteen',
      'Nineteen'
    ]

    const convert = (n: number): string => {
      if (n < 10) return ones[n]
      if (n < 20) return teens[n - 10]
      if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 !== 0 ? ' ' + ones[n % 10] : '')
      if (n < 1000)
        return (
          ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 !== 0 ? ' and ' + convert(n % 100) : '')
        )
      if (n < 100000)
        return (
          convert(Math.floor(n / 1000)) +
          ' Thousand' +
          (n % 1000 !== 0 ? ' ' + convert(n % 1000) : '')
        )
      return n.toString()
    }

    const whole = Math.floor(num)
    const fraction = Math.round((num - whole) * 100)

    let res = convert(whole)
    if (fraction > 0) {
      res += ' and ' + convert(fraction) + ' Paise'
    }
    return res
  }

  public createBatch(
    projectId: number,
    year: string,
    billDate: string,
    dueDate: string,
    additionalCharges: {
      na_tax: number
      rd_na: number
      cable: number
      other_charges: number
      penalty: number
    } = { na_tax: 0, rd_na: 0, cable: 0, other_charges: 0, penalty: 0 },
    customRate?: number
  ): void {
    // 1. Get units for the project
    console.log(`Searching for units for Project ID: ${projectId} (Type: ${typeof projectId})`)

    // Ensure projectId is a number if it's supposed to be
    const pid = Number(projectId)

    // Allow Active, Occupied, and Vacant statuses (case-insensitive)
    const unitsList = dbService.query<{
      id: number
      unit_number: string
      owner_name: string
      area_sqft: number
      unit_type: string
      bungalow?: string
      status: string
    }>(
      "SELECT * FROM units WHERE project_id = ? AND (LOWER(status) IN ('active', 'occupied', 'vacant'))",
      [pid]
    )
    console.log(`Found ${unitsList.length} units for project ${pid}`)

    if (unitsList.length === 0) {
      // Diagnostic: check if ANY units exist for this project
      const allUnitsCount = dbService.get<{ count: number }>(
        'SELECT count(*) as count FROM units WHERE project_id = ?',
        [pid]
      )

      // Even deeper diagnostic: check what projects HAVE units
      const projectsWithUnits = dbService.query<{ project_id: number; count: number }>(
        'SELECT project_id, count(*) as count FROM units GROUP BY project_id'
      )
      console.log('Projects that actually have units:', projectsWithUnits)

      const allProjects = dbService.query<{ id: number; name: string }>(
        'SELECT id, name FROM projects'
      )
      console.log('All available projects:', allProjects)

      // Check for units with NULL or invalid project_id
      const orphanedUnits = dbService.get<{ count: number }>(
        'SELECT count(*) as count FROM units WHERE project_id IS NULL OR project_id NOT IN (SELECT id FROM projects)'
      )

      console.log(
        `Diagnostic - Total units for project ${pid}: ${allUnitsCount?.count}, Orphaned units: ${orphanedUnits?.count}`
      )

      const projectName = allProjects.find((p) => p.id === pid)?.name || 'Unknown'

      // If units exist but not in valid status, warn the user
      if ((allUnitsCount?.count || 0) > 0) {
        throw new Error(`Units exist for Project "${projectName}" (ID: ${pid}) but none have valid statuses.
          
          Found ${allUnitsCount?.count} units, but they might have statuses other than 'Active', 'Occupied', or 'Vacant'.
          
          To fix this:
          1. Go to "Units" page.
          2. Check the "Status" column for your units.
          3. Update status to "Occupied" or "Vacant".`)
      }

      throw new Error(`No units found for Project "${projectName}" (ID: ${pid}). 
        Total units in DB for this project: ${allUnitsCount?.count || 0}. 
        Orphaned units (no project): ${orphanedUnits?.count || 0}.
        Eligible statuses are: Active, Occupied, Vacant.
        
        To fix this:
        1. Go to "Units" page.
        2. Ensure units have a valid status (Occupied or Vacant).
        3. Check if units are assigned to the correct project.`)
    }

    // 2. Get maintenance rate for the year
    let ratePerSqft = customRate
    let discountPercentage = 0

    if (!ratePerSqft) {
      const rateEntry = dbService.get<{ id: number; rate_per_sqft: number }>(
        'SELECT * FROM maintenance_rates WHERE project_id = ? AND financial_year = ?',
        [projectId, year]
      )

      if (!rateEntry) {
        throw new Error(`No maintenance rate found for Project ID ${projectId} and Financial Year ${year}. 
        
        To fix this:
        1. Go to "Projects" page.
        2. Click the "Rates" button for your project.
        3. Add a rate for the financial year "${year}".
        
        Alternatively, provide a "Custom Rate" in the generation window.`)
      }
      ratePerSqft = rateEntry.rate_per_sqft

      // Check for early payment discount
      const slab = dbService.get<{ discount_percentage: number }>(
        'SELECT * FROM maintenance_slabs WHERE rate_id = ? AND is_early_payment = 1',
        [rateEntry.id]
      )
      if (slab) {
        discountPercentage = slab.discount_percentage
      }
    }

    // 3. Fetch settings for bungalow multiplier
    const bungalowMultiplierSetting = dbService.get<{ value: string }>(
      'SELECT value FROM settings WHERE key = ?',
      ['bungalow_multiplier']
    )
    const bungalowMultiplier = bungalowMultiplierSetting
      ? Number(bungalowMultiplierSetting.value)
      : 1.3

    dbService.transaction(() => {
      for (const unit of unitsList) {
        let maintenance = unit.area_sqft * (ratePerSqft || 0)

        // Apply bungalow multiplier if applicable
        if (unit.unit_type === 'Bungalow' || unit.bungalow) {
          maintenance *= bungalowMultiplier
        }

        const discount = (maintenance * discountPercentage) / 100
        const year_total =
          maintenance +
          additionalCharges.na_tax +
          additionalCharges.rd_na +
          additionalCharges.cable +
          additionalCharges.other_charges +
          additionalCharges.penalty -
          discount

        dbService.run(
          `
          INSERT INTO unit_maintenance_bills (
            project_id, unit_id, year, maintenance, na_tax, rd_na, cable, other_charges, penalty, 
            discount, year_total, due_date, status, generated_date
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Generated', ?)
        `,
          [
            projectId,
            unit.id,
            year,
            maintenance,
            additionalCharges.na_tax,
            additionalCharges.rd_na,
            additionalCharges.cable,
            additionalCharges.other_charges,
            additionalCharges.penalty,
            discount,
            year_total,
            dueDate,
            billDate
          ]
        )
      }
    })
  }

  public recalculatePenalties(): void {
    const today = new Date().toISOString().split('T')[0]
    const unpaidBills = dbService.query<MaintenanceBill & { penalty_rate_setting: string | null }>(
      `
      SELECT b.*, p.value as penalty_rate_setting
      FROM unit_maintenance_bills b
      LEFT JOIN settings p ON p.key = 'penalty_rate'
      WHERE b.status != 'Paid' AND b.due_date < ?
    `,
      [today]
    )

    dbService.transaction(() => {
      for (const bill of unpaidBills) {
        if (!bill.due_date) continue

        const dueDate = new Date(bill.due_date)
        const currentDate = new Date()
        const diffTime = Math.abs(currentDate.getTime() - dueDate.getTime())
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

        const penaltyRate = bill.penalty_rate_setting
          ? Number(bill.penalty_rate_setting) / 100
          : 0.21
        // Simple interest calculation: (Maintenance * Rate * Days) / 365
        const newPenalty = ((bill.maintenance || 0) * penaltyRate * diffDays) / 365

        if (newPenalty > (bill.penalty || 0)) {
          const newTotal =
            (bill.maintenance || 0) +
            (bill.na_tax || 0) +
            (bill.rd_na || 0) +
            (bill.cable || 0) +
            (bill.other_charges || 0) +
            newPenalty -
            (bill.discount || 0)
          dbService.run(
            `
            UPDATE unit_maintenance_bills 
            SET penalty = ?, year_total = ?, status = 'Modified'
            WHERE id = ?
          `,
            [newPenalty, newTotal, bill.id]
          )
        }
      }
    })
  }

  public getAll(): MaintenanceBill[] {
    return dbService.query<MaintenanceBill>(`
      SELECT l.*, u.unit_number, u.owner_name, p.name as project_name
      FROM unit_maintenance_bills l
      JOIN units u ON l.unit_id = u.id
      JOIN projects p ON l.project_id = p.id
      ORDER BY l.id DESC
    `)
  }

  public getByUnitId(unitId: number): MaintenanceBill[] {
    return dbService.query<MaintenanceBill>(
      `
      SELECT l.*, u.unit_number, u.owner_name, p.name as project_name
      FROM unit_maintenance_bills l
      JOIN units u ON l.unit_id = u.id
      JOIN projects p ON l.project_id = p.id
      WHERE l.unit_id = ?
      ORDER BY l.year DESC
    `,
      [unitId]
    )
  }

  public getById(id: number): MaintenanceBill | undefined {
    return dbService.get<MaintenanceBill>(
      `
      SELECT l.*, u.unit_number, u.owner_name, p.name as project_name
      FROM unit_maintenance_bills l
      JOIN units u ON l.unit_id = u.id
      JOIN projects p ON l.project_id = p.id
      WHERE l.id = ?
    `,
      [id]
    )
  }

  public delete(id: number): boolean {
    return dbService.transaction(() => {
      try {
        // Delete the bill
        const result = dbService.run('DELETE FROM unit_maintenance_bills WHERE id = ?', [id])
        return result.changes > 0
      } catch (error) {
        console.error(`Error deleting maintenance bill ${id}:`, error)
        throw error
      }
    })
  }

  public bulkDelete(ids: number[]): void {
    dbService.transaction(() => {
      for (const id of ids) {
        this.delete(id)
      }
    })
  }

  public bulkCreate(bills: Record<string, unknown>[]): { success: number; skipped: number } {
    let successCount = 0
    let skippedCount = 0

    console.log(`[DEBUG] Starting bulkCreate with ${bills.length} bills`)

    // Diagnostic: Log all projects to see what IDs we have
    try {
      const allProjects = dbService.query('SELECT id, name FROM projects') as Record<
        string,
        unknown
      >[]
      console.log('[DEBUG] Available Project IDs:', allProjects.map((p) => p.id).join(', '))
    } catch (e) {
      console.error('[DEBUG] Failed to run diagnostic queries:', e)
    }

    try {
      // Use the transaction function correctly.
      // dbService.transaction(fn) in database.ts already calls the returned txn function.
      dbService.transaction(() => {
        for (const bill of bills) {
          try {
            // Ensure project_id is a number
            const projectId = Number(bill.project_id)

            if (isNaN(projectId) || projectId <= 0) {
              console.error('[DEBUG] Invalid project_id for row:', bill)
              skippedCount++
              continue
            }

            // Verify project exists in DB to avoid FK error
            const projectExists = dbService.get('SELECT id FROM projects WHERE id = ?', [projectId])
            if (!projectExists) {
              const allProjects = dbService.query('SELECT id, name FROM projects') as Record<
                string,
                unknown
              >[]
              const availableIds = allProjects.map((p) => p.id).join(', ')
              console.error(
                `[DEBUG] Project ID ${projectId} does not exist in database! Available IDs: ${availableIds}. Skipping row.`
              )
              skippedCount++
              continue
            }

            // Find unit or create it
            let unit: { id: number } | undefined = undefined
            const unitNo = (bill.unit_number || bill.unit_no) as string | undefined

            // Try to find existing unit by project_id and (plot/bungalow OR unit_number)
            if (bill.plot && bill.bungalow) {
              unit = dbService.get<{ id: number }>(
                'SELECT id FROM units WHERE project_id = ? AND plot = ? AND bungalow = ?',
                [projectId, bill.plot as string, bill.bungalow as string]
              )
            }

            if (!unit && unitNo) {
              unit = dbService.get<{ id: number }>(
                'SELECT id FROM units WHERE project_id = ? AND unit_number = ?',
                [projectId, unitNo]
              )
            }

            if (!unit) {
              console.log(
                `Creating unit: project_id=${projectId}, unit_number=${unitNo || (bill.plot as string)}`
              )
              try {
                // Ensure unit_number is not null for the constraint
                const finalUnitNumber = unitNo || (bill.plot as string) || 'Unknown'

                const result = dbService.run(
                  `
                  INSERT INTO units (
                    project_id, unit_number, plot, bungalow, owner_name, area_sqft, unit_type, status
                  ) VALUES (?, ?, ?, ?, ?, ?, ?, 'Occupied')
                `,
                  [
                    projectId,
                    finalUnitNumber,
                    (bill.plot as string) || null,
                    (bill.bungalow as string) || null,
                    (bill.owner_name as string) || 'Imported Owner',
                    (bill.area_sqft as number) || 0,
                    (bill.unit_type as string) || 'Flat'
                  ]
                )
                unit = { id: result.lastInsertRowid as number }
              } catch (insertError: unknown) {
                const errorMessage =
                  insertError instanceof Error ? insertError.message : String(insertError)
                console.error(
                  `[DEBUG] Failed to insert unit: project_id=${projectId}, unit=${unitNo}. Error: ${errorMessage}`
                )
                throw insertError // Re-throw to be caught by the outer row-level try-catch
              }
            } else {
              // Update existing unit info if needed
              // Use COALESCE to avoid overwriting with nulls if the import row is partial
              dbService.run(
                `
                UPDATE units SET 
                  owner_name = COALESCE(NULLIF(?, ''), owner_name),
                  plot = COALESCE(NULLIF(?, ''), plot),
                  bungalow = COALESCE(NULLIF(?, ''), bungalow),
                  area_sqft = CASE WHEN ? > 0 THEN ? ELSE area_sqft END
                WHERE id = ?
              `,
                [bill.owner_name, bill.plot, bill.bungalow, bill.area_sqft, bill.area_sqft, unit.id]
              )
            }

            // Upsert maintenance bill
            // IMPORTANT: unit.id must exist here. If we just created it, unit = { id: lastInsertRowid }
            if (!unit || !unit.id) {
              throw new Error(`Unit ID missing after creation/fetch for unit ${unitNo}`)
            }

            const existingBill = dbService.get<{ id: number }>(
              'SELECT id FROM unit_maintenance_bills WHERE unit_id = ? AND project_id = ? AND year = ?',
              [unit.id, projectId, (bill.year as string) || '2024-25']
            )

            // Clean maintenance values (ensure they are numbers)
            const maintenanceVal = parseFloat(String(bill.maintenance || 0))
            const rdNaVal = parseFloat(String(bill.rd_na || 0))
            const naTaxVal = parseFloat(String(bill.na_tax || 0))
            const cableVal = parseFloat(String(bill.cable || 0))
            const penaltyVal = parseFloat(String(bill.penalty || 0))
            const totalVal = parseFloat(String(bill.year_total || 0))

            if (existingBill) {
              dbService.run(
                `
                UPDATE unit_maintenance_bills SET
                  maintenance = ?, rd_na = ?, na_tax = ?, cable = ?, penalty = ?, year_total = ?
                WHERE id = ?
              `,
                [maintenanceVal, rdNaVal, naTaxVal, cableVal, penaltyVal, totalVal, existingBill.id]
              )
            } else {
              try {
                dbService.run(
                  `
                  INSERT INTO unit_maintenance_bills (
                    unit_id, project_id, year, maintenance, rd_na, na_tax, cable, penalty, year_total
                  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                `,
                  [
                    unit.id,
                    projectId,
                    (bill.year as string) || '2024-25',
                    maintenanceVal,
                    rdNaVal,
                    naTaxVal,
                    cableVal,
                    penaltyVal,
                    totalVal
                  ]
                )
              } catch (billInsertError: unknown) {
                const errorMessage =
                  billInsertError instanceof Error
                    ? billInsertError.message
                    : String(billInsertError)
                console.error(
                  `[DEBUG] Failed to insert bill: unit_id=${unit.id}, project_id=${projectId}. Error: ${errorMessage}`
                )
                throw billInsertError
              }
            }

            successCount++
          } catch (e: unknown) {
            const errorMessage = e instanceof Error ? e.message : String(e)
            console.error(
              `Error processing row: project_id=${bill.project_id}, unit=${(bill.unit_number as string) || (bill.plot as string)}. Error: ${errorMessage}`
            )
            skippedCount++
          }
        }
      })
    } catch (transactionError: unknown) {
      console.error('[DEBUG] Transaction failed in bulkCreate:', transactionError)
      // Try to get more info about why it failed (e.g., FK constraint)
      try {
        const violations = dbService.query('PRAGMA foreign_key_check')
        if (violations.length > 0) {
          console.error(
            '[DEBUG] Foreign key violations detected:',
            JSON.stringify(violations, null, 2)
          )
        }
      } catch {
        // ignore
      }
      throw transactionError // Re-throw to inform caller
    }
    console.log(`[DEBUG] BulkCreate finished: ${successCount} success, ${skippedCount} skipped`)
    return { success: successCount, skipped: skippedCount }
  }
}

export const maintenanceBillService = new MaintenanceBillService()
