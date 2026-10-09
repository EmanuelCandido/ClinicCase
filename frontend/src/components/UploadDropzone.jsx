import Icon from './Icon.jsx';
import { formatFileSize, normalizeSelectedFile, selectedFileKey } from '../services/fileSelection.js';

export default function UploadDropzone({
  accept,
  description,
  disabled = false,
  files = [],
  multiple = false,
  name,
  onChange,
  onRemove,
  title,
}) {
  return (
    <div className="upload-field">
      <label aria-disabled={disabled || undefined} className={`upload-dropzone${disabled ? ' upload-dropzone--disabled' : ''}`}>
        <input accept={accept} disabled={disabled} multiple={multiple} name={name} onChange={onChange} type="file" />
        <span className="upload-dropzone__content">
          <Icon name="upload" size={24} />
          <span className="upload-dropzone__copy">
            <strong>{title}</strong>
            <small>{description}</small>
          </span>
          {disabled && <span className="upload-dropzone__badge">Indisponível no momento</span>}
          {files.length > 0 && <span className="sr-only" aria-live="polite">{files.length} arquivo(s) selecionado(s).</span>}
        </span>
      </label>

      {files.length > 0 && (
        <ul aria-label={`Arquivos selecionados em ${title}`} className="upload-file-list">
          {files.map((file, index) => {
            const selectedFile = normalizeSelectedFile(file);
            const sizeLabel = formatFileSize(selectedFile.size);
            return (
              <li key={`${selectedFileKey(selectedFile)}-${index}`}>
                <div className="upload-file-list__details">
                  <Icon name="fileAttachment" size={20} />
                  <span>
                    <strong title={selectedFile.name}>{selectedFile.name}</strong>
                    {sizeLabel && <small>{sizeLabel}</small>}
                  </span>
                </div>
                <button
                  aria-label={`Remover arquivo ${selectedFile.name}`}
                  onClick={() => onRemove?.(index)}
                  title="Remover arquivo"
                  type="button"
                >
                  <Icon name="fileDelete" size={16} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
