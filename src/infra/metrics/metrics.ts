const HISTOGRAM_MAX_VALUES = 2000;
const DEFAULT_BUCKETS = [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 30000, 60000];
const START_TIME = Date.now();

interface CounterEntry {
  value: number;
  labels: Record<string, string>;
}

interface GaugeEntry {
  value: number;
  labels: Record<string, string>;
}

interface HistogramEntry {
  values: number[];
  labels: Record<string, string>;
}

class Metrics {
  private counters = new Map<string, CounterEntry[]>();
  private gauges = new Map<string, GaugeEntry[]>();
  private histograms = new Map<string, HistogramEntry[]>();

  incCounter(name: string, labels?: Record<string, string>, amount = 1): void {
    const entries = this.counters.get(name) ?? [];
    const existing = entries.find(e => this.matchLabels(e.labels, labels));
    if (existing) {
      existing.value += amount;
    } else {
      entries.push({ value: amount, labels: labels ?? {} });
    }
    this.counters.set(name, entries);
  }

  setGauge(name: string, value: number, labels?: Record<string, string>): void {
    const entries = this.gauges.get(name) ?? [];
    const existing = entries.find(e => this.matchLabels(e.labels, labels));
    if (existing) {
      existing.value = value;
    } else {
      entries.push({ value, labels: labels ?? {} });
    }
    this.gauges.set(name, entries);
  }

  observeHistogram(name: string, value: number, labels?: Record<string, string>): void {
    const entries = this.histograms.get(name) ?? [];
    const existing = entries.find(e => this.matchLabels(e.labels, labels));
    if (existing) {
      existing.values.push(value);
      if (existing.values.length > HISTOGRAM_MAX_VALUES) {
        existing.values.shift();
      }
    } else {
      entries.push({ values: [value], labels: labels ?? {} });
    }
    this.histograms.set(name, entries);
  }

  export(): string {
    const lines: string[] = [];

    lines.push(`mt_up_time_seconds ${Math.floor((Date.now() - START_TIME) / 1000)}`);

    if (typeof globalThis.gc === "function") {
      globalThis.gc();
    }
    const mem = process.memoryUsage();
    lines.push(`mt_heap_used_bytes ${mem.heapUsed}`);
    lines.push(`mt_heap_total_bytes ${mem.heapTotal}`);
    lines.push(`mt_rss_bytes ${mem.rss}`);

    lines.push("# HELP master_transport_metrics Metricas do sistema Master Transport");
    lines.push("# TYPE master_transport_metrics untyped");
    lines.push("");

    for (const [name, entries] of this.counters) {
      for (const entry of entries) {
        lines.push(this.formatLine(name, entry.value, entry.labels, "counter"));
      }
    }

    for (const [name, entries] of this.gauges) {
      for (const entry of entries) {
        lines.push(this.formatLine(name, entry.value, entry.labels, "gauge"));
      }
    }

    for (const [name, entries] of this.histograms) {
      for (const entry of entries) {
        const sorted = [...entry.values].sort((a, b) => a - b);
        const count = sorted.length;
        const sum = sorted.reduce((a, b) => a + b, 0);

        lines.push(this.formatLine(`${name}_count`, count, entry.labels, "histogram"));
        lines.push(this.formatLine(`${name}_sum`, sum, entry.labels, "histogram"));

        if (count > 0) {
          const p50 = quantile(sorted, 0.5);
          const p95 = quantile(sorted, 0.95);
          const p99 = quantile(sorted, 0.99);
          lines.push(this.formatLine(`${name}_p50`, p50, entry.labels, "histogram"));
          lines.push(this.formatLine(`${name}_p95`, p95, entry.labels, "histogram"));
          lines.push(this.formatLine(`${name}_p99`, p99, entry.labels, "histogram"));
        }

        for (const bucket of DEFAULT_BUCKETS) {
          const le = sorted.filter(v => v <= bucket).length;
          lines.push(this.formatLine(`${name}_bucket`, le, { ...entry.labels, le: String(bucket) }, "histogram"));
        }
        lines.push(this.formatLine(`${name}_bucket`, count, { ...entry.labels, le: "+Inf" }, "histogram"));
      }
    }

    lines.push("");
    return lines.join("\n");
  }

  private formatLine(name: string, value: number, labels: Record<string, string>, _type: string): string {
    const labelStr =
      Object.keys(labels).length > 0
        ? `{${Object.entries(labels)
            .map(([k, v]) => `${k}="${this.escape(v)}"`)
            .join(",")}}`
        : "";
    return `mt_${name}${labelStr} ${value}`;
  }

  private escape(value: string): string {
    return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  }

  private matchLabels(a: Record<string, string>, b?: Record<string, string>): boolean {
    if (!b) return Object.keys(a).length === 0;
    if (Object.keys(a).length !== Object.keys(b).length) return false;
    return Object.entries(a).every(([k, v]) => b[k] === v);
  }
}

export const metrics = new Metrics();

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const pos = q * (sorted.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (pos - lo) * (sorted[hi] - sorted[lo]);
}
