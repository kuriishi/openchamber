import React from 'react';

import type { Session } from '@/lib/opencode/model';
import {
  fetchSessionPluginPanels,
  type PluginPanel,
  type PluginPanelModel,
  type SessionPluginPanels as PanelsResult,
} from '@/lib/opencode/plugin-panels';
import { cn } from '@/lib/utils';

type LoadedPanels = { sessionID: string; result: PanelsResult };

/**
 * Reads the session's plugin panels again whenever what they summarize can
 * change: the session's spend, a finished turn, or the selected model. A
 * failed read keeps the panels already shown for the same session.
 */
const useSessionPluginPanels = (session: Session | null, model: PluginPanelModel | null): PluginPanel[] => {
  const [loaded, setLoaded] = React.useState<LoadedPanels | null>(null);
  const sessionID = session?.id ?? null;
  const directory = session?.directory ?? null;
  const tokens = session?.tokens;
  const usageKey = session && tokens
    ? [session.cost, tokens.input, tokens.output, tokens.reasoning, tokens.cache.read, tokens.cache.write, session.time.idle ?? 0].join(':')
    : '';
  const providerID = model?.providerID ?? null;
  const modelID = model?.modelID ?? null;

  React.useEffect(() => {
    if (!sessionID || !directory) return;
    const controller = new AbortController();
    const selected = providerID && modelID ? { providerID, modelID } : null;
    const load = async () => {
      try {
        const result = await fetchSessionPluginPanels({ directory, sessionID, model: selected, signal: controller.signal });
        if (!controller.signal.aborted) setLoaded({ sessionID, result });
      } catch (error) {
        if (!controller.signal.aborted) console.warn('[plugin-panels] Cannot load session panels', error);
      }
    };
    void load();
    return () => controller.abort();
  }, [directory, modelID, providerID, sessionID, usageKey]);

  if (!loaded || loaded.sessionID !== sessionID || loaded.result.kind !== 'available') return [];
  return loaded.result.panels;
};

const PanelCard: React.FC<{ panel: PluginPanel }> = ({ panel }) => {
  const valueColumns = Math.max(panel.columns.length, ...panel.rows.map((row) => row.values.length));
  // Every grid row fills each column, so a short row cannot shift the next one.
  const cells = (values: string[]) => Array.from({ length: valueColumns }, (_, index) => values[index] ?? '');
  return (
    <div className="rounded-lg bg-[var(--surface-elevated)]/70 px-4 py-3.5">
      <div
        className="grid items-baseline gap-x-4 gap-y-1 typography-micro"
        style={{ gridTemplateColumns: `minmax(0, 1fr) repeat(${valueColumns}, max-content)` }}
      >
        <div dir="auto" className="col-start-1 mb-1.5 truncate text-muted-foreground" title={panel.title}>{panel.title}</div>
        {cells(panel.columns).map((column, index) => (
          <div key={index} dir="auto" className="mb-1.5 text-end text-muted-foreground/70">{column}</div>
        ))}
        {panel.rows.map((row, rowIndex) => {
          const tone = row.tone === 'base' ? 'text-foreground' : 'text-muted-foreground';
          return (
            <React.Fragment key={rowIndex}>
              {row.separated ? <div className="col-span-full h-1.5" /> : null}
              <div
                dir="auto"
                className={cn('col-start-1 truncate', tone)}
                style={row.indent > 0 ? { paddingInlineStart: `${row.indent * 0.75}rem` } : undefined}
                title={row.label}
              >
                {row.label}
              </div>
              {cells(row.values).map((value, index) => (
                <div key={index} className={cn('text-end tabular-nums', tone)}>{value}</div>
              ))}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};

/** Panels a server plugin computes for the session, drawn as they arrive. */
export const SessionPluginPanels: React.FC<{
  session: Session | null;
  model: PluginPanelModel | null;
  className?: string;
}> = ({ session, model, className }) => {
  const panels = useSessionPluginPanels(session, model);
  if (panels.length === 0) return null;
  return (
    <div className={cn('space-y-2', className)}>
      {panels.map((panel) => <PanelCard key={panel.id} panel={panel} />)}
    </div>
  );
};
