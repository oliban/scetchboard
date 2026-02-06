'use client';

import { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import {
  type Tool,
  type Point,
  type Stroke,
  type TextElement,
  type SketchState,
  COLORS,
  DEFAULT_PEN_WIDTH,
  DEFAULT_FONT_SIZE,
  ERASER_PROXIMITY,
  createEmptyState,
  generateId,
} from '@/lib/sketch-types';
import SketchPadToolbar from './SketchPadToolbar';

interface SketchPadProps {
  sketchData: string | null;
  onChange: (data: string, imageDataUrl: string) => void;
  isDarkMode: boolean;
}

const MIN_CANVAS_WIDTH = 200;
const MIN_CANVAS_HEIGHT = 150;
const MAX_HISTORY = 50;

export default function SketchPad({ sketchData, onChange, isDarkMode }: SketchPadProps) {
  // Canvas refs
  const committedCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Drawing state (refs to avoid re-renders during pointer events)
  const isDrawingRef = useRef(false);
  const currentStrokeRef = useRef<Point[]>([]);
  const activeToolRef = useRef<Tool>('pen');
  const activeColorRef = useRef<string>('#000000');
  const panStartRef = useRef<Point | null>(null);
  const panOffsetRef = useRef<Point>({ x: 0, y: 0 });
  const movingTextRef = useRef<{ id: string; offsetX: number; offsetY: number } | null>(null);
  const stateRef = useRef<SketchState>(createEmptyState(600, 400));
  const historyRef = useRef<SketchState[]>([createEmptyState(600, 400)]);
  const historyIndexRef = useRef(0);

  // React state for toolbar UI
  const [activeTool, setActiveTool] = useState<Tool>('pen');
  const [activeColor, setActiveColor] = useState('#000000');
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ width: 600, height: 400 });

  // Text input state
  const [textInput, setTextInput] = useState<{
    visible: boolean;
    x: number;
    y: number;
    worldX: number;
    worldY: number;
    value: string;
  } | null>(null);
  const textInputRef = useRef<HTMLInputElement>(null);

  // Resize state
  const isResizingRef = useRef(false);
  const resizeStartRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const canvasSizeRef = useRef({ width: 600, height: 400 });

  // Ref to track if initial load is done
  const initialLoadDoneRef = useRef(false);

  // Coordinate helpers
  const screenToWorld = useCallback((screenX: number, screenY: number): Point => {
    const dpr = window.devicePixelRatio || 1;
    const canvas = committedCanvasRef.current;
    if (!canvas) return { x: screenX, y: screenY };
    const rect = canvas.getBoundingClientRect();
    return {
      x: (screenX - rect.left) / 1 - panOffsetRef.current.x,
      y: (screenY - rect.top) / 1 - panOffsetRef.current.y,
    };
  }, []);

  const worldToScreen = useCallback((worldX: number, worldY: number): Point => {
    return {
      x: worldX + panOffsetRef.current.x,
      y: worldY + panOffsetRef.current.y,
    };
  }, []);

  // Update undo/redo button state
  const updateUndoRedoState = useCallback(() => {
    setCanUndo(historyIndexRef.current > 0);
    setCanRedo(historyIndexRef.current < historyRef.current.length - 1);
  }, []);

  // Push state to history
  const pushHistory = useCallback((state: SketchState) => {
    // Truncate forward history
    historyRef.current = historyRef.current.slice(0, historyIndexRef.current + 1);
    // Deep clone the state
    const snapshot = JSON.parse(JSON.stringify(state)) as SketchState;
    historyRef.current.push(snapshot);
    // Cap history size
    if (historyRef.current.length > MAX_HISTORY) {
      historyRef.current.shift();
    } else {
      historyIndexRef.current++;
    }
    updateUndoRedoState();
  }, [updateUndoRedoState]);

  // Render committed canvas (all strokes and text)
  const renderCommitted = useCallback(() => {
    const canvas = committedCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const state = stateRef.current;

    // Clear
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Fill background
    ctx.fillStyle = isDarkMode ? '#1f2937' : '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Apply DPR + pan
    ctx.setTransform(dpr, 0, 0, dpr, panOffsetRef.current.x * dpr, panOffsetRef.current.y * dpr);

    // Draw strokes
    for (const stroke of state.strokes) {
      if (stroke.points.length < 2) continue;
      ctx.beginPath();
      ctx.strokeStyle = getDisplayColor(stroke.color, isDarkMode);
      ctx.lineWidth = stroke.width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      for (let i = 1; i < stroke.points.length; i++) {
        ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
      }
      ctx.stroke();
    }

    // Draw text elements
    for (const te of state.textElements) {
      ctx.font = `${te.fontSize}px sans-serif`;
      ctx.fillStyle = getDisplayColor(te.color, isDarkMode);
      ctx.textBaseline = 'top';
      ctx.fillText(te.text, te.position.x, te.position.y);
    }
  }, [isDarkMode]);

  // Clear overlay canvas
  const clearOverlay = useCallback(() => {
    const canvas = overlayCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }, []);

  // Draw active stroke on overlay
  const renderActiveStroke = useCallback((points: Point[], color: string) => {
    const canvas = overlayCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;

    clearOverlay();

    if (points.length < 2) return;

    ctx.setTransform(dpr, 0, 0, dpr, panOffsetRef.current.x * dpr, panOffsetRef.current.y * dpr);
    ctx.beginPath();
    ctx.strokeStyle = getDisplayColor(color, isDarkMode);
    ctx.lineWidth = DEFAULT_PEN_WIDTH;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.stroke();
  }, [isDarkMode, clearOverlay]);

  // Notify parent of changes
  const notifyChange = useCallback(() => {
    const state = stateRef.current;
    const json = JSON.stringify(state);

    // Export to PNG with white background
    const canvas = committedCanvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = state.canvasWidth;
    exportCanvas.height = state.canvasHeight;
    const ectx = exportCanvas.getContext('2d');
    if (!ectx) return;

    // White background for export
    ectx.fillStyle = '#ffffff';
    ectx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);

    // Draw strokes (no pan offset for export)
    for (const stroke of state.strokes) {
      if (stroke.points.length < 2) continue;
      ectx.beginPath();
      // For export: black stays black
      ectx.strokeStyle = stroke.color;
      ectx.lineWidth = stroke.width;
      ectx.lineCap = 'round';
      ectx.lineJoin = 'round';
      ectx.moveTo(stroke.points[0].x, stroke.points[0].y);
      for (let i = 1; i < stroke.points.length; i++) {
        ectx.lineTo(stroke.points[i].x, stroke.points[i].y);
      }
      ectx.stroke();
    }

    // Draw text
    for (const te of state.textElements) {
      ectx.font = `${te.fontSize}px sans-serif`;
      ectx.fillStyle = te.color;
      ectx.textBaseline = 'top';
      ectx.fillText(te.text, te.position.x, te.position.y);
    }

    const imageDataUrl = exportCanvas.toDataURL('image/png');
    onChange(json, imageDataUrl);
  }, [onChange]);

  // Setup canvas dimensions
  const setupCanvasSize = useCallback((width: number, height: number) => {
    const dpr = window.devicePixelRatio || 1;

    const committed = committedCanvasRef.current;
    const overlay = overlayCanvasRef.current;
    if (!committed || !overlay) return;

    committed.width = width * dpr;
    committed.height = height * dpr;
    committed.style.width = `${width}px`;
    committed.style.height = `${height}px`;

    overlay.width = width * dpr;
    overlay.height = height * dpr;
    overlay.style.width = `${width}px`;
    overlay.style.height = `${height}px`;

    stateRef.current.canvasWidth = width;
    stateRef.current.canvasHeight = height;

    renderCommitted();
  }, [renderCommitted]);

  // Load initial data
  useEffect(() => {
    if (initialLoadDoneRef.current) return;
    initialLoadDoneRef.current = true;

    if (sketchData) {
      try {
        const parsed = JSON.parse(sketchData) as SketchState;
        stateRef.current = parsed;
        historyRef.current = [JSON.parse(JSON.stringify(parsed))];
        historyIndexRef.current = 0;
        setCanvasSize({ width: parsed.canvasWidth, height: parsed.canvasHeight });
        updateUndoRedoState();
      } catch {
        // Invalid data, use defaults
      }
    }

    setupCanvasSize(stateRef.current.canvasWidth, stateRef.current.canvasHeight);
  }, [sketchData, setupCanvasSize, updateUndoRedoState]);

  // Re-render on dark mode change
  useEffect(() => {
    renderCommitted();
  }, [isDarkMode, renderCommitted]);

  // Re-setup canvas when size changes
  useEffect(() => {
    setupCanvasSize(canvasSize.width, canvasSize.height);
  }, [canvasSize, setupCanvasSize]);

  // Keyboard shortcuts — use inline logic to avoid stale closures
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'z' && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
        e.preventDefault();
        // Inline undo logic
        if (historyIndexRef.current <= 0) return;
        historyIndexRef.current--;
        const state = JSON.parse(JSON.stringify(historyRef.current[historyIndexRef.current])) as SketchState;
        stateRef.current = state;
        setCanvasSize({ width: state.canvasWidth, height: state.canvasHeight });
        renderCommitted();
        notifyChange();
        updateUndoRedoState();
      } else if (e.key === 'z' && (e.ctrlKey || e.metaKey) && e.shiftKey) {
        e.preventDefault();
        // Inline redo logic
        if (historyIndexRef.current >= historyRef.current.length - 1) return;
        historyIndexRef.current++;
        const state = JSON.parse(JSON.stringify(historyRef.current[historyIndexRef.current])) as SketchState;
        stateRef.current = state;
        setCanvasSize({ width: state.canvasWidth, height: state.canvasHeight });
        renderCommitted();
        notifyChange();
        updateUndoRedoState();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [renderCommitted, notifyChange, updateUndoRedoState]);

  // Helper: get display color (black -> white in dark mode)
  function getDisplayColor(color: string, dark: boolean): string {
    if (dark && color === '#000000') return '#ffffff';
    return color;
  }

  // Hit test: find text element at world coordinates
  function hitTestText(worldX: number, worldY: number): TextElement | null {
    const canvas = committedCanvasRef.current;
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // Check in reverse order (top-most first)
    const elements = stateRef.current.textElements;
    for (let i = elements.length - 1; i >= 0; i--) {
      const te = elements[i];
      ctx.font = `${te.fontSize}px sans-serif`;
      const metrics = ctx.measureText(te.text);
      const textWidth = metrics.width;
      const textHeight = te.fontSize;

      if (
        worldX >= te.position.x &&
        worldX <= te.position.x + textWidth &&
        worldY >= te.position.y &&
        worldY <= te.position.y + textHeight
      ) {
        return te;
      }
    }
    return null;
  }

  // Hit test: find stroke near world coordinates
  function hitTestStroke(worldX: number, worldY: number): Stroke | null {
    const strokes = stateRef.current.strokes;
    for (let i = strokes.length - 1; i >= 0; i--) {
      const stroke = strokes[i];
      for (const pt of stroke.points) {
        const dx = worldX - pt.x;
        const dy = worldY - pt.y;
        if (Math.sqrt(dx * dx + dy * dy) <= ERASER_PROXIMITY) {
          return stroke;
        }
      }
    }
    return null;
  }

  // -- Pointer event handlers --

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    // Ignore if text input is visible
    if (textInput?.visible) return;

    const canvas = overlayCanvasRef.current;
    if (!canvas) return;

    canvas.setPointerCapture(e.pointerId);

    const world = screenToWorld(e.clientX, e.clientY);
    const tool = activeToolRef.current;

    if (tool === 'pen') {
      isDrawingRef.current = true;
      currentStrokeRef.current = [world];
    } else if (tool === 'eraser') {
      // Check for stroke hit
      const hitStroke = hitTestStroke(world.x, world.y);
      if (hitStroke) {
        stateRef.current = {
          ...stateRef.current,
          strokes: stateRef.current.strokes.filter(s => s.id !== hitStroke.id),
        };
        pushHistory(stateRef.current);
        renderCommitted();
        notifyChange();
        return;
      }
      // Check for text hit
      const hitText = hitTestText(world.x, world.y);
      if (hitText) {
        stateRef.current = {
          ...stateRef.current,
          textElements: stateRef.current.textElements.filter(t => t.id !== hitText.id),
        };
        pushHistory(stateRef.current);
        renderCommitted();
        notifyChange();
        return;
      }
      // If no hit, enable continuous erasing while dragging
      isDrawingRef.current = true;
    } else if (tool === 'text') {
      // Show text input at click position
      const canvasEl = committedCanvasRef.current;
      if (!canvasEl) return;
      const rect = canvasEl.getBoundingClientRect();
      setTextInput({
        visible: true,
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        worldX: world.x,
        worldY: world.y,
        value: '',
      });
      setTimeout(() => textInputRef.current?.focus(), 0);
    } else if (tool === 'move') {
      const hitText = hitTestText(world.x, world.y);
      if (hitText) {
        isDrawingRef.current = true;
        movingTextRef.current = {
          id: hitText.id,
          offsetX: world.x - hitText.position.x,
          offsetY: world.y - hitText.position.y,
        };
      }
    } else if (tool === 'pan') {
      isDrawingRef.current = true;
      panStartRef.current = { x: e.clientX, y: e.clientY };
    }
  }, [textInput, screenToWorld, pushHistory, renderCommitted, notifyChange]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDrawingRef.current) return;

    const tool = activeToolRef.current;
    const world = screenToWorld(e.clientX, e.clientY);

    if (tool === 'pen') {
      currentStrokeRef.current.push(world);
      renderActiveStroke(currentStrokeRef.current, activeColorRef.current);
    } else if (tool === 'eraser') {
      // Continuous erasing while dragging
      const hitStroke = hitTestStroke(world.x, world.y);
      if (hitStroke) {
        stateRef.current = {
          ...stateRef.current,
          strokes: stateRef.current.strokes.filter(s => s.id !== hitStroke.id),
        };
        pushHistory(stateRef.current);
        renderCommitted();
        notifyChange();
      }
    } else if (tool === 'move' && movingTextRef.current) {
      const { id, offsetX, offsetY } = movingTextRef.current;
      stateRef.current = {
        ...stateRef.current,
        textElements: stateRef.current.textElements.map(te =>
          te.id === id
            ? { ...te, position: { x: world.x - offsetX, y: world.y - offsetY } }
            : te
        ),
      };
      renderCommitted();
    } else if (tool === 'pan' && panStartRef.current) {
      const dx = e.clientX - panStartRef.current.x;
      const dy = e.clientY - panStartRef.current.y;
      panOffsetRef.current = {
        x: panOffsetRef.current.x + dx,
        y: panOffsetRef.current.y + dy,
      };
      panStartRef.current = { x: e.clientX, y: e.clientY };
      renderCommitted();
    }
  }, [screenToWorld, renderActiveStroke, renderCommitted, pushHistory, notifyChange]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;

    const tool = activeToolRef.current;

    if (tool === 'pen') {
      const points = currentStrokeRef.current;
      if (points.length >= 2) {
        const newStroke: Stroke = {
          id: generateId(),
          points: [...points],
          color: activeColorRef.current,
          width: DEFAULT_PEN_WIDTH,
        };
        stateRef.current = {
          ...stateRef.current,
          strokes: [...stateRef.current.strokes, newStroke],
        };
        pushHistory(stateRef.current);
        renderCommitted();
        notifyChange();
      }
      currentStrokeRef.current = [];
      clearOverlay();
    } else if (tool === 'move' && movingTextRef.current) {
      pushHistory(stateRef.current);
      notifyChange();
      movingTextRef.current = null;
    } else if (tool === 'pan') {
      panStartRef.current = null;
    }
  }, [pushHistory, renderCommitted, notifyChange, clearOverlay]);

  // Text input handlers
  const commitTextInput = useCallback(() => {
    if (!textInput || !textInput.value.trim()) {
      setTextInput(null);
      return;
    }

    const newText: TextElement = {
      id: generateId(),
      text: textInput.value.trim(),
      position: { x: textInput.worldX, y: textInput.worldY },
      color: activeColorRef.current,
      fontSize: DEFAULT_FONT_SIZE,
    };

    stateRef.current = {
      ...stateRef.current,
      textElements: [...stateRef.current.textElements, newText],
    };
    pushHistory(stateRef.current);
    renderCommitted();
    notifyChange();
    setTextInput(null);
  }, [textInput, pushHistory, renderCommitted, notifyChange]);

  const handleTextKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitTextInput();
    } else if (e.key === 'Escape') {
      setTextInput(null);
    }
  }, [commitTextInput]);

  // Tool change handler
  const handleToolChange = useCallback((tool: Tool) => {
    setActiveTool(tool);
    activeToolRef.current = tool;
    // Close text input if switching away from text tool
    if (tool !== 'text' && textInput?.visible) {
      commitTextInput();
    }
  }, [textInput, commitTextInput]);

  // Color change handler
  const handleColorChange = useCallback((color: string) => {
    setActiveColor(color);
    activeColorRef.current = color;
  }, []);

  // Undo
  const handleUndo = useCallback(() => {
    if (historyIndexRef.current <= 0) return;
    historyIndexRef.current--;
    const state = JSON.parse(JSON.stringify(historyRef.current[historyIndexRef.current])) as SketchState;
    stateRef.current = state;
    setCanvasSize({ width: state.canvasWidth, height: state.canvasHeight });
    renderCommitted();
    notifyChange();
    updateUndoRedoState();
  }, [renderCommitted, notifyChange, updateUndoRedoState]);

  // Redo
  const handleRedo = useCallback(() => {
    if (historyIndexRef.current >= historyRef.current.length - 1) return;
    historyIndexRef.current++;
    const state = JSON.parse(JSON.stringify(historyRef.current[historyIndexRef.current])) as SketchState;
    stateRef.current = state;
    setCanvasSize({ width: state.canvasWidth, height: state.canvasHeight });
    renderCommitted();
    notifyChange();
    updateUndoRedoState();
  }, [renderCommitted, notifyChange, updateUndoRedoState]);

  // Clear
  const handleClear = useCallback(() => {
    const state = stateRef.current;
    stateRef.current = {
      ...state,
      strokes: [],
      textElements: [],
    };
    pushHistory(stateRef.current);
    renderCommitted();
    notifyChange();
  }, [pushHistory, renderCommitted, notifyChange]);

  // Keep canvasSizeRef in sync
  useEffect(() => {
    canvasSizeRef.current = canvasSize;
  }, [canvasSize]);

  // Resize handle
  const handleResizePointerDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    isResizingRef.current = true;
    resizeStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      w: canvasSizeRef.current.width,
      h: canvasSizeRef.current.height,
    };

    const handleResizeMove = (ev: PointerEvent) => {
      if (!isResizingRef.current || !resizeStartRef.current) return;
      const dx = ev.clientX - resizeStartRef.current.x;
      const dy = ev.clientY - resizeStartRef.current.y;
      const newWidth = Math.max(MIN_CANVAS_WIDTH, resizeStartRef.current.w + dx);
      const newHeight = Math.max(MIN_CANVAS_HEIGHT, resizeStartRef.current.h + dy);
      setCanvasSize({ width: newWidth, height: newHeight });
    };

    const handleResizeUp = () => {
      isResizingRef.current = false;
      resizeStartRef.current = null;
      // Use ref for latest size
      stateRef.current = {
        ...stateRef.current,
        canvasWidth: canvasSizeRef.current.width,
        canvasHeight: canvasSizeRef.current.height,
      };
      notifyChange();
      document.removeEventListener('pointermove', handleResizeMove);
      document.removeEventListener('pointerup', handleResizeUp);
    };

    document.addEventListener('pointermove', handleResizeMove);
    document.addEventListener('pointerup', handleResizeUp);
  }, [notifyChange]);

  // Cursor style based on tool
  const cursorStyle = useMemo(() => {
    switch (activeTool) {
      case 'pen': return 'crosshair';
      case 'eraser': return 'pointer';
      case 'text': return 'text';
      case 'move': return 'move';
      case 'pan': return 'grab';
      default: return 'default';
    }
  }, [activeTool]);

  return (
    <div className="flex flex-col h-full" ref={containerRef}>
      <SketchPadToolbar
        activeTool={activeTool}
        activeColor={activeColor}
        canUndo={canUndo}
        canRedo={canRedo}
        onToolChange={handleToolChange}
        onColorChange={handleColorChange}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onClear={handleClear}
        isDarkMode={isDarkMode}
      />

      <div className="flex-1 overflow-auto p-2">
        <div
          className="relative inline-block"
          style={{ width: canvasSize.width, height: canvasSize.height }}
        >
          {/* Committed canvas (bottom layer) */}
          <canvas
            ref={committedCanvasRef}
            className="absolute inset-0 rounded"
            style={{
              touchAction: 'none',
              cursor: cursorStyle,
            }}
          />

          {/* Overlay canvas (top layer for active stroke) */}
          <canvas
            ref={overlayCanvasRef}
            className="absolute inset-0 rounded"
            style={{
              touchAction: 'none',
              cursor: cursorStyle,
            }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          />

          {/* Text input overlay */}
          {textInput?.visible && (
            <input
              ref={textInputRef}
              type="text"
              value={textInput.value}
              onChange={(e) => setTextInput(prev => prev ? { ...prev, value: e.target.value } : null)}
              onKeyDown={handleTextKeyDown}
              onBlur={commitTextInput}
              className="absolute z-10 bg-transparent outline-none border-b-2 border-blue-500"
              style={{
                left: textInput.x,
                top: textInput.y,
                fontSize: DEFAULT_FONT_SIZE,
                color: getDisplayColor(activeColorRef.current, isDarkMode),
                fontFamily: 'sans-serif',
                minWidth: 100,
              }}
            />
          )}

          {/* Resize handle */}
          <div
            className={`absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize ${
              isDarkMode ? 'bg-gray-600' : 'bg-gray-300'
            }`}
            style={{
              clipPath: 'polygon(100% 0, 100% 100%, 0 100%)',
              touchAction: 'none',
            }}
            onPointerDown={handleResizePointerDown}
          />
        </div>
      </div>
    </div>
  );
}
