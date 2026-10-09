import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useCaseDraft } from '../context/CaseDraftContext.jsx';
import { isEditingExistingCase, navigationSections } from '../services/navigationConfig.js';
import Icon from './Icon.jsx';

let lastSidebarActivePath = null;

export default function Sidebar() {
  const { logout } = useAuth();
  const { pathname } = useLocation();
  const { savedCase } = useCaseDraft();
  const editingCase = isEditingExistingCase(savedCase);
  const activeNavigationPath = findActiveNavigationPath(pathname, editingCase);
  // No celular o menu vira uma gaveta aberta pelo botão da barra superior.
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [menuOpen]);
  const indicatorRef = useRef(null);
  const initialActivePathRef = useRef(lastSidebarActivePath);
  const navRef = useRef(null);
  const renderedActivePathRef = useRef(activeNavigationPath);

  useLayoutEffect(() => {
    const indicator = indicatorRef.current;
    const nav = navRef.current;
    const previousPath = renderedActivePathRef.current === activeNavigationPath
      ? initialActivePathRef.current
      : renderedActivePathRef.current;
    renderedActivePathRef.current = activeNavigationPath;
    lastSidebarActivePath = activeNavigationPath;

    if (!indicator || !nav || !activeNavigationPath) {
      nav?.classList.remove('sidebar__nav--indicator-ready');
      return undefined;
    }

    const links = Array.from(nav.querySelectorAll('[data-navigation-path]'));
    const activeLink = links.find((link) => link.dataset.navigationPath === activeNavigationPath);
    if (!activeLink) return undefined;

    const previousLink = links.find((link) => link.dataset.navigationPath === previousPath);
    const navTop = nav.getBoundingClientRect().top;
    const activeTop = activeLink.getBoundingClientRect().top - navTop;
    const previousTop = previousLink?.getBoundingClientRect().top - navTop;
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const shouldAnimate = previousLink && previousPath !== activeNavigationPath && !reduceMotion;
    let cleanupFrame;

    indicator.style.transition = 'none';
    indicator.style.transform = `translate3d(0, ${shouldAnimate ? previousTop : activeTop}px, 0)`;
    nav.classList.add('sidebar__nav--indicator-ready');

    if (shouldAnimate) {
      indicator.getBoundingClientRect();
      indicator.style.removeProperty('transition');
      indicator.style.transform = `translate3d(0, ${activeTop}px, 0)`;
    } else {
      indicator.style.transform = `translate3d(0, ${activeTop}px, 0)`;
      cleanupFrame = window.requestAnimationFrame(() => indicator.style.removeProperty('transition'));
    }

    return () => window.cancelAnimationFrame(cleanupFrame);
  }, [activeNavigationPath]);

  return (
    <aside className={`sidebar ${menuOpen ? 'sidebar--open' : ''}`}>
      <div className="sidebar__top">
        <div className="sidebar__header">
          <div className="sidebar__logo">
            <span className="sidebar__logo-full">Clinic<span>Case</span></span>
            <span aria-hidden="true" className="sidebar__logo-short">CC</span>
          </div>
          <button
            aria-controls="sidebar-drawer"
            aria-expanded={menuOpen}
            aria-label={menuOpen ? 'Fechar menu' : 'Abrir menu'}
            className="sidebar__menu-toggle"
            onClick={() => setMenuOpen((open) => !open)}
            type="button"
          >
            <span aria-hidden="true" />
            <span aria-hidden="true" />
            <span aria-hidden="true" />
          </button>
        </div>
        <nav className="sidebar__nav" id="sidebar-drawer" aria-label="Navegação principal" ref={navRef}>
          <span aria-hidden="true" className="sidebar__active-indicator" ref={indicatorRef} />
          {navigationSections.map((section) => (
            <div className="sidebar__section" key={section.title}>
              <span className="sidebar__section-title">{section.title}</span>
              <div className="sidebar__items">
                {section.items.map((item) => {
                  if (!item.path) {
                    return (
                      <span aria-disabled="true" className="sidebar__link sidebar__link--disabled" key={item.label}>
                        <Icon name={item.icon} />
                        <span>{item.label}</span>
                      </span>
                    );
                  }

                  const active = isNavigationItemActive(item.path, pathname, editingCase);

                  return (
                    <NavLink
                      aria-current={active ? 'page' : undefined}
                      className={`sidebar__link ${active ? 'sidebar__link--active' : ''}`}
                      data-navigation-path={item.path}
                      end={item.path === '/dashboard'}
                      key={item.label}
                      to={item.path}
                    >
                      <Icon name={item.icon} />
                      <span>{item.label}</span>
                    </NavLink>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </div>

      <button className="sidebar__logout" onClick={logout} type="button">
        <Icon name="logout" />
        <span>Sair</span>
      </button>
    </aside>
  );
}

function findActiveNavigationPath(pathname, editingCase) {
  return navigationSections
    .flatMap((section) => section.items)
    .find((item) => item.path && isNavigationItemActive(item.path, pathname, editingCase))
    ?.path || null;
}

// Revisão e perguntas de um caso aberto em "Meus casos" ficam sob essa seção.
const EDITABLE_CASE_PATHS = ['/criar-caso/revisao', '/criar-caso/perguntas'];

function isNavigationItemActive(itemPath, pathname, editingCase = false) {
  const editingExistingCase = editingCase && EDITABLE_CASE_PATHS.includes(pathname);
  if (itemPath === '/dashboard') return pathname === '/dashboard';
  if (itemPath === '/criar-caso/parametros') {
    return pathname.startsWith('/criar-caso/') && !editingExistingCase;
  }
  if (itemPath === '/meus-casos' && editingExistingCase) return true;
  if (itemPath === '/turmas') {
    return pathname.startsWith('/turmas')
      || pathname.startsWith('/alunos/')
      || /^\/casos\/[^/]+\/correcoes/.test(pathname);
  }

  return pathname === itemPath || pathname.startsWith(`${itemPath}/`);
}
