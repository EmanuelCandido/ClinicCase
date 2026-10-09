import figmaAvatar from '../assets/figma/profile-figma.jpeg';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import Icon from './Icon.jsx';

export default function Topbar({ breadcrumbItems, current = 'Parâmetros' }) {
  const { profile } = useAuth();
  const items = breadcrumbItems || [
    { label: 'Criar Caso', muted: true },
    { label: current },
  ];

  return (
    <header className="topbar">
      <h1 className="topbar__breadcrumb">
        {items.map((item, index) => (
          <span className="topbar__breadcrumb-segment" key={`${item.label}-${index}`}>
            {index > 0 && <span aria-hidden="true" className="topbar__breadcrumb-separator">&gt;</span>}
            {item.to ? (
              <Link className="topbar__breadcrumb-link" to={item.to}>{item.label}</Link>
            ) : (
              <span
                aria-current={index === items.length - 1 ? 'page' : undefined}
                className={`topbar__breadcrumb-item${item.muted ? ' topbar__breadcrumb-item--muted' : ''}`}
              >
                {item.label}
              </span>
            )}
          </span>
        ))}
      </h1>

      <Link aria-label="Abrir configurações do perfil" className="profile" to="/configuracoes">
        <img alt="" className="profile__avatar" src={profile.avatar || figmaAvatar} />
        <span className="profile__copy">
          <strong>{profile.name}</strong>
          <small>{profile.course}</small>
        </span>
        <Icon name="chevronDown" size={10} />
      </Link>
    </header>
  );
}
