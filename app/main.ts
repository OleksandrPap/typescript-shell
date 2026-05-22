import { createInterface } from "readline";
import path from "path";
import fs, { writeFileSync } from "fs";
import { execSync } from "child_process";
import { parse } from "shell-quote";

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: "$ ",
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

const parseCmd = (input: string) => {
  const [cmd, ...args] = parse(input) as string[];
  return { cmd, args };
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
};

rl.on("line", (command) => {
  const { cmd, args } = parseCmd(command);
  let operatorIndex = -1;
  args.map((arg, index) => {
    if (typeof arg === "object" && (arg as { op: string }).op === ">") {
      operatorIndex = index;
    }
  });
  const func = lookUp[cmd];
  if (func) {
    if (operatorIndex !== -1) {
      const output = func(
        args.slice(
          0,
          args[operatorIndex - 1] === "1" ? operatorIndex - 1 : operatorIndex,
        ),
      );
      writeFileSync(args[operatorIndex + 1], (output ?? "") + "\n");
    } else {
      const output = func(args);
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
