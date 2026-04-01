import { useState } from 'react';

interface PaginationProps {
  total: number;
  limit: number;
  offset: number;
  onPageChange: (newOffset: number) => void;
}

function getPageNumbers(currentPage: number, totalPages: number): (number | '...')[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const pages: (number | '...')[] = [1];
  if (currentPage > 3) pages.push('...');
  for (let p = Math.max(2, currentPage - 1); p <= Math.min(totalPages - 1, currentPage + 1); p++) {
    pages.push(p);
  }
  if (currentPage < totalPages - 2) pages.push('...');
  pages.push(totalPages);
  return pages;
}

function Pagination({ total, limit, offset, onPageChange }: PaginationProps) {
  const currentPage = Math.floor(offset / limit) + 1;
  const totalPages = Math.ceil(total / limit);
  const [input, setInput] = useState('');

  if (totalPages <= 1) return null;

  const pages = getPageNumbers(currentPage, totalPages);

  function goToPage() {
    const page = parseInt(input, 10);
    if (!isNaN(page) && page >= 1 && page <= totalPages) {
      onPageChange((page - 1) * limit);
    }
    setInput('');
  }

  return (
    <div className="flex items-center justify-between mt-4 text-sm">
      <div className="text-secondary">
        Showing {offset + 1}–{Math.min(offset + limit, total)} of {total}
      </div>
      <div className="flex gap-1 items-center">
        <button
          onClick={() => onPageChange(Math.max(0, offset - limit))}
          disabled={currentPage === 1}
          className="px-3 py-1 rounded border bg-surface text-secondary hover:bg-surface-hover disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Previous
        </button>
        {pages.map((p, i) =>
          p === '...' ? (
            <span key={`ellipsis-${i}`} className="px-2 py-1 text-secondary">…</span>
          ) : (
            <button
              key={p}
              onClick={() => onPageChange((p - 1) * limit)}
              className={`px-3 py-1 rounded border ${
                p === currentPage
                  ? 'bg-accent text-white border-accent'
                  : 'bg-surface text-secondary hover:bg-surface-hover'
              }`}
            >
              {p}
            </button>
          )
        )}
        <button
          onClick={() => onPageChange(offset + limit)}
          disabled={currentPage === totalPages}
          className="px-3 py-1 rounded border bg-surface text-secondary hover:bg-surface-hover disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Next
        </button>
        <span className="text-secondary ml-2">Go to</span>
        <input
          type="number"
          min={1}
          max={totalPages}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && goToPage()}
          placeholder={String(currentPage)}
          className="w-16 px-2 py-1 rounded border bg-surface text-secondary text-center [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        <button
          onClick={goToPage}
          className="px-3 py-1 rounded border bg-surface text-secondary hover:bg-surface-hover"
        >
          Go
        </button>
      </div>
    </div>
  );
}

export default Pagination;
