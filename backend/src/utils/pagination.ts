import { z } from 'zod';

export const paginationQuerySchema = z.object({
  querystring: z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(200).default(20),
    search: z.string().max(255).optional(),
    sortBy: z.string().max(64).optional(),
    sortDir: z.enum(['asc', 'desc']).default('asc'),
  }),
});

export interface PaginationParams {
  page: number;
  pageSize: number;
  search?: string;
  sortBy?: string;
  sortDir: 'asc' | 'desc';
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export function paginate<T>(items: T[], total: number, params: PaginationParams): PaginatedResult<T> {
  return {
    items,
    total,
    page: params.page,
    pageSize: params.pageSize,
    totalPages: total === 0 ? 0 : Math.ceil(total / params.pageSize),
  };
}