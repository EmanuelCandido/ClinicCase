import { useState } from 'react';
import Icon from './Icon.jsx';

export default function TipCard({ children = 'Quanto mais contexto você fornecer nas etapas, mais rico e coerente será o caso clínico gerado pela IA.' }) {
  const [visible, setVisible] = useState(true);

  if (!visible) return null;

  return (
    <aside className="tip-card">
      <div className="tip-card__header">
        <span className="tip-card__icon">
          <Icon name="lamp" />
        </span>
        <strong>Dica</strong>
      </div>
      <button aria-label="Fechar dica" className="tip-card__close" onClick={() => setVisible(false)} type="button">
        <Icon name="close" size={24} />
      </button>
      <p>{children}</p>
    </aside>
  );
}
