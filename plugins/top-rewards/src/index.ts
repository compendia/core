import { app } from "@arkecosystem/core-container";
import {
    // Container,
    Database,
    EventEmitter,
    // Logger,
    // Shared,
    State,
    TransactionPool,
} from "@arkecosystem/core-interfaces";
import { roundCalculator } from "@arkecosystem/core-utils";
import { Interfaces, Managers, Utils } from "@arkecosystem/crypto";
// import { asValue } from "awilix";

// const emitter = app.resolvePlugin<EventEmitter.EventEmitter>("event-emitter");

// const defaults = {};

// export const plugin: Container.IPluginDescriptor = {
//     pkg: require("../package.json"),
//     defaults,
//     alias: "top-rewards",
//     async register(container: Container.IContainer, options) {
//         container.resolvePlugin<Logger.ILogger>("logger").info("Bootstrapping Top Rewards");
//         await TopRewards.bootstrap();
//         container.resolvePlugin<Logger.ILogger>("logger").info("Bootstrapping Top Rewards Complete");
//         emitter.on("block.applied", async (block: Interfaces.IBlockData) => {
//             const roundInfo = roundCalculator.calculateRound(block.height);
//             if (roundInfo.roundHeight === block.height) {
//                     await TopRewards.saveTopDelegates(roundInfo);
//                     if (block.height > 1) await TopRewards.applyRewardForPreviousRound(block.height);
//             }
//         });
//         emitter.on("block.reverted", async block => {
//             const roundInfo = roundCalculator.calculateRound(block.height);
//             if (roundInfo.roundHeight === block.height) {
//                 await TopRewards.revertRewardForPreviousRound(block);
//             }
//         });
//     },
//     async deregister(container: Container.IContainer, options) {
//         container.resolvePlugin<Logger.ILogger>("logger").info("Deregistering Top Rewards Plugin");
//     },
// };

class TopRewards {
    public static async applyTopRewardsForRound(
        round: number,
        lastTop: string,
        emitEvents: boolean = true,
    ): Promise<{ rewardedDelegates; totalReward; roundInfo } | void> {
        const databaseService: Database.IDatabaseService = app.resolvePlugin<Database.IDatabaseService>("database");
        const poolService: TransactionPool.IConnection = app.resolvePlugin<TransactionPool.IConnection>(
            "transaction-pool",
        );
        const roundInfo = roundCalculator.calculateRound(round);
        const delegatesCount = Managers.configManager.getMilestone(round).activeDelegates;
        const topReward = Managers.configManager.getMilestone(round).topReward;
        const topDelegatesStr = lastTop;
        if (topDelegatesStr) {
            const topDelegates = topDelegatesStr.split(",");

            const topDelegateReward = Utils.BigNumber.make(topReward)
                .dividedBy(topDelegates.length)
                .times(delegatesCount);

            const rewardedDelegates = [];
            let totalReward = Utils.BigNumber.ZERO;
            if (topDelegates.length) {
                for (const publicKey of topDelegates) {
                    const delegate = databaseService.walletManager.findByPublicKey(publicKey);
                    const poolDelegate = poolService.walletManager.findByPublicKey(publicKey);
                    // const delegateLastBlock = delegate.getAttribute("delegate.lastBlock", { height: 0 });
                    // const delegateLastRound = roundCalculator.calculateRound(delegateLastBlock.height);
                    // if (delegateLastRound.round >= roundInfo.round) {
                    this.addRewards(delegate, topDelegateReward, databaseService.walletManager);
                    this.addRewards(poolDelegate, topDelegateReward, poolService.walletManager);
                    rewardedDelegates.push(publicKey);
                    totalReward = totalReward.plus(topDelegateReward);
                    // }
                }

                console.log({
                    rewardedDelegates,
                    totalReward,
                    roundInfo,
                });

                if (emitEvents) {
                    app.resolvePlugin<EventEmitter.EventEmitter>("event-emitter").emit("top.delegates.rewarded", {
                        rewardedDelegates,
                        totalReward,
                        roundInfo,
                    });
                }

                return {
                    rewardedDelegates,
                    totalReward,
                    roundInfo,
                };
            }
        }
        return undefined;
    }

    public static async revertRewardForPreviousRound(
        newBlock: Interfaces.IBlockData,
        emitEvents: boolean = true,
    ): Promise<void> {
        const databaseService: Database.IDatabaseService = app.resolvePlugin<Database.IDatabaseService>("database");
        const poolService: TransactionPool.IConnection = app.resolvePlugin<TransactionPool.IConnection>(
            "transaction-pool",
        );
        const block = await databaseService.blocksBusinessRepository.findByHeight(newBlock.height - 1);
        const roundInfo = roundCalculator.calculateRound(block.height);
        const topDelegatesList = this.getTopDelegatePublicKeys(roundInfo.round);
        const delegatesCount = Managers.configManager.getMilestone(block.height).activeDelegates;
        const topDelegateReward = Utils.BigNumber.make(block.topReward)
            .dividedBy(topDelegatesList.length)
            .times(delegatesCount);

        const rewardedDelegates = [];
        let totalReward = Utils.BigNumber.ZERO;
        if (topDelegatesList.length > 0) {
            for (const publicKey of topDelegatesList) {
                const delegate = databaseService.walletManager.findByPublicKey(publicKey);
                const poolDelegate = poolService.walletManager.findByPublicKey(publicKey);
                const delegateLastBlock = delegate.getAttribute("delegate.lastBlock", { height: 0 });
                const delegateLastRound = roundCalculator.calculateRound(delegateLastBlock.height);
                if (delegateLastRound.round >= roundInfo.round) {
                    this.removeRewards(delegate, topDelegateReward, databaseService.walletManager);
                    this.removeRewards(poolDelegate, topDelegateReward, poolService.walletManager);
                    rewardedDelegates.push(publicKey);
                    totalReward = totalReward.plus(topDelegateReward);
                }
            }

            if (emitEvents) {
                app.resolvePlugin<EventEmitter.EventEmitter>("event-emitter").emit("top.delegates.reverted", {
                    rewardedDelegates,
                    totalReward,
                    roundInfo,
                });
            }
        }
    }
    // public static async bootstrap(): Promise<void> {
    //     const databaseService: Database.IDatabaseService = app.resolvePlugin<Database.IDatabaseService>("database");

    //     let lastHeight = 1;
    //     const lastBlock = await databaseService.connection.blocksRepository.latest();
    //     if (lastBlock) lastHeight = lastBlock.height;
    //     console.log(`LAST HEIGHT: ${lastHeight}`)
    //     for (let i = 2; i <= lastHeight; i++) {
    //         const roundInfo = roundCalculator.calculateRound(i);
    //         if (roundInfo.roundHeight === i || i === 2) {
    //             await TopRewards.saveTopDelegates(roundInfo);
    //             if (roundInfo.round > 1) TopRewards.applyTopRewardsForRound(i, false);
    //         }
    //     }
    // }

    // public static async saveTopDelegates(roundInfo: Shared.IRoundInfo): Promise<void> {
    //     const databaseService: Database.IDatabaseService = app.resolvePlugin<Database.IDatabaseService>("database");
    //     let tdGlobal = [];
    //     const topDelegates = await redis.get(`topDelegates:${roundInfo.round}`);

    //     if (app.has("top.delegates")) tdGlobal = app.resolve("top.delegates");

    //     if (roundInfo.round in tdGlobal) {
    //         topDelegates = tdGlobal[roundInfo.round];
    //     } else if (roundDb && String(roundDb.topDelegates).length > 0 && String(roundDb.topDelegates).split(',')[0].length === 66) {
    //         topDelegates = String(roundDb.topDelegates).split(',');
    //     } else {
    //         const topDelegatesCount = Managers.configManager.getMilestone(roundInfo.roundHeight).topDelegates;
    //         const delegates = databaseService.walletManager.loadActiveDelegateList(roundInfo);
    //         let i = 0;
    //         for (const delegate of delegates) {
    //             if (i < topDelegatesCount)
    //                 topDelegates.push(delegate.publicKey);
    //             else
    //                 break;
    //             i++;
    //         }
    //     }

    //     if (topDelegates.length > 0) {
    //         tdGlobal[roundInfo.round] = topDelegates;
    //     }

    //     app.register("top.delegates", asValue(tdGlobal));

    //     if (app.has("top.delegates")) {
    //         console.log("Top delegates:")
    //         console.log(app.resolve("top.delegates").length);
    //     }

    // }

    private static getTopDelegatePublicKeys(round: number): string[] {
        let tdGlobal = [];
        let roundDelegates = [];
        if (app.has("top.delegates")) {
            tdGlobal = app.resolve("top.delegates");
        }
        if (round in tdGlobal) {
            roundDelegates = tdGlobal[round];
        }
        return roundDelegates;
    }

    private static addRewards(delegate: State.IWallet, topDelegateReward, walletManager) {
        delegate.balance = delegate.balance.plus(topDelegateReward);
        delegate.setAttribute(
            "delegate.forgedTopRewards",
            delegate
                .getAttribute<Utils.BigNumber>("delegate.forgedTopRewards", Utils.BigNumber.ZERO)
                .plus(topDelegateReward),
        );
        if (delegate.hasVoted()) {
            const votedDelegate: State.IWallet = walletManager.findByPublicKey(delegate.getAttribute("vote"));
            votedDelegate.setAttribute(
                "delegate.voteBalance",
                Utils.BigNumber.make(
                    votedDelegate.getAttribute("delegate.voteBalance").plus(topDelegateReward.toFixed()),
                ),
            );
            walletManager.reindex(votedDelegate);
        }
        walletManager.reindex(delegate);
    }

    private static removeRewards(delegate: State.IWallet, topDelegateReward, walletManager) {
        delegate.balance = delegate.balance.minus(topDelegateReward);
        delegate.setAttribute(
            "delegate.forgedTopRewards",
            delegate.getAttribute("delegate.forgedTopRewards").minus(topDelegateReward),
        );
        if (delegate.hasVoted()) {
            const votedDelegate: State.IWallet = walletManager.findByPublicKey(delegate.getAttribute("vote"));
            votedDelegate.setAttribute(
                "delegate.voteBalance",
                Utils.BigNumber.make(
                    votedDelegate.getAttribute("delegate.voteBalance").minus(topDelegateReward.toFixed()),
                ),
            );
            walletManager.reindex(votedDelegate);
        }
        walletManager.reindex(delegate);
    }
}

export { TopRewards };
