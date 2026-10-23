/**
 * Session panels a server plugin computes, read through OpenCode's plugin RPC
 * route (`rpc.call`, `POST /api/rpc/sidebar/panels`).
 *
 * The contract is the `sidebar` RPC a plugin registers: `panels` takes
 * `{ sessionID, model? }` and answers titled sections of preformatted rows,
 * the same data a TUI plugin renders in the terminal sidebar. OpenChamber
 * draws them without knowing what they measure.
 *
 * A Location without that RPC answers `unavailable`; any other failure throws,
 * so a failed read never passes for "no panels".
 */

import type { RpcOutput } from "@opencode/client"
import { z } from "zod"
import { normalizeOpencodeError, opencodeClient } from "./client"

export type PluginPanelRow = {
  label: string
  values: string[]
  tone: "base" | "muted"
  indent: number
  /** A gap before the row. */
  separated: boolean
}

export type PluginPanel = {
  id: string
  title: string
  /** Headings of the value columns; empty when the panel has none. */
  columns: string[]
  rows: PluginPanelRow[]
}

export type SessionPluginPanels =
  | { kind: "available"; panels: PluginPanel[] }
  /** No plugin in the session's Location registers the `sidebar` RPC. */
  | { kind: "unavailable" }

export type PluginPanelModel = { providerID: string; modelID: string }

const RPC_ID = "sidebar"
const METHOD = "panels"

type RpcInput = { sessionID: string; model?: { providerID: string; id: string } }

const rowSchema = z.object({
  label: z.string(),
  values: z.array(z.string()),
  tone: z.enum(["base", "muted"]).default("muted"),
  indent: z.number().int().nonnegative().default(0),
  separated: z.boolean().default(false),
})

const panelsSchema = z.array(z.object({
  id: z.string(),
  title: z.string(),
  columns: z.array(z.string()).default([]),
  rows: z.array(rowSchema),
}))

// OpenCode answers these when no plugin registered the RPC or the method.
const missingRpcSchema = z.object({ _tag: z.literal("RpcError"), type: z.enum(["rpc.unavailable", "rpc.method_not_found"]) })

export async function fetchSessionPluginPanels(input: {
  directory: string
  sessionID: string
  model: PluginPanelModel | null
  signal?: AbortSignal
}): Promise<SessionPluginPanels> {
  const rpcInput: RpcInput = { sessionID: input.sessionID }
  if (input.model) rpcInput.model = { providerID: input.model.providerID, id: input.model.modelID }
  let response: RpcOutput
  try {
    response = await opencodeClient.getScopedSdkClient(input.directory).rpc.call(
      { rpcID: RPC_ID, method: METHOD, input: rpcInput },
      { signal: input.signal },
    )
  } catch (error) {
    if (missingRpcSchema.safeParse(error).success) return { kind: "unavailable" }
    throw normalizeOpencodeError("rpc.call", error)
  }
  const panels = panelsSchema.safeParse(response.output)
  if (!panels.success) throw new Error(`${RPC_ID}.${METHOD} answered malformed panels: ${panels.error.message}`)
  return { kind: "available", panels: panels.data }
}
