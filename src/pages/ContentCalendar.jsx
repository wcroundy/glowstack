import React, { useState, useEffect, useMemo } from 'react';
import {
  ChevronLeft, ChevronRight, Plus, Sparkles, Calendar as CalendarIcon,
  Clock, MapPin, Video, Image as ImageIcon, AlertCircle
} from 'lucide-react';
import { api } from '../services/api';
import PlatformIcon from '../components/common/PlatformIcon';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function EventChip({ event }) {
  return (
    <div
      className="text-[10px] px-2 py-1 rounded-md truncate font-medium text-white cursor-pointer hover:opacity-80 transition-opacity"
      style={{ backgroundColor: event.color || '#ec4899' }}
      title={event.title}
    >
      {event.ai_suggested && <Sparkles className="w-2.5 h-2.5 inline mr-0.5" />}
      {event.title}
    </div>
  );
}

export default function ContentCalendar() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState([]);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [view, setView] = useState('month'); // month, week, list

  useEffect(() => {
    api.getCalendarEvents().then(r => setEvents(r.data || []));
  }, []);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const calendarDays = useMemo(() => {
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const days = [];

    // Previous month padding
    const prevMonthDays = new Date(year, month, 0).getDate();
    for (let i = firstDay - 1; i >= 0; i--) {
      days.push({ date: prevMonthDays - i, currentMonth: false });
    }
    // Current month
    for (let i = 1; i <= daysInMonth; i++) {
      days.push({ date: i, currentMonth: true });
    }
    // Next month padding
    const remaining = 42 - days.length;
    for (let i = 1; i <= remaining; i++) {
      days.push({ date: i, currentMonth: false });
    }
    return days;
  }, [year, month]);

  const getEventsForDay = (day) => {
    if (!day.currentMonth) return [];
    return events.filter(e => {
      const d = new Date(e.start_at);
      return d.getDate() === day.date && d.getMonth() === month && d.getFullYear() === year;
    });
  };

  const isToday = (day) => {
    if (!day.currentMonth) return false;
    const today = new Date();
    return day.date === today.getDate() && month === today.getMonth() && year === today.getFullYear();
  };

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));
  const goToday = () => setCurrentDate(new Date());

  return (
    <div className="p-4 lg:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-surface-900">Content Calendar</h1>
          <p className="text-sm text-surface-500 mt-0.5">Plan, schedule, and track your content across platforms</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary text-sm">
            <Sparkles className="w-4 h-4" /> AI Suggest
          </button>
          <button className="btn-primary text-sm">
            <Plus className="w-4 h-4" /> New Event
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Calendar */}
        <div className="lg:col-span-3">
          <div className="card">
            {/* Calendar Navigation */}
            <div className="flex items-center justify-between p-4 border-b">
              <div className="flex items-center gap-3">
                <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-surface-100"><ChevronLeft className="w-5 h-5" /></button>
                <h2 className="text-lg font-semibold">{MONTHS[month]} {year}</h2>
                <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-surface-100"><ChevronRight className="w-5 h-5" /></button>
              </div>
              <div className="flex gap-2">
                <button onClick={goToday} className="btn-ghost text-xs">Today</button>
                <div className="flex border rounded-lg overflow-hidden">
                  {['month', 'list'].map(v => (
                    <button
                      key={v}
                      onClick={() => setView(v)}
                      className={`px-3 py-1.5 text-xs font-medium ${view === v ? 'bg-brand-50 text-brand-600' : 'text-surface-500 hover:bg-surface-50'}`}
                    >
                      {v.charAt(0).toUpperCase() + v.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {view === 'month' ? (
              <div className="p-2">
                {/* Day headers */}
                <div className="grid grid-cols-7">
                  {DAYS.map(d => (
                    <div key={d} className="text-center text-xs font-medium text-surface-400 py-2">{d}</div>
                  ))}
                </div>
                {/* Days grid */}
                <div className="grid grid-cols-7">
                  {calendarDays.map((day, i) => {
                    const dayEvents = getEventsForDay(day);
                    return (
                      <div
                        key={i}
                        className={`min-h-[90px] p-1 border border-surface-100 rounded-lg m-0.5 transition-colors
                          ${day.currentMonth ? 'bg-white' : 'bg-surface-50'}
                          ${isToday(day) ? 'ring-2 ring-brand-300' : ''}
                          hover:bg-brand-50/30 cursor-pointer`}
                      >
                        <div className={`text-xs font-medium mb-1 px-1 ${day.currentMonth ? (isToday(day) ? 'text-brand-600' : 'text-surface-700') : 'text-surface-300'}`}>
                          {day.date}
                        </div>
                        <div className="space-y-0.5">
                          {dayEvents.slice(0, 3).map(e => (
                            <EventChip key={e.id} event={e} />
                          ))}
                          {dayEvents.length > 3 && (
                            <div className="text-[10px] text-surface-400 px-2">+{dayEvents.length - 3} more</div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              /* List View */
              <div className="p-4 space-y-3">
                {events.length === 0 && <p className="text-sm text-surface-400 text-center py-8">No events scheduled</p>}
                {events.map(event => (
                  <div key={event.id} className="flex items-center gap-4 p-3 rounded-xl border border-surface-100 hover:border-brand-200 transition-colors cursor-pointer">
                    <div className="w-1.5 h-12 rounded-full" style={{ backgroundColor: event.color }} />
                    {event.platform && <PlatformIcon platform={event.platform} size="sm" />}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-medium truncate">{event.title}</h4>
                        {event.ai_suggested && (
                          <span className="badge bg-purple-100 text-purple-600 text-[10px]">
                            <Sparkles className="w-2.5 h-2.5 mr-0.5" /> AI Suggested
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-surface-400 mt-0.5">
                        {new Date(event.start_at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                        {' at '}
                        {new Date(event.start_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                      </p>
                      {event.ai_reason && (
                        <p className="text-[11px] text-purple-500 mt-1 flex items-center gap-1">
                          <Sparkles className="w-3 h-3" /> {event.ai_reason}
                        </p>
                      )}
                    </div>
                    <span className={`badge text-[10px] ${
                      event.status === 'confirmed' ? 'bg-emerald-100 text-emerald-700' :
                      event.status === 'planned' ? 'bg-blue-100 text-blue-700' :
                      'bg-surface-100 text-surface-600'
                    }`}>
                      {event.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Upcoming */}
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-surface-800 mb-3">Coming Up</h3>
            <div className="space-y-3">
              {events.slice(0, 4).map(e => (
                <div key={e.id} className="flex items-start gap-2.5">
                  <div className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: e.color }} />
                  <div>
                    <p className="text-xs font-medium text-surface-800">{e.title}</p>
                    <p className="text-[11px] text-surface-400">
                      {new Date(e.start_at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* AI Suggestions */}
          <div className="card p-5 bg-gradient-to-b from-purple-50 to-white">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="w-4 h-4 text-purple-500" />
              <h3 className="text-sm font-semibold text-surface-800">AI Suggestions</h3>
            </div>
            <div className="space-y-3">
              {events.filter(e => e.ai_suggested).map(e => (
                <div key={e.id} className="p-2.5 rounded-lg bg-white border border-purple-100">
                  <p className="text-xs font-medium text-surface-800">{e.title}</p>
                  <p className="text-[11px] text-purple-500 mt-1">{e.ai_reason}</p>
                </div>
              ))}
              {events.filter(e => e.ai_suggested).length === 0 && (
                <p className="text-xs text-surface-400">No AI suggestions yet</p>
              )}
            </div>
          </div>

          {/* Content Mix */}
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-surface-800 mb-3">This Week's Mix</h3>
            <div className="space-y-2">
              {[
                { label: 'Posts', count: events.filter(e => e.event_type === 'post').length, color: 'bg-brand-400' },
                { label: 'Shoots', count: events.filter(e => e.event_type === 'shoot').length, color: 'bg-purple-400' },
                { label: 'Deadlines', count: events.filter(e => e.event_type === 'deadline').length, color: 'bg-red-400' },
              ].map(item => (
                <div key={item.label} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <div className={`w-2.5 h-2.5 rounded-full ${item.color}`} />
                    <span className="text-surface-600">{item.label}</span>
                  </div>
                  <span className="font-medium">{item.count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
