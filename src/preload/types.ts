export interface Project {
  id?: number
  project_code?: string
  name: string
  address?: string
  city?: string
  state?: string
  pincode?: string
  status?: string
  letterhead_path?: string
  account_name?: string
  bank_name?: string
  account_no?: string
  ifsc_code?: string
  branch?: string
  branch_address?: string
  qr_code_path?: string
  template_type?: string
  import_profile_key?: string
  unit_count?: number
  created_at?: string
}

export interface ProjectSetupSummary {
  project_id: number
  project_name: string
  template_type?: string
  import_profile_key?: string
  unit_count: number
  sector_codes: string[]
  configured_sector_codes: string[]
  sectors_missing_core_payment_config: string[]
  sectors_without_qr_coverage: string[]
  unit_types: string[]
  rate_years: string[]
  has_default_payment_details: boolean
  has_default_qr: boolean
  has_rate_for_financial_year: boolean
  missing_rate_unit_types: string[]
  blockers: string[]
  warnings: string[]
  ready_for_letters: boolean
}

export interface Unit {
  id?: number
  project_id: number
  unit_number: string
  sector_code?: string
  owner_name: string
  area_sqft: number
  unit_type?: string
  floor?: number
  project_name?: string
  status?: string
  contact_number?: string
  email?: string
  penalty?: number
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
  is_paid?: boolean
  add_ons_total?: number
}

export interface MaintenanceRate {
  id?: number
  project_id: number
  financial_year: string
  unit_type?: string
  rate_per_sqft: number
  billing_frequency?: string
  project_name?: string
}

export interface ProjectSectorPaymentConfig {
  id?: number
  project_id: number
  sector_code: string
  account_name?: string
  bank_name?: string
  account_no?: string
  ifsc_code?: string
  branch?: string
  branch_address?: string
  qr_code_path?: string
  created_at?: string
  updated_at?: string
}

export interface StandardWorkbookImportAddOn {
  name: string
  amount: number
}

export interface StandardWorkbookImportYear {
  financial_year: string
  base_amount: number
  arrears?: number
  discount_amount?: number
  final_amount?: number
  due_date?: string
  add_ons?: StandardWorkbookImportAddOn[]
}

export interface StandardWorkbookImportRow {
  unit_number: string
  sector_code?: string
  owner_name?: string
  area_sqft?: number
  unit_type?: string
  status?: string
  contact_number?: string
  email?: string
  penalty?: number
  years?: StandardWorkbookImportYear[]
}

export interface StandardWorkbookProjectImportPayload {
  project: Project
  sector_configs?: Partial<ProjectSectorPaymentConfig>[]
  rows: StandardWorkbookImportRow[]
}

export interface StandardWorkbookProjectImportResult {
  project_id: number
  project_code: string
  project_name: string
  created: boolean
  imported_units: number
  imported_letters: number
  sector_configs_merged: boolean
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

export interface LetterAddOn {
  id: number
  letter_id: number
  addon_name: string
  addon_amount: number
  remarks?: string
}
