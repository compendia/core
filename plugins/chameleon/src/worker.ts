import fs from "fs";
import path from "path";
import { IWorkerOptions } from "./interfaces";

const workerOptions: IWorkerOptions = JSON.parse(process.env.workerInitOptions);
process.chdir(path.dirname(workerOptions.oldWorkerController));

// @ts-ignore
const relativeRequire: object = (name: string): object => {
    let fullname = name;
    if (name && name.length && name.charAt(0) === ".") {
        fullname = path.join(process.cwd(), name);
    }
    return require(fullname);
};

const workerCode: string = fs
    .readFileSync(workerOptions.oldWorkerController)
    .toString()
    .replace(/require\(/g, "relativeRequire(")
    .split("\n")
    .filter(line => line.toLowerCase().indexOf("socket worker") === -1)
    .map(line => {
        if (line.indexOf("async handleSocket") > -1) {
            return `${line}
                return;`;
        } else if (line.indexOf("req.data.headers.remoteAddress = req.socket.remoteAddress") > -1) {
            return "req.data.headers.remoteAddress = \"127.0.0.1\";";
        } else if (
            line.indexOf('version === "internal"') > -1 ||
            line.indexOf("async handleHandshake") > -1
        ) {
            return `${line}
                next();
                return;`;
        }
        return line;
    })
    .join("\n");

// tslint:disable-next-line
eval(workerCode);

process.chdir(workerOptions.oldCwd);
