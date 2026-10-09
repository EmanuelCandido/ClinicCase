export default function TextAreaField({
  disabled = false,
  label,
  large = false,
  name,
  onChange,
  placeholder,
  required = false,
  value,
}) {
  const controlledProps = value !== undefined ? { value } : {};

  return (
    <label className="field field--full">
      <span className="field__label">
        {label}
        {required && <span className="field__required">*</span>}
      </span>
      <textarea
        autoCapitalize="none"
        autoComplete="off"
        autoCorrect="off"
        className={`field__control field__control--textarea ${large ? 'field__control--textarea-large' : ''}`}
        disabled={disabled}
        name={name}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        spellCheck={false}
        {...controlledProps}
      />
    </label>
  );
}
