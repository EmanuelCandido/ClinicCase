import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

export default function useRequestedFieldFocus(formRef) {
  const location = useLocation();
  const requestedField = location.state?.focusField;

  useEffect(() => {
    if (!requestedField) return undefined;
    const frameId = globalThis.requestAnimationFrame(() => {
      const namedControl = formRef.current?.elements?.namedItem(requestedField);
      const control = namedControl instanceof HTMLElement ? namedControl : null;
      const focusTarget = control?.classList.contains('select-field__native')
        ? control.closest('.select-field')?.querySelector('.select-field__trigger')
        : control;
      focusTarget?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      focusTarget?.focus({ preventScroll: true });
    });
    return () => globalThis.cancelAnimationFrame(frameId);
  }, [formRef, location.key, requestedField]);
}
