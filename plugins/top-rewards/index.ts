import { app } from "@arkecosystem/core-container";
import { EventEmitter, State } from "@arkecosystem/core-interfaces";
import { roundCalculator } from "@arkecosystem/core-utils";
import { Interfaces, Managers, Utils } from "@arkecosystem/crypto";

class TopRewards {
    public static applyReward(block: Interfaces.IBlockData, walletManager: State.IWalletManager): void {
        const roundInfo = roundCalculator.calculateRound(block.height);

        const balanceWeightMultiplierVal = Managers.configManager.getMilestone(block.height).stakeLevels.balance;
        const balanceWeightMultiplier = balanceWeightMultiplierVal ? balanceWeightMultiplierVal : Utils.BigNumber.ZERO;

        const topDelegateCountVal = Managers.configManager.getMilestone(block.height).topDelegates;
        const topDelegateCount = topDelegateCountVal ? topDelegateCountVal : Utils.BigNumber.ZERO;

        const topDelegateRewardVal = Utils.BigNumber.make(block.topReward).dividedBy(topDelegateCount);
        const topDelegateReward = topDelegateRewardVal ? topDelegateRewardVal : Utils.BigNumber.ZERO;

        const delegates = walletManager.loadActiveDelegateList(roundInfo);

        if (topDelegateReward.isGreaterThan(0)) {
            const rewardedDelegates = [];
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
                rewardedDelegates[i] = delegate.publicKey;
            }
            this.emitter.emit("top.delegates.rewarded", rewardedDelegates, topDelegateReward);
        }
    }

    public static revertReward(block: Interfaces.IBlockData, walletManager: State.IWalletManager): void {
        const roundInfo = roundCalculator.calculateRound(block.height);

        const balanceWeightMultiplierVal = Managers.configManager.getMilestone(block.height).stakeLevels.balance;
        const balanceWeightMultiplier = balanceWeightMultiplierVal ? balanceWeightMultiplierVal : Utils.BigNumber.ZERO;

        const topDelegateCountVal = Managers.configManager.getMilestone(block.height).topDelegates;
        const topDelegateCount = topDelegateCountVal ? topDelegateCountVal : Utils.BigNumber.ZERO;

        const topDelegateRewardVal = Utils.BigNumber.make(block.topReward).dividedBy(topDelegateCount);
        const topDelegateReward = topDelegateRewardVal ? topDelegateRewardVal : Utils.BigNumber.ZERO;

        const delegates = walletManager.loadActiveDelegateList(roundInfo);

        if (topDelegateReward.isGreaterThan(0)) {
            const rewardedDelegates = [];
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
                rewardedDelegates[i] = delegate.publicKey;
            }
            this.emitter.emit("top.delegate.reward.reverted", rewardedDelegates, topDelegateReward);
        }
    }

    private static readonly emitter: EventEmitter.EventEmitter = app.resolvePlugin<EventEmitter.EventEmitter>(
        "event-emitter",
    );
}

export { TopRewards };
