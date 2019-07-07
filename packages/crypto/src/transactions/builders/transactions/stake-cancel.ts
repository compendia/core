import { ITransactionData } from "../../../interfaces";
import { feeManager } from "../../../managers";
import { BigNumber } from "../../../utils";
import { TransactionBuilder } from "./transaction";

export class StakeCancelBuilder extends TransactionBuilder<StakeCancelBuilder> {
    constructor() {
        super();
        this.data.type = 101;
        this.data.fee = feeManager.get(this.data.type);
        this.data.amount = BigNumber.ZERO;
        this.data.recipientId = undefined;
        this.data.senderPublicKey = undefined;
        this.data.asset = { stakeCancel: { blockTime: 0 } };
        this.signWithSenderAsRecipient = true;
    }

    public stakeAsset(blockTime: number): StakeCancelBuilder {
        this.data.asset.stakeCancel.blockTime = blockTime;
        return this;
    }

    public getStruct(): ITransactionData {
        const struct: ITransactionData = super.getStruct();
        struct.amount = this.data.amount;
        struct.asset = this.data.asset;
        return struct;
    }

    protected instance(): StakeCancelBuilder {
        return this;
    }
}
