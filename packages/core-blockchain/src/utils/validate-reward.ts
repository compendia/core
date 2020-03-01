import { app } from "@arkecosystem/core-container";
import { Database, Logger, State } from "@arkecosystem/core-interfaces";
import { Interfaces, Managers } from "@arkecosystem/crypto";

export const validateReward = async (block: Interfaces.IBlock): Promise<boolean> => {
    const database: Database.IDatabaseService = app.resolvePlugin<Database.IDatabaseService>("database");
    const logger: Logger.ILogger = app.resolvePlugin<Logger.ILogger>("logger");

    const milestones = Managers.configManager.getMilestone(block.data.height);

    const generator: State.IWallet = database.walletManager.findByPublicKey(block.data.generatorPublicKey);
    const generatorUsername: string = generator.getAttribute("delegate.username");
    const generatorRank: number = generator.getAttribute("delegate.rank");

    if (milestones.topReward !== milestones.reward) {
        if (block.data.reward.isEqualTo(milestones.topReward) && generatorRank > milestones.topDelegates) {
            // Should return false if the block reward is a topReward but the forger rank is greater than topDelegates.
            logger.warn(
                `Delegate ${generatorUsername} (${
                    block.data.generatorPublicKey
                }) should not receive a topReward (${Number(milestones.topReward) /
                    1e8}). Should be regular reward (${Number(milestones.reward) / 1e8}).`,
            );
            return false;
        } else if (block.data.reward.isEqualTo(milestones.reward) && generatorRank <= milestones.topDelegates) {
            // Should return false if the block reward is a regular reward but the forger rank is within topDelegates.
            logger.warn(
                `Delegate ${generatorUsername} (${
                    block.data.generatorPublicKey
                }) should not receive regular reward (${Number(milestones.reward) /
                    1e8}). Should be topRreward (${Number(milestones.topReward) / 1e8}).`,
            );
            return false;
        }
    }

    logger.debug(
        `Delegate ${generatorUsername} (${block.data.generatorPublicKey}) can receive block reward of ${Number(
            block.data.reward.toString(),
        ) / 1e8}.`,
    );
    return true;
};
