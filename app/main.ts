import { createInterface } from "readline";
import path from "path";
import fs from "fs";
import { execSync } from "child_process";

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
  const [cmd, ...args] = input.split(" ");
  return { cmd, args };
};

const lookUp: Record<string, (args: string[]) => void> = {
  exit: () => rl.close(),
  echo: (args) => console.log(args.join(" ")),
  type: (cmd) => {
    const type = cmd[0];
    if (lookUp[type]) return console.log(`${type} is a shell builtin`);
    const path = findExec(type);
    if (path) console.log(`${type} is ${path}`);
    else console.log(`${type} not found`);
  },
  pwd: () => console.log(process.cwd()),
  cd: (args) => {
    const isTilda = args[0] === "~";
    fs.existsSync(args[0]) || isTilda
      ? process.chdir(isTilda ? process.env.HOME || "" : args[0])
      : console.log(`cd: ${args[0]}: No such file or directory`);
  },
};

rl.on("line", (command) => {
  const { cmd, args } = parseCmd(command);
  const func = lookUp[cmd];
  if (func) {
    func(args);
    if (cmd !== "exit") rl.prompt();
    return;
  }

  const exec = findExec(cmd);
  if (exec) execSync(command, { stdio: "inherit" });
  else console.log(`${command}: command not found`);
  rl.prompt();
});
rl.prompt();
