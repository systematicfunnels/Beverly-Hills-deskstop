import { dbService } from '../db/database'
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'
import fs from 'fs'
import path from 'path'
import { app } from 'electron'

export interface Payment {
  id?: number
  project_id: number
  unit_id: number
  letter_id?: number
  payment_date: string
  payment_amount: number
  payment_mode: string // Cash, Cheque, UPI
  cheque_number?: string
  remarks?: string
  payment_status?: string // Received, Pending
  created_at?: string
  unit_number?: string
  owner_name?: string
  project_name?: string
  receipt_number?: string
  financial_year?: string
}

export interface Receipt {
  id?: number
  payment_id: number
  receipt_number: string
  receipt_date: string
}

class PaymentService {
  private updateLetterStatus(letterId: number): void {
    const letter = dbService.get<{
      id: number
      final_amount: number
      unit_id: number
      financial_year: string
    }>(
      'SELECT id, final_amount, unit_id, financial_year FROM maintenance_letters WHERE id = ?',
      [letterId]
    )
    if (!letter) return

    // Calculate total payments for this specific letter
    const letterPayments = dbService.get<{ total: number }>(
      'SELECT COALESCE(SUM(payment_amount), 0) as total FROM payments WHERE letter_id = ?',
      [letterId]
    )?.total || 0

    // Calculate payments without letter_id but matching unit and financial year
    const unlinkedPayments = dbService.get<{ total: number }>(
      `SELECT COALESCE(SUM(payment_amount), 0) as total
       FROM payments 
       WHERE letter_id IS NULL 
         AND unit_id = ? 
         AND TRIM(COALESCE(financial_year, '')) = TRIM(?)`,
      [letter.unit_id, letter.financial_year]
    )?.total || 0

    const totalPaid = letterPayments + unlinkedPayments
    const isPaid = totalPaid + 0.01 >= letter.final_amount
    
    dbService.run('UPDATE maintenance_letters SET status = ?, is_paid = ? WHERE id = ?', [
      isPaid ? 'Paid' : 'Pending',
      isPaid ? 1 : 0,
      letterId
    ])
  }

  private updateLetterStatusByUnitYear(unitId: number, financialYear?: string): void {
    if (!financialYear) return
    const letter = dbService.get<{ id: number }>(
      'SELECT id FROM maintenance_letters WHERE unit_id = ? AND TRIM(financial_year) = TRIM(?)',
      [unitId, financialYear]
    )
    if (!letter) return
    this.updateLetterStatus(letter.id)
  }

  public async generateReceiptPdf(paymentId: number): Promise<string> {
    const payment = dbService.get<Payment>(
      `
      SELECT p.*, u.unit_number, u.owner_name, pr.name as project_name, r.receipt_number
      FROM payments p
      JOIN units u ON p.unit_id = u.id
      JOIN projects pr ON p.project_id = pr.id
      LEFT JOIN receipts r ON p.id = r.payment_id
      WHERE p.id = ?
    `,
      [paymentId]
    )

    if (!payment) throw new Error('Payment not found')

    const pdfDoc = await PDFDocument.create()
    const page = pdfDoc.addPage([595.28, 420.94]) // A5 Landscape-ish
    const { width, height } = page.getSize()
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

    // Header
    page.drawRectangle({
      x: 0,
      y: height - 60,
      width: width,
      height: 60,
      color: rgb(0.17, 0.48, 0.37)
    })

    page.drawText(payment.project_name?.toUpperCase() || 'MAINTENANCE RECEIPT', {
      x: 30,
      y: height - 40,
      size: 18,
      font: boldFont,
      color: rgb(1, 1, 1)
    })

    page.drawText('PAYMENT RECEIPT', {
      x: width - 150,
      y: height - 40,
      size: 12,
      font: boldFont,
      color: rgb(1, 1, 1)
    })

    // Details
    let currentY = height - 100
    page.drawText(`Receipt No: ${payment.receipt_number || 'N/A'}`, {
      x: 30,
      y: currentY,
      size: 10,
      font: boldFont
    })
    page.drawText(`Date: ${payment.payment_date}`, {
      x: width - 150,
      y: currentY,
      size: 10,
      font
    })

    currentY -= 40
    page.drawText('Received with thanks from:', {
      x: 30,
      y: currentY,
      size: 10,
      font
    })
    page.drawText(payment.owner_name || 'N/A', {
      x: 180,
      y: currentY,
      size: 11,
      font: boldFont
    })
    page.drawLine({
      start: {
        x: 175,
        y: currentY - 2
      },
      end: {
        x: width - 30,
        y: currentY - 2
      }
    })

    currentY -= 30
    page.drawText('Unit Number:', {
      x: 30,
      y: currentY,
      size: 10,
      font
    })
    page.drawText(payment.unit_number || 'N/A', {
      x: 180,
      y: currentY,
      size: 11,
      font: boldFont
    })
    page.drawLine({
      start: {
        x: 175,
        y: currentY - 2
      },
      end: {
        x: width - 30,
        y: currentY - 2
      }
    })

    currentY -= 30
    page.drawText('The sum of Rupees:', {
      x: 30,
      y: currentY,
      size: 10,
      font
    })
    page.drawText(`Rs. ${payment.payment_amount.toFixed(2)}`, {
      x: 180,
      y: currentY,
      size: 11,
      font: boldFont
    })
    page.drawLine({
      start: {
        x: 175,
        y: currentY - 2
      },
      end: {
        x: width - 30,
        y: currentY - 2
      }
    })

    currentY -= 30
    page.drawText('Payment Mode:', {
      x: 30,
      y: currentY,
      size: 10,
      font
    })
    page.drawText(
      `${payment.payment_mode} ${payment.cheque_number ? `(${payment.cheque_number})` : ''}`,
      {
        x: 180,
        y: currentY,
        size: 10,
        font
      }
    )
    page.drawLine({
      start: {
        x: 175,
        y: currentY - 2
      },
      end: {
        x: width - 30,
        y: currentY - 2
      }
    })

    if (payment.remarks) {
      currentY -= 30
      page.drawText('Remarks:', {
        x: 30,
        y: currentY,
        size: 10,
        font
      })
      page.drawText(payment.remarks, {
        x: 180,
        y: currentY,
        size: 10,
        font
      })
      page.drawLine({
        start: {
          x: 175,
          y: currentY - 2
        },
        end: {
          x: width - 30,
          y: currentY - 2
        }
      })
    }

    // Footer / Sign
    currentY = 50
    page.drawText("Receiver's Signature", {
      x: width - 150,
      y: currentY,
      size: 10,
      font: boldFont
    })
    page.drawLine({
      start: {
        x: width - 160,
        y: currentY + 15
      },
      end: {
        x: width - 30,
        y: currentY + 15
      }
    })

    const pdfBytes = await pdfDoc.save()
    const pdfDir = path.join(app.getPath('userData'), 'receipts')
    if (!fs.existsSync(pdfDir)) fs.mkdirSync(pdfDir)

    const fileName = `Receipt_${payment.receipt_number || paymentId}.pdf`
    const filePath = path.join(pdfDir, fileName)
    fs.writeFileSync(filePath, pdfBytes)

    return filePath
  }

  public getAll(): Payment[] {
    return dbService.query<Payment>(`
      SELECT p.*, u.unit_number, u.owner_name, pr.name as project_name, r.receipt_number,
             COALESCE(p.financial_year, l.financial_year) as financial_year
      FROM payments p
      JOIN units u ON p.unit_id = u.id
      JOIN projects pr ON p.project_id = pr.id
      LEFT JOIN receipts r ON p.id = r.payment_id
      LEFT JOIN maintenance_letters l ON p.letter_id = l.id
      ORDER BY p.payment_date DESC, p.id DESC
    `)
  }

  public getById(id: number): Payment | undefined {
    return dbService.get<Payment>(
      `
      SELECT p.*, u.unit_number, u.owner_name, pr.name as project_name, r.receipt_number,
             COALESCE(p.financial_year, l.financial_year) as financial_year
      FROM payments p
      JOIN units u ON p.unit_id = u.id
      JOIN projects pr ON p.project_id = pr.id
      LEFT JOIN receipts r ON p.id = r.payment_id
      LEFT JOIN maintenance_letters l ON p.letter_id = l.id
      WHERE p.id = ?
    `,
      [id]
    )
  }

  public create(payment: Payment): number {
    return dbService.transaction(() => {
      let resolvedLetterId = payment.letter_id
      let resolvedFinancialYear = payment.financial_year

      // Validate and resolve financial year
      if (!resolvedFinancialYear) {
        // If no financial year provided, try to get it from the letter
        if (resolvedLetterId) {
          resolvedFinancialYear = dbService.get<{ financial_year: string }>(
            'SELECT financial_year FROM maintenance_letters WHERE id = ?',
            [resolvedLetterId]
          )?.financial_year
        }
        
        // If still no financial year, try to get it from the unit's latest letter
        if (!resolvedFinancialYear) {
          resolvedFinancialYear = dbService.get<{ financial_year: string }>(
            'SELECT financial_year FROM maintenance_letters WHERE unit_id = ? ORDER BY financial_year DESC LIMIT 1',
            [payment.unit_id]
          )?.financial_year
        }
        
        // If still no financial year, use current financial year
        if (!resolvedFinancialYear) {
          const currentYear = new Date().getMonth() < 3 ? new Date().getFullYear() - 1 : new Date().getFullYear()
          resolvedFinancialYear = `${currentYear}-${(currentYear + 1).toString().slice(2)}`
        }
      }

      // Validate and resolve letter ID
      if (!resolvedLetterId && resolvedFinancialYear) {
        resolvedLetterId = dbService.get<{ id: number }>(
          'SELECT id FROM maintenance_letters WHERE unit_id = ? AND TRIM(financial_year) = TRIM(?)',
          [payment.unit_id, resolvedFinancialYear]
        )?.id
      }

      // Validate financial year format
      if (!resolvedFinancialYear || !resolvedFinancialYear.match(/^\d{4}-\d{2}$/)) {
        throw new Error('Invalid or missing financial year. Please provide a valid financial year (e.g., 2024-25).')
      }

      const result = dbService.run(
        `INSERT INTO payments (
          project_id, unit_id, letter_id, financial_year, payment_date, payment_amount, 
          payment_mode, cheque_number, remarks, payment_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          payment.project_id,
          payment.unit_id,
          resolvedLetterId,
          resolvedFinancialYear,
          payment.payment_date,
          payment.payment_amount,
          payment.payment_mode,
          payment.cheque_number,
          payment.remarks,
          payment.payment_status || 'Received'
        ]
      )

      const paymentId = result.lastInsertRowid as number

      // Automatically generate a receipt number if not provided
      if (payment.payment_status !== 'Pending') {
        const receiptNumber = payment.receipt_number || `REC-${paymentId}`
        dbService.run(
          `INSERT INTO receipts (payment_id, receipt_number, receipt_date)
           VALUES (?, ?, ?)`,
          [paymentId, receiptNumber, payment.payment_date]
        )
      }

      if (resolvedLetterId) {
        this.updateLetterStatus(resolvedLetterId)
      } else {
        this.updateLetterStatusByUnitYear(payment.unit_id, resolvedFinancialYear)
      }

      return paymentId
    })
  }

  public delete(id: number): boolean {
    return dbService.transaction(() => {
      try {
        const payment = dbService.get<Payment>('SELECT * FROM payments WHERE id = ?', [id])
        const result = dbService.run('DELETE FROM payments WHERE id = ?', [id])

        if (result.changes > 0 && payment) {
          if (payment.letter_id) {
            this.updateLetterStatus(payment.letter_id)
          } else {
            this.updateLetterStatusByUnitYear(payment.unit_id, payment.financial_year)
          }
        }

        return result.changes > 0
      } catch (error) {
        console.error(`Error deleting payment ${id}:`, error)
        throw error
      }
    })
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

export const paymentService = new PaymentService()
