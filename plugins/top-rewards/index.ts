import { EventEmitter, State } from "@arkecosystem/core-interfaces";
import { roundCalculator } from "@arkecosystem/core-utils";
import { Interfaces, Managers, Utils } from "@arkecosystem/crypto";

class TopRewards {
    public static apply(block: Interfaces.IBlockData, walletManager: State.IWalletManager): void {
        const roundInfo = roundCalculator.calculateRound(block.height);

        const balanceWeightMultiplierVal = Managers.configManager.getMilestone(block.height).stakeLevels.balance;
        const balanceWeightMultiplier = balanceWeightMultiplierVal ? balanceWeightMultiplierVal : Utils.BigNumber.ZERO;

        const topDelegateCountVal = Managers.configManager.getMilestone(block.height).topDelegates;
        const topDelegateCount = topDelegateCountVal ? topDelegateCountVal : Utils.BigNumber.ZERO;

        const topDelegateRewardVal = Utils.BigNumber.make(block.topReward).dividedBy(topDelegateCount);
        const topDelegateReward = topDelegateRewardVal ? topDelegateRewardVal : Utils.BigNumber.ZERO;

        const delegates = walletManager.loadActiveDelegateList(roundInfo);

        if (topDelegateReward.isGreaterThan(0)) {
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
                const emitter = new EventEmitter.EventEmitter();
                emitter.emit("top.delegate.rewarded", { publicKey: delegate.publicKey, reward: topDelegateReward });
            }
        }
    }

    public static revert(block: Interfaces.IBlockData, walletManager: State.IWalletManager): void {
        const roundInfo = roundCalculator.calculateRound(block.height);

        const balanceWeightMultiplierVal = Managers.configManager.getMilestone(block.height).stakeLevels.balance;
        const balanceWeightMultiplier = balanceWeightMultiplierVal ? balanceWeightMultiplierVal : Utils.BigNumber.ZERO;

        const topDelegateCountVal = Managers.configManager.getMilestone(block.height).topDelegates;
        const topDelegateCount = topDelegateCountVal ? topDelegateCountVal : Utils.BigNumber.ZERO;

        const topDelegateRewardVal = Utils.BigNumber.make(block.topReward).dividedBy(topDelegateCount);
        const topDelegateReward = topDelegateRewardVal ? topDelegateRewardVal : Utils.BigNumber.ZERO;

        const delegates = walletManager.loadActiveDelegateList(roundInfo);

        if (topDelegateReward.isGreaterThan(0)) {
            for (let i = 0; i < topDelegateCount; i++) {
                const delegate = walletManager.findByPublicKey(delegates[i].publicKey);
                delegate.balance = delegate.balance.minus(topDelegateReward);
                delegate.forgedTopRewards = delegate.forgedTopRewards.minus(topDelegateReward);
                if (delegate.vote) {
                    const votedDelegate: State.IWallet = walletManager.findByPublicKey(delegate.vote);
                    votedDelegate.voteBalance = Utils.BigNumber.make(
                        votedDelegate.voteBalance.minus(topDelegateReward.times(balanceWeightMultiplier).toFixed(0, 1)),
                    );
                }
                const emitter = new EventEmitter.EventEmitter();
                emitter.emit("top.delegate.reward.reverted", {
                    publicKey: delegate.publicKey,
                    reward: topDelegateReward,
                });
            }
        }
    }
}

export { TopRewards };
