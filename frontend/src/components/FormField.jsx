export default function FormField({
  autoComplete = 'off',
  disabled = false,
  full = false,
  label,
  max,
  minLength,
  min,
  name,
  onChange,
  placeholder,
  required = false,
  type = 'text',
  value,
}) {
  const controlledProps = value !== undefined ? { value } : {};

  return (
    <label className={`field ${full ? 'field--full' : ''}`}>
      <span className="field__label">
        {label}
        {required && <span className="field__required">*</span>}
      </span>
      <input
        autoCapitalize="none"
        autoComplete={autoComplete}
        autoCorrect="off"
        className="field__control"
        disabled={disabled}
        max={max}
        min={min}
        minLength={minLength}
        name={name}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        spellCheck={false}
        type={type}
        {...controlledProps}
      />
    </label>
  );
}
