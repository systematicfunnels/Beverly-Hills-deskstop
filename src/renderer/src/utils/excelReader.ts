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

    // 2. Read the file as ArrayBuffer
    const data = await file.arrayBuffer()

    // 3. Load the workbook
    const workbook = XLSX.read(data, { type: 'array' })

    // 4. Get the first worksheet
    const sheetName = workbook.SheetNames[0]
    if (!sheetName) {
      throw new Error('The Excel file is empty or has no worksheets.')
    }
    const worksheet = workbook.Sheets[sheetName]

    // 5. Convert to JSON
    // default options: header: 0 (or undefined) -> first row is header.
    // raw: false attempts to format values, but raw: true is often safer for data processing.
    // Let's use default (raw: false for some, but typically we want the values).
    const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
      defval: '' // Use empty string for missing cells to match previous behavior closer
    })

    return jsonData
  } catch (error) {
    console.error('Excel Reader Error:', error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to read Excel file: ${errorMessage}`)
  }
}
