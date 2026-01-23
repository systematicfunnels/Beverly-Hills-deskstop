import { dbService } from '../db/database';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import fs from 'fs';
import path from 'path';
import { app } from 'electron';

export interface Payment {
  id?: number;
  project_id: number;
  unit_id: number;
  letter_id?: number;
  payment_date: string;
  payment_amount: number;
  payment_mode: string; // Cash, Cheque, UPI
  cheque_number?: string;
  remarks?: string;
  payment_status?: string; // Received, Pending
  created_at?: string;
  unit_number?: string;
  owner_name?: string;
  project_name?: string;
  receipt_number?: string;
}

export interface Receipt {
  id?: number;
  payment_id: number;
  receipt_number: string;
  receipt_date: string;
}

class PaymentService {
  public async generateReceiptPdf(paymentId: number): Promise<string> {
    const payment = dbService.get<any>(`
      SELECT p.*, u.unit_number, u.owner_name, pr.name as project_name, r.receipt_number
      FROM payments p
      JOIN units u ON p.unit_id = u.id
      JOIN projects pr ON p.project_id = pr.id
      LEFT JOIN receipts r ON p.id = r.payment_id
      WHERE p.id = ?
    `, [paymentId]);

    if (!payment) throw new Error('Payment not found');

    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595.28, 420.94]); // A5 Landscape-ish
    const { width, height } = page.getSize();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // Header
    page.drawRectangle({
      x: 0,
      y: height - 60,
      width: width,
      height: 60,
      color: rgb(0.17, 0.48, 0.37),
    });

    page.drawText(payment.project_name?.toUpperCase() || 'MAINTENANCE RECEIPT', {
      x: 30,
      y: height - 40,
      size: 18,
      font: boldFont,
      color: rgb(1, 1, 1),
    });

    page.drawText('PAYMENT RECEIPT', {
      x: width - 150,
      y: height - 40,
      size: 12,
      font: boldFont,
      color: rgb(1, 1, 1),
    });

    // Details
    let currentY = height - 100;
    page.drawText(`Receipt No: ${payment.receipt_number || 'N/A'}`, {
      x: 30,
      y: currentY,
      size: 10,
      font: boldFont
    });
    page.drawText(`Date: ${payment.payment_date}`, {
      x: width - 150,
      y: currentY,
      size: 10,
      font
    });

    currentY -= 40;
    page.drawText('Received with thanks from:', {
      x: 30,
      y: currentY,
      size: 10,
      font
    });
    page.drawText(payment.owner_name || 'N/A', {
      x: 180,
      y: currentY,
      size: 11,
      font: boldFont
    });
    page.drawLine({
      start: {
        x: 175,
        y: currentY - 2
      },
      end: {
        x: width - 30,
        y: currentY - 2
      }
    });

    currentY -= 30;
    page.drawText('Unit Number:', {
      x: 30,
      y: currentY,
      size: 10,
      font
    });
    page.drawText(payment.unit_number || 'N/A', {
      x: 180,
      y: currentY,
      size: 11,
      font: boldFont
    });
    page.drawLine({
      start: {
        x: 175,
        y: currentY - 2
      },
      end: {
        x: width - 30,
        y: currentY - 2
      }
    });

    currentY -= 30;
    page.drawText('The sum of Rupees:', {
      x: 30,
      y: currentY,
      size: 10,
      font
    });
    page.drawText(`Rs. ${payment.payment_amount.toFixed(2)}`, {
      x: 180,
      y: currentY,
      size: 11,
      font: boldFont
    });
    page.drawLine({
      start: {
        x: 175,
        y: currentY - 2
      },
      end: {
        x: width - 30,
        y: currentY - 2
      }
    });

    currentY -= 30;
    page.drawText('Payment Mode:', {
      x: 30,
      y: currentY,
      size: 10,
      font
    });
    page.drawText(`${payment.payment_mode} ${payment.cheque_number ? `(${payment.cheque_number})` : ''}`, {
      x: 180,
      y: currentY,
      size: 10,
      font
    });
    page.drawLine({
      start: {
        x: 175,
        y: currentY - 2
      },
      end: {
        x: width - 30,
        y: currentY - 2
      }
    });

    if (payment.remarks) {
      currentY -= 30;
      page.drawText('Remarks:', {
        x: 30,
        y: currentY,
        size: 10,
        font
      });
      page.drawText(payment.remarks, {
        x: 180,
        y: currentY,
        size: 10,
        font
      });
      page.drawLine({
        start: {
          x: 175,
          y: currentY - 2
        },
        end: {
          x: width - 30,
          y: currentY - 2
        }
      });
    }

    // Footer / Sign
    currentY = 50;
    page.drawText('Receiver\'s Signature', {
      x: width - 150,
      y: currentY,
      size: 10,
      font: boldFont
    });
    page.drawLine({
      start: {
        x: width - 160,
        y: currentY + 15
      },
      end: {
        x: width - 30,
        y: currentY + 15
      }
    });

    const pdfBytes = await pdfDoc.save();
    const pdfDir = path.join(app.getPath('userData'), 'receipts');
    if (!fs.existsSync(pdfDir)) fs.mkdirSync(pdfDir);

    const fileName = `Receipt_${payment.receipt_number || paymentId}.pdf`;
    const filePath = path.join(pdfDir, fileName);
    fs.writeFileSync(filePath, pdfBytes);

    return filePath;
  }

  public getAll(): Payment[] {
    return dbService.query<Payment>(`
      SELECT p.*, u.unit_number, u.owner_name, pr.name as project_name, r.receipt_number
      FROM payments p
      JOIN units u ON p.unit_id = u.id
      JOIN projects pr ON p.project_id = pr.id
      LEFT JOIN receipts r ON p.id = r.payment_id
      ORDER BY p.payment_date DESC, p.id DESC
    `);
  }

  public getById(id: number): Payment | undefined {
    return dbService.get<Payment>(`
      SELECT p.*, u.unit_number, u.owner_name, pr.name as project_name, r.receipt_number
      FROM payments p
      JOIN units u ON p.unit_id = u.id
      JOIN projects pr ON p.project_id = pr.id
      LEFT JOIN receipts r ON p.id = r.payment_id
      WHERE p.id = ?
    `, [id]);
  }

  public create(payment: Payment): number {
    return dbService.transaction(() => {
      const result = dbService.run(
        `INSERT INTO payments (
          project_id, unit_id, letter_id, payment_date, payment_amount, 
          payment_mode, cheque_number, remarks, payment_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          payment.project_id,
          payment.unit_id,
          payment.letter_id,
          payment.payment_date,
          payment.payment_amount,
          payment.payment_mode,
          payment.cheque_number,
          payment.remarks,
          payment.payment_status || 'Received'
        ]
      );
      
      const paymentId = result.lastInsertRowid as number;

      // Automatically generate a receipt number if not provided
      if (payment.payment_status !== 'Pending') {
        const receiptNumber = payment.receipt_number || `REC-${Date.now()}`;
        dbService.run(
          `INSERT INTO receipts (payment_id, receipt_number, receipt_date)
           VALUES (?, ?, ?)`,
          [paymentId, receiptNumber, payment.payment_date]
        );
      }

      return paymentId;
    });
  }

  public delete(id: number): boolean {
    return dbService.transaction(() => {
      try {
        const payment = dbService.get<Payment>('SELECT * FROM payments WHERE id = ?', [id]);
        if (payment && payment.letter_id) {
          dbService.run("UPDATE maintenance_letters SET status = 'Generated' WHERE id = ?", [payment.letter_id]);
        }
        const result = dbService.run('DELETE FROM payments WHERE id = ?', [id]);
        return result.changes > 0;
      } catch (error) {
        console.error(`Error deleting payment ${id}:`, error);
        throw error;
      }
    });
  }

  public bulkDelete(ids: number[]): void {
    dbService.transaction(() => {
      for (const id of ids) {
        this.delete(id);
      }
    });
  }
}

export const paymentService = new PaymentService();
