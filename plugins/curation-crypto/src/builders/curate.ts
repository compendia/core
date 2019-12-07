import { Interfaces, Transactions, Utils } from "@arkecosystem/crypto";

import { CurateTransaction } from "../transactions";

export class CurateBuilder extends Transactions.TransactionBuilder<CurateBuilder> {
    constructor() {
        super();

        this.data.type = CurateTransaction.type;
        this.data.typeGroup = CurateTransaction.typeGroup;
        this.data.fee = CurateTransaction.staticFee();
        this.data.amount = Utils.BigNumber.ZERO;
        this.data.asset = {};
    }

    public ipfsAsset(ipfsId: string): CurateBuilder {
        this.data.asset = {
            ipfs: ipfsId,
        };

        return this;
    }

    public getStruct(): Interfaces.ITransactionData {
        const struct: Interfaces.ITransactionData = super.getStruct();
        struct.amount = this.data.amount;
        struct.asset = this.data.asset;
        return struct;
    }

    protected instance(): CurateBuilder {
        return this;
    }
}
