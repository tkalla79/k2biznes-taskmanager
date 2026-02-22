#!/usr/bin/env node
/**
 * Task Manager K2 — Full setup with MSAL Client Credentials
 * Adds proper columns to "Zadania" list, seeds data, populates "Zespol"
 */
require('dotenv').config();
require('isomorphic-fetch');
const { ConfidentialClientApplication } = require('@azure/msal-node');
const fs = require('fs');
const path = require('path');

const C = { reset: '\x1b[0m', bold: '\x1b[1m', green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m', cyan: '\x1b[36m' };
const ok = (msg) => console.log(`${C.green}✓${C.reset} ${msg}`);
const warn = (msg) => console.log(`${C.yellow}⚠${C.reset} ${msg}`);
const err = (msg) => console.log(`${C.red}✗${C.reset} ${msg}`);
const info = (msg) => console.log(`${C.cyan}ℹ${C.reset} ${msg}`);

const SITE_ID = process.env.SHAREPOINT_SITE_ID;
const ZADANIA_LIST_ID = 'f5668417-2d4a-40a7-9689-80d251682664';
const ZESPOL_LIST_ID = '7bfacd1f-7b79-4cc2-9d82-6fa1415274a1';

let token = null;

async function getToken() {
  if (token) return token;
  const msal = new ConfidentialClientApplication({
    auth: {
      clientId: process.env.AZURE_CLIENT_ID,
      authority: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}`,
      clientSecret: process.env.AZURE_CLIENT_SECRET,
    }
  });
  const result = await msal.acquireTokenByClientCredential({
    scopes: ['https://graph.microsoft.com/.default'],
  });
  token = result.accessToken;
  return token;
}

async function gf(urlPath, options = {}) {
  const t = await getToken();
  const url = `https://graph.microsoft.com/v1.0${urlPath}`;
  const res = await fetch(url, {
    ...options,
    headers: { 'Authorization': `Bearer ${t}`, 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const text = await res.text();
  if (!res.ok) {
    const e = text ? JSON.parse(text) : {};
    throw new Error(`${res.status}: ${e?.error?.message || text.substring(0, 200)}`);
  }
  return text ? JSON.parse(text) : null;
}

// Columns to add to "Zadania" list
const TASK_COLUMNS = [
  { name: 'TaskId', text: {}, description: 'Identyfikator zadania (ZAD-001)', indexed: true },
  { name: 'Description1', text: { allowMultipleLines: true }, description: 'Opis zadania' },
  { name: 'Assignee', text: {}, description: 'Osoba przypisana' },
  { name: 'Status', choice: { choices: ['Do zrobienia', 'W trakcie', 'Do weryfikacji', 'Zakończone', 'Zablokowane'] } },
  { name: 'Priority', choice: { choices: ['Krytyczny', 'Wysoki', 'Średni', 'Niski'] } },
  { name: 'TaskType', choice: { choices: ['DEADLINE', 'DEKLAROWANY'] } },
  { name: 'Category', choice: { choices: ['FENG', 'KPO', 'Horyzont Europa', 'Konsulting', 'Marketing', 'Administracja', 'Doradztwo', 'Wewnętrzne'] } },
  { name: 'StartDate', dateTime: { format: 'dateOnly' } },
  { name: 'DueDate', dateTime: { format: 'dateOnly' } },
  { name: 'CompletedDate', dateTime: { format: 'dateOnly' } },
  { name: 'EstHours', number: { decimalPlaces: 'one' } },
  { name: 'ActualHours', number: { decimalPlaces: 'one' } },
  { name: 'Progress', number: { minimum: 0, maximum: 100 } },
  { name: 'Tags', text: {}, description: 'Tagi rozdzielone przecinkami' },
  { name: 'Mode', choice: { choices: ['Rozłożone', 'Ciągłe'] } },
  { name: 'Dependency', text: {}, description: 'ID zadania zależnego' },
];

async function main() {
  console.log(`\n${C.bold}═══ Task Manager K2 — Full SharePoint Setup ═══${C.reset}\n`);

  // ── PHASE 1: Add columns to "Zadania" list ──
  info('FAZA 1: Dodaje kolumny do listy "Zadania"...');

  const existingCols = await gf(`/sites/${SITE_ID}/lists/${ZADANIA_LIST_ID}/columns`);
  const existingNames = new Set(existingCols.value.map(c => c.name));

  let addedCols = 0;
  for (const col of TASK_COLUMNS) {
    if (existingNames.has(col.name)) {
      info(`  ${col.name} — już istnieje`);
      addedCols++;
      continue;
    }
    try {
      await gf(`/sites/${SITE_ID}/lists/${ZADANIA_LIST_ID}/columns`, {
        method: 'POST',
        body: JSON.stringify(col),
      });
      ok(`  ${col.name} — dodano`);
      addedCols++;
    } catch (e) {
      err(`  ${col.name} — ${e.message}`);
    }
  }
  ok(`Kolumny: ${addedCols}/${TASK_COLUMNS.length}`);

  // ── PHASE 2: Migrate tasks from data.json ──
  info('\nFAZA 2: Migracja zadań z data.json...');

  const dataFile = path.join(__dirname, 'data.json');
  const data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));

  // Check existing items
  const existingItems = await gf(`/sites/${SITE_ID}/lists/${ZADANIA_LIST_ID}/items?expand=fields&$top=500`);
  const existingTaskIds = new Set(existingItems.value.map(i => i.fields?.TaskId).filter(Boolean));

  let created = 0;
  for (const task of data.tasks) {
    if (existingTaskIds.has(task.id)) {
      info(`  ${task.id} — już istnieje`);
      continue;
    }

    const fields = {
      Title: task.name,
      TaskId: task.id,
      Description1: task.description || '',
      Assignee: task.assignee || '',
      Status: task.status || 'Do zrobienia',
      Priority: task.priority || 'Średni',
      TaskType: task.type || 'DEADLINE',
      Category: task.category || '',
      StartDate: task.start || null,
      DueDate: task.due || null,
      CompletedDate: task.completedDate || null,
      EstHours: Number(task.est) || 0,
      ActualHours: Number(task.actual) || 0,
      Progress: Number(task.progress) || 0,
      Tags: Array.isArray(task.tags) ? task.tags.join(', ') : '',
      Mode: task.mode || 'Rozłożone',
      Dependency: task.dep || '',
    };

    try {
      await gf(`/sites/${SITE_ID}/lists/${ZADANIA_LIST_ID}/items`, {
        method: 'POST',
        body: JSON.stringify({ fields }),
      });
      created++;
      process.stdout.write(`\r  Utworzono: ${created}/${data.tasks.length}`);
    } catch (e) {
      err(`\n  ${task.id} — ${e.message}`);
    }
  }
  console.log('');
  ok(`Zmigrowano ${created} zadań (${existingTaskIds.size} już istniało)`);

  // ── PHASE 3: Populate "Zespol" list ──
  info('\nFAZA 3: Wypełniam listę "Zespol"...');

  const existingTeam = await gf(`/sites/${SITE_ID}/lists/${ZESPOL_LIST_ID}/items?expand=fields&$top=100`);
  const existingMemberNames = new Set(existingTeam.value.map(i => i.fields?.Title).filter(Boolean));

  let teamCreated = 0;
  for (const member of data.team) {
    if (existingMemberNames.has(member.name)) {
      info(`  ${member.name} — już istnieje`);
      continue;
    }

    try {
      await gf(`/sites/${SITE_ID}/lists/${ZESPOL_LIST_ID}/items`, {
        method: 'POST',
        body: JSON.stringify({
          fields: {
            Title: member.name,
            MemberId: member.id,
            Role: member.role,
            Hours: member.hours,
          }
        }),
      });
      ok(`  ${member.name} (${member.role}, ${member.hours}h)`);
      teamCreated++;
    } catch (e) {
      err(`  ${member.name} — ${e.message}`);
    }
  }
  ok(`Zespół: ${teamCreated} dodanych (${existingMemberNames.size} już istniało)`);

  // ── PHASE 4: Test email ──
  info('\nFAZA 4: Test wysyłki email...');
  try {
    const mailPath = `/users/${process.env.NOTIFICATION_SENDER_EMAIL}/sendMail`;
    await gf(mailPath, {
      method: 'POST',
      body: JSON.stringify({
        message: {
          subject: '[Task Manager K2] Test powiadomień',
          body: {
            contentType: 'HTML',
            content: `
              <div style="font-family:Segoe UI,sans-serif;max-width:500px;margin:0 auto;">
                <div style="background:linear-gradient(135deg,#3b82f6,#8b5cf6);padding:24px;border-radius:12px 12px 0 0;">
                  <h1 style="color:white;margin:0;font-size:20px;">✅ Task Manager K2</h1>
                  <p style="color:#e0e7ff;margin:4px 0 0;font-size:13px;">System powiadomień działa poprawnie</p>
                </div>
                <div style="background:#f8fafc;padding:20px;border:1px solid #e2e8f0;border-radius:0 0 12px 12px;">
                  <p style="color:#334155;margin:0 0 12px;">Email automatyczny z Task Manager K2 został skonfigurowany pomyślnie.</p>
                  <table style="font-size:13px;color:#475569;">
                    <tr><td style="padding:4px 12px 4px 0;font-weight:600;">Tenant:</td><td>${process.env.AZURE_TENANT_ID}</td></tr>
                    <tr><td style="padding:4px 12px 4px 0;font-weight:600;">App:</td><td>${process.env.AZURE_CLIENT_ID}</td></tr>
                    <tr><td style="padding:4px 12px 4px 0;font-weight:600;">Data:</td><td>${new Date().toLocaleString('pl-PL')}</td></tr>
                  </table>
                </div>
              </div>
            `,
          },
          toRecipients: [{ emailAddress: { address: process.env.PM_EMAIL } }],
        },
        saveToSentItems: false,
      }),
    });
    ok('Email testowy wysłany do ' + process.env.PM_EMAIL);
  } catch (e) {
    err('Email: ' + e.message.substring(0, 200));
  }

  // ── PHASE 5: Update .env ──
  info('\nFAZA 5: Aktualizuję .env...');
  const envContent = `# Task Manager K2 — M365 Configuration
# Wygenerowano: ${new Date().toISOString()}
# Lista: Zadania (z właściwymi kolumnami)

AZURE_TENANT_ID=${process.env.AZURE_TENANT_ID}
AZURE_CLIENT_ID=${process.env.AZURE_CLIENT_ID}
AZURE_CLIENT_SECRET=${process.env.AZURE_CLIENT_SECRET}

SHAREPOINT_SITE_ID=${SITE_ID}
SHAREPOINT_TASKS_LIST_ID=${ZADANIA_LIST_ID}
SHAREPOINT_TEAM_LIST_ID=${ZESPOL_LIST_ID}

NOTIFICATION_SENDER_EMAIL=${process.env.NOTIFICATION_SENDER_EMAIL}
PM_EMAIL=${process.env.PM_EMAIL}
MANAGER_EMAIL=${process.env.MANAGER_EMAIL || ''}

DATA_MODE=sharepoint
`;
  fs.writeFileSync(path.join(__dirname, '.env'), envContent);
  ok('.env zaktualizowany');

  // ── Verify ──
  info('\nWeryfikacja...');
  const finalTasks = await gf(`/sites/${SITE_ID}/lists/${ZADANIA_LIST_ID}/items?expand=fields&$top=5`);
  console.log(`\n  Pierwsze 5 zadań na liście "Zadania":`);
  finalTasks.value.forEach(item => {
    const f = item.fields;
    console.log(`  ${(f.TaskId||'').padEnd(8)} | ${(f.Title||'').substring(0,35).padEnd(35)} | ${(f.Assignee||'').padEnd(20)} | ${f.Status}`);
  });

  const finalTeam = await gf(`/sites/${SITE_ID}/lists/${ZESPOL_LIST_ID}/items?expand=fields&$top=5`);
  console.log(`\n  Pierwsze 5 osób w "Zespol":`);
  finalTeam.value.forEach(item => {
    const f = item.fields;
    console.log(`  ${(f.Title||'').padEnd(22)} | ${(f.Role||'').padEnd(15)} | ${f.Hours}h`);
  });

  // Summary
  console.log(`\n${C.bold}${C.green}═══ GOTOWE ═══${C.reset}\n`);
  console.log(`  Zadania:  ${ZADANIA_LIST_ID} (${addedCols} kolumn, ${created + existingTaskIds.size} zadań)`);
  console.log(`  Zespół:   ${ZESPOL_LIST_ID} (${teamCreated + existingMemberNames.size} osób)`);
  console.log(`  Email:    ${process.env.NOTIFICATION_SENDER_EMAIL} → ${process.env.PM_EMAIL}`);
  console.log(`\n  Uruchom: ${C.cyan}npm run dev:full${C.reset}\n`);
}

main().catch(e => {
  err(e.message);
  console.error(e);
  process.exit(1);
});
