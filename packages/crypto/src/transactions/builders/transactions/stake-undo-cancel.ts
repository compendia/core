import { ITransactionData } from "../../../interfaces";
import { feeManager } from "../../../managers";
import { BigNumber } from "../../../utils";
import { TransactionBuilder } from "./transaction";

export class StakeUndoCancelBuilder extends TransactionBuilder<StakeUndoCancelBuilder> {
    constructor() {
        super();
        this.data.type = 103;
        this.data.fee = feeManager.get(this.data.type);
        this.data.amount = BigNumber.ZERO;
        this.data.recipientId = undefined;
        this.data.senderPublicKey = undefined;
        this.data.asset = { stakeUndoCancel: { blockTime: 0 } };
        this.signWithSenderAsRecipient = true;
    }

    public stakeAsset(blockTime: number): StakeUndoCancelBuilder {
        this.data.asset.stakeUndoCancel.blockTime = blockTime;
        return this;
    }

    public getStruct(): ITransactionData {
        const struct: ITransactionData = super.getStruct();
        struct.amount = this.data.amount;
        struct.asset = this.data.asset;
        return struct;
    }

    protected instance(): StakeUndoCancelBuilder {
        return this;
    }
}
