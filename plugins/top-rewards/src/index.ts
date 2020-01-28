import { app } from "@arkecosystem/core-container";
import {
    Container,
    Database,
    EventEmitter,
    Logger,
    Shared,
    State,
    TransactionPool,
} from "@arkecosystem/core-interfaces";
import { roundCalculator } from "@arkecosystem/core-utils";
import { Interfaces, Managers, Utils } from "@arkecosystem/crypto";
import { Round } from "@nosplatform/storage";
import { asValue } from "awilix";

const emitter = app.resolvePlugin<EventEmitter.EventEmitter>("event-emitter");
const databaseService: Database.IDatabaseService = app.resolvePlugin<Database.IDatabaseService>("database");
const poolService: TransactionPool.IConnection = app.resolvePlugin<TransactionPool.IConnection>("transaction-pool");

const defaults = {};

export const plugin: Container.IPluginDescriptor = {
    pkg: require("../package.json"),
    defaults,
    alias: "top-rewards",
    async register(container: Container.IContainer, options) {
        container.resolvePlugin<Logger.ILogger>("logger").info("Bootstrapping Top Rewards");
        TopRewards.bootstrap();
        container.resolvePlugin<Logger.ILogger>("logger").info("Bootstrapping Top Rewards Complete");

        emitter.on("block.applied", async block => {
            TopRewards.applyReward(block);
        });
    },
    async deregister(container: Container.IContainer, options) {
        container.resolvePlugin<Logger.ILogger>("logger").info("Deregistering Top Rewards Plugin");
    },
};

class TopRewards {
    public static async bootstrap(): Promise<void> {
        const lastBlock = await databaseService.connection.blocksRepository.latest();
        if (lastBlock) {
            for (let i = 0; i < lastBlock.height; i++) {
                let roundInfo: Shared.IRoundInfo;
                // Some unit tests call applyReward without a calculateRound fixture, so we make one.
                if (process.env.NODE_ENV === "test" && app.getConfig().config === undefined) {
                    console.log("TopRewards not in production mode");
                    roundInfo = { round: 1, roundHeight: 1, nextRound: 2, maxDelegates: 47 };
                } else {
                    roundInfo = roundCalculator.calculateRound(i);
                }

                const topDelegateCountVal = Managers.configManager.getMilestone(i).topDelegates;
                const topDelegateCount = topDelegateCountVal || 0;

                if (topDelegateCount > 0) {
                    const topDelegateRewardVal = Utils.BigNumber.make(
                        Managers.configManager.getMilestone(i).topReward,
                    ).dividedBy(topDelegateCount);
                    const topDelegateReward: Utils.BigNumber = topDelegateRewardVal || Utils.BigNumber.ZERO;
                    if (topDelegateReward.isGreaterThan(0)) {
                        const roundDelegates = await Round.findOne(roundInfo.round);
                        const rewardedDelegates = [];
                        if (roundDelegates && String(roundDelegates.topDelegates.split(",")[0]).length === 66) {
                            const delegatesList = roundDelegates.topDelegates.split(",");
                            if (delegatesList.length > 0) {
                                for (let i = 0; i < topDelegateCount; i++) {
                                    const delegate = databaseService.walletManager.findByPublicKey(delegatesList[i]);
                                    const poolDelegate = poolService.walletManager.findByPublicKey(delegatesList[i]);
                                    this.addRewards(delegate, topDelegateReward, databaseService);
                                    this.addRewards(poolDelegate, topDelegateReward, poolService);
                                    rewardedDelegates[i] = delegatesList[i];
                                }
                            }
                            let tdGlobal = [];
                            if (app.has("top.delegates")) {
                                tdGlobal = app.resolve("top.delegates");
                            }
                            if (!(roundInfo.round in tdGlobal) && rewardedDelegates.length > 0) {
                                tdGlobal[roundInfo.round] = rewardedDelegates;
                                app.register("top.delegates", asValue(tdGlobal));
                            }
                        }
                    }
                }
            }
        }
    }

    public static async applyReward(block: Interfaces.IBlockData, emitEvents: boolean = true): Promise<void> {
        let roundInfo: Shared.IRoundInfo;

        // Some unit tests call applyReward without a calculateRound fixture, so we make one.
        if (process.env.NODE_ENV === "test" && app.getConfig().config === undefined) {
            console.log("TopRewards not in production mode");
            roundInfo = { round: 1, roundHeight: 1, nextRound: 2, maxDelegates: 47 };
        } else {
            roundInfo = roundCalculator.calculateRound(block.height);
        }

        const topDelegateCountVal = Managers.configManager.getMilestone(block.height).topDelegates;
        const topDelegateCount = topDelegateCountVal || Utils.BigNumber.ZERO;

        if (topDelegateCount > 0 && block.topReward && Utils.BigNumber.make(block.topReward).isGreaterThan(0)) {
            const topDelegateRewardVal = Utils.BigNumber.make(block.topReward).dividedBy(topDelegateCount);
            const topDelegateReward = topDelegateRewardVal || Utils.BigNumber.ZERO;
            let delegates;
            let delegatesList = [];
            let roundDelegates;
            roundDelegates = await Round.findOne(roundInfo.round);

            // Check if Round exists in db, otherwise get latest active delegates
            if (roundDelegates && String(roundDelegates.topDelegates.split(",")[0]).length === 66) {
                delegatesList = roundDelegates.topDelegates.split(",");
            } else {
                delegates = databaseService.walletManager.loadActiveDelegateList(roundInfo);
                for (const delegate of delegates) {
                    delegatesList.push(delegate.publicKey);
                }
            }

            const rewardedDelegates = [];
            if (delegatesList.length > 0) {
                for (let i = 0; i < topDelegateCount; i++) {
                    const delegate = databaseService.walletManager.findByPublicKey(delegatesList[i]);
                    const poolDelegate = poolService.walletManager.findByPublicKey(delegatesList[i]);
                    this.addRewards(delegate, topDelegateReward, databaseService.walletManager);
                    this.addRewards(poolDelegate, topDelegateReward, poolService.walletManager);
                    rewardedDelegates[i] = delegatesList[i];
                }

                let tdGlobal = [];
                if (app.has("top.delegates")) {
                    tdGlobal = app.resolve("top.delegates");
                }

                if (!(roundInfo.round in tdGlobal) && rewardedDelegates.length > 0) {
                    tdGlobal[roundInfo.round] = rewardedDelegates;
                    app.register("top.delegates", asValue(tdGlobal));
                }

                if (emitEvents) {
                    app.resolvePlugin<EventEmitter.EventEmitter>("event-emitter").emit(
                        "top.delegates.rewarded",
                        rewardedDelegates,
                        topDelegateReward,
                    );
                }
            }
        }
    }

    public static async revertReward(block: Interfaces.IBlockData, emitEvents: boolean = true): Promise<void> {
        const roundInfo = roundCalculator.calculateRound(block.height);
        const topDelegateCountVal = Managers.configManager.getMilestone(block.height).topDelegates;
        const topDelegateCount = topDelegateCountVal || Utils.BigNumber.ZERO;

        if (topDelegateCount > 0 && block.topReward && Utils.BigNumber.make(block.topReward).isGreaterThan(0)) {
            const topDelegateRewardVal = Utils.BigNumber.make(block.topReward).dividedBy(topDelegateCount);
            const topDelegateReward = topDelegateRewardVal || Utils.BigNumber.ZERO;
            let roundDelegates;
            let delegates;
            let delegatesList = [];
            roundDelegates = await Round.findOne(roundInfo.round);

            // Check if Round exists in db, otherwise get latest active delegates
            if (roundDelegates && String(roundDelegates.topDelegates.split(",")[0]).length === 66) {
                delegatesList = roundDelegates.topDelegates.split(",");
            } else {
                delegates = databaseService.walletManager.loadActiveDelegateList(roundInfo);
                for (const delegate of delegates) {
                    delegatesList.push(delegate.publicKey);
                }
            }

            const revertedDelegates = [];
            for (let i = 0; i < topDelegateCount; i++) {
                const delegate = databaseService.walletManager.findByPublicKey(delegatesList[i]);
                const poolDelegate = poolService.walletManager.findByPublicKey(delegatesList[i]);
                this.removeRewards(delegate, topDelegateReward, databaseService);
                this.removeRewards(poolDelegate, topDelegateReward, poolService);
                revertedDelegates[i] = delegatesList[i];
            }

            if (emitEvents) {
                app.resolvePlugin<EventEmitter.EventEmitter>("event-emitter").emit(
                    "top.delegate.rewards.reverted",
                    revertedDelegates,
                    topDelegateReward,
                );
            }

            let tdGlobal = [];
            if (app.has("top.delegates")) {
                tdGlobal = app.resolve("top.delegates");
            }

            if (roundInfo.round in tdGlobal && roundInfo.roundHeight === block.height) {
                delete tdGlobal[roundInfo.round];
                app.register("top.delegates", asValue(tdGlobal));
            }
        }
    }

    private static addRewards(delegate: State.IWallet, topDelegateReward, walletManager) {
        delegate.balance = delegate.balance.plus(topDelegateReward);
        delegate.setAttribute(
            "delegate.forgedTopRewards",
            delegate.getAttribute<Utils.BigNumber>("delegate.forgedTopRewards").plus(topDelegateReward),
        );
        if (delegate.hasVoted()) {
            const votedDelegate: State.IWallet = walletManager.findByPublicKey(delegate.getAttribute("vote"));
            votedDelegate.setAttribute(
                "delegate.voteBalance",
                Utils.BigNumber.make(
                    votedDelegate.getAttribute<Utils.BigNumber>("delegate.voteBalance").plus(topDelegateReward),
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
