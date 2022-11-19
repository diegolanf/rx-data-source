export enum SortDirection {
  asc = 'asc',
  desc = 'desc',
}

export interface Sort {
  direction: SortDirection;
  column: string;
}

export enum PaginationStrategy {
  scroll = 'scroll',
  paginate = 'paginate',
  none = 'none',
}

export interface PaginationParams {
  skip: number;
  take: number;
}
