import { State } from "@arkecosystem/core-interfaces";
import { delegateCalculator, formatTimestamp } from "@arkecosystem/core-utils";
import { Utils } from "@arkecosystem/crypto";

export const transformDelegate = (delegate: State.IWallet) => {
    const attributes: State.IWalletDelegateAttributes = delegate.getAttribute("delegate");
    const files = delegate.getAttribute("files", {});

    const data = {
        username: attributes.username,
        address: delegate.address,
        publicKey: delegate.publicKey,
        votes: Utils.BigNumber.make(attributes.voteBalance).toFixed(),
        rank: attributes.rank,
        isResigned: !!attributes.resigned,
        blocks: {
            produced: attributes.producedBlocks,
        },
        production: {
            approval: delegateCalculator.calculateApproval(delegate),
        },
        forged: {
            fees: attributes.forgedFees.toFixed(),
            removed: attributes.removedFees.toFixed(),
            rewards: attributes.forgedRewards.toFixed(),
            topRewards: attributes.forgedTopRewards.toFixed(),
            total: delegateCalculator.calculateForgedTotal(delegate),
        },
        files,
    };

    const lastBlock = attributes.lastBlock;

    if (lastBlock) {
        // @ts-ignore
        data.blocks.last = {
            id: lastBlock.id,
            height: lastBlock.height,
            timestamp: formatTimestamp(lastBlock.timestamp),
        };
    }

    return data;
};
