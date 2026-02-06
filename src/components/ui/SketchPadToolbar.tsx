'use client';

import { type Tool, COLORS } from '@/lib/sketch-types';

interface SketchPadToolbarProps {
  activeTool: Tool;
  activeColor: string;
  canUndo: boolean;
  canRedo: boolean;
  onToolChange: (tool: Tool) => void;
  onColorChange: (color: string) => void;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
  isDarkMode: boolean;
}

const tools: { tool: Tool; label: string; icon: React.ReactNode }[] = [
  {
    tool: 'pen',
    label: 'Pen',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
        <path d="m15 5 4 4" />
      </svg>
    ),
  },
  {
    tool: 'eraser',
    label: 'Eraser',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21" />
        <path d="M22 21H7" />
        <path d="m5 11 9 9" />
      </svg>
    ),
  },
  {
    tool: 'text',
    label: 'Text',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="4 7 4 4 20 4 20 7" />
        <line x1="9" y1="20" x2="15" y2="20" />
        <line x1="12" y1="4" x2="12" y2="20" />
      </svg>
    ),
  },
  {
    tool: 'move',
    label: 'Move',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 9l-3 3 3 3" />
        <path d="M9 5l3-3 3 3" />
        <path d="M15 19l-3 3-3-3" />
        <path d="M19 9l3 3-3 3" />
        <line x1="2" y1="12" x2="22" y2="12" />
        <line x1="12" y1="2" x2="12" y2="22" />
      </svg>
    ),
  },
  {
    tool: 'pan',
    label: 'Pan',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2" />
        <path d="M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2" />
        <path d="M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8" />
        <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
      </svg>
    ),
  },
];

export default function SketchPadToolbar({
  activeTool,
  activeColor,
  canUndo,
  canRedo,
  onToolChange,
  onColorChange,
  onUndo,
  onRedo,
  onClear,
  isDarkMode,
}: SketchPadToolbarProps) {
  const handleClear = () => {
    if (window.confirm('Clear the entire canvas? This action will be added to undo history.')) {
      onClear();
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-1 p-2 select-none">
      {/* Tool buttons */}
      <div className="flex items-center gap-0.5 mr-2">
        {tools.map(({ tool, label, icon }) => (
          <button
            key={tool}
            title={label}
            onClick={() => onToolChange(tool)}
            className={`p-2.5 rounded cursor-pointer transition-colors ${
              activeTool === tool
                ? isDarkMode
                  ? 'bg-blue-600 text-white'
                  : 'bg-blue-500 text-white'
                : isDarkMode
                  ? 'text-gray-300 hover:bg-gray-700'
                  : 'text-gray-600 hover:bg-gray-200'
            }`}
          >
            {icon}
          </button>
        ))}
      </div>

      {/* Divider */}
      <div className={`w-px h-6 mx-1 ${isDarkMode ? 'bg-gray-600' : 'bg-gray-300'}`} />

      {/* Color buttons */}
      <div className="flex items-center gap-1 mr-2">
        {COLORS.map(({ name, value }) => {
          const displayColor = isDarkMode && value === '#000000' ? '#ffffff' : value;
          return (
            <button
              key={name}
              title={name}
              onClick={() => onColorChange(value)}
              className={`w-7 h-7 rounded-full border-2 cursor-pointer transition-transform ${
                activeColor === value ? 'scale-125 border-blue-500' : isDarkMode ? 'border-gray-600' : 'border-gray-300'
              }`}
              style={{ backgroundColor: displayColor }}
            />
          );
        })}
      </div>

      {/* Divider */}
      <div className={`w-px h-6 mx-1 ${isDarkMode ? 'bg-gray-600' : 'bg-gray-300'}`} />

      {/* Undo/Redo */}
      <div className="flex items-center gap-0.5 mr-2">
        <button
          title="Undo (Ctrl+Z)"
          onClick={onUndo}
          disabled={!canUndo}
          className={`p-2.5 rounded transition-colors ${
            canUndo
              ? isDarkMode
                ? 'text-gray-300 hover:bg-gray-700 cursor-pointer'
                : 'text-gray-600 hover:bg-gray-200 cursor-pointer'
              : isDarkMode
                ? 'text-gray-600 cursor-not-allowed'
                : 'text-gray-300 cursor-not-allowed'
          }`}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 7v6h6" />
            <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
          </svg>
        </button>
        <button
          title="Redo (Ctrl+Shift+Z)"
          onClick={onRedo}
          disabled={!canRedo}
          className={`p-2.5 rounded transition-colors ${
            canRedo
              ? isDarkMode
                ? 'text-gray-300 hover:bg-gray-700 cursor-pointer'
                : 'text-gray-600 hover:bg-gray-200 cursor-pointer'
              : isDarkMode
                ? 'text-gray-600 cursor-not-allowed'
                : 'text-gray-300 cursor-not-allowed'
          }`}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 7v6h-6" />
            <path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13" />
          </svg>
        </button>
      </div>

      {/* Clear */}
      <button
        title="Clear canvas"
        onClick={handleClear}
        className={`p-2.5 rounded cursor-pointer transition-colors ${
          isDarkMode
            ? 'text-red-400 hover:bg-gray-700'
            : 'text-red-500 hover:bg-gray-200'
        }`}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 6h18" />
          <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
          <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
          <line x1="10" y1="11" x2="10" y2="17" />
          <line x1="14" y1="11" x2="14" y2="17" />
        </svg>
      </button>
    </div>
  );
}
