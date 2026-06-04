import { describe, expect, it } from "vitest";
import { getWidgetsData } from "./widgetsAdapter";

describe("widgets adapter", () => {
  it("builds system metrics from local system readers", async () => {
    const data = await getWidgetsData({
      diskReader: async () => ({ free: 250, total: 1000 }),
      systemReader: {
        cpus: () => [{}, {}, {}],
        freemem: () => 400,
        loadavg: () => [1.5],
        totalmem: () => 1600,
      },
    });

    expect(data).toEqual({
      systemMetrics: [
        { label: "CPU", value: "50%" },
        { label: "Memory", value: "75%" },
        { label: "Disk", value: "75%" },
      ],
    });
  });

  it("uses safe zero values when system readers are unavailable", async () => {
    const data = await getWidgetsData({
      diskReader: async () => null,
      systemReader: {
        cpus: () => [],
        freemem: () => 0,
        loadavg: () => [],
        totalmem: () => 0,
      },
    });

    expect(data.systemMetrics).toEqual([
      { label: "CPU", value: "0%" },
      { label: "Memory", value: "0%" },
      { label: "Disk", value: "0%" },
    ]);
  });
});
