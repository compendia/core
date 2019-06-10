import { Managers } from "@arkecosystem/crypto";

class Milestone {
    public static getConfig(): any {
        const configManager = Managers.configManager;
        const milestone = configManager.getMilestone();
        return milestone;
    }
}

export { Milestone };
