import { dbService } from '../db/database';

export interface Payment {
  id?: number;
  unit_id: number;
  invoice_id?: number;
  payment_date: string;
  amount_paid: number;
  payment_mode: string;
  reference_number?: string;
  receipt_number?: string;
  remarks?: string;
  unit_number?: string;
  owner_name?: string;
}

class PaymentService {
  public getAll(): Payment[] {
    return dbService.query<Payment>(`
      SELECT p.*, u.unit_number, u.owner_name
      FROM payments p
      JOIN units u ON p.unit_id = u.id
      ORDER BY p.payment_date DESC, p.id DESC
    `);
  }

  public create(payment: Payment): number {
    return dbService.transaction(() => {
      const receiptNumber = `REC-${Date.now()}`;
      
      const result = dbService.run(`
        INSERT INTO payments (
          unit_id, invoice_id, payment_date, amount_paid, payment_mode, reference_number, receipt_number, remarks
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        payment.unit_id,
        payment.invoice_id,
        payment.payment_date,
        payment.amount_paid,
        payment.payment_mode,
        payment.reference_number,
        receiptNumber,
        payment.remarks
      ]);

      if (payment.invoice_id) {
        dbService.run('UPDATE invoices SET status = "Paid" WHERE id = ?', [payment.invoice_id]);
      }

      return result.lastInsertRowid as number;
    });
  }

  public delete(id: number): boolean {
    return dbService.transaction(() => {
      const payment = dbService.get<Payment>('SELECT * FROM payments WHERE id = ?', [id]);
      if (payment && payment.invoice_id) {
        dbService.run('UPDATE invoices SET status = "Unpaid" WHERE id = ?', [payment.invoice_id]);
      }
      const result = dbService.run('DELETE FROM payments WHERE id = ?', [id]);
      return result.changes > 0;
    });
  }
}

export const paymentService = new PaymentService();
