import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Lightbulb, Camera, Scissors, Link2, Send, CalendarCheck,
  Check, ArrowLeft, ArrowRight, Loader2, PartyPopper, Sparkles,
} from 'lucide-react';
import { api } from '../services/api';

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

const PLATFORM_OPTIONS = ['Instagram', 'Facebook', 'LTK', 'ShopMy', 'Amazon', 'Walmart'];

function StepDots({ steps, current, furthest, onJump }) {
  return (
    <div className="flex items-center w-full mb-8 overflow-x-auto pb-2">
      {steps.map((s, i) => {
        const Icon = s.icon;
        const done = i < furthest;
        const active = i === current;
        const reachable = i <= furthest;
        return (
          <React.Fragment key={s.key}>
            <button
              onClick={() => reachable && onJump(i)}
              disabled={!reachable}
              className={`flex flex-col items-center gap-1.5 shrink-0 ${reachable ? 'cursor-pointer' : 'cursor-not-allowed opacity-40'}`}
            >
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
              <div className="flex-1 h-0.5 mx-2 min-w-[24px]" style={{ backgroundColor: i < furthest ? s.color : 'var(--surface-200, #e5e7eb)' }} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

export default function CreateContent() {
  const navigate = useNavigate();
  const [stepIndex, setStepIndex] = useState(0);
  const [furthest, setFurthest] = useState(0);
  const [form, setForm] = useState({
    ideaNotes: '', shootNotes: '', editNotes: '', linkNotes: '',
    platforms: [], title: '', date: '', time: '10:00',
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);

  const step = STEPS[stepIndex];

  const suggestedTitle = useMemo(() => {
    if (form.title) return form.title;
    const idea = form.ideaNotes.trim();
    if (!idea) return '';
    return idea.length > 60 ? idea.slice(0, 57) + '...' : idea;
  }, [form.ideaNotes, form.title]);

  const goTo = (i) => {
    setStepIndex(i);
    setFurthest((f) => Math.max(f, i));
  };
  const next = () => goTo(Math.min(stepIndex + 1, STEPS.length - 1));
  const back = () => goTo(Math.max(stepIndex - 1, 0));

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
    return parts.join('\n\n');
  };

  const handlePin = async () => {
    if (!form.date) { setError('Pick a date first.'); return; }
    setSaving(true);
    setError(null);
    try {
      const start_at = new Date(`${form.date}T${form.time || '10:00'}`).toISOString();
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
      setSaved(true);
    } catch (e) {
      setError(e.message || 'Could not save to the calendar. Try again.');
    }
    setSaving(false);
  };

  const startOver = () => {
    setForm({ ideaNotes: '', shootNotes: '', editNotes: '', linkNotes: '', platforms: [], title: '', date: '', time: '10:00' });
    setStepIndex(0);
    setFurthest(0);
    setSaved(false);
    setError(null);
  };

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

  return (
    <div className="p-4 lg:p-8 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-surface-900">Create Content</h1>
        <p className="text-sm text-surface-500 mt-0.5">Walk through each step, then pin the finished plan to a day.</p>
      </div>

      <StepDots steps={STEPS} current={stepIndex} furthest={furthest} onJump={goTo} />

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
            <button className="btn-primary text-sm" onClick={handlePin} disabled={saving}>
              {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Pinning...</> : <><Sparkles className="w-4 h-4" /> Pin to Calendar</>}
            </button>
          ) : (
            <button className="btn-primary text-sm" onClick={next}>
              Next <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
