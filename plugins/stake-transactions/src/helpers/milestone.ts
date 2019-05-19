import { app } from "@arkecosystem/core-container";
import { State } from "@arkecosystem/core-interfaces";
import { Managers } from "@arkecosystem/crypto";

class Milestone {
    public static getConfig(): any {
        const configManager = Managers.configManager;
        const lastBlock = app
            .resolvePlugin<State.IStateService>("state")
            .getStore()
            .getLastBlock();
        const milestone = configManager.getMilestone(lastBlock.data.height);
        return milestone;
    }
}

export { Milestone };
