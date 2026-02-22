/**
 * Microsoft Graph API module — SharePoint Lists + Email
 * Provides the same interface as local data.json but backed by M365.
 *
 * SharePoint "Zadania" list columns:
 *   Title         → name
 *   TaskId        → id (ZAD-001)
 *   Description1  → description
 *   Assignee      → assignee
 *   Status        → status (choice)
 *   Priority      → priority (choice)
 *   TaskType      → type (choice)
 *   Category      → category (choice)
 *   StartDate     → start (dateTime)
 *   DueDate       → due (dateTime)
 *   CompletedDate → completedDate (dateTime)
 *   EstHours      → est (number)
 *   ActualHours   → actual (number)
 *   Progress      → progress (number 0-100)
 *   Tags          → tags (text, comma-separated)
 *   Mode          → mode (choice)
 *   Dependency    → dep (text)
 *
 * SharePoint "Zespol" list columns:
 *   Title    → name
 *   MemberId → id
 *   Role     → role
 *   Hours    → hours
 */
const { ConfidentialClientApplication } = require('@azure/msal-node');
require('isomorphic-fetch');
const fs = require('fs');
const path = require('path');

let msalClient = null;
let config = null;

function init(env) {
  config = {
    tenantId: env.AZURE_TENANT_ID,
    clientId: env.AZURE_CLIENT_ID,
    clientSecret: env.AZURE_CLIENT_SECRET,
    siteId: env.SHAREPOINT_SITE_ID,
    tasksListId: env.SHAREPOINT_TASKS_LIST_ID,
    teamListId: env.SHAREPOINT_TEAM_LIST_ID || '',
    senderEmail: env.NOTIFICATION_SENDER_EMAIL || '',
    pmEmail: env.PM_EMAIL || '',
    managerEmail: env.MANAGER_EMAIL || '',
  };

  if (config.clientId && config.clientSecret) {
    msalClient = new ConfidentialClientApplication({
      auth: {
        clientId: config.clientId,
        authority: `https://login.microsoftonline.com/${config.tenantId}`,
        clientSecret: config.clientSecret,
      },
    });
  }
}

async function getToken() {
  // Dev override
  if (process.env.GRAPH_TOKEN) return process.env.GRAPH_TOKEN;
  if (!msalClient) {
    throw new Error('No GRAPH_TOKEN and no MSAL client. Set AZURE_CLIENT_ID + SECRET or GRAPH_TOKEN.');
  }
  const result = await msalClient.acquireTokenByClientCredential({
    scopes: ['https://graph.microsoft.com/.default'],
  });
  return result.accessToken;
}

async function graphFetch(urlPath, options = {}) {
  const token = await getToken();
  const url = urlPath.startsWith('http') ? urlPath : `https://graph.microsoft.com/v1.0${urlPath}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  if (res.status === 204) return null;
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Graph API ${res.status}: ${text.substring(0, 300)}`);
  }
  return text ? JSON.parse(text) : null;
}

// ── SharePoint → Task mapping ──

function spItemToTask(item) {
  const f = item.fields || item;
  return {
    id:            f.TaskId || '',
    name:          f.Title || '',
    description:   f.Description1 || '',
    assignee:      f.Assignee || '',
    status:        f.Status || 'Do zrobienia',
    priority:      f.Priority || 'Średni',
    type:          f.TaskType || 'DEADLINE',
    category:      f.Category || '',
    start:         f.StartDate ? String(f.StartDate).split('T')[0] : null,
    due:           f.DueDate ? String(f.DueDate).split('T')[0] : null,
    completedDate: f.CompletedDate ? String(f.CompletedDate).split('T')[0] : null,
    est:           Number(f.EstHours) || 0,
    actual:        Number(f.ActualHours) || 0,
    progress:      Number(f.Progress) || 0,
    tags:          f.Tags ? String(f.Tags).split(',').map(t => t.trim()).filter(Boolean) : [],
    mode:          f.Mode || 'Rozłożone',
    dep:           f.Dependency || null,
    _spId:         item.id,
    lastUpdated:   item.lastModifiedDateTime || new Date().toISOString(),
  };
}

function taskToSpFields(task) {
  const fields = {};
  if (task.name !== undefined)          fields.Title = task.name;
  if (task.id !== undefined)            fields.TaskId = task.id;
  if (task.description !== undefined)   fields.Description1 = task.description;
  if (task.assignee !== undefined)      fields.Assignee = task.assignee;
  if (task.status !== undefined)        fields.Status = task.status;
  if (task.priority !== undefined)      fields.Priority = task.priority;
  if (task.type !== undefined)          fields.TaskType = task.type;
  if (task.category !== undefined)      fields.Category = task.category;
  if (task.start !== undefined)         fields.StartDate = task.start;
  if (task.due !== undefined)           fields.DueDate = task.due;
  if (task.completedDate !== undefined) fields.CompletedDate = task.completedDate;
  if (task.est !== undefined)           fields.EstHours = Number(task.est) || 0;
  if (task.actual !== undefined)        fields.ActualHours = Number(task.actual) || 0;
  if (task.progress !== undefined)      fields.Progress = Math.min(100, Math.max(0, Number(task.progress) || 0));
  if (task.tags !== undefined)          fields.Tags = Array.isArray(task.tags) ? task.tags.join(', ') : String(task.tags || '');
  if (task.mode !== undefined)          fields.Mode = task.mode;
  if (task.dep !== undefined)           fields.Dependency = task.dep || '';
  return fields;
}

// ── Data operations ──

async function getTasks() {
  const data = await graphFetch(
    `/sites/${config.siteId}/lists/${config.tasksListId}/items?expand=fields&$top=500`
  );
  return (data.value || []).map(spItemToTask).filter(t => t.id); // skip items without TaskId
}

async function getTeam() {
  if (config.teamListId) {
    try {
      const data = await graphFetch(
        `/sites/${config.siteId}/lists/${config.teamListId}/items?expand=fields&$top=100`
      );
      return (data.value || []).map(item => {
        const f = item.fields || item;
        return {
          id: f.MemberId || f.Title || '',
          name: f.Title || '',
          role: f.Role || '',
          hours: Number(f.Hours) || 40,
          email: f.Email || '',
          _spId: item.id,
        };
      });
    } catch (e) {
      console.warn('[Graph] Team list error, fallback to local:', e.message);
    }
  }
  // Local fallback
  const dataFile = path.join(__dirname, 'data.json');
  if (fs.existsSync(dataFile)) {
    return JSON.parse(fs.readFileSync(dataFile, 'utf8')).team || [];
  }
  return [];
}

async function createMember(member) {
  const fields = {
    Title: member.name,
    MemberId: member.id || member.name.replace(/\s+/g, '.').toLowerCase(),
    Role: member.role || '',
    Hours: Number(member.hours) || 40,
    Email: member.email || '',
  };
  const item = await graphFetch(
    `/sites/${config.siteId}/lists/${config.teamListId}/items`,
    { method: 'POST', body: JSON.stringify({ fields }) }
  );
  const fullItem = await graphFetch(
    `/sites/${config.siteId}/lists/${config.teamListId}/items/${item.id}?expand=fields`
  );
  const f = fullItem.fields || fullItem;
  return {
    id: f.MemberId || f.Title || '',
    name: f.Title || '',
    role: f.Role || '',
    hours: Number(f.Hours) || 40,
    email: f.Email || '',
    _spId: fullItem.id,
  };
}

async function updateMember(memberId, updates) {
  const team = await getTeam();
  const existing = team.find(m => m.id === memberId);
  if (!existing || !existing._spId) throw new Error(`Member ${memberId} not found in SharePoint`);

  const fields = {};
  if (updates.name !== undefined)  fields.Title = updates.name;
  if (updates.id !== undefined)    fields.MemberId = updates.id;
  if (updates.role !== undefined)  fields.Role = updates.role;
  if (updates.hours !== undefined) fields.Hours = Number(updates.hours) || 40;
  if (updates.email !== undefined) fields.Email = updates.email;

  await graphFetch(
    `/sites/${config.siteId}/lists/${config.teamListId}/items/${existing._spId}/fields`,
    { method: 'PATCH', body: JSON.stringify(fields) }
  );
  return { ...existing, ...updates };
}

async function deleteMember(memberId) {
  const team = await getTeam();
  const existing = team.find(m => m.id === memberId);
  if (!existing || !existing._spId) throw new Error(`Member ${memberId} not found in SharePoint`);

  await graphFetch(
    `/sites/${config.siteId}/lists/${config.teamListId}/items/${existing._spId}`,
    { method: 'DELETE' }
  );
  return { success: true };
}

async function createTask(task) {
  const fields = taskToSpFields(task);
  const item = await graphFetch(
    `/sites/${config.siteId}/lists/${config.tasksListId}/items`,
    { method: 'POST', body: JSON.stringify({ fields }) }
  );
  // SP POST response may not include all custom fields — read back the full item
  const fullItem = await graphFetch(
    `/sites/${config.siteId}/lists/${config.tasksListId}/items/${item.id}?expand=fields`
  );
  return spItemToTask(fullItem);
}

async function updateTask(taskId, updates) {
  const tasks = await getTasks();
  const existing = tasks.find(t => t.id === taskId);
  if (!existing || !existing._spId) throw new Error(`Task ${taskId} not found in SharePoint`);

  const fields = taskToSpFields(updates);
  await graphFetch(
    `/sites/${config.siteId}/lists/${config.tasksListId}/items/${existing._spId}/fields`,
    { method: 'PATCH', body: JSON.stringify(fields) }
  );
  return { ...existing, ...updates };
}

async function deleteTask(taskId) {
  const tasks = await getTasks();
  const existing = tasks.find(t => t.id === taskId);
  if (!existing || !existing._spId) throw new Error(`Task ${taskId} not found in SharePoint`);

  // Clear dependency refs
  const dependents = tasks.filter(t => t.dep === taskId);
  for (const dep of dependents) {
    await updateTask(dep.id, { dep: null });
  }

  await graphFetch(
    `/sites/${config.siteId}/lists/${config.tasksListId}/items/${existing._spId}`,
    { method: 'DELETE' }
  );
  return { success: true };
}

// ── Email via Graph API ──

async function sendEmail(to, subject, htmlBody) {
  if (!config.senderEmail) {
    console.warn('[Graph] No NOTIFICATION_SENDER_EMAIL, skipping');
    return;
  }
  const recipients = (Array.isArray(to) ? to : [to]).filter(Boolean);
  if (!recipients.length) return;

  await graphFetch(`/users/${config.senderEmail}/sendMail`, {
    method: 'POST',
    body: JSON.stringify({
      message: {
        subject,
        body: { contentType: 'HTML', content: htmlBody },
        toRecipients: recipients.map(email => ({ emailAddress: { address: email } })),
      },
      saveToSentItems: false,
    }),
  });
  console.log(`[Graph] Email → ${recipients.join(', ')}: ${subject}`);
}

async function sendAlertEmail(task, alertType, escalationLevel, assigneeEmail) {
  const dueStr = task.due || 'brak terminu';
  let subject, body, recipients;

  switch (alertType) {
    case 'overdue':
      subject = `[ALERT] Przeterminowane: ${task.name}`;
      body = `<h2 style="color:#ef4444">⏰ Przeterminowane zadanie</h2>
        <p><strong>${task.id}</strong> — ${task.name}</p>
        <p>Termin: <strong>${dueStr}</strong> | Przypisany: ${task.assignee} | Postęp: ${task.progress}%</p>
        <p>Kategoria: ${task.category}</p>
        <hr><p style="color:#94a3b8;font-size:11px">Task Manager K2 — automatyczne powiadomienie</p>`;
      recipients = [config.pmEmail, assigneeEmail];
      if (escalationLevel >= 4 && config.managerEmail) recipients.push(config.managerEmail);
      break;
    case 'deadline_soon':
      subject = `[Reminder] Deadline: ${task.name}`;
      body = `<h2 style="color:#eab308">⚠️ Zbliżający się termin</h2>
        <p><strong>${task.id}</strong> — ${task.name}</p>
        <p>Termin: <strong>${dueStr}</strong> | Przypisany: ${task.assignee} | Postęp: ${task.progress}%</p>
        <hr><p style="color:#94a3b8;font-size:11px">Task Manager K2 — automatyczne powiadomienie</p>`;
      recipients = [config.pmEmail, assigneeEmail];
      break;
    case 'blocked':
      subject = `[BLOCKED] ${task.name}`;
      body = `<h2 style="color:#f97316">🚫 Zablokowane zadanie</h2>
        <p><strong>${task.id}</strong> — ${task.name}</p>
        <p>Przypisany: ${task.assignee} | Zależność: ${task.dep || 'brak'}</p>
        <hr><p style="color:#94a3b8;font-size:11px">Task Manager K2 — automatyczne powiadomienie</p>`;
      recipients = [config.pmEmail, assigneeEmail];
      break;
    default:
      return;
  }

  // Deduplicate and filter empty/null
  const uniqueRecipients = [...new Set(recipients.filter(Boolean))];
  await sendEmail(uniqueRecipients, subject, body);
}

async function sendTaskNotification(task, type, extra = {}) {
  // type: 'created' | 'assigned' | 'status_changed' | 'updated'
  if (!config.senderEmail) return;

  let subject, body;
  const due = task.due ? new Date(task.due).toLocaleDateString('pl-PL') : 'brak terminu';

  switch (type) {
    case 'created':
      subject = `[Nowe zadanie] ${task.name}`;
      body = `<h2 style="color:#3b82f6">📋 Nowe zadanie</h2>
        <p>Zostało utworzone zadanie <strong>${task.id}</strong> — ${task.name}</p>
        <table style="border-collapse:collapse;font-size:14px;margin:12px 0">
          <tr><td style="padding:4px 12px 4px 0;color:#64748b">Przypisany:</td><td style="padding:4px 0"><strong>${task.assignee || '—'}</strong></td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#64748b">Priorytet:</td><td style="padding:4px 0">${task.priority}</td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#64748b">Kategoria:</td><td style="padding:4px 0">${task.category}</td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#64748b">Termin:</td><td style="padding:4px 0">${due}</td></tr>
          ${task.description ? `<tr><td style="padding:4px 12px 4px 0;color:#64748b">Opis:</td><td style="padding:4px 0">${task.description}</td></tr>` : ''}
        </table>
        <hr><p style="color:#94a3b8;font-size:11px">Task Manager K2 — automatyczne powiadomienie</p>`;
      break;
    case 'assigned':
      subject = `[Przypisano] ${task.name}`;
      body = `<h2 style="color:#8b5cf6">👤 Przypisano Ci zadanie</h2>
        <p><strong>${task.id}</strong> — ${task.name}</p>
        <table style="border-collapse:collapse;font-size:14px;margin:12px 0">
          <tr><td style="padding:4px 12px 4px 0;color:#64748b">Priorytet:</td><td style="padding:4px 0">${task.priority}</td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#64748b">Kategoria:</td><td style="padding:4px 0">${task.category}</td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#64748b">Termin:</td><td style="padding:4px 0">${due}</td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#64748b">Postęp:</td><td style="padding:4px 0">${task.progress}%</td></tr>
        </table>
        <hr><p style="color:#94a3b8;font-size:11px">Task Manager K2 — automatyczne powiadomienie</p>`;
      break;
    case 'status_changed':
      const statusColors = { 'Do zrobienia': '#94a3b8', 'W trakcie': '#3b82f6', 'Do weryfikacji': '#f59e0b', 'Zakończone': '#22c55e', 'Zablokowane': '#ef4444' };
      const color = statusColors[task.status] || '#3b82f6';
      subject = `[Status] ${task.name} → ${task.status}`;
      body = `<h2 style="color:${color}">🔄 Zmiana statusu zadania</h2>
        <p><strong>${task.id}</strong> — ${task.name}</p>
        ${extra.oldStatus ? `<p>Status: <span style="color:#94a3b8">${extra.oldStatus}</span> → <strong style="color:${color}">${task.status}</strong></p>` : `<p>Nowy status: <strong style="color:${color}">${task.status}</strong></p>`}
        <p>Przypisany: ${task.assignee} | Postęp: ${task.progress}% | Termin: ${due}</p>
        <hr><p style="color:#94a3b8;font-size:11px">Task Manager K2 — automatyczne powiadomienie</p>`;
      break;
    default:
      return;
  }

  // Collect recipients: assignee email + PM
  const recipients = [config.pmEmail, extra.assigneeEmail].filter(Boolean);
  const unique = [...new Set(recipients)];
  if (!unique.length) return;

  try {
    await sendEmail(unique, subject, body);
  } catch (e) {
    console.error(`[Notify] Error sending ${type} notification:`, e.message);
  }
}

async function checkAndSendAlerts() {
  try {
    const tasks = await getTasks();
    const team = await getTeam();
    const emailByName = {};
    team.forEach(m => { if (m.email) emailByName[m.name] = m.email; });
    const today = new Date().toISOString().split('T')[0];
    let sent = 0;

    for (const task of tasks) {
      if (task.status === 'Zakończone') continue;
      const assigneeEmail = emailByName[task.assignee] || '';

      if (task.due && task.due < today) {
        const days = Math.ceil((new Date(today) - new Date(task.due)) / 86400000);
        const level = days >= 7 ? 4 : days >= 3 ? 3 : days >= 1 ? 2 : 1;
        if (level >= 2) { await sendAlertEmail(task, 'overdue', level, assigneeEmail); sent++; }
      }

      if (task.due) {
        const daysUntil = Math.ceil((new Date(task.due) - new Date(today)) / 86400000);
        if (daysUntil >= 0 && daysUntil <= 1) { await sendAlertEmail(task, 'deadline_soon', 1, assigneeEmail); sent++; }
      }

      if (task.status === 'Zablokowane') { await sendAlertEmail(task, 'blocked', 2, assigneeEmail); sent++; }
    }

    console.log(`[Alerts] ${sent} alerts sent at ${new Date().toISOString()}`);
  } catch (e) {
    console.error('[Alerts] Error:', e.message);
  }
}

module.exports = {
  init, getTasks, getTeam, createTask, updateTask, deleteTask,
  createMember, updateMember, deleteMember,
  sendEmail, sendAlertEmail, sendTaskNotification, checkAndSendAlerts, getConfig: () => config,
};
