import { app } from "@arkecosystem/core-container";
import { ApplicationEvents } from "@arkecosystem/core-event-emitter";
import { Container, Database, EventEmitter, Logger, Shared, State } from "@arkecosystem/core-interfaces";
import { roundCalculator } from "@arkecosystem/core-utils";
import { Constants, Enums, Identities, Interfaces, Managers, Utils } from "@arkecosystem/crypto";
import { StakeHelpers } from "@nosplatform/stake-transactions";
import { Interfaces as StakeInterfaces } from "@nosplatform/stake-transactions-crypto";
import { q, Round, Statistic } from "@nosplatform/storage";
import { TopRewards } from "@nosplatform/top-rewards";
import { asValue } from "awilix";
import { createHandyClient } from "handy-redis";
import { MoreThan } from "typeorm";

const redis = createHandyClient();
const defaults = {};
const logger = app.resolvePlugin<Logger.ILogger>("logger");
const emitter = app.resolvePlugin<EventEmitter.EventEmitter>("event-emitter");
const databaseService: Database.IDatabaseService = app.resolvePlugin<Database.IDatabaseService>("database");
const blocksRepository: Database.IBlocksBusinessRepository = databaseService.blocksBusinessRepository;

export const plugin: Container.IPluginDescriptor = {
    pkg: require("../package.json"),
    defaults,
    alias: "supply-tracker",
    async register(container: Container.IContainer, options) {
        logger.info(`Registering Supply Tracker.`);
        let roundsCleaned;

        /**
         * Bootstrap Database
         */

        let supply = await Statistic.findOne({ name: "supply" });
        if (!supply) {
            logger.info("Initialize supply.");
            supply = new Statistic();
            supply.name = "supply";
            supply.value = "0";
            await supply.save();
        }

        let removedFees = await Statistic.findOne({ name: "removed" });
        if (!removedFees) {
            logger.info("Initialize removed.");
            removedFees = new Statistic();
            removedFees.name = "removed";
            removedFees.value = "0";
            await removedFees.save();
        }

        let staked = await Statistic.findOne({ name: "staked" });
        if (!staked) {
            logger.info("Initialize staked.");
            staked = new Statistic();
            staked.name = "staked";
            staked.value = "0";
            await staked.save();
        }

        let totalStakePower = await Statistic.findOne({ name: `stakePower` });
        if (!totalStakePower) {
            totalStakePower = new Statistic();
            totalStakePower.name = `stakePower`;
            totalStakePower.value = "0";
            await totalStakePower.save();
        }

        const findOrCreate = async (model, id) => {
            let res;
            if (model === "Round") {
                let round = await Round.findOne(id);
                if (!round) {
                    round = new Round();
                    round.id = id;
                    round.removed = "0";
                    round.staked = "0";
                    round.forged = "0";
                    round.topDelegates = "";
                    round.released = "0";
                }
                res = round;
            }
            return res;
        };

        /**
         * Event Listeners
         */

        const getTopDelegates = (roundData: Shared.IRoundInfo) => {
            const topDelegateCount = Managers.configManager.getMilestone(roundData.round).topDelegates;
            const topDelegates = [];
            let i = 0;
            let delegates = [];
            const getDelegates = () => {
                let delegates = [];
                try {
                    delegates = databaseService.walletManager.loadActiveDelegateList(roundData);
                } catch (e) {
                    throw new Error(e);
                }
                return delegates;
            };

            delegates = getDelegates();

            for (const delegate of delegates) {
                if (i < topDelegateCount) {
                    topDelegates.push(delegate.publicKey);
                } else {
                    break;
                }
                i++;
            }

            return topDelegates;
        };

        // On new block
        emitter.on("block.applied", async (blockData: Interfaces.IBlockData) => {
            // Save round data
            // NOTE: Putting this block outside of q() didn't work (kept syncing for round 34)
            // q(async () => {
            const roundData = roundCalculator.calculateRound(blockData.height);
            const hasTopReward = blockData.topReward;
            if (hasTopReward && (roundData.roundHeight === blockData.height || blockData.height === 2)) {
                const topDelegates = getTopDelegates(roundData);
                await redis.set(`topDelegates:${Number(roundData.round)}`, topDelegates.join(","));
                const lastTop = await redis.get(`topDelegates:${Number(roundData.round) - 1}`);
                console.log("lastTop:");
                console.log(lastTop);
                if (Number(roundData.round) > 1 && lastTop) {
                    const reward = await TopRewards.applyTopRewardsForRound(Number(roundData.round) - 1, lastTop);
                    console.log("Rewards:");
                    console.log(reward);
                    if (reward) {
                        await redis.hmset(
                            `rewards:${Number(reward.roundInfo.round)}`,
                            ["rewardedDelegates", reward.rewardedDelegates.join(",")],
                            ["totalReward", reward.totalReward.toString()],
                            ["round", reward.roundInfo.round],
                        );
                    }
                }
            }
            // });

            q(async () => {
                // supply global state
                const lastSupply = Utils.BigNumber.make(supply.value);
                const roundData = roundCalculator.calculateRound(blockData.height);
                supply.value = lastSupply
                    .plus(blockData.reward)
                    .minus(blockData.removedFee)
                    .toString();

                // fees.removed global state
                if (Utils.BigNumber.make(blockData.removedFee).isGreaterThan(Utils.BigNumber.ZERO)) {
                    removedFees.value = Utils.BigNumber.make(removedFees.value)
                        .plus(blockData.removedFee)
                        .toString();
                    await removedFees.save();
                }

                const round = await findOrCreate("Round", roundData.round);
                round.forged = Utils.BigNumber.make(round.forged)
                    .plus(blockData.reward)
                    .toString();
                round.removed = Utils.BigNumber.make(round.removed)
                    .plus(blockData.removedFee)
                    .toString();

                // Store previous round's rewards
                const topDelegates = await redis.get(`topDelegates:${Number(roundData.round) - 1}`);
                if (roundData.roundHeight === blockData.height && topDelegates && blockData.height > 1) {
                    const reward = await redis.hmget(`rewards:${Number(roundData.round) - 1}`, "totalReward");
                    if (reward && !Utils.BigNumber.make(reward[0] || 0).isZero()) {
                        const lastSupply = Utils.BigNumber.make(supply.value);
                        supply.value = lastSupply.plus(reward[0]).toString();
                        round.forged = Utils.BigNumber.make(round.forged)
                            .plus(reward[0])
                            .toString();

                        round.topDelegates = topDelegates;
                    }

                    await redis.del(`rewards:${Number(roundData.round) - 2}`);
                    await redis.del(`topDelegates:${Number(roundData.round) - 2}`);
                }

                await round.save();
                await supply.save();

                // After the first block, remove any rounds stored later than latest round on the node
                if (!roundsCleaned) {
                    const laterRounds = await Round.find({ where: { id: MoreThan(roundData.round) } });
                    for (const laterRound of laterRounds) {
                        logger.info(`Round ${laterRound.id} doesn't exist yet. Deleting round info. `);
                        await laterRound.remove();
                    }
                    roundsCleaned = true;
                }

                logger.info(
                    `Block ${blockData.height} applied. Supply updated. Previous: ${lastSupply.dividedBy(
                        Constants.ARKTOSHI,
                    )} - New: ${Utils.BigNumber.make(supply.value).dividedBy(Constants.ARKTOSHI)}`,
                );
                app.register("supply.lastblock", asValue(blockData.height));
            });
        });

        emitter.on("block.reverted", async block => {
            const blockData: Interfaces.IBlockData = block;
            const lastSupply = Utils.BigNumber.make(supply.value);
            supply.value = lastSupply
                .minus(blockData.reward)
                .plus(blockData.removedFee)
                .toString();
            await supply.save();

            // Save round data
            const roundData = roundCalculator.calculateRound(blockData.height);
            const round = await findOrCreate("Round", roundData.round);

            round.forged = Utils.BigNumber.make(round.forged)
                .minus(blockData.reward)
                .toString();

            if (blockData.removedFee.isGreaterThan(Utils.BigNumber.ZERO)) {
                removedFees.value = Utils.BigNumber.make(removedFees.value)
                    .minus(blockData.removedFee)
                    .toString();
                removedFees.save();

                round.removed = Utils.BigNumber.make(round.removed)
                    .minus(blockData.removedFee)
                    .toString();
            }

            await round.save();

            // Remove any rounds stored later than latest round the node reverted to
            const laterRounds = await Round.find({ where: { id: MoreThan(roundData.round) } });
            for (const laterRound of laterRounds) {
                logger.info(`Round ${laterRound.id} reverted. Deleting round info. `);
                await laterRound.remove();
            }

            logger.info(
                `Supply updated. Previous: ${lastSupply.dividedBy(Constants.ARKTOSHI)} - New: ${Utils.BigNumber.make(
                    supply.value,
                ).dividedBy(Constants.ARKTOSHI)}`,
            );
        });

        // emitter.on("top.delegates.rewarded", async ({ rewardedDelegates, totalReward, roundInfo }: { rewardedDelegates: Array<string>, totalReward: Utils.BigNumber, roundInfo: Shared.IRoundInfo }) => {
        //     q(async () => {
        //         if (rewardedDelegates.length && !totalReward.isZero()) {
        //             const lastSupply = Utils.BigNumber.make(supply.value);
        //             supply.value = lastSupply
        //                 .plus(totalReward)
        //                 .toString();
        //             await supply.save();
        //             const round = await findOrCreate("Round", roundInfo.round);
        //             round.forged = Utils.BigNumber.make(round.forged)
        //                 .plus(totalReward)
        //                 .toString();
        //             if (round.topDelegates === "") round.topDelegates = rewardedDelegates.toString();
        //             await round.save();
        //         }
        //     });
        // });

        // All transfers from the mint wallet are added to supply
        emitter.on(ApplicationEvents.TransactionApplied, async txData => {
            q(async () => {
                const genesisBlock: Interfaces.IBlockData = app.getConfig().all().genesisBlock;
                const tx: Interfaces.ITransactionData = txData;
                const senderAddress = Identities.Address.fromPublicKey(tx.senderPublicKey);
                let lastBlock: Interfaces.IBlockData = await blocksRepository.findById(tx.blockId);
                if (!lastBlock) {
                    lastBlock = app
                        .resolvePlugin<State.IStateService>("state")
                        .getStore()
                        .getLastBlock().data;
                }
                const roundData = roundCalculator.calculateRound(lastBlock.height);
                const round = await findOrCreate("Round", roundData.round);
                if (
                    tx.typeGroup === Enums.TransactionTypeGroup.Core &&
                    tx.type === Enums.TransactionType.Transfer &&
                    tx.blockId !== genesisBlock.id
                ) {
                    if (senderAddress === genesisBlock.transactions[0].recipientId) {
                        // Add coins to supply when sent from mint address
                        supply.value = Utils.BigNumber.make(supply.value)
                            .plus(tx.amount)
                            .toString();
                        await supply.save();

                        // Save round data
                        round.forged = Utils.BigNumber.make(round.forged)
                            .plus(tx.amount)
                            .toString();

                        await round.save();
                        logger.info(
                            `Transaction from mint wallet: ${tx.amount.toString()} added to supply. New supply: ${
                                supply.value
                            }`,
                        );
                    } else if (tx.recipientId === genesisBlock.transactions[0].recipientId) {
                        // Remove coins from supply when sent to mint address
                        supply.value = Utils.BigNumber.make(supply.value)
                            .minus(tx.amount)
                            .toString();
                        await supply.save();
                        // Save round data
                        round.forged = Utils.BigNumber.make(round.forged)
                            .minus(tx.amount)
                            .toString();

                        await round.save();
                    }
                }
            });
        });

        // On stake create
        emitter.on("stake.created", async txData => {
            q(async () => {
                const tx: Interfaces.ITransactionData = txData;
                const o: StakeInterfaces.IStakeObject = StakeHelpers.VotePower.stakeObject(tx.asset.stakeCreate, tx.id);
                const lastSupply = Utils.BigNumber.make(supply.value);

                supply.value = lastSupply.minus(o.amount).toString();
                staked.value = Utils.BigNumber.make(staked.value)
                    .plus(o.amount)
                    .toString();

                await supply.save();
                await staked.save();
                // Save round data
                let lastBlock: Interfaces.IBlockData = await blocksRepository.findById(tx.blockId);
                if (!lastBlock) {
                    lastBlock = app
                        .resolvePlugin<State.IStateService>("state")
                        .getStore()
                        .getLastBlock().data;
                }
                const roundData = roundCalculator.calculateRound(lastBlock.height);

                const round = await findOrCreate("Round", roundData.round);
                round.staked = Utils.BigNumber.make(round.staked)
                    .plus(o.amount)
                    .toString();
                await round.save();

                // Save duration-specific stake stat
                let stat = await Statistic.findOne({ name: `stakes.${o.duration}` });
                if (!stat) {
                    stat = new Statistic();
                    stat.name = `stakes.${o.duration}`;
                    stat.value = "0";
                }
                stat.value = Utils.BigNumber.make(stat.value)
                    .plus(o.amount)
                    .toFixed();
                await stat.save();

                totalStakePower.value = Utils.BigNumber.make(totalStakePower.value)
                    .plus(o.power)
                    .toString();
                await totalStakePower.save();

                logger.info(
                    `Stake created at block ${lastBlock.height}. Supply updated. Previous: ${lastSupply.dividedBy(
                        Constants.ARKTOSHI,
                    )} - New: ${Utils.BigNumber.make(supply.value).dividedBy(Constants.ARKTOSHI)}`,
                );
            });
        });

        // On stake release
        emitter.on("stake.released", async stakeObj => {
            q(async () => {
                const walletManager = app.resolvePlugin("database").walletManager;
                const sender = walletManager.findByPublicKey(stakeObj.publicKey);
                const txId = stakeObj.stakeKey;
                const block: Interfaces.IBlockData = stakeObj.block;
                const stake: StakeInterfaces.IStakeObject = sender.getAttribute("stakes")[txId];
                const lastSupply: Utils.BigNumber = Utils.BigNumber.make(supply.value);

                supply.value = lastSupply.plus(stake.amount).toString();
                staked.value = Utils.BigNumber.make(staked.value)
                    .minus(stake.amount)
                    .toString();

                await supply.save();
                await staked.save();

                // Save round data
                const roundData = roundCalculator.calculateRound(block.height);
                const round = await findOrCreate("Round", roundData.round);
                round.released = Utils.BigNumber.make(round.released)
                    .plus(stake.amount)
                    .toString();
                await round.save();

                // Save duration-specific stake stat
                let stat = await Statistic.findOne({ name: `stakes.${stake.duration}` });
                if (!stat) {
                    stat = new Statistic();
                    stat.name = `stakes.${stake.duration}`;
                    stat.value = stake.amount.toString();
                }
                stat.value = Utils.BigNumber.make(stat.value)
                    .minus(stake.amount)
                    .toFixed();
                await stat.save();

                totalStakePower.value = Utils.BigNumber.make(totalStakePower.value)
                    .minus(stakeObj.prevStakePower)
                    .plus(stake.power)
                    .toString();
                await totalStakePower.save();

                logger.info(
                    `Supply updated. Previous: ${lastSupply.dividedBy(
                        Constants.ARKTOSHI,
                    )} - New: ${Utils.BigNumber.make(supply.value).dividedBy(Constants.ARKTOSHI)}`,
                );
            });
        });

        emitter.on(ApplicationEvents.TransactionReverted, async txObj => {
            const tx: Interfaces.ITransactionData = txObj;
            // On stake revert
            if (tx.typeGroup === 100 && tx.type === 0) {
                const lastSupply: Utils.BigNumber = Utils.BigNumber.make(supply.value);
                const o: StakeInterfaces.IStakeObject = StakeHelpers.VotePower.stakeObject(tx.asset.stakeCreate, tx.id);

                supply.value = lastSupply.plus(tx.asset.stakeCreate.amount).toString();
                staked.value = Utils.BigNumber.make(staked.value)
                    .minus(tx.asset.stakeCreate.amount)
                    .toString();

                totalStakePower.value = Utils.BigNumber.make(totalStakePower.value)
                    .minus(o.power)
                    .toString();

                await supply.save();
                await staked.save();
                await totalStakePower.save();

                // Save round data
                const lastBlock: Interfaces.IBlockData = await blocksRepository.findById(tx.blockId);

                const roundData = roundCalculator.calculateRound(lastBlock.height);
                const round = await findOrCreate("Round", roundData.round);

                if (round) {
                    round.staked = Utils.BigNumber.make(round.staked)
                        .minus(tx.asset.stakeCreate.amount)
                        .toString();
                    await round.save();
                }

                logger.info(
                    `Supply updated. Previous: ${lastSupply.dividedBy(
                        Constants.ARKTOSHI,
                    )} - New: ${Utils.BigNumber.make(supply.value).dividedBy(Constants.ARKTOSHI)}`,
                );
            } else if (tx.typeGroup === 100 && tx.type === 1) {
                // If stake redeem is reverted, update global stats
                const walletManager = app.resolvePlugin("database").walletManager;
                const sender = walletManager.findByPublicKey(tx.senderPublicKey);
                const txId = tx.asset.stakeRedeem.id;
                const stakes = sender.getAttribute("stakes", {});
                const stake = stakes[txId];
                if (Object.keys(stake).length) {
                    const lastSupply: Utils.BigNumber = Utils.BigNumber.make(supply.value);
                    supply.value = lastSupply.minus(tx.asset.stakeCreate.amount).toString();
                    staked.value = Utils.BigNumber.make(staked.value)
                        .plus(tx.asset.stakeCreate.amount)
                        .toString();
                    totalStakePower.value = Utils.BigNumber.make(totalStakePower.value)
                        .plus(stake.power)
                        .toString();
                    await supply.save();
                    await staked.save();
                    await totalStakePower.save();
                    logger.info(
                        `Supply updated. Previous: ${lastSupply.dividedBy(
                            Constants.ARKTOSHI,
                        )} - New: ${Utils.BigNumber.make(supply.value).dividedBy(Constants.ARKTOSHI)}`,
                    );
                }
            }
        });
    },
    async deregister(container: Container.IContainer, options) {
        logger.info(`Deregistering Supply Tracker.`);
    },
};
