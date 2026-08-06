import { PAGE_SIZE_OPTIONS } from '../hooks/usePagination';
import { Select } from './Select';

interface PaginationProps {
  page: number;
  pageCount: number;
  total: number;
  from: number;
  to: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  label?: string;
}

function pageWindow(page: number, pageCount: number): number[] {
  if (pageCount <= 5) {
    return Array.from({ length: pageCount }, (_, i) => i + 1);
  }
  const start = Math.max(1, Math.min(page - 1, pageCount - 4));
  return Array.from({ length: 5 }, (_, i) => start + i);
}

export function Pagination({
  page,
  pageCount,
  total,
  from,
  to,
  pageSize,
  onPageChange,
  onPageSizeChange,
  label = 'rows',
}: PaginationProps) {
  if (total === 0) {
    return null;
  }

  const pages = pageWindow(page, pageCount);

  return (
    <div className="pagination" role="navigation" aria-label="Pagination">
      <p className="pagination__meta">
        Showing <strong>{from}</strong>–<strong>{to}</strong> of{' '}
        <strong>{total}</strong> {label}
      </p>

      <div className="pagination__controls">
        <label className="pagination__size">
          <span className="field__label">Per page</span>
          <Select
            size="sm"
            aria-label="Rows per page"
            value={String(pageSize)}
            onChange={(value) => onPageSizeChange(Number(value))}
            options={PAGE_SIZE_OPTIONS.map((size) => ({
              value: String(size),
              label: String(size),
            }))}
          />
        </label>

        <div className="pagination__pages">
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            aria-label="Previous page"
          >
            Prev
          </button>

          {pages[0] > 1 ? (
            <>
              <button
                type="button"
                className="pagination__page"
                onClick={() => onPageChange(1)}
              >
                1
              </button>
              {pages[0] > 2 ? (
                <span className="pagination__ellipsis" aria-hidden="true">
                  …
                </span>
              ) : null}
            </>
          ) : null}

          {pages.map((n) => (
            <button
              key={n}
              type="button"
              className={[
                'pagination__page',
                n === page ? 'is-active' : '',
              ].join(' ')}
              aria-current={n === page ? 'page' : undefined}
              onClick={() => onPageChange(n)}
            >
              {n}
            </button>
          ))}

          {pages[pages.length - 1] < pageCount ? (
            <>
              {pages[pages.length - 1] < pageCount - 1 ? (
                <span className="pagination__ellipsis" aria-hidden="true">
                  …
                </span>
              ) : null}
              <button
                type="button"
                className="pagination__page"
                onClick={() => onPageChange(pageCount)}
              >
                {pageCount}
              </button>
            </>
          ) : null}

          <button
            type="button"
            className="btn btn--ghost btn--sm"
            disabled={page >= pageCount}
            onClick={() => onPageChange(page + 1)}
            aria-label="Next page"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
