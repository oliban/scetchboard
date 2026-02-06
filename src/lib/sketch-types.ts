export type Tool = 'pen' | 'eraser' | 'text' | 'move' | 'pan';

export interface Point {
  x: number;
  y: number;
}

export interface Stroke {
  id: string;
  points: Point[];
  color: string;
  width: number;
}

export interface TextElement {
  id: string;
  text: string;
  position: Point;
  color: string;
  fontSize: number;
}

export interface SketchState {
  strokes: Stroke[];
  textElements: TextElement[];
  canvasWidth: number;
  canvasHeight: number;
}

export const COLORS = [
  { name: 'black', value: '#000000' },
  { name: 'blue', value: '#2563eb' },
  { name: 'red', value: '#dc2626' },
  { name: 'green', value: '#16a34a' },
] as const;

export const DEFAULT_PEN_WIDTH = 2;
export const DEFAULT_FONT_SIZE = 16;
export const ERASER_PROXIMITY = 10;

export function createEmptyState(width: number, height: number): SketchState {
  return {
    strokes: [],
    textElements: [],
    canvasWidth: width,
    canvasHeight: height,
  };
}

export function generateId(): string {
  return Math.random().toString(36).substring(2, 11) + Date.now().toString(36);
}
