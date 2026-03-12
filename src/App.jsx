import React, { useState, useEffect, useCallback } from 'react';
import { Routes, Route, NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Image, BarChart3, CalendarDays, MessageCircle,
  Settings, Sparkles, Menu, X, ChevronRight, LogOut, Tags
} from 'lucide-react';
import Dashboard from './pages/Dashboard';
import MediaLibrary from './pages/MediaLibrary';
import Analytics from './pages/Analytics';
import ContentCalendar from './pages/ContentCalendar';
import AiChat from './pages/AiChat';
import SetupWizard from './pages/SetupWizard';
import TagsManager from './pages/TagsManager';
import ChatDrawer from './components/chat/ChatDrawer';
import Login from './pages/Login';
import { setAuthToken } from './services/api';

const NAV_ITEMS = [
  { to: '/',           icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/media',      icon: Image,           label: 'Media Library' },
  { to: '/analytics',  icon: BarChart3,       label: 'Analytics' },
  { to: '/calendar',   icon: CalendarDays,    label: 'Calendar' },
  { to: '/tags',       icon: Tags,            label: 'Tag Manager' },
  { to: '/chat',       icon: MessageCircle,   label: 'AI Assistant' },
  { to: '/settings',   icon: Settings,        label: 'Integrations' },
];

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [chatDrawerOpen, setChatDrawerOpen] = useState(false);
  const [authed, setAuthed] = useState(null); // null = checking, false = not authed, true = authed
  const location = useLocation();

  const isChatPage = location.pathname === '/chat';

  // Check for existing session on mount
  useEffect(() => {
    const token = localStorage.getItem('glowstack_token');
    if (!token) {
      setAuthed(false);
      return;
    }
    setAuthToken(token);
    fetch('/api/auth/verify', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(data => {
        if (data.valid) {
          setAuthed(true);
        } else {
          localStorage.removeItem('glowstack_token');
          setAuthToken(null);
          setAuthed(false);
        }
      })
      .catch(() => {
        setAuthed(false);
      });
  }, []);

  const handleLogin = useCallback((token) => {
    localStorage.setItem('glowstack_token', token);
    setAuthToken(token);
    setAuthed(true);
  }, []);

  const handleLogout = useCallback(() => {
    const token = localStorage.getItem('glowstack_token');
    if (token) {
      fetch('/api/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }
    localStorage.removeItem('glowstack_token');
    setAuthToken(null);
    setAuthed(false);
  }, []);

  // Loading state while checking auth
  if (authed === null) {
    return (
      <div className="h-full flex items-center justify-center bg-surface-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center animate-pulse">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <p className="text-sm text-surface-400">Loading...</p>
        </div>
      </div>
    );
  }

  // Not authenticated — show login
  if (!authed) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <div className="h-full flex overflow-hidden">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/30 z-30 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 z-40 w-64 bg-white border-r border-surface-200
        transform transition-transform duration-200 lg:translate-x-0 lg:static lg:z-auto
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center justify-between px-5 py-5 border-b border-surface-100">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-base font-bold text-surface-900 leading-tight">GlowStack</h1>
                <p className="text-[11px] text-surface-400 font-medium">Beauty & Fashion</p>
              </div>
            </div>
            <button className="lg:hidden p-1" onClick={() => setSidebarOpen(false)}>
              <X className="w-5 h-5 text-surface-400" />
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
            {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={({ isActive }) => isActive ? 'sidebar-link-active' : 'sidebar-link'}
                onClick={() => setSidebarOpen(false)}
              >
                <Icon className="w-5 h-5" />
                {label}
              </NavLink>
            ))}
          </nav>

          {/* AI Quick Action */}
          {!isChatPage && (
            <div className="p-3 border-t border-surface-100">
              <button
                onClick={() => setChatDrawerOpen(true)}
                className="w-full flex items-center gap-3 px-3 py-3 rounded-xl bg-gradient-to-r from-brand-50 to-purple-50 text-brand-600 hover:from-brand-100 hover:to-purple-100 transition-colors"
              >
                <Sparkles className="w-5 h-5" />
                <span className="text-sm font-medium">Ask AI anything</span>
                <ChevronRight className="w-4 h-4 ml-auto" />
              </button>
            </div>
          )}

          {/* Logout */}
          <div className="p-3 border-t border-surface-100">
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-surface-500 hover:bg-surface-100 hover:text-surface-700 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Sign out
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile header */}
        <header className="lg:hidden flex items-center justify-between px-4 py-3 bg-white border-b border-surface-200">
          <button onClick={() => setSidebarOpen(true)} className="p-1.5 rounded-lg hover:bg-surface-100">
            <Menu className="w-5 h-5 text-surface-600" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-sm">GlowStack</span>
          </div>
          {!isChatPage && (
            <button onClick={() => setChatDrawerOpen(true)} className="p-1.5 rounded-lg hover:bg-surface-100">
              <MessageCircle className="w-5 h-5 text-brand-500" />
            </button>
          )}
          {isChatPage && <div className="w-8" />}
        </header>

        {/* Page content */}
        <div className="flex-1 overflow-y-auto">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/media" element={<MediaLibrary />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/calendar" element={<ContentCalendar />} />
            <Route path="/tags" element={<TagsManager />} />
            <Route path="/chat" element={<AiChat />} />
            <Route path="/settings" element={<SetupWizard />} />
          </Routes>
        </div>
      </main>

      {/* Chat Drawer (floating) */}
      {!isChatPage && (
        <ChatDrawer isOpen={chatDrawerOpen} onClose={() => setChatDrawerOpen(false)} />
      )}
    </div>
  );
}
