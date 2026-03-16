import { PDFDocument, rgb, StandardFonts, RGB } from 'pdf-lib'
import { CONFIG } from '../config/constants'

export interface PDFFont {
  regular: any
  bold: any
  italic?: any
}

export interface PDFLayout {
  width: number
  height: number
  margin: number
  contentWidth: number
  currentY: number
}

export interface PDFColors {
  PRIMARY: RGB
  SECONDARY: RGB
  ACCENT: RGB
  TEXT: RGB
  GRAY: RGB
  LIGHT_GRAY: RGB
  SUCCESS: RGB
  WARNING: RGB
  ERROR: RGB
  BORDER: RGB
  BACKGROUND: RGB
}

/**
 * Base PDF Generator class with standardized layout and styling
 */
export abstract class BasePDFGenerator {
  protected readonly COLORS: PDFColors = {
    PRIMARY: rgb(CONFIG.PDF.COLORS.NAVY.r, CONFIG.PDF.COLORS.NAVY.g, CONFIG.PDF.COLORS.NAVY.b),
    SECONDARY: rgb(0.85, 0.65, 0.13), // Gold accent
    ACCENT: rgb(0.17, 0.48, 0.37), // Navy alternative
    TEXT: rgb(CONFIG.PDF.COLORS.TEXT.r, CONFIG.PDF.COLORS.TEXT.g, CONFIG.PDF.COLORS.TEXT.b),
    GRAY: rgb(CONFIG.PDF.COLORS.GRAY.r, CONFIG.PDF.COLORS.GRAY.g, CONFIG.PDF.COLORS.GRAY.b),
    LIGHT_GRAY: rgb(0.97, 0.97, 0.97),
    SUCCESS: rgb(0.17, 0.48, 0.37),
    WARNING: rgb(0.75, 0.55, 0.2),
    ERROR: rgb(CONFIG.PDF.COLORS.RED.r, CONFIG.PDF.COLORS.RED.g, CONFIG.PDF.COLORS.RED.b),
    BORDER: rgb(CONFIG.PDF.COLORS.LINE.r, CONFIG.PDF.COLORS.LINE.g, CONFIG.PDF.COLORS.LINE.b),
    BACKGROUND: rgb(CONFIG.PDF.COLORS.HEADER_BG.r, CONFIG.PDF.COLORS.HEADER_BG.g, CONFIG.PDF.COLORS.HEADER_BG.b)
  }

  protected readonly PAGE_SIZE = CONFIG.PDF.PAGE_SIZE
  protected readonly MARGIN = CONFIG.PDF.MARGIN
  protected readonly FONT_SIZES = CONFIG.PDF.FONT_SIZES

  protected layout: PDFLayout
  protected fonts: PDFFont = {} as PDFFont
  protected pdfDoc: PDFDocument = {} as PDFDocument
  protected page: any = null

  constructor() {
    this.layout = this.initializeLayout()
  }

  /**
   * Initialize PDF document and layout
   */
  protected async initializePDF(): Promise<void> {
    this.pdfDoc = await PDFDocument.create()
    this.page = this.pdfDoc.addPage(this.PAGE_SIZE)
    this.layout = this.initializeLayout()
    this.fonts = await this.loadFonts()
  }

  /**
   * Initialize layout dimensions
   */
  private initializeLayout(): PDFLayout {
    const [width, height] = this.PAGE_SIZE
    return {
      width,
      height,
      margin: this.MARGIN,
      contentWidth: width - (this.MARGIN * 2),
      currentY: height - this.MARGIN
    }
  }

  /**
   * Load standard fonts
   */
  protected async loadFonts(): Promise<PDFFont> {
    return {
      regular: await this.pdfDoc.embedFont(StandardFonts.Helvetica),
      bold: await this.pdfDoc.embedFont(StandardFonts.HelveticaBold),
      italic: await this.pdfDoc.embedFont(StandardFonts.HelveticaOblique)
    }
  }

  /**
   * Draw standardized header
   */
  protected drawHeader(title: string, subtitle?: string): void {
    const { width, currentY } = this.layout
    
    // Main title centered
    const titleWidth = this.fonts.bold.widthOfTextAtSize(title, this.FONT_SIZES.HEADER)
    this.page.drawText(title, {
      x: (width - titleWidth) / 2,
      y: currentY,
      size: this.FONT_SIZES.HEADER,
      font: this.fonts.bold,
      color: this.COLORS.PRIMARY
    })

    // Subtitle if provided
    if (subtitle) {
      this.layout.currentY -= 18
      this.page.drawText(subtitle, {
        x: this.MARGIN,
        y: this.layout.currentY,
        size: this.FONT_SIZES.SUBHEADER,
        font: this.fonts.bold,
        color: this.COLORS.GRAY
      })
    }

    this.layout.currentY -= 25
  }

  /**
   * Draw section header with background
   */
  protected drawSectionHeader(title: string): void {
    const { width, contentWidth } = this.layout
    
    // Background box
    this.page.drawRectangle({
      x: this.MARGIN,
      y: this.layout.currentY - 22,
      width: contentWidth,
      height: 22,
      color: this.COLORS.BACKGROUND
    })

    // Centered title
    const titleWidth = this.fonts.bold.widthOfTextAtSize(title, this.FONT_SIZES.SUBJECT)
    this.page.drawText(title, {
      x: (width - titleWidth) / 2,
      y: this.layout.currentY - 15,
      size: this.FONT_SIZES.SUBJECT,
      font: this.fonts.bold,
      color: this.COLORS.PRIMARY
    })

    this.layout.currentY -= 25
  }

  /**
   * Draw table with standardized styling
   */
  protected drawTable(headers: string[], rows: string[][]): void {
    const { contentWidth } = this.layout
    const columnWidth = contentWidth / headers.length
    const rowHeight = 22

    // Header background
    this.page.drawRectangle({
      x: this.MARGIN,
      y: this.layout.currentY - 25,
      width: contentWidth,
      height: 25,
      color: this.COLORS.BACKGROUND
    })

    // Headers
    headers.forEach((header, i) => {
      this.page.drawText(header, {
        x: this.MARGIN + 5 + (i * columnWidth),
        y: this.layout.currentY - 16,
        size: 9,
        font: this.fonts.bold,
        color: this.COLORS.PRIMARY
      })
    })

    this.layout.currentY -= 25

    // Data rows with zebra striping
    rows.forEach((row, rowIndex) => {
      // Zebra striping
      if (rowIndex % 2 === 0) {
        this.page.drawRectangle({
          x: this.MARGIN,
          y: this.layout.currentY - 22,
          width: contentWidth,
          height: rowHeight,
          color: this.COLORS.LIGHT_GRAY
        })
      }

      // Row data
      row.forEach((cell, colIndex) => {
        this.page.drawText(cell, {
          x: this.MARGIN + 5 + (colIndex * columnWidth),
          y: this.layout.currentY - 15,
          size: 9,
          font: this.fonts.regular,
          color: this.COLORS.TEXT
        })
      })

      this.layout.currentY -= rowHeight
    })

    // Bottom border
    this.page.drawLine({
      start: { x: this.MARGIN, y: this.layout.currentY },
      end: { x: this.layout.width - this.MARGIN, y: this.layout.currentY },
      thickness: 1,
      color: this.COLORS.BORDER
    })

    this.layout.currentY -= 20
  }

  /**
   * Draw info grid (2-column layout)
   */
  protected drawInfoGrid(leftColumn: string[], rightColumn: string[]): void {
    leftColumn.forEach((text, i) => {
      this.page.drawText(text, {
        x: this.MARGIN,
        y: this.layout.currentY - (i * 14),
        size: 9,
        font: this.fonts.regular,
        color: this.COLORS.GRAY
      })
    })

    rightColumn.forEach((text, i) => {
      this.page.drawText(text, {
        x: this.layout.width - this.MARGIN - 120,
        y: this.layout.currentY - (i * 14),
        size: 9,
        font: this.fonts.regular,
        color: this.COLORS.GRAY
      })
    })

    this.layout.currentY -= (Math.max(leftColumn.length, rightColumn.length) * 14) + 10
  }

  /**
   * Draw divider line
   */
  protected drawDivider(): void {
    this.page.drawLine({
      start: { x: this.MARGIN, y: this.layout.currentY - 10 },
      end: { x: this.layout.width - this.MARGIN, y: this.layout.currentY - 10 },
      thickness: 1,
      color: this.COLORS.BORDER
    })
    this.layout.currentY -= 20
  }

  /**
   * Draw standardized footer
   */
  protected drawFooter(text: string): void {
    const { width } = this.layout
    
    // Footer line
    this.page.drawLine({
      start: { x: this.MARGIN, y: 65 },
      end: { x: width - this.MARGIN, y: 65 },
      thickness: 1,
      color: this.COLORS.BORDER
    })

    // Footer text
    this.page.drawText(text, {
      x: this.MARGIN,
      y: 50,
      size: this.FONT_SIZES.FOOTER,
      font: this.fonts.italic,
      color: this.COLORS.GRAY
    })
  }

  /**
   * Save PDF with standardized naming
   */
  protected savePDF(fileName: string, directory?: string): string {
    const pdfBytes = this.pdfDoc.save()
    const fs = require('fs')
    const path = require('path')
    const app = require('electron').app
    
    const targetDir = directory || path.join(app.getPath('userData'), 'pdfs')
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true })
    }
    
    const fullPath = path.join(targetDir, fileName)
    fs.writeFileSync(fullPath, pdfBytes)
    return fullPath
  }

  /**
   * Format currency consistently
   */
  protected formatCurrency(amount: number): string {
    return `Rs.${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  /**
   * Format date consistently
   */
  protected formatDate(date: string | Date): string {
    const dateObj = typeof date === 'string' ? new Date(date) : date
    return dateObj.toLocaleDateString('en-IN', { 
      day: 'numeric', 
      month: 'short', 
      year: 'numeric' 
    })
  }
}
