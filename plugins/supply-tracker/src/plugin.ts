import { app } from "@arkecosystem/core-container";
import { ApplicationEvents } from "@arkecosystem/core-event-emitter";
import { Container, EventEmitter, Logger } from "@arkecosystem/core-interfaces";
import { Enums, Identities, Interfaces, Utils } from "@arkecosystem/crypto";
import { Constants } from "@arkecosystem/crypto";
import { StakeInterfaces } from "@nosplatform/stake-interfaces";
import { StakeHelpers } from "@nosplatform/stake-transactions";
import { asValue } from "awilix";
import { defaults } from "./defaults";

const logger = app.resolvePlugin<Logger.ILogger>("logger");
const emitter = app.resolvePlugin<EventEmitter.EventEmitter>("event-emitter");

export const plugin: Container.IPluginDescriptor = {
    pkg: require("../package.json"),
    defaults,
    alias: "supply-tracker",
    async register(container: Container.IContainer, options) {
        logger.info(`Registering Supply Tracker.`);
        // On new block
        emitter.on("block.forged", block => {
            const blockData: Interfaces.IBlockData = block;
            // supply global state
            if (app.has("supply")) {
                const lastSupply: Utils.BigNumber = app.resolve("supply");
                let supply = lastSupply;
                supply = supply
                    .plus(blockData.reward)
                    .plus(blockData.topReward)
                    .minus(blockData.removedFee);
                app.register("supply", asValue(supply));
                logger.info(
                    `Supply updated. Previous: ${lastSupply.dividedBy(Constants.ARKTOSHI)} - New: ${supply.dividedBy(
                        Constants.ARKTOSHI,
                    )}`,
                );
            } else {
                app.register("supply", asValue(Utils.BigNumber.ZERO));
            }
            // fees.removed global state
            if (Utils.BigNumber.make(blockData.removedFee).isGreaterThan(Utils.BigNumber.ZERO)) {
                let removedFees = Utils.BigNumber.ZERO;
                if (app.has("fees.removed")) {
                    removedFees = app.resolve("fees.removed");
                }
                removedFees = removedFees.plus(blockData.removedFee);
                app.register("fees.removed", asValue(Utils.BigNumber.make(removedFees)));
            }
        });

        // All transfers from the mint wallet are added to supply
        emitter.on(ApplicationEvents.TransactionForged, txData => {
            const genesisBlock: Interfaces.IBlockData = app.getConfig().all().genesisBlock;
            const tx: Interfaces.ITransactionData = txData;
            const senderAddress = Identities.Address.fromPublicKey(tx.senderPublicKey);
            let supply: Utils.BigNumber = app.resolve("supply");
            if (
                tx.type === Enums.TransactionTypes.Transfer &&
                senderAddress === genesisBlock.transactions[0].recipientId
            ) {
                // Add coins to supply when sent from mint address
                supply = supply.plus(tx.amount);
            } else if (
                tx.type === Enums.TransactionTypes.Transfer &&
                tx.recipientId === genesisBlock.transactions[0].recipientId &&
                tx.blockId !== genesisBlock.id
            ) {
                // Remove coins from supply when sent from mint address
                supply = supply.minus(tx.amount);
            }
            app.register("supply", asValue(supply));
        });

        emitter.on("block.reverted", block => {
            const blockData: Interfaces.IBlockData = block;
            if (app.has("supply")) {
                const lastSupply: Utils.BigNumber = app.resolve("supply");
                let supply = lastSupply;
                supply = supply
                    .minus(blockData.reward)
                    .minus(blockData.topReward)
                    .plus(blockData.removedFee);
                app.register("supply", asValue(supply));
                logger.info(
                    `Supply updated. Previous: ${lastSupply.dividedBy(Constants.ARKTOSHI)} - New: ${supply.dividedBy(
                        Constants.ARKTOSHI,
                    )}`,
                );
            }
            if (blockData.removedFee.isGreaterThan(Utils.BigNumber.ZERO)) {
                let removedFees = Utils.BigNumber.ZERO;
                if (app.has("fees.removed")) {
                    removedFees = app.resolve("fees.removed");
                }
                removedFees = removedFees.minus(blockData.removedFee);
                app.register("fees.removed", asValue(Utils.BigNumber.make(removedFees)));
            }
        });

        // On stake create
        emitter.on("stake.created", tx => {
            const o: StakeInterfaces.IStakeObject = StakeHelpers.VoteWeight.stakeObject(tx);
            const lastSupply: Utils.BigNumber = app.resolve("supply");

            const supply = lastSupply.minus(o.amount);

            let stakeTotal: Utils.BigNumber;

            if (!app.has("stake.total")) {
                stakeTotal = o.amount;
            } else {
                stakeTotal = app.resolve("stake.total");
                stakeTotal = stakeTotal.plus(o.amount);
            }

            app.register("supply", asValue(supply));
            app.register("stake.total", asValue(stakeTotal));
            logger.info(
                `Supply updated. Previous: ${lastSupply.dividedBy(Constants.ARKTOSHI)} - New: ${supply.dividedBy(
                    Constants.ARKTOSHI,
                )}`,
            );
        });

        // On stake create
        emitter.on("stake.expired", stakeObj => {
            const walletManager = app.resolvePlugin("database").walletManager;
            const sender = walletManager.findByPublicKey(stakeObj.publicKey);
            const blockTime = stakeObj.stakeKey;
            const stake: StakeInterfaces.IStakeObject = sender.stake[blockTime];

            const lastSupply: Utils.BigNumber = app.resolve("supply");
            const supply = lastSupply.plus(stake.amount);

            let totalStake: Utils.BigNumber = app.resolve("stake.total");
            totalStake = totalStake.minus(stake.amount);

            app.register("supply", asValue(supply));
            app.register("stake.total", asValue(totalStake));

            logger.info(
                `Supply updated. Previous: ${lastSupply.dividedBy(Constants.ARKTOSHI)} - New: ${supply.dividedBy(
                    Constants.ARKTOSHI,
                )}`,
            );
        });

        emitter.on("transaction.reverted", txObj => {
            const tx: Interfaces.ITransactionData = txObj;
            // On stake revert
            if (tx.type === 100) {
                const lastSupply: Utils.BigNumber = app.resolve("supply");

                let supply = lastSupply;
                supply = supply.plus(tx.asset.stakeCreate.amount);

                let totalStake: Utils.BigNumber = app.resolve("stake.total");
                totalStake = totalStake.minus(tx.asset.stakeCreate.amount);

                app.register("supply", asValue(supply));
                app.register("stake.total", asValue(totalStake));

                logger.info(
                    `Supply updated. Previous: ${lastSupply.dividedBy(Constants.ARKTOSHI)} - New: ${supply.dividedBy(
                        Constants.ARKTOSHI,
                    )}`,
                );
            }
        });
    },
    async deregister(container: Container.IContainer, options) {
        logger.info(`Deregistering Supply Tracker.`);
    },
};
