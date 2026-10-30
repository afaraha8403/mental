/**
 * Every way Mental can leave the machine. The allowlist test fails when a new
 * outbound call site appears in `bin/` without a row here.
 */
import { isFeatureOn, resolveDecide } from "./config.mjs";

/** Call sites the allowlist test greps for. `inbound` is a local listener, not a send. */
export const NETWORK_ALLOWLIST = [
  {
    id: "decide",
    file: "bin/lib/jev.mjs",
    marker: "globalThis.fetch",
    sends: "redacted text to the configured decision-model provider",
  },
  {
    id: "update-check",
    file: "bin/lib/update.mjs",
    marker: "spawnNpmView",
    sends: "the package name to the npm registry (`npm view`)",
  },
];

/**
 * @param {string | null} home
 * @param {string | null} uuid
 * @param {NodeJS.ProcessEnv} [env]
 */
export function networkStatus(home, uuid, env = process.env) {
  const decide = resolveDecide(home);
  const skipUpdate = env.MENTAL_SKIP_UPDATE_CHECK === "1";
  return [
    { id: "core", network: false, active: true, off: null, sends: "nothing" },
    { id: "skill", network: false, active: true, off: null, sends: "nothing" },
    {
      id: "update-check",
      network: true,
      active: !skipUpdate,
      off: "MENTAL_SKIP_UPDATE_CHECK=1",
      sends: "package name to the npm registry",
    },
    {
      id: "mcp",
      network: false,
      active: Boolean(home && isFeatureOn(home, "mcp", null)),
      off: "mental option mcp off",
      sends: "stdio on this machine only",
    },
    {
      id: "dashboard",
      network: false,
      active: false,
      off: null,
      sends: "loopback 127.0.0.1, GET and HEAD only",
    },
    {
      id: "decide",
      network: true,
      active: Boolean(decide.enabled && decide.configured),
      off: "mental option decide off",
      sends: decide.configured ? `redacted text to ${decide.provider}` : "nothing until a key is set",
    },
    {
      id: "hooks",
      network: false,
      active: Boolean(home && isFeatureOn(home, "hooks", null)),
      off: "mental option hooks off",
      sends: "nothing",
    },
    {
      id: "track",
      network: false,
      active: Boolean(home && uuid && isFeatureOn(home, "track", uuid)),
      off: "mental option track off",
      sends: "local sqlite, never git",
    },
  ];
}
