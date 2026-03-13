/**
 * Automated database backup service
 */

import { app } from 'electron'
import path from 'path'
import fs from 'fs'
import { copyFileAsync, deleteFileAsync } from '../utils/fileAsync'

export interface BackupConfig {
  enabled: boolean
  intervalDays: number
  maxBackups: number
  retentionDays: number
}

export interface BackupResult {
  success: boolean
  backupPath?: string
  timestamp?: string
  size?: number
  error?: string
}

class BackupService {
  private backupDir = path.join(app.getPath('userData'), 'backups')
  private dbPath = path.join(app.getPath('userData'), 'barkat.db')
  private config: BackupConfig = {
    enabled: true,
    intervalDays: 7,
    maxBackups: 10,
    retentionDays: 90
  }
  private scheduleId: NodeJS.Timeout | null = null

  constructor() {
    // Ensure backup directory exists
    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true })
    }
  }

  /**
   * Create a backup of the database
   */
  async createBackup(): Promise<BackupResult> {
    try {
      const timestamp = new Date().toISOString().replace(/[:\-]/g, '').slice(0, 15)
      const backupName = `barkat_${timestamp}.db.bak`
      const backupPath = path.join(this.backupDir, backupName)

      // Copy the DB file
      const result = await copyFileAsync(this.dbPath, backupPath)
      if (!result.success) {
        return { success: false, error: result.error }
      }

      // Create a metadata file
      const metadataPath = backupPath + '.json'
      const metadata = {
        timestamp: new Date().toISOString(),
        dbPath: this.dbPath,
        size: result.size,
        version: '1'
      }
      fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2))

      // Cleanup old backups
      await this.cleanupOldBackups()

      return {
        success: true,
        backupPath,
        timestamp,
        size: result.size
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return {
        success: false,
        error: `Backup failed: ${message}`
      }
    }
  }

  /**
   * Restore from a backup
   */
  async restoreBackup(backupPath: string): Promise<BackupResult> {
    try {
      // Validate backup file exists
      if (!fs.existsSync(backupPath)) {
        return { success: false, error: 'Backup file not found' }
      }

      // Create a safety backup of current DB
      const safetyBackup = await this.createBackup()
      if (!safetyBackup.success) {
        return { success: false, error: `Safety backup failed: ${safetyBackup.error}` }
      }

      // Close DB connection (should be done by caller)
      // Then restore
      const result = await copyFileAsync(backupPath, this.dbPath)
      if (!result.success) {
        return { success: false, error: result.error }
      }

      // Verify integrity (optional: run PRAGMA integrity_check)
      return {
        success: true,
        backupPath: this.dbPath,
        timestamp: new Date().toISOString(),
        size: result.size
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return {
        success: false,
        error: `Restore failed: ${message}`
      }
    }
  }

  /**
   * List all available backups
   */
  listBackups(): Array<{
    name: string
    path: string
    timestamp: string
    size: number
  }> {
    try {
      const files = fs.readdirSync(this.backupDir)
      return files
        .filter((f) => f.endsWith('.db.bak'))
        .map((f) => {
          const fullPath = path.join(this.backupDir, f)
          const stat = fs.statSync(fullPath)
          const metadataPath = fullPath + '.json'
          let timestamp = ''
          try {
            const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'))
            timestamp = metadata.timestamp
          } catch {
            timestamp = new Date(stat.mtimeMs).toISOString()
          }
          return {
            name: f,
            path: fullPath,
            timestamp,
            size: stat.size
          }
        })
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    } catch (error) {
      console.error('Error listing backups:', error)
      return []
    }
  }

  /**
   * Cleanup old backups based on retention policy
   */
  private async cleanupOldBackups(): Promise<void> {
    try {
      const backups = this.listBackups()

      // Remove by count
      if (backups.length > this.config.maxBackups) {
        for (let i = this.config.maxBackups; i < backups.length; i++) {
          await deleteFileAsync(backups[i].path)
          const metadataPath = backups[i].path + '.json'
          if (fs.existsSync(metadataPath)) {
            await deleteFileAsync(metadataPath)
          }
        }
      }

      // Remove by age
      const cutoffTime = Date.now() - this.config.retentionDays * 24 * 60 * 60 * 1000
      for (const backup of backups) {
        if (new Date(backup.timestamp).getTime() < cutoffTime) {
          await deleteFileAsync(backup.path)
          const metadataPath = backup.path + '.json'
          if (fs.existsSync(metadataPath)) {
            await deleteFileAsync(metadataPath)
          }
        }
      }
    } catch (error) {
      console.error('Error cleaning up backups:', error)
    }
  }

  /**
   * Enable automatic backups
   */
  startAutoBackup(intervalDays: number = 7): void {
    if (this.scheduleId) {
      clearInterval(this.scheduleId)
    }

    this.config.intervalDays = intervalDays
    const intervalMs = intervalDays * 24 * 60 * 60 * 1000

    // Run first backup immediately (async, non-blocking)
    this.createBackup().catch((e) => console.error('Initial backup failed:', e))

    // Then schedule recurring backups
    this.scheduleId = setInterval(() => {
      this.createBackup().catch((e) => console.error('Scheduled backup failed:', e))
    }, intervalMs)
  }

  /**
   * Disable automatic backups
   */
  stopAutoBackup(): void {
    if (this.scheduleId) {
      clearInterval(this.scheduleId)
      this.scheduleId = null
    }
  }

  /**
   * Get backup configuration
   */
  getConfig(): BackupConfig {
    return { ...this.config }
  }

  /**
   * Update backup configuration
   */
  updateConfig(partial: Partial<BackupConfig>): void {
    this.config = { ...this.config, ...partial }
  }
}

export const backupService = new BackupService()
