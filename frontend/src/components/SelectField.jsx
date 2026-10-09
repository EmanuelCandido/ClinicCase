import { useId, useRef, useState } from 'react';
import Icon from './Icon.jsx';

export default function SelectField({
  ariaLabel,
  autoFocus = false,
  className = '',
  disabled = false,
  emptyMessage = 'Nenhuma opção encontrada.',
  hideLabel = false,
  label,
  name,
  onChange,
  options = [],
  required = false,
  searchable = false,
  searchPlaceholder = 'Pesquisar...',
  value,
  valueLabel,
}) {
  const generatedId = useId();
  const triggerRef = useRef(null);
  const optionRefs = useRef([]);
  const searchInputRef = useRef(null);
  const normalizedOptions = options.map(normalizeOption);
  const fallbackOptions = value == null || value === ''
    ? []
    : [{ label: valueLabel || String(value), value: String(value) }];
  const availableOptions = normalizedOptions.length > 0 ? normalizedOptions : fallbackOptions;
  const controlled = value !== undefined;
  const [internalValue, setInternalValue] = useState(
    value == null ? availableOptions[0]?.value ?? '' : String(value),
  );
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const currentValue = controlled ? String(value ?? '') : internalValue;
  const selectedIndex = availableOptions.findIndex((option) => option.value === currentValue);
  const selectedOption = selectedIndex >= 0
    ? availableOptions[selectedIndex]
    : { label: valueLabel || currentValue, value: currentValue };
  const selectedValue = selectedOption.value;
  const normalizedQuery = normalizeOptionText(searchQuery.trim());
  const filteredOptions = searchable && normalizedQuery
    ? availableOptions.filter((option) => normalizeOptionText(option.label).includes(normalizedQuery))
    : availableOptions;
  const [activeIndex, setActiveIndex] = useState(selectedIndex >= 0 ? selectedIndex : 0);
  const accessibleLabel = ariaLabel || label || name || 'Selecionar opção';
  const labelId = `${generatedId}-label`;
  const listboxId = `${generatedId}-listbox`;
  const valueId = `${generatedId}-value`;

  const focusOption = (index) => {
    if (filteredOptions.length === 0) return;
    const nextIndex = (index + filteredOptions.length) % filteredOptions.length;
    setActiveIndex(nextIndex);
    optionRefs.current[nextIndex]?.focus();
  };

  const openMenu = (index = selectedIndex >= 0 ? selectedIndex : 0, focusSearch = searchable) => {
    setSearchQuery('');
    setActiveIndex(index);
    setOpen(true);
    globalThis.requestAnimationFrame(() => {
      if (focusSearch) searchInputRef.current?.focus();
      else focusOption(index);
    });
  };

  const closeMenu = () => {
    setOpen(false);
    setSearchQuery('');
    triggerRef.current?.focus();
  };

  const selectOption = (option) => {
    if (option.disabled) return;
    if (!controlled) setInternalValue(option.value);
    onChange?.({
      currentTarget: { name, value: option.value },
      target: { name, value: option.value },
    });
    closeMenu();
  };

  const handleTriggerKeyDown = (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const index = selectedIndex >= 0
        ? selectedIndex + (event.key === 'ArrowDown' ? 0 : -1)
        : event.key === 'ArrowDown' ? 0 : availableOptions.length - 1;
      openMenu(index, false);
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      openMenu(event.key === 'Home' ? 0 : availableOptions.length - 1, false);
    }
  };

  const handleOptionKeyDown = (event, index) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (searchable && event.key === 'ArrowUp' && index === 0) {
        searchInputRef.current?.focus();
      } else {
        focusOption(index + (event.key === 'ArrowDown' ? 1 : -1));
      }
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      focusOption(event.key === 'Home' ? 0 : filteredOptions.length - 1);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      selectOption(filteredOptions[index]);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      closeMenu();
    }
  };

  const handleSearchKeyDown = (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      focusOption(event.key === 'ArrowDown' ? 0 : filteredOptions.length - 1);
    } else if (event.key === 'Enter' && filteredOptions.length === 1) {
      event.preventDefault();
      selectOption(filteredOptions[0]);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      closeMenu();
    }
  };

  return (
    <div className={`field ${className}`.trim()}>
      <span className={`field__label ${hideLabel ? 'sr-only' : ''}`.trim()} id={labelId}>
        {label || accessibleLabel}
        {required && <span className="field__required">*</span>}
      </span>
      <div
        className={`select-field ${open ? 'select-field--open' : ''}`}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) {
            setOpen(false);
            setSearchQuery('');
          }
        }}
      >
        <select
          aria-hidden="true"
          className="select-field__native"
          disabled={disabled}
          name={name}
          onChange={() => {}}
          required={required}
          tabIndex={-1}
          value={selectedValue}
        >
          {!availableOptions.some((option) => option.value === '') && <option value="" />}
          {selectedIndex < 0 && selectedValue && (
            <option value={selectedValue}>{selectedOption.label}</option>
          )}
          {availableOptions.map((option) => (
            <option disabled={option.disabled} key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        <button
          aria-controls={listboxId}
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-labelledby={`${labelId} ${valueId}`}
          aria-required={required}
          autoFocus={autoFocus}
          className="select-field__trigger"
          disabled={disabled}
          onClick={() => (open ? closeMenu() : openMenu())}
          onKeyDown={handleTriggerKeyDown}
          ref={triggerRef}
          role="combobox"
          type="button"
        >
          <span id={valueId}>{selectedOption.label}</span>
          <Icon className="select-field__chevron" name="chevronDown" size={24} />
        </button>

        <div
          aria-hidden={!open}
          className="select-field__popover"
        >
          {searchable && (
            <label className="select-field__search">
              <Icon name="search" size={16} />
              <span className="sr-only">Pesquisar {accessibleLabel.toLowerCase()}</span>
              <input
                autoCapitalize="none"
                autoComplete="off"
                autoCorrect="off"
                onChange={(event) => {
                  setSearchQuery(event.target.value);
                  setActiveIndex(0);
                }}
                onKeyDown={handleSearchKeyDown}
                placeholder={searchPlaceholder}
                ref={searchInputRef}
                spellCheck={false}
                type="search"
                value={searchQuery}
              />
            </label>
          )}
          <div
            aria-labelledby={labelId}
            className="select-field__options"
            id={listboxId}
            role="listbox"
          >
            {filteredOptions.map((option, index) => {
              const selected = option.value === selectedValue;
              return (
                <button
                  aria-disabled={option.disabled || undefined}
                  aria-selected={selected}
                  className={`select-field__option ${selected ? 'select-field__option--selected' : ''}`}
                  disabled={option.disabled}
                  key={option.value}
                  onClick={() => selectOption(option)}
                  onKeyDown={(event) => handleOptionKeyDown(event, index)}
                  ref={(element) => { optionRefs.current[index] = element; }}
                  role="option"
                  tabIndex={open && index === activeIndex ? 0 : -1}
                  type="button"
                >
                  <span>{option.label}</span>
                  {selected && <Icon name="check" size={16} />}
                </button>
              );
            })}
            {filteredOptions.length === 0 && (
              <p className="select-field__empty" role="status">{emptyMessage}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function normalizeOption(option) {
  if (option && typeof option === 'object') {
    const value = String(option.value ?? '');
    return {
      disabled: Boolean(option.disabled),
      label: String(option.label ?? value),
      value,
    };
  }
  return { disabled: false, label: String(option ?? ''), value: String(option ?? '') };
}

function normalizeOptionText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR');
}
