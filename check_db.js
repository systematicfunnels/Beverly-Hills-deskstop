
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'beverly-hills.db');
const db = new Database(dbPath);

const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log('Tables:', tables.map(t => t.name).join(', '));

for (const table of tables) {
  const fkList = db.prepare(`PRAGMA foreign_key_list(${table.name})`).all();
  if (fkList.length > 0) {
    console.log(`Foreign keys for ${table.name}:`);
    console.table(fkList);
  }
}
db.close();
