import { createInterface } from "readline";

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: "$ ",
});

const builtins = ["exit", "echo", "type"];

rl.on("line", (command) => {
  if (command === "exit") {
    rl.close();
    return;
  } else if (command.startsWith("echo ")) {
    console.log(command.slice(5));
  } else if (command.startsWith("type ")) {
    const type = command.slice(5);
    if (builtins.includes(type)) {
      console.log(`${type} is a shell builtin`);
    } else {
      console.log(`${type} not found`);
    }
  } else {
    console.log(`${command}: command not found`);
  }
  rl.prompt();
});
rl.prompt();
