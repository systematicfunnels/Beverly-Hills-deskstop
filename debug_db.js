const Database = require('better-sqlite3')
const path = require('path')

try {
  const db = new Database('beverly-hills.db')

  console.log('--- TABLE: units ---')
  const unitsSql = db
    .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='units'")
    .get()
  console.log(unitsSql ? unitsSql.sql : 'units table not found')

  console.log('\n--- FOREIGN KEY LIST: units ---')
  const fkList = db.prepare('PRAGMA foreign_key_list(units)').all()
  console.log(JSON.stringify(fkList, null, 2))

  console.log('\n--- TABLE: projects ---')
  const projectsSql = db
    .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='projects'")
    .get()
  console.log(projectsSql ? projectsSql.sql : 'projects table not found')

  console.log('\n--- PROJECT DATA (ID 294) ---')
  const project = db.prepare('SELECT * FROM projects WHERE id = 294').get()
  console.log(JSON.stringify(project, null, 2))

  console.log('\n--- TOTAL PROJECTS ---')
  const count = db.prepare('SELECT count(*) as count FROM projects').get()
  console.log(count)
} catch (e) {
  console.error('Error:', e.message)
}
