// Script charms (Tech §3.8 escape hatch): TypeScript effects the DSL can't express, looked up by
// a charm's `"script": "<id>"`. Scripts run inside the sim, so they follow the sim rules (pure,
// deterministic, randomness only from the `charms` stream they are handed). Mods may not register
// scripts in v1 (no remote code, no eval). The 24 launch charms are all plain DSL.
import type { CharmActions, CharmTrigger, TriggerContext } from './interpreter';

export interface CharmScript {
  /** Extra actions for this trigger, applied after the charm's listed effects. */
  readonly effects: (on: CharmTrigger, ctx: TriggerContext) => readonly CharmActions[];
}

export const CHARM_SCRIPTS: Readonly<Record<string, CharmScript>> = {};
