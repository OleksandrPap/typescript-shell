import { createInterface } from "readline";
import path from "path";
import fs from "fs";

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: "$ ",
});

const builtins = ["exit", "echo", "type"];
const pathDirs = process.env.PATH?.split(path.delimiter) || [];

rl.on("line", (command) => {
  if (command === "exit") return rl.close();
  else if (command.startsWith("echo ")) console.log(command.slice(5));
  else if (command.startsWith("type ")) {
    const type = command.slice(5);
    if (builtins.includes(type)) console.log(`${type} is a shell builtin`);
    else {
      let found = false;
      for (const dir of pathDirs) {
        const fullPath = path.join(dir, type);
        if (fs.existsSync(fullPath)) {
          try {
            fs.accessSync(fullPath, fs.constants.X_OK);
            console.log(`${type} is ${fullPath}`);
            found = true;
            break;
          } catch (err) {
            continue;
          }
        }
      }
      if (!found) console.log(`${type} not found`);
    }
  } else console.log(`${command}: command not found`);
  rl.prompt();
});
rl.prompt();
