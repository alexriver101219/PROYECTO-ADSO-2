import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const isWindows = process.platform === "win32";

function cleanEnv() {
  const env = {};

  for (const [key, value] of Object.entries(process.env)) {
    if (!key || key.includes("=") || value == null) {
      continue;
    }

    if (isWindows && key.toLowerCase() === "path") {
      env.Path = value;
      continue;
    }

    env[key] = value;
  }

  return env;
}

function commandFor(scriptName) {
  if (isWindows) {
    return {
      command: "cmd.exe",
      args: ["/d", "/s", "/c", `npm run ${scriptName}`],
    };
  }

  return {
    command: "npm",
    args: ["run", scriptName],
  };
}

const processes = [
  {
    name: "backend",
    ...commandFor("dev:backend"),
  },
  {
    name: "frontend",
    ...commandFor("dev:frontend"),
  },
];

const children = processes.map(({ name, command, args }) => {
  const child = spawn(command, args, {
    cwd: projectRoot,
    env: cleanEnv(),
    shell: false,
    stdio: ["inherit", "pipe", "pipe"],
  });

  child.stdout.on("data", (chunk) => {
    process.stdout.write(`[${name}] ${chunk}`);
  });

  child.stderr.on("data", (chunk) => {
    process.stderr.write(`[${name}] ${chunk}`);
  });

  child.on("exit", (code) => {
    if (code && code !== 0) {
      console.error(`[${name}] exited with code ${code}`);
    }
  });

  return child;
});

function shutdown() {
  for (const child of children) {
    child.kill();
  }
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

console.log("Nexa dev servers starting...");
console.log("Backend:  http://127.0.0.1:3000");
console.log("Frontend: http://127.0.0.1:5173");
