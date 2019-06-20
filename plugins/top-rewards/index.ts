import { app } from "@arkecosystem/core-container";
import { EventEmitter, State } from "@arkecosystem/core-interfaces";
import { roundCalculator } from "@arkecosystem/core-utils";
import { Interfaces, Managers, Utils } from "@arkecosystem/crypto";

class TopRewards {
    public static apply(block: Interfaces.IBlockData, emit: boolean = false): void {
        const database = app.resolvePlugin("database");
        const walletManager: State.IWalletManager = database.walletManager;
        const roundInfo = roundCalculator.calculateRound(block.height);

        const balanceWeightMultiplier = Managers.configManager.getMilestone(block.height).stakeLevels.balance;
        const topDelegateCount = Managers.configManager.getMilestone(block.height).topDelegates;
        const topDelegateReward = Utils.BigNumber.make(block.topReward).dividedBy(topDelegateCount);
        const delegates = walletManager.loadActiveDelegateList(roundInfo);

        for (let i = 0; i < topDelegateCount; i++) {
            const delegate = walletManager.findByPublicKey(delegates[i].publicKey);
            delegate.balance = delegate.balance.plus(topDelegateReward);
            delegate.forgedTopRewards = delegate.forgedTopRewards.plus(topDelegateReward);
            if (delegate.vote) {
                const votedDelegate: State.IWallet = walletManager.findByPublicKey(delegate.vote);
                votedDelegate.voteBalance = Utils.BigNumber.make(
                    votedDelegate.voteBalance.plus(topDelegateReward.times(balanceWeightMultiplier).toFixed(0, 1)),
                );
            }
            if (emit) {
                const emitter = new EventEmitter.EventEmitter();
                emitter.emit("top.delegate.rewarded", { publicKey: delegate.publicKey, reward: topDelegateReward });
            }
        }
    }

    public static revert(block: Interfaces.IBlockData, emit: boolean = false): void {
        const database = app.resolvePlugin("database");
        const walletManager: State.IWalletManager = database.walletManager;
        const roundInfo = roundCalculator.calculateRound(block.height);

        const balanceWeightMultiplier = Managers.configManager.getMilestone(block.height).stakeLevels.balance;
        const topDelegateCount = Managers.configManager.getMilestone(block.height).topDelegates;
        const topDelegateReward = Utils.BigNumber.make(
            Managers.configManager.getMilestone(block.height).individualRewards.topDelegate,
        ).dividedBy(topDelegateCount);
        const delegates = walletManager.loadActiveDelegateList(roundInfo);

        for (let i = 0; i < topDelegateCount; i++) {
            const delegate = walletManager.findByPublicKey(delegates[i].publicKey);
            delegate.balance = delegate.balance.minus(topDelegateReward);
            delegate.forgedTopRewards = delegate.forgedTopRewards.minus(topDelegateReward);
            if (delegate.vote) {
                const votedDelegate: State.IWallet = walletManager.findByPublicKey(delegate.vote);
                votedDelegate.voteBalance = Utils.BigNumber.make(
                    votedDelegate.voteBalance.minus(topDelegateReward.times(balanceWeightMultiplier).toFixed(0, 1)),
                );
                const emitter = new EventEmitter.EventEmitter();
                emitter.emit("top.delegate.rewarded", { publicKey: delegate.publicKey, reward: topDelegateReward });
            }
            if (emit) {
                const emitter = new EventEmitter.EventEmitter();
                emitter.emit("top.delegate.rewarded", { publicKey: delegate.publicKey, reward: topDelegateReward });
            }
        }
    }
}

export { TopRewards };
