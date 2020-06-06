import { app } from "@arkecosystem/core-container";
import { Container } from "@arkecosystem/core-interfaces";
import { Chameleon } from "./chameleon";
import { defaults } from "./defaults";
import { IOptions } from "./interfaces";

export const plugin: Container.IPluginDescriptor = {
    pkg: require("../package.json"),
    defaults,
    alias: "core-chameleon",
    async register(container: Container.IContainer, options: IOptions): Promise<Chameleon> {
        if (
            !options.enabled ||
            (options.enabled === "ifDelegate" && !app.getConfig().get("delegates.secrets").length)
        ) {
            return undefined;
        }
        const chameleon: Chameleon = new Chameleon(options);
        await chameleon.start();

        return chameleon;
    },

    async deregister(container: Container.IContainer): Promise<void> {
        const chameleon: Chameleon = container.resolvePlugin(this.alias);
        if (chameleon) {
            return chameleon.stop();
        }
    }
};
