import { app } from "@arkecosystem/core-container";
import { ApplicationEvents } from "@arkecosystem/core-event-emitter";
import { Container, Database, EventEmitter, Logger } from "@arkecosystem/core-interfaces";
import { roundCalculator } from "@arkecosystem/core-utils";
import { Enums, Identities, Interfaces, Managers, Utils } from "@nosplatform/crypto";
import { Constants } from "@nosplatform/crypto";
import { StakeInterfaces } from "@nosplatform/stake-interfaces";
import { StakeHelpers } from "@nosplatform/stake-transactions";
import { MoreThan } from "typeorm";
import { defaults } from "./defaults";

import { getConnection } from "typeorm";

const logger = app.resolvePlugin<Logger.ILogger>("logger");
const emitter = app.resolvePlugin<EventEmitter.EventEmitter>("event-emitter");
const databaseService: Database.IDatabaseService = app.resolvePlugin<Database.IDatabaseService>("database");

import { Round, Statistic } from "@nosplatform/storage";

export const plugin: Container.IPluginDescriptor = {
    pkg: require("../package.json"),
    defaults,
    alias: "supply-tracker",
    async register(container: Container.IContainer, options) {
        logger.info(`Registering Supply Tracker.`);

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

        /**
         * Event Listeners
         */

        // On new block
        emitter.on("block.applied", async block => {
            const blockData: Interfaces.IBlockData = block;
            // supply global state
            const lastSupply = Utils.BigNumber.make(supply.value);
            supply.value = lastSupply
                .plus(blockData.reward)
                .plus(blockData.topReward)
                .minus(blockData.removedFee)
                .toString();
            await supply.save();

            // fees.removed global state
            if (Utils.BigNumber.make(blockData.removedFee).isGreaterThan(Utils.BigNumber.ZERO)) {
                removedFees.value = Utils.BigNumber.make(removedFees.value)
                    .plus(blockData.removedFee)
                    .toString();
                await removedFees.save();
            }

            // Save round data
            const roundData = roundCalculator.calculateRound(blockData.height);

            const round = new Round();
            round.id = roundData.round;
            round.removed = 0;
            round.staked = 0;
            round.forged = 0;
            round.topDelegates = "";
            round.released = 0;

            round.forged = Utils.BigNumber.make(round.forged)
                .plus(blockData.reward)
                .plus(blockData.topReward)
                .toNumber();
            round.removed = Utils.BigNumber.make(round.removed)
                .plus(blockData.removedFee)
                .toNumber();

            // Store round top delegates if not already stored
            if (round.topDelegates === "") {
                const delegates = databaseService.walletManager.loadActiveDelegateList(roundData);
                const topDelegateCount = Managers.configManager.getMilestone(blockData.height).topDelegates;
                const topDelegates = [];
                let i = 0;
                for (const delegate of delegates) {
                    if (i < topDelegateCount) {
                        topDelegates.push(delegate.address);
                    } else {
                        break;
                    }
                    i++;
                }
                round.topDelegates = topDelegates.toString();
            }

            await getConnection()
                .createQueryBuilder()
                .insert()
                .into(Round)
                .values(round)
                .onConflict(
                    `(id) DO UPDATE SET removed=(round.removed + ${round.removed}), staked=(round.staked + ${round.staked}), released=(round.released + ${round.released}), forged=(round.forged + ${round.forged})`,
                )
                .execute();

            logger.info(
                `Supply updated. Previous: ${lastSupply.dividedBy(Constants.ARKTOSHI)} - New: ${Utils.BigNumber.make(
                    supply.value,
                ).dividedBy(Constants.ARKTOSHI)}`,
            );
        });

        emitter.on("block.reverted", async block => {
            const blockData: Interfaces.IBlockData = block;
            const lastSupply = Utils.BigNumber.make(supply.value);
            supply.value = lastSupply
                .minus(blockData.reward)
                .minus(blockData.topReward)
                .plus(blockData.removedFee)
                .toString();
            await supply.save();

            // Save round data
            const lastBlock = await databaseService.getLastBlock();
            const roundData = roundCalculator.calculateRound(lastBlock.data.height);
            let round = await Round.findOne({ id: roundData.round });

            if (!round) {
                round = new Round();
                round.id = roundData.round;
                round.removed = "0";
                round.staked = "0";
                round.forged = "0";
                round.topDelegates = "";
                round.released = "0";
            }

            round.forged = Utils.BigNumber.make(round.forged)
                .minus(blockData.reward)
                .minus(blockData.topReward)
                .toString();

            if (blockData.removedFee.isGreaterThan(Utils.BigNumber.ZERO)) {
                removedFees.value = Utils.BigNumber.make(removedFees.value)
                    .minus(blockData.removedFee)
                    .toString();
                removedFees.save();

                // Save round data
                const lastBlock = await databaseService.getLastBlock();
                const roundData = roundCalculator.calculateRound(lastBlock.data.height);
                let round = await Round.findOne({ id: roundData.round });

                if (!round) {
                    round = new Round();
                    round.id = roundData.round;
                    round.removed = "0";
                    round.staked = "0";
                    round.forged = "0";
                    round.topDelegates = "";
                    round.released = "0";
                }
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

        // All transfers from the mint wallet are added to supply
        emitter.on(ApplicationEvents.TransactionApplied, async txData => {
            const genesisBlock: Interfaces.IBlockData = app.getConfig().all().genesisBlock;
            const tx: Interfaces.ITransactionData = txData;
            const senderAddress = Identities.Address.fromPublicKey(tx.senderPublicKey);

            const lastBlock = await databaseService.getLastBlock();
            const roundData = roundCalculator.calculateRound(lastBlock.data.height);
            let round = await Round.findOne({ id: roundData.round });

            if (!round) {
                round = new Round();
                round.id = roundData.round;
                round.removed = "0";
                round.staked = "0";
                round.forged = "0";
                round.topDelegates = "";
                round.released = "0";
            }
            if (tx.type === Enums.TransactionTypes.Transfer && tx.blockId !== genesisBlock.id) {
                if (senderAddress === genesisBlock.transactions[0].recipientId) {
                    // Add coins to supply when sent from mint address
                    supply.value = Utils.BigNumber.make(supply.value)
                        .plus(tx.amount)
                        .toString();
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
                    await supply.save();
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

        // On stake create
        emitter.on("stake.created", async txData => {
            const tx: Interfaces.ITransactionData = txData;

            const o: StakeInterfaces.IStakeObject = StakeHelpers.VoteWeight.stakeObject(tx);
            const lastSupply = Utils.BigNumber.make(supply.value);

            supply.value = lastSupply.minus(o.amount).toString();
            staked.value = Utils.BigNumber.make(staked.value)
                .plus(o.amount)
                .toString();

            await supply.save();
            await staked.save();

            // Save round data
            const lastBlock = await databaseService.getLastBlock();
            const roundData = roundCalculator.calculateRound(lastBlock.data.height);
            let round = await Round.findOne({ id: roundData.round });

            if (!round) {
                round = new Round();
                round.id = roundData.round;
                round.removed = "0";
                round.staked = "0";
                round.forged = "0";
                round.topDelegates = "";
                round.released = "0";
            }
            if (!round) {
                round = new Round();
                round.id = roundData.round;
                round.removed = "0";
                round.staked = "0";
                round.forged = "0";
                round.topDelegates = "";
                round.released = "0";
            }

            round.staked = Utils.BigNumber.make(round.staked)
                .plus(o.amount)
                .toString();
            await round.save();

            logger.info(
                `Supply updated. Previous: ${lastSupply.dividedBy(Constants.ARKTOSHI)} - New: ${Utils.BigNumber.make(
                    supply.value,
                ).dividedBy(Constants.ARKTOSHI)}`,
            );
        });

        // On stake create
        emitter.on("stake.released", async stakeObj => {
            const walletManager = app.resolvePlugin("database").walletManager;
            const sender = walletManager.findByPublicKey(stakeObj.publicKey);
            const txId = stakeObj.stakeKey;
            const stake: StakeInterfaces.IStakeObject = sender.stake[txId];
            const lastSupply: Utils.BigNumber = Utils.BigNumber.make(supply.value);

            supply.value = lastSupply.plus(stake.amount).toString();
            staked.value = Utils.BigNumber.make(staked.value)
                .minus(stake.amount)
                .toString();

            await supply.save();
            await staked.save();

            // Save round data
            const lastBlock = await databaseService.getLastBlock();
            const roundData = roundCalculator.calculateRound(lastBlock.data.height);
            let round = await Round.findOne({ id: roundData.round });

            if (!round) {
                round = new Round();
                round.id = roundData.round;
                round.removed = "0";
                round.staked = "0";
                round.forged = "0";
                round.topDelegates = "";
                round.released = "0";
            }
            round.released = Utils.BigNumber.make(round.released)
                .plus(stake.amount)
                .toString();
            await round.save();

            logger.info(
                `Supply updated. Previous: ${lastSupply.dividedBy(Constants.ARKTOSHI)} - New: ${Utils.BigNumber.make(
                    supply.value,
                ).dividedBy(Constants.ARKTOSHI)}`,
            );
        });

        emitter.on(ApplicationEvents.TransactionReverted, async txObj => {
            const tx: Interfaces.ITransactionData = txObj;
            // On stake revert
            if (tx.type === 100) {
                const lastSupply: Utils.BigNumber = Utils.BigNumber.make(supply.value);

                supply.value = lastSupply.plus(tx.asset.stakeCreate.amount).toString();
                staked.value = Utils.BigNumber.make(staked.value)
                    .minus(tx.asset.stakeCreate.amount)
                    .toString();

                await supply.save();
                await staked.save();

                // Save round data
                const lastBlock = await databaseService.getLastBlock();
                const roundData = roundCalculator.calculateRound(lastBlock.data.height);
                let round = await Round.findOne({ id: roundData.round });

                if (!round) {
                    round = new Round();
                    round.id = roundData.round;
                    round.removed = "0";
                    round.staked = "0";
                    round.forged = "0";
                    round.topDelegates = "";
                    round.released = "0";
                }
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
            }
        });
    },
    async deregister(container: Container.IContainer, options) {
        logger.info(`Deregistering Supply Tracker.`);
    },
};
