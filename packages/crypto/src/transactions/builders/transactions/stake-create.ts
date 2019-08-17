import { Slots } from "../../../crypto";
import { ITransactionData } from "../../../interfaces";
import { feeManager } from "../../../managers";
import { BigNumber } from "../../../utils";
import { TransactionBuilder } from "./transaction";

export class StakeCreateBuilder extends TransactionBuilder<StakeCreateBuilder> {
    constructor() {
        super();
        this.data.type = 100;
        this.data.fee = feeManager.get(this.data.type);
        this.data.amount = BigNumber.ZERO;
        this.data.recipientId = undefined;
        this.data.senderPublicKey = undefined;
        this.data.asset = { stakeCreate: { duration: 0, amount: BigNumber.ZERO, timestamp: 0 } };
        this.signWithSenderAsRecipient = true;
    }

    public stakeAsset(duration: number, amount: BigNumber): StakeCreateBuilder {
        this.data.asset.stakeCreate.duration = duration;
        this.data.asset.stakeCreate.amount = amount;
        this.data.asset.stakeCreate.timestamp = Slots.getTime();
        return this;
    }

    public getStruct(): ITransactionData {
        const struct: ITransactionData = super.getStruct();
        struct.amount = this.data.amount;
        struct.asset = this.data.asset;
        return struct;
    }

    protected instance(): StakeCreateBuilder {
        return this;
    }
}
