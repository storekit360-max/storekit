import React, { useState, useRef } from 'react';
import API from '../utils/api';
import toast from 'react-hot-toast';

export default function ImageUpload({ value, onChange, label = 'Image', hint = '', multiple = false }) {
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef();

  const handleFiles = async (files) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      if (multiple) {
        const formData = new FormData();
        Array.from(files).forEach(f => formData.append('images', f));
        const { data } = await API.post('/upload/multiple', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
        onChange([...(value || []), ...data.urls.map(u => u.url)]);
        toast.success(`${data.urls.length} image(s) uploaded!`);
      } else {
        const formData = new FormData();
        formData.append('image', files[0]);
        const { data } = await API.post('/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
        onChange(data.url);
        toast.success('Image uploaded!');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Upload failed. Max 5MB, images only.');
    } finally { setUploading(false); }
  };

  const handleDrop = (e) => {
    e.preventDefault(); setDragOver(false);
    handleFiles(e.dataTransfer.files);
  };

  const removeImage = (idx) => {
    if (multiple) onChange(value.filter((_, i) => i !== idx));
    else onChange('');
  };

  return (
    <div>
      {label && <label className="form-label">{label}</label>}
      {hint && <p className="text-xs text-gray-400 mb-2">{hint}</p>}

      {/* Upload area */}
      <div
        onDrop={handleDrop}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onClick={() => !uploading && inputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${dragOver ? 'scale-[1.01]' : ''} ${uploading ? 'cursor-not-allowed opacity-60' : 'hover:opacity-90'}`}
        style={{ borderColor: dragOver ? 'var(--color-primary)' : '#e2e8f0', background: dragOver ? 'var(--color-primary)08' : '#f8fafc' }}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/jpg,image/png,image/gif,image/webp,image/svg+xml"
          multiple={multiple}
          className="hidden"
          onChange={e => handleFiles(e.target.files)}
        />
        {uploading ? (
          <div className="flex flex-col items-center gap-2">
            <svg className="w-8 h-8 animate-spin" style={{ color: 'var(--color-primary)' }} fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
            <p className="text-sm text-gray-500">Uploading...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'var(--color-primary)15' }}>
              <svg className="w-5 h-5" style={{ color: 'var(--color-primary)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-700">Click to upload or drag & drop</p>
              <p className="text-xs text-gray-400 mt-0.5">JPG, PNG, GIF, WebP, SVG up to 5MB</p>
            </div>
          </div>
        )}
      </div>

      {/* URL input alternative */}
      <div className="mt-2 flex items-center gap-2">
        <div className="flex-1 h-px bg-gray-200"/>
        <span className="text-xs text-gray-400">or enter URL</span>
        <div className="flex-1 h-px bg-gray-200"/>
      </div>
      <input
        type="url"
        placeholder="https://example.com/image.jpg"
        value={multiple ? '' : (value || '')}
        onChange={e => !multiple && onChange(e.target.value)}
        className="form-input mt-2 text-sm"
      />

      {/* Preview - single */}
      {!multiple && value && (
        <div className="relative mt-3 inline-block">
          <img src={value} alt="Preview" className="w-24 h-24 object-cover rounded-xl border border-gray-200 shadow-sm" />
          <button type="button" onClick={() => removeImage()} className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center text-xs hover:bg-red-600 shadow">✕</button>
        </div>
      )}

      {/* Preview - multiple */}
      {multiple && value?.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-3">
          {value.map((url, idx) => (
            <div key={idx} className="relative">
              <img src={url} alt="" className="w-20 h-20 object-cover rounded-xl border border-gray-200 shadow-sm" />
              <button type="button" onClick={() => removeImage(idx)} className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-xs hover:bg-red-600 shadow">✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
