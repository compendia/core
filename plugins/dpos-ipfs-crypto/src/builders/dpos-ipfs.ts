import { Interfaces, Transactions, Utils } from "@arkecosystem/crypto";

import { DposIpfsTransaction } from "../transactions";

export class DposIpfsBuilder extends Transactions.TransactionBuilder<DposIpfsBuilder> {
    constructor() {
        super();
        this.data.version = 2;
        this.data.type = DposIpfsTransaction.type;
        this.data.typeGroup = DposIpfsTransaction.typeGroup;
        this.data.fee = DposIpfsTransaction.staticFee();
        this.data.amount = Utils.BigNumber.ZERO;
        this.data.asset = {};
    }

    public ipfsAsset(ipfsKey: string, ipfsHash: string): DposIpfsBuilder {
        this.data.asset = {
            ipfsKey,
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

    protected instance(): DposIpfsBuilder {
        return this;
    }
}
