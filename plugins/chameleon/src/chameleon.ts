import { app } from "@arkecosystem/core-container";
import { Logger } from "@arkecosystem/core-interfaces";
import { spawnSync } from "child_process";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { SCTransport } from "socketcluster-client/lib/sctransport";
import { inspect } from "util";
import { IAppConfig, IModule, IOptions, IP2P, IPackage, IProcess } from "./interfaces";
import { P2P } from "./p2p";
import { Tor } from "./tor";

import path from "path";

export class Chameleon {
    private tor: IModule;
    private readonly options: IOptions;

    constructor(options: IOptions) {
        this.options = options;
    }

    public async start(): Promise<void> {
        const options: IOptions = this.sanitiseOptions(this.options);
        SCTransport.prototype._uri = SCTransport.prototype.uri;
        SCTransport.prototype.uri = function() {
            return this.options.hostname === "127.0.0.1"
                ? `ws+unix://${options.socket}`
                : this._uri();
        };

        const logger: Logger.ILogger = app.resolvePlugin<Logger.ILogger>("logger");
        logger.info(`Started Core Chameleon for ${app.getName()} process`);

        const getPath: (dir: string) => string = dir =>
            path.join(path.dirname(process.mainModule.filename), dir);
        let appFile: string = `${process.env.CORE_PATH_CONFIG}/app.js`;
        if (!existsSync(appFile)) {
            appFile = getPath(`config/${process.env.CORE_NETWORK_NAME}/app.js`);
        }
        const pkgFile: IPackage = JSON.parse(
            readFileSync(__dirname + "/../package.json").toString()
        );

        let configuredForger: boolean = false;

        if (existsSync(appFile)) {
            const appContents: IAppConfig = require(appFile);

            if (!appContents.cli.forger.run.plugins.include.includes(pkgFile.name)) {
                appContents.cli.forger.run.plugins.include.push(pkgFile.name);
                writeFileSync(
                    `${process.env.CORE_PATH_CONFIG}/app.js`,
                    // tslint:disable-next-line
                    `module.exports = ${inspect(appContents, false, null)}`
                );
                configuredForger = true;
            }
        } else {
            let forgerConfig: string =
                __dirname + "/../../../@arkecosystem/core/dist/commands/forger/run.js";
            if (!existsSync(forgerConfig)) {
                forgerConfig =
                    __dirname +
                    "/../../../node_modules/@arkecosystem/core/dist/commands/forger/run.js";
            }
            if (existsSync(forgerConfig)) {
                const forgerContents: string = readFileSync(forgerConfig).toString();
                if (forgerContents.indexOf(pkgFile.name) === -1) {
                    writeFileSync(
                        forgerConfig,
                        forgerContents.replace(
                            /\"@arkecosystem\/core-forger\",/g,
                            '"@arkecosystem/core-forger",\n                "' + pkgFile.name + '",'
                        )
                    );
                    configuredForger = true;
                }
            } else {
                logger.warn("Core Chameleon could not find app.js or run.js to reconfigure forger");
            }
        }

        if (configuredForger) {
            logger.info("Installed Core Chameleon in forger configuration");

            try {
                const forgerProcess: IProcess = JSON.parse(
                    spawnSync("pm2 jlist", { shell: true })
                        .stdout.toString()
                        .split("\n")
                        .pop()
                ).find(
                    (pm2Process: IProcess) => pm2Process.name === `${process.env.CORE_TOKEN}-forger`
                );
                if (
                    forgerProcess &&
                    forgerProcess.pm2_env &&
                    forgerProcess.pm2_env.status === "online"
                ) {
                    logger.info("Restarting forger process so configuration changes take effect");
                    spawnSync(`pm2 restart ${process.env.CORE_TOKEN}-forger --update-env`, {
                        shell: true
                    });
                }
            } catch (error) {
                logger.warn("Could not determine whether the forger process should be restarted");
            }
        }

        if (!app.getName().endsWith("-forger")) {
            const p2p: IP2P = new P2P(options);
            p2p.init();
            if (this.options.tor.enabled) {
                this.tor = new Tor(options);
                await this.tor.start();
            } else {
                logger.warn("Tor support is disabled in the Core Chameleon configuration options");
                logger.warn("Your true IP address may still appear in the logs of other relays");
            }
            p2p.start();
        }
    }

    public stop(): void {
        if (this.tor) {
            this.tor.stop();
        }
    }

    private sanitiseOptions(options: IOptions): IOptions {
        if (typeof options.tor !== "object") {
            options.tor = { enabled: false, instances: { max: 1, min: 1 }, path: undefined };
        }

        if (typeof options.tor.instances !== "object") {
            options.tor.instances = { max: 1, min: 1 };
        }

        if (isNaN(options.tor.instances.max) || options.tor.instances.max < 1) {
            options.tor.instances.max = 1;
        }

        if (isNaN(options.tor.instances.min) || options.tor.instances.min < 1) {
            options.tor.instances.max = 1;
        }

        if (options.tor.instances.max > 10) {
            options.tor.instances.max = 10;
        }

        if (options.tor.instances.min > 10) {
            options.tor.instances.min = 10;
        }

        if (options.tor.instances.min > options.tor.instances.max) {
            options.tor.instances.min = options.tor.instances.max;
        }

        options.apiSync = !!options.apiSync;
        options.fetchTransactions = !!options.fetchTransactions;
        options.socket = `${process.env.CORE_PATH_TEMP}/chameleon.sock`;

        return options;
    }
}
