export interface BoundingBox {
  ymin: number;
  xmin: number;
  ymax: number;
  xmax: number;
}

export interface IndexLink {
  id: string;
  label: string;
  targetPage: number;
  box: BoundingBox;
}

export interface PageAnalysis {
  pageNumber: number;
  links: IndexLink[];
}

export enum AppState {
  IDLE = 'IDLE',
  ANALYZING = 'ANALYZING',
  READY = 'READY',
  ERROR = 'ERROR'
}