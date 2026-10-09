export default function CheckboxField({ checked, label, name, onChange }) {
  const controlledProps = checked !== undefined ? { checked } : {};

  return (
    <label className="checkbox-field">
      <input name={name} onChange={onChange} type="checkbox" {...controlledProps} />
      <span>{label}</span>
    </label>
  );
}
