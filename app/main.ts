import { createInterface } from "readline";
import path from "path";
import fs from "fs";
import { execSync } from "child_process";

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: "$ ",
});

const builtins = ["exit", "echo", "type", "pwd"];
const pathDirs = process.env.PATH?.split(path.delimiter) || [];

const findExec = (cmd: string) => {
  for (const dir of pathDirs) {
    const fullPath = path.join(dir, cmd);
    if (fs.existsSync(fullPath)) {
      try {
        fs.accessSync(fullPath, fs.constants.X_OK);
        return fullPath;
      } catch (err) {
        continue;
      }
    }
  }
  return "";
};

rl.on("line", (command) => {
  if (command === "exit") return rl.close();
  else if (command.startsWith("type ")) {
    const type = command.slice(5);
    if (builtins.includes(type)) console.log(`${type} is a shell builtin`);
    else {
      const path = findExec(type);
      if (path) console.log(`${type} is ${path}`);
      else console.log(`${type} not found`);
    }
  } else if (command === "pwd")
    console.log(__dirname.slice(0, __dirname.lastIndexOf("/")));
  else if (findExec(command.split(" ")[0])) {
    execSync(command, { stdio: "inherit" });
  } else console.log(`${command}: command not found`);
  rl.prompt();
});
rl.prompt();
