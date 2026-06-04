import { describe, expect, it } from "vitest";
import { loadHomeDashboardData } from "./useHomeDashboardData";

describe("home dashboard data hook helpers", () => {
  it("loads dashboard data through the provided provider", async () => {
    const provider = {
      async getHomeDashboard() {
        return {
          serviceState: [{ name: "local-intel", value: "running", tone: "good" }],
          homeTasks: [{ title: "Task", module: "Home", time: "09:30" }],
          recentActivities: ["Activity"],
          quickEntries: [{ id: "knowledge", name: "Knowledge Base" }],
        };
      },
    };

    await expect(loadHomeDashboardData(provider)).resolves.toMatchObject({
      serviceState: [{ name: "local-intel" }],
      homeTasks: [{ title: "Task" }],
      recentActivities: ["Activity"],
      quickEntries: [{ id: "knowledge" }],
    });
  });
});
