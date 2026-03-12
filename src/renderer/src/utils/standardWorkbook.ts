import {
  Project,
  ProjectSectorPaymentConfig,
  StandardWorkbookImportRow,
  StandardWorkbookImportYear,
  StandardWorkbookProjectImportPayload
} from '@preload/types'
import { cleanNumber, getValue, normalizeRow } from './importHelpers'

export interface StandardWorkbookProjectPreview extends StandardWorkbookProjectImportPayload {
  workbook_project_name: string
  sector_configs: Partial<ProjectSectorPaymentConfig>[]
  rows: StandardWorkbookImportRow[]
  unit_count: number
  ledger_row_count: number
  letter_count: number
  sector_codes: string[]
  unit_types: string[]
  missing_contact_count: number
  missing_email_count: number
  warnings: string[]
  blockers: string[]
}

export interface StandardWorkbookParseResult {
  projects: StandardWorkbookProjectPreview[]
  workbook_warnings: string[]
  workbook_blockers: string[]
}

type WorkbookSheetRows = Record<string, Record<string, unknown>[]>

const REQUIRED_SHEETS = ['Project', 'Units', 'Ledger']

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : String(value || '').trim())

const normalizeProjectKey = (value: unknown): string => text(value).toLowerCase()

const findSheet = (
  workbook: WorkbookSheetRows,
  targetSheetName: string
): Record<string, unknown>[] | undefined => {
  const matchedKey = Object.keys(workbook).find(
    (sheetName) => sheetName.trim().toLowerCase() === targetSheetName.trim().toLowerCase()
  )
  return matchedKey ? workbook[matchedKey] : undefined
}

const isFinancialYear = (value: string): boolean => /^\d{4}-\d{2}$/.test(value)

const normalizeProjectStatus = (value: unknown): string => {
  const normalized = text(value).toLowerCase()
  if (!normalized || normalized === 'active') return 'Active'
  if (normalized === 'inactive') return 'Inactive'
  return text(value) || 'Active'
}

const normalizeUnitStatus = (value: unknown): string => {
  const normalized = text(value).toLowerCase()
  if (!normalized || normalized === 'active' || normalized === 'sold' || normalized === 'occupied') {
    return 'Active'
  }
  if (normalized === 'inactive' || normalized === 'unsold') {
    return 'Inactive'
  }
  if (normalized === 'vacant') {
    return 'Vacant'
  }
  return text(value) || 'Active'
}

const normalizeUnitType = (value: unknown): string => {
  const normalized = text(value).toLowerCase()
  if (!normalized || normalized === 'flat' || normalized === 'bungalow') return 'Bungalow'
  if (normalized === 'plot') return 'Plot'
  return text(value) || 'Bungalow'
}

const normalizeTemplateType = (value: unknown): string => {
  const normalized = text(value).toLowerCase()
  if (!normalized || normalized === 'maintenance' || normalized === 'standard') return 'standard'
  if (normalized === 'sector_legacy' || normalized === 'sector legacy') return 'sector_legacy'
  if (
    normalized === 'reminder_legacy' ||
    normalized === 'reminder legacy' ||
    normalized === 'reminder'
  ) {
    return 'reminder_legacy'
  }
  return text(value) || 'standard'
}

const normalizeImportProfile = (value: unknown): string => {
  const normalized = text(value).toLowerCase()
  if (!normalized || normalized === 'standard' || normalized === 'maintenance') {
    return 'standard_normalized'
  }
  return normalized
}

const normalizeSectorCode = (value: unknown): string => text(value).toUpperCase()

const normalizeIsoDate = (value: unknown): string => {
  const rawValue = text(value)
  if (!rawValue) return ''

  const isoMatch = rawValue.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`
  }

  const slashIsoMatch = rawValue.match(/^(\d{4})\/(\d{2})\/(\d{2})$/)
  if (slashIsoMatch) {
    return `${slashIsoMatch[1]}-${slashIsoMatch[2]}-${slashIsoMatch[3]}`
  }

  const ddMmYyyyMatch = rawValue.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/)
  if (ddMmYyyyMatch) {
    return `${ddMmYyyyMatch[3]}-${ddMmYyyyMatch[2]}-${ddMmYyyyMatch[1]}`
  }

  const date = new Date(rawValue)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString().slice(0, 10)
}

const rowHasAnyValue = (row: Record<string, unknown>): boolean =>
  Object.values(row).some((value) => text(value).length > 0)

const getProjectName = (row: Record<string, unknown>): string =>
  text(getValue(row, ['project_name', 'project name', 'name', 'project']))

const buildUnitNumber = (row: Record<string, unknown>): string => {
  const directUnitNumber = text(getValue(row, ['unit_number', 'unit number', 'plot_code', 'plot code']))
  if (directUnitNumber) return directUnitNumber

  const sectorCode = normalizeSectorCode(getValue(row, ['sector_code', 'sector']))
  const plotNumber = text(getValue(row, ['plot_number', 'plot number']))
  if (sectorCode && plotNumber) {
    return `${sectorCode}-${plotNumber.padStart(3, '0')}`
  }

  return ''
}

const addWarning = (warnings: string[], warning: string): void => {
  if (!warnings.includes(warning)) {
    warnings.push(warning)
  }
}

const addBlocker = (blockers: string[], blocker: string): void => {
  if (!blockers.includes(blocker)) {
    blockers.push(blocker)
  }
}

export const parseStandardWorkbook = (workbook: WorkbookSheetRows): StandardWorkbookParseResult => {
  const workbookWarnings: string[] = []
  const workbookBlockers: string[] = []

  for (const requiredSheet of REQUIRED_SHEETS) {
    if (!findSheet(workbook, requiredSheet)) {
      workbookBlockers.push(`Missing required sheet: ${requiredSheet}`)
    }
  }

  const projectSheet = findSheet(workbook, 'Project') || []
  const sectorSheet = findSheet(workbook, 'Sector_Payment_Config') || []
  const unitsSheet = findSheet(workbook, 'Units') || []
  const ledgerSheet = findSheet(workbook, 'Ledger') || []

  if (projectSheet.length === 0) {
    workbookBlockers.push('Project sheet is empty.')
  }

  const projects = new Map<string, StandardWorkbookProjectPreview>()
  const unitRowMaps = new Map<string, Map<string, StandardWorkbookImportRow>>()
  const ledgerKeys = new Set<string>()

  for (const [index, rawRow] of projectSheet.entries()) {
    if (!rowHasAnyValue(rawRow)) continue
    const row = normalizeRow(rawRow)
    const projectName = getProjectName(row)

    if (!projectName) {
      workbookBlockers.push(`Project sheet row ${index + 2}: project_name is required.`)
      continue
    }

    const projectKey = normalizeProjectKey(projectName)
    if (projects.has(projectKey)) {
      workbookBlockers.push(`Project sheet row ${index + 2}: duplicate project "${projectName}".`)
      continue
    }

    const project: Project = {
      name: projectName,
      address: text(getValue(row, ['address'])),
      city: text(getValue(row, ['city'])),
      state: text(getValue(row, ['state'])),
      pincode: text(getValue(row, ['pincode'])),
      status: normalizeProjectStatus(getValue(row, ['status'])),
      account_name: text(getValue(row, ['default_account_name', 'account_name'])),
      bank_name: text(getValue(row, ['default_bank_name', 'bank_name'])),
      account_no: text(getValue(row, ['default_account_no', 'account_no'])),
      ifsc_code: text(getValue(row, ['default_ifsc_code', 'ifsc_code'])).toUpperCase(),
      branch: text(getValue(row, ['default_branch', 'branch'])),
      qr_code_path: text(getValue(row, ['default_qr_file', 'default_qr_path', 'qr_code_path'])),
      template_type: normalizeTemplateType(getValue(row, ['template_type', 'template type'])),
      import_profile_key: normalizeImportProfile(
        getValue(row, ['import_profile_key', 'import profile', 'import_profile'])
      )
    }

    const preview: StandardWorkbookProjectPreview = {
      workbook_project_name: projectName,
      project,
      sector_configs: [],
      rows: [],
      unit_count: 0,
      ledger_row_count: 0,
      letter_count: 0,
      sector_codes: [],
      unit_types: [],
      missing_contact_count: 0,
      missing_email_count: 0,
      warnings: [],
      blockers: []
    }

    projects.set(projectKey, preview)
    unitRowMaps.set(projectKey, new Map())
  }

  if (projects.size > 1) {
    workbookWarnings.push(
      'Workbook contains multiple projects. One project per workbook is recommended for day-to-day operations.'
    )
  }

  if (!findSheet(workbook, 'Sector_Payment_Config')) {
    workbookWarnings.push(
      'Sector_Payment_Config sheet is missing. Project default bank details will be used where available.'
    )
  }

  for (const [index, rawRow] of sectorSheet.entries()) {
    if (!rowHasAnyValue(rawRow)) continue
    const row = normalizeRow(rawRow)
    const projectName = getProjectName(row)
    const sectorCode = normalizeSectorCode(getValue(row, ['sector_code', 'sector']))

    if (!projectName) {
      workbookBlockers.push(`Sector_Payment_Config row ${index + 2}: project_name is required.`)
      continue
    }

    const preview = projects.get(normalizeProjectKey(projectName))
    if (!preview) {
      workbookBlockers.push(
        `Sector_Payment_Config row ${index + 2}: unknown project "${projectName}". Add it to the Project sheet first.`
      )
      continue
    }

    if (!sectorCode) {
      addBlocker(preview.blockers, `Sector_Payment_Config row ${index + 2}: sector_code is required.`)
      continue
    }

    if (preview.sector_configs.some((config) => normalizeSectorCode(config.sector_code) === sectorCode)) {
      addBlocker(preview.blockers, `Duplicate sector config "${sectorCode}" in Sector_Payment_Config.`)
      continue
    }

    const sectorConfig: Partial<ProjectSectorPaymentConfig> = {
      sector_code: sectorCode,
      account_name: text(getValue(row, ['account_name', 'name'])),
      bank_name: text(getValue(row, ['bank_name', 'bank'])),
      account_no: text(getValue(row, ['account_no', 'account number'])),
      ifsc_code: text(getValue(row, ['ifsc_code', 'ifsc'])).toUpperCase(),
      branch: text(getValue(row, ['branch'])),
      branch_address: text(getValue(row, ['branch_address'])),
      qr_code_path: text(getValue(row, ['qr_file', 'qr_code_path']))
    }

    preview.sector_configs.push(sectorConfig)

    const hasPaymentDetails = [
      sectorConfig.account_name,
      sectorConfig.bank_name,
      sectorConfig.account_no,
      sectorConfig.ifsc_code,
      sectorConfig.branch,
      sectorConfig.branch_address,
      sectorConfig.qr_code_path
    ].some((value) => text(value).length > 0)

    if (!hasPaymentDetails) {
      addWarning(
        preview.warnings,
        `Sector ${sectorCode} has no bank or QR details in the workbook and will rely on project defaults.`
      )
    }
  }

  for (const [index, rawRow] of unitsSheet.entries()) {
    if (!rowHasAnyValue(rawRow)) continue
    const row = normalizeRow(rawRow)
    const projectName = getProjectName(row)

    if (!projectName) {
      workbookBlockers.push(`Units row ${index + 2}: project_name is required.`)
      continue
    }

    const preview = projects.get(normalizeProjectKey(projectName))
    const unitMap = unitRowMaps.get(normalizeProjectKey(projectName))
    if (!preview || !unitMap) {
      workbookBlockers.push(`Units row ${index + 2}: unknown project "${projectName}".`)
      continue
    }

    const unitNumber = buildUnitNumber(row)
    if (!unitNumber) {
      addBlocker(preview.blockers, `Units row ${index + 2}: unit_number is required.`)
      continue
    }

    const duplicateKey = unitNumber.toUpperCase()
    if (unitMap.has(duplicateKey)) {
      addBlocker(preview.blockers, `Duplicate unit "${unitNumber}" found in Units sheet.`)
      continue
    }

    const sectorCode = normalizeSectorCode(getValue(row, ['sector_code', 'sector']))
    const unitType = normalizeUnitType(getValue(row, ['unit_type', 'type']))
    const contactNumber = text(getValue(row, ['contact_number', 'contact', 'mobile', 'phone']))
    const email = text(getValue(row, ['email', 'email_id']))
    const areaSqft = cleanNumber(getValue(row, ['area_sqft', 'area', 'sqft', 'sq.ft']))

    const importRow: StandardWorkbookImportRow = {
      unit_number: unitNumber,
      sector_code: sectorCode,
      owner_name: text(getValue(row, ['owner_name', 'owner', 'name'])) || 'Unknown',
      unit_type: unitType,
      area_sqft: areaSqft > 0 ? areaSqft : 1000,
      contact_number: contactNumber,
      email,
      status: normalizeUnitStatus(getValue(row, ['status'])),
      penalty: cleanNumber(getValue(row, ['opening_penalty', 'penalty'])),
      years: []
    }

    if (areaSqft <= 0) {
      addWarning(preview.warnings, `Unit ${unitNumber} has no area. Default area 1000 sqft will be used.`)
    }
    if (!contactNumber) {
      preview.missing_contact_count += 1
    }
    if (!email) {
      preview.missing_email_count += 1
    }

    unitMap.set(duplicateKey, importRow)
    preview.rows.push(importRow)
    preview.unit_count += 1
  }

  for (const [index, rawRow] of ledgerSheet.entries()) {
    if (!rowHasAnyValue(rawRow)) continue
    const row = normalizeRow(rawRow)
    const projectName = getProjectName(row)

    if (!projectName) {
      workbookBlockers.push(`Ledger row ${index + 2}: project_name is required.`)
      continue
    }

    const projectKey = normalizeProjectKey(projectName)
    const preview = projects.get(projectKey)
    const unitMap = unitRowMaps.get(projectKey)
    if (!preview || !unitMap) {
      workbookBlockers.push(`Ledger row ${index + 2}: unknown project "${projectName}".`)
      continue
    }

    const unitNumber = buildUnitNumber(row)
    if (!unitNumber) {
      addBlocker(preview.blockers, `Ledger row ${index + 2}: unit_number is required.`)
      continue
    }

    const unitRow = unitMap.get(unitNumber.toUpperCase())
    if (!unitRow) {
      addBlocker(
        preview.blockers,
        `Ledger row ${index + 2}: unit "${unitNumber}" is missing from the Units sheet.`
      )
      continue
    }

    const financialYear = text(getValue(row, ['financial_year', 'financial year']))
    if (!isFinancialYear(financialYear)) {
      addBlocker(
        preview.blockers,
        `Ledger row ${index + 2}: invalid financial_year "${financialYear}". Use YYYY-YY format.`
      )
      continue
    }

    const ledgerKey = `${projectKey}::${unitNumber.toUpperCase()}::${financialYear}`
    if (ledgerKeys.has(ledgerKey)) {
      addBlocker(
        preview.blockers,
        `Duplicate ledger entry found for unit ${unitNumber} in FY ${financialYear}.`
      )
      continue
    }
    ledgerKeys.add(ledgerKey)

    const addOns: { name: string; amount: number }[] = []
    const appendAddOn = (name: string, amount: number): void => {
      if (amount <= 0) return
      const existing = addOns.find((addOn) => addOn.name === name)
      if (existing) {
        existing.amount += amount
      } else {
        addOns.push({ name, amount })
      }
    }

    appendAddOn('NA Tax', cleanNumber(getValue(row, ['na_tax'])))
    appendAddOn('Road & NA Charges', cleanNumber(getValue(row, ['road_na', 'rd & na'])))
    appendAddOn('Cable', cleanNumber(getValue(row, ['cable'])))
    appendAddOn('GST', cleanNumber(getValue(row, ['gst'])))
    appendAddOn('Pipe Replacement', cleanNumber(getValue(row, ['pipe_replacement'])))

    const otherChargeAmount = cleanNumber(getValue(row, ['other_charge_amount']))
    if (otherChargeAmount > 0) {
      appendAddOn(text(getValue(row, ['other_charge_name'])) || 'Other Charge', otherChargeAmount)
    }

    const yearRow: StandardWorkbookImportYear = {
      financial_year: financialYear,
      base_amount: cleanNumber(getValue(row, ['maintenance_amount', 'base_amount'])),
      arrears: cleanNumber(getValue(row, ['arrears'])),
      discount_amount: cleanNumber(getValue(row, ['discount_amount'])),
      final_amount: cleanNumber(getValue(row, ['final_amount'])),
      due_date: normalizeIsoDate(getValue(row, ['due_date'])),
      add_ons: addOns
    }

    const computedGross =
      yearRow.base_amount +
      (yearRow.arrears || 0) +
      addOns.reduce((sum, addOn) => sum + addOn.amount, 0) -
      (yearRow.discount_amount || 0)
    const hasLetterValue = computedGross > 0 || (yearRow.final_amount || 0) > 0
    if (!hasLetterValue) {
      continue
    }

    unitRow.years = Array.isArray(unitRow.years) ? unitRow.years : []
    unitRow.years.push(yearRow)
    preview.ledger_row_count += 1
    preview.letter_count += 1
  }

  const parsedProjects = Array.from(projects.values()).map((preview) => {
    const unitTypeSet = new Set<string>()
    const sectorSet = new Set<string>()

    for (const row of preview.rows) {
      if (text(row.unit_type)) unitTypeSet.add(String(row.unit_type))
      if (text(row.sector_code)) sectorSet.add(String(row.sector_code))
    }
    for (const config of preview.sector_configs) {
      if (text(config.sector_code)) sectorSet.add(String(config.sector_code))
    }

    preview.unit_types = Array.from(unitTypeSet).sort((a, b) => a.localeCompare(b))
    preview.sector_codes = Array.from(sectorSet).sort((a, b) => a.localeCompare(b))

    const hasDefaultPaymentDetails = [
      preview.project.account_name,
      preview.project.bank_name,
      preview.project.account_no,
      preview.project.ifsc_code,
      preview.project.branch,
      preview.project.qr_code_path
    ].some((value) => text(value).length > 0)
    const hasSectorPaymentDetails = preview.sector_configs.some((config) =>
      [
        config.account_name,
        config.bank_name,
        config.account_no,
        config.ifsc_code,
        config.branch,
        config.branch_address,
        config.qr_code_path
      ].some((value) => text(value).length > 0)
    )

    if (!hasDefaultPaymentDetails && !hasSectorPaymentDetails) {
      addWarning(
        preview.warnings,
        'No bank or QR details were provided in the workbook. Project setup will still import, but letters will not be ready until payment routing is configured.'
      )
    }

    if (preview.missing_contact_count > 0) {
      addWarning(
        preview.warnings,
        `${preview.missing_contact_count} units do not have a contact number in the workbook.`
      )
    }

    if (preview.missing_email_count > 0) {
      addWarning(preview.warnings, `${preview.missing_email_count} units do not have an email in the workbook.`)
    }

    if (preview.ledger_row_count === 0) {
      addWarning(
        preview.warnings,
        'No payable ledger rows were found for this project. Units will import without maintenance history.'
      )
    }

    preview.warnings = [...preview.warnings]
    preview.blockers = [...preview.blockers]
    return preview
  })

  const prefixedProjectBlockers = parsedProjects.flatMap((project) =>
    project.blockers.map((blocker) => `${project.project.name}: ${blocker}`)
  )

  return {
    projects: parsedProjects,
    workbook_warnings: workbookWarnings,
    workbook_blockers: [...workbookBlockers, ...prefixedProjectBlockers]
  }
}
