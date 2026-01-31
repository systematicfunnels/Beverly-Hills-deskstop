import ExcelJS from 'exceljs'
import * as XLSX from 'xlsx'

/**
 * Robustly reads an Excel (.xlsx, .xls) or CSV file and returns its content as an array of objects.
 * Each object represents a row, with keys derived from the first row's headers.
 *
 * @param file The File object from an input or drop event
 * @returns A promise that resolves to an array of record objects
 */
export const readExcelFile = async (file: File): Promise<Record<string, unknown>[]> => {
  try {
    // 1. Basic validation
    if (!file) {
      throw new Error('No file provided')
    }

    const fileName = file.name.toLowerCase()
    const isCsv = fileName.endsWith('.csv')
    const isXls = fileName.endsWith('.xls')

    // 2. Read the file as ArrayBuffer
    const data = await file.arrayBuffer()

    // 3. Load and parse the workbook based on format
    if (isXls) {
      // Use SheetJS (xlsx) for legacy .xls files
      const workbook = XLSX.read(data, { type: 'array' })
      const sheetName = workbook.SheetNames[0]
      if (!sheetName) {
        throw new Error('The file is empty or has no worksheets.')
      }
      const worksheet = workbook.Sheets[sheetName]
      return XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
        defval: ''
      })
    } else {
      // Use ExcelJS for modern .xlsx and .csv files
      const workbook = new ExcelJS.Workbook()
      if (isCsv) {
        // Use PapaParse or similar browser-friendly CSV parser if possible.
        // For now, let's use a simple CSV to Sheet approach via XLSX to avoid stream issues in browser.
        const csvWorkbook = XLSX.read(data, { type: 'array' })
        const sheetName = csvWorkbook.SheetNames[0]
        const worksheet = csvWorkbook.Sheets[sheetName]
        return XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
          defval: ''
        })
      } else {
        await workbook.xlsx.load(data)
      }

      const worksheet = workbook.worksheets[0]
      if (!worksheet) {
        throw new Error('The file is empty or has no worksheets.')
      }

      const jsonData: Record<string, unknown>[] = []

      // Get headers from the first row
      const headers: { [key: number]: string } = {}
      const headerRow = worksheet.getRow(1)

      headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        const headerText = cell.text ? String(cell.text).trim() : ''
        if (headerText) {
          headers[colNumber] = headerText
        } else {
          headers[colNumber] = `Column${colNumber}`
        }
      })

      // Iterate over data rows
      worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
        // Skip header row
        if (rowNumber === 1) return

        const rowObject: Record<string, unknown> = {}
        const columnIndices = Object.keys(headers).map(Number)

        columnIndices.forEach((colNumber) => {
          const header = headers[colNumber]
          const cell = row.getCell(colNumber)

          let value: ExcelJS.CellValue = cell.value

          // Handle Rich Text
          if (value && typeof value === 'object' && 'richText' in value) {
            value = value.richText.map((rt) => rt.text).join('')
          }

          // Handle formula values
          if (value && typeof value === 'object' && 'result' in value) {
            value = (value as ExcelJS.CellFormulaValue).result ?? null
          }

          // Handle Date objects
          if (value instanceof Date) {
            value = value.toISOString()
          }

          // Handle Hyperlinks
          if (value && typeof value === 'object' && 'hyperlink' in value) {
            value = (value as ExcelJS.CellHyperlinkValue).text || value.hyperlink
          }

          rowObject[header] = value !== null && value !== undefined ? value : ''
        })

        jsonData.push(rowObject)
      })

      return jsonData
    }
  } catch (error) {
    console.error('Excel Reader Error:', error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to read file: ${errorMessage}`)
  }
}
