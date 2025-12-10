import cluster from "node:cluster";
import os from "node:os";
import process from "node:process";

if (cluster.isPrimary) {
  // biome-ignore lint/style/useBlockStatements: <explanation>
  for (let i = 0; i < os.availableParallelism(); i++) cluster.fork();
} else {
  await import("./server");
  // biome-ignore lint/suspicious/noConsole: <explanation>
  console.log(`Worker ${process.pid} started`);
}
