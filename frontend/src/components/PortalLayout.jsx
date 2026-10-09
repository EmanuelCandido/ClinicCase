import figmaAvatar from '../assets/figma/profile-figma.jpeg';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import Icon from './Icon.jsx';
import Sidebar from './Sidebar.jsx';

export default function PortalLayout({ actions, breadcrumb, children, subtitle, title }) {
  const { profile } = useAuth();
  const strongTitle = title === 'Desempenho' || title === 'Configurações';

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="app-main">
        <header className={`portal-topbar ${breadcrumb ? 'portal-topbar--breadcrumb' : ''} ${strongTitle ? 'portal-topbar--strong' : ''}`}>
          <div className="portal-topbar__copy">
            {breadcrumb ? (
              <h1 className="portal-topbar__breadcrumb">{breadcrumb}</h1>
            ) : (
              <>
                <h1>{title}</h1>
                {subtitle && <p>{subtitle}</p>}
              </>
            )}
          </div>

          <div className="portal-topbar__right">
            {actions}
            <Link className="profile" to="/configuracoes" aria-label="Perfil do professor">
              <img alt="" className="profile__avatar" src={profile.avatar || figmaAvatar} />
              <span className="profile__copy">
                <strong>{profile.name}</strong>
                <small>{profile.course}</small>
              </span>
              <Icon name="chevronDown" size={10} />
            </Link>
          </div>
        </header>
        {children}
      </main>
    </div>
  );
}
