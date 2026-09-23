import { describe, expect, it } from 'vitest';

import { UK_DATA_SOURCES, probeAllUkDataSources } from './registry.js';

const RUN_SMOKE = process.env.RUN_SMOKE === '1';

describe.skipIf(!RUN_SMOKE)('live access smoke test', () => {
  // The Environment Agency API answers in 5 to 20 seconds per call, well
  // past vitest's 5 second default.
  const LIVE_PROBE_TIMEOUT_MS = 60_000;

  it(
    'reaches every keyless UK source',
    async () => {
      const probes = await probeAllUkDataSources();
      expect(probes).toHaveLength(UK_DATA_SOURCES.length);
      for (const probe of probes) {
        expect(probe.ok, `${probe.name}: ${probe.status}`).toBe(true);
      }
    },
    LIVE_PROBE_TIMEOUT_MS
  );
});
