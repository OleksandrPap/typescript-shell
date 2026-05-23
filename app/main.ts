import { createInterface } from "readline";
import path from "path";
import fs, { writeFileSync } from "fs";
import { execSync, spawn } from "child_process";
import { parse } from "shell-quote";

let lastTabLine: string | null = null;
let jobs = new Map<number, { pid: number; job: string }>();

const lcp = (strs: string[]): string => {
  if (strs.length === 0) return "";
  let prefix = strs[0];
  for (const s of strs.slice(1)) {
    while (!s.startsWith(prefix)) prefix = prefix.slice(0, -1);
  }
  return prefix;
};

type Candidate = { display: string; completion: string };

const registeredCompletions = new Map<string, string>();
const resolveCompletion = (
  candidates: Candidate[],
  word: string,
  fullLine: string,
): [string[], string] => {
  if (candidates.length === 0) {
    lastTabLine = null;
    process.stdout.write("\x07");
    return [[], fullLine];
  }
  if (candidates.length === 1) {
    lastTabLine = null;
    return [[candidates[0].completion], word];
  }
  const common = lcp(candidates.map((c) => c.completion.trimEnd()));
  if (common.length > word.length) {
    lastTabLine = null;
    return [[common], word];
  }
  if (lastTabLine === fullLine) {
    lastTabLine = null;
    process.stdout.write(
      "\n" +
        candidates
          .map((c) => c.display)
          .sort()
          .join("  ") +
        "\n",
    );
    rl.prompt(true);
    return [[], fullLine];
  }
  lastTabLine = fullLine;
  process.stdout.write("\x07");
  return [[], fullLine];
};

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: "$ ",
  completer: (line: string) => {
    const tokens = line.split(" ");
    if (tokens.length > 1) {
      const scriptPath = registeredCompletions.get(tokens[0]);
      if (scriptPath) {
        const arg = tokens[tokens.length - 1];
        const prev = tokens[tokens.length - 2] ?? "";
        try {
          const output = execSync(`${scriptPath} ${tokens[0]} ${arg} ${prev}`, {
            env: {
              ...process.env,
              COMP_LINE: line,
              COMP_POINT: String(line.length),
            },
          }).toString();
          const candidates = output
            .split("\n")
            .filter(Boolean)
            .map((n) => ({ display: n, completion: n + " " }));
          return resolveCompletion(candidates, arg, line);
        } catch {
          return [[], line];
        }
      }
      const arg = tokens[tokens.length - 1];
      const lastSlash = arg.lastIndexOf("/");
      const dirPart = lastSlash >= 0 ? arg.slice(0, lastSlash + 1) : "";
      const fileName = arg.slice(lastSlash + 1);
      const absDir = path.resolve(process.cwd(), dirPart || ".");
      try {
        const candidates = fs
          .readdirSync(absDir, { withFileTypes: true })
          .filter((f) => f.name.startsWith(fileName))
          .map((f) => ({
            display: f.name + (f.isDirectory() ? "/" : ""),
            completion: dirPart + f.name + (f.isDirectory() ? "/" : " "),
          }));
        return resolveCompletion(candidates, arg, line);
      } catch {
        return [[], line];
      }
    }

    const builtinHits = BUILTINS.filter((b) => b.startsWith(line));
    const pathDirs = process.env.PATH?.split(path.delimiter) || [];
    const execHits = pathDirs.flatMap((dir) => {
      try {
        return fs.readdirSync(dir).filter((f) => f.startsWith(line));
      } catch {
        return [];
      }
    });
    const names = [...new Set([...builtinHits, ...execHits])];
    const candidates = names.map((n) => ({ display: n, completion: n + " " }));
    return resolveCompletion(candidates, line, line);
  },
});

const findExec = (cmd: string) => {
  const pathDirs = process.env.PATH?.split(path.delimiter) || [];
  for (const dir of pathDirs) {
    const fullPath = path.join(dir, cmd);
    if (fs.existsSync(fullPath)) {
      try {
        fs.accessSync(fullPath, fs.constants.X_OK);
        return fullPath;
      } catch (err) {}
    }
  }
};

type Redirect = { fd: 1 | 2; append: boolean; file: string };

const parseCmd = (input: string) => {
  const [cmd, ...args] = parse(input) as string[];
  return { cmd, args };
};

const parseRedirect = (
  args: string[],
): { cleanArgs: string[]; redirect: Redirect | null } => {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] as unknown;
    if (typeof arg !== "object") continue;
    const op = (arg as { op: string }).op;
    if (op !== ">" && op !== ">>") continue;
    const hasFd = args[i - 1] === "1" || args[i - 1] === "2";
    return {
      cleanArgs: args.slice(0, hasFd ? i - 1 : i),
      redirect: {
        fd: args[i - 1] === "2" ? 2 : 1,
        append: op === ">>",
        file: args[i + 1],
      },
    };
  }
  return { cleanArgs: args, redirect: null };
};

const lookUp: Record<string, (args: string[]) => string | void> = {
  exit: () => rl.close(),
  echo: (args) => args.join(" "),
  type: (cmd) => {
    const type = cmd[0];
    if (lookUp[type]) return `${type} is a shell builtin`;
    const execPath = findExec(type);
    if (execPath) return `${type} is ${execPath}`;
    else return `${type} not found`;
  },
  pwd: () => process.cwd(),
  cd: (args) => {
    const isTilda = args[0] === "~";
    fs.existsSync(args[0]) || isTilda
      ? process.chdir(isTilda ? process.env.HOME || "" : args[0])
      : console.log(`cd: ${args[0]}: No such file or directory`);
  },
  complete: (args) => {
    const flag = args[0];
    switch (flag) {
      case "-C": {
        const path = args[1];
        const name = args[2];
        registeredCompletions.set(name, path);
        break;
      }
      case "-p": {
        const name = args[1];
        const path = registeredCompletions.get(name);
        if (!path) return `complete: ${name}: no completion specification`;
        return `complete -C '${path}' ${name}`;
      }
      case "-r": {
        const name = args[1];
        registeredCompletions.delete(name);
        break;
      }
    }
  },
  jobs: () => {
    if (!jobs.size) return;
    let jobsTable = "";
    jobs.forEach((value, jobId) => {
      jobsTable += `[${jobId}]${jobId === jobs.size ? "+" : jobId === jobs.size - 1 ? "-" : " "}  Running${" ".repeat(17)}${value.job}\n`;
    });
    return jobsTable.trim();
  },
};

const BUILTINS = Object.keys(lookUp);

rl.on("line", (command) => {
  const { cmd, args } = parseCmd(command);
  const lastArg = args.at(-1);
  const isBackground =
    typeof lastArg === "object" && (lastArg as { op: string }).op === "&";
  if (isBackground) {
    const child = spawn(cmd, args.slice(0, -1) as string[], {
      detached: true,
      stdio: ["ignore", "inherit", "inherit"],
    });
    child.unref();
    const jobId = jobs.size + 1;
    jobs.set(jobId, { pid: child.pid || 0, job: command });
    console.log(`[${jobId}] ${child.pid}`);
    rl.prompt();
    return;
  }
  const { cleanArgs, redirect } = parseRedirect(args);
  const func = lookUp[cmd];
  if (func) {
    const output = func(redirect ? cleanArgs : args);
    if (redirect) {
      const flag = redirect.append ? "a+" : "w";
      const dir = path.dirname(redirect.file);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      if (redirect.fd === 1) {
        writeFileSync(redirect.file, (output ?? "") + "\n", { flag });
      } else {
        if (output !== undefined) console.log(output);
        writeFileSync(redirect.file, "", { flag });
      }
    } else {
      if (output !== undefined) console.log(output);
    }
    if (cmd !== "exit") rl.prompt();
    return;
  }

  const exec = findExec(cmd);
  if (exec) {
    try {
      execSync(command, { stdio: "inherit" });
    } catch {}
  } else console.log(`${command}: command not found`);
  rl.prompt();
});
rl.prompt();
