import { app } from "@arkecosystem/core-container";
import { Logger, State } from "@arkecosystem/core-interfaces";
import { Handlers } from "@arkecosystem/core-transactions";
import { Interfaces, Managers, Utils } from "@arkecosystem/crypto";
import { Enums } from "@nosplatform/file-transactions-crypto";
import { IDynamicFeeMatch } from "./interfaces";

// @TODO: better name
export const dynamicFeeMatcher = async (transaction: Interfaces.ITransaction): Promise<IDynamicFeeMatch> => {
    const fee: Utils.BigNumber = transaction.data.fee;
    const id: string = transaction.id;

    const { dynamicFees } = app.resolveOptions("transaction-pool");
    const height: number = app
        .resolvePlugin<State.IStateService>("state")
        .getStore()
        .getLastHeight();

    let broadcast: boolean;
    let enterPool: boolean;

    if (dynamicFees.enabled) {
        const handler: Handlers.TransactionHandler = await Handlers.Registry.get(
            transaction.type,
            transaction.typeGroup,
        );
        const addonBytes: number = app.resolveOptions("transaction-pool").dynamicFees.addonBytes[transaction.key];
        const minFeeBroadcast: Utils.BigNumber = handler.dynamicFee({
            transaction,
            addonBytes,
            satoshiPerByte: dynamicFees.minFeeBroadcast,
            height,
        });

        if (fee.isGreaterThanEqual(minFeeBroadcast)) {
            broadcast = true;

            app.resolvePlugin<Logger.ILogger>("logger").debug(
                `Transaction ${id} eligible for broadcast - fee of ${Utils.formatSatoshi(fee)} is ${
                    fee.isEqualTo(minFeeBroadcast) ? "equal to" : "greater than"
                } minimum fee (${Utils.formatSatoshi(minFeeBroadcast)})`,
            );
        } else {
            broadcast = false;

            app.resolvePlugin<Logger.ILogger>("logger").debug(
                `Transaction ${id} not eligible for broadcast - fee of ${Utils.formatSatoshi(
                    fee,
                )} is smaller than minimum fee (${Utils.formatSatoshi(minFeeBroadcast)})`,
            );
        }

        const minFeePool: Utils.BigNumber = handler.dynamicFee({
            transaction,
            addonBytes,
            satoshiPerByte: dynamicFees.minFeePool,
            height,
        });

        if (fee.isGreaterThanEqual(minFeePool)) {
            enterPool = true;

            app.resolvePlugin<Logger.ILogger>("logger").debug(
                `Transaction ${id} eligible to enter pool - fee of ${Utils.formatSatoshi(fee)} is ${
                    fee.isEqualTo(minFeePool) ? "equal to" : "greater than"
                } minimum fee (${Utils.formatSatoshi(minFeePool)})`,
            );
        } else {
            enterPool = false;

            app.resolvePlugin<Logger.ILogger>("logger").debug(
                `Transaction ${id} not eligible to enter pool - fee of ${Utils.formatSatoshi(
                    fee,
                )} is smaller than minimum fee (${Utils.formatSatoshi(minFeePool)})`,
            );
        }
    } else {
        let staticFee: Utils.BigNumber = transaction.staticFee;

        // Apply special static fee logic for schema registrations.

        // First check if we have a schemaRegistration fee milestone
        if (
            Managers.configManager.getMilestone().fees.specialFees &&
            Managers.configManager.getMilestone().fees.specialFees.setFile
        ) {
            const schemaRegistrationFee =
                Managers.configManager.getMilestone().fees.specialFees.setFile.schemaRegistration || undefined;
            const isSetFileTransaction: boolean =
                transaction.typeGroup === Enums.FileTransactionGroup &&
                transaction.type === Enums.FileTransactionType.SetFile;
            if (schemaRegistrationFee && isSetFileTransaction) {
                // Check if the current transaction is a schema transaction
                const isSchemaTransaction: boolean =
                    isSetFileTransaction &&
                    transaction.data.asset.fileKey &&
                    String(transaction.data.asset.fileKey).startsWith("schema.") &&
                    schemaRegistrationFee;

                if (isSchemaTransaction && schemaRegistrationFee) {
                    // Overwrite the staticFee with the specialFee if it's a schema registration
                    staticFee = Utils.BigNumber.make(schemaRegistrationFee);
                }
            }
        }

        if (fee.isEqualTo(staticFee)) {
            broadcast = true;
            enterPool = true;

            app.resolvePlugin<Logger.ILogger>("logger").debug(
                `Transaction ${id} eligible for broadcast and to enter pool - fee of ${Utils.formatSatoshi(
                    fee,
                )} is equal to static fee (${Utils.formatSatoshi(staticFee)})`,
            );
        } else {
            broadcast = false;
            enterPool = false;

            app.resolvePlugin<Logger.ILogger>("logger").debug(
                `Transaction ${id} not eligible for broadcast and not eligible to enter pool - fee of ${Utils.formatSatoshi(
                    fee,
                )} does not match static fee (${Utils.formatSatoshi(staticFee)})`,
            );
        }
    }

    return { broadcast, enterPool };
};
