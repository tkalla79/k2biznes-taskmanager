import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, CartesianGrid, Legend, LineChart, Line, AreaChart, Area, ReferenceLine } from "recharts";

// ── DEFAULTS (overridden by /api/settings) ──
const DEF_CATEGORIES = ["FENG","KPO","Horyzont Europa","Konsulting","Marketing","Administracja","Doradztwo","Wewnętrzne"];
const DEF_CAT_COLORS = {"FENG":"#1B73E8","KPO":"#34A853","Horyzont Europa":"#9C27B0","Konsulting":"#FF6D00","Marketing":"#E91E63","Administracja":"#607D8B","Doradztwo":"#00BCD4","Wewnętrzne":"#795548"};
const DEF_STATUSES = ["Do zrobienia","W trakcie","Do weryfikacji","Zakończone","Zablokowane"];
const DEF_STATUS_COLORS = {"Do zrobienia":"#94a3b8","W trakcie":"#3b82f6","Do weryfikacji":"#f59e0b","Zakończone":"#22c55e","Zablokowane":"#ef4444"};
const DEF_PRIORITIES = ["Krytyczny","Wysoki","Średni","Niski"];
const DEF_PRIORITY_COLORS = {"Krytyczny":"#dc2626","Wysoki":"#f97316","Średni":"#eab308","Niski":"#94a3b8"};
const DEF_WIP_LIMITS = {"W trakcie":8,"Do weryfikacji":4};
const DEF_ROLES = ["PM","Kierownik","Specjalista ds. FENG","Specjalista ds. KPO","Analityk","Marketing","Doradca","Administracja","Konsultant"];
const PRIORITY_ICONS = {"Krytyczny":"▲▲","Wysoki":"▲","Średni":"—","Niski":"▼"};
const COLOR_PALETTE = ["#3b82f6","#22c55e","#f59e0b","#ef4444","#8b5cf6","#ec4899","#14b8a6","#f97316","#6366f1","#06b6d4","#84cc16","#a855f7","#0ea5e9","#d946ef","#10b981"];

const buildCfg = (settings) => ({
  CATEGORIES: settings?.categories || DEF_CATEGORIES,
  CAT_COLORS: settings?.categoryColors || DEF_CAT_COLORS,
  STATUSES: settings?.statuses || DEF_STATUSES,
  STATUS_COLORS: settings?.statusColors || DEF_STATUS_COLORS,
  PRIORITIES: settings?.priorities || DEF_PRIORITIES,
  PRIORITY_COLORS: settings?.priorityColors || DEF_PRIORITY_COLORS,
  WIP_LIMITS: settings?.wipLimits || DEF_WIP_LIMITS,
  ROLES: settings?.roles || DEF_ROLES,
});

// ── HELPERS ──
const today = new Date().toISOString().split("T")[0];
const daysBetween = (a,b) => Math.ceil((new Date(b)-new Date(a))/(1000*60*60*24));
const daysFromToday = (d) => daysBetween(today, d);
const fmtDate = (iso) => { if(!iso) return "—"; const dt=new Date(iso); const days=["niedz.","pon.","wt.","śr.","czw.","pt.","sob."]; return `${dt.getDate().toString().padStart(2,"0")}.${(dt.getMonth()+1).toString().padStart(2,"0")} (${days[dt.getDay()]})`; };
const remaining = (t) => t.est * (1 - t.progress/100);
const addDays = (iso, n) => { const dt=new Date(iso); dt.setDate(dt.getDate()+n); return dt.toISOString().split("T")[0]; };

const getAlert = (t) => {
  if(t.status==="Zakończone") return {level:"ok",text:"✓ OK",color:"#22c55e",alerts:[]};
  const alerts = [];
  const dd = daysFromToday(t.due);
  if(t.status==="Zablokowane") alerts.push({type:"blocked",severity:"high"});
  if(dd<0) alerts.push({type:"overdue",days:Math.abs(dd),severity:Math.abs(dd)>=7?"critical":Math.abs(dd)>=3?"high":"medium"});
  if(dd>=0 && dd<=2) alerts.push({type:"soon",days:dd,severity:dd===0?"high":"medium"});
  if(t.status==="W trakcie" && t.lastUpdated) {
    const daysSinceUpdate = daysBetween(t.lastUpdated.split("T")[0], today);
    if(daysSinceUpdate > 3) alerts.push({type:"stale",daysSinceUpdate,severity:"medium"});
  }
  if(t.status==="W trakcie" && t.start && t.due) {
    const elapsed = Math.max(0, daysBetween(t.start, today));
    const total = daysBetween(t.start, t.due);
    if(total > 0) {
      const expected = (elapsed / total) * 100;
      if(t.progress < expected * 0.6 && expected > 20) alerts.push({type:"at_risk",expected:Math.round(expected),severity:"medium"});
    }
  }
  if(alerts.length===0) return {level:"ok",text:"✅ OK",color:"#22c55e",alerts:[]};
  const primary = alerts[0];
  const text = primary.type==="overdue"?`🔴 Przeterminowane (${primary.days}d)`:primary.type==="blocked"?"⛔ Zablokowane":primary.type==="soon"?`🟡 Deadline za ${primary.days}d`:primary.type==="stale"?`🟠 Brak postępu (${primary.daysSinceUpdate}d)`:`⚠️ Zagrożone`;
  const color = primary.type==="overdue"?"#dc2626":primary.type==="blocked"?"#ef4444":primary.type==="soon"?"#eab308":primary.type==="stale"?"#f97316":"#f59e0b";
  return {level:primary.type,text,color,alerts};
};

const getEscalation = (daysOverdue) => {
  if(daysOverdue>=7) return {level:4,badges:["badge","email","pm","kierownik"],label:"Krytyczne opóźnienie",color:"#dc2626"};
  if(daysOverdue>=3) return {level:3,badges:["badge","email","pm"],label:"Wymaga eskalacji",color:"#ef4444"};
  if(daysOverdue>=1) return {level:2,badges:["badge","email"],label:"Przeterminowane",color:"#f97316"};
  return {level:1,badges:["badge"],label:"Deadline dziś",color:"#eab308"};
};

// ── STYLES ──
const S = {
  tooltip: {background:"#1e293b",border:"1px solid #334155",borderRadius:8,fontSize:12,color:"#e2e8f0"},
  sectionTitle: {margin:"0 0 12px",fontSize:13,fontWeight:600,color:"#94a3b8"},
  btn: {padding:"5px 12px",borderRadius:6,border:"1px solid #334155",background:"transparent",color:"#94a3b8",fontSize:11.5,cursor:"pointer",transition:"all .15s"},
  btnPrimary: {padding:"5px 12px",borderRadius:6,border:"none",background:"#3b82f6",color:"#fff",fontSize:11.5,cursor:"pointer",fontWeight:500},
  input: {padding:"6px 10px",borderRadius:6,border:"1px solid #334155",background:"#0f172a",color:"#e2e8f0",fontSize:12,outline:"none",width:"100%",boxSizing:"border-box"},
};

// ── API HELPERS ──
const API = "/api";
const api = {
  getTasks: () => fetch(`${API}/tasks`).then(r=>r.json()).then(d=>d.tasks),
  getTeam: () => fetch(`${API}/team`).then(r=>r.json()).then(d=>d.team),
  createTask: (t) => fetch(`${API}/tasks`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(t)}).then(r=>r.json()),
  updateTask: (id,t) => fetch(`${API}/tasks/${id}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(t)}).then(r=>r.json()),
  deleteTask: (id) => fetch(`${API}/tasks/${id}`,{method:"DELETE"}).then(r=>r.json()),
  createMember: (m) => fetch(`${API}/team`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(m)}).then(r=>r.json()),
  updateMember: (id,m) => fetch(`${API}/team/${encodeURIComponent(id)}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(m)}).then(r=>r.json()),
  deleteMember: (id) => fetch(`${API}/team/${encodeURIComponent(id)}`,{method:"DELETE"}).then(r=>r.json()),
  getSettings: () => fetch(`${API}/settings`).then(r=>r.json()),
  updateSettings: (s) => fetch(`${API}/settings`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(s)}).then(async r=>{ const d=await r.json(); return r.ok?{ok:true,...d}:{ok:false,error:d.error||"Błąd zapisu"}; }),
};

// ── MAIN APP ──
export default function TaskDashboard({ msalUser = null }) {
  const [tasks, setTasks] = useState([]);
  const [team, setTeam] = useState([]);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("dashboard");
  const [filterAssignee, setFilterAssignee] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterPriority, setFilterPriority] = useState("all");
  const [showDone, setShowDone] = useState(false);
  const [draggedTask, setDraggedTask] = useState(null);
  const [selectedTask, setSelectedTask] = useState(null);
  const [editingTask, setEditingTask] = useState(null); // null=closed, {}=new, task=edit
  const [editingMember, setEditingMember] = useState(null); // null=closed, {}=new, member=edit
  const [timelineZoom, setTimelineZoom] = useState("week");
  const [activeRole, setActiveRole] = useState("PM");
  const [activeUser, setActiveUser] = useState("all");
  const fileInputRef = useRef(null);

  // Dynamic settings (loaded from /api/settings)
  const cfg = useMemo(() => buildCfg(settings), [settings]);
  const { CATEGORIES, CAT_COLORS, STATUSES, STATUS_COLORS, PRIORITIES, PRIORITY_COLORS, WIP_LIMITS, ROLES } = cfg;

  const fetchTasks = useCallback(async () => {
    try {
      const [t, m, s] = await Promise.all([api.getTasks(), api.getTeam(), api.getSettings()]);
      setTasks(t); setTeam(m); setSettings(s); setLoading(false);
    } catch { setLoading(false); }
  }, []);

  useEffect(() => { fetchTasks(); const iv = setInterval(fetchTasks, 10000); return ()=>clearInterval(iv); }, [fetchTasks]);

  const filtered = useMemo(() => {
    let f = tasks;
    if(!showDone) f = f.filter(t => t.status !== "Zakończone");
    if(filterAssignee !== "all") f = f.filter(t => t.assignee === filterAssignee);
    if(filterCategory !== "all") f = f.filter(t => t.category === filterCategory);
    if(filterPriority !== "all") f = f.filter(t => t.priority === filterPriority);
    if(activeRole === "Specjalista" && activeUser !== "all") f = f.filter(t => t.assignee === activeUser);
    return f;
  }, [tasks, filterAssignee, filterCategory, filterPriority, showDone, activeRole, activeUser]);

  const active = useMemo(() => tasks.filter(t => t.status !== "Zakończone"), [tasks]);

  const moveTask = useCallback(async (taskId, newStatus) => {
    await api.updateTask(taskId, {status:newStatus, progress: newStatus==="Zakończone"?100:undefined});
    fetchTasks();
  }, [fetchTasks]);

  const updateProgress = useCallback(async (taskId, progress) => {
    await api.updateTask(taskId, {progress: Math.min(100, Math.max(0, progress))});
    fetchTasks();
  }, [fetchTasks]);

  const updateTaskDates = useCallback(async (taskId, start, due) => {
    await api.updateTask(taskId, {start, due});
    fetchTasks();
  }, [fetchTasks]);

  const handleSaveTask = useCallback(async (taskData) => {
    if(taskData.id) { await api.updateTask(taskData.id, taskData); }
    else { await api.createTask(taskData); }
    setEditingTask(null);
    fetchTasks();
  }, [fetchTasks]);

  const handleDeleteTask = useCallback(async (id) => {
    if(!window.confirm("Czy na pewno chcesz usunąć to zadanie?")) return;
    await api.deleteTask(id);
    setEditingTask(null); setSelectedTask(null);
    fetchTasks();
  }, [fetchTasks]);

  const handleSaveMember = useCallback(async (memberData) => {
    if(memberData._isEdit) {
      const { _isEdit, _originalId, ...updates } = memberData;
      await api.updateMember(_originalId, updates);
    } else {
      await api.createMember(memberData);
    }
    setEditingMember(null);
    fetchTasks();
  }, [fetchTasks]);

  const handleDeleteMember = useCallback(async (id) => {
    if(!window.confirm("Czy na pewno chcesz usunąć tego członka zespołu? Zadania przypisane do tej osoby zostaną odłączone.")) return;
    await api.deleteMember(id);
    setEditingMember(null);
    fetchTasks();
  }, [fetchTasks]);

  const handleExport = async () => {
    const res = await fetch(`${API}/export`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href=url; a.download=`zadania_${today}.xlsx`; a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async (e) => {
    const file = e.target.files[0];
    if(!file) return;
    const fd = new FormData(); fd.append("file", file);
    const res = await fetch(`${API}/import`, {method:"POST", body:fd});
    const data = await res.json();
    alert(`Zaimportowano: ${data.imported} nowych, ${data.updated} zaktualizowanych.${data.errors?.length?`\nBłędy:\n${data.errors.join("\n")}`:""}`);
    fetchTasks();
    e.target.value = "";
  };

  // KPI data
  const kpis = useMemo(() => {
    const total = tasks.length;
    const done = tasks.filter(t=>t.status==="Zakończone").length;
    const overdue = active.filter(t=>getAlert(t).level==="overdue").length;
    const blocked = active.filter(t=>t.status==="Zablokowane").length;
    const soon = active.filter(t=>getAlert(t).level==="soon").length;
    const avgProg = active.length ? Math.round(active.reduce((s,t)=>s+t.progress,0)/active.length) : 0;
    const totalRemaining = Math.round(active.reduce((s,t)=>s+remaining(t),0));
    const completed = tasks.filter(t=>t.status==="Zakończone" && t.completedDate && t.start);
    const avgDays = completed.length ? Math.round(completed.reduce((s,t)=>s+daysBetween(t.start,t.completedDate),0)/completed.length) : 0;
    return {total,done,overdue,blocked,soon,avgProg,totalRemaining,active:active.length,avgDays};
  }, [tasks, active]);

  // Settings save handler
  const handleSaveSettings = useCallback(async (newSettings) => {
    const res = await api.updateSettings(newSettings);
    if(res.ok) { const {ok, ...data} = res; setSettings(data); }
    return res;
  }, []);

  // Role-based views
  const viewsByRole = {
    PM: [{id:"dashboard",label:"📊 Dashboard"},{id:"kanban",label:"📋 Kanban"},{id:"timeline",label:"📅 Timeline"},{id:"workload",label:"👥 Obciążenie"},{id:"alerts",label:"🔔 Alerty"},{id:"settings",label:"⚙️ Ustawienia"}],
    Specjalista: [{id:"mytasks",label:"📋 Moje zadania"},{id:"alerts",label:"🔔 Alerty"}],
    Kierownik: [{id:"portfolio",label:"📊 Portfolio"},{id:"workload",label:"👥 Obciążenie"},{id:"alerts",label:"🔔 Alerty"}],
  };
  const availableViews = viewsByRole[activeRole] || viewsByRole.PM;
  useEffect(() => {
    if(!availableViews.find(v=>v.id===view)) setView(availableViews[0].id);
  }, [activeRole]);

  if(loading) return <div style={{fontFamily:"'Segoe UI',system-ui,sans-serif",background:"#0f172a",minHeight:"100vh",color:"#e2e8f0",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>Ładowanie...</div>;

  return (
    <div style={{fontFamily:"'Segoe UI',system-ui,sans-serif",background:"#0f172a",minHeight:"100vh",color:"#e2e8f0"}}>
      {/* HEADER */}
      <header style={{background:"linear-gradient(135deg,#1e293b 0%,#0f172a 100%)",borderBottom:"1px solid #334155",padding:"10px 24px",display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:100}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <div style={{width:36,height:36,borderRadius:8,background:"linear-gradient(135deg,#3b82f6,#8b5cf6)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,fontWeight:700}}>T</div>
          <div>
            <h1 style={{margin:0,fontSize:17,fontWeight:700,color:"#f8fafc",letterSpacing:"-0.02em"}}>Task Manager</h1>
            <span style={{fontSize:11,color:"#64748b"}}>Zespół · {fmtDate(today)}</span>
          </div>
        </div>
        <div style={{display:"flex",gap:4,alignItems:"center"}}>
          {availableViews.map(v => (
            <button key={v.id} onClick={()=>setView(v.id)} style={{padding:"7px 14px",borderRadius:6,border:"none",background:view===v.id?"#3b82f6":"transparent",color:view===v.id?"#fff":"#94a3b8",fontSize:12.5,fontWeight:view===v.id?600:400,cursor:"pointer",transition:"all .15s"}}>{v.label}</button>
          ))}
          <div style={{width:1,height:24,background:"#334155",margin:"0 6px"}} />
          <button onClick={()=>setEditingTask({})} style={{...S.btnPrimary,fontSize:13,padding:"7px 14px"}}>+ Zadanie</button>
          <button onClick={handleExport} title="Eksportuj do Excel" style={S.btn}>📥 Excel</button>
          <button onClick={()=>fileInputRef.current?.click()} title="Importuj z Excel" style={S.btn}>📤 Import</button>
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls" hidden onChange={handleImport} />
          {msalUser && <>
            <div style={{width:1,height:24,background:"#334155",margin:"0 6px"}} />
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <div style={{width:28,height:28,borderRadius:"50%",background:"linear-gradient(135deg,#3b82f6,#8b5cf6)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:700,color:"#fff"}}>{msalUser.split(" ").map(n=>n[0]).join("").slice(0,2)}</div>
              <span style={{fontSize:11,color:"#94a3b8",maxWidth:120,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{msalUser}</span>
            </div>
          </>}
        </div>
      </header>

      {/* FILTERS + ROLE BAR */}
      <div style={{padding:"8px 24px",background:"#1e293b",borderBottom:"1px solid #334155",display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
        <span style={{fontSize:11,color:"#64748b",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.05em"}}>Rola:</span>
        {["PM","Specjalista","Kierownik"].map(r=>(
          <button key={r} onClick={()=>setActiveRole(r)} style={{padding:"3px 10px",borderRadius:5,border:activeRole===r?"1px solid #3b82f6":"1px solid #334155",background:activeRole===r?"#3b82f620":"transparent",color:activeRole===r?"#3b82f6":"#94a3b8",fontSize:11,cursor:"pointer"}}>{r}</button>
        ))}
        {activeRole==="Specjalista" && <>
          <div style={{width:1,height:16,background:"#334155"}} />
          <Sel value={activeUser} onChange={setActiveUser} options={[{v:"all",l:"Wybierz osobę"},...team.map(t=>({v:t.name,l:t.name}))]} />
        </>}
        <div style={{width:1,height:16,background:"#334155"}} />
        <span style={{fontSize:11,color:"#64748b",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.05em"}}>Filtry:</span>
        <Sel value={filterAssignee} onChange={setFilterAssignee} options={[{v:"all",l:"Wszyscy"},...team.map(t=>({v:t.name,l:t.name}))]} />
        <Sel value={filterCategory} onChange={setFilterCategory} options={[{v:"all",l:"Kategorie"},...CATEGORIES.map(c=>({v:c,l:c}))]} />
        <Sel value={filterPriority} onChange={setFilterPriority} options={[{v:"all",l:"Priorytet"},...PRIORITIES.map(p=>({v:p,l:p}))]} />
        <label style={{fontSize:12,color:"#94a3b8",display:"flex",alignItems:"center",gap:5,cursor:"pointer"}}>
          <input type="checkbox" checked={showDone} onChange={e=>setShowDone(e.target.checked)} style={{accentColor:"#3b82f6"}} /> Zakończone
        </label>
        <span style={{marginLeft:"auto",fontSize:11,color:"#475569"}}>{filtered.length} zadań</span>
      </div>

      {/* CONTENT */}
      <main style={{padding:20}}>
        {view === "dashboard" && <DashboardView tasks={tasks} active={active} filtered={filtered} kpis={kpis} team={team} cfg={cfg} />}
        {view === "kanban" && <KanbanView tasks={filtered} moveTask={moveTask} draggedTask={draggedTask} setDraggedTask={setDraggedTask} setSelectedTask={setSelectedTask} team={team} cfg={cfg} />}
        {view === "timeline" && <TimelineView tasks={filtered} zoom={timelineZoom} setZoom={setTimelineZoom} allTasks={tasks} onUpdateDates={updateTaskDates} onCreateTask={()=>setEditingTask({})} cfg={cfg} />}
        {view === "workload" && <WorkloadView tasks={active} team={team} onAddMember={()=>setEditingMember({})} onEditMember={(m)=>setEditingMember(m)} onDeleteMember={handleDeleteMember} cfg={cfg} />}
        {view === "alerts" && <AlertsView tasks={active} setSelectedTask={setSelectedTask} />}
        {view === "mytasks" && <MyTasksView tasks={filtered} setSelectedTask={setSelectedTask} team={team} cfg={cfg} />}
        {view === "portfolio" && <PortfolioView tasks={tasks} active={active} kpis={kpis} team={team} />}
        {view === "settings" && <SettingsView settings={settings} onSave={handleSaveSettings} cfg={cfg} />}
      </main>

      {/* TASK DETAIL MODAL */}
      {selectedTask && <TaskModal task={selectedTask} team={team} onClose={()=>setSelectedTask(null)} onUpdateProgress={updateProgress} onMoveTask={moveTask} onEdit={(t)=>{setSelectedTask(null);setEditingTask(t);}} cfg={cfg} />}

      {/* TASK FORM MODAL */}
      {editingTask !== null && <TaskFormModal task={editingTask.id ? editingTask : null} team={team} tasks={tasks} onSave={handleSaveTask} onDelete={handleDeleteTask} onClose={()=>setEditingTask(null)} cfg={cfg} />}

      {/* TEAM MEMBER MODAL */}
      {editingMember !== null && <TeamMemberModal member={editingMember.id ? editingMember : null} onSave={handleSaveMember} onDelete={handleDeleteMember} onClose={()=>setEditingMember(null)} cfg={cfg} />}
    </div>
  );
}

// ── SHARED COMPONENTS ──
function Sel({value,onChange,options}) {
  return <select value={value} onChange={e=>onChange(e.target.value)} style={{padding:"5px 10px",borderRadius:6,border:"1px solid #334155",background:"#0f172a",color:"#e2e8f0",fontSize:12,cursor:"pointer",outline:"none"}}>{options.map(o=><option key={o.v} value={o.v}>{o.l}</option>)}</select>;
}

function Card({children,style={}}) {
  return <div style={{background:"#1e293b",borderRadius:10,border:"1px solid #334155",overflow:"hidden",...style}}>{children}</div>;
}

function KpiCard({label,value,sub,color="#3b82f6",icon}) {
  return (
    <Card style={{padding:"16px 18px",minWidth:140,flex:1}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
        <div>
          <div style={{fontSize:11,color:"#64748b",fontWeight:500,marginBottom:4,textTransform:"uppercase",letterSpacing:"0.04em"}}>{label}</div>
          <div style={{fontSize:28,fontWeight:700,color,lineHeight:1.1}}>{value}</div>
          {sub && <div style={{fontSize:11,color:"#475569",marginTop:3}}>{sub}</div>}
        </div>
        {icon && <span style={{fontSize:22,opacity:.5}}>{icon}</span>}
      </div>
    </Card>
  );
}

function MetaItem({label,value}) {
  return <div><div style={{fontSize:10,color:"#64748b",marginBottom:2}}>{label}</div><div style={{fontSize:12,color:"#e2e8f0"}}>{value}</div></div>;
}

// ── TASK FORM MODAL (Create / Edit) ──
function TaskFormModal({task, team, tasks, onSave, onDelete, onClose, cfg}) {
  const { CATEGORIES, STATUSES, PRIORITIES } = cfg;
  const isEdit = !!task;
  const [form, setForm] = useState(task || {
    name:"", description:"", assignee:team[0]?.name||"", status:"Do zrobienia", priority:"Średni",
    type:"DEKLAROWANY", category:"Wewnętrzne", start:today, due:addDays(today,7),
    est:0, actual:0, progress:0, tags:[], mode:"Rozłożone", dep:null
  });
  const [tagInput, setTagInput] = useState((task?.tags||[]).join(", "));

  const set = (field, val) => setForm(prev=>({...prev,[field]:val}));

  const handleSubmit = (e) => {
    e.preventDefault();
    if(!form.name.trim()) return alert("Nazwa zadania jest wymagana");
    const tags = tagInput.split(",").map(t=>t.trim()).filter(Boolean).map(t=>t.startsWith("#")?t:`#${t}`);
    onSave({...form, tags, est:Number(form.est)||0, actual:Number(form.actual)||0, progress:Number(form.progress)||0});
  };

  const fieldStyle = S.input;
  const labelStyle = {fontSize:11,color:"#64748b",marginBottom:3,display:"block",fontWeight:500};

  return (
    <div onClick={onClose} style={{position:"fixed",inset:0,background:"#00000080",backdropFilter:"blur(4px)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200}}>
      <form onClick={e=>e.stopPropagation()} onSubmit={handleSubmit} style={{background:"#1e293b",borderRadius:14,border:"1px solid #334155",width:"94%",maxWidth:600,maxHeight:"90vh",overflow:"auto"}}>
        <div style={{padding:"16px 20px",borderBottom:"1px solid #334155",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <h2 style={{margin:0,fontSize:16,fontWeight:700,color:"#f1f5f9"}}>{isEdit?"Edytuj zadanie":"Nowe zadanie"}</h2>
          <button type="button" onClick={onClose} style={{background:"none",border:"none",color:"#64748b",fontSize:20,cursor:"pointer"}}>✕</button>
        </div>
        <div style={{padding:"16px 20px",display:"flex",flexDirection:"column",gap:12}}>
          <div>
            <label style={labelStyle}>Nazwa zadania *</label>
            <input value={form.name} onChange={e=>set("name",e.target.value)} style={fieldStyle} placeholder="Wpisz nazwę..." required />
          </div>
          <div>
            <label style={labelStyle}>Opis</label>
            <textarea value={form.description||""} onChange={e=>set("description",e.target.value)} style={{...fieldStyle,minHeight:60,resize:"vertical"}} placeholder="Opcjonalny opis..." />
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <div>
              <label style={labelStyle}>Przypisany *</label>
              <select value={form.assignee} onChange={e=>set("assignee",e.target.value)} style={fieldStyle}>
                {team.map(m=><option key={m.id} value={m.name}>{m.name} ({m.role})</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Kategoria</label>
              <select value={form.category} onChange={e=>set("category",e.target.value)} style={fieldStyle}>
                {CATEGORIES.map(c=><option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Status</label>
              <select value={form.status} onChange={e=>set("status",e.target.value)} style={fieldStyle}>
                {STATUSES.map(s=><option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Priorytet</label>
              <select value={form.priority} onChange={e=>set("priority",e.target.value)} style={fieldStyle}>
                {PRIORITIES.map(p=><option key={p} value={p}>{PRIORITY_ICONS[p]} {p}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Typ terminu</label>
              <select value={form.type} onChange={e=>set("type",e.target.value)} style={fieldStyle}>
                <option value="DEADLINE">DEADLINE</option><option value="DEKLAROWANY">DEKLAROWANY</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Tryb</label>
              <select value={form.mode} onChange={e=>set("mode",e.target.value)} style={fieldStyle}>
                <option value="Rozłożone">Rozłożone</option><option value="Ciągłe">Ciągłe</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Data początkowa</label>
              <input type="date" value={form.start||""} onChange={e=>set("start",e.target.value)} style={fieldStyle} />
            </div>
            <div>
              <label style={labelStyle}>Termin</label>
              <input type="date" value={form.due||""} onChange={e=>set("due",e.target.value)} style={fieldStyle} />
            </div>
            <div>
              <label style={labelStyle}>Szacowane (h)</label>
              <input type="number" min={0} value={form.est} onChange={e=>set("est",e.target.value)} style={fieldStyle} />
            </div>
            <div>
              <label style={labelStyle}>Faktyczne (h)</label>
              <input type="number" min={0} value={form.actual} onChange={e=>set("actual",e.target.value)} style={fieldStyle} />
            </div>
          </div>
          <div>
            <label style={labelStyle}>Postęp: {form.progress}%</label>
            <input type="range" min={0} max={100} step={5} value={form.progress} onChange={e=>set("progress",Number(e.target.value))} style={{width:"100%",accentColor:"#3b82f6"}} />
          </div>
          <div>
            <label style={labelStyle}>Tagi (oddzielone przecinkami)</label>
            <input value={tagInput} onChange={e=>setTagInput(e.target.value)} style={fieldStyle} placeholder="#tag1, #tag2" />
          </div>
          <div>
            <label style={labelStyle}>Zależność (blokujące zadanie)</label>
            <select value={form.dep||""} onChange={e=>set("dep",e.target.value||null)} style={fieldStyle}>
              <option value="">Brak</option>
              {tasks.filter(t=>t.id!==form.id).map(t=><option key={t.id} value={t.id}>{t.id}: {t.name}</option>)}
            </select>
          </div>
        </div>
        <div style={{padding:"12px 20px",borderTop:"1px solid #334155",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            {isEdit && <button type="button" onClick={()=>onDelete(task.id)} style={{...S.btn,color:"#ef4444",borderColor:"#ef444440"}}>Usuń zadanie</button>}
          </div>
          <div style={{display:"flex",gap:8}}>
            <button type="button" onClick={onClose} style={S.btn}>Anuluj</button>
            <button type="submit" style={S.btnPrimary}>{isEdit?"Zapisz zmiany":"Utwórz zadanie"}</button>
          </div>
        </div>
      </form>
    </div>
  );
}

// ── TEAM MEMBER MODAL ──
function TeamMemberModal({member, onSave, onDelete, onClose, cfg}) {
  const { ROLES } = cfg;
  const isEdit = !!member;
  const [form, setForm] = useState(member ? {name:member.name, role:member.role, hours:member.hours, email:member.email||""} : {name:"", role:"Specjalista ds. FENG", hours:40, email:""});
  const set = (f,v) => setForm(prev=>({...prev,[f]:v}));

  const handleSubmit = (e) => {
    e.preventDefault();
    if(!form.name.trim()) return alert("Imię i nazwisko jest wymagane");
    if(form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return alert("Nieprawidłowy format adresu email");
    if(isEdit) {
      onSave({...form, _isEdit:true, _originalId:member.id, hours:Number(form.hours)||40});
    } else {
      onSave({...form, hours:Number(form.hours)||40});
    }
  };

  const labelStyle = {fontSize:11,color:"#64748b",marginBottom:3,display:"block",fontWeight:500};

  return (
    <div onClick={onClose} style={{position:"fixed",inset:0,background:"#00000080",backdropFilter:"blur(4px)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200}}>
      <form onClick={e=>e.stopPropagation()} onSubmit={handleSubmit} style={{background:"#1e293b",borderRadius:14,border:"1px solid #334155",width:"94%",maxWidth:440}}>
        <div style={{padding:"16px 20px",borderBottom:"1px solid #334155",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <h2 style={{margin:0,fontSize:16,fontWeight:700,color:"#f1f5f9"}}>{isEdit?"Edytuj członka zespołu":"Nowy członek zespołu"}</h2>
          <button type="button" onClick={onClose} style={{background:"none",border:"none",color:"#64748b",fontSize:20,cursor:"pointer"}}>✕</button>
        </div>
        <div style={{padding:"16px 20px",display:"flex",flexDirection:"column",gap:14}}>
          <div>
            <label style={labelStyle}>Imię i nazwisko *</label>
            <input value={form.name} onChange={e=>set("name",e.target.value)} style={S.input} placeholder="np. Jan Kowalski" required />
          </div>
          <div>
            <label style={labelStyle}>Email</label>
            <input type="email" value={form.email} onChange={e=>set("email",e.target.value)} style={S.input} placeholder="np. jan.kowalski@k2biznes.pl" />
          </div>
          <div>
            <label style={labelStyle}>Rola</label>
            <select value={form.role} onChange={e=>set("role",e.target.value)} style={S.input}>
              {ROLES.map(r=><option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Godziny / tydzień</label>
            <input type="number" min={1} max={80} value={form.hours} onChange={e=>set("hours",e.target.value)} style={S.input} />
          </div>
        </div>
        <div style={{padding:"12px 20px",borderTop:"1px solid #334155",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            {isEdit && <button type="button" onClick={()=>onDelete(member.id)} style={{...S.btn,color:"#ef4444",borderColor:"#ef444440"}}>Usuń</button>}
          </div>
          <div style={{display:"flex",gap:8}}>
            <button type="button" onClick={onClose} style={S.btn}>Anuluj</button>
            <button type="submit" style={S.btnPrimary}>{isEdit?"Zapisz":"Dodaj do zespołu"}</button>
          </div>
        </div>
      </form>
    </div>
  );
}

// ── TASK DETAIL MODAL ──
function TaskModal({task,team,onClose,onUpdateProgress,onMoveTask,onEdit,cfg}) {
  const { STATUSES, STATUS_COLORS, PRIORITIES, PRIORITY_COLORS, CAT_COLORS } = cfg;
  const [prog, setProg] = useState(task.progress);
  const alert_ = getAlert(task);
  const member = team.find(m=>m.name===task.assignee);

  return (
    <div onClick={onClose} style={{position:"fixed",inset:0,background:"#00000080",backdropFilter:"blur(4px)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200}}>
      <div onClick={e=>e.stopPropagation()} style={{background:"#1e293b",borderRadius:14,border:"1px solid #334155",width:"90%",maxWidth:520,maxHeight:"85vh",overflow:"auto"}}>
        <div style={{padding:"16px 20px",borderBottom:"1px solid #334155",display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
          <div>
            <div style={{fontSize:10,color:"#64748b",marginBottom:2}}>{task.id}</div>
            <div style={{fontSize:16,fontWeight:700,color:"#f1f5f9",lineHeight:1.3}}>{task.name}</div>
          </div>
          <div style={{display:"flex",gap:6}}>
            <button onClick={()=>onEdit(task)} style={{...S.btn,fontSize:11}}>✏️ Edytuj</button>
            <button onClick={onClose} style={{background:"none",border:"none",color:"#64748b",fontSize:20,cursor:"pointer",padding:4}}>✕</button>
          </div>
        </div>
        <div style={{padding:"16px 20px",display:"flex",flexDirection:"column",gap:14}}>
          {alert_.level !== "ok" && (
            <div style={{padding:"8px 12px",borderRadius:8,background:alert_.color+"15",border:`1px solid ${alert_.color}30`,fontSize:12,fontWeight:500,color:alert_.color}}>
              {alert_.text} {task.due && `· Termin: ${fmtDate(task.due)}`}
            </div>
          )}
          {task.description && <div style={{fontSize:12,color:"#cbd5e1",lineHeight:1.5,padding:"8px 0",borderBottom:"1px solid #334155"}}>{task.description}</div>}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <MetaItem label="Przypisany" value={<div style={{display:"flex",alignItems:"center",gap:6}}><div style={{width:20,height:20,borderRadius:"50%",background:member?.color,display:"flex",alignItems:"center",justifyContent:"center",fontSize:8,fontWeight:700,color:"#fff"}}>{member?.avatar}</div>{task.assignee}</div>} />
            <MetaItem label="Status" value={<span style={{padding:"2px 8px",borderRadius:4,background:STATUS_COLORS[task.status]+"25",color:STATUS_COLORS[task.status],fontSize:11,fontWeight:500}}>{task.status}</span>} />
            <MetaItem label="Priorytet" value={<span style={{color:PRIORITY_COLORS[task.priority],fontWeight:600}}>{PRIORITY_ICONS[task.priority]} {task.priority}</span>} />
            <MetaItem label="Kategoria" value={<span style={{color:CAT_COLORS[task.category]}}>{task.category}</span>} />
            <MetaItem label="Typ terminu" value={<span style={{color:task.type==="DEADLINE"?"#ef4444":"#64748b",fontWeight:task.type==="DEADLINE"?600:400}}>{task.type}</span>} />
            <MetaItem label="Tryb" value={task.mode} />
            <MetaItem label="Okres" value={`${fmtDate(task.start)} → ${fmtDate(task.due)}`} />
            <MetaItem label="Szacowane / Faktyczne" value={`${task.est}h / ${task.actual}h`} />
            <MetaItem label="Pozostało" value={`${remaining(task).toFixed(1)}h`} />
            {task.dep && <MetaItem label="Zależność" value={<span style={{color:"#ef4444"}}>⛓ {task.dep}</span>} />}
          </div>
          <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
            {(task.tags||[]).map(tag => <span key={tag} style={{padding:"2px 8px",borderRadius:4,background:"#334155",color:"#94a3b8",fontSize:10.5}}>{tag}</span>)}
          </div>
          <div style={{padding:"12px 14px",background:"#0f172a",borderRadius:8}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
              <span style={{fontSize:12,fontWeight:600,color:"#e2e8f0"}}>Postęp</span>
              <span style={{fontSize:18,fontWeight:700,color:"#3b82f6"}}>{prog}%</span>
            </div>
            <input type="range" min={0} max={100} step={5} value={prog} onChange={e=>setProg(Number(e.target.value))} style={{width:"100%",accentColor:"#3b82f6"}} />
            <div style={{display:"flex",gap:6,marginTop:8}}>
              <button onClick={()=>{onUpdateProgress(task.id, prog); onClose();}} style={{flex:1,...S.btnPrimary}}>Zapisz postęp</button>
              {task.status !== "Zakończone" && <button onClick={()=>{onMoveTask(task.id,"Zakończone"); onClose();}} style={{padding:"7px 12px",borderRadius:6,border:"1px solid #22c55e",background:"transparent",color:"#22c55e",fontSize:12,fontWeight:500,cursor:"pointer"}}>✓ Zakończ</button>}
            </div>
          </div>
          <div>
            <div style={{fontSize:11,color:"#64748b",marginBottom:6,fontWeight:500}}>Zmień status:</div>
            <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
              {STATUSES.filter(s=>s!==task.status).map(s => (
                <button key={s} onClick={()=>{onMoveTask(task.id,s); onClose();}} style={{padding:"4px 10px",borderRadius:5,border:`1px solid ${STATUS_COLORS[s]}40`,background:"transparent",color:STATUS_COLORS[s],fontSize:11,cursor:"pointer"}}>{s}</button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── DASHBOARD VIEW ──
function DashboardView({tasks,active,filtered,kpis,team,cfg}) {
  const { STATUSES, STATUS_COLORS, CATEGORIES } = cfg;
  const statusData = STATUSES.map(s => ({name:s,value:tasks.filter(t=>t.status===s).length,color:STATUS_COLORS[s]}));
  const planVsActual = CATEGORIES.map(c => {
    const ct = tasks.filter(t=>t.category===c);
    return {name:c,Plan:ct.reduce((s,t)=>s+t.est,0),Realizacja:ct.reduce((s,t)=>s+t.actual,0)};
  }).filter(c=>c.Plan>0);

  const burndown = [];
  for(let i=13;i>=0;i--) {
    const dt = new Date(); dt.setDate(dt.getDate()-i);
    const label = `${dt.getDate()}.${dt.getMonth()+1}`;
    const ideal = Math.max(0, 18 - (14-i) * 1.2);
    const actual = Math.max(0, 18 - (14-i) * 0.9 + Math.sin(i)*1.2);
    burndown.push({name:label,Idealne:Math.round(ideal*10)/10,Faktyczne:Math.round(actual*10)/10});
  }

  const workloadData = team.map(m => {
    const mt = active.filter(t=>t.assignee===m.name);
    const rem = mt.reduce((s,t)=>s+remaining(t),0);
    const util = m.hours>0?Math.round(rem/m.hours*100):0;
    const color = util<=70?"#22c55e":util<=90?"#eab308":util<=100?"#f97316":"#ef4444";
    return {name:m.name.split(" ")[0],Wykorzystanie:util,color};
  });

  const overdueByPerson = team.map(m => {
    const ct = active.filter(t=>t.assignee===m.name && getAlert(t).level==="overdue").length;
    return {name:m.name.split(" ")[0],Przeterminowane:ct};
  }).filter(d=>d.Przeterminowane>0);

  return (
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      {/* KPI ROW */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(155px,1fr))",gap:10}}>
        <KpiCard label="Aktywne" value={kpis.active} sub={`z ${kpis.total} łącznie`} icon="📋" />
        <KpiCard label="Zakończone" value={kpis.done} sub={`${kpis.total?Math.round(kpis.done/kpis.total*100):0}% realizacji`} color="#22c55e" icon="✓" />
        <KpiCard label="Przeterminowane" value={kpis.overdue} color="#ef4444" icon="🔴" sub={kpis.overdue>0?"Wymaga uwagi!":""} />
        <KpiCard label="Zbliżające się" value={kpis.soon} color="#eab308" icon="🟡" sub="deadline ≤2 dni" />
        <KpiCard label="Zablokowane" value={kpis.blocked} color="#f97316" icon="⛔" />
        <KpiCard label="Śr. czas realizacji" value={`${kpis.avgDays}d`} color="#8b5cf6" icon="⏱️" sub={`śr. postęp: ${kpis.avgProg}%`} />
      </div>
      {/* CHARTS — 3×2 */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:14}}>
        {/* 1. Plan vs Realizacja */}
        <Card style={{padding:16}}>
          <h3 style={S.sectionTitle}>Zadania: plan vs realizacja</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={planVsActual}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="name" tick={{fill:"#64748b",fontSize:9}} angle={-30} textAnchor="end" height={50} />
              <YAxis tick={{fill:"#64748b",fontSize:10}} />
              <Tooltip contentStyle={S.tooltip} />
              <Legend wrapperStyle={{fontSize:11}} />
              <Bar dataKey="Plan" fill="#3b82f6" radius={[3,3,0,0]} />
              <Bar dataKey="Realizacja" fill="#22c55e" radius={[3,3,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
        {/* 2. Obciążenie */}
        <Card style={{padding:16}}>
          <h3 style={S.sectionTitle}>Obciążenie zespołu</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={workloadData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis type="number" domain={[0,150]} tick={{fill:"#64748b",fontSize:10}} />
              <YAxis type="category" dataKey="name" tick={{fill:"#94a3b8",fontSize:10}} width={70} />
              <Tooltip contentStyle={S.tooltip} formatter={(v)=>`${v}%`} />
              <ReferenceLine x={100} stroke="#ef444480" strokeDasharray="3 3" />
              <Bar dataKey="Wykorzystanie" radius={[0,4,4,0]}>
                {workloadData.map((e,i)=><Cell key={i} fill={e.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>
        {/* 3. Przeterminowane */}
        <Card style={{padding:16}}>
          <h3 style={S.sectionTitle}>Przeterminowane zadania</h3>
          <div style={{textAlign:"center",marginBottom:10}}>
            <span style={{fontSize:42,fontWeight:700,color:kpis.overdue>0?"#ef4444":"#22c55e"}}>{kpis.overdue}</span>
            <div style={{fontSize:11,color:"#64748b"}}>{kpis.overdue===0?"Brak przeterminowanych":"zadań po terminie"}</div>
          </div>
          {overdueByPerson.length > 0 && (
            <ResponsiveContainer width="100%" height={100}>
              <BarChart data={overdueByPerson} layout="vertical">
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="name" tick={{fill:"#94a3b8",fontSize:10}} width={65} />
                <Bar dataKey="Przeterminowane" fill="#ef4444" radius={[0,4,4,0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>
        {/* 4. Burndown */}
        <Card style={{padding:16}}>
          <h3 style={S.sectionTitle}>Wykres spalania (burndown)</h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={burndown}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="name" tick={{fill:"#64748b",fontSize:10}} />
              <YAxis tick={{fill:"#64748b",fontSize:10}} />
              <Tooltip contentStyle={S.tooltip} />
              <Line type="monotone" dataKey="Idealne" stroke="#475569" strokeDasharray="5 5" dot={false} />
              <Line type="monotone" dataKey="Faktyczne" stroke="#3b82f6" strokeWidth={2} dot={{r:2}} />
              <Legend wrapperStyle={{fontSize:11}} />
            </LineChart>
          </ResponsiveContainer>
        </Card>
        {/* 5. Rozkład statusów */}
        <Card style={{padding:16}}>
          <h3 style={S.sectionTitle}>Rozkład statusów</h3>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={statusData.filter(s=>s.value>0)} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value" label={({name,value})=>`${name}: ${value}`} style={{fontSize:10}}>
                {statusData.filter(s=>s.value>0).map((e,i)=><Cell key={i} fill={e.color} />)}
              </Pie>
              <Tooltip contentStyle={S.tooltip} />
            </PieChart>
          </ResponsiveContainer>
        </Card>
        {/* 6. Średni czas realizacji */}
        <Card style={{padding:16}}>
          <h3 style={S.sectionTitle}>Średni czas realizacji</h3>
          <div style={{textAlign:"center",marginBottom:8}}>
            <span style={{fontSize:42,fontWeight:700,color:"#8b5cf6"}}>{kpis.avgDays}</span>
            <span style={{fontSize:16,color:"#64748b",marginLeft:4}}>dni</span>
          </div>
          <div style={{textAlign:"center",fontSize:11,color:"#64748b"}}>Średni czas od rozpoczęcia do zakończenia zadania</div>
          <div style={{display:"flex",justifyContent:"center",gap:16,marginTop:12}}>
            <div style={{textAlign:"center"}}><div style={{fontSize:18,fontWeight:600,color:"#22c55e"}}>{kpis.done}</div><div style={{fontSize:10,color:"#64748b"}}>zakończonych</div></div>
            <div style={{textAlign:"center"}}><div style={{fontSize:18,fontWeight:600,color:"#3b82f6"}}>{kpis.active}</div><div style={{fontSize:10,color:"#64748b"}}>aktywnych</div></div>
            <div style={{textAlign:"center"}}><div style={{fontSize:18,fontWeight:600,color:"#e2e8f0"}}>{kpis.totalRemaining}h</div><div style={{fontSize:10,color:"#64748b"}}>pozostało</div></div>
          </div>
        </Card>
      </div>
    </div>
  );
}

// ── KANBAN VIEW ──
function KanbanView({tasks,moveTask,draggedTask,setDraggedTask,setSelectedTask,team,cfg}) {
  const { STATUSES, STATUS_COLORS, PRIORITIES, PRIORITY_COLORS, CATEGORIES, CAT_COLORS, WIP_LIMITS } = cfg;
  const [groupBy, setGroupBy] = useState("none");
  const columns = STATUSES;

  const handleDragStart = (e,task) => { setDraggedTask(task); e.dataTransfer.effectAllowed="move"; };
  const handleDragEnd = () => setDraggedTask(null);
  const handleDrop = (e,status) => { e.preventDefault(); if(draggedTask) { moveTask(draggedTask.id, status); setDraggedTask(null); } };
  const handleDragOver = (e) => { e.preventDefault(); e.dataTransfer.dropEffect="move"; };

  // Grouping
  const groups = useMemo(() => {
    if(groupBy==="none") return [{ label:null, tasks }];
    const key = groupBy==="person"?"assignee":groupBy==="priority"?"priority":"category";
    const vals = groupBy==="person"?team.map(m=>m.name):groupBy==="priority"?PRIORITIES:CATEGORIES;
    return vals.map(v => ({label:v, tasks:tasks.filter(t=>t[key]===v)})).filter(g=>g.tasks.length>0);
  }, [tasks, groupBy, team]);

  const renderCard = (task) => {
    const member = team.find(m=>m.name===task.assignee);
    const isDragging = draggedTask?.id===task.id;
    return (
      <div key={task.id} draggable onDragStart={e=>handleDragStart(e,task)} onDragEnd={handleDragEnd} onClick={()=>setSelectedTask(task)}
        style={{background:"#1e293b",borderRadius:8,padding:10,cursor:"grab",borderLeft:`3px solid ${PRIORITY_COLORS[task.priority]}`,transition:"transform .1s,box-shadow .1s",position:"relative",opacity:isDragging?0.3:1,boxShadow:isDragging?"0 4px 12px #00000060":"none"}}>
        <div style={{fontSize:11.5,fontWeight:600,color:"#f1f5f9",marginBottom:4,lineHeight:1.3,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{task.name}</div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}>
          <span style={{fontSize:10,color:CAT_COLORS[task.category],background:CAT_COLORS[task.category]+"18",padding:"1px 6px",borderRadius:4}}>{task.category}</span>
          <span style={{fontSize:10,color:task.type==="DEADLINE"?"#ef4444":"#64748b",fontWeight:task.type==="DEADLINE"?600:400}}>{fmtDate(task.due)}</span>
        </div>
        <div style={{height:4,background:"#334155",borderRadius:2,overflow:"hidden",marginBottom:5}}>
          <div style={{height:"100%",background:task.progress>=80?"#22c55e":task.progress>=40?"#3b82f6":"#64748b",width:`${task.progress}%`,borderRadius:2,transition:"width .3s"}} />
        </div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span style={{fontSize:9.5,color:"#64748b"}}>{task.progress}% · {remaining(task).toFixed(0)}h</span>
          <div style={{width:24,height:24,borderRadius:"50%",background:member?.color||"#475569",display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:700,color:"#fff"}}>{member?.avatar||"?"}</div>
        </div>
      </div>
    );
  };

  return (
    <div>
      <div style={{marginBottom:12,display:"flex",alignItems:"center",gap:8}}>
        <span style={{fontSize:11,color:"#64748b",fontWeight:600}}>Grupuj wg:</span>
        {[{v:"none",l:"Brak"},{v:"person",l:"Osoba"},{v:"priority",l:"Priorytet"},{v:"category",l:"Kategoria"}].map(g=>(
          <button key={g.v} onClick={()=>setGroupBy(g.v)} style={{padding:"3px 10px",borderRadius:5,border:groupBy===g.v?"1px solid #3b82f6":"1px solid #334155",background:groupBy===g.v?"#3b82f620":"transparent",color:groupBy===g.v?"#3b82f6":"#94a3b8",fontSize:11,cursor:"pointer"}}>{g.l}</button>
        ))}
      </div>
      {groups.map((group, gi) => (
        <div key={gi} style={{marginBottom:groupBy!=="none"?20:0}}>
          {group.label && <div style={{fontSize:13,fontWeight:600,color:"#e2e8f0",marginBottom:8,padding:"6px 12px",background:"#334155",borderRadius:6}}>{group.label}</div>}
          <div style={{display:"grid",gridTemplateColumns:`repeat(${columns.length},1fr)`,gap:10,overflowX:"auto"}}>
            {columns.map(status => {
              const colTasks = group.tasks.filter(t=>t.status===status);
              const wip = WIP_LIMITS[status];
              const overWip = wip && colTasks.length > wip;
              return (
                <div key={status} onDrop={e=>handleDrop(e,status)} onDragOver={handleDragOver} style={{minWidth:200,display:"flex",flexDirection:"column"}}>
                  <div style={{padding:"10px 12px",borderRadius:"8px 8px 0 0",background:overWip?"#ef444420":STATUS_COLORS[status]+"20",borderBottom:`2px solid ${overWip?"#ef4444":STATUS_COLORS[status]}`,display:"flex",justifyContent:"space-between",alignItems:"center",border:overWip?"1px solid #ef444460":"none",borderBottomWidth:2}}>
                    <div style={{display:"flex",alignItems:"center",gap:6}}>
                      <div style={{width:8,height:8,borderRadius:"50%",background:STATUS_COLORS[status]}} />
                      <span style={{fontSize:12,fontWeight:600,color:"#e2e8f0"}}>{status}</span>
                    </div>
                    <span style={{fontSize:11,color:overWip?"#ef4444":"#64748b",fontWeight:overWip?700:400,background:overWip?"#ef444420":"#334155",padding:"1px 7px",borderRadius:10}}>{colTasks.length}{wip?`/${wip}`:""}</span>
                  </div>
                  <div style={{flex:1,display:"flex",flexDirection:"column",gap:6,padding:6,background:"#0f172a80",borderRadius:"0 0 8px 8px",minHeight:80}}>
                    {colTasks.sort((a,b)=>PRIORITIES.indexOf(a.priority)-PRIORITIES.indexOf(b.priority)).map(renderCard)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── TIMELINE VIEW ──
function TimelineView({tasks,zoom,setZoom,allTasks,onUpdateDates,onCreateTask,cfg}) {
  const { STATUS_COLORS, PRIORITY_COLORS } = cfg;
  const dayWidth = zoom==="day"?48:zoom==="week"?18:zoom==="month"?6:2;
  const rangeStart = zoom==="quarter"?-45:-14;
  const rangeEnd = zoom==="quarter"?90:28;
  const totalDays = rangeEnd - rangeStart;
  const sorted = [...tasks].sort((a,b)=>new Date(a.start)-new Date(b.start));
  const todayOffset = (0 - rangeStart) * dayWidth;
  const ROW_H = 42;
  const containerRef = useRef(null);
  const [dragging, setDragging] = useState(null); // {taskId, type:'move'|'start'|'end', originX, origStart, origDue}

  const handleMouseDown = (e, task, type) => {
    e.stopPropagation();
    e.preventDefault();
    setDragging({taskId:task.id, type, originX:e.clientX, origStart:task.start, origDue:task.due});
  };

  useEffect(() => {
    if(!dragging) return;
    const handleMove = (e) => {
      const dx = e.clientX - dragging.originX;
      const dayDelta = Math.round(dx / dayWidth);
      if(dayDelta === 0) return;
      const task = tasks.find(t=>t.id===dragging.taskId);
      if(!task) return;
      if(dragging.type==="move") {
        const newStart = addDays(dragging.origStart, dayDelta);
        const newDue = addDays(dragging.origDue, dayDelta);
        onUpdateDates(task.id, newStart, newDue);
      } else if(dragging.type==="start") {
        const newStart = addDays(dragging.origStart, dayDelta);
        if(newStart < dragging.origDue) onUpdateDates(task.id, newStart, dragging.origDue);
      } else {
        const newDue = addDays(dragging.origDue, dayDelta);
        if(newDue > dragging.origStart) onUpdateDates(task.id, dragging.origStart, newDue);
      }
    };
    const handleUp = () => setDragging(null);
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => { window.removeEventListener("mousemove", handleMove); window.removeEventListener("mouseup", handleUp); };
  }, [dragging, dayWidth, tasks, onUpdateDates]);

  // Build dependency lines
  const depLines = useMemo(() => {
    const lines = [];
    sorted.forEach((task, idx) => {
      if(!task.dep) return;
      const srcIdx = sorted.findIndex(t=>t.id===task.dep);
      if(srcIdx<0) return;
      const src = sorted[srcIdx];
      const srcEndOff = (daysFromToday(src.due) - rangeStart) * dayWidth;
      const tgtStartOff = (daysFromToday(task.start) - rangeStart) * dayWidth;
      const srcY = srcIdx * ROW_H + ROW_H/2;
      const tgtY = idx * ROW_H + ROW_H/2;
      lines.push({srcX:srcEndOff + 220, srcY, tgtX:tgtStartOff + 220, tgtY, blocked:task.status==="Zablokowane"});
    });
    return lines;
  }, [sorted, dayWidth, rangeStart]);

  const handleRowClick = (e) => {
    if(e.target !== e.currentTarget) return;
    onCreateTask();
  };

  return (
    <Card>
      <div style={{padding:"12px 16px",borderBottom:"1px solid #334155",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <h3 style={{margin:0,fontSize:14,fontWeight:600,color:"#e2e8f0"}}>📅 Oś czasu zadań</h3>
        <div style={{display:"flex",gap:4}}>
          {["day","week","month","quarter"].map(z=>(
            <button key={z} onClick={()=>setZoom(z)} style={{padding:"4px 10px",borderRadius:5,border:"1px solid #334155",background:zoom===z?"#3b82f6":"transparent",color:zoom===z?"#fff":"#94a3b8",fontSize:11,cursor:"pointer"}}>{z==="day"?"Dzień":z==="week"?"Tydzień":z==="month"?"Miesiąc":"Kwartał"}</button>
          ))}
        </div>
      </div>
      <div ref={containerRef} style={{overflowX:"auto",position:"relative"}}>
        {/* Date headers */}
        <div style={{display:"flex",borderBottom:"1px solid #334155",position:"sticky",top:0,background:"#1e293b",zIndex:5}}>
          <div style={{width:220,minWidth:220,padding:"6px 12px",borderRight:"1px solid #334155"}} />
          <div style={{display:"flex",position:"relative"}}>
            {Array.from({length:totalDays},(_,i)=>{
              const dt = new Date(); dt.setDate(dt.getDate()+rangeStart+i);
              const isToday = i === -rangeStart;
              const isSun = dt.getDay()===0;
              const showLabel = zoom==="day" || zoom==="week" || (zoom==="month" && dt.getDate()%5===1) || (zoom==="quarter" && dt.getDate()===1);
              return <div key={i} style={{width:dayWidth,minWidth:dayWidth,textAlign:"center",fontSize:zoom==="quarter"?7:8,padding:"4px 0",color:isToday?"#3b82f6":isSun?"#475569":"#64748b",fontWeight:isToday?700:400,borderRight:isSun?"1px solid #33415580":"none",background:isToday?"#3b82f620":"transparent"}}>{showLabel?`${dt.getDate()}.${dt.getMonth()+1}`:""}</div>;
            })}
          </div>
        </div>

        {/* SVG dependency arrows overlay */}
        <svg style={{position:"absolute",top:0,left:0,width:"100%",height:sorted.length*ROW_H+40,pointerEvents:"none",zIndex:3}}>
          <defs><marker id="arrow" viewBox="0 0 10 7" refX="10" refY="3.5" markerWidth="8" markerHeight="6" orient="auto"><polygon points="0 0, 10 3.5, 0 7" fill="#ef4444" /></marker></defs>
          {depLines.map((l,i)=>(
            <path key={i} d={`M${l.srcX},${l.srcY+32} C${l.srcX+20},${l.srcY+32} ${l.tgtX-20},${l.tgtY+32} ${l.tgtX},${l.tgtY+32}`}
              stroke={l.blocked?"#ef4444":"#f97316"} strokeWidth={1.5} fill="none" strokeDasharray={l.blocked?"4 2":"none"} markerEnd="url(#arrow)" opacity={0.7} />
          ))}
        </svg>

        {/* Task rows */}
        {sorted.map((task,idx) => {
          const startOff = daysFromToday(task.start) - rangeStart;
          const endOff = daysFromToday(task.due) - rangeStart;
          const barLeft = Math.max(0, startOff) * dayWidth;
          const barWidth = Math.max(dayWidth, (Math.min(endOff, totalDays) - Math.max(startOff, 0)) * dayWidth);
          const isMilestone = task.start === task.due;
          const alert_ = getAlert(task);

          return (
            <div key={task.id} style={{display:"flex",borderBottom:"1px solid #1e293b",background:idx%2===0?"#0f172a":"#0f172a80"}}>
              <div style={{width:220,minWidth:220,padding:"8px 12px",borderRight:"1px solid #334155",display:"flex",alignItems:"center",gap:8}}>
                <div style={{width:6,height:6,borderRadius:"50%",background:PRIORITY_COLORS[task.priority],flexShrink:0}} />
                <div style={{overflow:"hidden"}}>
                  <div style={{fontSize:11,fontWeight:500,color:"#e2e8f0",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{task.name}</div>
                  <div style={{fontSize:9.5,color:"#64748b"}}>{task.assignee.split(" ")[0]} · {task.category}</div>
                </div>
              </div>
              <div style={{position:"relative",height:ROW_H,flex:1}} onClick={handleRowClick}>
                {/* Today line */}
                <div style={{position:"absolute",left:todayOffset,top:0,bottom:0,width:1,background:"#3b82f650",zIndex:2}} />
                {isMilestone ? (
                  <div style={{position:"absolute",left:barLeft-8,top:10,fontSize:18,color:task.progress>=100?"#22c55e":alert_.level==="overdue"?"#ef4444":"#eab308",cursor:"pointer"}} title={`♦ ${task.name}`}>♦</div>
                ) : (
                  <div style={{position:"absolute",left:barLeft,top:8,width:barWidth,height:26,borderRadius:4,overflow:"visible",background:STATUS_COLORS[task.status]+"30",border:`1px solid ${STATUS_COLORS[task.status]}50`,cursor:dragging?"grabbing":"pointer",userSelect:"none"}} title={`${task.name}\n${fmtDate(task.start)} → ${fmtDate(task.due)}\nPostęp: ${task.progress}%`}>
                    <div style={{height:"100%",width:`${task.progress}%`,background:STATUS_COLORS[task.status]+"60",borderRadius:"3px 0 0 3px"}} />
                    <span style={{position:"absolute",left:6,top:"50%",transform:"translateY(-50%)",fontSize:9,fontWeight:500,color:"#e2e8f0",whiteSpace:"nowrap",pointerEvents:"none"}}>{task.progress}%</span>
                    {/* Drag handles */}
                    <div onMouseDown={e=>handleMouseDown(e,task,"start")} style={{position:"absolute",left:-2,top:0,width:6,height:"100%",cursor:"ew-resize",background:"transparent"}} />
                    <div onMouseDown={e=>handleMouseDown(e,task,"move")} style={{position:"absolute",left:6,top:0,width:barWidth-12,height:"100%",cursor:"grab"}} />
                    <div onMouseDown={e=>handleMouseDown(e,task,"end")} style={{position:"absolute",right:-2,top:0,width:6,height:"100%",cursor:"ew-resize",background:"transparent"}} />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ── WORKLOAD VIEW ──
function WorkloadView({tasks,team,onAddMember,onEditMember,onDeleteMember,cfg}) {
  const { PRIORITY_COLORS } = cfg;
  const workloadData = team.map(member => {
    const memberTasks = tasks.filter(t => t.assignee === member.name);
    const totalRemaining = memberTasks.reduce((s,t) => s + remaining(t), 0);
    const utilization = member.hours > 0 ? Math.round(totalRemaining / member.hours * 100) : 0;
    const statusColor = utilization <= 70 ? "#22c55e" : utilization <= 90 ? "#eab308" : utilization <= 100 ? "#f97316" : "#ef4444";
    const statusLabel = utilization <= 70 ? "Dostępny" : utilization <= 90 ? "Optymalnie" : utilization <= 100 ? "Na granicy" : "Przeciążony";
    return {...member, memberTasks, totalRemaining: Math.round(totalRemaining*10)/10, utilization, statusColor, statusLabel, taskCount: memberTasks.length };
  }).sort((a,b) => b.utilization - a.utilization);

  const chartData = workloadData.map(w => ({name:w.name.split(" ")[0],Wykorzystanie:w.utilization,color:w.statusColor}));

  return (
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      <Card style={{padding:16}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
          <h3 style={{margin:0,fontSize:14,fontWeight:600,color:"#e2e8f0"}}>👥 Obciążenie zespołu (% tygodniowego limitu)</h3>
          <button onClick={onAddMember} style={{...S.btnPrimary,fontSize:12,padding:"6px 14px"}}>+ Członek zespołu</button>
        </div>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={chartData} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis type="number" domain={[0,150]} tick={{fill:"#64748b",fontSize:10}} />
            <YAxis type="category" dataKey="name" tick={{fill:"#94a3b8",fontSize:11}} width={90} />
            <Tooltip contentStyle={S.tooltip} formatter={(v)=>`${v}%`} />
            <ReferenceLine x={70} stroke="#22c55e40" strokeDasharray="3 3" />
            <ReferenceLine x={90} stroke="#eab30840" strokeDasharray="3 3" />
            <ReferenceLine x={100} stroke="#ef444440" strokeDasharray="3 3" />
            <Bar dataKey="Wykorzystanie" radius={[0,4,4,0]}>
              {chartData.map((e,i)=><Cell key={i} fill={e.color} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <div style={{display:"flex",gap:16,justifyContent:"center",marginTop:8}}>
          {[{c:"#22c55e",l:"0–70% Dostępny"},{c:"#eab308",l:"70–90% Optymalnie"},{c:"#f97316",l:"90–100% Na granicy"},{c:"#ef4444",l:">100% Przeciążony"}].map(r=>(
            <div key={r.l} style={{display:"flex",alignItems:"center",gap:4,fontSize:10,color:"#94a3b8"}}><div style={{width:8,height:8,borderRadius:2,background:r.c}} />{r.l}</div>
          ))}
        </div>
      </Card>

      {/* Team member cards */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(320px,1fr))",gap:10}}>
        {workloadData.map(w => (
          <Card key={w.id} style={{padding:14,position:"relative"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <div style={{width:32,height:32,borderRadius:"50%",background:w.color||"#3b82f6",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:"#fff"}}>{(w.name||"").split(" ").map(n=>n[0]).join("").slice(0,2)}</div>
                <div>
                  <div style={{fontSize:13,fontWeight:600,color:"#f1f5f9"}}>{w.name}</div>
                  <div style={{fontSize:10.5,color:"#64748b"}}>{w.role} · {w.hours}h/tyg</div>
                  {w.email && <div style={{fontSize:9.5,color:"#475569",marginTop:1}}>✉ {w.email}</div>}
                </div>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <div style={{textAlign:"right"}}>
                  <span style={{fontSize:18,fontWeight:700,color:w.statusColor}}>{w.utilization}%</span>
                  <div style={{fontSize:10,color:w.statusColor,fontWeight:500}}>{w.statusLabel}</div>
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:2}}>
                  <button onClick={()=>onEditMember(w)} title="Edytuj" style={{background:"none",border:"none",color:"#64748b",cursor:"pointer",fontSize:13,padding:"2px 4px",borderRadius:4,lineHeight:1}} onMouseOver={e=>e.target.style.color="#3b82f6"} onMouseOut={e=>e.target.style.color="#64748b"}>✏️</button>
                  <button onClick={()=>onDeleteMember(w.id)} title="Usuń" style={{background:"none",border:"none",color:"#64748b",cursor:"pointer",fontSize:13,padding:"2px 4px",borderRadius:4,lineHeight:1}} onMouseOver={e=>e.target.style.color="#ef4444"} onMouseOut={e=>e.target.style.color="#64748b"}>🗑️</button>
                </div>
              </div>
            </div>
            <div style={{height:6,background:"#334155",borderRadius:3,overflow:"hidden",marginBottom:8}}>
              <div style={{height:"100%",width:`${Math.min(w.utilization,150)/1.5}%`,background:w.statusColor,borderRadius:3,transition:"width .3s"}} />
            </div>
            <div style={{fontSize:10.5,color:"#94a3b8",marginBottom:6}}>{w.totalRemaining}h pozostało · {w.taskCount} zadań</div>
            {w.memberTasks.slice(0,4).map(t => (
              <div key={t.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"3px 0",borderTop:"1px solid #334155"}}>
                <div style={{display:"flex",alignItems:"center",gap:5}}>
                  <div style={{width:5,height:5,borderRadius:"50%",background:PRIORITY_COLORS[t.priority]}} />
                  <span style={{fontSize:10.5,color:"#cbd5e1",maxWidth:180,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.name}</span>
                </div>
                <span style={{fontSize:10,color:"#64748b"}}>{remaining(t).toFixed(0)}h</span>
              </div>
            ))}
            {w.memberTasks.length > 4 && <div style={{fontSize:10,color:"#475569",textAlign:"center",marginTop:3}}>+{w.memberTasks.length-4} więcej</div>}
          </Card>
        ))}
      </div>
    </div>
  );
}

// ── ALERTS VIEW (Enhanced with escalation) ──
function AlertsView({tasks,setSelectedTask}) {
  const alerts = tasks.map(t => ({task:t, alert:getAlert(t)})).filter(a => a.alert.level !== "ok").sort((a,b) => {
    const order = {overdue:0,blocked:1,soon:2,stale:3,at_risk:4};
    return (order[a.alert.level]||9) - (order[b.alert.level]||9);
  });

  const grouped = {
    overdue: alerts.filter(a=>a.alert.level==="overdue"),
    blocked: alerts.filter(a=>a.alert.level==="blocked"),
    soon: alerts.filter(a=>a.alert.level==="soon"),
    stale: alerts.filter(a=>a.alert.level==="stale"),
    at_risk: alerts.filter(a=>a.alert.level==="at_risk"),
  };

  const sections = [
    {key:"overdue",title:"🔴 Przeterminowane",color:"#ef4444",desc:"Zadania po terminie wymagające natychmiastowej uwagi"},
    {key:"blocked",title:"⛔ Zablokowane",color:"#f97316",desc:"Zadania czekające na odblokowanie"},
    {key:"soon",title:"🟡 Zbliżające się deadline",color:"#eab308",desc:"Deadline w ciągu 2 dni"},
    {key:"stale",title:"🟠 Brak postępu",color:"#f59e0b",desc:"W trakcie bez aktywności >3 dni"},
    {key:"at_risk",title:"⚠️ Zagrożone",color:"#f59e0b",desc:"Postęp znacznie poniżej oczekiwanego"},
  ];

  return (
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      <div style={{display:"grid",gridTemplateColumns:`repeat(${sections.length},1fr)`,gap:10}}>
        {sections.map(s => (
          <Card key={s.key} style={{padding:"12px 14px",borderLeft:`3px solid ${s.color}`}}>
            <div style={{fontSize:22,fontWeight:700,color:s.color}}>{grouped[s.key].length}</div>
            <div style={{fontSize:11,color:"#94a3b8",fontWeight:500}}>{s.title.replace(/[^\w\sąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/g,"").trim()}</div>
          </Card>
        ))}
      </div>
      {sections.map(s => grouped[s.key].length > 0 && (
        <Card key={s.key}>
          <div style={{padding:"10px 16px",borderBottom:"1px solid #334155",display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:14}}>{s.title.split(" ")[0]}</span>
            <span style={{fontSize:13,fontWeight:600,color:"#e2e8f0"}}>{s.title.split(" ").slice(1).join(" ")}</span>
            <span style={{fontSize:11,color:"#64748b",marginLeft:"auto"}}>{s.desc}</span>
          </div>
          {grouped[s.key].map(({task,alert:a}) => {
            const dd = daysFromToday(task.due);
            const esc = dd < 0 ? getEscalation(Math.abs(dd)) : null;
            return (
              <div key={task.id} onClick={()=>setSelectedTask(task)} style={{padding:"10px 16px",borderBottom:"1px solid #1e293b",display:"flex",alignItems:"center",gap:12,cursor:"pointer",transition:"background .15s"}} onMouseEnter={e=>e.currentTarget.style.background="#ffffff08"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                <div style={{width:8,height:8,borderRadius:"50%",background:s.color,flexShrink:0}} />
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:12,fontWeight:500,color:"#f1f5f9"}}>{task.name}</div>
                  <div style={{fontSize:10.5,color:"#64748b"}}>{task.assignee} · {task.category} · {task.type}</div>
                </div>
                {/* Escalation badges */}
                {esc && (
                  <div style={{display:"flex",gap:3,alignItems:"center"}}>
                    {esc.badges.includes("badge") && <span style={{width:8,height:8,borderRadius:"50%",background:esc.color,display:"inline-block"}} />}
                    {esc.badges.includes("email") && <span style={{fontSize:12}} title="Powiadomienie email">📧</span>}
                    {esc.badges.includes("pm") && <span style={{fontSize:12}} title="Eskalacja do PM">🚩</span>}
                    {esc.badges.includes("kierownik") && <span style={{fontSize:12}} title="Eskalacja do Kierownika">🔴</span>}
                  </div>
                )}
                <div style={{textAlign:"right",flexShrink:0}}>
                  <div style={{fontSize:11,color:dd<0?"#ef4444":"#eab308",fontWeight:600}}>{fmtDate(task.due)}</div>
                  <div style={{fontSize:10,color:"#64748b"}}>{dd<0?`${Math.abs(dd)} dni po terminie`:dd===0?"dziś":`za ${dd} dni`}</div>
                </div>
                <div style={{width:50,textAlign:"center"}}>
                  <div style={{fontSize:13,fontWeight:600,color:"#e2e8f0"}}>{task.progress}%</div>
                  <div style={{height:3,background:"#334155",borderRadius:2,overflow:"hidden",marginTop:2}}>
                    <div style={{height:"100%",width:`${task.progress}%`,background:s.color,borderRadius:2}} />
                  </div>
                </div>
              </div>
            );
          })}
        </Card>
      ))}
      {alerts.length === 0 && (
        <Card style={{padding:40,textAlign:"center"}}>
          <span style={{fontSize:36}}>✅</span>
          <div style={{fontSize:16,fontWeight:600,color:"#22c55e",marginTop:8}}>Brak alertów</div>
          <div style={{fontSize:12,color:"#64748b",marginTop:4}}>Wszystkie zadania są na dobrej drodze</div>
        </Card>
      )}
    </div>
  );
}

// ── MY TASKS VIEW (Specjalista role) ──
function MyTasksView({tasks,setSelectedTask,team,cfg}) {
  const { STATUS_COLORS, PRIORITY_COLORS, CAT_COLORS } = cfg;
  const sorted = [...tasks].sort((a,b) => {
    if(a.due && b.due) return new Date(a.due) - new Date(b.due);
    return 0;
  });

  if(sorted.length === 0) return (
    <Card style={{padding:40,textAlign:"center"}}>
      <span style={{fontSize:36}}>📋</span>
      <div style={{fontSize:16,fontWeight:600,color:"#94a3b8",marginTop:8}}>Brak przypisanych zadań</div>
      <div style={{fontSize:12,color:"#64748b",marginTop:4}}>Wybierz osobę w pasku filtrów powyżej</div>
    </Card>
  );

  return (
    <div style={{display:"flex",flexDirection:"column",gap:8}}>
      <h3 style={{margin:0,fontSize:14,fontWeight:600,color:"#e2e8f0"}}>📋 Moje zadania ({sorted.length})</h3>
      {sorted.map(task => {
        const alert_ = getAlert(task);
        const member = team.find(m=>m.name===task.assignee);
        const dd = daysFromToday(task.due);
        return (
          <Card key={task.id} style={{cursor:"pointer",transition:"border-color .15s",borderLeft:`3px solid ${PRIORITY_COLORS[task.priority]}`}} onClick={()=>setSelectedTask(task)}>
            <div style={{padding:"12px 16px",display:"flex",alignItems:"center",gap:12}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
                  <span style={{fontSize:10,color:"#64748b"}}>{task.id}</span>
                  <span style={{padding:"1px 6px",borderRadius:4,background:STATUS_COLORS[task.status]+"25",color:STATUS_COLORS[task.status],fontSize:10,fontWeight:500}}>{task.status}</span>
                  <span style={{fontSize:10,color:CAT_COLORS[task.category]}}>{task.category}</span>
                  {alert_.level!=="ok" && <span style={{fontSize:10,color:alert_.color,fontWeight:500}}>{alert_.text}</span>}
                </div>
                <div style={{fontSize:13,fontWeight:600,color:"#f1f5f9",marginBottom:4}}>{task.name}</div>
                <div style={{display:"flex",alignItems:"center",gap:12}}>
                  <div style={{flex:1,height:4,background:"#334155",borderRadius:2,overflow:"hidden",maxWidth:200}}>
                    <div style={{height:"100%",background:task.progress>=80?"#22c55e":"#3b82f6",width:`${task.progress}%`,borderRadius:2}} />
                  </div>
                  <span style={{fontSize:10,color:"#64748b"}}>{task.progress}% · {remaining(task).toFixed(0)}h</span>
                </div>
              </div>
              <div style={{textAlign:"right",flexShrink:0}}>
                <div style={{fontSize:12,color:dd<0?"#ef4444":dd<=2?"#eab308":"#94a3b8",fontWeight:600}}>{fmtDate(task.due)}</div>
                <div style={{fontSize:10,color:"#64748b"}}>{dd<0?`${Math.abs(dd)}d po terminie`:dd===0?"dziś":`za ${dd}d`}</div>
                <span style={{fontSize:10,color:PRIORITY_COLORS[task.priority],fontWeight:500}}>{PRIORITY_ICONS[task.priority]} {task.priority}</span>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

// ── SETTINGS VIEW (Admin) ──
function SettingsView({settings, onSave, cfg}) {
  const [local, setLocal] = useState(() => ({
    categories: cfg.CATEGORIES,
    statuses: cfg.STATUSES,
    priorities: cfg.PRIORITIES,
    roles: cfg.ROLES,
    wipLimits: {...cfg.WIP_LIMITS},
    statusColors: {...cfg.STATUS_COLORS},
    priorityColors: {...cfg.PRIORITY_COLORS},
    categoryColors: {...cfg.CAT_COLORS},
  }));
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const [newItem, setNewItem] = useState({categories:"",statuses:"",priorities:"",roles:""});

  const addItem = (key) => {
    const val = newItem[key].trim();
    if(!val || local[key].includes(val)) return;
    setLocal(prev => ({...prev, [key]: [...prev[key], val]}));
    setNewItem(prev => ({...prev, [key]: ""}));
    // Auto-assign color
    const colorKey = key==="categories"?"categoryColors":key==="statuses"?"statusColors":key==="priorities"?"priorityColors":null;
    if(colorKey) {
      const usedColors = Object.values(local[colorKey]);
      const nextColor = COLOR_PALETTE.find(c => !usedColors.includes(c)) || COLOR_PALETTE[Math.floor(Math.random()*COLOR_PALETTE.length)];
      setLocal(prev => ({...prev, [colorKey]: {...prev[colorKey], [val]: nextColor}}));
    }
  };

  const removeItem = (key, val) => {
    if(key==="statuses" && val==="Zakończone") return alert("Status 'Zakończone' nie może być usunięty — jest wymagany.");
    setLocal(prev => ({...prev, [key]: prev[key].filter(v=>v!==val)}));
    const colorKey = key==="categories"?"categoryColors":key==="statuses"?"statusColors":key==="priorities"?"priorityColors":null;
    if(colorKey) {
      setLocal(prev => { const c = {...prev[colorKey]}; delete c[val]; return {...prev, [colorKey]: c}; });
    }
  };

  const moveItem = (key, idx, dir) => {
    setLocal(prev => {
      const arr = [...prev[key]];
      const newIdx = idx + dir;
      if(newIdx < 0 || newIdx >= arr.length) return prev;
      [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
      return {...prev, [key]: arr};
    });
  };

  const updateColor = (colorKey, itemName, color) => {
    setLocal(prev => ({...prev, [colorKey]: {...prev[colorKey], [itemName]: color}}));
  };

  const updateWipLimit = (status, val) => {
    setLocal(prev => {
      const wip = {...prev.wipLimits};
      if(val === "" || val === 0) { delete wip[status]; }
      else { wip[status] = Number(val); }
      return {...prev, wipLimits: wip};
    });
  };

  const handleSave = async () => {
    setSaving(true); setMsg(null);
    try {
      const res = await onSave(local);
      if(res.ok) { setMsg({type:"ok",text:"Ustawienia zapisane!"}); }
      else { setMsg({type:"err",text:res.error||"Błąd zapisu"}); }
    } catch(e) { setMsg({type:"err",text:"Błąd połączenia"}); }
    setSaving(false);
    setTimeout(()=>setMsg(null), 4000);
  };

  const listSections = [
    {key:"categories",label:"Kategorie",colorKey:"categoryColors",desc:"Typy projektów (FENG, KPO, Marketing...)"},
    {key:"statuses",label:"Statusy",colorKey:"statusColors",desc:"Etapy zadania w Kanban",hasWip:true},
    {key:"priorities",label:"Priorytety",colorKey:"priorityColors",desc:"Poziomy pilności zadań"},
    {key:"roles",label:"Role",colorKey:null,desc:"Stanowiska członków zespołu"},
  ];

  const labelStyle = {fontSize:11,color:"#64748b",marginBottom:3,display:"block",fontWeight:500};

  return (
    <div style={{display:"flex",flexDirection:"column",gap:16,maxWidth:900}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div>
          <h2 style={{margin:0,fontSize:18,fontWeight:700,color:"#f1f5f9"}}>⚙️ Ustawienia</h2>
          <p style={{margin:"4px 0 0",fontSize:12,color:"#64748b"}}>Edytuj listy kategori, statusów, priorytetów i ról. Zmiany dotyczą całego zespołu.</p>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          {msg && <span style={{fontSize:12,color:msg.type==="ok"?"#22c55e":"#ef4444",fontWeight:500}}>{msg.text}</span>}
          <button onClick={handleSave} disabled={saving} style={{...S.btnPrimary,fontSize:13,padding:"8px 20px",opacity:saving?0.6:1}}>{saving?"Zapisuję...":"💾 Zapisz zmiany"}</button>
        </div>
      </div>

      {listSections.map(sec => (
        <Card key={sec.key}>
          <div style={{padding:"12px 16px",borderBottom:"1px solid #334155"}}>
            <h3 style={{margin:0,fontSize:14,fontWeight:600,color:"#e2e8f0"}}>{sec.label}</h3>
            <p style={{margin:"2px 0 0",fontSize:11,color:"#64748b"}}>{sec.desc}</p>
          </div>
          <div style={{padding:16}}>
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              {local[sec.key].map((item, idx) => (
                <div key={item} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 10px",background:"#0f172a",borderRadius:6,border:"1px solid #334155"}}>
                  {/* Reorder */}
                  <div style={{display:"flex",flexDirection:"column",gap:0}}>
                    <button onClick={()=>moveItem(sec.key,idx,-1)} disabled={idx===0} style={{background:"none",border:"none",color:idx===0?"#334155":"#64748b",cursor:idx===0?"default":"pointer",fontSize:10,padding:0,lineHeight:1}}>▲</button>
                    <button onClick={()=>moveItem(sec.key,idx,1)} disabled={idx===local[sec.key].length-1} style={{background:"none",border:"none",color:idx===local[sec.key].length-1?"#334155":"#64748b",cursor:idx===local[sec.key].length-1?"default":"pointer",fontSize:10,padding:0,lineHeight:1}}>▼</button>
                  </div>
                  {/* Color swatch */}
                  {sec.colorKey && (
                    <input type="color" value={local[sec.colorKey]?.[item]||"#94a3b8"} onChange={e=>updateColor(sec.colorKey,item,e.target.value)}
                      style={{width:24,height:24,border:"none",borderRadius:4,cursor:"pointer",padding:0,background:"none"}} />
                  )}
                  {/* Label */}
                  <span style={{flex:1,fontSize:13,color:"#e2e8f0",fontWeight:500}}>{item}</span>
                  {/* WIP limit */}
                  {sec.hasWip && (
                    <div style={{display:"flex",alignItems:"center",gap:4}}>
                      <label style={{fontSize:10,color:"#64748b"}}>WIP:</label>
                      <input type="number" min={0} max={99} value={local.wipLimits[item]||""} onChange={e=>updateWipLimit(item,e.target.value)}
                        placeholder="∞" style={{...S.input,width:48,padding:"3px 6px",fontSize:11,textAlign:"center"}} />
                    </div>
                  )}
                  {/* Remove button */}
                  <button onClick={()=>removeItem(sec.key,item)} title="Usuń"
                    style={{background:"none",border:"none",color:"#475569",cursor:"pointer",fontSize:14,padding:"2px 4px",borderRadius:4,lineHeight:1}}
                    onMouseOver={e=>e.target.style.color="#ef4444"} onMouseOut={e=>e.target.style.color="#475569"}>✕</button>
                </div>
              ))}
            </div>
            {/* Add new */}
            <div style={{display:"flex",gap:8,marginTop:10}}>
              <input value={newItem[sec.key]} onChange={e=>setNewItem(prev=>({...prev,[sec.key]:e.target.value}))}
                onKeyDown={e=>e.key==="Enter"&&addItem(sec.key)}
                placeholder={`Nowa pozycja (${sec.label.toLowerCase()})...`}
                style={{...S.input,flex:1}} />
              <button onClick={()=>addItem(sec.key)} style={{...S.btnPrimary,padding:"6px 16px",whiteSpace:"nowrap"}}>+ Dodaj</button>
            </div>
          </div>
        </Card>
      ))}

      {/* WIP Limits summary */}
      <Card>
        <div style={{padding:"12px 16px",borderBottom:"1px solid #334155"}}>
          <h3 style={{margin:0,fontSize:14,fontWeight:600,color:"#e2e8f0"}}>Limity WIP</h3>
          <p style={{margin:"2px 0 0",fontSize:11,color:"#64748b"}}>Maksymalna liczba zadań w kolumnie Kanban. Puste = bez limitu.</p>
        </div>
        <div style={{padding:16,display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))",gap:10}}>
          {local.statuses.map(s => (
            <div key={s} style={{display:"flex",alignItems:"center",gap:8}}>
              <div style={{width:10,height:10,borderRadius:"50%",background:local.statusColors[s]||"#94a3b8"}} />
              <span style={{fontSize:12,color:"#e2e8f0",flex:1}}>{s}</span>
              <input type="number" min={0} max={99} value={local.wipLimits[s]||""} onChange={e=>updateWipLimit(s,e.target.value)}
                placeholder="∞" style={{...S.input,width:48,padding:"3px 6px",fontSize:11,textAlign:"center"}} />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ── PORTFOLIO VIEW (Kierownik role) ──
function PortfolioView({tasks,active,kpis,team}) {
  const workloadData = team.map(m => {
    const mt = active.filter(t=>t.assignee===m.name);
    const rem = mt.reduce((s,t)=>s+remaining(t),0);
    const util = m.hours>0?Math.round(rem/m.hours*100):0;
    const color = util<=70?"#22c55e":util<=90?"#eab308":util<=100?"#f97316":"#ef4444";
    const overdue = mt.filter(t=>getAlert(t).level==="overdue").length;
    return {name:m.name.split(" ")[0],fullName:m.name,util,color,tasks:mt.length,overdue,rem:Math.round(rem)};
  }).sort((a,b)=>b.util-a.util);

  const burndown = [];
  for(let i=13;i>=0;i--) {
    const dt = new Date(); dt.setDate(dt.getDate()-i);
    const label = `${dt.getDate()}.${dt.getMonth()+1}`;
    const ideal = Math.max(0, 18 - (14-i) * 1.2);
    const actual = Math.max(0, 18 - (14-i) * 0.9 + Math.sin(i)*1.2);
    burndown.push({name:label,Idealne:Math.round(ideal*10)/10,Faktyczne:Math.round(actual*10)/10});
  }

  return (
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      {/* KPI Summary */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(155px,1fr))",gap:10}}>
        <KpiCard label="Aktywne" value={kpis.active} sub={`z ${kpis.total} łącznie`} icon="📋" />
        <KpiCard label="Zakończone" value={kpis.done} sub={`${kpis.total?Math.round(kpis.done/kpis.total*100):0}%`} color="#22c55e" icon="✓" />
        <KpiCard label="Przeterminowane" value={kpis.overdue} color="#ef4444" icon="🔴" />
        <KpiCard label="Zablokowane" value={kpis.blocked} color="#f97316" icon="⛔" />
        <KpiCard label="Śr. czas" value={`${kpis.avgDays}d`} color="#8b5cf6" icon="⏱️" />
        <KpiCard label="Pozostało (h)" value={kpis.totalRemaining} color="#3b82f6" icon="📊" />
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
        {/* Team utilization */}
        <Card style={{padding:16}}>
          <h3 style={S.sectionTitle}>Wykorzystanie zespołu</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={workloadData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis type="number" domain={[0,150]} tick={{fill:"#64748b",fontSize:10}} />
              <YAxis type="category" dataKey="name" tick={{fill:"#94a3b8",fontSize:10}} width={70} />
              <Tooltip contentStyle={S.tooltip} formatter={(v)=>`${v}%`} />
              <ReferenceLine x={100} stroke="#ef444440" strokeDasharray="3 3" />
              <Bar dataKey="util" name="Wykorzystanie" radius={[0,4,4,0]}>
                {workloadData.map((e,i)=><Cell key={i} fill={e.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>
        {/* Burndown */}
        <Card style={{padding:16}}>
          <h3 style={S.sectionTitle}>Wykres spalania</h3>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={burndown}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="name" tick={{fill:"#64748b",fontSize:10}} />
              <YAxis tick={{fill:"#64748b",fontSize:10}} />
              <Tooltip contentStyle={S.tooltip} />
              <Line type="monotone" dataKey="Idealne" stroke="#475569" strokeDasharray="5 5" dot={false} />
              <Line type="monotone" dataKey="Faktyczne" stroke="#3b82f6" strokeWidth={2} dot={{r:2}} />
              <Legend wrapperStyle={{fontSize:11}} />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      </div>
      {/* Team table */}
      <Card>
        <div style={{padding:"10px 16px",borderBottom:"1px solid #334155"}}>
          <h3 style={{margin:0,fontSize:14,fontWeight:600,color:"#e2e8f0"}}>Przegląd zespołu</h3>
        </div>
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
            <thead>
              <tr style={{borderBottom:"1px solid #334155"}}>
                {["Osoba","Zadania","Wykorzystanie","Przeterminowane","Pozostało (h)"].map(h=>(
                  <th key={h} style={{padding:"8px 16px",textAlign:"left",color:"#64748b",fontWeight:600,fontSize:11}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {workloadData.map(w=>(
                <tr key={w.name} style={{borderBottom:"1px solid #1e293b"}}>
                  <td style={{padding:"8px 16px",color:"#e2e8f0",fontWeight:500}}>{w.fullName}</td>
                  <td style={{padding:"8px 16px",color:"#94a3b8"}}>{w.tasks}</td>
                  <td style={{padding:"8px 16px"}}><span style={{color:w.color,fontWeight:600}}>{w.util}%</span></td>
                  <td style={{padding:"8px 16px"}}><span style={{color:w.overdue>0?"#ef4444":"#22c55e",fontWeight:w.overdue>0?600:400}}>{w.overdue}</span></td>
                  <td style={{padding:"8px 16px",color:"#94a3b8"}}>{w.rem}h</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
