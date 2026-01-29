export interface Project {
  id?: number
  name: string
  address?: string
  city?: string
  state?: string
  pincode?: string
  status?: string
  letterhead_path?: string
  bank_name?: string
  account_no?: string
  ifsc_code?: string
  qr_code_path?: string
  unit_count?: number
  created_at?: string
}

export interface Unit {
  id?: number
  project_id: number
  unit_number: string
  owner_name: string
  area_sqft: number
  unit_type?: string
  floor?: number
  wing?: string
  project_name?: string
  status?: string
  contact_number?: string
  email?: string
}

export interface MaintenanceLetter {
  id?: number
  project_id: number
  unit_id: number
  financial_year: string
  base_amount: number
  discount_amount: number
  final_amount: number
  due_date: string
  status: string
  generated_date: string
  unit_number?: string
  owner_name?: string
  project_name?: string
  unit_type?: string
  wing?: string
  is_paid?: boolean
  add_ons_total?: number
}

export interface MaintenanceRate {
  id?: number
  project_id: number
  financial_year: string
  rate_per_sqft: number
  billing_frequency?: string
  project_name?: string
}

export interface MaintenanceSlab {
  id?: number
  rate_id: number
  due_date: string
  discount_percentage: number
  is_early_payment: boolean
}

export interface Payment {
  id?: number
  project_id: number
  unit_id: number
  letter_id?: number
  payment_date: string
  payment_amount: number
  payment_mode: string
  cheque_number?: string
  remarks?: string
  payment_status?: string
  unit_number?: string
  owner_name?: string
  project_name?: string
  receipt_number?: string
  financial_year?: string
}

export interface RepairResult {
  success: boolean
  violations: {
    table: string
    rowid: number
    parent: string
    fkid: number
  }[]
  logs: string[]
}
