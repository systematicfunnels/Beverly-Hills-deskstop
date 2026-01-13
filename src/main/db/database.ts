import Database from 'better-sqlite3';
import path from 'path';
import { app } from 'electron';
import { schema } from './schema';

class DatabaseService {
  private db: Database.Database;

  constructor() {
    const dbPath = app.isPackaged
      ? path.join(app.getPath('userData'), 'beverly-hills.db')
      : path.join(__dirname, '../../beverly-hills.db');

    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.init();
  }

  private init() {
    this.db.exec(schema);
    console.log('Database initialized');
  }

  public getDb(): Database.Database {
    return this.db;
  }

  public query<T>(sql: string, params: any[] = []): T[] {
    return this.db.prepare(sql).all(...params) as T[];
  }

  public get<T>(sql: string, params: any[] = []): T | undefined {
    return this.db.prepare(sql).get(...params) as T | undefined;
  }

  public run(sql: string, params: any[] = []): Database.RunResult {
    return this.db.prepare(sql).run(...params);
  }

  public transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }
}

export const dbService = new DatabaseService();
