import { Interfaces, Managers, Utils } from "@arkecosystem/crypto";
import { Enums } from "@nosplatform/file-transactions-crypto";
import { Helpers as FileHelpers } from "@nosplatform/file-transactions-crypto";

export const isRecipientOnActiveNetwork = (transaction: Interfaces.ITransactionData): boolean => {
    return (
        Utils.Base58.decodeCheck(transaction.recipientId).readUInt8(0) ===
        Managers.configManager.get("network.pubKeyHash")
    );
};

export const isSpecialFeeTransaction = (transaction: Interfaces.ITransactionData): boolean => {
    const isFileTransaction =
        transaction.typeGroup === Enums.FileTransactionGroup && transaction.type === Enums.FileTransactionType.SetFile;
    const isSchemaTransaction =
        isFileTransaction && FileHelpers.SetFileHelper.isSchemaTransaction(transaction.asset.fileKey);
    return isFileTransaction && isSchemaTransaction;
};

export const specialFee = (transaction: Interfaces.ITransactionData): Utils.BigNumber => {
    // Return special fee for schema registration
    const isFileTransaction =
        transaction.typeGroup === Enums.FileTransactionGroup && transaction.type === Enums.FileTransactionType.SetFile;
    const isSchemaTransaction =
        isFileTransaction && FileHelpers.SetFileHelper.isSchemaTransaction(transaction.asset.fileKey);

    if (isFileTransaction && isSchemaTransaction) {
        return Utils.BigNumber.make(
            Managers.configManager.getMilestone().fees.specialFees.setFile.schemaRegistration || 0,
        );
    }

    return Utils.BigNumber.ZERO;
};
