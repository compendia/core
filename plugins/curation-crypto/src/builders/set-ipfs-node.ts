import { Interfaces, Transactions, Utils } from "@arkecosystem/crypto";

import { CuratorTransactionGroup, CuratorTransactionType } from "../enums";
import { SetIpfsNodeTransaction } from "../transactions";

export class SetIpfsNodeBuilder extends Transactions.TransactionBuilder<SetIpfsNodeBuilder> {
    constructor() {
        super();
        this.data.type = CuratorTransactionType.SetIpfsNode;
        this.data.typeGroup = CuratorTransactionGroup;
        this.data.fee = SetIpfsNodeTransaction.staticFee();
        this.data.amount = Utils.BigNumber.ZERO;
        this.data.asset = {};
    }

    public usernameAsset(node: string): SetIpfsNodeBuilder {
        this.data.asset = { node };
        return this;
    }

    public getStruct(): Interfaces.ITransactionData {
        const struct: Interfaces.ITransactionData = super.getStruct();
        struct.amount = this.data.amount;
        struct.recipientId = this.data.recipientId;
        struct.asset = this.data.asset;
        return struct;
    }

    protected instance(): SetIpfsNodeBuilder {
        return this;
    }
}
