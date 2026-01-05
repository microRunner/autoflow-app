import React, { useState, useEffect } from 'react';
import axios from 'axios';
import ReactFlow, { Background, Controls, useNodesState, useEdgesState } from 'reactflow';
import dagre from 'dagre';
import 'reactflow/dist/style.css'; 
import './App.css'; 

// IMPORTANT: Point this to your Cloud Run URL
// const API_BASE_URL = "/api";
const API_BASE_URL = "https://autoflow-backend-330693313374.us-central1.run.app";

// --- HELPERS ---
const nodeWidth = 250;
const nodeHeight = 100;
const getLayoutedElements = (nodes, edges) => {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({ rankdir: 'TB' });
  nodes.forEach((node) => dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight }));
  edges.forEach((edge) => dagreGraph.setEdge(edge.source, edge.target));
  dagre.layout(dagreGraph);
  return {
    nodes: nodes.map((node) => {
      const pos = dagreGraph.node(node.id);
      return { ...node, position: { x: pos.x - nodeWidth / 2, y: pos.y - nodeHeight / 2 } };
    }),
    edges
  };
};

const PaginatedTable = ({ data }) => {
    const [page, setPage] = useState(1);
    const rowsPerPage = 5;
    if (!data || !Array.isArray(data) || data.length === 0) return <div className="empty-state" style={{padding:'20px', textAlign:'center', color:'#94a3b8', fontStyle:'italic'}}>No data generated for this stage.</div>;
    const totalPages = Math.ceil(data.length / rowsPerPage);
    const startIndex = (page - 1) * rowsPerPage;
    const currentRows = data.slice(startIndex, startIndex + rowsPerPage);
    if(!currentRows[0]) return null;
    return (
        <div>
            <div className="table-container">
                <table className="data-table">
                    <thead><tr>{Object.keys(currentRows[0]).map(key => <th key={key}>{key}</th>)}</tr></thead>
                    <tbody>{currentRows.map((row, i) => <tr key={i}>{Object.values(row).map((val, j) => <td key={j}>{val}</td>)}</tr>)}</tbody>
                </table>
            </div>
            {totalPages > 1 && <div className="pagination"><button className="page-btn" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>←</button><span>{page} / {totalPages}</span><button className="page-btn" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>→</button></div>}
        </div>
    );
};

// --- DASHBOARD COMPONENT ---
const Dashboard = ({ workflows, onInspectRun, onDeleteAgent, onStopSchedule, onEditSchedule }) => {
    const [selectedWf, setSelectedWf] = useState(null);
    const [history, setHistory] = useState([]);
    const [schedules, setSchedules] = useState([]);

    useEffect(() => {
        const fetchScheds = async () => { try { const res = await axios.get(`${API_BASE_URL}/schedules`); setSchedules(res.data); } catch(e){} };
        fetchScheds();
    }, [workflows]); 

    useEffect(() => {
        if(selectedWf) {
            const fetchHistory = async () => { try { const res = await axios.get(`${API_BASE_URL}/schedules/history/${selectedWf.id}`); setHistory(res.data); } catch(e){} };
            fetchHistory();
        }
    }, [selectedWf]);

    const scheduledWorkflows = workflows.map(wf => {
        const sched = schedules.find(s => s.workflow_id === wf.id);
        return { ...wf, schedule: sched };
    });

    return (
        <div className="dashboard-layout">
            <div className="dash-sidebar">
                <h2 className="label">Active Agents</h2>
                {scheduledWorkflows.map(wf => (
                    <div key={wf.id} className={`workflow-card ${selectedWf?.id === wf.id ? 'selected' : ''}`} onClick={() => setSelectedWf(wf)}>
                        <div style={{fontWeight:'700', color:'#1e293b'}}>{wf.name}</div>
                        <div style={{fontSize:'0.75rem', color:'#64748b', marginTop:'4px'}}>
                            {wf.schedule ? <span style={{color:'#10b981'}}>● Active: {wf.schedule.trigger}</span> : <span style={{color:'#94a3b8'}}>○ Not Scheduled</span>}
                        </div>
                        
                        <div className="agent-actions">
                            <button className="btn-icon" title="Schedule" onClick={(e) => { e.stopPropagation(); onEditSchedule(wf.id); }}>⏰</button>
                            {wf.schedule && (<button className="btn-icon danger" title="Stop" onClick={(e) => { e.stopPropagation(); onStopSchedule(wf.schedule.id); }}>⏹</button>)}
                            <button className="btn-icon danger" title="Delete" onClick={(e) => { e.stopPropagation(); onDeleteAgent(wf.id); }}>🗑</button>
                        </div>
                    </div>
                ))}
            </div>
            <div className="dash-main">
                {selectedWf ? (
                    <>
                        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'20px'}}>
                            <h2 style={{margin:0, fontSize:'1.2rem', color:'#1e293b'}}>Audit Trail: {selectedWf.name}</h2>
                            <button className="btn btn-secondary btn-sm" onClick={() => setSelectedWf(null)}>Close</button>
                        </div>
                        <div className="panel" style={{padding:0, overflow:'hidden'}}>
                            <table className="data-table">
                                <thead style={{background:'#f8fafc'}}><tr><th>Run Date</th><th>Status</th><th>Result Table</th><th>Actions</th></tr></thead>
                                <tbody>
                                    {history.map(run => (
                                        <tr key={run.id}>
                                            <td>{new Date(run.start_time).toLocaleString()}</td>
                                            <td><span className={`status-badge ${run.status==='COMPLETED'?'status-success':(run.status==='FAILED'?'status-fail':'status-running')}`}>{run.status}</span></td>
                                            <td style={{fontFamily:'monospace', fontSize:'0.8rem'}}>{run.output_table || '-'}</td>
                                            <td>{run.output_table && (<button className="btn btn-primary btn-sm" onClick={() => onInspectRun(run)}>🔎 Inspect</button>)}</td>
                                        </tr>
                                    ))}
                                    {history.length === 0 && <tr><td colSpan="5" style={{textAlign:'center', padding:'30px', color:'#94a3b8'}}>No history found.</td></tr>}
                                </tbody>
                            </table>
                        </div>
                    </>
                ) : <div style={{textAlign:'center', marginTop:'50px', color:'#94a3b8'}}>Select an agent to view history.</div>}
            </div>
        </div>
    );
};

const SchedulerModal = ({ onClose, workflowId, workflowName }) => {
    const [schedType, setSchedType] = useState("interval");
    const [schedValue, setSchedValue] = useState("60");
    const handleCreate = async () => {
        try { await axios.post(`${API_BASE_URL}/schedules`, { workflow_id: workflowId, type: schedType, value: schedValue }); alert("Scheduled!"); onClose(); } catch (e) { alert("Error: " + e.message); }
    };
    return (
        <div className="modal-overlay">
            <div className="modal-content" style={{maxWidth:'500px'}}>
                <div className="modal-header"><h3 style={{margin:0, fontSize:'1rem'}}>⏰ Schedule: {workflowName}</h3><button onClick={onClose} className="btn-close">×</button></div>
                <div className="modal-body" style={{padding:'20px'}}>
                    <label className="label">Frequency Rule</label>
                    <select className="select-dark" value={schedType} onChange={(e) => setSchedType(e.target.value)} style={{marginBottom:'15px'}}><option value="interval">Interval (Minutes)</option><option value="daily">Daily (Time)</option></select>
                    <div style={{display:'flex', gap:'10px'}}>
                        {schedType === 'interval' ? <input type="number" className="input-field" value={schedValue} onChange={(e) => setSchedValue(e.target.value)} placeholder="Minutes" /> : <input type="time" className="input-field" value={schedValue} onChange={(e) => setSchedValue(e.target.value)} />}
                        <button onClick={handleCreate} className="btn btn-primary">Activate</button>
                    </div>
                </div>
            </div>
        </div>
    );
};

// --- MAIN APP ---
function App() {
  const [activeView, setActiveView] = useState("BUILDER");
  const [baseDatasets, setBaseDatasets] = useState([]); 
  const [steps, setSteps] = useState([]);
  const [loading, setLoading] = useState(false);
  const [currentRunningStep, setCurrentRunningStep] = useState(null); 
  const [selectedInputIds, setSelectedInputIds] = useState([]); 
  const [prompt, setPrompt] = useState("");
  const [editingStepId, setEditingStepId] = useState(null);
  const [mode, setMode] = useState("AI"); 
  const [viewingDataset, setViewingDataset] = useState(null); 
  const [savedWorkflows, setSavedWorkflows] = useState([]);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState("");
  const [historicalRunId, setHistoricalRunId] = useState(null); 
  const [showScheduler, setShowScheduler] = useState(false);
  
  // Dropdown state
  const [availableTables, setAvailableTables] = useState([]);
  const [selectedTable, setSelectedTable] = useState("");
  const [highlightedContextId, setHighlightedContextId] = useState(null);

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  // --- SIMULATED THOUGHT STREAM STATE ---
  const [loadingMessage, setLoadingMessage] = useState("");

  useEffect(() => {
    let interval;
    if (loading) {
      const messages = mode === "AGENT" 
        ? ["🤖 Agent is analyzing dataset schemas...", "🔍 Identifying common columns (IDs, Dates)...", "🧮 Detecting data types and formats...", "🐍 Generative AI is writing reconciliation logic...", "✅ Validating transformation code..."]
        : ["⚡️ Reading your instructions...", "🧠 Analyzing input data structure...", "🐍 Generating Python transformation logic...", "✨ Optimizing code efficiency..."];
      
      let i = 0;
      setLoadingMessage(messages[0]);
      interval = setInterval(() => { i = (i + 1) % messages.length; setLoadingMessage(messages[i]); }, 2500); 
    }
    return () => clearInterval(interval);
  }, [loading, mode]);


  useEffect(() => { fetchWorkflows(); fetchTables(); }, []);
  const fetchWorkflows = async () => { try { const res = await axios.get(`${API_BASE_URL}/workflows`); setSavedWorkflows(res.data); } catch (e) {} };
  
  const fetchTables = async () => { 
      try { 
          const res = await axios.get(`${API_BASE_URL}/db/tables`); 
          setAvailableTables(res.data.tables); 
      } catch (e) {} 
  };

  const handleLoadTable = async () => {
    if(!selectedTable) return;
    setLoading(true);
    try {
        const res = await axios.post(`${API_BASE_URL}/db/load`, { table_name: selectedTable });
        const newDataset = { 
            id: `dataset-${Date.now()}`, 
            name: selectedTable, 
            varName: `df_${selectedTable.replace(/[^a-zA-Z0-9]/g, '_')}`, 
            data: res.data.data,
            type: 'source' 
        };
        setBaseDatasets(prev => [...prev, newDataset]);
        setSelectedTable(""); 
        console.log("Loaded:", newDataset.name);
    } catch (e) { alert("Failed load: " + e.message); } finally { setLoading(false); }
  };
  
  // --- NEW: HANDLE CSV UPLOAD ---
  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);
    setLoading(true);

    try {
      const res = await axios.post(`${API_BASE_URL}/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      
      const newDataset = { 
        id: `dataset-${Date.now()}`, 
        name: file.name, 
        varName: `df_${file.name.replace(/[^a-zA-Z0-9]/g, '_')}`, 
        data: res.data.data,
        type: 'source' 
      };

      setBaseDatasets(prev => [...prev, newDataset]);
      console.log("Uploaded:", newDataset.name);
    } catch (err) {
      alert("Upload failed: " + (err.response?.data?.detail || err.message));
    } finally {
      setLoading(false);
      e.target.value = null; // Reset input
    }
  };

  const handleDeleteContext = (e, id) => {
    e.stopPropagation(); 
    setBaseDatasets(prev => prev.filter(ds => ds.id !== id));
    if (viewingDataset && viewingDataset.id === id) setViewingDataset(null);
  };

  const handleViewHistoryRun = async (run) => {
    setLoading(true);
    try {
        const wf = savedWorkflows.find(w => w.id === run.workflow_id);
        if (!wf) throw new Error("Workflow definition not found.");
        setHistoricalRunId(run.id); setSelectedWorkflowId(run.workflow_id); setActiveView("BUILDER");
        const restoredSteps = [];
        for (let i = 0; i < wf.steps.length; i++) {
            const step = wf.steps[i];
            const isFinal = i === wf.steps.length - 1;
            const tableName = isFinal ? `${run.id}_final` : `${run.id}_step_${step.numericId}`;
            let stepData = [];
            try { const res = await axios.post(`${API_BASE_URL}/db/load`, { table_name: tableName }); stepData = res.data.data; } catch (err) { stepData = []; }
            restoredSteps.push({ ...step, data: stepData });
        }
        setSteps(restoredSteps);
    } catch (e) { alert("Error: " + e.message); } finally { setLoading(false); }
  };

  const downloadCSV = (step) => {
    if (!step.data || step.data.length === 0) return alert("No data");
    const headers = Object.keys(step.data[0]);
    const csvContent = [headers.join(','), ...step.data.map(row => headers.map(fieldName => JSON.stringify(row[fieldName] ?? '')).join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `step_${step.numericId}.csv`);
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
  };

  const handleProcess = async () => {
    if (selectedInputIds.length === 0) return alert("Select inputs.");
    if (!prompt) return alert("Enter instructions.");
    setLoading(true);
    try {
        const payloadDatasets = {};
        selectedInputIds.forEach(id => {
            const base = baseDatasets.find(d => d.id === id);
            if (base) { payloadDatasets[base.varName] = base.data; return; }
            const step = steps.find(s => s.id === id);
            if (step) { payloadDatasets[`df_step_${step.numericId}`] = step.data; return; }
        });
        const taskType = mode === "AGENT" ? "RECON" : "GENERAL";
        const promptPrefix = mode === "AGENT" ? "🤖 Agent Task: " : "";
        const response = await axios.post(`${API_BASE_URL}/process_multi`, { datasets: payloadDatasets, prompt: prompt, task_type: taskType });
        const resultStep = {
            id: editingStepId || `step-${steps.length + 1}`,
            numericId: editingStepId ? steps.find(s => s.id === editingStepId).numericId : steps.length + 1,
            inputIds: selectedInputIds,
            prompt: `${promptPrefix}${prompt}`, 
            code: response.data.code,
            data: response.data.result
        };
        if (editingStepId) { setSteps(steps.map(s => s.id === editingStepId ? resultStep : s)); setEditingStepId(null); } 
        else { setSteps([...steps, resultStep]); }
        setPrompt(""); setSelectedInputIds([resultStep.id]); 
    } catch (e) { alert("Error: " + (e.response?.data?.detail || e.message)); } finally { setLoading(false); }
  };

  const runFullWorkflow = async () => {
    if (baseDatasets.length === 0) return alert("No data loaded.");
    if (steps.length === 0) return alert("No steps.");
    setLoading(true);
    const runId = `run_${new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14)}`;
    let tempSteps = [...steps]; 
    try {
        for (let i = 0; i < steps.length; i++) {
            const step = steps[i];
            const isFinalStep = i === steps.length - 1;
            setCurrentRunningStep(step.id);
            const payloadDatasets = {};
            baseDatasets.forEach(ds => { if (step.code.includes(ds.varName)) payloadDatasets[ds.varName] = ds.data; });
            step.inputIds.forEach(id => {
                const prevStep = tempSteps.find(s => s.id === id);
                if (prevStep && prevStep.data) payloadDatasets[`df_step_${prevStep.numericId}`] = prevStep.data;
            });
            if (Object.keys(payloadDatasets).length === 0) {
                 step.inputIds.forEach(id => { const base = baseDatasets.find(d => d.id === id); if (base) payloadDatasets[base.varName] = base.data; });
            }
            const response = await axios.post(`${API_BASE_URL}/execute_multi`, { datasets: payloadDatasets, code: step.code });
            const resultData = response.data.result;
            tempSteps = tempSteps.map(s => s.id === step.id ? { ...s, data: resultData } : s);
            setSteps(tempSteps);
            const tableName = isFinalStep ? `final_${runId}` : `temp_${runId}_step_${step.numericId}`;
            await axios.post(`${API_BASE_URL}/db/save`, { table_name: tableName, data: resultData });
            await new Promise(r => setTimeout(r, 300)); 
        }
        fetchTables(); 
        alert(`✅ Complete! Saved as 'final_${runId}'`);
    } catch (e) { alert(`❌ Failed: ${e.response?.data?.detail || e.message}`); } finally { setLoading(false); setCurrentRunningStep(null); }
  };

  const handleReset = () => { if(steps.length > 0 && !window.confirm("Clear unsaved progress?")) return; setBaseDatasets([]); setSteps([]); setPrompt(""); setSelectedInputIds([]); setEditingStepId(null); setSelectedWorkflowId(""); setMode("AI"); setHistoricalRunId(null); };
  const handleSelectWorkflow = (id) => { setSelectedWorkflowId(id); if (!id) return; const wf = savedWorkflows.find(w => w.id === id); if (wf) { const cleanSteps = wf.steps.map(s => ({ ...s, data: [] })); setSteps(cleanSteps); setEditingStepId(null); } };
  
  const handleDeleteAgent = async (id) => { 
      if (!window.confirm("Delete agent?")) return;
      try { await axios.delete(`${API_BASE_URL}/workflows/${id}`); alert("Deleted."); if(selectedWorkflowId === id) { setSelectedWorkflowId(""); handleReset(); } fetchWorkflows(); } catch (e) { alert("Failed."); } 
  };
  const handleStopSchedule = async (scheduleId) => { if (!window.confirm("Stop schedule?")) return; try { await axios.delete(`${API_BASE_URL}/schedules/${scheduleId}`); alert("Stopped."); fetchWorkflows(); } catch(e) { alert("Failed: " + e.message); } };
  const handleEditSchedule = (id) => { setSelectedWorkflowId(id); setShowScheduler(true); };
  const saveWorkflow = async () => { const name = window.prompt("Name:", `Process ${new Date().toLocaleDateString()}`); if (!name) return; try { await axios.post(`${API_BASE_URL}/workflows`, { name, steps }); alert("Saved!"); fetchWorkflows(); } catch (e) { alert("Fail"); } };
  const handleEdit = (step) => { setEditingStepId(step.id); if (step.prompt.startsWith("🤖")) { setMode("AGENT"); setPrompt(step.prompt.replace(/🤖.*?: /, "")); } else { setMode("AI"); setPrompt(step.prompt); } setSelectedInputIds(step.inputIds || []); document.getElementById("control-panel").scrollIntoView({ behavior: 'smooth' }); };
  const handleCancelEdit = () => { setEditingStepId(null); setPrompt(""); setSelectedInputIds([]); };
  const toggleSelection = (id) => { setSelectedInputIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]); };
  
  const handleContextSelect = (id) => { setHighlightedContextId(id); };
  const handleContextView = (e, ds) => { e.stopPropagation(); setViewingDataset(ds); };

  useEffect(() => {
    const rawNodes = []; const rawEdges = [];
    baseDatasets.forEach((ds) => { rawNodes.push({ id: ds.id, type: 'input', data: { label: `📄 ${ds.name}` }, position: { x: 0, y: 0 }, style: { background: '#fff', border: '2px solid #64748b', borderRadius: '8px', padding: '10px', fontWeight: 'bold' } }); });
    steps.forEach((step) => {
        rawNodes.push({ id: step.id, data: { label: `Stage ${step.numericId}` }, position: { x: 0, y: 0 }, style: { background: currentRunningStep === step.id ? '#dbeafe' : '#fff', border: '2px solid #4f46e5', borderRadius: '8px', padding: '15px' } });
        baseDatasets.forEach(ds => { if (step.code && step.code.includes(ds.varName)) rawEdges.push({ id: `e-${ds.id}-${step.id}`, source: ds.id, target: step.id, animated: true }); });
        step.inputIds.forEach(parentId => { if (parentId.startsWith('step-')) rawEdges.push({ id: `e-${parentId}-${step.id}`, source: parentId, target: step.id, animated: true }); });
    });
    const layout = getLayoutedElements(rawNodes, rawEdges); setNodes([...layout.nodes]); setEdges([...layout.edges]);
  }, [baseDatasets, steps, editingStepId, currentRunningStep]);

  const allOptions = [...baseDatasets.map(d => ({id: d.id, label: `📄 ${d.name}`})), ...steps.map(s => ({id: s.id, label: `⚙️ Stage ${s.numericId}`}))];

  return (
    <div className="app-root">
      <div className="header">
          <div className="header-left">
              <h1 className="header-title"><span style={{color:'#2563eb'}}>⚡️</span> AutoFlow</h1>
              <div className="nav-tabs">
                  <div className={`nav-item ${activeView==='BUILDER'?'active':''}`} onClick={()=>setActiveView('BUILDER')}>Builder</div>
                  <div className={`nav-item ${activeView==='DASHBOARD'?'active':''}`} onClick={()=>setActiveView('DASHBOARD')}>Dashboard</div>
              </div>
          </div>
          {activeView === 'BUILDER' && <button onClick={handleReset} className="btn btn-secondary btn-sm">+ New Project</button>}
      </div>

      {showScheduler && selectedWorkflowId && (
          <SchedulerModal workflowId={selectedWorkflowId} workflowName={savedWorkflows.find(w => w.id === selectedWorkflowId)?.name} onClose={() => setShowScheduler(false)} />
      )}

      {viewingDataset && (
          <div className="modal-overlay">
              <div className="modal-content">
                  <div className="modal-header"><h3 style={{margin:0}}>📄 {viewingDataset.name}</h3><button className="btn-close" onClick={() => setViewingDataset(null)}>×</button></div>
                  <div className="modal-body"><PaginatedTable data={viewingDataset.data} /></div>
              </div>
          </div>
      )}

      {activeView === 'DASHBOARD' && (
          <Dashboard workflows={savedWorkflows} onInspectRun={handleViewHistoryRun} onDeleteAgent={handleDeleteAgent} onStopSchedule={handleStopSchedule} onEditSchedule={handleEditSchedule} />
      )}

      {activeView === 'BUILDER' && (
          <div className="builder-layout">
            <div className="control-pane">
                {historicalRunId && (
                    <div style={{background:'#fff7ed', border:'1px solid #fdba74', color:'#c2410c', padding:'12px', borderRadius:'8px', fontSize:'0.9rem', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                        <span>🕰️ <strong>Historical View:</strong> Run {historicalRunId}</span>
                        <button onClick={handleReset} style={{background:'white', border:'1px solid #fdba74', color:'#c2410c', padding:'4px 10px', borderRadius:'4px', cursor:'pointer', fontWeight:'bold'}}>Exit</button>
                    </div>
                )}

                <div className="toolbar">
                    <div className="toolbar-group">
                        <select value={selectedWorkflowId} onChange={(e) => handleSelectWorkflow(e.target.value)} className="select-dark">
                            <option value="">-- Load Saved Agents --</option>
                            {savedWorkflows.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                        </select>
                        <button onClick={saveWorkflow} className="btn btn-success btn-sm">Save</button>
                        {selectedWorkflowId && <button onClick={() => handleDeleteAgent(selectedWorkflowId)} className="btn btn-danger btn-sm">Delete</button>}
                        {selectedWorkflowId && <button onClick={() => setShowScheduler(true)} className="btn btn-secondary btn-sm">⏰</button>}
                    </div>
                    {!historicalRunId && <button onClick={runFullWorkflow} disabled={loading} className="btn btn-run">{loading ? "Running Automation..." : "▶ Run Automation"}</button>}
                </div>

                {/* SECTION 1 DATA CONTEXT */}
                <div className="panel">
                    <label className="label">1. Data Context</label>
                    <div style={{display:'flex', gap:'10px', marginBottom:'10px', flexWrap:'wrap'}}>
                        <select className="input-field" style={{marginBottom:0, width:'auto', flexGrow:1}} value={selectedTable} onChange={(e) => setSelectedTable(e.target.value)}>
                            <option value="">-- Select Source Table --</option>
                            {availableTables.filter(t => !t.startsWith("temp_") && !t.startsWith("final_") && !t.startsWith("run_")).map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                        <button onClick={handleLoadTable} disabled={loading || !selectedTable} className="btn btn-primary btn-sm" style={{width:'auto'}}>Load DB</button>
                        
                        {/* NEW: Upload Button */}
                        <div style={{position: 'relative', overflow: 'hidden', display: 'inline-block'}}>
                            <button className="btn btn-secondary btn-sm" style={{height: '100%'}}>📂 Upload CSV</button>
                            <input 
                                type="file" 
                                accept=".csv"
                                onChange={handleFileUpload}
                                style={{
                                    position: 'absolute', 
                                    left: 0, 
                                    top: 0, 
                                    opacity: 0, 
                                    width: '100%', 
                                    height: '100%', 
                                    cursor: 'pointer'
                                }} 
                            />
                        </div>

                    </div>
                    
                    <div className="dataset-list">
                        {baseDatasets.length === 0 && <div style={{fontStyle:'italic', color:'#94a3b8', fontSize:'0.85rem'}}>No source datasets loaded.</div>}
                        {baseDatasets.map(ds => (
                          <div key={ds.id} className={`dataset-item ${highlightedContextId === ds.id ? 'selected' : ''}`} onClick={() => handleContextSelect(ds.id)}>
                            <div className="dataset-name"><span className="file-icon">📄</span><span>{ds.name}</span></div>
                            <div className="dataset-actions">
                                <button className="btn-view" onClick={(e) => handleContextView(e, ds)}>View</button>
                                <button className="btn-delete-context" onClick={(e) => handleDeleteContext(e, ds.id)} title="Remove">🗑</button>
                            </div>
                          </div>
                        ))}
                    </div>
                </div>

                {!historicalRunId && (
                    <div id="control-panel" className={`panel ${editingStepId ? 'editing' : ''}`}>
                        <div style={{display:'flex', justifyContent:'space-between', marginBottom:'10px'}}>
                            <span className="label" style={{color: editingStepId ? '#d97706' : ''}}>{editingStepId ? "Edit Configuration" : "2. Transformation Engine"}</span>
                            {editingStepId && <button onClick={handleCancelEdit} className="btn btn-outline btn-sm">Cancel</button>}
                        </div>

                        {loading && !currentRunningStep ? (
                           <div className="processing-view"><div className="spinner"></div><div className="processing-text">{loadingMessage}</div></div>
                        ) : (
                           <>
                              <div className="inner-tabs"><div className={`inner-tab ${mode === "AI" ? "active" : ""}`} onClick={() => setMode("AI")}>Natural Language</div><div className={`inner-tab ${mode === "AGENT" ? "active" : ""}`} onClick={() => setMode("AGENT")}>Smart Modules</div></div>
                              <label className="label">Input Streams</label>
                              <div style={{border:'1px solid #e2e8f0', borderRadius:'6px', padding:'10px', maxHeight:'150px', overflowY:'auto', background:'#f8fafc', marginBottom:'15px'}}>
                                  {allOptions.length > 0 ? allOptions.map(opt => (<div key={opt.id} style={{display:'flex', gap:'8px', fontSize:'0.9rem', marginBottom:'4px'}}><input type="checkbox" checked={selectedInputIds.includes(opt.id)} onChange={() => toggleSelection(opt.id)} />{opt.label}</div>)) : <div style={{color:'#94a3b8', fontStyle:'italic', fontSize:'0.85rem'}}>Load data to begin.</div>}
                              </div>
                              {mode === "AI" ? (
                                  <div><label className="label">Transformation Logic</label><textarea className="textarea-field" placeholder="Describe the logic..." value={prompt} onChange={(e) => setPrompt(e.target.value)} /><button onClick={handleProcess} disabled={loading} className="btn btn-primary">Add Stage</button></div>
                              ) : (
                                  <div className="agent-card">
                                      <div className="agent-header"><h3 className="agent-title">🤖 Reconciliation Module</h3><p className="agent-desc">Performs multi-way matching on datasets. Identifies breaks, variances, and orphans automatically.</p></div>
                                      <div className="agent-body"><label className="label" style={{color:'#3730a3'}}>Objective</label><textarea className="textarea-field" style={{minHeight:'80px'}} placeholder="e.g. 'Match GL against Bank Statement on Amount and Date.'" value={prompt} onChange={(e) => setPrompt(e.target.value)} /><button onClick={handleProcess} disabled={loading} className="btn btn-agent">{loading ? "Module Running..." : "Initialize Module"}</button></div>
                                  </div>
                              )}
                           </>
                        )}
                    </div>
                )}

                {steps.map((step) => (
                    <div key={step.id} className="step-card">
                        <div className="step-header"><span>STAGE {step.numericId}</span>{!historicalRunId && <div><button onClick={() => downloadCSV(step)} className="btn btn-outline btn-sm" style={{marginRight:'5px'}}>Export</button><button onClick={() => handleEdit(step)} className="btn btn-outline btn-sm">Config</button></div>}</div>
                        <div className="step-content">
                            <div className="logic-text">{step.prompt}</div>
                            <details className="code-widget"><summary>View Execution Logic</summary><pre className="code-block">{step.code || "# No code generated"}</pre></details>
                            <div className="label">Output Preview:</div>
                            <PaginatedTable data={step.data} />
                        </div>
                    </div>
                ))}
            </div>
            <div className="canvas-pane"><ReactFlow nodes={nodes} edges={edges} fitView><Background color="#cbd5e1" gap={20} /><Controls /></ReactFlow></div>
          </div>
      )}
    </div>
  );
}
export default App;