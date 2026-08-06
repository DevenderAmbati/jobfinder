import { useEffect, useRef, useState, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';

const links = [
  { to: '/jobs', label: 'Jobs' },
  { to: '/companies', label: 'Companies' },
  { to: '/providers/health', label: 'Providers' },
  { to: '/logs', label: 'Logs' },
  { to: '/rules', label: 'Rules' },
  { to: '/applications', label: 'Applications' },
  { to: '/settings', label: 'Settings' },
  { to: '/analytics', label: 'Analytics' },
  { to: '/dev', label: 'Dev' },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    setMenuOpen(false);
    mainRef.current?.scrollTo(0, 0);
  }, [location.pathname]);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  return (
    <div className={['app-shell', menuOpen ? 'is-menu-open' : ''].join(' ')}>
      <header className="app-topbar">
        <div className="app-brand">
          <p className="app-brand__mark">Jobfinder</p>
          <p className="app-brand__tag">Personal job intelligence</p>
        </div>
        <button
          type="button"
          className="app-menu-toggle"
          aria-expanded={menuOpen}
          aria-controls="app-nav"
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span className="app-menu-toggle__bars" aria-hidden="true" />
        </button>
      </header>

      <button
        type="button"
        className="app-nav-backdrop"
        aria-label="Close menu"
        tabIndex={menuOpen ? 0 : -1}
        onClick={() => setMenuOpen(false)}
      />

      <aside className="app-sidebar" id="app-nav">
        <div className="app-brand app-brand--sidebar">
          <p className="app-brand__mark">Jobfinder</p>
          <p className="app-brand__tag">Personal job intelligence</p>
        </div>
        <nav className="app-nav" aria-label="Primary">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) =>
                ['app-nav__link', isActive ? 'is-active' : ''].join(' ')
              }
            >
              {link.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <main className="app-main" ref={mainRef}>
        <div className="app-main__inner">{children}</div>
      </main>
    </div>
  );
}
