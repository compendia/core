import { Interfaces, Transactions, Utils } from "@arkecosystem/crypto";

import { SetFileTransaction } from "../transactions";

export class SetFileBuilder extends Transactions.TransactionBuilder<SetFileBuilder> {
    constructor() {
        super();
        this.data.version = 2;
        this.data.type = SetFileTransaction.type;
        this.data.typeGroup = SetFileTransaction.typeGroup;
        this.data.fee = SetFileTransaction.staticFee();
        this.data.amount = Utils.BigNumber.ZERO;
        this.data.asset = {};
    }

    public ipfsAsset(fileKey: string, ipfsHash: string): SetFileBuilder {
        this.data.asset = {
            fileKey,
            ipfsHash,
        };
        return this;
    }

    public getStruct(): Interfaces.ITransactionData {
        const struct: Interfaces.ITransactionData = super.getStruct();
        struct.amount = this.data.amount;
        struct.asset = this.data.asset;
        return struct;
    }

    protected instance(): SetFileBuilder {
        return this;
    }
}
