import { app } from "@arkecosystem/core-container";
import { EventEmitter, State } from "@arkecosystem/core-interfaces";
import { roundCalculator } from "@arkecosystem/core-utils";
import { Interfaces, Managers, Utils } from "@arkecosystem/crypto";

class TopRewards {
    public static applyReward(block: Interfaces.IBlockData, walletManager: State.IWalletManager): void {
        const roundInfo = roundCalculator.calculateRound(block.height);
        const topDelegateCountVal = Managers.configManager.getMilestone(block.height).topDelegates;
        const topDelegateCount = topDelegateCountVal ? topDelegateCountVal : Utils.BigNumber.ZERO;

        if (topDelegateCount.isGreaterThan(0)) {
            const balanceWeightMultiplierVal = Managers.configManager.getMilestone(block.height).balanceVoteWeight;
            const balanceWeightMultiplier = balanceWeightMultiplierVal
                ? balanceWeightMultiplierVal
                : Utils.BigNumber.ZERO;
            const topDelegateRewardVal = Utils.BigNumber.make(block.topReward).dividedBy(topDelegateCount);
            const topDelegateReward = topDelegateRewardVal ? topDelegateRewardVal : Utils.BigNumber.ZERO;

            if (topDelegateReward.isGreaterThan(0)) {
                const delegates = walletManager.loadActiveDelegateList(roundInfo);
                const rewardedDelegates = [];
                for (let i = 0; i < topDelegateCount; i++) {
                    const delegate = walletManager.findByPublicKey(delegates[i].publicKey);
                    delegate.balance = delegate.balance.plus(topDelegateReward);
                    delegate.setAttribute(
                        "forgedTopRewards",
                        delegate.getAttribute<Utils.BigNumber>("forgedTopRewards").plus(topDelegateReward),
                    );
                    if (delegate.hasVoted()) {
                        const votedDelegate: State.IWallet = walletManager.findByPublicKey(
                            delegate.getAttribute("vote"),
                        );
                        votedDelegate.setAttribute(
                            "voteBalance",
                            Utils.BigNumber.make(
                                votedDelegate
                                    .getAttribute<Utils.BigNumber>("voteBalance")
                                    .plus(topDelegateReward.times(balanceWeightMultiplier).toFixed()),
                            ),
                        );
                        walletManager.reindex(votedDelegate);
                    }
                    rewardedDelegates[i] = delegate.publicKey;
                    walletManager.reindex(delegate);
                }
                this.emitter.emit("top.delegates.rewarded", rewardedDelegates, topDelegateReward);
            }
        }
    }

    public static revertReward(block: Interfaces.IBlockData, walletManager: State.IWalletManager): void {
        const roundInfo = roundCalculator.calculateRound(block.height);
        const topDelegateCountVal = Managers.configManager.getMilestone(block.height).topDelegates;
        const topDelegateCount = topDelegateCountVal ? topDelegateCountVal : Utils.BigNumber.ZERO;

        if (topDelegateCount.isGreaterThan(0)) {
            const topDelegateRewardVal = Utils.BigNumber.make(block.topReward).dividedBy(topDelegateCount);
            const topDelegateReward = topDelegateRewardVal ? topDelegateRewardVal : Utils.BigNumber.ZERO;
            const balanceWeightMultiplierVal = Managers.configManager.getMilestone(block.height).balanceVoteWeight;
            const balanceWeightMultiplier = balanceWeightMultiplierVal
                ? balanceWeightMultiplierVal
                : Utils.BigNumber.ZERO;
            if (topDelegateReward.isGreaterThan(0)) {
                const delegates = walletManager.loadActiveDelegateList(roundInfo);
                const rewardedDelegates = [];
                for (let i = 0; i < topDelegateCount; i++) {
                    const delegate = walletManager.findByPublicKey(delegates[i].publicKey);
                    delegate.balance = delegate.balance.minus(topDelegateReward);
                    delegate.setAttribute(
                        "forgedTopRewards",
                        delegate.getAttribute("forgedTopRewards").minus(topDelegateReward),
                    );
                    if (delegate.hasVoted()) {
                        const votedDelegate: State.IWallet = walletManager.findByPublicKey(
                            delegate.getAttribute("vote"),
                        );
                        votedDelegate.setAttribute(
                            "voteBalance",
                            Utils.BigNumber.make(
                                votedDelegate
                                    .getAttribute("voteBalance")
                                    .minus(topDelegateReward.times(balanceWeightMultiplier).toFixed()),
                            ),
                        );
                        walletManager.reindex(votedDelegate);
                    }
                    rewardedDelegates[i] = delegate.publicKey;
                    walletManager.reindex(delegate);
                }
                this.emitter.emit("top.delegate.rewards.reverted", rewardedDelegates, topDelegateReward);
            }
        }
    }

    private static readonly emitter: EventEmitter.EventEmitter = app.resolvePlugin<EventEmitter.EventEmitter>(
        "event-emitter",
    );
}

export { TopRewards };
