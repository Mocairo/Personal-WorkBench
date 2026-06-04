import { describe, expect, it } from "vitest";
import {
  decidePermissionRequest,
  dryRunTool,
  evaluateToolRequest,
  executeTool,
  listPermissionRequests,
} from "./permissionAdapter";

describe("permission and tool skeleton adapter", () => {
  it("lists stable pending-safe permission requests", async () => {
    await expect(listPermissionRequests()).resolves.toEqual([
      expect.objectContaining({
        permissionLevel: 2,
        requiresApproval: true,
        status: "pending",
      }),
    ]);
  });

  it("allows Level 0/1 dry-run requests and requires approval for Level 2", async () => {
    await expect(evaluateToolRequest({ permissionLevel: 1, toolId: "kb.search" })).resolves.toMatchObject({
      decision: "allow",
      permissionLevel: 1,
      requiresApproval: false,
      status: "ready",
      toolId: "kb.search",
    });
    await expect(evaluateToolRequest({ permissionLevel: 2, toolId: "notes.write" })).resolves.toMatchObject({
      decision: "approval-required",
      permissionLevel: 2,
      requiresApproval: true,
      status: "pending",
      toolId: "notes.write",
    });
  });

  it("denies Level 3/4 tool requests and never executes tools", async () => {
    await expect(evaluateToolRequest({ permissionLevel: 4, toolId: "shell.exec" })).resolves.toMatchObject({
      decision: "denied",
      permissionLevel: 4,
      requiresApproval: true,
      status: "denied",
      toolId: "shell.exec",
    });
    await expect(dryRunTool({ permissionLevel: 3, toolId: "local-intel.start" })).resolves.toMatchObject({
      permissionLevel: 3,
      status: "denied",
      toolId: "local-intel.start",
      wouldExecute: false,
    });
    await expect(executeTool({ permissionLevel: 1, toolId: "kb.search" })).resolves.toMatchObject({
      status: "denied",
      wouldExecute: false,
    });
  });

  it("keeps permission decisions as a non-executing placeholder", async () => {
    await expect(decidePermissionRequest({ requestId: "req-1", decision: "approve" })).resolves.toMatchObject({
      allowed: false,
      decision: "not-implemented",
      requestId: "req-1",
      status: "not-implemented",
    });
  });
});
