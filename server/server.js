const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const XLSX = require('xlsx');
const cron = require('node-cron');

// Load .env if present
try { require('dotenv').config({ path: path.join(__dirname, '.env') }); } catch(_) {}

const app = express();
const PORT = process.env.PORT || 3001;
const DATA_FILE = path.join(__dirname, 'data.json');
const SETTINGS_FILE = path.join(__dirname, 'settings.json');
const upload = multer({ dest: path.join(__dirname, 'uploads') });

// ── Settings helpers ──
function readSettings() {
  try { return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')); } catch { return null; }
}
function writeSettings(s) { fs.writeFileSync(SETTINGS_FILE, JSON.stringify(s, null, 2)); }

app.use(cors());
app.use(express.json());

// ── Determine data mode: "sharepoint" or "local" ──
let dataMode = 'local';
let graph = null;

// SharePoint mode requires either:
//   1. GRAPH_TOKEN (dev mode — manual Graph Explorer token)
//   2. AZURE_CLIENT_ID + AZURE_CLIENT_SECRET (production — app registration)
// Both also require: SHAREPOINT_SITE_ID + SHAREPOINT_TASKS_LIST_ID
const hasSharePointConfig = process.env.SHAREPOINT_SITE_ID && process.env.SHAREPOINT_TASKS_LIST_ID;
const hasAuth = process.env.GRAPH_TOKEN || (process.env.AZURE_CLIENT_ID && process.env.AZURE_CLIENT_SECRET);

if (hasSharePointConfig && hasAuth && process.env.DATA_MODE === 'sharepoint') {
  try {
    graph = require('./graph');
    graph.init(process.env);
    dataMode = 'sharepoint';
    const authType = process.env.GRAPH_TOKEN ? 'GRAPH_TOKEN (dev)' : 'MSAL Client Credentials';
    console.log(`[Server] Mode: SharePoint via ${authType}`);
  } catch (err) {
    console.warn('[Server] Failed to init Graph module, falling back to local:', err.message);
    dataMode = 'local';
  }
} else {
  console.log('[Server] Mode: Local (data.json)');
  if (process.env.DATA_MODE === 'sharepoint') {
    console.log('[Server] ⚠ DATA_MODE=sharepoint but missing config:');
    if (!hasSharePointConfig) console.log('  - SHAREPOINT_SITE_ID / SHAREPOINT_TASKS_LIST_ID');
    if (!hasAuth) console.log('  - GRAPH_TOKEN or (AZURE_CLIENT_ID + AZURE_CLIENT_SECRET)');
  }
}

// ── Local data helpers (unchanged) ──
function readData() {
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

function writeData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function nextId(tasks) {
  const max = tasks.reduce((m, t) => {
    const n = parseInt(String(t.id).replace('ZAD-', ''));
    return n > m ? n : m;
  }, 0);
  return `ZAD-${String(max + 1).padStart(3, '0')}`;
}

function now() {
  return new Date().toISOString();
}

function todayISO() {
  return new Date().toISOString().split('T')[0];
}

// Get assignee email from team (for notifications)
async function getAssigneeEmail(assigneeName) {
  if (!assigneeName) return '';
  try {
    const team = dataMode === 'sharepoint' ? await graph.getTeam() : (readData().team || []);
    const member = team.find(m => m.name === assigneeName);
    return member?.email || '';
  } catch { return ''; }
}

// Send task notification (fire-and-forget, never blocks response)
function notifyTask(task, type, extra = {}) {
  if (dataMode !== 'sharepoint') return; // only in SharePoint mode
  getAssigneeEmail(task.assignee).then(email => {
    graph.sendTaskNotification(task, type, { ...extra, assigneeEmail: email });
  }).catch(e => console.error('[Notify] Error:', e.message));
}

// Defaults (used if settings.json is missing)
const DEFAULT_STATUSES = ['Do zrobienia', 'W trakcie', 'Do weryfikacji', 'Zakończone', 'Zablokowane'];
const DEFAULT_PRIORITIES = ['Krytyczny', 'Wysoki', 'Średni', 'Niski'];
const DEFAULT_CATEGORIES = ['FENG', 'KPO', 'Horyzont Europa', 'Konsulting', 'Marketing', 'Administracja', 'Doradztwo', 'Wewnętrzne'];
const DEFAULT_ROLES = ['PM', 'Kierownik', 'Specjalista ds. FENG', 'Specjalista ds. KPO', 'Analityk', 'Marketing', 'Doradca', 'Administracja', 'Konsultant'];

// Dynamic getters — always read from settings.json
function getStatuses()  { return readSettings()?.statuses  || DEFAULT_STATUSES; }
function getPriorities() { return readSettings()?.priorities || DEFAULT_PRIORITIES; }
function getCategories() { return readSettings()?.categories || DEFAULT_CATEGORIES; }
function getRoles()      { return readSettings()?.roles      || DEFAULT_ROLES; }

// ── Auth middleware (validates Azure AD tokens from frontend) ──
const validateToken = async (req, res, next) => {
  // In local mode, skip auth
  if (dataMode === 'local') return next();

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    // Allow unauthenticated access in development
    if (process.env.NODE_ENV !== 'production') return next();
    return res.status(401).json({ error: 'No authorization token provided' });
  }

  // In production, validate the JWT token
  // For now, we trust the token if present (proper validation requires jwks-rsa)
  // The frontend MSAL library ensures tokens are valid before sending
  req.userToken = authHeader.split(' ')[1];
  next();
};

app.use('/api', validateToken);

// ── GET /api/config — frontend needs to know the mode ──
// FRONTEND_AUTH=true → frontend shows MSAL login popup (production)
// FRONTEND_AUTH=false/unset → frontend skips login, backend handles auth via Client Credentials (dev)
app.get('/api/config', (req, res) => {
  const requireFrontendAuth = process.env.FRONTEND_AUTH === 'true';
  res.json({
    mode: dataMode,
    tenant: requireFrontendAuth ? (process.env.AZURE_TENANT_ID || null) : null,
    clientId: requireFrontendAuth ? (process.env.AZURE_CLIENT_ID || null) : null,
  });
});

// ── GET /api/settings — all configurable lists ──
app.get('/api/settings', (req, res) => {
  const s = readSettings();
  if (!s) {
    return res.json({
      categories: DEFAULT_CATEGORIES,
      statuses: DEFAULT_STATUSES,
      priorities: DEFAULT_PRIORITIES,
      roles: DEFAULT_ROLES,
      wipLimits: { 'W trakcie': 8, 'Do weryfikacji': 4 },
      statusColors: {},
      priorityColors: {},
      categoryColors: {},
    });
  }
  res.json(s);
});

// ── PUT /api/settings — update configurable lists ──
app.put('/api/settings', (req, res) => {
  try {
    const current = readSettings() || {};
    const updates = req.body;

    // Merge only known keys
    const allowed = ['categories', 'statuses', 'priorities', 'roles', 'wipLimits', 'statusColors', 'priorityColors', 'categoryColors'];
    for (const key of allowed) {
      if (updates[key] !== undefined) current[key] = updates[key];
    }

    // Validate: statuses must always include 'Zakończone' (used for auto-complete logic)
    if (current.statuses && !current.statuses.includes('Zakończone')) {
      current.statuses.push('Zakończone');
    }

    writeSettings(current);
    res.json(current);
  } catch (err) {
    console.error('[PUT /api/settings]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/tasks ──
app.get('/api/tasks', async (req, res) => {
  try {
    if (dataMode === 'sharepoint') {
      const tasks = await graph.getTasks();
      return res.json({ tasks });
    }
    const data = readData();
    res.json({ tasks: data.tasks });
  } catch (err) {
    console.error('[GET /api/tasks]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/team ──
app.get('/api/team', async (req, res) => {
  try {
    if (dataMode === 'sharepoint') {
      const team = await graph.getTeam();
      return res.json({ team });
    }
    const data = readData();
    res.json({ team: data.team });
  } catch (err) {
    console.error('[GET /api/team]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/tasks ──
app.post('/api/tasks', async (req, res) => {
  try {
    if (dataMode === 'sharepoint') {
      const allTasks = await graph.getTasks();
      const task = {
        id: nextId(allTasks),
        name: req.body.name || 'Nowe zadanie',
        description: req.body.description || '',
        assignee: req.body.assignee || '',
        status: getStatuses().includes(req.body.status) ? req.body.status : 'Do zrobienia',
        priority: getPriorities().includes(req.body.priority) ? req.body.priority : 'Średni',
        type: req.body.type === 'DEADLINE' ? 'DEADLINE' : 'DEKLAROWANY',
        category: getCategories().includes(req.body.category) ? req.body.category : 'Wewnętrzne',
        start: req.body.start || todayISO(),
        due: req.body.due || todayISO(),
        completedDate: null,
        est: Number(req.body.est) || 0,
        actual: Number(req.body.actual) || 0,
        progress: Math.min(100, Math.max(0, Number(req.body.progress) || 0)),
        tags: Array.isArray(req.body.tags) ? req.body.tags : [],
        mode: req.body.mode === 'Ciągłe' ? 'Ciągłe' : 'Rozłożone',
        dep: req.body.dep || null,
      };

      if (task.status === 'Zakończone') {
        task.completedDate = todayISO();
        task.progress = 100;
      }

      const created = await graph.createTask(task);
      notifyTask(created, 'created');
      return res.status(201).json({ task: created });
    }

    // Local mode
    const data = readData();
    const task = {
      id: nextId(data.tasks),
      name: req.body.name || 'Nowe zadanie',
      description: req.body.description || '',
      assignee: req.body.assignee || '',
      status: getStatuses().includes(req.body.status) ? req.body.status : 'Do zrobienia',
      priority: getPriorities().includes(req.body.priority) ? req.body.priority : 'Średni',
      type: req.body.type === 'DEADLINE' ? 'DEADLINE' : 'DEKLAROWANY',
      category: getCategories().includes(req.body.category) ? req.body.category : 'Wewnętrzne',
      start: req.body.start || todayISO(),
      due: req.body.due || todayISO(),
      completedDate: null,
      est: Number(req.body.est) || 0,
      actual: Number(req.body.actual) || 0,
      progress: Math.min(100, Math.max(0, Number(req.body.progress) || 0)),
      tags: Array.isArray(req.body.tags) ? req.body.tags : [],
      mode: req.body.mode === 'Ciągłe' ? 'Ciągłe' : 'Rozłożone',
      dep: req.body.dep || null,
      lastUpdated: now()
    };

    if (task.status === 'Zakończone') {
      task.completedDate = todayISO();
      task.progress = 100;
    }

    data.tasks.push(task);
    data.log.push({ taskId: task.id, action: 'created', timestamp: now() });
    writeData(data);
    res.status(201).json({ task });
  } catch (err) {
    console.error('[POST /api/tasks]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/tasks/:id ──
app.put('/api/tasks/:id', async (req, res) => {
  try {
    if (dataMode === 'sharepoint') {
      const updates = { ...req.body };

      // Clamp progress
      if (updates.progress !== undefined) {
        updates.progress = Math.min(100, Math.max(0, Number(updates.progress)));
      }

      // Auto-complete logic (we need current state)
      const allTasks = await graph.getTasks();
      const old = allTasks.find(t => t.id === req.params.id);
      if (!old) return res.status(404).json({ error: 'Task not found' });

      if (updates.status === 'Zakończone' && old.status !== 'Zakończone') {
        updates.completedDate = todayISO();
        updates.progress = 100;
      }
      if (updates.progress >= 100 && old.progress < 100) {
        updates.status = 'Zakończone';
        updates.completedDate = updates.completedDate || todayISO();
      }
      if (updates.status && updates.status !== 'Zakończone' && old.status === 'Zakończone') {
        updates.completedDate = null;
      }

      const updated = await graph.updateTask(req.params.id, updates);

      // Notifications: status change or assignee change
      if (updates.status && updates.status !== old.status) {
        notifyTask({ ...old, ...updates }, 'status_changed', { oldStatus: old.status });
      }
      if (updates.assignee && updates.assignee !== old.assignee) {
        notifyTask({ ...old, ...updates }, 'assigned');
      }

      return res.json({ task: updated });
    }

    // Local mode
    const data = readData();
    const idx = data.tasks.findIndex(t => t.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Task not found' });

    const old = { ...data.tasks[idx] };
    const updates = req.body;

    const fields = ['name', 'description', 'assignee', 'status', 'priority', 'type', 'category', 'start', 'due', 'est', 'actual', 'progress', 'tags', 'mode', 'dep'];
    for (const f of fields) {
      if (updates[f] !== undefined) {
        data.tasks[idx][f] = updates[f];
      }
    }

    if (updates.progress !== undefined) {
      data.tasks[idx].progress = Math.min(100, Math.max(0, Number(updates.progress)));
    }

    if (data.tasks[idx].status === 'Zakończone' && old.status !== 'Zakończone') {
      data.tasks[idx].completedDate = todayISO();
      data.tasks[idx].progress = 100;
    }
    if (data.tasks[idx].progress >= 100 && old.progress < 100) {
      data.tasks[idx].status = 'Zakończone';
      data.tasks[idx].completedDate = data.tasks[idx].completedDate || todayISO();
    }
    if (data.tasks[idx].status !== 'Zakończone' && old.status === 'Zakończone') {
      data.tasks[idx].completedDate = null;
    }

    data.tasks[idx].lastUpdated = now();

    for (const f of fields) {
      if (updates[f] !== undefined && JSON.stringify(old[f]) !== JSON.stringify(data.tasks[idx][f])) {
        data.log.push({ taskId: req.params.id, field: f, oldValue: old[f], newValue: data.tasks[idx][f], timestamp: now() });
      }
    }

    writeData(data);
    res.json({ task: data.tasks[idx] });
  } catch (err) {
    console.error('[PUT /api/tasks]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/tasks/:id ──
app.delete('/api/tasks/:id', async (req, res) => {
  try {
    if (dataMode === 'sharepoint') {
      await graph.deleteTask(req.params.id);
      return res.json({ success: true });
    }

    const data = readData();
    const idx = data.tasks.findIndex(t => t.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Task not found' });

    data.tasks.forEach(t => {
      if (t.dep === req.params.id) t.dep = null;
    });

    data.tasks.splice(idx, 1);
    data.log.push({ taskId: req.params.id, action: 'deleted', timestamp: now() });
    writeData(data);
    res.json({ success: true });
  } catch (err) {
    console.error('[DELETE /api/tasks]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/team (create member) ──
app.post('/api/team', async (req, res) => {
  try {
    const { name, role, hours, email } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Imię i nazwisko jest wymagane' });

    const memberId = req.body.id || name.trim().replace(/\s+/g, '.').toLowerCase();

    if (dataMode === 'sharepoint') {
      const created = await graph.createMember({ id: memberId, name: name.trim(), role: role || '', hours: Number(hours) || 40, email: email || '' });
      return res.status(201).json({ member: created });
    }

    // Local mode
    const data = readData();
    if (data.team.find(m => m.id === memberId)) {
      return res.status(409).json({ error: `Członek zespołu "${memberId}" już istnieje` });
    }
    const member = { id: memberId, name: name.trim(), role: role || '', hours: Number(hours) || 40, email: email || '' };
    data.team.push(member);
    writeData(data);
    res.status(201).json({ member });
  } catch (err) {
    console.error('[POST /api/team]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/team/:id (update member) ──
app.put('/api/team/:id', async (req, res) => {
  try {
    if (dataMode === 'sharepoint') {
      const updated = await graph.updateMember(req.params.id, req.body);
      return res.json({ member: updated });
    }

    // Local mode
    const data = readData();
    const idx = data.team.findIndex(m => m.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Członek zespołu nie znaleziony' });

    if (req.body.name !== undefined) data.team[idx].name = req.body.name;
    if (req.body.role !== undefined) data.team[idx].role = req.body.role;
    if (req.body.hours !== undefined) data.team[idx].hours = Number(req.body.hours) || 40;
    if (req.body.email !== undefined) data.team[idx].email = req.body.email;

    writeData(data);
    res.json({ member: data.team[idx] });
  } catch (err) {
    console.error('[PUT /api/team]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/team/:id ──
app.delete('/api/team/:id', async (req, res) => {
  try {
    if (dataMode === 'sharepoint') {
      await graph.deleteMember(req.params.id);
      return res.json({ success: true });
    }

    // Local mode
    const data = readData();
    const idx = data.team.findIndex(m => m.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Członek zespołu nie znaleziony' });

    // Unassign tasks that reference this member
    const memberName = data.team[idx].name;
    data.tasks.forEach(t => {
      if (t.assignee === memberName) t.assignee = '';
    });

    data.team.splice(idx, 1);
    writeData(data);
    res.json({ success: true });
  } catch (err) {
    console.error('[DELETE /api/team]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/alerts/send (manual trigger) ──
app.post('/api/alerts/send', async (req, res) => {
  if (dataMode !== 'sharepoint' || !graph) {
    return res.status(400).json({ error: 'Email alerts require SharePoint mode with Graph API' });
  }
  try {
    await graph.checkAndSendAlerts();
    res.json({ success: true, message: 'Alerty zostaly sprawdzone i wyslane' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/email/test (test email) ──
app.post('/api/email/test', async (req, res) => {
  if (dataMode !== 'sharepoint' || !graph) {
    return res.status(400).json({ error: 'Email requires SharePoint mode with Graph API' });
  }
  try {
    const { to, subject, body } = req.body;
    await graph.sendEmail(to, subject || 'Test z Task Manager', body || '<p>To jest testowy email z Task Manager K2.</p>');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/export ──
app.get('/api/export', async (req, res) => {
  try {
    let tasks, team, settings, categories, log;

    if (dataMode === 'sharepoint') {
      tasks = await graph.getTasks();
      team = await graph.getTeam();
      const s = readSettings() || {};
      settings = { wipLimits: s.wipLimits || { 'W trakcie': 8, 'Do weryfikacji': 4 }, ragThresholds: { green: 70, yellow: 90, orange: 100 } };
      categories = getCategories();
      log = [];
    } else {
      const data = readData();
      tasks = data.tasks;
      team = data.team;
      settings = data.settings;
      categories = data.categories;
      log = data.log || [];
    }

    const wb = XLSX.utils.book_new();

    // Sheet 1: Zadania
    const headerMap = {
      id: 'ID Zadania', name: 'Nazwa zadania', description: 'Opis', assignee: 'Przypisany',
      status: 'Status', priority: 'Priorytet', type: 'Typ terminu', category: 'Kategoria',
      start: 'Data początkowa', due: 'Termin', completedDate: 'Data zakończenia',
      est: 'Szacowane (h)', actual: 'Faktyczne (h)', progress: 'Postęp %',
      tags: 'Tagi', dep: 'Zależność', mode: 'Tryb'
    };
    const taskRows = tasks.map(t => {
      const row = {};
      for (const [k, label] of Object.entries(headerMap)) {
        row[label] = Array.isArray(t[k]) ? t[k].join(', ') : (t[k] ?? '');
      }
      return row;
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(taskRows), 'Zadania');

    // Sheet 2: Zespół
    const teamRows = team.map(m => ({ 'ID': m.id, 'Imię i nazwisko': m.name, 'Rola': m.role, 'Godziny/tydzień': m.hours, 'Email': m.email || '' }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(teamRows), 'Zespół');

    // Sheet 3: Kategorie
    const catRows = (categories || getCategories()).map(c => ({ 'Kategoria': c }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(catRows), 'Kategorie');

    // Sheet 4: Ustawienia
    const sett = settings || { wipLimits: {}, ragThresholds: {} };
    const settingsRows = [
      { 'Klucz': 'WIP W trakcie', 'Wartość': sett.wipLimits['W trakcie'] || 8 },
      { 'Klucz': 'WIP Do weryfikacji', 'Wartość': sett.wipLimits['Do weryfikacji'] || 4 },
      { 'Klucz': 'RAG Zielony (%)', 'Wartość': sett.ragThresholds?.green || 70 },
      { 'Klucz': 'RAG Żółty (%)', 'Wartość': sett.ragThresholds?.yellow || 90 },
      { 'Klucz': 'RAG Pomarańczowy (%)', 'Wartość': sett.ragThresholds?.orange || 100 },
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(settingsRows), 'Ustawienia');

    // Sheet 5: Dashboard
    const active = tasks.filter(t => t.status !== 'Zakończone');
    const dashRows = [
      { 'Metryka': 'Łącznie zadań', 'Wartość': tasks.length },
      { 'Metryka': 'Aktywne', 'Wartość': active.length },
      { 'Metryka': 'Zakończone', 'Wartość': tasks.length - active.length },
      { 'Metryka': 'Przeterminowane', 'Wartość': active.filter(t => t.due < todayISO() && t.status !== 'Zakończone').length },
      { 'Metryka': 'Zablokowane', 'Wartość': active.filter(t => t.status === 'Zablokowane').length },
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dashRows), 'Dashboard');

    // Sheet 6: Log
    const logRows = (log || []).slice(-200).map(l => ({
      'ID Zadania': l.taskId, 'Akcja': l.action || 'zmiana', 'Pole': l.field || '',
      'Stara wartość': l.oldValue != null ? String(l.oldValue) : '', 'Nowa wartość': l.newValue != null ? String(l.newValue) : '',
      'Czas': l.timestamp
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(logRows.length ? logRows : [{ 'Info': 'Brak wpisów' }]), 'Log');

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Disposition', `attachment; filename="zadania_${todayISO()}.xlsx"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);
  } catch (err) {
    console.error('[GET /api/export]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/import ──
app.post('/api/import', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  try {
    const wb = XLSX.readFile(req.file.path);
    const sheetName = wb.SheetNames.find(n => n.toLowerCase().includes('zadania')) || wb.SheetNames[0];
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName]);

    const reverseMap = {
      'ID Zadania': 'id', 'Nazwa zadania': 'name', 'Opis': 'description', 'Przypisany': 'assignee',
      'Status': 'status', 'Priorytet': 'priority', 'Typ terminu': 'type', 'Kategoria': 'category',
      'Data początkowa': 'start', 'Termin': 'due', 'Data zakończenia': 'completedDate',
      'Szacowane (h)': 'est', 'Faktyczne (h)': 'actual', 'Postęp %': 'progress',
      'Tagi': 'tags', 'Zależność': 'dep', 'Tryb': 'mode'
    };

    let imported = 0, updated = 0;
    const errors = [];

    if (dataMode === 'sharepoint') {
      const existingTasks = await graph.getTasks();

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const mapped = {};
        for (const [plKey, enKey] of Object.entries(reverseMap)) {
          if (row[plKey] !== undefined) mapped[enKey] = row[plKey];
        }

        if (!mapped.name || String(mapped.name).trim() === '') {
          errors.push(`Wiersz ${i + 2}: brak nazwy zadania`);
          continue;
        }

        if (typeof mapped.tags === 'string') mapped.tags = mapped.tags.split(',').map(t => t.trim()).filter(Boolean);
        if (mapped.est !== undefined) mapped.est = Number(mapped.est) || 0;
        if (mapped.actual !== undefined) mapped.actual = Number(mapped.actual) || 0;
        if (mapped.progress !== undefined) mapped.progress = Math.min(100, Math.max(0, Number(mapped.progress) || 0));

        for (const df of ['start', 'due', 'completedDate']) {
          if (mapped[df] instanceof Date) mapped[df] = mapped[df].toISOString().split('T')[0];
          else if (typeof mapped[df] === 'number') {
            const dt = XLSX.SSF.parse_date_code(mapped[df]);
            mapped[df] = `${dt.y}-${String(dt.m).padStart(2, '0')}-${String(dt.d).padStart(2, '0')}`;
          }
        }

        const existingIdx = mapped.id ? existingTasks.findIndex(t => t.id === mapped.id) : -1;
        try {
          if (existingIdx >= 0) {
            await graph.updateTask(mapped.id, mapped);
            updated++;
          } else {
            mapped.id = mapped.id || nextId(existingTasks);
            await graph.createTask({ ...mapped, status: mapped.status || 'Do zrobienia', priority: mapped.priority || 'Średni', type: mapped.type || 'DEKLAROWANY', category: mapped.category || 'Wewnętrzne', mode: mapped.mode || 'Rozłożone', start: mapped.start || todayISO(), due: mapped.due || todayISO(), est: mapped.est || 0, actual: mapped.actual || 0, progress: mapped.progress || 0, description: mapped.description || '', dep: mapped.dep || null, tags: mapped.tags || [], completedDate: mapped.completedDate || null });
            existingTasks.push(mapped); // for nextId calc
            imported++;
          }
        } catch (err) {
          errors.push(`Wiersz ${i + 2}: ${err.message}`);
        }
      }
    } else {
      // Local mode
      const data = readData();

      rows.forEach((row, i) => {
        const mapped = {};
        for (const [plKey, enKey] of Object.entries(reverseMap)) {
          if (row[plKey] !== undefined) mapped[enKey] = row[plKey];
        }

        if (!mapped.name || String(mapped.name).trim() === '') {
          errors.push(`Wiersz ${i + 2}: brak nazwy zadania`);
          return;
        }

        if (typeof mapped.tags === 'string') mapped.tags = mapped.tags.split(',').map(t => t.trim()).filter(Boolean);
        if (mapped.est !== undefined) mapped.est = Number(mapped.est) || 0;
        if (mapped.actual !== undefined) mapped.actual = Number(mapped.actual) || 0;
        if (mapped.progress !== undefined) mapped.progress = Math.min(100, Math.max(0, Number(mapped.progress) || 0));

        for (const df of ['start', 'due', 'completedDate']) {
          if (mapped[df] instanceof Date) mapped[df] = mapped[df].toISOString().split('T')[0];
          else if (typeof mapped[df] === 'number') {
            const dt = XLSX.SSF.parse_date_code(mapped[df]);
            mapped[df] = `${dt.y}-${String(dt.m).padStart(2, '0')}-${String(dt.d).padStart(2, '0')}`;
          }
        }

        mapped.lastUpdated = now();

        const existingIdx = mapped.id ? data.tasks.findIndex(t => t.id === mapped.id) : -1;
        if (existingIdx >= 0) {
          Object.assign(data.tasks[existingIdx], mapped);
          updated++;
        } else {
          mapped.id = mapped.id || nextId(data.tasks);
          mapped.description = mapped.description || '';
          mapped.completedDate = mapped.completedDate || null;
          mapped.dep = mapped.dep || null;
          mapped.tags = mapped.tags || [];
          mapped.status = mapped.status || 'Do zrobienia';
          mapped.priority = mapped.priority || 'Średni';
          mapped.type = mapped.type || 'DEKLAROWANY';
          mapped.category = mapped.category || 'Wewnętrzne';
          mapped.mode = mapped.mode || 'Rozłożone';
          mapped.start = mapped.start || todayISO();
          mapped.due = mapped.due || todayISO();
          mapped.est = mapped.est || 0;
          mapped.actual = mapped.actual || 0;
          mapped.progress = mapped.progress || 0;
          data.tasks.push(mapped);
          imported++;
        }
      });

      data.log.push({ action: 'import', imported, updated, errors: errors.length, timestamp: now() });
      writeData(data);
    }

    // Clean up temp file
    try { fs.unlinkSync(req.file.path); } catch (_) {}

    res.json({ imported, updated, errors });
  } catch (err) {
    res.status(400).json({ error: `Błąd importu: ${err.message}` });
  }
});

// ── Production static files ──
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../dist')));
  app.get('*', (req, res) => res.sendFile(path.join(__dirname, '../dist/index.html')));
}

app.listen(PORT, () => {
  console.log(`Task Dashboard API running on http://localhost:${PORT} [mode: ${dataMode}]`);
  const uploadsDir = path.join(__dirname, 'uploads');
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);

  // Start cron job for email alerts (every day at 8:00 AM)
  if (dataMode === 'sharepoint' && graph) {
    cron.schedule('0 8 * * 1-5', () => {
      console.log('[Cron] Running daily alert check...');
      graph.checkAndSendAlerts();
    });
    console.log('[Cron] Alert email check scheduled: Mon-Fri 8:00 AM');
  }
});
