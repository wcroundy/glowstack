import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Lightbulb, Camera, Scissors, Link2, Send, CalendarCheck,
  Check, ArrowLeft, ArrowRight, Loader2, PartyPopper, Sparkles,
  FolderOpen, Plus, Trash2, Save, X,
} from 'lucide-react';
import { api } from '../services/api';
import { useUnsavedChanges } from '../contexts/UnsavedChangesContext';
import ContentIdeas from '../components/ContentIdeas';

// Mirrors the stages from Brooklyn's posting-process diagram (Generate Ideas ->
// Gather & Shoot -> Edit -> Links -> Post), plus a final scheduling step that
// pins the finished plan to the Content Calendar.
const STEPS = [
  {
    key: 'idea',
    title: 'Generate Ideas',
    color: '#e05c6a',
    icon: Lightbulb,
    blurb: "What's the content idea?",
    checklist: [
      'Think about what your audience wants to see',
      'Look through items you already have in-house',
      'Check what worked well for you before',
      'See what similar creators are posting',
    ],
    field: 'ideaNotes',
    placeholder: "e.g. Summer try-on haul featuring the new sandals and the green tank top...",
  },
  {
    key: 'shoot',
    title: 'Gather Items & Shoot',
    color: '#f59e0b',
    icon: Camera,
    blurb: 'Get everything ready and film it.',
    checklist: [
      'Write a quick script or shot list',
      'Pick a location',
      'Shoot the photo or video',
    ],
    field: 'shootNotes',
    placeholder: 'e.g. Shot in the bedroom, natural light, 3 outfit changes...',
  },
  {
    key: 'edit',
    title: 'Edit Photo/Video',
    color: '#4caf7d',
    icon: Scissors,
    blurb: 'Polish it up.',
    checklist: [
      'Trim and arrange clips',
      'Match the style of your best-performing posts',
    ],
    field: 'editNotes',
    placeholder: 'e.g. CapCut, used the "clean girl" template, added captions...',
  },
  {
    key: 'links',
    title: 'Product Links',
    color: '#06b6d4',
    icon: Link2,
    blurb: 'Line up the products so you get credit for sales.',
    checklist: [
      'Find each product in LTK (or ShopMy / Amazon / Walmart)',
      'Generate the affiliate links',
      'Save the links somewhere you can find them',
    ],
    field: 'linkNotes',
    placeholder: 'e.g. Sandals - LTK link: ..., Tank top - Amazon link: ...',
  },
  {
    key: 'post',
    title: 'Choose Platforms',
    color: '#4a9eff',
    icon: Send,
    blurb: 'Where is this going out?',
    checklist: [
      'Post the links (LTK / ShopMy / Amazon / Walmart)',
      'Share to Facebook',
      'Share to Instagram',
    ],
    field: 'platforms',
    isPlatformStep: true,
  },
  {
    key: 'schedule',
    title: 'Pin to Calendar',
    color: '#7c6af7',
    icon: CalendarCheck,
    blurb: "Lock in a day and time, and you're done.",
    isScheduleStep: true,
  },
];

const FINALIZABLE_STEPS = STEPS.slice(0, 5);
const PLATFORM_OPTIONS = ['Instagram', 'Facebook', 'LTK', 'ShopMy', 'Amazon', 'Walmart'];

const EMPTY_FORM = { ideaNotes: '', shootNotes: '', editNotes: '', linkNotes: '', platforms: [], title: '', date: '', time: '10:00', contentPlan: null };

function StepDots({ steps, current, completed, onJump }) {
  return (
    <div className="flex items-center w-full mb-8 overflow-x-auto pb-2">
      {steps.map((s, i) => {
        const Icon = s.icon;
        const done = completed.includes(s.key);
        const active = i === current;
        return (
          <React.Fragment key={s.key}>
            <button onClick={() => onJump(i)} className="flex flex-col items-center gap-1.5 shrink-0 cursor-pointer">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center transition-all"
                style={{
                  backgroundColor: active || done ? s.color : 'transparent',
                  border: `2px solid ${s.color}`,
                  color: active || done ? 'white' : s.color,
                }}
              >
                {done ? <Check className="w-5 h-5" /> : <Icon className="w-4.5 h-4.5" />}
              </div>
              <span className={`text-[11px] font-medium whitespace-nowrap ${active ? 'text-surface-900' : 'text-surface-400'}`}>
                {s.title}
              </span>
            </button>
            {i < steps.length - 1 && (
              <div className="flex-1 h-0.5 mx-2 min-w-[24px]" style={{ backgroundColor: done ? s.color : 'var(--surface-200, #e5e7eb)' }} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

function DraftCard({ draft, onResume, onDelete }) {
  const label = draft.title || draft.idea_notes || 'Untitled idea';
  const completed = draft.completed_steps || [];
  return (
    <div className="card p-5 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold text-surface-800 line-clamp-2">{label}</h3>
        <button onClick={onDelete} className="text-surface-300 hover:text-red-500 transition-colors shrink-0">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
      <div className="flex items-center gap-1.5">
        {FINALIZABLE_STEPS.map((s) => (
          <div
            key={s.key}
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: completed.includes(s.key) ? s.color : 'var(--surface-200, #e5e7eb)' }}
            title={s.title}
          />
        ))}
      </div>
      <p className="text-[11px] text-surface-400">
        Updated {new Date(draft.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
      </p>
      <button className="btn-secondary text-xs self-start" onClick={onResume}>Resume</button>
    </div>
  );
}

export default function CreateContent() {
  const navigate = useNavigate();
  const { draftId } = useParams();
  const { setDirty, confirmLeave } = useUnsavedChanges();

  const [view, setView] = useState(draftId ? 'wizard' : 'list');
  const [drafts, setDrafts] = useState([]);
  const [draftsLoading, setDraftsLoading] = useState(true);
  const [listError, setListError] = useState(null);

  const [stepIndex, setStepIndex] = useState(0);
  const [completedSteps, setCompletedSteps] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [currentDraftId, setCurrentDraftId] = useState(draftId || null);

  const [savingDraft, setSavingDraft] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [pinning, setPinning] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);

  const skipNextLoadRef = useRef(false);
  const justHydratedRef = useRef(true); // suppress the dirty-flag right after a programmatic load/reset

  const baseStep = STEPS[stepIndex];
  const formats = [...new Set(form.contentPlan?.pieces?.map(p => p.format) || [])];
  const step = form.contentPlan && ['shoot', 'edit'].includes(baseStep.key) ? {
    ...baseStep,
    blurb: `Prepare your ${formats.join(', ')} plan.`,
    checklist: baseStep.key === 'shoot' ? [
      'Confirm the exact products and existing assets in the saved brief',
      ...(formats.includes('Reel') ? ['Recover approved footage or capture the hook and demonstration'] : []),
      ...(formats.includes('Carousel') ? ['Select photos that support each slide in the sequence'] : []),
      ...(formats.includes('Stories') ? ['Gather the demonstration and supporting Story frames'] : []),
      ...(formats.includes('Shopping post') ? ['Prepare the product images or shopping video'] : []),
    ] : [
      ...(formats.includes('Reel') ? ['Review the first-frame hook, pacing, captions and cover'] : []),
      ...(formats.includes('Carousel') ? ['Review the slide sequence, text hierarchy and final CTA'] : []),
      ...(formats.includes('Stories') ? ['Review frame order and prepare polls or link-sticker instructions'] : []),
      ...(formats.includes('Shopping post') ? ['Review shopping copy and exact product tags'] : []),
      'Review each channel version before marking this step complete',
    ],
  } : baseStep;

  const loadDrafts = useCallback(() => {
    setDraftsLoading(true);
    api.getContentDrafts()
      .then((r) => setDrafts(r.data || []))
      .catch(() => setListError('Could not load your drafts.'))
      .finally(() => setDraftsLoading(false));
  }, []);

  useEffect(() => {
    if (view === 'list') loadDrafts();
  }, [view, loadDrafts]);

  // Load a specific draft when arriving at /posting/create/:draftId
  useEffect(() => {
    if (!draftId) return;
    if (skipNextLoadRef.current) { skipNextLoadRef.current = false; return; }
    api.getContentDraft(draftId).then((d) => {
      justHydratedRef.current = true;
      setForm({
        ideaNotes: d.idea_notes || '', shootNotes: d.shoot_notes || '', editNotes: d.edit_notes || '',
        linkNotes: d.link_notes || '', platforms: d.platforms || [], title: d.title || '', date: '', time: '10:00', contentPlan: d.content_plan || null,
      });
      const done = d.completed_steps || [];
      setCompletedSteps(done);
      setCurrentDraftId(d.id);
      const firstIncomplete = FINALIZABLE_STEPS.findIndex((s) => !done.includes(s.key));
      setStepIndex(firstIncomplete === -1 ? 5 : firstIncomplete);
      setView('wizard');
    }).catch(() => {
      setError('Could not load that draft.');
      navigate('/posting/create', { replace: true });
      setView('list');
    });
  }, [draftId, navigate]);

  // Anything the user changes after a load/reset marks the wizard dirty,
  // so the sidebar + browser tab can warn before it's lost.
  useEffect(() => {
    if (justHydratedRef.current) { justHydratedRef.current = false; return; }
    setDirty(true);
  }, [form, completedSteps, setDirty]);

  const suggestedTitle = useMemo(() => {
    if (form.title) return form.title;
    return form.ideaNotes.trim();
  }, [form.ideaNotes, form.title]);

  const markStepComplete = (key) => {
    setCompletedSteps((prev) => (prev.includes(key) ? prev : [...prev, key]));
  };
  const markStepIncomplete = (key) => {
    setCompletedSteps((prev) => prev.filter((k) => k !== key));
  };

  const finalizeStep = () => {
    markStepComplete(step.key);
    setStepIndex((i) => Math.min(i + 1, STEPS.length - 1));
  };
  const back = () => setStepIndex((i) => Math.max(i - 1, 0));
  const jumpTo = (i) => setStepIndex(i);

  const togglePlatform = (p) => {
    setForm((f) => ({
      ...f,
      platforms: f.platforms.includes(p) ? f.platforms.filter((x) => x !== p) : [...f.platforms, p],
    }));
  };

  const summaryDescription = () => {
    const parts = [];
    if (form.ideaNotes) parts.push(`Idea: ${form.ideaNotes}`);
    if (form.shootNotes) parts.push(`Shoot: ${form.shootNotes}`);
    if (form.editNotes) parts.push(`Edit: ${form.editNotes}`);
    if (form.linkNotes) parts.push(`Links: ${form.linkNotes}`);
    if (form.contentPlan) parts.push(`Channel plan:\n${form.contentPlan.pieces.map(p => `${p.channel} / ${p.format}: ${p.purpose} — ${p.status}, ${p.date || 'date undecided'} ${p.time || ''}`).join('\n')}`);
    return parts.join('\n\n');
  };

  const draftPayload = () => ({
    title: suggestedTitle,
    idea_notes: form.ideaNotes, shoot_notes: form.shootNotes, edit_notes: form.editNotes, link_notes: form.linkNotes,
    platforms: form.platforms, completed_steps: completedSteps, content_plan: form.contentPlan,
  });

  const useIdea = async (idea) => {
    if ((form.ideaNotes || form.shootNotes || form.editNotes || form.linkNotes) && !window.confirm('Replace this draft’s notes and production plan with the selected idea?')) return;
    setSavingDraft(true); setError(null);
    const notes = `${idea.hook}\n\nWhy now: ${idea.why_now}\nGoal: ${idea.goal}\nTiming proposal: ${idea.timing}\nMeasure: ${idea.measurement}\n\nUnknowns: ${idea.unknowns.join('; ')}\n\nEvidence:\n${idea.evidence.map(e => `${e.title} (${e.captured_at}): ${e.quote}`).join('\n')}`;
    const next = { ...EMPTY_FORM, title: idea.title, ideaNotes: notes, shootNotes: idea.shoot_notes, editNotes: idea.edit_notes, linkNotes: idea.link_notes,
      platforms: [...new Set(idea.pieces.map(p => p.channel))], contentPlan: idea };
    try {
      const payload = { title: next.title, idea_notes: notes, shoot_notes: next.shootNotes, edit_notes: next.editNotes, link_notes: next.linkNotes,
        platforms: next.platforms, completed_steps: [], content_plan: idea };
      const savedDraft = currentDraftId ? await api.updateContentDraft(currentDraftId, payload) : await api.createContentDraft(payload);
      justHydratedRef.current = true; setForm(next); setCompletedSteps([]); setCurrentDraftId(savedDraft.id); setDirty(false);
      if (!currentDraftId) { skipNextLoadRef.current = true; navigate(`/posting/create/${savedDraft.id}`, { replace: true }); }
      setSaveMessage('Idea saved. Production steps are ready for your review.');
    } catch (e) { setError(e.message); }
    finally { setSavingDraft(false); }
  };

  const updatePiece = (id, changes) => setForm(f => ({ ...f, contentPlan: { ...f.contentPlan, pieces: f.contentPlan.pieces.map(p => p.id === id ? { ...p, ...changes } : p) } }));

  const handleSaveDraft = async () => {
    setSavingDraft(true);
    setError(null);
    try {
      if (currentDraftId) {
        await api.updateContentDraft(currentDraftId, draftPayload());
      } else {
        const created = await api.createContentDraft(draftPayload());
        setCurrentDraftId(created.id);
        skipNextLoadRef.current = true;
        navigate(`/posting/create/${created.id}`, { replace: true });
      }
      setDirty(false);
      setSaveMessage('Saved as draft');
      setTimeout(() => setSaveMessage(''), 2500);
    } catch (e) {
      setError(e.message || 'Could not save the draft. Try again.');
    }
    setSavingDraft(false);
  };

  const handlePin = async () => {
    if (!form.date) { setError('Pick a date first.'); return; }
    setPinning(true);
    setError(null);
    try {
      const start_at = new Date(`${form.date}T${form.time || '10:00'}`).toISOString();
      // Persist the current plan before scheduling; a failed save creates no event.
      if (currentDraftId) await api.updateContentDraft(currentDraftId, draftPayload());
      await api.createCalendarEvent({
        title: suggestedTitle || 'New content',
        description: summaryDescription(),
        event_type: 'post',
        platform: form.platforms[0]?.toLowerCase() || null,
        start_at,
        all_day: false,
        color: '#7c6af7',
        status: 'planned',
      });
      // Keep the evidence-backed draft: scheduling must not destroy its source lineage.
      setDirty(false);
      setSaved(true);
    } catch (e) {
      setError(e.message || 'Could not save to the calendar. Try again.');
    }
    setPinning(false);
  };

  const resetToBlank = () => {
    justHydratedRef.current = true;
    setForm(EMPTY_FORM);
    setCompletedSteps([]);
    setCurrentDraftId(null);
    setStepIndex(0);
    setSaved(false);
    setError(null);
    setDirty(false);
  };

  const handleStartNew = () => {
    resetToBlank();
    setView('wizard');
    if (draftId) navigate('/posting/create', { replace: true });
  };

  const handleResumeDraft = (id) => {
    navigate(`/posting/create/${id}`);
  };

  const handleDeleteDraft = async (id) => {
    if (!window.confirm('Delete this draft? This cannot be undone.')) return;
    try {
      await api.deleteContentDraft(id);
      setDrafts((prev) => prev.filter((d) => d.id !== id));
    } catch (e) {
      setListError('Could not delete that draft.');
    }
  };

  const handleBackToList = () => {
    if (!confirmLeave()) return;
    setDirty(false);
    if (draftId) navigate('/posting/create');
    else setView('list');
  };

  const startOver = () => {
    resetToBlank();
    if (draftId) navigate('/posting/create', { replace: true });
  };

  // ── Drafts list (landing view) ──────────────────────────────
  if (view === 'list') {
    return (
      <div className="p-4 lg:p-8 max-w-5xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-surface-900">Create Content</h1>
            <p className="text-sm text-surface-500 mt-0.5">Start a new piece of content, or pick up a saved draft.</p>
          </div>
          <button className="btn-primary text-sm" onClick={handleStartNew}>
            <Plus className="w-4 h-4" /> Start New
          </button>
        </div>

        {listError && <p className="text-xs text-red-500 mb-4">{listError}</p>}

        {draftsLoading ? (
          <p className="text-sm text-surface-400">Loading drafts...</p>
        ) : drafts.length === 0 ? (
          <div className="card p-10 text-center">
            <FolderOpen className="w-8 h-8 text-surface-300 mx-auto mb-3" />
            <p className="text-sm text-surface-500">No saved drafts yet. Start a new one whenever you're ready.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {drafts.map((d) => (
              <DraftCard key={d.id} draft={d} onResume={() => handleResumeDraft(d.id)} onDelete={() => handleDeleteDraft(d.id)} />
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── Success screen ──────────────────────────────────────────
  if (saved) {
    return (
      <div className="p-4 lg:p-8 max-w-2xl mx-auto">
        <div className="card p-10 text-center">
          <div className="w-16 h-16 rounded-full bg-brand-50 flex items-center justify-center mx-auto mb-4">
            <PartyPopper className="w-8 h-8 text-brand-500" />
          </div>
          <h2 className="text-xl font-bold text-surface-900 mb-2">Pinned to the calendar!</h2>
          <p className="text-sm text-surface-500 mb-6">
            "{suggestedTitle}" is on the books for {new Date(`${form.date}T${form.time || '10:00'}`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}.
          </p>
          <div className="flex gap-3 justify-center">
            <button className="btn-secondary" onClick={startOver}>Create Another</button>
            <button className="btn-primary" onClick={() => navigate('/calendar')}>View on Calendar</button>
          </div>
        </div>
      </div>
    );
  }

  // ── Wizard ───────────────────────────────────────────────────
  const stepAlreadyDone = completedSteps.includes(step.key);

  return (
    <div className="p-4 lg:p-8 max-w-3xl mx-auto">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <button onClick={handleBackToList} className="text-xs text-surface-400 hover:text-surface-600 flex items-center gap-1 mb-1">
            <ArrowLeft className="w-3 h-3" /> Drafts
          </button>
          <h1 className="text-2xl font-bold text-surface-900">Create Content</h1>
          <p className="text-sm text-surface-500 mt-0.5">Walk through each step, then pin the finished plan to a day.</p>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <button className="btn-secondary text-xs" onClick={handleSaveDraft} disabled={savingDraft}>
            {savingDraft ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Save as Draft
          </button>
          {saveMessage && <span className="text-[11px] text-brand-500">{saveMessage}</span>}
        </div>
      </div>

      <StepDots steps={STEPS} current={stepIndex} completed={completedSteps} onJump={jumpTo} />

      {error && <p role="alert" className="text-sm text-red-600 mb-4">{error}</p>}

      {form.contentPlan && <div className="card p-4 mb-4 space-y-3">
        <h3 className="font-semibold">{form.contentPlan.title}</h3>
        <p className="text-xs text-surface-500">{form.contentPlan.mode} · Proposed content plan. Track each piece separately; dates below are draft plans, not published posts.</p>
        {form.contentPlan.pieces.map(p => <div key={p.id} className="border-t border-surface-100 pt-3 space-y-2">
          <p className="text-sm font-medium">{p.channel} · {p.format}</p><p className="text-xs text-surface-500">{p.purpose}</p>
          <div className="flex flex-wrap gap-2">
            <select className="input w-auto" aria-label={`${p.channel} ${p.format} progress`} value={p.status} onChange={e => updatePiece(p.id, { status: e.target.value })}><option value="planned">Planned</option><option value="producing">Producing</option><option value="review">For review</option></select>
            <input className="input w-auto" type="date" aria-label={`${p.channel} ${p.format} date`} value={p.date} onChange={e => updatePiece(p.id, { date: e.target.value })} />
            <input className="input w-auto" type="time" aria-label={`${p.channel} ${p.format} time`} value={p.time} onChange={e => updatePiece(p.id, { time: e.target.value })} />
          </div>
        </div>)}
      </div>}

      <div className="card p-6 lg:p-8">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: step.color }}>
            <step.icon className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-surface-900">{step.title}</h2>
            <p className="text-xs text-surface-400">{step.blurb}</p>
          </div>
        </div>

        {step.checklist && (
          <ul className="mt-5 space-y-2">
            {step.checklist.map((item) => (
              <li key={item} className="flex items-start gap-2 text-sm text-surface-600">
                <Check className="w-4 h-4 mt-0.5 shrink-0" style={{ color: step.color }} />
                {item}
              </li>
            ))}
          </ul>
        )}

        {step.key === 'idea' && <ContentIdeas onUse={useIdea} disabled={savingDraft} />}

        {!step.isPlatformStep && !step.isScheduleStep && (
          <textarea
            className="input mt-5 min-h-[120px] resize-none"
            placeholder={step.placeholder}
            value={form[step.field]}
            onChange={(e) => setForm((f) => ({ ...f, [step.field]: e.target.value }))}
          />
        )}

        {step.isPlatformStep && (
          <div className="mt-5 grid grid-cols-2 sm:grid-cols-3 gap-2">
            {PLATFORM_OPTIONS.map((p) => {
              const active = form.platforms.includes(p);
              return (
                <button
                  key={p}
                  onClick={() => togglePlatform(p)}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium border transition-colors ${
                    active ? 'border-brand-400 bg-brand-50 text-brand-700' : 'border-surface-200 text-surface-600 hover:border-surface-300'
                  }`}
                >
                  <span className={`w-4 h-4 rounded-md border-2 flex items-center justify-center ${active ? 'border-brand-500 bg-brand-500' : 'border-surface-300'}`}>
                    {active && <Check className="w-3 h-3 text-white" />}
                  </span>
                  {p}
                </button>
              );
            })}
          </div>
        )}

        {step.isScheduleStep && (
          <div className="mt-5 space-y-4">
            <div>
              <label className="text-xs font-medium text-surface-500 mb-1 block">Title</label>
              <input
                className="input"
                value={suggestedTitle}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="What should we call this post?"
              />
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-xs font-medium text-surface-500 mb-1 block">Date</label>
                <input type="date" className="input" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
              </div>
              <div className="flex-1">
                <label className="text-xs font-medium text-surface-500 mb-1 block">Time</label>
                <input type="time" className="input" value={form.time} onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))} />
              </div>
            </div>

            <div className="rounded-xl bg-surface-50 p-4">
              <p className="text-xs font-semibold text-surface-500 mb-2">Quick recap</p>
              <div className="space-y-1.5 text-xs text-surface-600">
                {form.ideaNotes && <p><span className="font-medium text-surface-800">Idea:</span> {form.ideaNotes}</p>}
                {form.shootNotes && <p><span className="font-medium text-surface-800">Shoot:</span> {form.shootNotes}</p>}
                {form.editNotes && <p><span className="font-medium text-surface-800">Edit:</span> {form.editNotes}</p>}
                {form.linkNotes && <p><span className="font-medium text-surface-800">Links:</span> {form.linkNotes}</p>}
                {form.platforms.length > 0 && <p><span className="font-medium text-surface-800">Platforms:</span> {form.platforms.join(', ')}</p>}
                {!form.ideaNotes && !form.shootNotes && !form.editNotes && !form.linkNotes && (
                  <p className="text-surface-400">Nothing noted yet — that's okay, you can still schedule it.</p>
                )}
              </div>
            </div>

            {error && <p className="text-xs text-red-500">{error}</p>}
          </div>
        )}

        <div className="flex items-center justify-between mt-8 pt-5 border-t border-surface-100">
          <button className="btn-ghost text-sm" onClick={back} disabled={stepIndex === 0} style={{ visibility: stepIndex === 0 ? 'hidden' : 'visible' }}>
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
          {step.isScheduleStep ? (
            <button className="btn-primary text-sm" onClick={handlePin} disabled={pinning}>
              {pinning ? <><Loader2 className="w-4 h-4 animate-spin" /> Pinning...</> : <><Sparkles className="w-4 h-4" /> Pin to Calendar</>}
            </button>
          ) : (
            <div className="flex items-center gap-2">
              {stepAlreadyDone && (
                <button className="btn-ghost text-sm" onClick={() => markStepIncomplete(step.key)}>
                  <X className="w-4 h-4" /> Mark Incomplete
                </button>
              )}
              <button className="btn-primary text-sm" onClick={finalizeStep}>
                {stepAlreadyDone ? 'Continue' : 'Mark Complete'} <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
