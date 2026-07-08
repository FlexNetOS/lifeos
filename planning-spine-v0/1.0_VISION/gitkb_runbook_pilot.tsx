import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Play, Download, Copy, Settings, CheckCircle2, Circle, Clock, 
  TerminalSquare, GitMerge, FileText, AlertTriangle, ShieldCheck, 
  ArrowRight, Activity, FolderGit2, X, Lock, RefreshCw, MessageSquare
} from 'lucide-react';

const EXECUTION_MODES = [
  { id: 'static', name: 'Static Planning', description: 'Compile to structured tasks. No execution.' },
  { id: 'gitkb', name: 'GitKB Package', description: 'Generate GitKB-compatible Markdown with YAML frontmatter.' },
  { id: 'local', name: 'Local Runner (API)', description: 'API contract for local git-kb CLI runner. (Placeholder)' }
];

const computeStatuses = (tasks) => {
  if (!tasks || !Array.isArray(tasks)) return [];
  const taskMap = tasks.reduce((acc, t) => { acc[t.id] = t; return acc; }, {});
  
  return tasks.map(task => {
    if (task.status === 'completed') return task;
    
    const dependsOn = Array.isArray(task.depends_on) ? task.depends_on : [];
    
    const uncompletedDeps = dependsOn.filter(depId => {
      return taskMap[depId] && taskMap[depId].status !== 'completed';
    });

    if (uncompletedDeps.length > 0) {
      return { ...task, status: 'blocked' };
    } else {
      return { ...task, status: 'ready' };
    }
  });
};

export default function App() {
  const [urlInput, setUrlInput] = useState('');
  const [textInput, setTextInput] = useState('');
  const [config, setConfig] = useState({
    projectName: 'Dynamic Workspace',
    repoPath: './',
    agent: 'Codex-v4',
    mode: 'static'
  });
  
  const [runbook, setRunbook] = useState(null);
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [isCompiling, setIsCompiling] = useState(false);
  const [compileError, setCompileError] = useState(null);
  const [activeTab, setActiveTab] = useState('graph');
  const [generatingPrompt, setGeneratingPrompt] = useState(false);
  const [clarifications, setClarifications] = useState([]);
  
  useEffect(() => {
    if (runbook && runbook.tasks) {
      const updatedTasks = computeStatuses(runbook.tasks);
      const hasChanges = updatedTasks.some((ut, i) => ut.status !== runbook.tasks[i].status);
      if (hasChanges) {
        setRunbook({ ...runbook, tasks: updatedTasks });
      }
    }
  }, [runbook]);

  const handleCompile = async () => {
    setIsCompiling(true);
    setCompileError(null);
    setClarifications([]);
    
    const inputText = textInput.trim() || `Analyze the documentation at: ${urlInput}`;
    
    try {
      const apiKey = ""; // API key automatically provided
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-preview:generateContent?key=${apiKey}`;

      const payload = {
        contents: [{
          role: "user",
          parts: [{ text: `Analyze the following input and generate a structured runbook of actionable tasks. If the input contains ambiguous information, document it in an "Unknowns / Clarifications" section. Separate extracted facts from your own generated recommendations. 

Input:
${inputText}

Project Context:
Name: ${config.projectName}
Repository: ${config.repoPath}

Requirements:
- Break down the requirements into a logical sequence of execution tasks.
- Establish clear dependencies (depends_on) and blockers (blocks).
- Propose realistic terminal commands for each task. NEVER present them as already executed.
- Define strict verification gates and evidence requirements.
- Add rollback instructions for every task.
- If this is GitKB documentation, include steps for: GitKB setup (brew install gitkb/tap/gitkb, git-kb init, git-kb code index), Codex integration, MCP setup, code intelligence verification, and agent workflow enforcement.

Respond ONLY with a JSON object strictly matching this schema. Do not include markdown code blocks wrapping the JSON:
{
  "tasks": [
    {
      "id": "unique-short-id-like-t1",
      "slug": "descriptive-kebab-case-slug",
      "title": "Short actionable title",
      "type": "setup | integration | configuration | verification | documentation | general",
      "status": "pending",
      "priority": "p0 | p1 | p2",
      "parent": null,
      "depends_on": ["array of ids this task depends on"],
      "blocks": ["array of ids this task blocks"],
      "implements": ["array of spec IDs, e.g., spec-001"],
      "resolves": ["array of issue IDs, e.g., issue-123"],
      "tags": ["array of short tags"],
      "objective": "Clear description of what needs to be achieved (Fact vs Recommendation)",
      "inputs": ["array of required variables/inputs"],
      "allowed_actions": ["array of allowed system actions, e.g., read_file"],
      "forbidden_actions": ["array of forbidden actions, e.g., git_push"],
      "commands": ["array of proposed shell commands to execute (DRY RUN ONLY)"],
      "files_touched": ["array of file paths"],
      "verification": "Instruction on how to verify success",
      "evidence_required": ["array of specific outputs needed as proof"],
      "rollback": "Shell command or instructions to revert this task",
      "human_approval_required": true,
      "agent_notes": "Specific notes or constraints for the AI agent executing this"
    }
  ],
  "clarifications": [
    "List of ambiguous points or missing context found in the input"
  ]
}
          `}]
        }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              tasks: {
                type: "ARRAY",
                items: {
                  type: "OBJECT",
                  properties: {
                    id: { type: "STRING" },
                    slug: { type: "STRING" },
                    title: { type: "STRING" },
                    type: { type: "STRING" },
                    status: { type: "STRING" },
                    priority: { type: "STRING" },
                    parent: { type: "STRING", nullable: true },
                    depends_on: { type: "ARRAY", items: { type: "STRING" } },
                    blocks: { type: "ARRAY", items: { type: "STRING" } },
                    implements: { type: "ARRAY", items: { type: "STRING" } },
                    resolves: { type: "ARRAY", items: { type: "STRING" } },
                    tags: { type: "ARRAY", items: { type: "STRING" } },
                    objective: { type: "STRING" },
                    inputs: { type: "ARRAY", items: { type: "STRING" } },
                    allowed_actions: { type: "ARRAY", items: { type: "STRING" } },
                    forbidden_actions: { type: "ARRAY", items: { type: "STRING" } },
                    commands: { type: "ARRAY", items: { type: "STRING" } },
                    files_touched: { type: "ARRAY", items: { type: "STRING" } },
                    verification: { type: "STRING" },
                    evidence_required: { type: "ARRAY", items: { type: "STRING" } },
                    rollback: { type: "STRING" },
                    human_approval_required: { type: "BOOLEAN" },
                    agent_notes: { type: "STRING" }
                  },
                  required: ["id", "slug", "title", "type", "status", "priority", "depends_on", "blocks", "objective", "commands", "verification", "evidence_required", "rollback"]
                }
              },
              clarifications: {
                type: "ARRAY",
                items: { type: "STRING" }
              }
            },
            required: ["tasks"]
          }
        }
      };

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      const result = await response.json();
      
      if (result.candidates && result.candidates[0].content?.parts[0]?.text) {
        let jsonText = result.candidates[0].content.parts[0].text;
        const compiledData = JSON.parse(jsonText);
        
        const sanitizedTasks = (compiledData.tasks || []).map(t => ({...t, status: 'pending'}));

        setRunbook({
          meta: {
            generatedAt: new Date().toISOString(),
            project: config.projectName,
            targetAgent: config.agent,
            mode: config.mode,
            source: urlInput || 'Manual Input Text'
          },
          tasks: computeStatuses(sanitizedTasks)
        });
        
        if (compiledData.clarifications) {
            setClarifications(compiledData.clarifications);
        }

        if (sanitizedTasks.length > 0) {
          setSelectedTaskId(sanitizedTasks[0].id);
        }
      } else {
        throw new Error("Failed to parse Gemini response.");
      }

    } catch (error) {
      console.error("Compilation failed:", error);
      setCompileError("Failed to compile runbook. Please check your input or try again later.");
    } finally {
      setIsCompiling(false);
    }
  };

  const handleProvideEvidence = (taskId) => {
    setRunbook(prev => ({
      ...prev,
      tasks: prev.tasks.map(t => t.id === taskId ? { ...t, status: 'completed' } : t)
    }));
  };

  const activeTask = runbook?.tasks.find(t => t.id === selectedTaskId);
  
  const nextSafeAction = useMemo(() => {
    if (!runbook) return null;
    return runbook.tasks.find(t => t.status === 'ready' && t.priority === 'p0') ||
           runbook.tasks.find(t => t.status === 'ready');
  }, [runbook]);

  const downloadJSON = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(runbook, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href",     dataStr);
    downloadAnchorNode.setAttribute("download", "runbook.execution.json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const downloadMarkdownPack = () => {
    if(!runbook) return;
    let md = `# GitKB Task Pack: ${config.projectName}\n\n`;
    
    md += `## File: AGENTS.md\n\`\`\`markdown\n# Agent Execution Policy\nTarget Agent: ${config.agent}\n\n1. Do not invent execution evidence.\n2. Consult graph.db before mutating state.\n3. Request human approval for P0 tasks.\n\`\`\`\n\n`;

    runbook.tasks.forEach(t => {
      md += `## File: tasks/${t.slug}.md\n\`\`\`yaml\n---\nid: ${t.id}\ntitle: "${t.title}"\ntype: ${t.type}\ndepends_on: [${(t.depends_on||[]).join(', ')}]\nblocks: [${(t.blocks||[]).join(', ')}]\n---\n\`\`\`\n\n### Objective\n${t.objective}\n\n### Commands\n${(t.commands||[]).map(c => `> ${c}`).join('\n')}\n\n### Verification\n${t.verification}\n\n### Rollback\n${t.rollback}\n\n---\n`;
    });

    const dataStr = "data:text/markdown;charset=utf-8," + encodeURIComponent(md);
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "gitkb-task-pack.md");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };
  
  const generateAgentPrompt = async (agentType) => {
    if (!runbook) return;
    setGeneratingPrompt(true);

    try {
      const pendingTasks = runbook.tasks.filter(t => t.status !== 'completed');
      const apiKey = "";
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-preview:generateContent?key=${apiKey}`;

      const payload = {
        contents: [{
          role: "user",
          parts: [{ text: `Generate a specific, actionable prompt for an AI agent (${agentType}) to execute the next safe action in this runbook.

Agent Type: ${agentType}
Execution Mode: ${config.mode}
Target Repository: ${config.repoPath}

Next Safe Action Data:
${JSON.stringify(nextSafeAction, null, 2)}

Overall Pending Tasks Summary:
${JSON.stringify(pendingTasks.map(t => ({id: t.id, title: t.title, status: t.status})), null, 2)}

Output ONLY the text for the prompt. Make it clear, instruct the agent on the strict constraints (no blind execution, provide actual evidence, do not fake logs), and focus on executing ONLY the "Next Safe Action". Provide the proposed commands clearly.` }]
        }]
      };

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      const result = await response.json();
      
      if (result.candidates && result.candidates[0].content?.parts[0]?.text) {
        const promptText = result.candidates[0].content.parts[0].text;
        await navigator.clipboard.writeText(promptText);
        alert(`Successfully copied customized ${agentType} prompt to clipboard.`);
      }

    } catch(err) {
      console.error("Failed to generate prompt:", err);
      const fallbackPrompt = `You are an AI Agent (${agentType}). 
Please execute the following runbook in ${config.mode} mode.
Target Repo: ${config.repoPath}
Next Safe Action: ${nextSafeAction ? nextSafeAction.title : 'None'}

Constraints: Never invent evidence. Present commands for approval first. Execute the rollback if verification fails.
Tasks to process:
${JSON.stringify(runbook.tasks.filter(t => t.status !== 'completed').map(t => ({id: t.id, title: t.title, commands: t.commands})), null, 2)}`;
      
      navigator.clipboard.writeText(fallbackPrompt);
      alert("Fell back to static prompt (API error). Copied to clipboard.");
    } finally {
      setGeneratingPrompt(false);
    }
  };
  
  const copyCommands = (commands) => {
      const text = (commands || []).join('\n');
      navigator.clipboard.writeText(text);
      alert("Commands copied to clipboard.");
  }

  return (
    <div className="flex h-screen bg-slate-950 text-slate-300 font-sans overflow-hidden selection:bg-blue-500/30">
      
      {/* Left Panel: Config & Input */}
      <div className="w-80 bg-slate-900 border-r border-slate-800 flex flex-col z-10 shadow-xl shrink-0">
        <div className="p-4 border-b border-slate-800 flex items-center space-x-3 bg-slate-950/50">
          <TerminalSquare className="text-blue-500 w-6 h-6" />
          <h1 className="text-base font-bold text-white tracking-tight">GitKB Runbook Pilot</h1>
        </div>
        
        <div className="flex-1 overflow-y-auto p-5 space-y-6 scrollbar-thin scrollbar-thumb-slate-700">
          <div className="space-y-3">
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest">Input Source</label>
            <input 
              type="text" 
              placeholder="URL (e.g. https://gitkb.com/docs/)"
              className="w-full bg-slate-950 border border-slate-700 rounded p-2.5 text-sm text-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
            />
            <div className="flex items-center text-xs text-slate-600 font-medium my-2">
                <div className="flex-1 border-t border-slate-700/50"></div>
                <span className="px-2">OR PASTE CONTENT</span>
                <div className="flex-1 border-t border-slate-700/50"></div>
            </div>
            <textarea 
              rows={8}
              placeholder="Paste tech report or documentation..."
              className="w-full bg-slate-950 border border-slate-700 rounded p-2.5 text-sm text-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors resize-y min-h-[120px]"
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
            />
          </div>

          <div className="space-y-4 pt-4 border-t border-slate-800/50">
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest">Execution Context</label>
            
            <div className="space-y-3">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1.5 font-medium">Project Name</label>
                <input 
                  type="text" 
                  className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-sm text-slate-200"
                  value={config.projectName}
                  onChange={(e) => setConfig({...config, projectName: e.target.value})}
                />
              </div>
              
              <div>
                <label className="block text-[11px] text-slate-400 mb-1.5 font-medium">Target Agent</label>
                <input 
                  type="text" 
                  className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-sm text-slate-200"
                  value={config.agent}
                  onChange={(e) => setConfig({...config, agent: e.target.value})}
                />
              </div>

              <div>
                <label className="block text-[11px] text-slate-400 mb-2 font-medium">Execution Mode</label>
                <div className="space-y-2">
                  {EXECUTION_MODES.map(mode => (
                    <label key={mode.id} className={`flex items-start p-2.5 rounded border cursor-pointer transition-colors ${config.mode === mode.id ? 'border-blue-500/50 bg-blue-900/10' : 'border-slate-800/80 hover:border-slate-600 bg-slate-950/30'}`}>
                      <input 
                        type="radio" 
                        name="mode" 
                        className="mt-0.5 mr-2.5 accent-blue-500"
                        checked={config.mode === mode.id}
                        onChange={() => setConfig({...config, mode: mode.id})}
                      />
                      <div>
                        <div className="text-sm font-semibold text-slate-200">{mode.name}</div>
                        <div className="text-[11px] text-slate-500 leading-tight mt-1">{mode.description}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-slate-800 bg-slate-950 flex flex-col space-y-3 shrink-0">
           {compileError && (
             <div className="text-xs text-rose-400 bg-rose-950/30 p-2.5 rounded border border-rose-900/50 flex items-start">
               <AlertTriangle className="w-4 h-4 mr-2 shrink-0 mt-0.5" />
               <span>{compileError}</span>
             </div>
           )}
          <button 
            onClick={handleCompile}
            disabled={isCompiling || (!urlInput && !textInput)}
            className="w-full flex items-center justify-center space-x-2 bg-blue-600 hover:bg-blue-500 text-white p-3 rounded-md font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-blue-900/20"
          >
            {isCompiling ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Play className="w-4 h-4" />
            )}
            <span>{isCompiling ? 'Compiling Runbook...' : 'Compile Runbook'}</span>
          </button>
        </div>
      </div>

      {}
      <div className="flex-1 flex flex-col min-w-0 bg-[#0B1120]">
        
        <header className="h-14 border-b border-slate-800/80 flex items-center justify-between px-6 bg-slate-900/50 shrink-0 backdrop-blur-sm z-10">
          <div className="flex space-x-8 h-full">
            <button onClick={() => setActiveTab('graph')} className={`text-sm font-semibold h-full px-1 border-b-2 transition-all ${activeTab === 'graph' ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-400 hover:text-slate-200'}`}>Task Graph</button>
            <button onClick={() => setActiveTab('list')} className={`text-sm font-semibold h-full px-1 border-b-2 transition-all ${activeTab === 'list' ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-400 hover:text-slate-200'}`}>List View</button>
            <button onClick={() => setActiveTab('preflight')} className={`text-sm font-semibold h-full px-1 border-b-2 transition-all ${activeTab === 'preflight' ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-400 hover:text-slate-200'}`}>Preflight & Safety</button>
          </div>
          
          {runbook && (
            <div className="flex items-center space-x-4 text-xs font-medium">
              <span className="flex items-center space-x-1.5 text-emerald-400 bg-emerald-400/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{runbook.tasks.length} Tasks Compiled</span>
              </span>
              <span className="text-slate-500 flex items-center bg-slate-800/50 px-2.5 py-1 rounded-full border border-slate-700/50">
                <Settings className="w-3.5 h-3.5 mr-1.5"/> {config.mode}
              </span>
            </div>
          )}
        </header>

        {runbook ? (
          <div className="flex-1 flex overflow-hidden min-h-0 relative">
            
            {}
            <div className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-slate-700">
              
              {clarifications.length > 0 && activeTab !== 'preflight' && (
                  <div className="max-w-4xl mx-auto mb-6 bg-amber-950/20 border border-amber-900/50 rounded-lg p-4">
                      <h3 className="text-sm font-bold text-amber-500 flex items-center mb-2">
                          <AlertTriangle className="w-4 h-4 mr-2" /> Unknowns / Clarifications Required
                      </h3>
                      <ul className="list-disc pl-5 text-xs text-amber-200/80 space-y-1">
                          {clarifications.map((clar, i) => <li key={i}>{clar}</li>)}
                      </ul>
                  </div>
              )}

              {activeTab === 'preflight' && (
                <div className="max-w-3xl mx-auto space-y-8 mt-6">
                  
                  <div>
                    <h2 className="text-lg font-bold text-white flex items-center space-x-2 mb-4">
                      <ShieldCheck className="w-5 h-5 text-blue-400" />
                      <span>Execution Constraints Enforced</span>
                    </h2>
                    <div className="bg-slate-900 border border-slate-800 rounded-lg p-6 space-y-4 shadow-sm">
                      <p className="text-sm text-slate-400 leading-relaxed">The Runbook Compiler has extracted facts and separated them from generated recommendations. Before executing this runbook, the following constraints are active:</p>
                      <ul className="space-y-4 text-sm text-slate-300">
                        <li className="flex items-start space-x-3 bg-slate-950/50 p-3 rounded border border-slate-800/50"><CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" /><div><strong className="text-white block mb-0.5">No blind execution.</strong> All generated shell commands are presented as dry-runs initially.</div></li>
                        <li className="flex items-start space-x-3 bg-slate-950/50 p-3 rounded border border-slate-800/50"><CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" /><div><strong className="text-white block mb-0.5">Strict Dependency Gates.</strong> Agents cannot execute tasks whose `depends_on` parents are not explicitly verified.</div></li>
                        <li className="flex items-start space-x-3 bg-slate-950/50 p-3 rounded border border-slate-800/50"><CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" /><div><strong className="text-white block mb-0.5">Evidence Required.</strong> Tasks remain in 'ready' state until verifiable output is logged by the user or agent.</div></li>
                      </ul>
                    </div>
                  </div>

                  {clarifications.length > 0 && (
                      <div>
                        <h2 className="text-lg font-bold text-white flex items-center space-x-2 mb-4">
                          <AlertTriangle className="w-5 h-5 text-amber-500" />
                          <span>Input Ambiguities (Action Required)</span>
                        </h2>
                        <div className="bg-amber-950/20 border border-amber-900/50 rounded-lg p-6">
                           <ul className="list-disc pl-5 text-sm text-amber-200/90 space-y-2">
                              {clarifications.map((clar, i) => <li key={i}>{clar}</li>)}
                          </ul>
                        </div>
                      </div>
                  )}

                </div>
              )}

              {activeTab === 'list' && (
                <div className="max-w-4xl mx-auto space-y-3 pb-20">
                  {runbook.tasks.map(task => (
                    <div 
                      key={task.id} 
                      onClick={() => setSelectedTaskId(task.id)}
                      className={`p-4 rounded-lg border cursor-pointer transition-all ${selectedTaskId === task.id ? 'bg-blue-900/10 border-blue-500/50 shadow-md' : 'bg-slate-900/80 border-slate-800 hover:border-slate-600 hover:bg-slate-900'}`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1 pr-6">
                          <div className="flex items-center space-x-2.5 mb-1.5">
                            <span className="font-mono text-[10px] text-slate-400 bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800">{task.id}</span>
                            <h3 className="font-semibold text-slate-200">{task.title}</h3>
                          </div>
                          <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">{task.objective}</p>
                        </div>
                        <div className="flex flex-col items-end space-y-2 shrink-0">
                          {task.status === 'completed' && <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-400 flex items-center bg-emerald-950/30 px-2 py-1 rounded border border-emerald-900/50"><CheckCircle2 className="w-3 h-3 mr-1.5"/> Done</span>}
                          {task.status === 'ready' && <span className="text-[10px] uppercase font-bold tracking-wider text-blue-400 flex items-center bg-blue-950/30 px-2 py-1 rounded border border-blue-900/50"><Play className="w-3 h-3 mr-1.5"/> Ready</span>}
                          {task.status === 'blocked' && <span className="text-[10px] uppercase font-bold tracking-wider text-rose-400 flex items-center bg-rose-950/30 px-2 py-1 rounded border border-rose-900/50"><Lock className="w-3 h-3 mr-1.5"/> Blocked</span>}
                          {task.status === 'pending' && <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 flex items-center bg-slate-800/50 px-2 py-1 rounded border border-slate-700"><Clock className="w-3 h-3 mr-1.5"/> Pending</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {activeTab === 'graph' && (
                <div className="flex h-full w-full items-start justify-start p-2 pb-24">
                  <div className="flex flex-col space-y-4 w-full">
                    {/* Simulated Graph layout */}
                    <div className="bg-slate-900/30 rounded-xl p-8 border border-slate-800/50 w-full overflow-x-auto min-h-[60vh] flex flex-col space-y-12 relative">
                      <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 sticky left-0 flex items-center">
                        <GitMerge className="w-4 h-4 mr-2" /> Task Dependency Flow
                      </div>
                      
                      {/* Tier 0 (No dependencies) */}
                      <div className="flex flex-nowrap space-x-8 z-10 w-max pb-2 items-center">
                        <div className="text-xs font-mono text-slate-600 w-16 text-right shrink-0">L0 //</div>
                        {runbook.tasks.filter(t => !t.depends_on || t.depends_on.length === 0).map(task => (
                           <TaskNode key={task.id} task={task} isSelected={selectedTaskId === task.id} onClick={() => setSelectedTaskId(task.id)} />
                        ))}
                      </div>

                      {/* Tier 1 (Depends on Tier 0) */}
                      <div className="flex flex-nowrap space-x-8 pl-12 relative z-10 w-max pb-2 items-center">
                        <div className="text-xs font-mono text-slate-600 w-16 text-right shrink-0">L1 //</div>
                         {runbook.tasks.filter(t => (t.depends_on || []).some(dep => runbook.tasks.find(t0 => !t0.depends_on || t0.depends_on.length === 0)?.id === dep)).map(task => (
                           <TaskNode key={task.id} task={task} isSelected={selectedTaskId === task.id} onClick={() => setSelectedTaskId(task.id)} />
                        ))}
                      </div>

                      {/* Tier 2 (Depends on Tier 1) */}
                      <div className="flex flex-nowrap space-x-8 pl-24 relative z-10 w-max pb-2 items-center">
                        <div className="text-xs font-mono text-slate-600 w-16 text-right shrink-0">L2 //</div>
                         {runbook.tasks.filter(t => 
                           !(t.depends_on || []).some(dep => runbook.tasks.find(t0 => !t0.depends_on || t0.depends_on.length === 0)?.id === dep) &&
                           (t.depends_on || []).length > 0
                         ).map(task => (
                           <TaskNode key={task.id} task={task} isSelected={selectedTaskId === task.id} onClick={() => setSelectedTaskId(task.id)} />
                        ))}
                      </div>

                    </div>
                  </div>
                </div>
              )}

            </div>

            {}
            <div className="w-[420px] border-l border-slate-800/80 bg-slate-900 flex flex-col z-20 shadow-[-10px_0_20px_-5px_rgba(0,0,0,0.2)] shrink-0 overflow-y-auto">
              {activeTask ? (
                <>
                  <div className="p-6 border-b border-slate-800 bg-slate-950/50 shrink-0 sticky top-0 z-30 backdrop-blur-md">
                    <div className="flex items-center justify-between mb-3">
                      <span className="font-mono text-xs bg-slate-800 border border-slate-700 text-slate-300 px-2 py-0.5 rounded shadow-sm">{activeTask.id}</span>
                      <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded border ${
                        activeTask.status === 'completed' ? 'text-emerald-400 bg-emerald-950/30 border-emerald-900/50' :
                        activeTask.status === 'ready' ? 'text-blue-400 bg-blue-950/30 border-blue-900/50' :
                        activeTask.status === 'blocked' ? 'text-rose-400 bg-rose-950/30 border-rose-900/50' : 'text-slate-400 bg-slate-800 border-slate-700'
                      }`}>
                        {activeTask.status}
                      </span>
                    </div>
                    <h2 className="text-lg font-bold text-white mb-2.5 leading-snug">{activeTask.title}</h2>
                    <p className="text-sm text-slate-400 leading-relaxed">{activeTask.objective}</p>
                    
                    <div className="flex flex-wrap gap-2 mt-4">
                      <span className="text-[10px] uppercase font-bold tracking-wider text-slate-300 bg-slate-800 border border-slate-700 px-2 py-1 rounded">
                        TYPE: {activeTask.type}
                      </span>
                      {(activeTask.tags || []).map(tag => (
                        <span key={tag} className="text-[10px] uppercase font-bold tracking-wider text-slate-400 bg-slate-900 border border-slate-800 px-2 py-1 rounded">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="flex-1 p-6 space-y-8 pb-24">
                    
                    {/* Execution / Commands */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="text-xs font-bold text-slate-400 uppercase flex items-center tracking-widest">
                            <TerminalSquare className="w-4 h-4 mr-2" /> Proposed Commands
                        </h3>
                        {activeTask.commands?.length > 0 && (
                            <button onClick={()=>copyCommands(activeTask.commands)} className="text-slate-500 hover:text-slate-300 transition-colors" title="Copy Shell Commands">
                                <Copy className="w-4 h-4" />
                            </button>
                        )}
                      </div>
                      
                      <div className="bg-[#050505] border border-slate-800 rounded p-4 text-[13px] font-mono text-emerald-400/90 overflow-x-auto shadow-inner leading-relaxed">
                        {(activeTask.commands || []).map((cmd, i) => (
                          <div key={i} className="whitespace-pre">❯ {cmd}</div>
                        ))}
                        {(!activeTask.commands || activeTask.commands.length === 0) && (
                            <span className="text-slate-600">No shell commands proposed.</span>
                        )}
                      </div>
                      
                      {config.mode === 'local' && activeTask.status === 'ready' && (
                        <div className="mt-3 p-3 bg-amber-500/10 border border-amber-500/20 rounded-md text-xs text-amber-200 flex items-start">
                          <AlertTriangle className="w-4 h-4 inline mr-2 shrink-0 mt-0.5" />
                          <div>
                            Requires Local Runner Adapter. Expected API contract:<br/>
                            <code className="text-amber-400/80 mt-1.5 inline-block font-mono bg-black/30 p-1 px-1.5 rounded border border-amber-900/50">POST /api/v1/gitkb/execute</code>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Metadata Graph links */}
                    <div className="grid grid-cols-2 gap-4 bg-slate-950 p-4 rounded-lg border border-slate-800/80">
                      <div className="space-y-2">
                        <span className="block text-[10px] text-slate-500 uppercase font-bold tracking-wider">Depends On</span>
                        {(activeTask.depends_on || []).length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {activeTask.depends_on.map(dep => <span key={dep} className="text-xs bg-slate-800 border border-slate-700 px-2 py-1 rounded font-mono text-slate-300 cursor-pointer hover:bg-slate-700 transition-colors shadow-sm" onClick={()=>setSelectedTaskId(dep)}>{dep}</span>)}
                          </div>
                        ) : <span className="text-xs text-slate-600 font-mono italic">None</span>}
                      </div>
                      <div className="space-y-2">
                        <span className="block text-[10px] text-slate-500 uppercase font-bold tracking-wider">Blocks</span>
                        {(activeTask.blocks || []).length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {activeTask.blocks.map(blk => <span key={blk} className="text-xs bg-slate-800 border border-slate-700 px-2 py-1 rounded font-mono text-slate-300 cursor-pointer hover:bg-slate-700 transition-colors shadow-sm" onClick={()=>setSelectedTaskId(blk)}>{blk}</span>)}
                          </div>
                        ) : <span className="text-xs text-slate-600 font-mono italic">None</span>}
                      </div>
                    </div>

                    {/* Verification & Evidence */}
                    <div className="space-y-4 pt-2">
                      <h3 className="text-xs font-bold text-slate-400 uppercase border-b border-slate-800/80 pb-2 tracking-widest flex items-center">
                          <ShieldCheck className="w-4 h-4 mr-2" /> Verification Gate
                      </h3>
                      
                      <p className="text-[13px] text-slate-300 bg-blue-950/20 p-3 rounded-md border-l-2 border-blue-500 leading-relaxed">
                          {activeTask.verification}
                      </p>
                      
                      <div className="bg-slate-950 p-4 rounded-md border border-slate-800/80">
                        <div className="text-[11px] text-slate-500 mb-2 font-bold uppercase tracking-wider">Evidence Required:</div>
                        <ul className="text-[13px] text-slate-300 space-y-2 pl-4 list-disc marker:text-slate-600">
                          {(activeTask.evidence_required || []).map((ev, i) => <li key={i} className="pl-1 leading-snug">{ev}</li>)}
                          {(!activeTask.evidence_required || activeTask.evidence_required.length === 0) && (
                              <li className="text-slate-500 italic list-none -ml-4">No specific evidence defined.</li>
                          )}
                        </ul>
                      </div>

                      {activeTask.status !== 'completed' && activeTask.status !== 'blocked' && (
                        <button 
                          onClick={() => handleProvideEvidence(activeTask.id)}
                          className="w-full mt-2 flex justify-center items-center space-x-2 bg-emerald-600/10 text-emerald-400 hover:bg-emerald-600/20 border border-emerald-600/40 p-3 rounded-md shadow-sm text-sm font-semibold transition-all hover:scale-[1.01]"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Check Evidence & Mark Complete</span>
                        </button>
                      )}
                    </div>

                    {/* Rollback */}
                    <div className="space-y-3 pt-4 border-t border-slate-800/80">
                      <h3 className="text-xs font-bold text-rose-400/80 uppercase tracking-widest flex items-center">
                         <RefreshCw className="w-4 h-4 mr-2" /> Rollback Plan
                      </h3>
                      <div className="bg-rose-950/10 border border-rose-900/30 rounded-md p-4 text-[13px] font-mono text-rose-300/80 shadow-inner whitespace-pre-wrap leading-relaxed">
                        {activeTask.rollback || 'No rollback defined.'}
                      </div>
                    </div>

                  </div>
                </>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-slate-500 p-8 text-center space-y-4">
                  <Activity className="w-12 h-12 text-slate-700/50" />
                  <p className="text-sm font-medium">Select a task from the graph or list to view execution steps.</p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-12 bg-[#0B1120] relative overflow-hidden">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-blue-900/10 via-[#0B1120] to-[#0B1120] pointer-events-none"></div>
            
            <div className="max-w-md text-center space-y-6 relative z-10">
              <div className="w-24 h-24 bg-slate-900 border border-slate-800 rounded-full flex items-center justify-center mx-auto mb-6 shadow-2xl relative">
                <div className="absolute inset-0 rounded-full border border-blue-500/20 animate-ping"></div>
                <FolderGit2 className="w-12 h-12 text-blue-500 relative z-10" />
              </div>
              <h2 className="text-2xl font-bold text-white tracking-tight">AI-Powered Execution Cockpit</h2>
              <p className="text-slate-400 leading-relaxed text-sm">
                Paste documentation or enter a URL on the left. The Gemini compiler will analyze it and generate a structured, dependency-aware runbook ready for agent execution, separating facts from recommendations.
              </p>
              <div className="grid grid-cols-2 gap-4 text-sm text-left pt-6">
                <div className="bg-slate-900/80 p-5 rounded-xl border border-slate-800/80 shadow-lg">
                  <div className="font-bold text-slate-200 mb-2 flex items-center"><ShieldCheck className="w-4 h-4 mr-2 text-emerald-500"/> Verify First</div>
                  <div className="text-slate-400 text-xs leading-relaxed">Never invent evidence. Strict dependency gates enforced.</div>
                </div>
                <div className="bg-slate-900/80 p-5 rounded-xl border border-slate-800/80 shadow-lg">
                  <div className="font-bold text-slate-200 mb-2 flex items-center"><GitMerge className="w-4 h-4 mr-2 text-blue-500"/> Graph Aware</div>
                  <div className="text-slate-400 text-xs leading-relaxed">Maintains deep dependency linkages between tasks and docs.</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {}
        {runbook && (
          <footer className="h-16 border-t border-slate-800 bg-slate-950 flex items-center justify-between px-6 shrink-0 absolute bottom-0 left-0 right-0 z-30 shadow-[0_-10px_20px_-5px_rgba(0,0,0,0.3)]">
            <div className="flex items-center space-x-4">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mr-2">Export Package:</span>
              <button onClick={downloadJSON} className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded text-xs font-semibold transition-colors border border-slate-700 shadow-sm">
                <Download className="w-3.5 h-3.5" />
                <span>JSON</span>
              </button>
              <button onClick={downloadMarkdownPack} className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded text-xs font-semibold transition-colors border border-slate-700 shadow-sm">
                <FileText className="w-3.5 h-3.5" />
                <span>Task Pack (MD)</span>
              </button>
            </div>
            
            <div className="flex items-center space-x-4">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mr-2">Generate Agent Prompts:</span>
              <button 
                onClick={() => generateAgentPrompt('Codex')} 
                disabled={generatingPrompt}
                className="flex items-center space-x-1.5 px-3 py-1.5 bg-blue-900/20 hover:bg-blue-900/40 text-blue-400 rounded text-xs font-semibold transition-colors border border-blue-900/40 disabled:opacity-50"
              >
                {generatingPrompt ? <RefreshCw className="w-3.5 h-3.5 animate-spin"/> : <MessageSquare className="w-3.5 h-3.5" />}
                <span>Codex Prompt</span>
              </button>
              <button 
                onClick={() => generateAgentPrompt('Gemini')}
                disabled={generatingPrompt} 
                className="flex items-center space-x-1.5 px-3 py-1.5 bg-purple-900/20 hover:bg-purple-900/40 text-purple-400 rounded text-xs font-semibold transition-colors border border-purple-900/40 disabled:opacity-50"
              >
                {generatingPrompt ? <RefreshCw className="w-3.5 h-3.5 animate-spin"/> : <MessageSquare className="w-3.5 h-3.5" />}
                <span>Gemini Prompt</span>
              </button>
            </div>
          </footer>
        )}
      </div>
    </div>
  );
}

function TaskNode({ task, isSelected, onClick }) {
  const getStatusConfig = (status) => {
    switch (status) {
      case 'completed': return { border: 'border-emerald-500/50', bg: 'bg-emerald-950/40', icon: <CheckCircle2 className="w-4 h-4 text-emerald-400" /> };
      case 'ready': return { border: 'border-blue-500/60', bg: 'bg-blue-950/40', icon: <Play className="w-4 h-4 text-blue-400" /> };
      case 'blocked': return { border: 'border-rose-500/30', bg: 'bg-rose-950/20', icon: <Lock className="w-4 h-4 text-rose-500/70" /> };
      default: return { border: 'border-slate-700/50', bg: 'bg-slate-900/80', icon: <Clock className="w-4 h-4 text-slate-500" /> };
    }
  };

  const sc = getStatusConfig(task.status);
  
  return (
    <div 
      onClick={onClick}
      className={`w-72 rounded-xl border p-5 cursor-pointer transition-all duration-200 shrink-0 ${sc.border} ${sc.bg} ${isSelected ? 'ring-2 ring-white/20 shadow-xl scale-[1.02] bg-slate-800' : 'hover:border-slate-500 hover:shadow-lg'}`}
    >
      <div className="flex justify-between items-start mb-4">
        <span className="text-[10px] font-mono font-bold text-slate-300 bg-black/60 px-2 py-1 rounded-sm border border-slate-700/50 shadow-sm">{task.id}</span>
        <div className="bg-black/40 p-1.5 rounded-md border border-white/5">{sc.icon}</div>
      </div>
      <div className="text-sm font-bold text-slate-200 leading-snug mb-2.5 pr-2">{task.title}</div>
      <div className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed">{task.objective}</div>
    </div>
  );
}