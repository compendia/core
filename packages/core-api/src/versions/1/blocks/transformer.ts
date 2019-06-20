import { app } from "@arkecosystem/core-container";
import { Blockchain } from "@arkecosystem/core-interfaces";
import { Utils } from "@arkecosystem/crypto";

export const transformBlockLegacy = model => {
    const lastBlock = app.resolvePlugin<Blockchain.IBlockchain>("blockchain").getLastBlock();

    // Fee Update:
    return {
        id: model.id,
        version: model.version,
        timestamp: model.timestamp,
        previousBlock: model.previousBlock,
        height: model.height,
        numberOfTransactions: model.numberOfTransactions,
        totalAmount: +Utils.BigNumber.make(model.totalAmount).toFixed(),
        totalForged: +Utils.BigNumber.make(model.reward)
            .plus(model.totalFee)
            .plus(model.topReward)
            .toString(),
        totalFee: +Utils.BigNumber.make(model.totalFee).toFixed(),
        removedFee: +Utils.BigNumber.make(model.removedFee).toFixed(),
        reward: +Utils.BigNumber.make(model.reward).toFixed(),
        topReward: +Utils.BigNumber.make(model.topReward).toFixed(),
        payloadLength: model.payloadLength,
        payloadHash: model.payloadHash,
        generatorPublicKey: model.generatorPublicKey,
        blockSignature: model.blockSignature,
        confirmations: lastBlock ? lastBlock.data.height - model.height : 0,
    };
};
