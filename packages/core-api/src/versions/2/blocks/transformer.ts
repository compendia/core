import { app } from "@arkecosystem/core-container";
import { Blockchain, Database } from "@arkecosystem/core-interfaces";
import { formatTimestamp } from "@arkecosystem/core-utils";
import { Utils } from "@arkecosystem/crypto";

// TODO
export const transformBlock = model => {
    const databaseService = app.resolvePlugin<Database.IDatabaseService>("database");
    const generator = databaseService.walletManager.findByPublicKey(model.generatorPublicKey);
    const lastBlock = app.resolvePlugin<Blockchain.IBlockchain>("blockchain").getLastBlock();

    model.reward = Utils.BigNumber.make(model.reward);
    model.topReward = Utils.BigNumber.make(model.topReward);
    model.totalFee = Utils.BigNumber.make(model.totalFee);
    model.removedFee = Utils.BigNumber.make(model.removedFee);

    return {
        id: model.id,
        version: +model.version,
        height: +model.height,
        previous: model.previousBlock,
        forged: {
            reward: +model.reward.toFixed(),
            topReward: +model.topReward.toFixed(),
            fee: +model.totalFee.toFixed(),
            removed: +model.removedFee.toFixed(),
            total: +model.reward.plus(model.totalFee).toFixed(),
            amount: +Utils.BigNumber.make(model.totalAmount).toFixed(),
        },
        payload: {
            hash: model.payloadHash,
            length: model.payloadLength,
        },
        generator: {
            username: generator.username,
            address: generator.address,
            publicKey: generator.publicKey,
        },
        signature: model.blockSignature,
        confirmations: lastBlock ? lastBlock.data.height - model.height : 0,
        transactions: model.numberOfTransactions,
        timestamp: formatTimestamp(model.timestamp),
    };
};
