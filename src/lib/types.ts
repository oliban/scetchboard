export interface Note {
  id: string;
  title: string;
  content: string;
  sketch_data: string | null;
  sketch_image: string | null;
  is_pinned: number;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}
