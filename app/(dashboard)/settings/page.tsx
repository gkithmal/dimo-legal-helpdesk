'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { ROUTES } from '@/lib/routes';
import {
  Users, FileText, Plus, Pencil, Minus, ChevronDown,
  CheckCircle2, X, Settings as SettingsIcon, Check,
  Loader2, AlertCircle, Save,
} from 'lucide-react';

type Role = 'Legal GM'|'Legal Officer'|'Special Approver'|'Approver - BUM'|'Approver - FBP'|'Approver - Cluster Head'|'Initiator'|'';
type StaffMember = { id:string; name:string; email:string; role:Role; forms:number[]; };
type DirectoryUser = { id:string; name:string; email:string; role:string; };
type RequiredDoc = { id:string; label:string; type:string; };
type FormConfig = { formId:number; formName:string; docs:RequiredDoc[]; instructions:string; };

const ROLES: Role[] = ['Legal GM','Legal Officer','Special Approver','Approver - BUM','Approver - FBP','Approver - Cluster Head','Initiator'];
const DOC_TYPES = ['Company','Partnership','Sole-proprietorship','Individual','Common'];
const ALL_FORMS = [
  {id:1,name:'Contract Review Form'},{id:2,name:'Lease Agreement'},
  {id:3,name:'Instruction For Litigation'},{id:4,name:'Vehicle Rent Agreement'},
  {id:5,name:'Request for Power of Attorney'},{id:6,name:'Registration of a Trademark'},
  {id:7,name:'Termination of agreements/lease agreements'},{id:8,name:'Handing over of the leased premises'},
  {id:9,name:'Approval for Purchasing of a Premises'},{id:10,name:'Instruction to Issue Letter of Demand'},
];

function getInitials(name:string){return name.split(' ').map((n)=>n[0]).join('').toUpperCase().slice(0,2);}
function SectionHeader({children}:{children:React.ReactNode}){
  return(<div className="px-4 py-2.5 rounded-xl mb-3" style={{background:'linear-gradient(135deg, #1A438A, #1e5aad)'}}><span className="text-white font-bold text-sm">{children}</span></div>);
}
function ErrorBanner({message}:{message:string}){
  return(<div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm mb-3"><AlertCircle className="w-4 h-4 flex-shrink-0"/>{message}</div>);
}
function SavedModal({message,onClose}:{message?:string;onClose:()=>void}){
  return(<div className="fixed inset-0 z-50 flex items-center justify-center p-4"><div className="absolute inset-0 bg-black/40 backdrop-blur-sm"/><div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-8 flex flex-col items-center text-center"><div className="w-20 h-20 rounded-2xl bg-emerald-100 flex items-center justify-center mb-5"><CheckCircle2 className="w-10 h-10 text-emerald-500"/></div><h2 className="text-[#17293E] text-lg font-bold mb-1">Changes have been saved</h2>{message&&<p className="text-slate-500 text-xs mb-4">{message}</p>}<button onClick={onClose} className="w-full py-3 rounded-xl font-bold text-white mt-2" style={{background:'linear-gradient(135deg, #1A438A, #1e5aad)'}}>OK</button></div></div>);
}
function RemovedModal({onClose}:{onClose:()=>void}){
  return(<div className="fixed inset-0 z-50 flex items-center justify-center p-4"><div className="absolute inset-0 bg-black/40 backdrop-blur-sm"/><div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-8 flex flex-col items-center text-center"><div className="w-20 h-20 rounded-2xl bg-red-100 flex items-center justify-center mb-5"><X className="w-10 h-10 text-red-500"/></div><h2 className="text-[#17293E] text-lg font-bold mb-1">Item has been Removed!</h2><p className="text-slate-500 text-xs mb-4">Once you do all the changes, click on save changes</p><button onClick={onClose} className="w-full py-3 rounded-xl font-bold text-white" style={{background:'linear-gradient(135deg, #1A438A, #1e5aad)'}}>OK</button></div></div>);
}
function ConfirmRemoveModal({onConfirm,onClose}:{onConfirm:()=>void;onClose:()=>void}){
  return(<div className="fixed inset-0 z-50 flex items-center justify-center p-4"><div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose}/><div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-8 flex flex-col items-center text-center"><h2 className="text-[#17293E] text-base font-bold mb-8">Do you want to remove the document line?</h2><div className="flex gap-3 w-full"><button onClick={onClose} className="flex-1 py-3 rounded-xl font-bold text-sm text-white" style={{background:'linear-gradient(135deg, #1A438A, #1e5aad)'}}>Cancel</button><button onClick={onConfirm} className="flex-1 py-3 rounded-xl font-bold text-sm text-white bg-red-500 hover:bg-red-600">Yes, Remove</button></div></div></div>);
}
function AddDocModal({onAdd,onClose}:{onAdd:(label:string,type:string)=>void;onClose:()=>void}){
  const [label,setLabel]=useState('');const [type,setType]=useState('Common');
  return(<div className="fixed inset-0 z-50 flex items-center justify-center p-4"><div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose}/><div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-8"><h2 className="text-[#17293E] font-bold text-base mb-6">Enter the Document Name</h2><textarea value={label} onChange={(e)=>setLabel(e.target.value)} rows={3} className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 text-sm focus:outline-none focus:border-[#1A438A] resize-none mb-5" placeholder="e.g. Partnership registration certificate"/><div className="mb-2"><label className="block text-sm font-semibold text-slate-600 mb-2">Select the Type</label><div className="relative"><select value={type} onChange={(e)=>setType(e.target.value)} className="w-full px-4 py-2.5 rounded-xl border-2 border-slate-200 text-sm focus:outline-none appearance-none bg-white">{DOC_TYPES.map((t)=><option key={t}>{t}</option>)}</select><ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none"/></div></div><p className="text-[11px] text-slate-400 mb-6">Once done, click save changes</p><div className="flex gap-3"><button onClick={onClose} className="flex-1 py-3 rounded-xl font-bold text-sm border-2 border-slate-200 text-slate-600">Cancel</button><button disabled={!label.trim()} onClick={()=>{onAdd(label.trim(),type);onClose();}} className="flex-1 py-3 rounded-xl font-bold text-sm text-white disabled:opacity-40" style={{background:'linear-gradient(135deg, #1A438A, #1e5aad)'}}>OK</button></div></div></div>);
}
function EditDocModal({doc,onSave,onClose}:{doc:RequiredDoc;onSave:(label:string,type:string)=>void;onClose:()=>void}){
  const [label,setLabel]=useState(doc.label);const [type,setType]=useState(doc.type);
  return(<div className="fixed inset-0 z-50 flex items-center justify-center p-4"><div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose}/><div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-8"><h2 className="text-[#17293E] font-bold text-base mb-6">Edit Document</h2><textarea value={label} onChange={(e)=>setLabel(e.target.value)} rows={3} className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 text-sm focus:outline-none focus:border-[#1A438A] resize-none mb-5"/><div className="mb-6"><label className="block text-sm font-semibold text-slate-600 mb-2">Type</label><div className="relative"><select value={type} onChange={(e)=>setType(e.target.value)} className="w-full px-4 py-2.5 rounded-xl border-2 border-slate-200 text-sm focus:outline-none appearance-none bg-white">{DOC_TYPES.map((t)=><option key={t}>{t}</option>)}</select><ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none"/></div></div><div className="flex gap-3"><button onClick={onClose} className="flex-1 py-3 rounded-xl font-bold text-sm border-2 border-slate-200 text-slate-600">Cancel</button><button disabled={!label.trim()} onClick={()=>{onSave(label.trim(),type);onClose();}} className="flex-1 py-3 rounded-xl font-bold text-sm text-white disabled:opacity-40" style={{background:'linear-gradient(135deg, #AC9C2F, #c9b535)'}}>Save</button></div></div></div>);
}
function EditInstructionsModal({initial,onSave,onClose}:{initial:string;onSave:(v:string)=>void;onClose:()=>void}){
  const [value,setValue]=useState(initial);
  return(<div className="fixed inset-0 z-50 flex items-center justify-center p-4"><div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose}/><div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl p-8 flex flex-col" style={{maxHeight:'80vh'}}><h2 className="text-[#17293E] font-bold text-base mb-4">Instructions to the Initiator</h2><div className="flex-1 overflow-y-auto mb-6"><textarea value={value} onChange={(e)=>setValue(e.target.value)} rows={16} className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 text-sm focus:outline-none focus:border-[#1A438A] resize-none leading-relaxed"/></div><div className="flex gap-3"><button onClick={onClose} className="flex-1 py-3 rounded-xl font-bold text-sm border-2 border-slate-200 text-slate-600">Cancel</button><button onClick={()=>{onSave(value);onClose();}} className="flex-1 py-3 rounded-xl font-bold text-sm text-white" style={{background:'linear-gradient(135deg, #AC9C2F, #c9b535)'}}>Save</button></div></div></div>);
}

function LegalStaffTab() {
  const router=useRouter();
  const [staff,setStaff]=useState<StaffMember[]>([]);
  const [directory,setDirectory]=useState<DirectoryUser[]>([]);
  const [loadingStaff,setLoadingStaff]=useState(true);
  const [apiError,setApiError]=useState('');
  const [saving,setSaving]=useState(false);
  const [selectedId,setSelectedId]=useState<string|null>(null);
  const [showDirDropdown,setShowDirDropdown]=useState(false);
  const [showSaved,setShowSaved]=useState(false);
  const [savedUser,setSavedUser]=useState('');
  const [editing,setEditing]=useState(false);
  const [editRole,setEditRole]=useState<Role>('');
  const [editForms,setEditForms]=useState<number[]>([]);
  const loadUsers=useCallback(async()=>{
    setLoadingStaff(true);setApiError('');
    try{
      const res=await fetch('/api/users');const data=await res.json();
      if(!res.ok||!data.success)throw new Error(data.error||'Failed to load users');
      const mapped:StaffMember[]=data.data.map((u:{id:string;name:string;email:string;role:string;formIds?:number[]})=>({id:u.id,name:u.name,email:u.email,role:(u.role as Role)||'',forms:u.formIds||[]}));
      setStaff(mapped);
      if(mapped.length>0)setSelectedId((prev)=>prev||mapped[0].id);
      setDirectory(data.data.map((u:{id:string;name:string;email:string;role:string})=>({id:u.id,name:u.name,email:u.email,role:u.role})));
    }catch(err:unknown){setApiError(err instanceof Error?err.message:'Failed to load users');}
    finally{setLoadingStaff(false);}
  },[]);
  useEffect(()=>{loadUsers();},[]);// eslint-disable-line react-hooks/exhaustive-deps
  const selected=staff.find((s)=>s.id===selectedId)||null;
  const selectMember=(s:StaffMember)=>{setSelectedId(s.id);setEditing(false);setEditRole(s.role);setEditForms(s.forms);};
  const addFromDirectory=(dir:DirectoryUser)=>{
    const existing=staff.find((s)=>s.id===dir.id);
    if(existing){selectMember(existing);setShowDirDropdown(false);return;}
    const nm:StaffMember={id:dir.id,name:dir.name,email:dir.email,role:'',forms:[]};
    setStaff((prev)=>[...prev,nm]);setSelectedId(nm.id);setEditRole('');setEditForms([]);setEditing(true);setShowDirDropdown(false);
  };
  const saveChanges=async()=>{
    if(!selectedId||!selected)return;setSaving(true);setApiError('');
    try{
      const res=await fetch(`/api/users/${selectedId}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({role:editRole})});
      const data=await res.json();
      if(!res.ok||!data.success)throw new Error(data.error||'Save failed');
      setStaff((prev)=>prev.map((s)=>s.id===selectedId?{...s,role:editRole,forms:editForms}:s));
      setEditing(false);setSavedUser(selected.name);setShowSaved(true);
    }catch(err:unknown){setApiError(err instanceof Error?err.message:'Save failed');}
    finally{setSaving(false);}
  };
  const toggleForm=(id:number)=>setEditForms((prev)=>prev.includes(id)?prev.filter((f)=>f!==id):[...prev,id]);
  const displayRole=editing?editRole:selected?.role||'';
  const displayForms=editing?editForms:selected?.forms||[];
  const availableToAdd=directory.filter((d)=>!staff.find((s)=>s.id===d.id));
  return(
    <div className="flex gap-5 flex-1 min-h-0">
      <div className="w-[320px] flex-shrink-0 flex flex-col gap-3">
        <SectionHeader>Staff Member Settings</SectionHeader>
        {apiError&&<ErrorBanner message={apiError}/>}
        <div className="flex items-center gap-2 mb-1">
          <div className="relative flex-1">
            <select className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white appearance-none focus:outline-none focus:border-[#1A438A] disabled:opacity-50" value={selectedId||''} disabled={loadingStaff} onChange={(e)=>{const s=staff.find((x)=>x.id===e.target.value);if(s)selectMember(s);}}>
              {staff.map((s)=><option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none"/>
          </div>
          <div className="relative">
            <button onClick={()=>setShowDirDropdown(!showDirDropdown)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-bold text-white whitespace-nowrap" style={{background:'linear-gradient(135deg, #AC9C2F, #c9b535)'}}>
              <Plus className="w-3.5 h-3.5"/> Add member
            </button>
            {showDirDropdown&&(
              <div className="absolute top-full mt-1 right-0 w-60 bg-white rounded-xl border border-slate-200 shadow-xl z-30 overflow-hidden">
                <div className="px-3 py-2 border-b border-slate-100"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Select from directory</p></div>
                <div className="max-h-52 overflow-y-auto">
                  {availableToAdd.length===0
                    ?<p className="text-xs text-slate-400 px-3 py-3 text-center">All users already added</p>
                    :availableToAdd.map((d)=>(
                      <button key={d.id} onClick={()=>addFromDirectory(d)} className="w-full text-left px-3 py-2.5 text-sm text-slate-700 hover:bg-[#EEF3F8]">
                        <p className="font-medium">{d.name}</p><p className="text-[10px] text-slate-400">{d.email}</p>
                      </button>
                    ))
                  }
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
          <div className="px-3 py-2 border-b border-slate-100 bg-slate-50"><p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">User Name</p></div>
          <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto">
            {loadingStaff
              ?<div className="flex items-center justify-center py-8"><Loader2 className="w-5 h-5 text-slate-300 animate-spin"/></div>
              :staff.map((s)=>(
                <button key={s.id} onClick={()=>selectMember(s)} className={`w-full flex items-center justify-between px-3 py-2.5 text-left transition-colors border-l-4 ${s.id===selectedId?'bg-[#EEF3F8] border-[#1A438A]':'hover:bg-slate-50 border-transparent'}`}>
                  <div className="flex-1 min-w-0"><p className="text-sm text-slate-700 font-medium truncate">{s.name}</p><p className="text-[10px] text-slate-400 truncate">{s.role||'No role assigned'}</p></div>
                  <div className="w-5 h-5 rounded-full border-2 border-slate-300 flex items-center justify-center flex-shrink-0 ml-2">{s.id===selectedId&&<div className="w-2.5 h-2.5 rounded-full bg-[#1A438A]"/>}</div>
                </button>
              ))
            }
          </div>
        </div>
      </div>
      {selected&&(
        <div className="flex-1 flex flex-col gap-4">
          <div className="flex items-center gap-3 px-4 py-3 bg-white rounded-xl border border-slate-200 shadow-sm">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#1A438A] to-[#1e5aad] flex items-center justify-center text-white font-bold text-sm">{getInitials(selected.name)}</div>
            <div><p className="text-sm font-bold text-[#17293E]">{selected.name}</p><p className="text-[11px] text-slate-400">{selected.email}</p></div>
            {editing&&<span className="ml-auto text-[11px] font-bold px-3 py-1 rounded-full bg-amber-100 text-amber-700 border border-amber-200">Editing</span>}
          </div>
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">User Role</div>
          <div className="relative -mt-2">
            <select value={displayRole} disabled={!editing} onChange={(e)=>setEditRole(e.target.value as Role)} className={`w-full px-3.5 py-2.5 rounded-xl border-2 text-sm appearance-none focus:outline-none transition-all ${editing?'border-[#1A438A] bg-white text-slate-800':'border-slate-200 bg-slate-50 text-slate-500 cursor-not-allowed'}`}>
              <option value="">Select role...</option>
              {ROLES.map((r)=><option key={r} value={r}>{r}</option>)}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none"/>
          </div>
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 -mb-2">Form Allocation</div>
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm flex-1 min-h-0 overflow-y-auto">
            <div className="divide-y divide-slate-100">
              {ALL_FORMS.map((f)=>(
                <label key={f.id} className={`flex items-center gap-3 px-4 py-2.5 transition-colors ${editing?'cursor-pointer hover:bg-[#EEF3F8]':'cursor-default'}`}>
                  <div onClick={()=>editing&&toggleForm(f.id)} className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all ${displayForms.includes(f.id)?'bg-[#1A438A] border-[#1A438A]':'bg-white border-slate-300'}`}>
                    {displayForms.includes(f.id)&&<Check className="w-3 h-3 text-white"/>}
                  </div>
                  <span className="text-sm text-slate-600"><span className="font-bold text-[#1A438A] mr-1.5">FORM {f.id}</span>{f.name}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={()=>router.push(ROUTES.LEGAL_GM_HOME)} className="px-8 py-2.5 rounded-xl font-bold text-sm text-white" style={{background:'linear-gradient(135deg, #1A438A, #1e5aad)'}}>Back</button>
            {!editing
              ?<button onClick={()=>{setEditing(true);setEditRole(selected.role);setEditForms(selected.forms);}} className="flex-1 py-2.5 rounded-xl font-bold text-sm text-white" style={{background:'linear-gradient(135deg, #AC9C2F, #c9b535)'}}>EDIT</button>
              :<button onClick={saveChanges} disabled={saving} className="flex-1 py-2.5 rounded-xl font-bold text-sm text-white flex items-center justify-center gap-2 disabled:opacity-70" style={{background:'linear-gradient(135deg, #AC9C2F, #c9b535)'}}>
                {saving?<><Loader2 className="w-4 h-4 animate-spin"/>Saving...</>:<><Save className="w-4 h-4"/>Save Changes</>}
              </button>
            }
          </div>
        </div>
      )}
      {showSaved&&<SavedModal message={`User: ${savedUser}`} onClose={()=>setShowSaved(false)}/>}
    </div>
  );
}

function FormSettingsTab() {
  const router=useRouter();
  const [configs,setConfigs]=useState<FormConfig[]>([]);
  const [loadingConfigs,setLoadingConfigs]=useState(true);
  const [saving,setSaving]=useState(false);
  const [apiError,setApiError]=useState('');
  const [selectedFormId,setSelectedFormId]=useState(1);
  const [showAddDoc,setShowAddDoc]=useState(false);
  const [editingDoc,setEditingDoc]=useState<RequiredDoc|null>(null);
  const [showEditInstr,setShowEditInstr]=useState(false);
  const [pendingRemoveId,setPendingRemoveId]=useState<string|null>(null);
  const [showRemoved,setShowRemoved]=useState(false);
  const [showSaved,setShowSaved]=useState(false);
  const [showFormDropdown,setShowFormDropdown]=useState(false);
  useEffect(()=>{
    setLoadingConfigs(true);
    fetch('/api/settings/forms').then((r)=>r.json()).then((data)=>{
      if(!data.success)throw new Error(data.error||'Failed to load configs');
      const apiMap:Record<number,FormConfig>={};
      data.data.forEach((c:FormConfig)=>{apiMap[c.formId]=c;});
      setConfigs(ALL_FORMS.map((f)=>apiMap[f.id]||{formId:f.id,formName:f.name,docs:[],instructions:`Instructions for ${f.name} — to be configured.`}));
    }).catch((err:unknown)=>{setApiError(err instanceof Error?err.message:'Failed to load');}).finally(()=>setLoadingConfigs(false));
  },[]);
  const config=configs.find((c)=>c.formId===selectedFormId);
  const updateConfig=(updater:(c:FormConfig)=>FormConfig)=>setConfigs((prev)=>prev.map((c)=>c.formId===selectedFormId?updater(c):c));
  const addDoc=(label:string,type:string)=>updateConfig((c)=>({...c,docs:[...c.docs,{id:`d_${Date.now()}`,label,type}]}));
  const editDoc=(id:string,label:string,type:string)=>updateConfig((c)=>({...c,docs:c.docs.map((d)=>d.id===id?{...d,label,type}:d)}));
  const removeDoc=(id:string)=>{updateConfig((c)=>({...c,docs:c.docs.filter((d)=>d.id!==id)}));setPendingRemoveId(null);setShowRemoved(true);};
  const saveChanges=async()=>{
    if(!config)return;setSaving(true);setApiError('');
    try{
      const res=await fetch('/api/settings/forms',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({formId:config.formId,instructions:config.instructions,docs:config.docs.map((d)=>({label:d.label,type:d.type}))})});
      const data=await res.json();
      if(!res.ok||!data.success)throw new Error(data.error||'Save failed');
      setShowSaved(true);
    }catch(err:unknown){setApiError(err instanceof Error?err.message:'Save failed');}
    finally{setSaving(false);}
  };
  return(
    <div className="flex gap-5 flex-1 min-h-0">
      <div className="w-[400px] flex-shrink-0 flex flex-col gap-3">
        <SectionHeader>Form Settings</SectionHeader>
        {apiError&&<ErrorBanner message={apiError}/>}
        <div className="mb-1">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">Select the Form</p>
          <div className="relative">
            <button onClick={()=>setShowFormDropdown(!showFormDropdown)} className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl border-2 border-[#1A438A] bg-white text-sm font-medium text-[#17293E]">
              {config?<span><span className="font-bold text-[#1A438A] mr-2">FORM {config.formId}</span>{config.formName}</span>:<span className="text-slate-400">Select a form...</span>}
              <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0"/>
            </button>
            {showFormDropdown&&(
              <div className="absolute top-full mt-1 left-0 right-0 bg-white rounded-xl border border-slate-200 shadow-xl z-30 overflow-hidden">
                {ALL_FORMS.map((f)=>(
                  <button key={f.id} onClick={()=>{setSelectedFormId(f.id);setShowFormDropdown(false);}} className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${f.id===selectedFormId?'bg-[#EEF3F8] text-[#1A438A] font-bold':'text-slate-600 hover:bg-slate-50'}`}>
                    <span className="font-bold mr-2 text-[#1A438A]">FORM {f.id}</span>{f.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Required Documents</p>
          <button onClick={()=>setShowAddDoc(true)} disabled={loadingConfigs} className="flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold text-white disabled:opacity-40" style={{background:'linear-gradient(135deg, #AC9C2F, #c9b535)'}}>
            <Plus className="w-3 h-3"/> Add new
          </button>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex-1">
          {loadingConfigs
            ?<div className="flex items-center justify-center py-10"><Loader2 className="w-5 h-5 text-slate-300 animate-spin"/></div>
            :<div className="divide-y divide-slate-100 max-h-[420px] overflow-y-auto">
              {!config||config.docs.length===0
                ?<div className="text-center py-8"><p className="text-sm text-slate-400">No documents configured yet.</p></div>
                :config.docs.map((doc,i)=>(
                  <div key={doc.id} className="flex items-center gap-2 px-3 py-2.5 hover:bg-slate-50 group">
                    <span className="text-[11px] text-slate-300 font-bold w-5 flex-shrink-0">{i+1}.</span>
                    <div className="flex-1 min-w-0"><p className="text-sm text-slate-700 truncate">{doc.label}</p><span className="text-[10px] text-slate-400 font-medium">{doc.type}</span></div>
                    <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={()=>setEditingDoc(doc)} className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-[#EEF3F8] flex items-center justify-center"><Pencil className="w-3 h-3 text-slate-500"/></button>
                      <button onClick={()=>setPendingRemoveId(doc.id)} className="w-7 h-7 rounded-lg bg-red-50 hover:bg-red-100 flex items-center justify-center"><Minus className="w-3 h-3 text-red-500"/></button>
                    </div>
                  </div>
                ))
              }
            </div>
          }
        </div>
        <div className="flex gap-3 mt-2">
          <button onClick={()=>router.push(ROUTES.LEGAL_GM_HOME)} className="px-8 py-2.5 rounded-xl font-bold text-sm text-white" style={{background:'linear-gradient(135deg, #1A438A, #1e5aad)'}}>Back</button>
          <button onClick={saveChanges} disabled={saving||loadingConfigs} className="flex-1 py-2.5 rounded-xl font-bold text-sm text-white flex items-center justify-center gap-2 disabled:opacity-70" style={{background:'linear-gradient(135deg, #AC9C2F, #c9b535)'}}>
            {saving?<><Loader2 className="w-4 h-4 animate-spin"/>Saving...</>:<><Save className="w-4 h-4"/>Save Changes</>}
          </button>
        </div>
      </div>
      <div className="flex-1 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Instructions to the Initiator</p>
          <button onClick={()=>setShowEditInstr(true)} disabled={loadingConfigs} className="flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold text-white disabled:opacity-40" style={{background:'linear-gradient(135deg, #AC9C2F, #c9b535)'}}>
            <Pencil className="w-3 h-3"/> Edit
          </button>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex-1 overflow-y-auto">
          {loadingConfigs
            ?<div className="flex items-center justify-center py-10"><Loader2 className="w-5 h-5 text-slate-300 animate-spin"/></div>
            :<p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{config?.instructions||'No instructions configured yet.'}</p>
          }
        </div>
      </div>
      {showAddDoc&&<AddDocModal onAdd={addDoc} onClose={()=>setShowAddDoc(false)}/>}
      {editingDoc&&<EditDocModal doc={editingDoc} onSave={(label,type)=>{editDoc(editingDoc.id,label,type);setEditingDoc(null);}} onClose={()=>setEditingDoc(null)}/>}
      {showEditInstr&&config&&<EditInstructionsModal initial={config.instructions} onSave={(v)=>updateConfig((c)=>({...c,instructions:v}))} onClose={()=>setShowEditInstr(false)}/>}
      {pendingRemoveId&&<ConfirmRemoveModal onConfirm={()=>removeDoc(pendingRemoveId)} onClose={()=>setPendingRemoveId(null)}/>}
      {showRemoved&&<RemovedModal onClose={()=>setShowRemoved(false)}/>}
      {showSaved&&<SavedModal onClose={()=>setShowSaved(false)}/>}
    </div>
  );
}

export default function SettingsPage() {
  const {data:session}=useSession();
  const [activeTab,setActiveTab]=useState<'staff'|'forms'>('staff');
  const userName=session?.user?.name||'Legal GM';
  const userInitial=getInitials(userName);
  const [firstName,lastName]=userName.split(' ');
  return(
    <div className="min-h-screen flex" style={{fontFamily:"'DM Sans', sans-serif",background:'#f0f4f9'}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700;800&display=swap');`}</style>
      <aside className="w-[200px] flex-shrink-0 flex flex-col py-8 px-4 gap-6" style={{background:'linear-gradient(180deg, #1A438A 0%, #17293E 100%)'}}>
        <div className="flex flex-col items-center gap-2">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-pink-400 to-rose-600 flex items-center justify-center text-white font-bold text-2xl shadow-lg">{userInitial}</div>
          <div className="text-center"><p className="text-white font-bold text-sm">{firstName}</p><p className="text-white/50 text-[11px]">{lastName||''}</p></div>
        </div>
        <div className="w-full h-px bg-white/10"/>
        <nav className="flex flex-col gap-2">
          <button onClick={()=>setActiveTab('staff')} className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all ${activeTab==='staff'?'bg-white/15 text-white':'text-white/50 hover:text-white hover:bg-white/10'}`}>
            <Users className="w-4 h-4 flex-shrink-0"/>Legal Staff
          </button>
          <button onClick={()=>setActiveTab('forms')} className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all ${activeTab==='forms'?'bg-white/15 text-white':'text-white/50 hover:text-white hover:bg-white/10'}`}>
            <FileText className="w-4 h-4 flex-shrink-0"/>Form Settings
          </button>
        </nav>
      </aside>
      <div className="flex-1 flex flex-col p-8 min-h-0 overflow-auto">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shadow-md" style={{background:'linear-gradient(135deg, #1A438A, #1e5aad)'}}><SettingsIcon className="w-5 h-5 text-white"/></div>
          <div><h1 className="text-[#17293E] text-2xl font-bold leading-tight">Settings</h1><p className="text-slate-400 text-xs">{activeTab==='staff'?'Manage staff roles and form access':'Configure required documents and instructions per form'}</p></div>
        </div>
        {activeTab==='staff'?<LegalStaffTab/>:<FormSettingsTab/>}
      </div>
    </div>
  );
}
