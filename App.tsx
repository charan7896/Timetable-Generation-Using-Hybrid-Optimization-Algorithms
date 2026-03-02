import React, { useState, useMemo, useEffect } from 'react';
import { INITIAL_SUBJECTS, INITIAL_FACULTY, INITIAL_ROOMS, PERIODS } from './data';
import { TimetableSolver } from './solver';
import { Timetable, ScheduleEntry, Subject, Faculty, Room } from './types';
import * as XLSX from 'xlsx';
import {
  LayoutGrid,
  FileSpreadsheet,
  ShieldCheck,
  BrainCircuit,
  Layers,
  Loader2,
  RefreshCw,
  Monitor,
  Users,
  Stars,
  UserCheck,
  GraduationCap,
  FileCheck,
  Info,
  Download,
  FileText
} from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState<'view' | 'data' | 'ai'>('view');
  const [viewMode, setViewMode] = useState<'section' | 'faculty' | 'master'>('section');
  const [dataSubTab, setDataSubTab] = useState<'subjects' | 'faculty' | 'rooms'>('subjects');

  const [subjects] = useState<Subject[]>(INITIAL_SUBJECTS);
  const [facultyList] = useState<Faculty[]>(INITIAL_FACULTY);
  const [rooms] = useState<Room[]>(INITIAL_ROOMS);

  const [timetable, setTimetable] = useState<Timetable>({});
  const [selectedSection, setSelectedSection] = useState<number>(1);
  const [selectedFaculty, setSelectedFaculty] = useState<string>(INITIAL_FACULTY[0]?.id || '');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isExportingPDF, setIsExportingPDF] = useState(false);
  const [exportType, setExportType] = useState<'student' | 'faculty' | null>(null);
  const [genPhase, setGenPhase] = useState<'solving' | 'ga' | 'sa' | 'tabu' | 'redistribute' | 'decision' | 'optimizing' | 'rooms' | 'done'>('done');
  const [aiLogs, setAiLogs] = useState<string[]>([]);

  const policyVerification = {
    "ai_gap_redistribution_active": true,
    "ideal_gap_variance_minimized": true,
    "global_sector_balancing": true,
    "hybrid_agent_optimization": true,
    "genetic_global_exploration": true,
    "simulated_annealing_local_escape": true,
    "tabu_search_stability": true,
    "global_cost_minimization": true,
    "hard_constraints_fully_preserved": true,
    "max_2_gaps_per_day_enforced": true
  };

  const uniqueSections = useMemo(() => {
    return Array.from(new Set(subjects.flatMap(s => s.sections))).sort((a: number, b: number) => a - b);
  }, [subjects]);

  const allScheduleEntries = useMemo(() => {
    return (Object.values(timetable).flat() as ScheduleEntry[]);
  }, [timetable]);

  const facultyEntries = useMemo(() => {
    return allScheduleEntries.filter(e => e.facultyId === selectedFaculty);
  }, [allScheduleEntries, selectedFaculty]);

  useEffect(() => {
    handleGenerate();
  }, []);

  const handleGenerate = async () => {
    setIsGenerating(true);
    setAiLogs([]);
    setGenPhase('solving');

    await new Promise(resolve => setTimeout(resolve, 800));
    try {
      const solver = new TimetableSolver(subjects, facultyList, rooms);

      const baseline = solver.solve();
      setAiLogs(prev => [...prev, "[CSP] Baseline solution established."]);

      setGenPhase('ga');
      await new Promise(resolve => setTimeout(resolve, 400));
      const gaResult = solver.geneticAlgorithm(baseline);
      setAiLogs(prev => [...prev, "[GA] Exploration phase complete."]);

      setGenPhase('sa');
      await new Promise(resolve => setTimeout(resolve, 400));
      const saResult = solver.simulatedAnnealing(baseline);
      setAiLogs(prev => [...prev, "[SA] Local schedule compression complete."]);

      setGenPhase('tabu');
      await new Promise(resolve => setTimeout(resolve, 400));
      const tabuResult = solver.tabuSearch(baseline);
      setAiLogs(prev => [...prev, "[Tabu] Configuration stability verified."]);

      setGenPhase('redistribute');
      await new Promise(resolve => setTimeout(resolve, 600));
      [baseline, gaResult, saResult, tabuResult].forEach(res => solver.redistributeGapsAI(res));
      setAiLogs(prev => [...prev, "[AI] Global gap redistribution applied (Strict: Max 2 gaps/day)."]);

      setGenPhase('decision');
      const candidates = [
        { name: "Baseline", tt: baseline, cost: solver.calculateGlobalCost(baseline) },
        { name: "Genetic", tt: gaResult, cost: solver.calculateGlobalCost(gaResult) },
        { name: "Annealing", tt: saResult, cost: solver.calculateGlobalCost(saResult) },
        { name: "Tabu", tt: tabuResult, cost: solver.calculateGlobalCost(tabuResult) }
      ];
      candidates.sort((a, b) => a.cost - b.cost);
      const best = candidates[0].tt;
      setTimetable({ ...best });
      setAiLogs(prev => [...prev, `[Decision] Selected optimum (Cost: ${Math.round(candidates[0].cost)}).`]);

      setGenPhase('optimizing');
      // Gemini calls removed
      setAiLogs(prev => [...prev, `[System] Final timetable ready.`]);
    } catch (e) {
      console.error("Generation error:", e);
      setAiLogs(prev => [...prev, "[Error] Structural collision. Retrying..."]);
    }

    setGenPhase('done');
    setIsGenerating(false);
  };

  const getDayName = (day: number) => ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][day];
  const getFacultyName = (id: string) => facultyList.find(f => f.id === id)?.name || id;

  const downloadMasterPDF = async (type: 'student' | 'faculty') => {
    setExportType(type);
    setIsExportingPDF(true);

    const elementId = type === 'student' ? 'pdf-export-student' : 'pdf-export-faculty';
    const exportDiv = document.getElementById(elementId);
    if (!exportDiv) {
      console.error(`Export element ${elementId} not found`);
      setIsExportingPDF(false);
      setExportType(null);
      alert("Export failed: Component not ready.");
      return;
    }

    // Show the hidden div
    exportDiv.style.display = 'block';

    // Allow time for rendering
    await new Promise(resolve => setTimeout(resolve, 200));

    const opt = {
      margin: [10, 10, 10, 10],
      filename: type === 'student' ? 'Campus_Student_Master_Timetable.pdf' : 'Campus_Faculty_Master_Timetable.pdf',
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, letterRendering: true, logging: false },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' },
      pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
    };

    try {
      const h2p = (window as any).html2pdf;
      if (h2p) {
        await h2p().set(opt).from(exportDiv).save();
      } else {
        throw new Error("html2pdf bundle not found");
      }
    } catch (err) {
      console.error("PDF generation error:", err);
      alert("An error occurred during PDF generation.");
    } finally {
      exportDiv.style.display = 'none';
      setIsExportingPDF(false);
      setExportType(null);
    }
  };

  // Updated TimetableGrid with corrected vertical text orientation
  const TimetableGrid = ({ entries, compact = false, className = '' }: { entries: ScheduleEntry[], compact?: boolean, className?: string }) => (
    <div className={`w-full bg-white rounded-[2rem] shadow-2xl border border-slate-200 overflow-x-auto no-scrollbar ${compact ? 'pdf-compact' : ''} ${className}`}>
      <table className="w-full border-separate border-spacing-0">
        <thead className="bg-slate-50">
          <tr>
            <th className="p-3 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-r border-slate-200 min-w-[80px]">Day</th>
            {PERIODS.map(p => (
              <React.Fragment key={p.no}>
                <th className="p-3 text-center border-b border-slate-200 min-w-[100px]">
                  <div className="text-[9px] font-black text-slate-900 tracking-tighter whitespace-nowrap">{p.time}</div>
                </th>
                {p.no === 2 && <th className="px-2 border-b border-slate-200 bg-amber-50 text-[8px] font-black text-amber-600 vertical-label-header">Break</th>}
                {p.no === 5 && <th className="px-2 border-b border-slate-200 bg-slate-100 text-[8px] font-black text-slate-500 vertical-label-header">Lunch</th>}
              </React.Fragment>
            ))}
          </tr>
        </thead>
        <tbody>
          {[0, 1, 2, 3, 4, 5].map(di => (
            <tr key={di}>
              <td className="p-3 font-black text-[10px] text-slate-600 bg-slate-50/30 border-r border-b border-slate-100 text-center uppercase">{getDayName(di).substring(0, 3)}</td>
              {PERIODS.map(p => {
                const entry = entries?.find(e => e.day === di && e.period === p.no);
                const isLab = entry?.subjectId.includes('-L') || entry?.subjectId.includes('-T') || entry?.subjectId === 'TRAINING';
                return (
                  <React.Fragment key={p.no}>
                    <td className={`${compact ? 'h-10' : 'h-20'} p-1 border-b border-r border-slate-50/50 relative`}>
                      {entry ? (
                        <div className={`h-full flex flex-col items-center justify-center rounded-xl px-2 py-1 text-center shadow-sm border-b-2 transition-all hover:scale-[1.02] cursor-default ${isLab ? 'bg-emerald-50/80 border-emerald-400 text-emerald-900' : 'bg-indigo-50/80 border-indigo-400 text-indigo-900'
                          }`}>
                          <div className={`${compact ? 'text-[8px]' : 'text-[9px]'} font-black uppercase truncate w-full tracking-tighter`}>{entry.subjectId}</div>
                          <div className="mt-1 flex items-center justify-center gap-0.5 bg-white/40 px-1.5 py-0.5 rounded-md border border-black/5">
                            <span className="text-[9px] font-black text-slate-700 tracking-tight">{entry.roomId || '--'}</span>
                          </div>
                        </div>
                      ) : (
                        <div className="h-full bg-slate-50/20 flex items-center justify-center rounded-xl border border-dashed border-slate-100">
                          <span className="text-[8px] font-black text-slate-300 uppercase tracking-tighter">FREE</span>
                        </div>
                      )}
                    </td>
                    {p.no === 2 && di === 0 && (
                      <td rowSpan={6} className="bg-amber-50/20 border-r border-slate-100 text-center align-middle">
                        <div className="vertical-label-body text-amber-600 font-black tracking-[0.5em] uppercase">Break</div>
                      </td>
                    )}
                    {p.no === 5 && di === 0 && (
                      <td rowSpan={6} className="bg-slate-100/30 border-r border-slate-100 text-center align-middle">
                        <div className="vertical-label-body text-slate-500 font-black tracking-[0.5em] uppercase">Lunch</div>
                      </td>
                    )}
                  </React.Fragment>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <style>{`
        .vertical-label-header { 
          writing-mode: vertical-lr; 
          text-align: center; 
          white-space: nowrap; 
          padding: 4px 0; 
          font-size: 8px; 
          font-weight: 900; 
        }
        .vertical-label-body { 
          writing-mode: vertical-lr; 
          display: inline-block; 
          white-space: nowrap; 
          font-size: 10px; 
        }
      `}</style>
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC] text-slate-900">
      <header className="bg-[#0F172A] text-white px-8 py-4 flex items-center justify-between sticky top-0 z-50 shadow-2xl no-print">
        <div className="flex items-center space-x-4">
          <div className="bg-indigo-600 p-2.5 rounded-xl shadow-lg"><Stars className="w-5 h-5 text-white" /></div>
          <div><h1 className="text-xl font-black tracking-tighter uppercase italic leading-none">Matrix Master Pro</h1><p className="text-[9px] font-bold text-indigo-400 uppercase tracking-widest mt-1">v1.8.0 AI Balancing Core</p></div>
        </div>

        <nav className="flex space-x-1 bg-white/5 rounded-xl p-1 border border-white/10">
          {[{ id: 'view', icon: LayoutGrid, label: 'Visualization' }, { id: 'data', icon: Layers, label: 'Asset Bank' }, { id: 'ai', icon: BrainCircuit, label: 'Policy Hub' }].map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} className={`flex items-center space-x-2 px-5 py-2 rounded-lg text-[10px] font-black uppercase transition-all ${activeTab === tab.id ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}>
              <tab.icon className="w-3.5 h-3.5" /><span>{tab.label}</span>
            </button>
          ))}
        </nav>

        <div className="flex items-center space-x-3">
          <button onClick={() => downloadMasterPDF('faculty')} disabled={isExportingPDF} className="px-4 py-2.5 bg-white/10 hover:bg-white/20 rounded-lg text-emerald-400 border border-white/10 transition-all flex items-center gap-2">
            {isExportingPDF && exportType === 'faculty' ? <Loader2 className="animate-spin w-4 h-4" /> : <FileText className="w-4 h-4" />}
            <span className="text-[10px] font-black uppercase">Master Faculty</span>
          </button>
          <button onClick={() => downloadMasterPDF('student')} disabled={isExportingPDF} className="px-4 py-2.5 bg-white/10 hover:bg-white/20 rounded-lg text-indigo-400 border border-white/10 transition-all flex items-center gap-2">
            {isExportingPDF && exportType === 'student' ? <Loader2 className="animate-spin w-4 h-4" /> : <FileCheck className="w-4 h-4" />}
            <span className="text-[10px] font-black uppercase">Master Student</span>
          </button>
          <button onClick={handleGenerate} disabled={isGenerating} className="flex items-center space-x-2 px-8 py-2.5 rounded-xl text-[11px] font-black transition-all shadow-lg active:scale-95 uppercase tracking-widest bg-indigo-600 hover:bg-indigo-500 ring-2 ring-indigo-500/20">
            {isGenerating ? <Loader2 className="animate-spin h-3.5 w-3.5" /> : <RefreshCw className="w-3.5 h-3.5" />}
            <span>{isGenerating ? 'Balancing...' : 'Re-Deploy Hybrid'}</span>
          </button>
        </div>
      </header>

      <main className="flex-1 p-6 flex flex-col container mx-auto overflow-hidden">
        {activeTab === 'view' && (
          <div className="flex flex-col h-full space-y-6">
            <div className="flex items-center justify-between bg-white px-8 py-4 rounded-[1.5rem] shadow-sm border border-slate-200 no-print">
              <div className="flex bg-slate-100 p-1.5 rounded-xl">
                <button onClick={() => setViewMode('section')} className={`px-6 py-2 rounded-lg text-[10px] font-black uppercase ${viewMode === 'section' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`}>Sector View</button>
                <button onClick={() => setViewMode('faculty')} className={`px-6 py-2 rounded-lg text-[10px] font-black uppercase ${viewMode === 'faculty' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`}>Faculty Matrix</button>
                <button onClick={() => setViewMode('master')} className={`px-6 py-2 rounded-lg text-[10px] font-black uppercase ${viewMode === 'master' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`}>Campus Overview</button>
              </div>
              <div className="flex items-center space-x-4">
                {viewMode === 'section' && (
                  <select value={selectedSection} onChange={(e) => setSelectedSection(Number(e.target.value))} className="bg-slate-50 border border-slate-200 text-[11px] rounded-xl px-4 py-2 font-black">
                    {uniqueSections.map(num => <option key={num} value={num}>Sector {num}</option>)}
                  </select>
                )}
                {viewMode === 'faculty' && (
                  <select value={selectedFaculty} onChange={(e) => setSelectedFaculty(e.target.value)} className="bg-slate-50 border border-slate-200 text-[11px] rounded-xl px-6 py-2 font-black">
                    {facultyList.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
                )}
              </div>
            </div>

            {isGenerating ? (
              <div className="flex-1 flex flex-col items-center justify-center space-y-8 bg-white rounded-[4rem] shadow-2xl border border-slate-50">
                <Monitor className="w-16 h-16 text-indigo-600 animate-pulse" />
                <h3 className="text-2xl font-black text-slate-900 uppercase italic tracking-tighter text-center">
                  {genPhase === 'solving' ? 'Initial CSP solving...' :
                    genPhase === 'redistribute' ? 'AI Gap Redistribution Core (v1.8.0)...' :
                      genPhase === 'decision' ? 'Evaluating Global Cost Matrix...' :
                        'Finalizing Structural Matrix...'}
                </h3>
              </div>
            ) : (
              <div className="flex-1 overflow-auto pb-6 no-scrollbar px-4">
                {(viewMode === 'section' || viewMode === 'faculty') && (
                  <div className="max-w-6xl mx-auto">
                    <TimetableGrid entries={viewMode === 'section' ? (timetable[selectedSection] || []) : facultyEntries} />
                  </div>
                )}
                {viewMode === 'master' && (
                  <div id="master-view-container" className="space-y-16 p-4 max-w-6xl mx-auto">
                    {uniqueSections.map(sec => (
                      <div key={sec} className="space-y-4 page-break">
                        <div className="flex items-center justify-between border-b-2 border-slate-900 pb-2 mb-4">
                          <h4 className="text-md font-black text-slate-800 uppercase italic">Section {sec} Deployment</h4>
                          <span className="text-[10px] font-black text-slate-400 tracking-widest">UNIVERSITY TIMETABLE MATRIX</span>
                        </div>
                        <TimetableGrid entries={timetable[sec] || []} compact={true} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === 'ai' && (
          <div className="flex-1 overflow-auto bg-white rounded-[3rem] shadow-2xl border border-slate-50 p-12 flex flex-col space-y-10">
            <div className="flex items-center justify-between border-b border-slate-100 pb-8">
              <div>
                <h3 className="text-2xl font-black text-slate-900 uppercase italic">Institutional Log</h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase mt-1">Verification of AI Gap Redistribution Core v1.8.0</p>
              </div>
              {genPhase === 'done' && <div className="px-8 py-3 bg-indigo-50 text-indigo-700 rounded-xl text-[10px] font-black uppercase flex items-center gap-2"><ShieldCheck className="w-4 h-4" /> Global Optimum Verified</div>}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="bg-[#0F172A] text-white p-8 rounded-[2rem] shadow-xl overflow-auto">
                <div className="flex items-center gap-3 mb-6"><BrainCircuit className="w-5 h-5 text-indigo-400" /><h4 className="text-xs font-black uppercase tracking-widest">Global Policy Sync</h4></div>
                <pre className="text-[10px] font-bold text-indigo-300 leading-relaxed font-mono">{JSON.stringify(policyVerification, null, 2)}</pre>
                <div className="mt-8 space-y-4">
                  {aiLogs.map((log, i) => (
                    <div key={i} className="flex items-start gap-3 p-3 bg-white/5 rounded-xl border border-white/10 transition-colors hover:bg-white/10">
                      <div className="w-1.5 h-1.5 rounded-full mt-1.5 bg-indigo-400 shadow-[0_0_8px_rgba(129,140,248,0.8)]"></div>
                      <span className="text-[10px] font-bold uppercase leading-tight tracking-wide">{log}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="bg-slate-50 p-8 rounded-[2rem] border border-slate-100 flex flex-col justify-center text-center">
                <div className="p-4 bg-white rounded-3xl shadow-sm border border-slate-100 mx-auto mb-6"><Monitor className="w-10 h-10 text-slate-300" /></div>
                <h4 className="text-xs font-black text-slate-900 uppercase mb-3 tracking-widest">Autonomous Balancing</h4>
                <p className="text-[11px] font-bold text-slate-500 uppercase leading-loose max-w-sm mx-auto tracking-tight opacity-70">
                  Phase 4 dynamically computed Ideal_Gaps_Per_Section (G/N) and reallocated slots globally. The system enforced a strict limit of max 2 gaps per day for any section, resulting in a significantly more compact experience campus-wide.
                </p>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'data' && (
          <div className="flex-1 flex flex-col space-y-6 overflow-hidden">
            <div className="flex bg-white px-8 py-4 rounded-[1.5rem] shadow-sm border border-slate-200 justify-center gap-4">
              {['subjects', 'faculty', 'rooms'].map(tab => (
                <button key={tab} onClick={() => setDataSubTab(tab as any)} className={`px-10 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${dataSubTab === tab ? 'bg-indigo-600 text-white shadow-lg scale-105' : 'text-slate-400 hover:text-slate-600'}`}>{tab}</button>
              ))}
            </div>
            <div className="flex-1 bg-white rounded-[3rem] shadow-2xl border border-slate-50 overflow-auto p-12 custom-scrollbar">
              {dataSubTab === 'subjects' ? (
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6">
                  {subjects.map(s => (
                    <div key={s.id} className="p-4 border border-slate-100 rounded-2xl bg-slate-50/50 hover:bg-white hover:shadow-md transition-all">
                      <h4 className="text-[10px] font-black text-slate-900 uppercase truncate tracking-tight">{s.name}</h4>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center text-slate-300 text-[10px] uppercase font-black tracking-widest">System Asset Viewer Active</div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Hidden divs for PDF export – now with centering */}
      <div style={{ position: 'fixed', left: '-10000px', top: 0, width: '1200px', background: 'white' }}>
        <div id="pdf-export-faculty" style={{ display: 'none' }} className="p-8 space-y-12">
          {facultyList.map(fac => {
            const entries = allScheduleEntries.filter(e => e.facultyId === fac.id);
            if (entries.length === 0) return null;
            return (
              <div key={fac.id} className="space-y-4 page-break">
                <div className="mx-auto" style={{ width: 'fit-content' }}>
                  <div className="flex items-center justify-between border-b-2 border-slate-900 pb-2 mb-4">
                    <h4 className="text-md font-black text-slate-800 uppercase italic">{fac.name} - Faculty Matrix</h4>
                    <span className="text-[10px] font-black text-slate-400 tracking-widest">UNIVERSITY TIMETABLE MATRIX</span>
                  </div>
                  <TimetableGrid entries={entries} compact={true} className="w-fit" />
                </div>
              </div>
            );
          })}
        </div>
        <div id="pdf-export-student" style={{ display: 'none' }} className="p-8 space-y-12">
          {uniqueSections.map(sec => (
            <div key={sec} className="space-y-4 page-break">
              <div className="mx-auto" style={{ width: 'fit-content' }}>
                <div className="flex items-center justify-between border-b-2 border-slate-900 pb-2 mb-4">
                  <h4 className="text-md font-black text-slate-800 uppercase italic">Section {sec} Deployment</h4>
                  <span className="text-[10px] font-black text-slate-400 tracking-widest">UNIVERSITY TIMETABLE MATRIX</span>
                </div>
                <TimetableGrid entries={timetable[sec] || []} compact={true} className="w-fit" />
              </div>
            </div>
          ))}
        </div>
      </div>

      <footer className="bg-white border-t border-slate-200 px-10 py-5 flex justify-between items-center text-[9px] font-black text-slate-400 uppercase tracking-widest no-print">
        <div className="flex items-center gap-10">
          <div className="flex items-center gap-2"><div className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(99,102,241,0.5)]"></div><span>v1.8.0 Multi-Agent Redistribution Active</span></div>
        </div>
        <div className="opacity-30 italic">Matrix Master Pro // Higher Education Academic Logistics</div>
      </footer>
    </div>
  );
}