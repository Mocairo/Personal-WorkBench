import fs from "node:fs/promises";
import os from "node:os";

function clampPercent(value) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(value)));
}

function toPercent(used, total) {
  if (!Number.isFinite(used) || !Number.isFinite(total) || total <= 0) {
    return "0%";
  }

  return `${clampPercent((used / total) * 100)}%`;
}

function getCpuUsage(systemReader) {
  const cores = Math.max(systemReader.cpus().length, 1);
  const loadAverage = systemReader.loadavg()[0] ?? 0;

  return toPercent(loadAverage, cores);
}

function getMemoryUsage(systemReader) {
  const total = systemReader.totalmem();
  const free = systemReader.freemem();

  return toPercent(total - free, total);
}

async function defaultDiskReader(rootPath) {
  try {
    const stats = await fs.statfs(rootPath);
    const total = Number(stats.blocks) * Number(stats.bsize);
    const free = Number(stats.bavail) * Number(stats.bsize);

    return { free, total };
  } catch {
    return null;
  }
}

async function getDiskUsage(diskReader, diskRoot) {
  const disk = await diskReader(diskRoot);

  if (!disk) {
    return "0%";
  }

  return toPercent(disk.total - disk.free, disk.total);
}

export async function getWidgetsData(options = {}) {
  const systemReader = options.systemReader ?? os;
  const diskReader = options.diskReader ?? defaultDiskReader;
  const diskRoot = options.diskRoot ?? process.env.WIDGETS_DISK_ROOT ?? process.cwd();
  const [cpu, memory, disk] = await Promise.all([
    Promise.resolve(getCpuUsage(systemReader)),
    Promise.resolve(getMemoryUsage(systemReader)),
    getDiskUsage(diskReader, diskRoot),
  ]);

  return {
    systemMetrics: [
      { label: "CPU", value: cpu },
      { label: "Memory", value: memory },
      { label: "Disk", value: disk },
    ],
  };
}
