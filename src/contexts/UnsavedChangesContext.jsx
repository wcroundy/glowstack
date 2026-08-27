import React, { createContext, useContext, useCallback, useRef, useEffect } from 'react';

const UnsavedChangesContext = createContext(null);

// Lets any page (e.g. the Create Content wizard) flag that it has
// unsaved changes, so the sidebar and the browser tab can warn before
// the user navigates away and loses their progress.
export function UnsavedChangesProvider({ children }) {
  const dirtyRef = useRef(false);

  const setDirty = useCallback((value) => {
    dirtyRef.current = value;
  }, []);

  // Returns true if it's safe to navigate (either nothing unsaved, or the
  // user confirmed they want to leave anyway).
  const confirmLeave = useCallback(() => {
    if (!dirtyRef.current) return true;
    return window.confirm("You have unsaved changes that haven't been saved as a draft. Leave anyway?");
  }, []);

  useEffect(() => {
    const handler = (e) => {
      if (dirtyRef.current) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  return (
    <UnsavedChangesContext.Provider value={{ setDirty, confirmLeave }}>
      {children}
    </UnsavedChangesContext.Provider>
  );
}

export function useUnsavedChanges() {
  const ctx = useContext(UnsavedChangesContext);
  if (!ctx) throw new Error('useUnsavedChanges must be used within UnsavedChangesProvider');
  return ctx;
}
