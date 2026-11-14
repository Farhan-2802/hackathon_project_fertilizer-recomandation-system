const fs = require('fs/promises');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const FILES = {
  users: 'users.csv',
  crops: 'crops.csv',
  fertilizers: 'fertilizers.csv',
  rules: 'rules.csv',
  recommendations: 'recommendations.csv',
  feedback: 'feedback.csv'
};

function parseCSV(content) {
  const rows = [];
  let row = [];
  let value = '';
  let quoted = false;
  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    if (quoted) {
      if (ch === '"') {
        if (content[i + 1] === '"') { value += '"'; i++; }
        else quoted = false;
      } else value += ch;
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(value);
      value = '';
    } else if (ch === '\n') {
      row.push(value.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      value = '';
    } else {
      value += ch;
    }
  }
  if (value.length || row.length) {
    row.push(value.replace(/\r$/, ''));
    rows.push(row);
  }
  return rows;
}

function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

async function ensureFiles() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const defaults = {
    users: ['userId','name','role','email','passwordHash','phone','location','createdAt'],
    crops: ['cropId','cropName','typicalNPK','recommendedFertilizers','notes','createdAt'],
    fertilizers: ['fertilizerId','name','nutrientComposition','type','instructions','defaultDosageKgPerHa','applicationTiming','createdAt'],
    rules: ['ruleId','cropId','ruleName','conditionData','recommendations','isActive','updatedBy','createdAt','updatedAt'],
    recommendations: ['recId','userId','cropId','cropName','soilInput','growthStage','area','areaUnit','generatedRecommendations','isSaved','generatedAt','savedAt'],
    feedback: ['feedbackId','recId','userId','rating','comments','reviewStatus','adminNote','reviewedAt','createdAt']
  };
  for (const [key, cols] of Object.entries(defaults)) {
    const file = path.join(DATA_DIR, FILES[key]);
    try {
      const content = await fs.readFile(file, 'utf8');
      const parsed = parseCSV(content.replace(/^\uFEFF/, '')).filter(row => !(row.length === 1 && row[0] === ''));
      if (!parsed.length) {
        await fs.writeFile(file, cols.join(',') + '\n', 'utf8');
      } else {
        const existing = parsed[0];
        const merged = [...existing, ...cols.filter(col => !existing.includes(col))];
        if (merged.length !== existing.length) {
          const output = [merged.map(csvEscape).join(',')];
          for (const values of parsed.slice(1)) {
            const row = {};
            existing.forEach((col, index) => row[col] = values[index] ?? '');
            output.push(merged.map(col => csvEscape(row[col] ?? '')).join(','));
          }
          await fs.writeFile(file, output.join('\n') + '\n', 'utf8');
        }
      }
    } catch {
      await fs.writeFile(file, cols.join(',') + '\n', 'utf8');
    }
  }
}

async function read(table) {
  await ensureFiles();
  const file = path.join(DATA_DIR, FILES[table]);
  const content = await fs.readFile(file, 'utf8');
  const parsed = parseCSV(content.replace(/^\uFEFF/, '')).filter(row => !(row.length === 1 && row[0] === ''));
  if (!parsed.length) return [];
  const columns = parsed[0];
  return parsed.slice(1).map(values => {
    const row = {};
    columns.forEach((col, index) => row[col] = values[index] ?? '');
    return row;
  });
}

async function write(table, rows) {
  await ensureFiles();
  const file = path.join(DATA_DIR, FILES[table]);
  const current = await fs.readFile(file, 'utf8');
  const firstLine = current.split(/\r?\n/, 1)[0];
  const columns = (parseCSV(firstLine)[0] || []);
  const output = [columns.map(csvEscape).join(',')];
  for (const row of rows) output.push(columns.map(col => csvEscape(row[col])).join(','));
  const temp = file + '.tmp';
  await fs.writeFile(temp, output.join('\n') + '\n', 'utf8');
  await fs.rename(temp, file);
}

async function insert(table, row, idField) {
  const rows = await read(table);
  const nextId = rows.reduce((max, item) => Math.max(max, Number(item[idField]) || 0), 0) + 1;
  const saved = { ...row, [idField]: String(nextId) };
  rows.push(saved);
  await write(table, rows);
  return saved;
}

async function update(table, predicate, updater) {
  const rows = await read(table);
  let changed = null;
  const updated = rows.map(row => {
    if (!predicate(row)) return row;
    changed = updater({ ...row });
    return changed;
  });
  if (changed) await write(table, updated);
  return changed;
}

module.exports = { DATA_DIR, ensureFiles, read, write, insert, update };
