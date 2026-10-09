import Sidebar from './Sidebar.jsx';
import Topbar from './Topbar.jsx';

export default function AppLayout({ breadcrumbCurrent = 'Parâmetros', breadcrumbItems, children }) {
  return (
    <div className="app-shell">
      <Sidebar />
      <main className="app-main">
        <Topbar breadcrumbItems={breadcrumbItems} current={breadcrumbCurrent} />
        {children}
      </main>
    </div>
  );
}
