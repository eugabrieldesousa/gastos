"use client";

import { formatMoney } from "@/lib/finance";

export type ChartSlice = {
  name: string;
  value: number;
  color: string;
  key: string;
};
function segmentsFor(slices: ChartSlice[], total: number) {
  let offset = 0;
  return slices.map((slice) => {
    const percent = (slice.value / total) * 100;
    const segment = { ...slice, percent, start: offset };
    offset += percent;
    return segment;
  });
}
export function FinanceChart({
  title,
  slices,
  onSelect,
}: {
  title: string;
  slices: ChartSlice[];
  onSelect: (key: string) => void;
}) {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  const segments = total ? segmentsFor(slices, total) : [];
  return (
    <section className="chart-card panel" aria-label={title}>
      <div className="panel-heading">
        <h2>{title}</h2>
        <span className="quiet-label">Gastos do mês</span>
      </div>
      {!total ? (
        <div className="chart-empty">
          <div className="empty-ring" />
          <p>Adicione gastos para visualizar a distribuição.</p>
        </div>
      ) : (
        <div className="chart-body">
          <div className="donut-wrap">
            <svg viewBox="0 0 160 160" className="donut" aria-label={title}>
              <circle
                cx="80"
                cy="80"
                r="60"
                fill="none"
                stroke="var(--muted)"
                strokeWidth="19"
              />
              {segments.map((slice) => {
                const { percent, start } = slice;
                return (
                  <circle
                    key={slice.key}
                    cx="80"
                    cy="80"
                    r="60"
                    fill="none"
                    stroke={slice.color}
                    strokeWidth="19"
                    pathLength="100"
                    strokeDasharray={`${percent} ${100 - percent}`}
                    strokeDashoffset={-start}
                    transform="rotate(-90 80 80)"
                    role="button"
                    tabIndex={0}
                    aria-label={`${slice.name}: ${formatMoney(slice.value)}, ${percent.toFixed(1)}%`}
                    onClick={() => onSelect(slice.key)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onSelect(slice.key);
                      }
                    }}
                  >
                    <title>
                      {slice.name}: {formatMoney(slice.value)} (
                      {percent.toFixed(1)}%)
                    </title>
                  </circle>
                );
              })}
            </svg>
            <div className="donut-center">
              <span>Total</span>
              <strong>{formatMoney(total)}</strong>
            </div>
          </div>
          <div className="chart-legend">
            {slices.map((slice) => (
              <button
                key={slice.key}
                onClick={() => onSelect(slice.key)}
                aria-label={`Ver gastos: ${slice.name}`}
              >
                <i style={{ background: slice.color }} />
                <span>{slice.name}</span>
                <strong>{((slice.value / total) * 100).toFixed(1)}%</strong>
                <small>{formatMoney(slice.value)}</small>
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
