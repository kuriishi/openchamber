import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test"
import { OpencodeApiError, opencodeClient } from "./client"
import { configureRuntimeUrlResolver, getRuntimeUrlResolver, setRuntimeUrlResolver } from "../runtime-url"
import { fetchSessionPluginPanels } from "./plugin-panels"

const previous = getRuntimeUrlResolver()
beforeEach(() => {
  configureRuntimeUrlResolver({ apiBaseUrl: "https://panels.test" })
  opencodeClient.reconnectToRuntimeBaseUrl()
})
afterEach(() => {
  setRuntimeUrlResolver(previous)
  opencodeClient.reconnectToRuntimeBaseUrl()
})

const rpcError = (type: string, status = 400) =>
  Response.json({ _tag: "RpcError", type, message: type }, { status })

const read = () => fetchSessionPluginPanels({
  directory: "/work/project",
  sessionID: "ses_1",
  model: { providerID: "dogapi", modelID: "big" },
})

describe("sidebar.panels boundary", () => {
  test("calls the session's Location with the selected model and fills row defaults", async () => {
    let request: Request | null = null
    const fetch = spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      request = input instanceof Request ? input : new Request(input, init)
      return Response.json({
        output: [
          { id: "tokens", title: "Tokens", columns: ["Last", "Session"], rows: [
            { label: "Input", values: ["3k", "4k"], tone: "base" },
            { label: "Cache hit", values: ["33%", "25%"], indent: 1, separated: true },
          ] },
          { id: "cost", title: "Cost", rows: [{ label: "Total", values: ["$1"] }] },
        ],
      })
    })
    try {
      const result = await read()
      const sent = request!
      expect(new URL(sent.url).pathname).toBe("/api/rpc/sidebar/panels")
      expect(sent.method).toBe("POST")
      expect(decodeURIComponent(sent.headers.get("x-opencode-directory") ?? "")).toBe("/work/project")
      expect(await sent.json()).toEqual({ input: { sessionID: "ses_1", model: { providerID: "dogapi", id: "big" } } })
      expect(result).toEqual({
        kind: "available",
        panels: [
          { id: "tokens", title: "Tokens", columns: ["Last", "Session"], rows: [
            { label: "Input", values: ["3k", "4k"], tone: "base", indent: 0, separated: false },
            { label: "Cache hit", values: ["33%", "25%"], tone: "muted", indent: 1, separated: true },
          ] },
          { id: "cost", title: "Cost", columns: [], rows: [
            { label: "Total", values: ["$1"], tone: "muted", indent: 0, separated: false },
          ] },
        ],
      })
    } finally {
      fetch.mockRestore()
    }
  })

  test("a Location without the RPC is unavailable, not empty", async () => {
    for (const type of ["rpc.unavailable", "rpc.method_not_found"]) {
      const fetch = spyOn(globalThis, "fetch").mockImplementation(async () => rpcError(type))
      try {
        expect(await read()).toEqual({ kind: "unavailable" })
      } finally {
        fetch.mockRestore()
      }
    }
  })

  test("a failing plugin and malformed panels throw", async () => {
    const failing = spyOn(globalThis, "fetch").mockImplementation(async () =>
      Response.json({ _tag: "RpcInternalError", type: "rpc.internal", message: "RPC call failed" }, { status: 500 }))
    try {
      await expect(read()).rejects.toBeInstanceOf(OpencodeApiError)
    } finally {
      failing.mockRestore()
    }

    const malformed = spyOn(globalThis, "fetch").mockImplementation(async () =>
      Response.json({ output: [{ id: "x", title: "X", rows: [{ label: "Input", values: [3] }] }] }))
    try {
      await expect(read()).rejects.toThrow("malformed panels")
    } finally {
      malformed.mockRestore()
    }
  })
})
