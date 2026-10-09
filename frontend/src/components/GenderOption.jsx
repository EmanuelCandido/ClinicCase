import Icon from './Icon.jsx';

export default function GenderOption({ disabled = false, icon, label, selected = false, onSelect, tone = 'default' }) {
  const displayedIcon = selected ? `${icon}Selected` : icon;

  return (
    <button
      aria-pressed={selected}
      className={`gender-option gender-option--${tone} ${selected ? 'gender-option--selected' : ''}`}
      disabled={disabled}
      onClick={onSelect}
      type="button"
    >
      <Icon name={displayedIcon} size={20} />
      <span>{label}</span>
    </button>
  );
}
